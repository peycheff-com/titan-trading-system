/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * IntentRepository
 *
 * PostgreSQL persistence for OperatorIntent records.
 * Used as a write-through cache layer by OperatorIntentService.
 *
 * Table: operator_intents (created by migration013)
 */

import { DatabaseManager } from '../DatabaseManager.js';
import type { OperatorIntentRecord, OperatorIntentStatus, IntentReceipt } from '@titan/shared';
import { Logger } from '../../logging/Logger.js';

// ---------------------------------------------------------------------------
// Row type (snake_case DB columns → OperatorIntentRecord)
// ---------------------------------------------------------------------------

interface IntentRow {
  id: string;
  idempotency_key: string;
  version: number;
  type: string;
  params: Record<string, unknown>;
  operator_id: string;
  reason: string;
  signature: string;
  status: string;
  ttl_seconds: number;
  state_hash: string | null;
  submitted_at: string;
  resolved_at: string | null;
  receipt: IntentReceipt | null;
  approver_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class IntentRepository {
  private readonly logger: Logger;

  constructor(
    private readonly db: DatabaseManager,
    logger?: Logger,
  ) {
    this.logger = logger ?? Logger.getInstance('intent-repository');
  }

  /**
   * Insert a new intent record.
   * Uses ON CONFLICT to handle idempotency key collisions gracefully.
   */
  async insert(record: OperatorIntentRecord): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO operator_intents (
          id, idempotency_key, version, type, params, operator_id,
          reason, signature, status, ttl_seconds, state_hash,
          submitted_at, resolved_at, receipt, approver_id, approved_at, rejection_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO NOTHING`,
        [
          record.id,
          record.idempotency_key,
          record.version ?? 1,
          record.type,
          JSON.stringify(record.params ?? {}),
          record.operator_id,
          record.reason ?? '',
          record.signature ?? '',
          record.status,
          record.ttl_seconds ?? 30,
          record.state_hash ?? null,
          record.submitted_at,
          record.resolved_at ?? null,
          record.receipt ? JSON.stringify(record.receipt) : null,
          record.approver_id ?? null,
          record.approved_at ?? null,
          record.rejection_reason ?? null,
        ],
      );
    } catch (err) {
      this.logger.error(
        `Failed to insert intent ${record.id}`,
        err instanceof Error ? err : undefined,
      );
      // Non-fatal: in-memory buffer is primary, DB is durability layer
    }
  }

  /**
   * Update intent status (for lifecycle transitions).
   */
  async updateStatus(id: string, status: OperatorIntentStatus): Promise<void> {
    try {
      await this.db.query(`UPDATE operator_intents SET status = $1 WHERE id = $2`, [status, id]);
    } catch (err) {
      this.logger.error(
        `Failed to update intent status ${id}`,
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Resolve an intent: set terminal status, receipt, and resolved_at timestamp.
   */
  async resolve(
    id: string,
    status: OperatorIntentStatus,
    receipt: IntentReceipt,
    resolvedAt: string,
  ): Promise<void> {
    try {
      await this.db.query(
        `UPDATE operator_intents
         SET status = $1, receipt = $2, resolved_at = $3
         WHERE id = $4`,
        [status, JSON.stringify(receipt), resolvedAt, id],
      );
    } catch (err) {
      this.logger.error(`Failed to resolve intent ${id}`, err instanceof Error ? err : undefined);
    }
  }

  /**
   * Find a single intent by ID.
   */
  async findById(id: string): Promise<OperatorIntentRecord | null> {
    const row = await this.db.queryOne<IntentRow>(`SELECT * FROM operator_intents WHERE id = $1`, [
      id,
    ]);
    return row ? this.toRecord(row) : null;
  }

  /**
   * Find intent by idempotency key.
   */
  async findByIdempotencyKey(key: string): Promise<OperatorIntentRecord | null> {
    const row = await this.db.queryOne<IntentRow>(
      `SELECT * FROM operator_intents WHERE idempotency_key = $1`,
      [key],
    );
    return row ? this.toRecord(row) : null;
  }

  /**
   * Load the most recent N intents for hydrating the in-memory ring buffer.
   */
  async findRecent(limit: number = 1000): Promise<OperatorIntentRecord[]> {
    const rows = await this.db.queryAll<IntentRow>(
      `SELECT * FROM operator_intents ORDER BY submitted_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => this.toRecord(r));
  }

  /**
   * Find intents with filters (mirrors OperatorIntentService.getIntents).
   */
  async findFiltered(filters?: {
    limit?: number;
    status?: OperatorIntentStatus;
    type?: string;
  }): Promise<{ intents: OperatorIntentRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters?.type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(filters.type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(filters?.limit ?? 20, 100);

    const [rows, countResult] = await Promise.all([
      this.db.queryAll<IntentRow>(
        `SELECT * FROM operator_intents ${where} ORDER BY submitted_at DESC LIMIT $${paramIdx}`,
        [...params, limit],
      ),
      this.db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM operator_intents ${where}`,
        params,
      ),
    ]);

    return {
      intents: rows.map((r) => this.toRecord(r)),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  // ---------------------------------------------------------------------------
  // Row → Record mapper
  // ---------------------------------------------------------------------------

  private toRecord(row: IntentRow): OperatorIntentRecord {
    return {
      id: row.id,
      idempotency_key: row.idempotency_key,
      version: 1 as const,
      type: row.type as OperatorIntentRecord['type'],
      params: typeof row.params === 'string' ? JSON.parse(row.params) : (row.params ?? {}),
      operator_id: row.operator_id,
      reason: row.reason,
      signature: row.signature,
      status: row.status as OperatorIntentRecord['status'],
      ttl_seconds: row.ttl_seconds,
      state_hash: row.state_hash ?? undefined,
      submitted_at: row.submitted_at,
      resolved_at: row.resolved_at ?? undefined,
      receipt:
        typeof row.receipt === 'string' ? JSON.parse(row.receipt) : (row.receipt ?? undefined),
      approver_id: row.approver_id ?? undefined,
      approved_at: row.approved_at ?? undefined,
      rejection_reason: row.rejection_reason ?? undefined,
    };
  }
}
