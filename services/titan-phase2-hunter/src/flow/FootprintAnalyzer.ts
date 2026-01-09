/**
 * FootprintAnalyzer - Intra-Candle Footprint Analysis
 * 
 * Purpose: Analyze volume distribution at each price level within candles
 * to detect genuine institutional flow vs painted signals.
 * 
 * Key Features:
 * - Build footprint data structure for price-level volume distribution
 * - Create footprint calculation engine for OHLCV data
 * - Implement aggressive vs passive volume classification
 * 
 * Requirements: 2.1 (Implement intra-candle footprinting)
 */

import { EventEmitter } from 'events';
import {
  FootprintData,
  TradeFootprint
} from '../types/enhanced-2026';
import { OHLCV, CVDTrade } from '../types';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuration for footprint analysis
 */
export interface FootprintConfig {
  /** Price level granularity (tick size) */
  tickSize: number;
  /** Minimum volume to consider significant */
  minSignificantVolume: number;
  /** Time window for footprint analysis (ms) */
  analysisWindow: number;
  /** Threshold for aggressive volume classification (0-1) */
  aggressiveThreshold: number;
}

/**
 * Candle footprint containing all price level data
 */
export interface CandleFootprint {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  delta: number; // totalBuyVolume - totalSellVolume
  priceLevels: FootprintData[];
  aggressiveRatio: number; // 0-1
  passiveRatio: number; // 0-1
  imbalanceScore: number; // -100 to +100
}

/**
 * Footprint analysis result
 */
export interface FootprintAnalysisResult {
  footprint: CandleFootprint;
  dominantFlow: 'buying' | 'selling' | 'neutral';
  institutionalSignature: boolean;
  confidence: number; // 0-100
  analysis: {
    volumeConcentration: number; // 0-100
    deltaStrength: number; // -100 to +100
    aggressiveActivity: number; // 0-100
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: FootprintConfig = {
  tickSize: 0.01, // Default tick size (will be adjusted per symbol)
  minSignificantVolume: 100, // Minimum volume to consider
  analysisWindow: 60000, // 1 minute
  aggressiveThreshold: 0.6 // 60% threshold for aggressive classification
};

// ============================================================================
// FOOTPRINT ANALYZER CLASS
// ============================================================================

/**
 * FootprintAnalyzer - Intra-candle volume distribution analysis
 * 
 * Analyzes trade data to build footprint charts showing volume
 * distribution at each price level within a candle.
 */
export class FootprintAnalyzer extends EventEmitter {
  private config: FootprintConfig;
  private tradeBuffer: Map<string, CVDTrade[]> = new Map();
  private footprintCache: Map<string, CandleFootprint[]> = new Map();
  private readonly MAX_CACHE_SIZE = 100;

  constructor(config: Partial<FootprintConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // FOOTPRINT BUILDING
  // ============================================================================

  /**
   * Build footprint data from trades within a candle
   * Requirement 2.1: Implement intra-candle footprinting
   */
  buildFootprint(
    symbol: string,
    candle: OHLCV,
    trades: CVDTrade[]
  ): CandleFootprint {
    // Filter trades within candle timeframe
    const candleTrades = trades.filter(t => 
      t.time >= candle.timestamp && 
      t.time < candle.timestamp + this.config.analysisWindow
    );

    // Calculate tick size based on price
    const tickSize = this.calculateTickSize(candle.close);

    // Build price level map
    const priceLevelMap = new Map<number, FootprintData>();

    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    let aggressiveVolume = 0;
    let passiveVolume = 0;

    for (const trade of candleTrades) {
      // Round price to tick level
      const priceLevel = this.roundToTick(trade.price, tickSize);
      
      // Get or create price level data
      let levelData = priceLevelMap.get(priceLevel);
      if (!levelData) {
        levelData = {
          priceLevel,
          bidVolume: 0,
          askVolume: 0,
          trades: 0,
          aggressiveVolume: 0,
          passiveVolume: 0,
          delta: 0
        };
        priceLevelMap.set(priceLevel, levelData);
      }

      const volume = trade.qty * trade.price; // Dollar volume
      levelData.trades++;

      // Classify volume based on trade aggressor
      if (trade.isBuyerMaker) {
        // Seller is aggressor (market sell hit limit buy)
        levelData.askVolume += volume;
        totalSellVolume += volume;
        aggressiveVolume += volume;
        levelData.aggressiveVolume += volume;
      } else {
        // Buyer is aggressor (market buy hit limit sell)
        levelData.bidVolume += volume;
        totalBuyVolume += volume;
        aggressiveVolume += volume;
        levelData.aggressiveVolume += volume;
      }

      // Update delta
      levelData.delta = levelData.bidVolume - levelData.askVolume;
    }

    // Calculate passive volume (limit orders that got filled)
    passiveVolume = totalBuyVolume + totalSellVolume - aggressiveVolume;

    // Convert map to sorted array
    const priceLevels = Array.from(priceLevelMap.values())
      .sort((a, b) => b.priceLevel - a.priceLevel); // High to low

    // Calculate ratios
    const totalVolume = totalBuyVolume + totalSellVolume;
    const aggressiveRatio = totalVolume > 0 ? aggressiveVolume / totalVolume : 0;
    const passiveRatio = 1 - aggressiveRatio;

    // Calculate imbalance score (-100 to +100)
    const delta = totalBuyVolume - totalSellVolume;
    const imbalanceScore = totalVolume > 0 
      ? (delta / totalVolume) * 100 
      : 0;

    const footprint: CandleFootprint = {
      symbol,
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      totalVolume,
      totalBuyVolume,
      totalSellVolume,
      delta,
      priceLevels,
      aggressiveRatio,
      passiveRatio,
      imbalanceScore
    };

    // Cache the footprint
    this.cacheFootprint(symbol, footprint);

    // Emit event
    this.emit('footprintBuilt', footprint);

    return footprint;
  }

  /**
   * Analyze footprint for institutional activity
   */
  analyzeFootprint(footprint: CandleFootprint): FootprintAnalysisResult {
    // Calculate volume concentration (how concentrated volume is at specific levels)
    const volumeConcentration = this.calculateVolumeConcentration(footprint);

    // Calculate delta strength
    const deltaStrength = footprint.imbalanceScore;

    // Calculate aggressive activity score
    const aggressiveActivity = footprint.aggressiveRatio * 100;

    // Determine dominant flow
    let dominantFlow: 'buying' | 'selling' | 'neutral' = 'neutral';
    if (footprint.delta > footprint.totalVolume * 0.1) {
      dominantFlow = 'buying';
    } else if (footprint.delta < -footprint.totalVolume * 0.1) {
      dominantFlow = 'selling';
    }

    // Detect institutional signature
    // Institutions typically show: high volume concentration, consistent delta, aggressive activity
    const institutionalSignature = 
      volumeConcentration > 60 &&
      Math.abs(deltaStrength) > 30 &&
      aggressiveActivity > 50;

    // Calculate confidence
    const confidence = Math.min(100, 
      (volumeConcentration * 0.3) +
      (Math.abs(deltaStrength) * 0.4) +
      (aggressiveActivity * 0.3)
    );

    const result: FootprintAnalysisResult = {
      footprint,
      dominantFlow,
      institutionalSignature,
      confidence,
      analysis: {
        volumeConcentration,
        deltaStrength,
        aggressiveActivity
      }
    };

    this.emit('footprintAnalyzed', result);

    return result;
  }

  // ============================================================================
  // AGGRESSIVE VS PASSIVE CLASSIFICATION
  // ============================================================================

  /**
   * Classify volume as aggressive or passive
   * Requirement 2.1: Implement aggressive vs passive volume classification
   */
  classifyVolume(trades: CVDTrade[]): {
    aggressive: { buy: number; sell: number };
    passive: { buy: number; sell: number };
    ratio: number;
  } {
    let aggressiveBuy = 0;
    let aggressiveSell = 0;
    let passiveBuy = 0;
    let passiveSell = 0;

    for (const trade of trades) {
      const volume = trade.qty * trade.price;

      if (trade.isBuyerMaker) {
        // Buyer is maker = passive buy, seller is aggressor = aggressive sell
        passiveBuy += volume;
        aggressiveSell += volume;
      } else {
        // Seller is maker = passive sell, buyer is aggressor = aggressive buy
        passiveSell += volume;
        aggressiveBuy += volume;
      }
    }

    const totalAggressive = aggressiveBuy + aggressiveSell;
    const totalPassive = passiveBuy + passiveSell;
    const total = totalAggressive + totalPassive;

    return {
      aggressive: { buy: aggressiveBuy, sell: aggressiveSell },
      passive: { buy: passiveBuy, sell: passiveSell },
      ratio: total > 0 ? totalAggressive / total : 0
    };
  }

  /**
   * Detect if volume pattern indicates institutional activity
   */
  detectInstitutionalPattern(footprint: CandleFootprint): {
    isInstitutional: boolean;
    confidence: number;
    pattern: string;
  } {
    const patterns: string[] = [];
    let score = 0;

    // Check for volume concentration at key levels
    const topLevels = footprint.priceLevels.slice(0, 3);
    const topLevelVolume = topLevels.reduce((sum, l) => sum + l.bidVolume + l.askVolume, 0);
    const concentrationRatio = footprint.totalVolume > 0 
      ? topLevelVolume / footprint.totalVolume 
      : 0;

    if (concentrationRatio > 0.5) {
      patterns.push('volume_concentration');
      score += 30;
    }

    // Check for consistent delta direction
    const consistentDelta = footprint.priceLevels.filter(l => 
      (footprint.delta > 0 && l.delta > 0) || 
      (footprint.delta < 0 && l.delta < 0)
    ).length;
    const deltaConsistency = footprint.priceLevels.length > 0 
      ? consistentDelta / footprint.priceLevels.length 
      : 0;

    if (deltaConsistency > 0.7) {
      patterns.push('consistent_delta');
      score += 25;
    }

    // Check for high aggressive ratio
    if (footprint.aggressiveRatio > this.config.aggressiveThreshold) {
      patterns.push('aggressive_activity');
      score += 25;
    }

    // Check for significant imbalance
    if (Math.abs(footprint.imbalanceScore) > 40) {
      patterns.push('significant_imbalance');
      score += 20;
    }

    return {
      isInstitutional: score >= 50,
      confidence: Math.min(100, score),
      pattern: patterns.join(', ') || 'none'
    };
  }

  // ============================================================================
  // PRICE LEVEL ANALYSIS
  // ============================================================================

  /**
   * Get footprint data for a specific price level
   */
  getFootprintAtLevel(
    footprint: CandleFootprint,
    priceLevel: number
  ): FootprintData | null {
    const tickSize = this.calculateTickSize(priceLevel);
    const roundedLevel = this.roundToTick(priceLevel, tickSize);
    
    return footprint.priceLevels.find(l => 
      Math.abs(l.priceLevel - roundedLevel) < tickSize
    ) || null;
  }

  /**
   * Find price levels with highest volume
   */
  findHighVolumelevels(
    footprint: CandleFootprint,
    count: number = 3
  ): FootprintData[] {
    return [...footprint.priceLevels]
      .sort((a, b) => (b.bidVolume + b.askVolume) - (a.bidVolume + a.askVolume))
      .slice(0, count);
  }

  /**
   * Find price levels with highest delta (buying pressure)
   */
  findHighDeltaLevels(
    footprint: CandleFootprint,
    count: number = 3
  ): FootprintData[] {
    return [...footprint.priceLevels]
      .sort((a, b) => b.delta - a.delta)
      .slice(0, count);
  }

  /**
   * Find price levels with lowest delta (selling pressure)
   */
  findLowDeltaLevels(
    footprint: CandleFootprint,
    count: number = 3
  ): FootprintData[] {
    return [...footprint.priceLevels]
      .sort((a, b) => a.delta - b.delta)
      .slice(0, count);
  }

  // ============================================================================
  // TRADE BUFFER MANAGEMENT
  // ============================================================================

  /**
   * Add trade to buffer for footprint building
   */
  addTrade(trade: CVDTrade): void {
    if (!this.tradeBuffer.has(trade.symbol)) {
      this.tradeBuffer.set(trade.symbol, []);
    }

    const buffer = this.tradeBuffer.get(trade.symbol)!;
    buffer.push(trade);

    // Keep buffer size manageable
    const cutoff = Date.now() - this.config.analysisWindow * 2;
    const filtered = buffer.filter(t => t.time > cutoff);
    this.tradeBuffer.set(trade.symbol, filtered);
  }

  /**
   * Get trades from buffer for a symbol
   */
  getTrades(symbol: string, windowMs?: number): CVDTrade[] {
    const buffer = this.tradeBuffer.get(symbol) || [];
    if (!windowMs) return buffer;

    const cutoff = Date.now() - windowMs;
    return buffer.filter(t => t.time > cutoff);
  }

  /**
   * Clear trade buffer for a symbol
   */
  clearBuffer(symbol: string): void {
    this.tradeBuffer.delete(symbol);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Calculate appropriate tick size based on price
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
   * Calculate volume concentration score
   */
  private calculateVolumeConcentration(footprint: CandleFootprint): number {
    if (footprint.priceLevels.length === 0) return 0;

    // Calculate volume at each level
    const volumes = footprint.priceLevels.map(l => l.bidVolume + l.askVolume);
    const totalVolume = volumes.reduce((sum, v) => sum + v, 0);
    
    if (totalVolume === 0) return 0;

    // Calculate Herfindahl-Hirschman Index (HHI) for concentration
    const hhi = volumes.reduce((sum, v) => {
      const share = v / totalVolume;
      return sum + share * share;
    }, 0);

    // Normalize to 0-100 scale
    // HHI ranges from 1/n (perfect distribution) to 1 (perfect concentration)
    const minHHI = 1 / Math.max(footprint.priceLevels.length, 1);
    const normalizedHHI = (hhi - minHHI) / (1 - minHHI);

    return Math.min(100, normalizedHHI * 100);
  }

  /**
   * Cache footprint for later retrieval
   */
  private cacheFootprint(symbol: string, footprint: CandleFootprint): void {
    if (!this.footprintCache.has(symbol)) {
      this.footprintCache.set(symbol, []);
    }

    const cache = this.footprintCache.get(symbol)!;
    cache.push(footprint);

    // Limit cache size
    if (cache.length > this.MAX_CACHE_SIZE) {
      cache.shift();
    }
  }

  /**
   * Get cached footprints for a symbol
   */
  getCachedFootprints(symbol: string, count?: number): CandleFootprint[] {
    const cache = this.footprintCache.get(symbol) || [];
    return count ? cache.slice(-count) : cache;
  }

  /**
   * Get latest footprint for a symbol
   */
  getLatestFootprint(symbol: string): CandleFootprint | null {
    const cache = this.footprintCache.get(symbol);
    return cache && cache.length > 0 ? cache[cache.length - 1] : null;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FootprintConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): FootprintConfig {
    return { ...this.config };
  }

  /**
   * Get statistics about the analyzer
   */
  getStats(): {
    symbolsTracked: number;
    totalTrades: number;
    cachedFootprints: number;
  } {
    let totalTrades = 0;
    let cachedFootprints = 0;

    for (const buffer of this.tradeBuffer.values()) {
      totalTrades += buffer.length;
    }

    for (const cache of this.footprintCache.values()) {
      cachedFootprints += cache.length;
    }

    return {
      symbolsTracked: this.tradeBuffer.size,
      totalTrades,
      cachedFootprints
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.tradeBuffer.clear();
    this.footprintCache.clear();
    this.removeAllListeners();
  }
}
