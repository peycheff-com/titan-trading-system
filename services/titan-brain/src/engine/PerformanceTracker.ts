/**
 * PerformanceTracker - Tracks PnL and calculates rolling Sharpe Ratios
 * Enables performance-based throttling of phase allocations
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.8
 */

import {
  PerformanceTrackerConfig,
  PhaseId,
  PhasePerformance,
  TradeRecord,
} from '../types/index.js';
import { DatabaseManager } from '../db/DatabaseManager.js';

/** Milliseconds per day */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Annualization factor for Sharpe ratio (assuming 365 trading days) */
const ANNUALIZATION_FACTOR = Math.sqrt(365);

/**
 * PerformanceTracker tracks PnL per phase and calculates rolling Sharpe Ratios
 * to enable performance-based allocation throttling.
 */
export class PerformanceTracker {
  private readonly config: PerformanceTrackerConfig;
  private readonly db: DatabaseManager | null;
  private dailyPnL: number = 0;

  constructor(config: PerformanceTrackerConfig, db?: DatabaseManager) {
    this.config = config;
    this.db = db ?? null;
  }

  /**
   * Record a trade for a phase with database persistence
   *
   * @param phaseId - The phase that executed the trade
   * @param pnl - Profit/loss in USD
   * @param timestamp - Unix timestamp in milliseconds
   * @param symbol - Optional trading symbol
   * @param side - Optional trade side (BUY/SELL)
   */
  async recordTrade(
    phaseId: PhaseId,
    pnl: number,
    timestamp: number,
    symbol?: string,
    side?: 'BUY' | 'SELL',
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database not configured for PerformanceTracker');
    }

    await this.db.query(
      `INSERT INTO phase_trades (phase_id, timestamp, pnl, symbol, side)
       VALUES ($1, $2, $3, $4, $5)`,
      [phaseId, timestamp, pnl, symbol ?? null, side ?? null],
    );

    // Update daily PnL (simple in-memory tracking)
     
    this.dailyPnL += pnl;
  }

  /**
   * Rebuild performance metrics from historical fills
   * Requirement: 3.0 - Rebuild capability
   */
  async rebuildFromHistory(phaseId: PhaseId): Promise<void> {
    if (!this.db) return;

    // Clear cache for this phase
    await this.db.query('DELETE FROM phase_performance_cache WHERE phase_id = $1', [phaseId]);

    // Recalculate from phase_trades
    // In a real scenario, we might need to query 'fills' table if 'phase_trades' isn't arguably the source of truth.
    // Assuming phase_trades is the log of trades allocated to a phase.
    const trades = await this.getTradesInWindow(phaseId, 365); // Rebuild last year
    if (trades.length === 0) return;

    // We can snapshot the current state as "latest"
    const pnlValues = trades.map((t) => t.pnl);
    const totalPnL = pnlValues.reduce((a, b) => a + b, 0);
    const sharpe = this.calculateSharpeRatio(pnlValues);

    // Persist rebuilt snapshot
    const performance = await this.getPhasePerformance(phaseId);
    await this.persistPerformanceSnapshot(phaseId);

    console.log(
      `[PerformanceTracker] Rebuilt history for ${phaseId}: PnL=${totalPnL}, Sharpe=${sharpe.toFixed(
        2,
      )}`,
    );
  }

  /**
   * Get current daily PnL (synchronous)
   */
  getCurrentDailyPnL(): number {
    return this.dailyPnL;
  }

  /**
   * Update phase performance (used during recovery)
   */
  updatePhasePerformance(_performance: PhasePerformance): void {
    // In-memory update or no-op since this class is primarily a DB wrapper.
    // However, if we track in-memory state, we should update it here.
    // Currently, we only track dailyPnL in memory.
    // If we wanted to "hydrate" dailyPnL from recover, we could do it here
    // but the PhasePerformance object is aggregate total PnL.
    // So we'll leave it as a no-op method to satisfy the interface for now,
    // or maybe log it.
  }

  /**
   * Get trade records for a phase within a time window
   *
   * @param phaseId - The phase to query
   * @param windowDays - Number of days to look back
   * @returns Array of trade records
   */
  async getTradesInWindow(phaseId: PhaseId, windowDays: number): Promise<TradeRecord[]> {
    if (!this.db) {
      return [];
    }

    const windowStart = Date.now() - windowDays * MS_PER_DAY;

    const result = await this.db.query<{
      id: number;
      phase_id: string;
      pnl: string;
      timestamp: string;
      symbol: string | null;
      side: string | null;
    }>(
      `SELECT id, phase_id, pnl, timestamp, symbol, side
       FROM phase_trades
       WHERE phase_id = $1 AND timestamp >= $2
       ORDER BY timestamp ASC`,
      [phaseId, windowStart],
    );

    return result.rows.map((row) => ({
      id: row.id,
      phaseId: row.phase_id as PhaseId,
      pnl: parseFloat(row.pnl),
      timestamp: parseInt(row.timestamp, 10),
      symbol: row.symbol ?? undefined,
      side: row.side as 'BUY' | 'SELL' | undefined,
    }));
  }

  /**
   * Get the number of trades for a phase within a time window
   *
   * @param phaseId - The phase to query
   * @param windowDays - Number of days to look back
   * @returns Number of trades
   */
  async getTradeCount(phaseId: PhaseId, windowDays: number): Promise<number> {
    if (!this.db) {
      return 0;
    }

    const windowStart = Date.now() - windowDays * MS_PER_DAY;

    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM phase_trades
       WHERE phase_id = $1 AND timestamp >= $2`,
      [phaseId, windowStart],
    );

    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Calculate the rolling Sharpe Ratio for a phase
   *
   * Sharpe Ratio = (Mean Return - Risk Free Rate) / Std Dev of Returns
   * We assume risk-free rate = 0 for simplicity
   *
   * @param phaseId - The phase to calculate for
   * @param windowDays - Rolling window in days (default: config.windowDays)
   * @returns Sharpe ratio (annualized), or 0 if insufficient data
   */
  async getSharpeRatio(phaseId: PhaseId, windowDays?: number): Promise<number> {
    const window = windowDays ?? this.config.windowDays;
    const trades = await this.getTradesInWindow(phaseId, window);

    return this.calculateSharpeRatio(trades.map((t) => t.pnl));
  }

  /**
   * Calculate Sharpe ratio from an array of PnL values
   * Pure function for testability
   *
   * @param pnlValues - Array of PnL values
   * @returns Annualized Sharpe ratio
   */
  calculateSharpeRatio(pnlValues: number[]): number {
    if (pnlValues.length < 2) {
      return 0;
    }

    const mean = this.calculateMean(pnlValues);
    const stdDev = this.calculateStdDev(pnlValues, mean);

    // Avoid division by zero
    if (stdDev === 0) {
      // If all returns are the same and positive, return a high Sharpe
      // If all returns are the same and negative, return a low Sharpe
      return mean > 0 ? 3.0 : mean < 0 ? -3.0 : 0;
    }

    // Daily Sharpe ratio
    const dailySharpe = mean / stdDev;

    // Annualize the Sharpe ratio
    return dailySharpe * ANNUALIZATION_FACTOR;
  }

  /**
   * Calculate mean of an array
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate standard deviation of an array
   */
  private calculateStdDev(values: number[], mean?: number): number {
    if (values.length < 2) return 0;
    const m = mean ?? this.calculateMean(values);
    const squaredDiffs = values.map((v) => Math.pow(v - m, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Get the performance modifier for a phase based on Sharpe ratio
   *
   * Modifier logic:
   * - Sharpe < malusThreshold (0): Apply malusMultiplier (0.5x)
   * - Sharpe > bonusThreshold (2.0): Apply bonusMultiplier (1.2x)
   * - Otherwise: 1.0x (no modification)
   * - Insufficient trades (< minTradeCount): 1.0x (no modification)
   *
   * @param phaseId - The phase to get modifier for
   * @returns Performance modifier between 0.5 and 1.2
   */
  async getPerformanceModifier(phaseId: PhaseId): Promise<number> {
    const tradeCount = await this.getTradeCount(phaseId, this.config.windowDays);

    // Requirement 2.8: Insufficient trade history uses base weight
    if (tradeCount < this.config.minTradeCount) {
      return 1.0;
    }

    const sharpeRatio = await this.getSharpeRatio(phaseId);

    return this.calculateModifier(sharpeRatio);
  }

  /**
   * Calculate modifier from Sharpe ratio
   * Pure function for testability
   *
   * @param sharpeRatio - The Sharpe ratio
   * @returns Modifier between malusMultiplier and bonusMultiplier
   */
  calculateModifier(sharpeRatio: number): number {
    // Requirement 2.3: Sharpe < 0 → malus penalty
    if (sharpeRatio < this.config.malusThreshold) {
      return this.config.malusMultiplier;
    }

    // Requirement 2.4: Sharpe > 2.0 → bonus multiplier
    if (sharpeRatio > this.config.bonusThreshold) {
      return this.config.bonusMultiplier;
    }

    // Normal performance: no modification
    return 1.0;
  }

  /**
   * Get full performance metrics for a phase
   *
   * @param phaseId - The phase to get metrics for
   * @returns PhasePerformance object with all metrics
   */
  async getPhasePerformance(phaseId: PhaseId): Promise<PhasePerformance> {
    const trades = await this.getTradesInWindow(phaseId, this.config.windowDays);
    const pnlValues = trades.map((t) => t.pnl);

    const totalPnL = pnlValues.reduce((sum, v) => sum + v, 0);
    const tradeCount = trades.length;

    const wins = pnlValues.filter((p) => p > 0);
    const losses = pnlValues.filter((p) => p < 0);

    const winRate = tradeCount > 0 ? wins.length / tradeCount : 0;
    const avgWin = wins.length > 0 ? this.calculateMean(wins) : 0;
    const avgLoss = losses.length > 0 ? Math.abs(this.calculateMean(losses)) : 0;

    const sharpeRatio = this.calculateSharpeRatio(pnlValues);
    const modifier =
      tradeCount >= this.config.minTradeCount ? this.calculateModifier(sharpeRatio) : 1.0;

    return {
      phaseId,
      sharpeRatio,
      totalPnL,
      tradeCount,
      winRate,
      avgWin,
      avgLoss,
      modifier,
    };
  }

  /**
   * Get performance metrics for all phases
   *
   * @returns Array of PhasePerformance for all phases
   */
  async getAllPhasePerformance(): Promise<PhasePerformance[]> {
    const phases: PhaseId[] = ['phase1', 'phase2', 'phase3'];
    return Promise.all(phases.map((p) => this.getPhasePerformance(p)));
  }

  /**
   * Persist performance metrics snapshot to database
   * Called periodically (every 24 hours per Requirement 2.6)
   *
   * @param phaseId - The phase to persist metrics for
   */
  async persistPerformanceSnapshot(phaseId: PhaseId): Promise<void> {
    if (!this.db) {
      throw new Error('Database not configured for PerformanceTracker');
    }

    const performance = await this.getPhasePerformance(phaseId);
    const timestamp = Date.now();

    await this.db.query(
      `INSERT INTO phase_performance_cache
       (phase_id, timestamp, pnl, trade_count, sharpe_ratio, modifier)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        phaseId,
        timestamp,
        performance.totalPnL,
        performance.tradeCount,
        performance.sharpeRatio,
        performance.modifier,
      ],
    );
  }

  /**
   * Get configuration
   */
  getConfig(): PerformanceTrackerConfig {
    return { ...this.config };
  }
}
