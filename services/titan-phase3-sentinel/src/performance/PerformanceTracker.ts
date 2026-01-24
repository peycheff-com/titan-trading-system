import type { PerformanceMetrics, Trade } from '../types/portfolio.js';

/**
 * Tracks trading performance and calculates metrics.
 */
export class PerformanceTracker {
  private trades: Trade[] = [];
  private initialCapital: number;
  private currentEquity: number;
  private highWaterMark: number;
  private maxDrawdown: number = 0;

  // For Sharpe (tracking simplified returns per trade)
  private returns: number[] = [];

  constructor(initialCapital: number) {
    this.initialCapital = initialCapital;
    this.currentEquity = initialCapital;
    this.highWaterMark = initialCapital;
  }

  recordTrade(trade: Trade): void {
    // eslint-disable-next-line functional/immutable-data
    this.trades.push(trade);

    // Deduct entry fees immediately
    // eslint-disable-next-line functional/immutable-data
    this.currentEquity -= trade.fees;
    this.updateRiskMetrics();
  }

  /**
   * Get active/open trades
   */
  getOpenPositions(): Trade[] {
    return this.trades.filter((t) => t.exitTime === 0);
  }

  /**
   * Close an active trade and realize PnL
   */
  closeTrade(tradeId: string, exitPrice: number, exitTime: number, exitBasis: number): void {
    const trade = this.trades.find((t) => t.id === tradeId);
    if (!trade) return;

    // eslint-disable-next-line functional/immutable-data
    trade.exitTime = exitTime;
    // eslint-disable-next-line functional/immutable-data
    trade.exitBasis = exitBasis;

    // Calculate PnL based on Strategy Type
    // eslint-disable-next-line functional/no-let
    let grossPnL = 0;

    if (trade.type === 'BASIS_SCALP') {
      // Profit from Basis Conversion (Entry - Exit)
      // Assuming EntryBasis was positive (Contango) and we are shorting the spread
      grossPnL = (trade.entryBasis - exitBasis) * trade.size;
    } else {
      // Standard Directional PnL (Simplified estimate if not basis)
      // We don't have direction stored explicitly in Trade struct in this version,
      // assuming Long for simplicity or would need to fetch from context.
      // Ideally Trade interface should have 'side'.
      // For now, defaulting to 0 for non-basis to avoid false metrics.
      grossPnL = 0;
    }

    const exitFees = trade.size * exitPrice * 0.0005; // 5 bps takers estimate
    // eslint-disable-next-line functional/immutable-data
    trade.fees += exitFees;
    // eslint-disable-next-line functional/immutable-data
    trade.realizedPnL = grossPnL;

    // Update Equity
    // eslint-disable-next-line functional/immutable-data
    this.currentEquity += grossPnL - exitFees;

    // Record Return % for Sharpe
    const tradeReturn = (grossPnL - trade.fees) / this.initialCapital;
    // eslint-disable-next-line functional/immutable-data
    this.returns.push(tradeReturn);

    this.updateRiskMetrics();
  }

  private updateRiskMetrics(): void {
    // Update HWM
    if (this.currentEquity > this.highWaterMark) {
      // eslint-disable-next-line functional/immutable-data
      this.highWaterMark = this.currentEquity;
    }

    // Update Max Drawdown
    const currentDrawdown = (this.highWaterMark - this.currentEquity) / this.highWaterMark;
    if (currentDrawdown > this.maxDrawdown) {
      // eslint-disable-next-line functional/immutable-data
      this.maxDrawdown = currentDrawdown;
    }
  }

  getMetrics(): PerformanceMetrics {
    const totalTrades = this.trades.filter((t) => t.exitTime > 0).length;
    // eslint-disable-next-line functional/no-let
    let winningTrades = 0;
    // eslint-disable-next-line functional/no-let
    let totalYield = 0;
    // eslint-disable-next-line functional/no-let
    let basisScalpPnL = 0;

    for (const t of this.trades) {
      if (t.exitTime === 0) continue; // Skip open positions for realized metrics

      const netPnL = t.realizedPnL - t.fees;
      if (netPnL > 0) winningTrades++;
      totalYield += netPnL;

      if (t.type === 'BASIS_SCALP') {
        basisScalpPnL += netPnL;
      }
    }

    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    // Sharpe Calcs
    // eslint-disable-next-line functional/no-let
    let sharpe = 0;
    if (this.returns.length > 1) {
      const meanReturn = this.returns.reduce((a, b) => a + b, 0) / this.returns.length;
      const variance =
        this.returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) /
        (this.returns.length - 1); // Sample variance
      const stdDev = Math.sqrt(variance);
      sharpe = stdDev > 0 ? meanReturn / stdDev : 0;
    }

    return {
      totalDeployed: this.trades
        .filter((t) => t.exitTime === 0)
        .reduce((sum, t) => sum + t.size * t.entryPrice, 0),
      avgFundingAPY: 0, // Needs funding rate history
      basisScalpingPnL24h: basisScalpPnL, // Simplified: All-time for now
      totalYield24h: totalYield,
      sharpeRatio: sharpe,
      maxDrawdown: this.maxDrawdown,
      winRate,
      totalTrades,
    };
  }

  generateReportJSON(): string {
    const metrics = this.getMetrics();
    const report = {
      timestamp: Date.now(),
      metrics,
      trades: this.trades,
      equity: this.currentEquity,
    };
    return JSON.stringify(report, null, 2);
  }
}
