/**
 * OperatorIntentService Tests
 *
 * Tests the intent lifecycle, idempotency, signature verification,
 * TTL enforcement, and state hash concurrency control.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorIntentService } from './OperatorIntentService.js';
import {
  calculateIntentSignature,
  type OperatorIntentType,
  type IntentReceipt,
  type OperatorIntentRecord,
} from '@titan/shared';
import crypto from 'crypto';

const OPS_SECRET = 'test-ops-secret-32chars!!!!!!!!';

function makeIntent(
  type: OperatorIntentType = 'ARM',
  overrides?: Partial<Record<string, unknown>>,
) {
  const id = crypto.randomUUID();
  const base = {
    id,
    idempotency_key: `idem-${id}`,
    version: 1,
    type,
    params: {},
    operator_id: 'operator-1',
    reason: 'Test intent',
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
    },
    verifiers: {},
    getStateHash: () => 'abc123def456',
    ...overrides,
  });
}

describe('OperatorIntentService', () => {
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
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('should reject intent with missing required fields', async () => {
      const result = await service.submitIntent({});
      expect(result.status).toBe('REJECTED');
      expect(result.error).toBe('VALIDATION_FAILED');
      expect(result.validationErrors!.length).toBeGreaterThan(0);
    });

    it('should reject intent with invalid type', async () => {
      const intent = makeIntent('ARM');
      (intent as any).type = 'INVALID_TYPE';
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('REJECTED');
      expect(result.error).toBe('VALIDATION_FAILED');
    });

    it('should reject intent with invalid version', async () => {
      const intent = makeIntent('ARM');
      (intent as any).version = 99;
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('REJECTED');
      expect(result.error).toBe('VALIDATION_FAILED');
    });

    it('should accept well-formed ARM intent', async () => {
      const intent = makeIntent('ARM');
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');
      expect(result.intent.id).toBe(intent.id);
    });
  });

  // =========================================================================
  // Signature Verification
  // =========================================================================

  describe('signature verification', () => {
    it('should reject intent with invalid signature', async () => {
      const intent = makeIntent('ARM');
      intent.signature = 'bad-sig';
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('REJECTED');
      expect(result.error).toBe('SIGNATURE_INVALID');
    });

    it('should accept intent with valid HMAC signature', async () => {
      const intent = makeIntent('ARM');
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');
    });
  });

  // =========================================================================
  // Idempotency
  // =========================================================================

  describe('idempotency', () => {
    it('should return IDEMPOTENT_HIT for duplicate idempotency_key', async () => {
      const intent = makeIntent('ARM');
      const r1 = await service.submitIntent(intent);
      expect(r1.status).toBe('ACCEPTED');

      const r2 = await service.submitIntent(intent);
      expect(r2.status).toBe('IDEMPOTENT_HIT');
      expect(r2.intent.id).toBe(intent.id);
    });

    it('should accept different intents with different idempotency keys', async () => {
      const intent1 = makeIntent('ARM');
      const r1 = await service.submitIntent(intent1);
      expect(r1.status).toBe('ACCEPTED');

      // Wait for first to resolve so no in-flight conflict
      await vi.advanceTimersByTimeAsync(1000);

      const intent2 = makeIntent('DISARM');
      const r2 = await service.submitIntent(intent2);
      expect(r2.status).toBe('ACCEPTED');
    });
  });

  // =========================================================================
  // State Hash (Optimistic Concurrency)
  // =========================================================================

  describe('state hash concurrency', () => {
    it('should reject intent with mismatched state_hash', async () => {
      const intent = makeIntent('ARM', { state_hash: 'wrong-hash' });
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('REJECTED');
      expect(result.error).toBe('STATE_CONFLICT');
    });

    it('should accept intent with matching state_hash', async () => {
      const intent = makeIntent('ARM', { state_hash: 'abc123def456' });
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');
    });

    it('should accept intent with no state_hash (optional)', async () => {
      const intent = makeIntent('ARM');
      delete (intent as any).state_hash;
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');
    });
  });

  // =========================================================================
  // In-Flight Conflict
  // =========================================================================

  describe('in-flight conflict', () => {
    it('should reject a second ARM while the first ARM is still in-flight', async () => {
      const slowService = createService({
        executors: {
          ARM: async () => {
            await new Promise((r) => setTimeout(r, 5000));
            return { effect: 'armed' };
          },
        },
      });

      const intent1 = makeIntent('ARM');
      const r1 = await slowService.submitIntent(intent1);
      expect(r1.status).toBe('ACCEPTED');

      const intent2 = makeIntent('ARM');
      const r2 = await slowService.submitIntent(intent2);
      expect(r2.status).toBe('REJECTED');
      expect(r2.error).toBe('INTENT_IN_FLIGHT');

      slowService.shutdown();
    });
  });

  // =========================================================================
  // TTL Enforcement
  // =========================================================================

  describe('TTL enforcement', () => {
    it('should transition to UNVERIFIED when TTL expires', async () => {
      const stallingService = createService({
        executors: {
          ARM: async () => {
            // Never-resolving executor — intent will stay EXECUTING
            return new Promise<IntentReceipt>(() => {});
          },
        },
        verifiers: {},
      });

      const intent = makeIntent('ARM', { ttl_seconds: 5 });
      const result = await stallingService.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');

      // Advance past TTL
      await vi.advanceTimersByTimeAsync(6000);

      const fetched = stallingService.getIntent(intent.id);
      expect(fetched?.status).toBe('UNVERIFIED');

      stallingService.shutdown();
    });
  });

  // =========================================================================
  // Intent Query
  // =========================================================================

  describe('intent querying', () => {
    it('should return intents via getIntents', async () => {
      const intent = makeIntent('ARM');
      await service.submitIntent(intent);

      const { intents, total } = service.getIntents();
      expect(total).toBeGreaterThanOrEqual(1);
      expect(intents[0].id).toBe(intent.id);
    });

    it('should filter by status', async () => {
      const intent = makeIntent('ARM');
      await service.submitIntent(intent);

      const { intents } = service.getIntents({ status: 'ACCEPTED' });
      expect(intents.every((i) => i.status === 'ACCEPTED' || i.status === 'EXECUTING')).toBe(true);
    });

    it('should filter by type', async () => {
      const intent = makeIntent('ARM');
      await service.submitIntent(intent);

      const { intents } = service.getIntents({ type: 'ARM' });
      expect(intents.every((i) => i.type === 'ARM')).toBe(true);
    });

    it('should respect limit', async () => {
      const i1 = makeIntent('ARM');
      await service.submitIntent(i1);

      await vi.advanceTimersByTimeAsync(1000);

      const i2 = makeIntent('DISARM');
      await service.submitIntent(i2);

      const { intents } = service.getIntents({ limit: 1 });
      expect(intents.length).toBe(1);
    });

    it('should return single intent by ID', async () => {
      const intent = makeIntent('ARM');
      await service.submitIntent(intent);

      const fetched = service.getIntent(intent.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(intent.id);
    });

    it('should return undefined for non-existent ID', () => {
      const fetched = service.getIntent('non-existent');
      expect(fetched).toBeUndefined();
    });
  });

  // =========================================================================
  // Intent Summaries
  // =========================================================================

  describe('getLastIntentSummaries', () => {
    it('should return summaries with expected shape', async () => {
      const intent = makeIntent('ARM');
      await service.submitIntent(intent);

      const summaries = service.getLastIntentSummaries(5);
      expect(summaries.length).toBeGreaterThanOrEqual(1);
      expect(summaries[0]).toHaveProperty('id');
      expect(summaries[0]).toHaveProperty('type');
      expect(summaries[0]).toHaveProperty('status');
      expect(summaries[0]).toHaveProperty('operator_id');
      expect(summaries[0]).toHaveProperty('submitted_at');
      expect(summaries[0]).toHaveProperty('has_receipt');
    });
  });

  // =========================================================================
  // Execution and Verification
  // =========================================================================

  describe('execution lifecycle', () => {
    it('should execute intent and mark VERIFIED when no verifier exists', async () => {
      const intent = makeIntent('ARM');
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');

      // Let executor complete
      await vi.advanceTimersByTimeAsync(100);

      const fetched = service.getIntent(intent.id);
      // Without a verifier, it resolves to VERIFIED immediately
      expect(fetched?.status).toBe('VERIFIED');
      expect(fetched?.receipt).toBeDefined();
    });

    it('should mark FAILED when executor throws', async () => {
      const failService = createService({
        executors: {
          ARM: async () => {
            throw new Error('Executor boom');
          },
        },
      });

      const intent = makeIntent('ARM');
      await failService.submitIntent(intent);

      await vi.advanceTimersByTimeAsync(100);

      const fetched = failService.getIntent(intent.id);
      expect(fetched?.status).toBe('FAILED');
      expect(fetched?.receipt?.error).toContain('Executor boom');

      failService.shutdown();
    });

    it('should mark FAILED when no executor is registered for type', async () => {
      const emptyService = createService({ executors: {} });

      const intent = makeIntent('ARM');
      await emptyService.submitIntent(intent);

      await vi.advanceTimersByTimeAsync(100);

      const fetched = emptyService.getIntent(intent.id);
      expect(fetched?.status).toBe('FAILED');
      expect(fetched?.receipt?.error).toContain('No executor registered');

      emptyService.shutdown();
    });
  });

  // =========================================================================
  // EventEmitter — intent:updated
  // =========================================================================

  describe('EventEmitter (intent:updated)', () => {
    it('should emit intent:updated when intent resolves to VERIFIED', async () => {
      const events: Array<Record<string, unknown>> = [];
      service.on('intent:updated', (e) => events.push(e));

      const intent = makeIntent('ARM');
      await service.submitIntent(intent);

      // Let executor complete
      await vi.advanceTimersByTimeAsync(100);

      // Should have: EXECUTING (updateStatus) + VERIFIED (resolveIntent)
      expect(events.length).toBeGreaterThanOrEqual(2);

      const executingEvent = events.find((e) => e.status === 'EXECUTING');
      expect(executingEvent).toBeDefined();
      expect(executingEvent!.intent_id).toBe(intent.id);
      expect(executingEvent!.previous_status).toBe('ACCEPTED');

      const verifiedEvent = events.find((e) => e.status === 'VERIFIED');
      expect(verifiedEvent).toBeDefined();
      expect(verifiedEvent!.intent_id).toBe(intent.id);
      expect(verifiedEvent!.previous_status).toBe('EXECUTING');
      expect(verifiedEvent!.receipt).toBeDefined();
    });

    it('should emit events with correct previous_status chain', async () => {
      const events: Array<Record<string, unknown>> = [];
      service.on('intent:updated', (e) => events.push(e));

      const intent = makeIntent('ARM');
      await service.submitIntent(intent);
      await vi.advanceTimersByTimeAsync(100);

      // Verify chain: ACCEPTED -> EXECUTING -> VERIFIED
      const executingEvent = events.find((e) => e.status === 'EXECUTING');
      const verifiedEvent = events.find((e) => e.status === 'VERIFIED');

      expect(executingEvent).toBeDefined();
      expect(executingEvent!.previous_status).toBe('ACCEPTED');

      expect(verifiedEvent).toBeDefined();
      expect(verifiedEvent!.previous_status).toBe('EXECUTING');
      expect(verifiedEvent!.timestamp).toBeDefined();
    });

    it('should emit intent:updated when executor fails', async () => {
      const failService = createService({
        executors: {
          ARM: async () => { throw new Error('boom'); },
        },
      });

      const events: Array<Record<string, unknown>> = [];
      failService.on('intent:updated', (e) => events.push(e));

      const intent = makeIntent('ARM');
      await failService.submitIntent(intent);
      await vi.advanceTimersByTimeAsync(100);

      const failedEvent = events.find((e) => e.status === 'FAILED');
      expect(failedEvent).toBeDefined();
      expect(failedEvent!.intent_id).toBe(intent.id);

      failService.shutdown();
    });

    it('should stop emitting after shutdown (removeAllListeners)', async () => {
      const events: Array<Record<string, unknown>> = [];
      service.on('intent:updated', (e) => events.push(e));
      service.shutdown();

      expect(service.listenerCount('intent:updated')).toBe(0);
    });
  });

  // =========================================================================
  // Preview (dry-run)
  // =========================================================================

  describe('previewIntent', () => {
    it('should return allowed=true for valid ARM preview', () => {
      const preview = service.previewIntent({
        type: 'ARM',
        params: {},
        operator_id: 'operator-1',
        state_hash: 'abc123def456',
        role: 'operator',
      });

      expect(preview.allowed).toBe(true);
      expect(preview.state_hash_valid).toBe(true);
      expect(preview.rbac_allowed).toBe(true);
      expect(preview.risk_delta.posture_change).toBe('disarmed → armed');
      expect(preview.risk_delta.affected_phases).toEqual(['phase1', 'phase2', 'phase3']);
    });

    it('should return allowed=false for stale state_hash', () => {
      const preview = service.previewIntent({
        type: 'ARM',
        params: {},
        operator_id: 'operator-1',
        state_hash: 'wrong-hash',
      });

      expect(preview.allowed).toBe(false);
      expect(preview.state_hash_valid).toBe(false);
      expect(preview.reason).toContain('State hash mismatch');
    });

    it('should return rbac_allowed=false for observer role', () => {
      const preview = service.previewIntent({
        type: 'ARM',
        params: {},
        operator_id: 'observer-1',
        state_hash: 'abc123def456',
        role: 'observer',
      });

      expect(preview.rbac_allowed).toBe(false);
      expect(preview.allowed).toBe(false);
    });

    it('should compute FLATTEN blast radius correctly', () => {
      const preview = service.previewIntent({
        type: 'FLATTEN',
        params: {},
        operator_id: 'risk-1',
        state_hash: 'abc123def456',
        role: 'risk_owner',
      });

      expect(preview.risk_delta.posture_change).toBe('→ halted');
      expect(preview.risk_delta.affected_symbols).toEqual(['ALL']);
      expect(preview.blast_radius.phases).toEqual(['phase1', 'phase2', 'phase3']);
    });

    it('should compute FLATTEN with specific symbol', () => {
      const preview = service.previewIntent({
        type: 'FLATTEN',
        params: { symbol: 'BTC' },
        operator_id: 'risk-1',
        state_hash: 'abc123def456',
        role: 'risk_owner',
      });

      expect(preview.risk_delta.affected_symbols).toEqual(['BTC']);
    });

    it('should compute THROTTLE_PHASE risk delta', () => {
      const preview = service.previewIntent({
        type: 'THROTTLE_PHASE',
        params: { phase: 'phase1', pct: 50 },
        operator_id: 'operator-1',
        state_hash: 'abc123def456',
        role: 'operator',
      });

      expect(preview.risk_delta.throttle_delta).toBe(-50);
      expect(preview.risk_delta.affected_phases).toEqual(['phase1']);
    });

    it('should detect in-flight conflict in preview', async () => {
      // Submit an ARM intent that takes a while
      const slowService = createService({
        executors: {
          ARM: async () => {
            await new Promise((r) => setTimeout(r, 5000));
            return { effect: 'armed' };
          },
        },
      });

      const intent = makeIntent('ARM');
      await slowService.submitIntent(intent);

      const preview = slowService.previewIntent({
        type: 'ARM',
        params: {},
        operator_id: 'operator-1',
        state_hash: 'abc123def456',
        role: 'operator',
      });

      expect(preview.allowed).toBe(false);
      expect(preview.reason).toContain('already in flight');

      slowService.shutdown();
    });

    it('should report requires_approval for dangerous intents', () => {
      const preview = service.previewIntent({
        type: 'FLATTEN',
        params: {},
        operator_id: 'risk-1',
        state_hash: 'abc123def456',
        role: 'risk_owner',
      });

      expect(preview.requires_approval).toBe(true);
    });
  });
});
