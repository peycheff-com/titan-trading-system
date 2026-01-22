/**
 * Allocation Repository
 * Handles persistence of allocation history
 *
 * Requirements: 1.8, 9.1, 9.2, 9.3
 */

import { DatabaseManager } from '../DatabaseManager.js';
import { BaseRepository } from './BaseRepository.js';
import { AllocationRecord, AllocationVector, EquityTier } from '../../types/index.js';

interface AllocationRow {
  id: number;
  timestamp: string;
  equity: string;
  w1: string;
  w2: string;
  w3: string;
  tier: string;
  created_at: Date;
}

export class AllocationRepository extends BaseRepository<AllocationRow> {
  constructor(db: DatabaseManager) {
    super(db, 'allocation_history');
  }

  /**
   * Save a new allocation record
   */
  async save(record: Omit<AllocationRecord, 'id'>): Promise<AllocationRecord> {
    const row = await this.db.insert<AllocationRow>(this.tableName, {
      timestamp: record.timestamp,
      equity: record.equity,
      w1: record.w1,
      w2: record.w2,
      w3: record.w3,
      tier: record.tier,
    });

    return this.mapRowToRecord(row);
  }

  /**
   * Get the latest allocation record
   */
  async getLatest(): Promise<AllocationRecord | null> {
    const row = await this.db.queryOne<AllocationRow>(
      `SELECT * FROM ${this.tableName} ORDER BY timestamp DESC LIMIT 1`,
    );

    return row ? this.mapRowToRecord(row) : null;
  }

  /**
   * Get allocation history within a time range
   */
  async getHistory(startTime: number, endTime: number): Promise<AllocationRecord[]> {
    const rows = await this.db.queryAll<AllocationRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE timestamp >= $1 AND timestamp <= $2 
       ORDER BY timestamp DESC`,
      [startTime, endTime],
    );

    return rows.map((row) => this.mapRowToRecord(row));
  }

  /**
   * Get allocation records by equity tier
   */
  async getByTier(tier: EquityTier, limit: number = 100): Promise<AllocationRecord[]> {
    const rows = await this.db.queryAll<AllocationRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE tier = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [tier, limit],
    );

    return rows.map((row) => this.mapRowToRecord(row));
  }

  /**
   * Get the latest allocation vector
   */
  async getLatestVector(): Promise<AllocationVector | null> {
    const record = await this.getLatest();
    if (!record) return null;

    return {
      w1: record.w1,
      w2: record.w2,
      w3: record.w3,
      timestamp: record.timestamp,
    };
  }

  /**
   * Map database row to AllocationRecord
   */
  private mapRowToRecord(row: AllocationRow): AllocationRecord {
    return {
      id: row.id,
      timestamp: parseInt(row.timestamp, 10),
      equity: parseFloat(row.equity),
      w1: parseFloat(row.w1),
      w2: parseFloat(row.w2),
      w3: parseFloat(row.w3),
      tier: row.tier as EquityTier,
    };
  }
}
