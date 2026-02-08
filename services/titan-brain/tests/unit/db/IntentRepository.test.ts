/**
 * IntentRepository Unit Tests
 *
 * Tests the repository's SQL generation, parameter mapping,
 * and row-to-record transformation without a real database.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IntentRepository } from '../../../src/db/repositories/IntentRepository.js';
import type { DatabaseManager } from '../../../src/db/DatabaseManager.js';
import type { OperatorIntentRecord, IntentReceipt } from '@titan/shared';

// ---------------------------------------------------------------------------
// Mock DatabaseManager
// ---------------------------------------------------------------------------

function makeMockDb() {
  return {
    query: vi.fn(),
    queryOne: vi.fn(),
    queryAll: vi.fn(),
  } as unknown as DatabaseManager & {
    query: ReturnType<typeof vi.fn>;
    queryOne: ReturnType<typeof vi.fn>;
    queryAll: ReturnType<typeof vi.fn>;
  };
}

function makeRecord(overrides?: Partial<OperatorIntentRecord>): OperatorIntentRecord {
  return {
    id: 'intent-001',
    idempotency_key: 'idem-001',
    version: 1,
    type: 'ARM',
    params: {},
    operator_id: 'operator-1',
    reason: 'Test',
    signature: 'sig-abc',
    status: 'ACCEPTED',
    ttl_seconds: 30,
    submitted_at: '2026-02-08T12:00:00.000Z',
    ...overrides,
  };
}

function makeDbRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'intent-001',
    idempotency_key: 'idem-001',
    version: 1,
    type: 'ARM',
    params: {},
    operator_id: 'operator-1',
    reason: 'Test',
    signature: 'sig-abc',
    status: 'ACCEPTED',
    ttl_seconds: 30,
    state_hash: null,
    submitted_at: '2026-02-08T12:00:00.000Z',
    resolved_at: null,
    receipt: null,
    created_at: '2026-02-08T12:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntentRepository', () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: IntentRepository;

  beforeEach(() => {
    db = makeMockDb();
    repo = new IntentRepository(db);
  });

  // =========================================================================
  // insert
  // =========================================================================

  describe('insert', () => {
    it('should execute INSERT with ON CONFLICT DO NOTHING', async () => {
      const record = makeRecord();
      await repo.insert(record);

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO operator_intents');
      expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
      expect(params[0]).toBe('intent-001'); // id
      expect(params[1]).toBe('idem-001'); // idempotency_key
      expect(params[8]).toBe('ACCEPTED'); // status
    });

    it('should JSON.stringify params and receipt', async () => {
      const record = makeRecord({
        params: { symbol: 'BTC' },
        receipt: { effect: 'armed' },
      });
      await repo.insert(record);

      const params = db.query.mock.calls[0][1];
      expect(params[4]).toBe('{"symbol":"BTC"}'); // params
      expect(params[13]).toBe('{"effect":"armed"}'); // receipt
    });

    it('should not throw when db.query fails (fire-and-forget)', async () => {
      db.query.mockRejectedValueOnce(new Error('DB down'));
      const record = makeRecord();

      // Should not throw
      await expect(repo.insert(record)).resolves.toBeUndefined();
    });

    it('should pass null for optional fields when absent', async () => {
      const record = makeRecord({
        state_hash: undefined,
        resolved_at: undefined,
        receipt: undefined,
      });
      await repo.insert(record);

      const params = db.query.mock.calls[0][1];
      expect(params[10]).toBeNull(); // state_hash
      expect(params[12]).toBeNull(); // resolved_at
      expect(params[13]).toBeNull(); // receipt
    });
  });

  // =========================================================================
  // updateStatus
  // =========================================================================

  describe('updateStatus', () => {
    it('should execute UPDATE with correct status and id', async () => {
      await repo.updateStatus('intent-001', 'EXECUTING');

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('UPDATE operator_intents SET status');
      expect(params[0]).toBe('EXECUTING');
      expect(params[1]).toBe('intent-001');
    });

    it('should not throw on DB error', async () => {
      db.query.mockRejectedValueOnce(new Error('DB down'));
      await expect(repo.updateStatus('x', 'FAILED')).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // resolve
  // =========================================================================

  describe('resolve', () => {
    it('should update status, receipt (JSON), and resolved_at', async () => {
      const receipt: IntentReceipt = {
        effect: 'System armed',
        prior_state: { armed: false },
        new_state: { armed: true },
      };
      await repo.resolve('intent-001', 'VERIFIED', receipt, '2026-02-08T12:01:00.000Z');

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('UPDATE operator_intents');
      expect(sql).toContain('receipt');
      expect(params[0]).toBe('VERIFIED');
      expect(params[1]).toBe(JSON.stringify(receipt));
      expect(params[2]).toBe('2026-02-08T12:01:00.000Z');
      expect(params[3]).toBe('intent-001');
    });

    it('should not throw on DB error', async () => {
      db.query.mockRejectedValueOnce(new Error('DB down'));
      await expect(
        repo.resolve('x', 'FAILED', { error: 'boom' }, '2026-01-01T00:00:00Z'),
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // findById
  // =========================================================================

  describe('findById', () => {
    it('should return mapped record when row exists', async () => {
      db.queryOne.mockResolvedValueOnce(makeDbRow());

      const result = await repo.findById('intent-001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('intent-001');
      expect(result!.type).toBe('ARM');
      expect(result!.version).toBe(1);
    });

    it('should return null when no row found', async () => {
      db.queryOne.mockResolvedValueOnce(null);

      const result = await repo.findById('non-existent');
      expect(result).toBeNull();
    });

    it('should parse JSON string params from DB', async () => {
      db.queryOne.mockResolvedValueOnce(
        makeDbRow({ params: '{"symbol":"ETH"}' }),
      );

      const result = await repo.findById('intent-001');
      expect(result!.params).toEqual({ symbol: 'ETH' });
    });

    it('should parse JSON string receipt from DB', async () => {
      db.queryOne.mockResolvedValueOnce(
        makeDbRow({ receipt: '{"effect":"armed"}' }),
      );

      const result = await repo.findById('intent-001');
      expect(result!.receipt).toEqual({ effect: 'armed' });
    });
  });

  // =========================================================================
  // findByIdempotencyKey
  // =========================================================================

  describe('findByIdempotencyKey', () => {
    it('should query by idempotency_key', async () => {
      db.queryOne.mockResolvedValueOnce(makeDbRow());

      const result = await repo.findByIdempotencyKey('idem-001');
      expect(result).not.toBeNull();
      expect(db.queryOne.mock.calls[0][1]).toEqual(['idem-001']);
    });

    it('should return null when not found', async () => {
      db.queryOne.mockResolvedValueOnce(null);

      const result = await repo.findByIdempotencyKey('missing');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // findRecent
  // =========================================================================

  describe('findRecent', () => {
    it('should return mapped records ordered by submitted_at DESC', async () => {
      db.queryAll.mockResolvedValueOnce([
        makeDbRow({ id: 'a' }),
        makeDbRow({ id: 'b' }),
      ]);

      const results = await repo.findRecent(10);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('a');
      expect(results[1].id).toBe('b');
    });

    it('should default limit to 1000', async () => {
      db.queryAll.mockResolvedValueOnce([]);
      await repo.findRecent();

      const params = db.queryAll.mock.calls[0][1];
      expect(params[0]).toBe(1000);
    });
  });

  // =========================================================================
  // findFiltered
  // =========================================================================

  describe('findFiltered', () => {
    it('should build WHERE clause from status filter', async () => {
      db.queryAll.mockResolvedValueOnce([makeDbRow()]);
      db.queryOne.mockResolvedValueOnce({ count: '1' });

      const result = await repo.findFiltered({ status: 'VERIFIED' });
      expect(result.intents).toHaveLength(1);
      expect(result.total).toBe(1);

      const sql = db.queryAll.mock.calls[0][0] as string;
      expect(sql).toContain('status = $1');
    });

    it('should build WHERE clause from type filter', async () => {
      db.queryAll.mockResolvedValueOnce([]);
      db.queryOne.mockResolvedValueOnce({ count: '0' });

      await repo.findFiltered({ type: 'ARM' });

      const sql = db.queryAll.mock.calls[0][0] as string;
      expect(sql).toContain('type = $1');
    });

    it('should combine status and type filters', async () => {
      db.queryAll.mockResolvedValueOnce([]);
      db.queryOne.mockResolvedValueOnce({ count: '0' });

      await repo.findFiltered({ status: 'VERIFIED', type: 'ARM' });

      const sql = db.queryAll.mock.calls[0][0] as string;
      expect(sql).toContain('status = $1');
      expect(sql).toContain('type = $2');
    });

    it('should cap limit at 100', async () => {
      db.queryAll.mockResolvedValueOnce([]);
      db.queryOne.mockResolvedValueOnce({ count: '0' });

      await repo.findFiltered({ limit: 500 });

      const params = db.queryAll.mock.calls[0][1] as unknown[];
      expect(params[params.length - 1]).toBe(100); // capped
    });

    it('should default limit to 20', async () => {
      db.queryAll.mockResolvedValueOnce([]);
      db.queryOne.mockResolvedValueOnce({ count: '0' });

      await repo.findFiltered();

      const params = db.queryAll.mock.calls[0][1] as unknown[];
      expect(params[params.length - 1]).toBe(20);
    });
  });
});
