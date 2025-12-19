/**
 * Risk Repository
 * Handles persistence of risk snapshots
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.6
 */

import { DatabaseManager } from '../DatabaseManager.js';
import { BaseRepository } from './BaseRepository.js';
import { RiskSnapshot } from '../../types/index.js';

interface RiskRow {
  id: number;
  timestamp: string;
  global_leverage: string;
  net_delta: string;
  correlation_score: string;
  portfolio_beta: string;
  var_95: string;
  created_at: Date;
}

export class RiskRepository extends BaseRepository<RiskRow> {
  constructor(db: DatabaseManager) {
    super(db, 'risk_snapshots');
  }

  /**
   * Save a risk snapshot
   */
  async save(snapshot: Omit<RiskSnapshot, 'id'>): Promise<RiskSnapshot> {
    const row = await this.db.insert<RiskRow>(this.tableName, {
      timestamp: snapshot.timestamp,
      global_leverage: snapshot.globalLeverage,
      net_delta: snapshot.netDelta,
      correlation_score: snapshot.correlationScore,
      portfolio_beta: snapshot.portfolioBeta,
      var_95: snapshot.var95,
    });
    
    return this.mapRowToSnapshot(row);
  }

  /**
   * Get the latest risk snapshot
   */
  async getLatest(): Promise<RiskSnapshot | null> {
    const row = await this.db.queryOne<RiskRow>(
      `SELECT * FROM ${this.tableName} ORDER BY timestamp DESC LIMIT 1`
    );
    
    return row ? this.mapRowToSnapshot(row) : null;
  }

  /**
   * Get risk snapshots within a time range
   */
  async getInTimeRange(startTime: number, endTime: number): Promise<RiskSnapshot[]> {
    const rows = await this.db.queryAll<RiskRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE timestamp >= $1 AND timestamp <= $2 
       ORDER BY timestamp DESC`,
      [startTime, endTime]
    );
    
    return rows.map(row => this.mapRowToSnapshot(row));
  }

  /**
   * Get average risk metrics over a time window
   */
  async getAverageMetrics(windowMs: number): Promise<{
    avgLeverage: number;
    avgDelta: number;
    avgCorrelation: number;
    avgBeta: number;
    avgVaR: number;
  }> {
    const cutoff = Date.now() - windowMs;
    const result = await this.db.queryOne<{
      avg_leverage: string;
      avg_delta: string;
      avg_correlation: string;
      avg_beta: string;
      avg_var: string;
    }>(
      `SELECT 
         COALESCE(AVG(global_leverage), 0) as avg_leverage,
         COALESCE(AVG(net_delta), 0) as avg_delta,
         COALESCE(AVG(correlation_score), 0) as avg_correlation,
         COALESCE(AVG(portfolio_beta), 0) as avg_beta,
         COALESCE(AVG(var_95), 0) as avg_var
       FROM ${this.tableName} 
       WHERE timestamp >= $1`,
      [cutoff]
    );
    
    return {
      avgLeverage: parseFloat(result?.avg_leverage || '0'),
      avgDelta: parseFloat(result?.avg_delta || '0'),
      avgCorrelation: parseFloat(result?.avg_correlation || '0'),
      avgBeta: parseFloat(result?.avg_beta || '0'),
      avgVaR: parseFloat(result?.avg_var || '0'),
    };
  }

  /**
   * Get max leverage recorded in a time window
   */
  async getMaxLeverage(windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    const result = await this.db.queryOne<{ max_leverage: string }>(
      `SELECT COALESCE(MAX(global_leverage), 0) as max_leverage 
       FROM ${this.tableName} 
       WHERE timestamp >= $1`,
      [cutoff]
    );
    
    return parseFloat(result?.max_leverage || '0');
  }

  /**
   * Get max VaR recorded in a time window
   */
  async getMaxVaR(windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    const result = await this.db.queryOne<{ max_var: string }>(
      `SELECT COALESCE(MAX(var_95), 0) as max_var 
       FROM ${this.tableName} 
       WHERE timestamp >= $1`,
      [cutoff]
    );
    
    return parseFloat(result?.max_var || '0');
  }

  /**
   * Get recent snapshots
   */
  async getRecent(limit: number = 100): Promise<RiskSnapshot[]> {
    const rows = await this.db.queryAll<RiskRow>(
      `SELECT * FROM ${this.tableName} 
       ORDER BY timestamp DESC 
       LIMIT $1`,
      [limit]
    );
    
    return rows.map(row => this.mapRowToSnapshot(row));
  }

  /**
   * Get snapshots where leverage exceeded a threshold
   */
  async getHighLeverageSnapshots(threshold: number, limit: number = 50): Promise<RiskSnapshot[]> {
    const rows = await this.db.queryAll<RiskRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE global_leverage > $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [threshold, limit]
    );
    
    return rows.map(row => this.mapRowToSnapshot(row));
  }

  /**
   * Map database row to RiskSnapshot
   */
  private mapRowToSnapshot(row: RiskRow): RiskSnapshot {
    return {
      id: row.id,
      timestamp: parseInt(row.timestamp, 10),
      globalLeverage: parseFloat(row.global_leverage),
      netDelta: parseFloat(row.net_delta),
      correlationScore: parseFloat(row.correlation_score),
      portfolioBeta: parseFloat(row.portfolio_beta),
      var95: parseFloat(row.var_95),
    };
  }
}
