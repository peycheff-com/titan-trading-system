/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * OptimizedQueries - Optimized database queries with caching
 * Provides efficient queries for frequently accessed data
 *
 * Requirements: 2.2, 9.1
 */

import { DatabaseManager } from './DatabaseManager.js';
import { CacheManager, CacheNamespace } from '../cache/CacheManager.js';
import { PhaseId, PhasePerformance, RiskSnapshot, BrainDecision } from '../types/index.js';

/** Milliseconds per day */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Annualization factor for Sharpe ratio */
const ANNUALIZATION_FACTOR = Math.sqrt(365);

/**
 * Sharpe ratio calculation result from database
 */
interface SharpeCalcResult {
  avg_pnl: string;
  stddev_pnl: string;
  trade_count: string;
}

/**
 * Trade PnL row
 */
interface TradePnlRow {
  pnl: string;
}

/**
 * Recent decision row
 */
interface RecentDecisionRow {
  signal_id: string;
  phase_id: string;
  timestamp: string;
  approved: boolean;
  requested_size: string;
  authorized_size: string | null;
  reason: string;
  risk_metrics: unknown;
}

/**
 * Risk snapshot row
 */
interface RiskSnapshotRow {
  timestamp: string;
  global_leverage: string;
  net_delta: string;
  correlation_score: string;
  portfolio_beta: string;
  var_95: string;
}

/**
 * OptimizedQueries provides cached and optimized database queries
 */
export class OptimizedQueries {
  private readonly db: DatabaseManager;
  private readonly cache: CacheManager;

  constructor(db: DatabaseManager, cache: CacheManager) {
    this.db = db;
    this.cache = cache;
  }

  /**
   * Calculate Sharpe ratio using optimized database query
   * Uses database aggregation instead of fetching all rows
   *
   * @param phaseId - Phase to calculate for
   * @param windowDays - Rolling window in days
   * @returns Annualized Sharpe ratio
   */
  async calculateSharpeRatioOptimized(phaseId: PhaseId, windowDays: number): Promise<number> {
    const cacheKey = `sharpe_opt:${phaseId}:${windowDays}`;

    const cached = await this.cache.get<number>(CacheNamespace.QUERY, cacheKey);
    if (cached.success && cached.value !== undefined) {
      return cached.value;
    }

    const windowStart = Date.now() - windowDays * MS_PER_DAY;

    // Use database aggregation for efficiency
    const result = await this.db.queryOne<SharpeCalcResult>(
      `
      SELECT 
        AVG(pnl) as avg_pnl,
        STDDEV_SAMP(pnl) as stddev_pnl,
        COUNT(*) as trade_count
      FROM phase_trades
      WHERE phase_id = $1 AND timestamp >= $2
    `,
      [phaseId, windowStart],
    );

    if (!result || parseInt(result.trade_count) < 2) {
      this.cache.set(CacheNamespace.QUERY, cacheKey, 0);
      return 0;
    }

    const avgPnl = parseFloat(result.avg_pnl);
    const stddevPnl = parseFloat(result.stddev_pnl);

    if (stddevPnl === 0 || isNaN(stddevPnl)) {
      const sharpe = avgPnl > 0 ? 3.0 : avgPnl < 0 ? -3.0 : 0;
      this.cache.set(CacheNamespace.QUERY, cacheKey, sharpe);
      return sharpe;
    }

    const dailySharpe = avgPnl / stddevPnl;
    const annualizedSharpe = dailySharpe * ANNUALIZATION_FACTOR;

    this.cache.set(CacheNamespace.QUERY, cacheKey, annualizedSharpe);
    return annualizedSharpe;
  }

  /**
   * Get trade count using optimized query with caching
   */
  async getTradeCountOptimized(phaseId: PhaseId, windowDays: number): Promise<number> {
    const cacheKey = `trade_count:${phaseId}:${windowDays}`;

    const cached = await this.cache.get<number>(CacheNamespace.QUERY, cacheKey);
    if (cached.success && cached.value !== undefined) {
      return cached.value;
    }

    const windowStart = Date.now() - windowDays * MS_PER_DAY;

    const result = await this.db.queryOne<{ count: string }>(
      `
      SELECT COUNT(*) as count
      FROM phase_trades
      WHERE phase_id = $1 AND timestamp >= $2
    `,
      [phaseId, windowStart],
    );

    const count = parseInt(result?.count ?? '0');
    this.cache.set(CacheNamespace.QUERY, cacheKey, count);
    return count;
  }

  /**
   * Get recent decisions with optimized query
   */
  async getRecentDecisions(limit: number = 10): Promise<BrainDecision[]> {
    const cacheKey = `recent_decisions:${limit}`;

    const cached = await this.cache.get<BrainDecision[]>(CacheNamespace.QUERY, cacheKey);
    if (cached.success && cached.value !== undefined) {
      return cached.value;
    }

    const rows = await this.db.queryAll<RecentDecisionRow>(
      `
      SELECT signal_id, phase_id, timestamp, approved, 
             requested_size, authorized_size, reason, risk_metrics
      FROM brain_decisions
      ORDER BY timestamp DESC
      LIMIT $1
    `,
      [limit],
    );

    const decisions: BrainDecision[] = rows.map((row) => ({
      signalId: row.signal_id,
      approved: row.approved,
      authorizedSize: row.authorized_size ? parseFloat(row.authorized_size) : 0,
      reason: row.reason,
      timestamp: parseInt(row.timestamp),
      allocation: { w1: 0, w2: 0, w3: 0, timestamp: parseInt(row.timestamp) },
      performance: {
        phaseId: row.phase_id as PhaseId,
        sharpeRatio: 0,
        totalPnL: 0,
        tradeCount: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        modifier: 1,
      },
      risk: {
        approved: row.approved,
        reason: row.reason,
        riskMetrics: (row.risk_metrics as any) ?? {
          currentLeverage: 0,
          projectedLeverage: 0,
          correlation: 0,
          portfolioDelta: 0,
          portfolioBeta: 0,
        },
      },
    }));

    this.cache.set(CacheNamespace.QUERY, cacheKey, decisions);
    return decisions;
  }

  /**
   * Get latest risk snapshot with caching
   */
  async getLatestRiskSnapshot(): Promise<RiskSnapshot | null> {
    const cacheKey = 'latest_risk_snapshot';

    const cached = await this.cache.get<RiskSnapshot | null>(CacheNamespace.QUERY, cacheKey);
    if (cached.success && cached.value !== undefined) {
      return cached.value;
    }

    const row = await this.db.queryOne<RiskSnapshotRow>(`
      SELECT timestamp, global_leverage, net_delta, 
             correlation_score, portfolio_beta, var_95
      FROM risk_snapshots
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    if (!row) {
      this.cache.set(CacheNamespace.QUERY, cacheKey, null);
      return null;
    }

    const snapshot: RiskSnapshot = {
      timestamp: parseInt(row.timestamp),
      globalLeverage: parseFloat(row.global_leverage),
      netDelta: parseFloat(row.net_delta),
      correlationScore: parseFloat(row.correlation_score),
      portfolioBeta: parseFloat(row.portfolio_beta),
      var95: parseFloat(row.var_95),
    };

    this.cache.set(CacheNamespace.QUERY, cacheKey, snapshot);
    return snapshot;
  }

  /**
   * Get phase performance summary with optimized aggregation
   */
  async getPhasePerformanceSummary(
    phaseId: PhaseId,
    windowDays: number,
  ): Promise<PhasePerformance> {
    const cacheKey = `perf_summary:${phaseId}:${windowDays}`;

    const cached = await this.cache.get<PhasePerformance>(CacheNamespace.QUERY, cacheKey);
    if (cached.success && cached.value !== undefined) {
      return cached.value;
    }

    const windowStart = Date.now() - windowDays * MS_PER_DAY;

    // Single query to get all metrics
    const result = await this.db.queryOne<{
      total_pnl: string;
      trade_count: string;
      win_count: string;
      avg_win: string;
      avg_loss: string;
      avg_pnl: string;
      stddev_pnl: string;
    }>(
      `
      SELECT 
        COALESCE(SUM(pnl), 0) as total_pnl,
        COUNT(*) as trade_count,
        COUNT(*) FILTER (WHERE pnl > 0) as win_count,
        COALESCE(AVG(pnl) FILTER (WHERE pnl > 0), 0) as avg_win,
        COALESCE(ABS(AVG(pnl) FILTER (WHERE pnl < 0)), 0) as avg_loss,
        AVG(pnl) as avg_pnl,
        STDDEV_SAMP(pnl) as stddev_pnl
      FROM phase_trades
      WHERE phase_id = $1 AND timestamp >= $2
    `,
      [phaseId, windowStart],
    );

    const tradeCount = parseInt(result?.trade_count ?? '0');
    const winCount = parseInt(result?.win_count ?? '0');
    const totalPnL = parseFloat(result?.total_pnl ?? '0');
    const avgWin = parseFloat(result?.avg_win ?? '0');
    const avgLoss = parseFloat(result?.avg_loss ?? '0');
    const avgPnl = parseFloat(result?.avg_pnl ?? '0');
    const stddevPnl = parseFloat(result?.stddev_pnl ?? '0');

    const winRate = tradeCount > 0 ? winCount / tradeCount : 0;

    // Calculate Sharpe ratio

    let sharpeRatio = 0;
    if (tradeCount >= 2 && stddevPnl > 0 && !isNaN(stddevPnl)) {
      sharpeRatio = (avgPnl / stddevPnl) * ANNUALIZATION_FACTOR;
    } else if (tradeCount >= 2) {
      sharpeRatio = avgPnl > 0 ? 3.0 : avgPnl < 0 ? -3.0 : 0;
    }

    // Calculate modifier

    let modifier = 1.0;
    if (tradeCount >= 10) {
      if (sharpeRatio < 0) {
        modifier = 0.5;
      } else if (sharpeRatio > 2.0) {
        modifier = 1.2;
      }
    }

    const performance: PhasePerformance = {
      phaseId,
      sharpeRatio,
      totalPnL,
      tradeCount,
      winRate,
      avgWin,
      avgLoss,
      modifier,
    };

    this.cache.set(CacheNamespace.QUERY, cacheKey, performance);
    return performance;
  }

  /**
   * Batch get PnL values for multiple phases
   * More efficient than individual queries
   */
  async getBatchPnLValues(
    phaseIds: PhaseId[],
    windowDays: number,
  ): Promise<Map<PhaseId, number[]>> {
    const windowStart = Date.now() - windowDays * MS_PER_DAY;

    const rows = await this.db.queryAll<TradePnlRow & { phase_id: string }>(
      `
      SELECT phase_id, pnl
      FROM phase_trades
      WHERE phase_id = ANY($1) AND timestamp >= $2
      ORDER BY phase_id, timestamp ASC
    `,
      [phaseIds, windowStart],
    );

    const result = new Map<PhaseId, number[]>();
    for (const phaseId of phaseIds) {
      result.set(phaseId, []);
    }

    for (const row of rows) {
      const phaseId = row.phase_id as PhaseId;
      const pnlArray = result.get(phaseId);
      if (pnlArray) {
        pnlArray.push(parseFloat(row.pnl));
      }
    }

    return result;
  }

  /**
   * Invalidate query cache for a phase
   */
  invalidatePhaseCache(phaseId: PhaseId): void {
    this.cache.invalidatePattern(CacheNamespace.QUERY, `*${phaseId}*`);
    this.cache.delete(CacheNamespace.QUERY, 'recent_decisions:*');
  }

  /**
   * Invalidate all query cache
   */
  invalidateAllCache(): void {
    this.cache.invalidateNamespace(CacheNamespace.QUERY);
  }
}
