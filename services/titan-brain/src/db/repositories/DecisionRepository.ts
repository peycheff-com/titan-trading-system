/**
 * Decision Repository
 * Handles persistence of brain decisions
 * 
 * Requirements: 2.7, 9.1, 9.2, 9.3, 9.6
 */

import { DatabaseManager } from '../DatabaseManager.js';
import { BaseRepository } from './BaseRepository.js';
import { DecisionRecord, RiskMetrics, PhaseId } from '../../types/index.js';

interface DecisionRow {
  id: number;
  signal_id: string;
  phase_id: string;
  timestamp: string;
  approved: boolean;
  requested_size: string;
  authorized_size: string | null;
  reason: string;
  risk_metrics: RiskMetrics | null;
  created_at: Date;
}

export class DecisionRepository extends BaseRepository<DecisionRow> {
  constructor(db: DatabaseManager) {
    super(db, 'brain_decisions');
  }

  /**
   * Save a brain decision
   */
  async save(record: Omit<DecisionRecord, 'id'>): Promise<DecisionRecord> {
    const row = await this.db.insert<DecisionRow>(this.tableName, {
      signal_id: record.signalId,
      phase_id: record.phaseId,
      timestamp: record.timestamp,
      approved: record.approved,
      requested_size: record.requestedSize,
      authorized_size: record.authorizedSize,
      reason: record.reason,
      risk_metrics: record.riskMetrics ? JSON.stringify(record.riskMetrics) : null,
    });
    
    return this.mapRowToRecord(row);
  }

  /**
   * Find a decision by signal ID
   */
  async findBySignalId(signalId: string): Promise<DecisionRecord | null> {
    const row = await this.db.queryOne<DecisionRow>(
      `SELECT * FROM ${this.tableName} WHERE signal_id = $1`,
      [signalId]
    );
    
    return row ? this.mapRowToRecord(row) : null;
  }

  /**
   * Check if a signal has already been processed (idempotency)
   */
  async exists(signalId: string): Promise<boolean> {
    const result = await this.db.queryOne<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE signal_id = $1) as exists`,
      [signalId]
    );
    
    return result?.exists || false;
  }

  /**
   * Get recent decisions
   */
  async getRecent(limit: number = 20): Promise<DecisionRecord[]> {
    const rows = await this.db.queryAll<DecisionRow>(
      `SELECT * FROM ${this.tableName} 
       ORDER BY timestamp DESC 
       LIMIT $1`,
      [limit]
    );
    
    return rows.map(row => this.mapRowToRecord(row));
  }

  /**
   * Get decisions for a specific phase
   */
  async getByPhase(phaseId: PhaseId, limit: number = 50): Promise<DecisionRecord[]> {
    const rows = await this.db.queryAll<DecisionRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE phase_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [phaseId, limit]
    );
    
    return rows.map(row => this.mapRowToRecord(row));
  }

  /**
   * Get approval rate for a phase within a time window
   */
  async getApprovalRate(phaseId: PhaseId, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    const result = await this.db.queryOne<{ approved: string; total: string }>(
      `SELECT 
         COUNT(*) FILTER (WHERE approved = true) as approved,
         COUNT(*) as total
       FROM ${this.tableName} 
       WHERE phase_id = $1 AND timestamp >= $2`,
      [phaseId, cutoff]
    );
    
    const approved = parseInt(result?.approved || '0', 10);
    const total = parseInt(result?.total || '0', 10);
    
    return total > 0 ? approved / total : 1;
  }

  /**
   * Get decisions within a time range
   */
  async getInTimeRange(startTime: number, endTime: number): Promise<DecisionRecord[]> {
    const rows = await this.db.queryAll<DecisionRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE timestamp >= $1 AND timestamp <= $2 
       ORDER BY timestamp DESC`,
      [startTime, endTime]
    );
    
    return rows.map(row => this.mapRowToRecord(row));
  }

  /**
   * Get veto reasons summary
   */
  async getVetoReasonsSummary(windowMs: number): Promise<Map<string, number>> {
    const cutoff = Date.now() - windowMs;
    const rows = await this.db.queryAll<{ reason: string; count: string }>(
      `SELECT reason, COUNT(*) as count 
       FROM ${this.tableName} 
       WHERE approved = false AND timestamp >= $1 
       GROUP BY reason 
       ORDER BY count DESC`,
      [cutoff]
    );
    
    const summary = new Map<string, number>();
    for (const row of rows) {
      summary.set(row.reason, parseInt(row.count, 10));
    }
    
    return summary;
  }

  /**
   * Map database row to DecisionRecord
   */
  private mapRowToRecord(row: DecisionRow): DecisionRecord {
    return {
      id: row.id,
      signalId: row.signal_id,
      phaseId: row.phase_id as PhaseId,
      timestamp: parseInt(row.timestamp, 10),
      approved: row.approved,
      requestedSize: parseFloat(row.requested_size),
      authorizedSize: row.authorized_size ? parseFloat(row.authorized_size) : null,
      reason: row.reason,
      riskMetrics: row.risk_metrics,
    };
  }
}
