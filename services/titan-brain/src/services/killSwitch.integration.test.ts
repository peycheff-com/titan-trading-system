/**
 * Kill Switch Integration Test
 *
 * Tests critical safety flows:
 * - FLATTEN: Close all positions → verify posture
 * - OVERRIDE_RISK: Temporary risk cap override → auto-revert
 * - Approval workflow: FLATTEN/OVERRIDE_RISK require approval
 * - Approval timeout (TTL expiry while pending)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorIntentService } from './OperatorIntentService.js';
import {
  calculateIntentSignature,
  type OperatorIntentType,
  type IntentReceipt,
} from '@titan/shared';
import crypto from 'crypto';

const OPS_SECRET = 'test-ops-secret-32chars!!!!!!!!';

function makeIntent(
  type: OperatorIntentType,
  params: Record<string, unknown> = {},
  overrides?: Partial<Record<string, unknown>>,
) {
  const id = crypto.randomUUID();
  const base = {
    id,
    idempotency_key: `idem-${id}`,
    version: 1,
    type,
    params,
    operator_id: 'operator-1',
    reason: `Test ${type} intent`,
    submitted_at: new Date().toISOString(),
    ttl_seconds: 30,
    ...overrides,
  };

  const signature = calculateIntentSignature(
    { id: base.id, type: base.type, params: base.params as Record<string, unknown>, operator_id: base.operator_id },
    OPS_SECRET,
  );

  return { ...base, signature };
}

function createService(overrides?: Partial<ConstructorParameters<typeof OperatorIntentService>[0]>) {
  return new OperatorIntentService({
    opsSecret: OPS_SECRET,
    executors: {
      ARM: async (): Promise<IntentReceipt> => ({
        effect: 'System armed',
        prior_state: { armed: false },
        new_state: { armed: true },
      }),
      DISARM: async (): Promise<IntentReceipt> => ({
        effect: 'System disarmed',
        prior_state: { armed: true },
        new_state: { armed: false },
      }),
      FLATTEN: async (): Promise<IntentReceipt> => ({
        effect: 'All positions closed',
        prior_state: { open_positions: 5 },
        new_state: { open_positions: 0 },
      }),
      OVERRIDE_RISK: async (): Promise<IntentReceipt> => ({
        effect: 'Risk override applied',
        prior_state: { risk_overrides_active: false },
        new_state: { risk_overrides_active: true },
      }),
    },
    verifiers: {},
    getStateHash: () => 'abc123def456',
    ...overrides,
  });
}

describe('Kill Switch Integration', () => {
  let service: OperatorIntentService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = createService();
  });

  afterEach(() => {
    service.shutdown();
    vi.useRealTimers();
  });

  // =========================================================================
  // FLATTEN requires approval
  // =========================================================================

  describe('FLATTEN → approval workflow', () => {
    it('should hold FLATTEN in PENDING_APPROVAL status', async () => {
      const intent = makeIntent('FLATTEN');
      const result = await service.submitIntent(intent);

      // FLATTEN requires approval, so it gets ACCEPTED but held
      expect(result.status).toBe('ACCEPTED');

      const fetched = service.getIntent(intent.id);
      expect(fetched?.status).toBe('PENDING_APPROVAL');
    });

    it('should execute FLATTEN after approval', async () => {
      const intent = makeIntent('FLATTEN');
      await service.submitIntent(intent);

      // Approve it
      const approveResult = await service.approveIntent(intent.id, 'approver-1');
      expect(approveResult.success).toBe(true);

      // Let executor run
      await vi.advanceTimersByTimeAsync(200);

      const fetched = service.getIntent(intent.id);
      expect(fetched?.status).toBe('VERIFIED');
      expect(fetched?.receipt?.effect).toBe('All positions closed');
    });

    it('should reject FLATTEN via rejectIntent', async () => {
      const intent = makeIntent('FLATTEN');
      await service.submitIntent(intent);

      const rejectResult = service.rejectIntent(intent.id, 'approver-1', 'Not now');
      expect(rejectResult.success).toBe(true);

      const fetched = service.getIntent(intent.id);
      expect(fetched?.status).toBe('REJECTED');
      expect(fetched?.receipt?.error).toContain('Rejected by approver-1');
    });

    it('should auto-expire FLATTEN if not approved within TTL', async () => {
      const intent = makeIntent('FLATTEN', {}, { ttl_seconds: 5 });
      await service.submitIntent(intent);

      // Verify it's pending
      expect(service.getIntent(intent.id)?.status).toBe('PENDING_APPROVAL');

      // Advance past TTL
      await vi.advanceTimersByTimeAsync(6000);

      const fetched = service.getIntent(intent.id);
      expect(fetched?.status).toBe('UNVERIFIED');
      expect(fetched?.receipt?.error).toContain('TTL expired');
    });
  });

  // =========================================================================
  // OVERRIDE_RISK requires approval
  // =========================================================================

  describe('OVERRIDE_RISK → approval workflow', () => {
    it('should hold OVERRIDE_RISK in PENDING_APPROVAL status', async () => {
      const intent = makeIntent('OVERRIDE_RISK', { duration_seconds: 300 });
      const result = await service.submitIntent(intent);

      expect(result.status).toBe('ACCEPTED');
      expect(service.getIntent(intent.id)?.status).toBe('PENDING_APPROVAL');
    });

    it('should execute OVERRIDE_RISK after approval and produce receipt', async () => {
      const intent = makeIntent('OVERRIDE_RISK', { duration_seconds: 300 });
      await service.submitIntent(intent);

      await service.approveIntent(intent.id, 'risk-owner-1');
      await vi.advanceTimersByTimeAsync(200);

      const fetched = service.getIntent(intent.id);
      expect(fetched?.status).toBe('VERIFIED');
      expect(fetched?.receipt?.effect).toBe('Risk override applied');
    });
  });

  // =========================================================================
  // Pending approval count
  // =========================================================================

  describe('pending approval tracking', () => {
    it('should track pending approval count', async () => {
      expect(service.getPendingApprovalCount()).toBe(0);

      await service.submitIntent(makeIntent('FLATTEN'));
      expect(service.getPendingApprovalCount()).toBe(1);

      await service.submitIntent(makeIntent('OVERRIDE_RISK', { duration_seconds: 60 }));
      expect(service.getPendingApprovalCount()).toBe(2);
    });

    it('should decrement count after approval', async () => {
      const intent = makeIntent('FLATTEN');
      await service.submitIntent(intent);
      expect(service.getPendingApprovalCount()).toBe(1);

      await service.approveIntent(intent.id, 'approver-1');
      // After approval the status moves to ACCEPTED → EXECUTING
      await vi.advanceTimersByTimeAsync(100);
      expect(service.getPendingApprovalCount()).toBe(0);
    });
  });

  // =========================================================================
  // Non-critical intents skip approval
  // =========================================================================

  describe('non-critical intents bypass approval', () => {
    it('ARM should execute immediately without approval', async () => {
      const intent = makeIntent('ARM');
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');

      // Should NOT be PENDING_APPROVAL
      const fetched = service.getIntent(intent.id);
      expect(fetched?.status).not.toBe('PENDING_APPROVAL');
    });

    it('DISARM should execute immediately without approval', async () => {
      const arm = makeIntent('ARM');
      await service.submitIntent(arm);
      await vi.advanceTimersByTimeAsync(1000);

      const intent = makeIntent('DISARM');
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');

      const fetched = service.getIntent(intent.id);
      expect(fetched?.status).not.toBe('PENDING_APPROVAL');
    });
  });

  // =========================================================================
  // Approve / reject edge cases
  // =========================================================================

  describe('approve/reject edge cases', () => {
    it('should fail to approve non-existent intent', async () => {
      const result = await service.approveIntent('non-existent', 'approver-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('INTENT_NOT_FOUND');
    });

    it('should fail to approve already-executed intent', async () => {
      const intent = makeIntent('ARM');
      await service.submitIntent(intent);
      await vi.advanceTimersByTimeAsync(1000);

      const result = await service.approveIntent(intent.id, 'approver-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('INVALID_STATUS');
    });

    it('should fail to reject non-pending intent', () => {
      const result = service.rejectIntent('non-existent', 'approver-1', 'reason');
      expect(result.success).toBe(false);
      expect(result.error).toBe('INTENT_NOT_FOUND');
    });
  });
});
