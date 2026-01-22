/**
 * Performance Repository
 * Handles persistence of phase performance and trade records
 *
 * Requirements: 2.7, 9.1, 9.2, 9.3
 */

import { DatabaseManager } from '../DatabaseManager.js';
import { BaseRepository } from './BaseRepository.js';
import { TradeRecord, PerformanceRecord, PhaseId } from '../../types/index.js';

interface TradeRow {
  id: number;
  phase_id: string;
  timestamp: string;
  pnl: string;
  symbol: string | null;
  side: string | null;
  created_at: Date;
}

interface PerformanceRow {
  id: number;
  phase_id: string;
  timestamp: string;
  pnl: string;
  trade_count: number;
  sharpe_ratio: string | null;
  modifier: string;
  created_at: Date;
}

export class PerformanceRepository extends BaseRepository<TradeRow> {
  constructor(db: DatabaseManager) {
    super(db, 'phase_trades');
  }

  /**
   * Record a trade for a phase
   */
  async recordTrade(trade: Omit<TradeRecord, 'id'>): Promise<TradeRecord> {
    const row = await this.db.insert<TradeRow>(this.tableName, {
      phase_id: trade.phaseId,
      timestamp: trade.timestamp,
      pnl: trade.pnl,
      symbol: trade.symbol || null,
      side: trade.side || null,
    });

    return this.mapTradeRowToRecord(row);
  }

  /**
   * Get trades for a phase within a time window
   */
  async getTradesInWindow(phaseId: PhaseId, windowMs: number): Promise<TradeRecord[]> {
    const cutoff = Date.now() - windowMs;
    const rows = await this.db.queryAll<TradeRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE phase_id = $1 AND timestamp >= $2 
       ORDER BY timestamp DESC`,
      [phaseId, cutoff],
    );

    return rows.map((row) => this.mapTradeRowToRecord(row));
  }

  /**
   * Get trade count for a phase within a time window
   */
  async getTradeCount(phaseId: PhaseId, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    const result = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} 
       WHERE phase_id = $1 AND timestamp >= $2`,
      [phaseId, cutoff],
    );

    return parseInt(result?.count || '0', 10);
  }

  /**
   * Get total PnL for a phase within a time window
   */
  async getTotalPnL(phaseId: PhaseId, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    const result = await this.db.queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(pnl), 0) as total FROM ${this.tableName} 
       WHERE phase_id = $1 AND timestamp >= $2`,
      [phaseId, cutoff],
    );

    return parseFloat(result?.total || '0');
  }

  /**
   * Get recent trades for a phase
   */
  async getRecentTrades(phaseId: PhaseId, limit: number = 10): Promise<TradeRecord[]> {
    const rows = await this.db.queryAll<TradeRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE phase_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [phaseId, limit],
    );

    return rows.map((row) => this.mapTradeRowToRecord(row));
  }

  /**
   * Save performance metrics snapshot
   */
  async savePerformanceMetrics(record: Omit<PerformanceRecord, 'id'>): Promise<PerformanceRecord> {
    const row = await this.db.insert<PerformanceRow>('phase_performance', {
      phase_id: record.phaseId,
      timestamp: record.timestamp,
      pnl: record.pnl,
      trade_count: record.tradeCount,
      sharpe_ratio: record.sharpeRatio,
      modifier: record.modifier,
    });

    return this.mapPerformanceRowToRecord(row);
  }

  /**
   * Get latest performance metrics for a phase
   */
  async getLatestPerformance(phaseId: PhaseId): Promise<PerformanceRecord | null> {
    const row = await this.db.queryOne<PerformanceRow>(
      `SELECT * FROM phase_performance 
       WHERE phase_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [phaseId],
    );

    return row ? this.mapPerformanceRowToRecord(row) : null;
  }

  /**
   * Get performance history for a phase
   */
  async getPerformanceHistory(
    phaseId: PhaseId,
    startTime: number,
    endTime: number,
  ): Promise<PerformanceRecord[]> {
    const rows = await this.db.queryAll<PerformanceRow>(
      `SELECT * FROM phase_performance 
       WHERE phase_id = $1 AND timestamp >= $2 AND timestamp <= $3 
       ORDER BY timestamp DESC`,
      [phaseId, startTime, endTime],
    );

    return rows.map((row) => this.mapPerformanceRowToRecord(row));
  }

  /**
   * Calculate win rate for a phase within a time window
   */
  async getWinRate(phaseId: PhaseId, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    const result = await this.db.queryOne<{ wins: string; total: string }>(
      `SELECT 
         COUNT(*) FILTER (WHERE pnl > 0) as wins,
         COUNT(*) as total
       FROM ${this.tableName} 
       WHERE phase_id = $1 AND timestamp >= $2`,
      [phaseId, cutoff],
    );

    const wins = parseInt(result?.wins || '0', 10);
    const total = parseInt(result?.total || '0', 10);

    return total > 0 ? wins / total : 0;
  }

  /**
   * Get average win and loss for a phase
   */
  async getAvgWinLoss(
    phaseId: PhaseId,
    windowMs: number,
  ): Promise<{ avgWin: number; avgLoss: number }> {
    const cutoff = Date.now() - windowMs;
    const result = await this.db.queryOne<{ avg_win: string; avg_loss: string }>(
      `SELECT 
         COALESCE(AVG(pnl) FILTER (WHERE pnl > 0), 0) as avg_win,
         COALESCE(AVG(pnl) FILTER (WHERE pnl < 0), 0) as avg_loss
       FROM ${this.tableName} 
       WHERE phase_id = $1 AND timestamp >= $2`,
      [phaseId, cutoff],
    );

    return {
      avgWin: parseFloat(result?.avg_win || '0'),
      avgLoss: parseFloat(result?.avg_loss || '0'),
    };
  }

  /**
   * Map database row to TradeRecord
   */
  private mapTradeRowToRecord(row: TradeRow): TradeRecord {
    return {
      id: row.id,
      phaseId: row.phase_id as PhaseId,
      timestamp: parseInt(row.timestamp, 10),
      pnl: parseFloat(row.pnl),
      symbol: row.symbol || undefined,
      side: row.side as 'BUY' | 'SELL' | undefined,
    };
  }

  /**
   * Map database row to PerformanceRecord
   */
  private mapPerformanceRowToRecord(row: PerformanceRow): PerformanceRecord {
    return {
      id: row.id,
      phaseId: row.phase_id as PhaseId,
      timestamp: parseInt(row.timestamp, 10),
      pnl: parseFloat(row.pnl),
      tradeCount: row.trade_count,
      sharpeRatio: row.sharpe_ratio ? parseFloat(row.sharpe_ratio) : null,
      modifier: parseFloat(row.modifier),
    };
  }
}
