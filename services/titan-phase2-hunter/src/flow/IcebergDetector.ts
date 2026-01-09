/**
 * IcebergDetector - Iceberg Order Detection System
 * 
 * Purpose: Detect hidden liquidity (iceberg orders) by measuring
 * how quickly liquidity refills at specific price levels.
 * 
 * Key Features:
 * - Build liquidity refill rate measurement
 * - Implement iceberg density calculation
 * - Real-time monitoring for Order Block liquidity changes
 * 
 * Requirements: 2.3, 2.4 (Iceberg Detection and Order Block monitoring)
 */

import { EventEmitter } from 'events';
import { IcebergAnalysis } from '../types/enhanced-2026';
import { CVDTrade } from '../types';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuration for iceberg detection
 */
export interface IcebergDetectorConfig {
  /** Time window for refill rate calculation (ms) */
  refillWindow: number;
  /** Minimum refill count to consider iceberg */
  minRefillCount: number;
  /** Minimum refill rate (volume/second) for iceberg classification */
  minRefillRate: number;
  /** Density threshold for iceberg classification (0-100) */
  densityThreshold: number;
  /** Price level granularity (tick size) */
  tickSize: number;
  /** Maximum age for liquidity data (ms) */
  maxDataAge: number;
}

/**
 * Liquidity level tracking data
 */
export interface LiquidityLevel {
  priceLevel: number;
  currentLiquidity: number;
  peakLiquidity: number;
  consumptions: LiquidityConsumption[];
  refills: LiquidityRefill[];
  lastUpdate: number;
}

/**
 * Liquidity consumption event
 */
export interface LiquidityConsumption {
  timestamp: number;
  volumeConsumed: number;
  remainingLiquidity: number;
}

/**
 * Liquidity refill event
 */
export interface LiquidityRefill {
  timestamp: number;
  volumeRefilled: number;
  newLiquidity: number;
  timeSinceConsumption: number;
}

/**
 * Order Block liquidity monitoring result
 */
export interface OrderBlockLiquidityResult {
  priceLevel: number;
  icebergAnalysis: IcebergAnalysis;
  liquidityHealth: 'strong' | 'weakening' | 'depleted';
  recommendation: 'valid' | 'caution' | 'invalid';
  reasoning: string;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: IcebergDetectorConfig = {
  refillWindow: 5000, // 5 seconds
  minRefillCount: 3,
  minRefillRate: 100, // $100/second
  densityThreshold: 60, // 60% density threshold
  tickSize: 0.01,
  maxDataAge: 300000 // 5 minutes
};

// ============================================================================
// ICEBERG DETECTOR CLASS
// ============================================================================

/**
 * IcebergDetector - Identifies hidden liquidity through refill patterns
 * 
 * Iceberg orders are large orders that are partially hidden, showing only
 * a small portion at a time. They can be detected by measuring how quickly
 * liquidity refills after being consumed.
 */
export class IcebergDetector extends EventEmitter {
  private config: IcebergDetectorConfig;
  private liquidityLevels: Map<string, Map<number, LiquidityLevel>> = new Map();
  private analysisCache: Map<string, IcebergAnalysis[]> = new Map();
  private readonly MAX_CACHE_SIZE = 100;

  constructor(config: Partial<IcebergDetectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // LIQUIDITY REFILL RATE MEASUREMENT
  // ============================================================================

  /**
   * Measure liquidity refill rate at a price level
   * Requirement 2.3: Build liquidity refill rate measurement
   */
  measureRefillRate(
    symbol: string,
    priceLevel: number,
    trades: CVDTrade[]
  ): number {
    const tickSize = this.calculateTickSize(priceLevel);
    const roundedLevel = this.roundToTick(priceLevel, tickSize);

    // Get or create liquidity level tracking
    const level = this.getOrCreateLiquidityLevel(symbol, roundedLevel);

    // Analyze trades at this level
    const levelTrades = trades.filter(t => 
      Math.abs(this.roundToTick(t.price, tickSize) - roundedLevel) < tickSize
    );

    if (levelTrades.length === 0) return 0;

    // Track consumption and refill events
    let lastConsumptionTime = 0;
    let consumedVolume = 0;

    for (const trade of levelTrades.sort((a, b) => a.time - b.time)) {
      const volume = trade.qty * trade.price;

      // Detect consumption (aggressive orders hitting the level)
      if (trade.isBuyerMaker) {
        // Sell order consumed buy liquidity
        consumedVolume += volume;
        lastConsumptionTime = trade.time;

        level.consumptions.push({
          timestamp: trade.time,
          volumeConsumed: volume,
          remainingLiquidity: Math.max(0, level.currentLiquidity - volume)
        });

        level.currentLiquidity = Math.max(0, level.currentLiquidity - volume);
      } else {
        // Buy order - check if this is a refill
        if (lastConsumptionTime > 0 && trade.time - lastConsumptionTime < this.config.refillWindow) {
          const timeSinceConsumption = trade.time - lastConsumptionTime;

          level.refills.push({
            timestamp: trade.time,
            volumeRefilled: volume,
            newLiquidity: level.currentLiquidity + volume,
            timeSinceConsumption
          });

          level.currentLiquidity += volume;
        }
      }
    }

    // Calculate refill rate (volume per second)
    const recentRefills = level.refills.filter(r => 
      r.timestamp > Date.now() - this.config.refillWindow
    );

    if (recentRefills.length === 0) return 0;

    const totalRefillVolume = recentRefills.reduce((sum, r) => sum + r.volumeRefilled, 0);
    const timeSpan = (recentRefills[recentRefills.length - 1].timestamp - recentRefills[0].timestamp) || 1;
    const refillRate = (totalRefillVolume / timeSpan) * 1000; // Per second

    level.lastUpdate = Date.now();

    return refillRate;
  }

  // ============================================================================
  // ICEBERG DENSITY CALCULATION
  // ============================================================================

  /**
   * Calculate iceberg density at a price level
   * Requirement 2.3: Implement iceberg density calculation
   */
  calculateIcebergDensity(
    symbol: string,
    priceLevel: number,
    trades: CVDTrade[]
  ): IcebergAnalysis {
    const tickSize = this.calculateTickSize(priceLevel);
    const roundedLevel = this.roundToTick(priceLevel, tickSize);

    // Measure refill rate
    const refillRate = this.measureRefillRate(symbol, priceLevel, trades);

    // Get liquidity level data
    const level = this.getOrCreateLiquidityLevel(symbol, roundedLevel);

    // Calculate density based on refill patterns
    const refillCount = level.refills.filter(r => 
      r.timestamp > Date.now() - this.config.maxDataAge
    ).length;

    // Density formula: combines refill rate, refill count, and consistency
    let density = 0;

    // Factor 1: Refill rate contribution (0-40 points)
    const rateScore = Math.min(40, (refillRate / this.config.minRefillRate) * 20);
    density += rateScore;

    // Factor 2: Refill count contribution (0-30 points)
    const countScore = Math.min(30, (refillCount / this.config.minRefillCount) * 15);
    density += countScore;

    // Factor 3: Refill consistency (0-30 points)
    const consistencyScore = this.calculateRefillConsistency(level.refills) * 30;
    density += consistencyScore;

    // Determine if this is an iceberg
    const isIceberg = density >= this.config.densityThreshold &&
                      refillCount >= this.config.minRefillCount &&
                      refillRate >= this.config.minRefillRate;

    const analysis: IcebergAnalysis = {
      priceLevel: roundedLevel,
      initialLiquidity: level.peakLiquidity,
      refillRate,
      refillCount,
      density: Math.min(100, density),
      isIceberg
    };

    // Cache the analysis
    this.cacheAnalysis(symbol, analysis);

    // Emit event
    this.emit('icebergAnalyzed', { symbol, analysis });

    return analysis;
  }

  /**
   * Calculate refill consistency (how regular the refills are)
   */
  private calculateRefillConsistency(refills: LiquidityRefill[]): number {
    if (refills.length < 2) return 0;

    // Calculate time intervals between refills
    const intervals: number[] = [];
    for (let i = 1; i < refills.length; i++) {
      intervals.push(refills[i].timestamp - refills[i - 1].timestamp);
    }

    if (intervals.length === 0) return 0;

    // Calculate coefficient of variation (lower = more consistent)
    const mean = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1;

    // Convert to 0-1 score (lower CV = higher consistency)
    return Math.max(0, 1 - cv);
  }

  // ============================================================================
  // ORDER BLOCK LIQUIDITY MONITORING
  // ============================================================================

  /**
   * Monitor Order Block liquidity changes in real-time
   * Requirement 2.4: Add real-time monitoring for Order Block liquidity changes
   */
  monitorOrderBlockLiquidity(
    symbol: string,
    orderBlockHigh: number,
    orderBlockLow: number,
    trades: CVDTrade[]
  ): OrderBlockLiquidityResult {
    // Analyze both edges of the order block
    const highAnalysis = this.calculateIcebergDensity(symbol, orderBlockHigh, trades);
    const lowAnalysis = this.calculateIcebergDensity(symbol, orderBlockLow, trades);

    // Use the more significant analysis
    const primaryAnalysis = highAnalysis.density > lowAnalysis.density ? highAnalysis : lowAnalysis;
    const priceLevel = primaryAnalysis.priceLevel;

    // Determine liquidity health
    let liquidityHealth: 'strong' | 'weakening' | 'depleted' = 'depleted';
    let recommendation: 'valid' | 'caution' | 'invalid' = 'invalid';
    let reasoning = '';

    if (primaryAnalysis.isIceberg) {
      // Iceberg detected - strong hidden liquidity
      liquidityHealth = 'strong';
      recommendation = 'caution';
      reasoning = `Iceberg detected at ${priceLevel.toFixed(2)} with density ${primaryAnalysis.density.toFixed(1)}%. ` +
                  `Refill rate: ${primaryAnalysis.refillRate.toFixed(2)}/s. ` +
                  `This may indicate institutional selling - consider avoiding Long entries.`;

      this.emit('icebergWarning', {
        symbol,
        priceLevel,
        density: primaryAnalysis.density,
        recommendation: 'ICEBERG_SELL'
      });
    } else if (primaryAnalysis.density > 30) {
      // Moderate liquidity
      liquidityHealth = 'weakening';
      recommendation = 'caution';
      reasoning = `Moderate liquidity at ${priceLevel.toFixed(2)} with density ${primaryAnalysis.density.toFixed(1)}%. ` +
                  `Monitor for further changes.`;
    } else if (primaryAnalysis.refillCount > 0) {
      // Some refill activity
      liquidityHealth = 'weakening';
      recommendation = 'valid';
      reasoning = `Order Block at ${priceLevel.toFixed(2)} shows some liquidity activity. ` +
                  `Refill count: ${primaryAnalysis.refillCount}. Proceed with normal validation.`;
    } else {
      // No significant liquidity
      liquidityHealth = 'depleted';
      recommendation = 'valid';
      reasoning = `Order Block at ${priceLevel.toFixed(2)} shows no iceberg activity. ` +
                  `Liquidity appears genuine.`;
    }

    const result: OrderBlockLiquidityResult = {
      priceLevel,
      icebergAnalysis: primaryAnalysis,
      liquidityHealth,
      recommendation,
      reasoning
    };

    this.emit('orderBlockMonitored', result);

    return result;
  }

  /**
   * Check if iceberg is detected at a price level (quick check)
   * Requirement 2.4: Flag as ICEBERG_SELL and cancel Long setup
   */
  isIcebergAtLevel(symbol: string, priceLevel: number): boolean {
    const tickSize = this.calculateTickSize(priceLevel);
    const roundedLevel = this.roundToTick(priceLevel, tickSize);

    const symbolLevels = this.liquidityLevels.get(symbol);
    if (!symbolLevels) return false;

    const level = symbolLevels.get(roundedLevel);
    if (!level) return false;

    // Quick check based on recent refill activity
    const recentRefills = level.refills.filter(r => 
      r.timestamp > Date.now() - this.config.refillWindow
    );

    return recentRefills.length >= this.config.minRefillCount;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get or create liquidity level tracking
   */
  private getOrCreateLiquidityLevel(symbol: string, priceLevel: number): LiquidityLevel {
    if (!this.liquidityLevels.has(symbol)) {
      this.liquidityLevels.set(symbol, new Map());
    }

    const symbolLevels = this.liquidityLevels.get(symbol)!;

    if (!symbolLevels.has(priceLevel)) {
      symbolLevels.set(priceLevel, {
        priceLevel,
        currentLiquidity: 0,
        peakLiquidity: 0,
        consumptions: [],
        refills: [],
        lastUpdate: Date.now()
      });
    }

    const level = symbolLevels.get(priceLevel)!;

    // Clean old data
    const cutoff = Date.now() - this.config.maxDataAge;
    level.consumptions = level.consumptions.filter(c => c.timestamp > cutoff);
    level.refills = level.refills.filter(r => r.timestamp > cutoff);

    return level;
  }

  /**
   * Calculate tick size based on price
   */
  private calculateTickSize(price: number): number {
    if (price >= 10000) return 1.0;
    if (price >= 1000) return 0.1;
    if (price >= 100) return 0.01;
    if (price >= 10) return 0.001;
    return 0.0001;
  }

  /**
   * Round price to nearest tick
   */
  private roundToTick(price: number, tickSize: number): number {
    return Math.round(price / tickSize) * tickSize;
  }

  /**
   * Cache analysis result
   */
  private cacheAnalysis(symbol: string, analysis: IcebergAnalysis): void {
    if (!this.analysisCache.has(symbol)) {
      this.analysisCache.set(symbol, []);
    }

    const cache = this.analysisCache.get(symbol)!;
    cache.push(analysis);

    // Limit cache size
    if (cache.length > this.MAX_CACHE_SIZE) {
      cache.shift();
    }
  }

  // ============================================================================
  // DATA ACCESS
  // ============================================================================

  /**
   * Get cached analyses for a symbol
   */
  getCachedAnalyses(symbol: string, count?: number): IcebergAnalysis[] {
    const cache = this.analysisCache.get(symbol) || [];
    return count ? cache.slice(-count) : cache;
  }

  /**
   * Get liquidity level data
   */
  getLiquidityLevel(symbol: string, priceLevel: number): LiquidityLevel | null {
    const tickSize = this.calculateTickSize(priceLevel);
    const roundedLevel = this.roundToTick(priceLevel, tickSize);

    const symbolLevels = this.liquidityLevels.get(symbol);
    if (!symbolLevels) return null;

    return symbolLevels.get(roundedLevel) || null;
  }

  /**
   * Get all tracked price levels for a symbol
   */
  getTrackedLevels(symbol: string): number[] {
    const symbolLevels = this.liquidityLevels.get(symbol);
    if (!symbolLevels) return [];

    return Array.from(symbolLevels.keys()).sort((a, b) => b - a);
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<IcebergDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): IcebergDetectorConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    symbolsTracked: number;
    levelsTracked: number;
    cachedAnalyses: number;
  } {
    let levelsTracked = 0;
    let cachedAnalyses = 0;

    for (const levels of this.liquidityLevels.values()) {
      levelsTracked += levels.size;
    }

    for (const cache of this.analysisCache.values()) {
      cachedAnalyses += cache.length;
    }

    return {
      symbolsTracked: this.liquidityLevels.size,
      levelsTracked,
      cachedAnalyses
    };
  }

  /**
   * Clear data for a symbol
   */
  clearSymbol(symbol: string): void {
    this.liquidityLevels.delete(symbol);
    this.analysisCache.delete(symbol);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.liquidityLevels.clear();
    this.analysisCache.clear();
    this.removeAllListeners();
  }
}
