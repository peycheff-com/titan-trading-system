/**
 * OperatorIntentService — Persistence Integration Tests
 *
 * Tests the write-through persistence behavior between
 * OperatorIntentService and IntentRepository.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorIntentService } from '../../../src/services/OperatorIntentService.js';
import type { IntentRepository } from '../../../src/db/repositories/IntentRepository.js';
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

function makeMockRepo(): IntentRepository & {
  insert: ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
  resolve: ReturnType<typeof vi.fn>;
  findRecent: ReturnType<typeof vi.fn>;
} {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue(undefined),
    findRecent: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findFiltered: vi.fn().mockResolvedValue({ intents: [], total: 0 }),
  } as unknown as IntentRepository & {
    insert: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
    findRecent: ReturnType<typeof vi.fn>;
  };
}

function createServiceWithRepo(repo: IntentRepository) {
  return new OperatorIntentService(
    {
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
    },
    undefined,
    repo,
  );
}

describe('OperatorIntentService — Persistence', () => {
  let repo: ReturnType<typeof makeMockRepo>;
  let service: OperatorIntentService;

  beforeEach(() => {
    vi.useFakeTimers();
    repo = makeMockRepo();
    service = createServiceWithRepo(repo);
  });

  afterEach(() => {
    service.shutdown();
    vi.useRealTimers();
  });

  // =========================================================================
  // Write-through on storeIntent
  // =========================================================================

  describe('write-through: storeIntent', () => {
    it('should call repo.insert when intent is accepted', async () => {
      const intent = makeIntent('ARM');
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');

      // repo.insert is called asynchronously (fire-and-forget)
      await vi.advanceTimersByTimeAsync(10);
      expect(repo.insert).toHaveBeenCalledTimes(1);
      expect(repo.insert.mock.calls[0][0].id).toBe(intent.id);
    });

    it('should not throw if repo.insert fails', async () => {
      repo.insert.mockRejectedValueOnce(new Error('DB down'));

      const intent = makeIntent('ARM');
      const result = await service.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');

      await vi.advanceTimersByTimeAsync(10);
      // Service still works despite DB failure
      const fetched = service.getIntent(intent.id);
      expect(fetched).toBeDefined();
    });
  });

  // =========================================================================
  // Write-through on updateStatus
  // =========================================================================

  describe('write-through: updateStatus', () => {
    it('should call repo.updateStatus when intent transitions to EXECUTING', async () => {
      const intent = makeIntent('ARM');
      await service.submitIntent(intent);

      // Let executor start (ACCEPTED → EXECUTING)
      await vi.advanceTimersByTimeAsync(10);

      expect(repo.updateStatus).toHaveBeenCalled();
      const statusCalls = repo.updateStatus.mock.calls;
      const executingCall = statusCalls.find(
        (c: unknown[]) => c[0] === intent.id && c[1] === 'EXECUTING',
      );
      expect(executingCall).toBeDefined();
    });
  });

  // =========================================================================
  // Write-through on resolveIntent
  // =========================================================================

  describe('write-through: resolveIntent', () => {
    it('should call repo.resolve when intent reaches VERIFIED', async () => {
      const intent = makeIntent('ARM');
      await service.submitIntent(intent);

      // Let executor complete → VERIFIED
      await vi.advanceTimersByTimeAsync(100);

      expect(repo.resolve).toHaveBeenCalled();
      const resolveCall = repo.resolve.mock.calls.find(
        (c: unknown[]) => c[0] === intent.id && c[1] === 'VERIFIED',
      );
      expect(resolveCall).toBeDefined();
      expect(resolveCall![2]).toHaveProperty('effect'); // receipt
    });

    it('should call repo.resolve when intent reaches FAILED', async () => {
      const failService = createServiceWithRepo(repo);
      // Override with failing executor
      const failRepo = makeMockRepo();
      const failSvc = new OperatorIntentService(
        {
          opsSecret: OPS_SECRET,
          executors: {
            ARM: async () => { throw new Error('boom'); },
          },
          verifiers: {},
          getStateHash: () => 'abc123def456',
        },
        undefined,
        failRepo,
      );

      const intent = makeIntent('ARM');
      await failSvc.submitIntent(intent);
      await vi.advanceTimersByTimeAsync(100);

      expect(failRepo.resolve).toHaveBeenCalled();
      const resolveCall = failRepo.resolve.mock.calls.find(
        (c: unknown[]) => c[0] === intent.id && c[1] === 'FAILED',
      );
      expect(resolveCall).toBeDefined();

      failSvc.shutdown();
      failService.shutdown();
    });
  });

  // =========================================================================
  // hydrateFromDb
  // =========================================================================

  describe('hydrateFromDb', () => {
    it('should load intents from repo.findRecent into memory', async () => {
      const storedIntent: OperatorIntentRecord = {
        id: 'hydrated-001',
        idempotency_key: 'idem-hydrated',
        version: 1,
        type: 'ARM',
        params: {},
        operator_id: 'operator-1',
        reason: 'Hydrated',
        signature: 'sig',
        status: 'VERIFIED',
        ttl_seconds: 30,
        submitted_at: '2026-02-08T10:00:00.000Z',
        resolved_at: '2026-02-08T10:00:01.000Z',
        receipt: { effect: 'armed' },
      };

      repo.findRecent.mockResolvedValueOnce([storedIntent]);

      await service.hydrateFromDb();

      const fetched = service.getIntent('hydrated-001');
      expect(fetched).toBeDefined();
      expect(fetched!.status).toBe('VERIFIED');
      expect(fetched!.receipt?.effect).toBe('armed');
    });

    it('should not crash if repo.findRecent throws', async () => {
      repo.findRecent.mockRejectedValueOnce(new Error('DB down'));

      // Should not throw
      await expect(service.hydrateFromDb()).resolves.toBeUndefined();
    });

    it('should skip intents that are already in the buffer', async () => {
      // First, submit an intent normally
      const intent = makeIntent('ARM');
      await service.submitIntent(intent);
      await vi.advanceTimersByTimeAsync(100);

      // Now try to hydrate with same ID
      const storedIntent: OperatorIntentRecord = {
        id: intent.id,
        idempotency_key: intent.idempotency_key,
        version: 1,
        type: 'ARM',
        params: {},
        operator_id: 'operator-1',
        reason: 'From DB',
        signature: 'sig',
        status: 'ACCEPTED', // stale status from DB
        ttl_seconds: 30,
        submitted_at: '2026-02-08T10:00:00.000Z',
      };

      repo.findRecent.mockResolvedValueOnce([storedIntent]);
      await service.hydrateFromDb();

      // In-memory version should be the newer one (VERIFIED), not the hydrated ACCEPTED
      const fetched = service.getIntent(intent.id);
      expect(fetched!.status).toBe('VERIFIED');
    });
  });

  // =========================================================================
  // No repo (optional persistence)
  // =========================================================================

  describe('without repository', () => {
    it('should function normally when no repo is provided', async () => {
      const svcNoRepo = new OperatorIntentService({
        opsSecret: OPS_SECRET,
        executors: {
          ARM: async (): Promise<IntentReceipt> => ({ effect: 'armed' }),
        },
        verifiers: {},
        getStateHash: () => 'hash',
      });

      const intent = makeIntent('ARM');
      const result = await svcNoRepo.submitIntent(intent);
      expect(result.status).toBe('ACCEPTED');

      await vi.advanceTimersByTimeAsync(100);
      expect(svcNoRepo.getIntent(intent.id)?.status).toBe('VERIFIED');

      svcNoRepo.shutdown();
    });
  });
});
