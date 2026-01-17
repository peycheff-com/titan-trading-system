/**
 * RiskGuardian - Monitors portfolio-level risk metrics and enforces correlation guards
 * Validates signals against leverage limits and correlation constraints
 *
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7
 */

import {
  EquityTier,
  IntentSignal,
  Position,
  RiskDecision,
  RiskGuardianConfig,
  RiskMetrics,
} from "../types/index.js";
import { AllocationEngine } from "./AllocationEngine.js";

/**
 * Interface for high correlation notification callback
 */
export interface HighCorrelationNotifier {
  sendHighCorrelationWarning(
    correlationScore: number,
    threshold: number,
    affectedPositions: string[],
  ): Promise<void>;
}

/**
 * Price history entry for correlation calculation
 */
export interface PriceHistoryEntry {
  symbol: string;
  timestamp: number;
  price: number;
}

/**
 * Correlation matrix cache entry
 */
interface CorrelationCacheEntry {
  correlation: number;
  timestamp: number;
}

/**
 * RiskGuardian monitors portfolio-level risk metrics and enforces
 * correlation guards and leverage limits on incoming signals.
 */
export class RiskGuardian {
  private readonly config: RiskGuardianConfig;
  private readonly allocationEngine: AllocationEngine;

  /** Price history for correlation calculations */
  private priceHistory: Map<string, PriceHistoryEntry[]> = new Map();

  /** Cached correlation matrix */
  private correlationCache: Map<string, CorrelationCacheEntry> = new Map();

  /** Cached portfolio beta */
  private portfolioBetaCache: { value: number; timestamp: number } | null =
    null;

  /** Current equity for leverage calculations */
  private currentEquity: number = 0;

  /** High correlation notifier */
  private correlationNotifier: HighCorrelationNotifier | null = null;

  constructor(config: RiskGuardianConfig, allocationEngine: AllocationEngine) {
    this.config = config;
    this.allocationEngine = allocationEngine;
  }

  /**
   * Set the high correlation notifier
   */
  setCorrelationNotifier(notifier: HighCorrelationNotifier): void {
    this.correlationNotifier = notifier;
  }

  /**
   * Set current equity for leverage calculations
   * @param equity - Current account equity in USD
   */
  setEquity(equity: number): void {
    this.currentEquity = Math.max(0, equity);
  }

  /**
   * Get current equity
   */
  getEquity(): number {
    return this.currentEquity;
  }

  /**
   * Check a signal against risk rules
   *
   * Validation steps:
   * 1. Check if Phase 3 hedge that reduces delta (auto-approve)
   * 2. Calculate projected leverage
   * 3. Check leverage cap for equity tier
   * 4. Check correlation with existing positions
   * 5. Apply size reduction if high correlation
   *
   * @param signal - Intent signal from a phase
   * @param currentPositions - Array of current open positions
   * @returns RiskDecision with approval status and metrics
   */
  checkSignal(
    signal: IntentSignal,
    currentPositions: Position[],
  ): RiskDecision {
    const currentLeverage = this.calculateCombinedLeverage(currentPositions);
    const portfolioDelta = this.calculatePortfolioDelta(currentPositions);
    const portfolioBeta = this.getPortfolioBeta(currentPositions);

    // Calculate projected leverage if signal is executed
    const projectedLeverage = this.calculateProjectedLeverage(
      signal,
      currentPositions,
    );

    // Calculate correlation with existing positions
    const maxCorrelation = this.calculateMaxCorrelationWithPositions(
      signal,
      currentPositions,
    );

    const riskMetrics: RiskMetrics = {
      currentLeverage,
      projectedLeverage,
      correlation: maxCorrelation,
      portfolioDelta,
      portfolioBeta,
    };

    // Requirement 3.5: Phase 3 hedge auto-approval
    if (this.isPhase3HedgeThatReducesDelta(signal, portfolioDelta)) {
      return {
        approved: true,
        reason: "Phase 3 hedge approved: reduces global delta",
        adjustedSize: signal.requestedSize,
        riskMetrics,
      };
    }

    // Requirement 3.8: Check minimum stop distance
    if (signal.stopLossPrice) {
      const volatility = signal.volatility ??
        this.calculateVolatility(signal.symbol);
      const entryPrice = this.getSignalPrice(signal); // Helper to get price
      const stopDistance = Math.abs(entryPrice - signal.stopLossPrice);
      const minDistance = volatility * this.config.minStopDistanceMultiplier;

      if (stopDistance < minDistance) {
        return {
          approved: false,
          reason: `Stop distance too tight: ${stopDistance.toFixed(2)} < ${
            minDistance.toFixed(2)
          } (${this.config.minStopDistanceMultiplier}x ATR)`,
          riskMetrics,
        };
      }
    }

    // Requirement 3.3: Check leverage cap
    const maxLeverage = this.allocationEngine.getMaxLeverage(
      this.currentEquity,
    );
    if (projectedLeverage > maxLeverage) {
      return {
        approved: false,
        reason: `Leverage cap exceeded: projected ${
          projectedLeverage.toFixed(2)
        }x > max ${maxLeverage}x`,
        riskMetrics,
      };
    }

    // Requirement 3.7: High correlation check
    if (maxCorrelation > this.config.maxCorrelation) {
      // Send high correlation warning notification
      if (this.correlationNotifier) {
        const affectedPositions = this.getCorrelatedPositions(
          signal,
          currentPositions,
        );
        this.correlationNotifier.sendHighCorrelationWarning(
          maxCorrelation,
          this.config.maxCorrelation,
          affectedPositions,
        ).catch((error) => {
          console.error("Failed to send high correlation warning:", error);
        });
      }

      // Check if same direction as correlated position
      const hasCorrelatedSameDirection = this
        .hasCorrelatedSameDirectionPosition(
          signal,
          currentPositions,
        );

      if (hasCorrelatedSameDirection) {
        // Apply 50% size reduction
        const adjustedSize = signal.requestedSize *
          (1 - this.config.correlationPenalty);
        return {
          approved: true,
          reason: `High correlation (${
            maxCorrelation.toFixed(2)
          }) with same direction: size reduced by ${
            this.config.correlationPenalty * 100
          }%`,
          adjustedSize,
          riskMetrics,
        };
      }
    }

    // Requirement 3.8: Minimum Viable Stop Distance (Dynamic)
    if (signal.entryPrice && signal.stopLossPrice) {
      const volatility = this.calculateVolatility(signal.symbol);
      const stopDistance = Math.abs(signal.entryPrice - signal.stopLossPrice) /
        signal.entryPrice;
      const minStopDistance = volatility * 1.5; // at least 1.5x volatility (ATR%)

      if (stopDistance < minStopDistance) {
        return {
          approved: false,
          reason: `Stop distance too tight: ${stopDistance.toFixed(4)} < ${
            minStopDistance.toFixed(4)
          } (1.5x Vol)`,
          riskMetrics,
        };
      }
    }

    // Signal approved without modification
    return {
      approved: true,
      reason: "Signal approved: within risk limits",
      adjustedSize: signal.requestedSize,
      riskMetrics,
    };
  }

  /**
   * Calculate portfolio delta (net directional exposure)
   * Positive = net long, Negative = net short
   *
   * @param positions - Array of current positions
   * @returns Net delta in USD
   */
  calculatePortfolioDelta(positions: Position[]): number {
    return positions.reduce((delta, pos) => {
      const positionDelta = pos.side === "LONG" ? pos.size : -pos.size;
      return delta + positionDelta;
    }, 0);
  }

  /**
   * Calculate combined leverage across all positions
   * Combined Leverage = Total Notional / Equity
   *
   * @param positions - Array of current positions
   * @returns Combined leverage ratio
   */
  calculateCombinedLeverage(positions: Position[]): number {
    if (this.currentEquity <= 0) {
      return 0;
    }

    const totalNotional = positions.reduce((sum, pos) => sum + pos.size, 0);
    return totalNotional / this.currentEquity;
  }

  /**
   * Calculate projected leverage if a signal is executed
   *
   * @param signal - Intent signal to evaluate
   * @param currentPositions - Current open positions
   * @returns Projected leverage ratio
   */
  private calculateProjectedLeverage(
    signal: IntentSignal,
    currentPositions: Position[],
  ): number {
    if (this.currentEquity <= 0) {
      return 0;
    }

    // Check if signal is for an existing position (same symbol)
    const existingPosition = currentPositions.find(
      (p) => p.symbol === signal.symbol,
    );

    let projectedNotional: number;

    if (existingPosition) {
      // If same direction, add to position
      // If opposite direction, reduce or flip position
      const existingSide = existingPosition.side === "LONG" ? "BUY" : "SELL";

      if (signal.side === existingSide) {
        // Adding to position
        projectedNotional = currentPositions.reduce((sum, pos) => {
          if (pos.symbol === signal.symbol) {
            return sum + pos.size + signal.requestedSize;
          }
          return sum + pos.size;
        }, 0);
      } else {
        // Reducing or flipping position
        const netSize = Math.abs(existingPosition.size - signal.requestedSize);
        projectedNotional = currentPositions.reduce((sum, pos) => {
          if (pos.symbol === signal.symbol) {
            return sum + netSize;
          }
          return sum + pos.size;
        }, 0);
      }
    } else {
      // New position
      projectedNotional = currentPositions.reduce((sum, pos) =>
        sum + pos.size, 0) +
        signal.requestedSize;
    }

    return projectedNotional / this.currentEquity;
  }

  /**
   * Calculate correlation between two assets using price history
   * Uses Pearson correlation coefficient
   *
   * @param assetA - First asset symbol
   * @param assetB - Second asset symbol
   * @returns Correlation coefficient (-1 to 1)
   */
  calculateCorrelation(assetA: string, assetB: string): number {
    // Check cache first
    const cacheKey = this.getCorrelationCacheKey(assetA, assetB);
    const cached = this.correlationCache.get(cacheKey);

    if (
      cached &&
      Date.now() - cached.timestamp < this.config.correlationUpdateInterval
    ) {
      return cached.correlation;
    }

    const historyA = this.priceHistory.get(assetA) ?? [];
    const historyB = this.priceHistory.get(assetB) ?? [];

    if (historyA.length < 2 || historyB.length < 2) {
      // Insufficient data - assume moderate correlation
      return 0.5;
    }

    // Align timestamps and calculate returns
    const returnsA = this.calculateReturns(historyA);
    const returnsB = this.calculateReturns(historyB);

    // Need at least 2 data points for correlation
    const minLength = Math.min(returnsA.length, returnsB.length);
    if (minLength < 2) {
      return 0.5;
    }

    // Use the most recent aligned data
    const alignedA = returnsA.slice(-minLength);
    const alignedB = returnsB.slice(-minLength);

    const correlation = this.pearsonCorrelation(alignedA, alignedB);

    // Cache the result
    this.correlationCache.set(cacheKey, {
      correlation,
      timestamp: Date.now(),
    });

    return correlation;
  }

  /**
   * Get portfolio beta (correlation to BTC)
   * Beta measures how the portfolio moves relative to BTC
   *
   * @param positions - Current positions
   * @returns Portfolio beta coefficient
   */
  getPortfolioBeta(positions: Position[]): number {
    // Check cache
    if (
      this.portfolioBetaCache &&
      Date.now() - this.portfolioBetaCache.timestamp <
        this.config.betaUpdateInterval
    ) {
      return this.portfolioBetaCache.value;
    }

    if (positions.length === 0) {
      return 0;
    }

    const totalNotional = positions.reduce((sum, pos) => sum + pos.size, 0);
    if (totalNotional === 0) {
      return 0;
    }

    // Calculate weighted average beta
    let weightedBeta = 0;
    for (const pos of positions) {
      const weight = pos.size / totalNotional;
      const assetBeta = this.calculateCorrelation(pos.symbol, "BTCUSDT");
      // Adjust for position direction
      const directionMultiplier = pos.side === "LONG" ? 1 : -1;
      weightedBeta += weight * assetBeta * directionMultiplier;
    }

    // Cache the result
    this.portfolioBetaCache = {
      value: weightedBeta,
      timestamp: Date.now(),
    };

    return weightedBeta;
  }

  /**
   * Update price history for an asset
   *
   * @param symbol - Asset symbol
   * @param price - Current price
   * @param timestamp - Price timestamp
   */
  updatePriceHistory(symbol: string, price: number, timestamp?: number): void {
    const entry: PriceHistoryEntry = {
      symbol,
      price,
      timestamp: timestamp ?? Date.now(),
    };

    const history = this.priceHistory.get(symbol) ?? [];
    history.push(entry);

    // Keep only last 100 entries (for correlation calculation)
    if (history.length > 100) {
      history.shift();
    }

    this.priceHistory.set(symbol, history);
  }

  /**
   * Clear correlation cache (for testing or forced recalculation)
   */
  clearCorrelationCache(): void {
    this.correlationCache.clear();
    this.portfolioBetaCache = null;
  }

  /**
   * Get current risk metrics snapshot
   *
   * @param positions - Current positions
   * @returns RiskMetrics object
   */
  getRiskMetrics(positions: Position[]): RiskMetrics {
    return {
      currentLeverage: this.calculateCombinedLeverage(positions),
      projectedLeverage: this.calculateCombinedLeverage(positions),
      correlation: this.getMaxCorrelationAcrossPositions(positions),
      portfolioDelta: this.calculatePortfolioDelta(positions),
      portfolioBeta: this.getPortfolioBeta(positions),
    };
  }

  /**
   * Get configuration
   */
  getConfig(): RiskGuardianConfig {
    return { ...this.config };
  }

  // ============ Private Helper Methods ============

  /**
   * Check if signal is a Phase 3 hedge that reduces global delta
   */
  private isPhase3HedgeThatReducesDelta(
    signal: IntentSignal,
    currentDelta: number,
  ): boolean {
    if (signal.phaseId !== "phase3") {
      return false;
    }

    // Determine if signal reduces delta
    const signalDelta = signal.side === "BUY"
      ? signal.requestedSize
      : -signal.requestedSize;
    const newDelta = currentDelta + signalDelta;

    // Signal reduces delta if it moves closer to zero
    return Math.abs(newDelta) < Math.abs(currentDelta);
  }

  /**
   * Calculate maximum correlation between signal and existing positions
   */
  private calculateMaxCorrelationWithPositions(
    signal: IntentSignal,
    positions: Position[],
  ): number {
    if (positions.length === 0) {
      return 0;
    }

    let maxCorrelation = 0;
    for (const pos of positions) {
      if (pos.symbol !== signal.symbol) {
        const correlation = Math.abs(
          this.calculateCorrelation(signal.symbol, pos.symbol),
        );
        maxCorrelation = Math.max(maxCorrelation, correlation);
      }
    }

    // If same symbol exists, correlation is 1.0
    const sameSymbolExists = positions.some((p) => p.symbol === signal.symbol);
    if (sameSymbolExists) {
      maxCorrelation = 1.0;
    }

    return maxCorrelation;
  }

  /**
   * Check if there's a highly correlated position in the same direction
   */
  private hasCorrelatedSameDirectionPosition(
    signal: IntentSignal,
    positions: Position[],
  ): boolean {
    const signalDirection = signal.side === "BUY" ? "LONG" : "SHORT";

    for (const pos of positions) {
      // Same symbol, same direction
      if (pos.symbol === signal.symbol && pos.side === signalDirection) {
        return true;
      }

      // Different symbol but high correlation and same direction
      if (pos.symbol !== signal.symbol && pos.side === signalDirection) {
        const correlation = Math.abs(
          this.calculateCorrelation(signal.symbol, pos.symbol),
        );
        if (correlation > this.config.maxCorrelation) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get maximum correlation across all position pairs
   */
  private getMaxCorrelationAcrossPositions(positions: Position[]): number {
    if (positions.length < 2) {
      return 0;
    }

    let maxCorrelation = 0;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const correlation = Math.abs(
          this.calculateCorrelation(positions[i].symbol, positions[j].symbol),
        );
        maxCorrelation = Math.max(maxCorrelation, correlation);
      }
    }

    return maxCorrelation;
  }

  /**
   * Calculate returns from price history
   */
  private calculateReturns(history: PriceHistoryEntry[]): number[] {
    if (history.length < 2) {
      return [];
    }

    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const prevPrice = history[i - 1].price;
      const currPrice = history[i].price;
      if (prevPrice > 0) {
        returns.push((currPrice - prevPrice) / prevPrice);
      }
    }

    return returns;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) {
      return 0;
    }

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    if (denominator === 0) {
      return 0;
    }

    return numerator / denominator;
  }

  /**
   * Generate cache key for correlation pair
   */
  private getCorrelationCacheKey(assetA: string, assetB: string): string {
    // Sort to ensure consistent key regardless of order
    const sorted = [assetA, assetB].sort();
    return `${sorted[0]}:${sorted[1]}`;
  }

  /**
   * Get list of positions that are correlated with the signal
   */
  private getCorrelatedPositions(
    signal: IntentSignal,
    positions: Position[],
  ): string[] {
    const correlatedPositions: string[] = [];

    for (const pos of positions) {
      if (pos.symbol === signal.symbol) {
        correlatedPositions.push(pos.symbol);
      } else {
        const correlation = Math.abs(
          this.calculateCorrelation(signal.symbol, pos.symbol),
        );
        if (correlation > this.config.maxCorrelation) {
          correlatedPositions.push(pos.symbol);
        }
      }
    }

    return correlatedPositions;
  }

  /**
   * Calculate Volatility (ATR-like or Standard Deviation) from price history
   * Using Simple Standard Deviation of returns for now as a proxy for volatility
   * if true ATR is not available.
   */
  private calculateVolatility(symbol: string): number {
    const history = this.priceHistory.get(symbol) ?? [];
    if (history.length < 10) {
      // Fallback if not enough data: assume 1% volatility of last price
      const lastPrice = history[history.length - 1]?.price ?? 1000;
      return lastPrice * 0.01;
    }

    const returns = this.calculateReturns(history);
    if (returns.length === 0) return 0;

    // Calculate Standard Deviation of returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualize or scale to price?
    // We want price-based volatility (e.g. $50 move).
    // StdDev is percentage. So Volatility = Price * StdDev
    const lastPrice = history[history.length - 1].price;
    return lastPrice * stdDev;
  }

  /**
   * Get estimated entry price from signal
   */
  private getSignalPrice(signal: IntentSignal): number {
    // IntentSignal doesn't have price, but we have priceHistory or we can infer
    // If signal.stopLossPrice is used, we need relative price.
    // Use last known price from history.
    const history = this.priceHistory.get(signal.symbol);
    if (history && history.length > 0) {
      return history[history.length - 1].price;
    }
    // Fallback?
    return signal.stopLossPrice
      ? (signal.side === "BUY"
        ? signal.stopLossPrice * 1.01
        : signal.stopLossPrice * 0.99)
      : 0;
  }
}
