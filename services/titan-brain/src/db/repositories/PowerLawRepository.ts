/**
 * PowerLaw Repository
 * Persistence for PowerLaw Lab metrics
 */

import { BaseRepository } from './BaseRepository.js';
import { DatabaseManager } from '../DatabaseManager.js';
import { PowerLawMetrics } from '../../types/risk.js';
import { QueryResultRow } from 'pg';

interface PowerLawMetricRow extends QueryResultRow {
  id: number;
  symbol: string;
  tail_exponent: string; // DECIMAL
  tail_confidence: string; // DECIMAL
  exceedance_probability: string; // DECIMAL
  vol_state: string;
  vol_persistence: string; // DECIMAL
  timestamp: string; // BIGINT
  created_at: Date;
}

export class PowerLawRepository extends BaseRepository<PowerLawMetricRow> {
  constructor(db: DatabaseManager) {
    super(db, 'powerlaw_metrics');
  }

  /**
   * Save a new PowerLaw metric record
   */
  async save(metrics: PowerLawMetrics): Promise<number> {
    const result = await this.db.queryOne<{ id: number }>(
      `INSERT INTO powerlaw_metrics (
        symbol, 
        tail_exponent, 
        tail_confidence, 
        exceedance_probability, 
        vol_state, 
        vol_persistence, 
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        metrics.symbol,
        metrics.tailExponent,
        metrics.tailConfidence,
        metrics.exceedanceProbability,
        metrics.volatilityCluster.state,
        metrics.volatilityCluster.persistence,
        metrics.timestamp,
      ],
    );

    return result?.id || 0;
  }

  /**
   * Get latest metrics for a symbol
   */
  async getLatestForSymbol(symbol: string): Promise<PowerLawMetrics | null> {
    const row = await this.db.queryOne<PowerLawMetricRow>(
      `SELECT * FROM powerlaw_metrics 
       WHERE symbol = $1 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [symbol],
    );

    if (!row) return null;

    return this.mapRowToMetrics(row);
  }

  /**
   * Get metrics history for a symbol
   */
  async getHistoryForSymbol(symbol: string, limit: number = 100): Promise<PowerLawMetrics[]> {
    const rows = await this.db.queryAll<PowerLawMetricRow>(
      `SELECT * FROM powerlaw_metrics 
       WHERE symbol = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [symbol, limit],
    );

    return rows.map((row) => this.mapRowToMetrics(row));
  }

  /**
   * Map database row to domain object
   */
  private mapRowToMetrics(row: PowerLawMetricRow): PowerLawMetrics {
    return {
      symbol: row.symbol,
      tailExponent: parseFloat(row.tail_exponent),
      tailConfidence: parseFloat(row.tail_confidence),
      exceedanceProbability: parseFloat(row.exceedance_probability),
      volatilityCluster: {
        state: row.vol_state,
        persistence: parseFloat(row.vol_persistence),
        sigma: 0, // Schema does not store sigma yet, defaulting to 0
      },
      timestamp: parseInt(row.timestamp, 10),
    };
  }
}
