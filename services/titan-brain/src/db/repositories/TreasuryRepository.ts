/**
 * Treasury Repository
 * Handles persistence of treasury operations and high watermark
 * 
 * Requirements: 4.7, 9.1, 9.2, 9.3
 */

import { DatabaseManager } from '../DatabaseManager.js';
import { BaseRepository } from './BaseRepository.js';
import { TreasuryOperation } from '../../types/index.js';

interface TreasuryRow {
  id: number;
  timestamp: string;
  operation_type: string;
  amount: string;
  from_wallet: string;
  to_wallet: string;
  reason: string | null;
  high_watermark: string;
  created_at: Date;
}

interface HighWatermarkRow {
  id: number;
  value: string;
  updated_at: string;
  created_at: Date;
}

export class TreasuryRepository extends BaseRepository<TreasuryRow> {
  constructor(db: DatabaseManager) {
    super(db, 'treasury_operations');
  }

  /**
   * Record a treasury operation
   */
  async recordOperation(operation: Omit<TreasuryOperation, 'id'>): Promise<TreasuryOperation> {
    const row = await this.db.insert<TreasuryRow>(this.tableName, {
      timestamp: operation.timestamp,
      operation_type: operation.operationType,
      amount: operation.amount,
      from_wallet: operation.fromWallet,
      to_wallet: operation.toWallet,
      reason: operation.reason || null,
      high_watermark: operation.highWatermark,
    });
    
    return this.mapRowToOperation(row);
  }

  /**
   * Get total amount swept to spot wallet
   */
  async getTotalSwept(): Promise<number> {
    const result = await this.db.queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM ${this.tableName} 
       WHERE operation_type = 'SWEEP' AND to_wallet = 'SPOT'`
    );
    
    return parseFloat(result?.total || '0');
  }

  /**
   * Get sweep history
   */
  async getSweepHistory(limit: number = 50): Promise<TreasuryOperation[]> {
    const rows = await this.db.queryAll<TreasuryRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE operation_type = 'SWEEP' 
       ORDER BY timestamp DESC 
       LIMIT $1`,
      [limit]
    );
    
    return rows.map(row => this.mapRowToOperation(row));
  }

  /**
   * Get sweep statistics
   */
  async getSweepStats(): Promise<{ count: number; totalAmount: number; avgAmount: number }> {
    const result = await this.db.queryOne<{ count: string; total: string; avg: string }>(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(amount), 0) as total,
         COALESCE(AVG(amount), 0) as avg
       FROM ${this.tableName} 
       WHERE operation_type = 'SWEEP'`
    );
    
    return {
      count: parseInt(result?.count || '0', 10),
      totalAmount: parseFloat(result?.total || '0'),
      avgAmount: parseFloat(result?.avg || '0'),
    };
  }

  /**
   * Get operations within a time range
   */
  async getOperationsInRange(startTime: number, endTime: number): Promise<TreasuryOperation[]> {
    const rows = await this.db.queryAll<TreasuryRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE timestamp >= $1 AND timestamp <= $2 
       ORDER BY timestamp DESC`,
      [startTime, endTime]
    );
    
    return rows.map(row => this.mapRowToOperation(row));
  }

  /**
   * Get the current high watermark
   */
  async getHighWatermark(): Promise<number> {
    const row = await this.db.queryOne<HighWatermarkRow>(
      `SELECT * FROM high_watermark ORDER BY id DESC LIMIT 1`
    );
    
    return row ? parseFloat(row.value) : 200; // Default starting capital
  }

  /**
   * Update the high watermark
   */
  async updateHighWatermark(value: number): Promise<void> {
    const currentValue = await this.getHighWatermark();
    
    // Only update if new value is higher (monotonically increasing)
    if (value > currentValue) {
      await this.db.query(
        `INSERT INTO high_watermark (value, updated_at) VALUES ($1, $2)`,
        [value, Date.now()]
      );
    }
  }

  /**
   * Get high watermark history
   */
  async getHighWatermarkHistory(limit: number = 50): Promise<Array<{ value: number; updatedAt: number }>> {
    const rows = await this.db.queryAll<HighWatermarkRow>(
      `SELECT * FROM high_watermark ORDER BY updated_at DESC LIMIT $1`,
      [limit]
    );
    
    return rows.map(row => ({
      value: parseFloat(row.value),
      updatedAt: parseInt(row.updated_at, 10),
    }));
  }

  /**
   * Map database row to TreasuryOperation
   */
  private mapRowToOperation(row: TreasuryRow): TreasuryOperation {
    return {
      id: row.id,
      timestamp: parseInt(row.timestamp, 10),
      operationType: row.operation_type as 'SWEEP' | 'MANUAL_TRANSFER',
      amount: parseFloat(row.amount),
      fromWallet: row.from_wallet as 'FUTURES' | 'SPOT',
      toWallet: row.to_wallet as 'FUTURES' | 'SPOT',
      reason: row.reason || undefined,
      highWatermark: parseFloat(row.high_watermark),
    };
  }
}
