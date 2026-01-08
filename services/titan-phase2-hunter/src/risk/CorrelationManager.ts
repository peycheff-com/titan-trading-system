/**
 * Correlation Manager for Titan Phase 2 - The Hunter
 * 
 * Manages correlation-based position limits to avoid overexposure to correlated assets.
 * Implements 24-hour rolling correlation calculations and enforces correlation thresholds.
 * 
 * Requirements: 14.1-14.7 (Correlation-Based Position Limits)
 */

import { EventEmitter } from 'events';
import { Position, OHLCV } from '../types';
import { BybitPerpsClient } from '../exchanges/BybitPerpsClient';

export interface CorrelationData {
  symbol1: string;
  symbol2: string;
  correlation: number;
  timestamp: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  timestamp: number;
}

export interface CorrelationResult {
  allowed: boolean;
  adjustedSize?: number;
  reason?: string;
  correlation?: number;
}

export interface HighBetaState {
  isHighBeta: boolean;
  btcCorrelation: number;
  affectedSymbols: string[];
  timestamp: number;
}

export interface CorrelationManagerConfig {
  correlationThreshold: number; // 0.7 - reduce position size by 50%
  rejectThreshold: number; // 0.85 - reject signal completely
  groupCorrelationThreshold: number; // 0.5 - for calculating total correlated exposure
  maxCorrelatedExposure: number; // 0.4 - 40% of equity max
  highBetaThreshold: number; // 0.9 - BTC correlation threshold
  highBetaReduction: number; // 0.3 - 30% position size reduction
  rollingWindowHours: number; // 24 - hours for rolling correlation
  updateIntervalMs: number; // 300000 - 5 minutes
}

export interface CorrelationManagerEvents {
  'correlation:updated': (matrix: CorrelationMatrix) => void;
  'correlation:high_beta': (state: HighBetaState) => void;
  'correlation:reject': (symbol: string, correlation: number, conflictSymbol: string) => void;
  'correlation:reduce': (symbol: string, correlation: number, originalSize: number, adjustedSize: number) => void;
  'correlation:exposure_limit': (totalExposure: number, maxExposure: number) => void;
}

export class CorrelationManager extends EventEmitter {
  private config: CorrelationManagerConfig;
  private bybitClient: BybitPerpsClient;
  private correlationCache: Map<string, CorrelationData[]> = new Map();
  private priceHistory: Map<string, OHLCV[]> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private highBetaState: HighBetaState | null = null;

  constructor(bybitClient: BybitPerpsClient, config?: Partial<CorrelationManagerConfig>) {
    super();
    
    this.bybitClient = bybitClient;
    this.config = {
      correlationThreshold: 0.7,
      rejectThreshold: 0.85,
      groupCorrelationThreshold: 0.5,
      maxCorrelatedExposure: 0.4,
      highBetaThreshold: 0.9,
      highBetaReduction: 0.3,
      rollingWindowHours: 24,
      updateIntervalMs: 300000, // 5 minutes
      ...config
    };

    // Start correlation monitoring
    this.startMonitoring();
  }

  /**
   * Calculate 24-hour rolling correlation between two symbols
   * @param symbol1 - First symbol
   * @param symbol2 - Second symbol
   * @returns Correlation coefficient (-1 to 1)
   */
  public async calcCorrelation(symbol1: string, symbol2: string): Promise<number> {
    try {
      // Get 24-hour price data for both symbols
      const [data1, data2] = await Promise.all([
        this.getPriceHistory(symbol1),
        this.getPriceHistory(symbol2)
      ]);

      if (data1.length < 24 || data2.length < 24) {
        console.warn(`⚠️ Insufficient data for correlation: ${symbol1} (${data1.length}), ${symbol2} (${data2.length})`);
        return 0;
      }

      // Align data by timestamp and calculate returns
      const alignedData = this.alignPriceData(data1, data2);
      if (alignedData.length < 20) {
        console.warn(`⚠️ Insufficient aligned data for correlation: ${alignedData.length} points`);
        return 0;
      }

      // Calculate returns
      const returns1 = this.calculateReturns(alignedData.map(d => d.price1));
      const returns2 = this.calculateReturns(alignedData.map(d => d.price2));

      // Calculate Pearson correlation coefficient
      const correlation = this.pearsonCorrelation(returns1, returns2);

      // Cache the result
      this.cacheCorrelation(symbol1, symbol2, correlation);

      return correlation;
    } catch (error) {
      console.error(`❌ Failed to calculate correlation between ${symbol1} and ${symbol2}:`, error);
      return 0;
    }
  }

  /**
   * Check correlation limit and determine if position is allowed
   * @param candidateSymbol - Symbol to check
   * @param openPositions - Currently open positions
   * @param proposedSize - Proposed position size
   * @returns Correlation result with allowed status and adjusted size
   */
  public async checkCorrelationLimit(
    candidateSymbol: string, 
    openPositions: Position[], 
    proposedSize: number
  ): Promise<CorrelationResult> {
    try {
      let maxCorrelation = 0;
      let conflictSymbol = '';

      // Check correlation with all open positions
      for (const position of openPositions) {
        if (position.symbol === candidateSymbol) continue;

        const correlation = Math.abs(await this.calcCorrelation(candidateSymbol, position.symbol));
        
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          conflictSymbol = position.symbol;
        }
      }

      // Check rejection threshold (0.85)
      if (maxCorrelation >= this.config.rejectThreshold) {
        this.emit('correlation:reject', candidateSymbol, maxCorrelation, conflictSymbol);
        console.log(`🚫 Signal rejected: ${candidateSymbol} correlation ${maxCorrelation.toFixed(3)} with ${conflictSymbol} exceeds ${this.config.rejectThreshold}`);
        
        return {
          allowed: false,
          reason: `CORRELATION_REJECT: ${maxCorrelation.toFixed(3)} with ${conflictSymbol}`,
          correlation: maxCorrelation
        };
      }

      // Check reduction threshold (0.7)
      if (maxCorrelation >= this.config.correlationThreshold) {
        const adjustedSize = proposedSize * 0.5; // Reduce by 50%
        this.emit('correlation:reduce', candidateSymbol, maxCorrelation, proposedSize, adjustedSize);
        console.log(`📉 Position size reduced: ${candidateSymbol} ${proposedSize} → ${adjustedSize} (correlation ${maxCorrelation.toFixed(3)} with ${conflictSymbol})`);
        
        return {
          allowed: true,
          adjustedSize,
          reason: `CORRELATION_REDUCE: ${maxCorrelation.toFixed(3)} with ${conflictSymbol}`,
          correlation: maxCorrelation
        };
      }

      // No correlation issues
      return {
        allowed: true,
        correlation: maxCorrelation
      };
    } catch (error) {
      console.error(`❌ Failed to check correlation limit for ${candidateSymbol}:`, error);
      return { allowed: true }; // Allow on error to avoid blocking trades
    }
  }

  /**
   * Calculate total correlated exposure capped at 40% equity
   * @param openPositions - Currently open positions
   * @param totalEquity - Total account equity
   * @returns Total correlated exposure as percentage of equity
   */
  public async calcTotalCorrelatedExposure(openPositions: Position[], totalEquity: number): Promise<number> {
    try {
      if (openPositions.length < 2) return 0;

      const correlationMatrix = await this.generateCorrelationMatrix(openPositions.map(p => p.symbol));
      const symbols = correlationMatrix.symbols;
      const matrix = correlationMatrix.matrix;

      // Group highly correlated positions (correlation > 0.5)
      const correlatedGroups: Position[][] = [];
      const processed = new Set<string>();

      for (let i = 0; i < symbols.length; i++) {
        if (processed.has(symbols[i])) continue;

        const group: Position[] = [];
        const position1 = openPositions.find(p => p.symbol === symbols[i]);
        if (position1) {
          group.push(position1);
          processed.add(symbols[i]);
        }

        // Find correlated positions
        for (let j = i + 1; j < symbols.length; j++) {
          if (processed.has(symbols[j])) continue;

          const correlation = Math.abs(matrix[i][j]);
          if (correlation >= this.config.groupCorrelationThreshold) {
            const position2 = openPositions.find(p => p.symbol === symbols[j]);
            if (position2) {
              group.push(position2);
              processed.add(symbols[j]);
            }
          }
        }

        if (group.length > 1) {
          correlatedGroups.push(group);
        }
      }

      // Calculate total correlated exposure
      let totalCorrelatedExposure = 0;
      for (const group of correlatedGroups) {
        const groupExposure = group.reduce((sum, pos) => {
          const notional = pos.quantity * pos.currentPrice * pos.leverage;
          return sum + notional;
        }, 0);
        totalCorrelatedExposure += groupExposure;
      }

      const exposurePercentage = totalCorrelatedExposure / totalEquity;
      const maxExposure = this.config.maxCorrelatedExposure;

      if (exposurePercentage > maxExposure) {
        this.emit('correlation:exposure_limit', exposurePercentage, maxExposure);
        console.warn(`⚠️ Correlated exposure ${(exposurePercentage * 100).toFixed(1)}% exceeds limit ${(maxExposure * 100).toFixed(1)}%`);
      }

      return exposurePercentage;
    } catch (error) {
      console.error(`❌ Failed to calculate total correlated exposure:`, error);
      return 0;
    }
  }

  /**
   * Detect high beta market conditions when BTC correlation > 0.9
   * @param topSymbols - Top 10 symbols to check
   * @returns High beta state
   */
  public async detectHighBeta(topSymbols: string[]): Promise<HighBetaState> {
    try {
      const btcSymbol = 'BTCUSDT';
      const correlations: number[] = [];
      const affectedSymbols: string[] = [];

      // Calculate correlation with BTC for each symbol
      for (const symbol of topSymbols.slice(0, 10)) {
        if (symbol === btcSymbol) continue;

        const correlation = Math.abs(await this.calcCorrelation(symbol, btcSymbol));
        correlations.push(correlation);

        if (correlation >= this.config.highBetaThreshold) {
          affectedSymbols.push(symbol);
        }
      }

      // Calculate average BTC correlation
      const avgBtcCorrelation = correlations.length > 0 
        ? correlations.reduce((sum, corr) => sum + corr, 0) / correlations.length 
        : 0;

      const isHighBeta = avgBtcCorrelation >= this.config.highBetaThreshold;

      const highBetaState: HighBetaState = {
        isHighBeta,
        btcCorrelation: avgBtcCorrelation,
        affectedSymbols,
        timestamp: Date.now()
      };

      // Update state and emit event if changed
      if (!this.highBetaState || this.highBetaState.isHighBeta !== isHighBeta) {
        this.highBetaState = highBetaState;
        this.emit('correlation:high_beta', highBetaState);

        if (isHighBeta) {
          console.warn(`🔴 HIGH BETA market detected: BTC correlation ${avgBtcCorrelation.toFixed(3)}, ${affectedSymbols.length} symbols affected`);
        } else {
          console.log(`🟢 Normal market conditions: BTC correlation ${avgBtcCorrelation.toFixed(3)}`);
        }
      }

      return highBetaState;
    } catch (error) {
      console.error(`❌ Failed to detect high beta conditions:`, error);
      return {
        isHighBeta: false,
        btcCorrelation: 0,
        affectedSymbols: [],
        timestamp: Date.now()
      };
    }
  }

  /**
   * Generate correlation matrix for UI display
   * @param symbols - Symbols to include in matrix
   * @returns Correlation matrix
   */
  public async generateCorrelationMatrix(symbols: string[]): Promise<CorrelationMatrix> {
    try {
      const n = symbols.length;
      const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

      // Calculate correlation for each pair
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) {
            matrix[i][j] = 1.0; // Perfect correlation with self
          } else if (i < j) {
            // Calculate correlation for upper triangle
            const correlation = await this.calcCorrelation(symbols[i], symbols[j]);
            matrix[i][j] = correlation;
            matrix[j][i] = correlation; // Mirror to lower triangle
          }
        }
      }

      const correlationMatrix: CorrelationMatrix = {
        symbols,
        matrix,
        timestamp: Date.now()
      };

      this.emit('correlation:updated', correlationMatrix);
      return correlationMatrix;
    } catch (error) {
      console.error(`❌ Failed to generate correlation matrix:`, error);
      return {
        symbols: [],
        matrix: [],
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get 24-hour price history for a symbol
   * @param symbol - Symbol to get price history for
   * @returns Array of OHLCV data
   */
  private async getPriceHistory(symbol: string): Promise<OHLCV[]> {
    try {
      // Check cache first
      const cached = this.priceHistory.get(symbol);
      if (cached && cached.length > 0) {
        const latestTime = cached[cached.length - 1].timestamp;
        const hoursSinceUpdate = (Date.now() - latestTime) / (1000 * 60 * 60);
        
        if (hoursSinceUpdate < 1) {
          return cached; // Use cached data if less than 1 hour old
        }
      }

      // Fetch fresh 24-hour data (hourly candles)
      const data = await this.bybitClient.fetchOHLCV(symbol, '1h', 24);
      this.priceHistory.set(symbol, data);
      
      return data;
    } catch (error) {
      console.error(`❌ Failed to get price history for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Align price data by timestamp
   * @param data1 - First symbol's price data
   * @param data2 - Second symbol's price data
   * @returns Aligned price data
   */
  private alignPriceData(data1: OHLCV[], data2: OHLCV[]): { timestamp: number; price1: number; price2: number }[] {
    const aligned: { timestamp: number; price1: number; price2: number }[] = [];
    
    // Create maps for faster lookup
    const map1 = new Map(data1.map(d => [d.timestamp, d.close]));
    const map2 = new Map(data2.map(d => [d.timestamp, d.close]));

    // Find common timestamps
    const timestamps1 = new Set(data1.map(d => d.timestamp));
    const timestamps2 = new Set(data2.map(d => d.timestamp));
    const commonTimestamps = Array.from(timestamps1).filter(t => timestamps2.has(t));

    // Align data
    for (const timestamp of commonTimestamps.sort()) {
      const price1 = map1.get(timestamp);
      const price2 = map2.get(timestamp);
      
      if (price1 !== undefined && price2 !== undefined) {
        aligned.push({ timestamp, price1, price2 });
      }
    }

    return aligned;
  }

  /**
   * Calculate returns from price series
   * @param prices - Array of prices
   * @returns Array of returns
   */
  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < prices.length; i++) {
      const returnValue = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(returnValue);
    }
    
    return returns;
  }

  /**
   * Calculate Pearson correlation coefficient
   * @param x - First data series
   * @param y - Second data series
   * @returns Correlation coefficient (-1 to 1)
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) {
      return 0;
    }

    const n = x.length;
    
    // Calculate means
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    // Calculate numerator and denominators
    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = x[i] - meanX;
      const yDiff = y[i] - meanY;
      
      numerator += xDiff * yDiff;
      sumXSquared += xDiff * xDiff;
      sumYSquared += yDiff * yDiff;
    }

    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    
    if (denominator === 0) {
      return 0; // No correlation if no variance
    }

    return numerator / denominator;
  }

  /**
   * Cache correlation result
   * @param symbol1 - First symbol
   * @param symbol2 - Second symbol
   * @param correlation - Correlation value
   */
  private cacheCorrelation(symbol1: string, symbol2: string, correlation: number): void {
    const key = [symbol1, symbol2].sort().join('-');
    
    if (!this.correlationCache.has(key)) {
      this.correlationCache.set(key, []);
    }

    const cache = this.correlationCache.get(key)!;
    cache.push({
      symbol1,
      symbol2,
      correlation,
      timestamp: Date.now()
    });

    // Keep only last 24 hours of data
    const cutoff = Date.now() - (this.config.rollingWindowHours * 60 * 60 * 1000);
    this.correlationCache.set(key, cache.filter(c => c.timestamp > cutoff));
  }

  /**
   * Start correlation monitoring
   */
  private startMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(async () => {
      await this.updateCorrelations();
    }, this.config.updateIntervalMs);

    console.log(`📊 Correlation Manager: Started monitoring (${this.config.updateIntervalMs / 1000}s interval)`);
  }

  /**
   * Stop correlation monitoring
   */
  public stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    console.log(`📊 Correlation Manager: Stopped monitoring`);
  }

  /**
   * Update correlations for all cached pairs
   */
  private async updateCorrelations(): Promise<void> {
    try {
      // Clean old cache entries
      const cutoff = Date.now() - (this.config.rollingWindowHours * 60 * 60 * 1000);
      
      for (const [key, cache] of Array.from(this.correlationCache.entries())) {
        const filtered = cache.filter(c => c.timestamp > cutoff);
        if (filtered.length === 0) {
          this.correlationCache.delete(key);
        } else {
          this.correlationCache.set(key, filtered);
        }
      }

      // Clean old price history
      for (const [symbol, history] of Array.from(this.priceHistory.entries())) {
        const filtered = history.filter(h => h.timestamp > cutoff);
        if (filtered.length === 0) {
          this.priceHistory.delete(symbol);
        } else {
          this.priceHistory.set(symbol, filtered);
        }
      }

      console.log(`📊 Correlation cache updated: ${this.correlationCache.size} pairs, ${this.priceHistory.size} symbols`);
    } catch (error) {
      console.error(`❌ Failed to update correlations:`, error);
    }
  }

  /**
   * Get current high beta state
   * @returns Current high beta state or null
   */
  public getHighBetaState(): HighBetaState | null {
    return this.highBetaState;
  }

  /**
   * Get correlation statistics
   * @returns Correlation statistics
   */
  public getStatistics(): {
    cachedPairs: number;
    cachedSymbols: number;
    highBetaActive: boolean;
    avgBtcCorrelation: number;
  } {
    return {
      cachedPairs: this.correlationCache.size,
      cachedSymbols: this.priceHistory.size,
      highBetaActive: this.highBetaState?.isHighBeta || false,
      avgBtcCorrelation: this.highBetaState?.btcCorrelation || 0
    };
  }

  /**
   * Update configuration
   * @param newConfig - New configuration
   */
  public updateConfig(newConfig: Partial<CorrelationManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`📊 Correlation Manager: Configuration updated`);
  }

  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.correlationCache.clear();
    this.priceHistory.clear();
    this.highBetaState = null;
    console.log(`📊 Correlation Manager: Cache cleared`);
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopMonitoring();
    this.clearCache();
    this.removeAllListeners();
    console.log(`📊 Correlation Manager: Destroyed`);
  }
}

// Export event interface for TypeScript
export declare interface CorrelationManager {
  on<U extends keyof CorrelationManagerEvents>(event: U, listener: CorrelationManagerEvents[U]): this;
  emit<U extends keyof CorrelationManagerEvents>(event: U, ...args: Parameters<CorrelationManagerEvents[U]>): boolean;
}