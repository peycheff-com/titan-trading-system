/**
 * InstitutionalFlowClassifier - Institutional Flow Classification Engine
 *
 * Purpose: Classify order flow as institutional or retail based on
 * passive absorption vs aggressive pushing patterns.
 *
 * Key Features:
 * - Implement passive absorption vs aggressive pushing detection
 * - Build flow validation scoring system
 * - Integrate with existing CVD validator for enhanced confirmation
 *
 * Requirements: 2.5, 2.6 (Flow Classification and CVD Integration)
 */

import { EventEmitter } from 'events';
import { FlowValidation, IcebergAnalysis, TradeFootprint } from '../types';
import { Absorption, CVDTrade, Distribution } from '../types';
import { CVDIntegrationResult, FlowClassificationResult, FlowClassifierConfig } from '../types';
import { CandleFootprint, FootprintAnalysisResult, FootprintAnalyzer } from './FootprintAnalyzer';
import { SweepDetectionResult, SweepDetector } from './SweepDetector';
import { IcebergDetector } from './IcebergDetector';

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: FlowClassifierConfig = {
  passiveThreshold: 0.6,
  aggressiveThreshold: 0.6,
  minConfidence: 50,
  footprintWeight: 0.35,
  sweepWeight: 0.25,
  icebergWeight: 0.2,
  analysisWindow: 60000, // 1 minute
};

// ============================================================================
// INSTITUTIONAL FLOW CLASSIFIER CLASS
// ============================================================================

/**
 * InstitutionalFlowClassifier - Classifies order flow patterns
 *
 * Distinguishes between:
 * - Passive Absorption: Limit orders soaking up aggressive market orders (bullish)
 * - Aggressive Pushing: Market orders consuming limit order liquidity (bearish)
 */
export class InstitutionalFlowClassifier extends EventEmitter {
  private config: FlowClassifierConfig;
  private footprintAnalyzer: FootprintAnalyzer;
  private sweepDetector: SweepDetector;
  private icebergDetector: IcebergDetector;
  private classificationCache: Map<string, FlowClassificationResult[]> = new Map();
  private tradeBuffer: Map<string, CVDTrade[]> = new Map();
  private readonly MAX_CACHE_SIZE = 50;

  constructor(
    config: Partial<FlowClassifierConfig> = {},
    footprintAnalyzer?: FootprintAnalyzer,
    sweepDetector?: SweepDetector,
    icebergDetector?: IcebergDetector
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Use provided analyzers or create new ones
    this.footprintAnalyzer = footprintAnalyzer || new FootprintAnalyzer();
    this.sweepDetector = sweepDetector || new SweepDetector();
    this.icebergDetector = icebergDetector || new IcebergDetector();
  }

  /**
   * Record a new trade for analysis
   * Maintains a sliding window of trades based on config.analysisWindow
   */
  public recordTrade(trade: CVDTrade): void {
    if (!this.tradeBuffer.has(trade.symbol)) {
      this.tradeBuffer.set(trade.symbol, []);
    }

    const buffer = this.tradeBuffer.get(trade.symbol)!;
    buffer.push(trade);

    // Prune old trades
    const cutoff = Date.now() - this.config.analysisWindow;

    // Optimization: Only prune if buffer is getting large or periodically
    // For now, simple prune from start if old
    while (buffer.length > 0 && buffer[0].time < cutoff) {
      buffer.shift();
    }

    // Optional: Trigger analysis immediately or on schedule?
    // Doing it on demand in getLatestClassification is better for CPU.
  }

  // ============================================================================
  // PASSIVE ABSORPTION VS AGGRESSIVE PUSHING DETECTION
  // ============================================================================

  /**
   * Detect passive absorption pattern
   * Requirement 2.5: Detect Passive Absorption (limit orders soaking up aggressive market orders)
   */
  detectPassiveAbsorption(
    symbol: string,
    trades: CVDTrade[],
    priceLevel?: number
  ): {
    detected: boolean;
    strength: number;
    evidence: string[];
  } {
    const evidence: string[] = [];
    let strength = 0;

    // Analyze trade patterns
    let passiveBuyVolume = 0;
    let aggressiveSellVolume = 0;
    let totalVolume = 0;

    for (const trade of trades) {
      const volume = trade.qty * trade.price;
      totalVolume += volume;

      if (trade.isBuyerMaker) {
        // Buyer is maker = passive buy absorbing aggressive sell
        passiveBuyVolume += volume;
        aggressiveSellVolume += volume;
      }
    }

    // Calculate absorption ratio
    const absorptionRatio = totalVolume > 0 ? passiveBuyVolume / totalVolume : 0;

    if (absorptionRatio >= this.config.passiveThreshold) {
      strength += 40;
      evidence.push(`High absorption ratio: ${(absorptionRatio * 100).toFixed(1)}%`);
    } else if (absorptionRatio >= this.config.passiveThreshold * 0.7) {
      strength += 20;
      evidence.push(`Moderate absorption ratio: ${(absorptionRatio * 100).toFixed(1)}%`);
    }

    // Check for price stability during absorption
    if (trades.length >= 3) {
      const prices = trades.map(t => t.price);
      const priceRange = Math.max(...prices) - Math.min(...prices);
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const priceStability = 1 - priceRange / avgPrice;

      if (priceStability > 0.99) {
        strength += 30;
        evidence.push('Price stable during absorption');
      } else if (priceStability > 0.98) {
        strength += 15;
        evidence.push('Price relatively stable');
      }
    }

    // Check iceberg activity at level
    if (priceLevel) {
      const isIceberg = this.icebergDetector.isIcebergAtLevel(symbol, priceLevel);
      if (isIceberg) {
        strength += 30;
        evidence.push('Iceberg order detected at absorption level');
      }
    }

    const detected = strength >= 50;

    return {
      detected,
      strength: Math.min(100, strength),
      evidence,
    };
  }

  /**
   * Detect aggressive pushing pattern
   * Requirement 2.6: Distinguish between Passive Absorption (bullish) and Aggressive Pushing (bearish)
   */
  detectAggressivePushing(
    symbol: string,
    trades: CVDTrade[]
  ): {
    detected: boolean;
    strength: number;
    direction: 'up' | 'down';
    evidence: string[];
  } {
    const evidence: string[] = [];
    let strength = 0;

    // Analyze trade patterns
    let aggressiveBuyVolume = 0;
    let aggressiveSellVolume = 0;
    let totalVolume = 0;

    for (const trade of trades) {
      const volume = trade.qty * trade.price;
      totalVolume += volume;

      if (!trade.isBuyerMaker) {
        // Buyer is aggressor
        aggressiveBuyVolume += volume;
      } else {
        // Seller is aggressor
        aggressiveSellVolume += volume;
      }
    }

    // Calculate aggressive ratio
    const aggressiveRatio =
      totalVolume > 0 ? Math.max(aggressiveBuyVolume, aggressiveSellVolume) / totalVolume : 0;

    const direction: 'up' | 'down' = aggressiveBuyVolume > aggressiveSellVolume ? 'up' : 'down';

    if (aggressiveRatio >= this.config.aggressiveThreshold) {
      strength += 40;
      evidence.push(`High aggressive ratio: ${(aggressiveRatio * 100).toFixed(1)}% ${direction}`);
    } else if (aggressiveRatio >= this.config.aggressiveThreshold * 0.7) {
      strength += 20;
      evidence.push(`Moderate aggressive ratio: ${(aggressiveRatio * 100).toFixed(1)}%`);
    }

    // Check for price movement during pushing
    if (trades.length >= 3) {
      const sortedTrades = [...trades].sort((a, b) => a.time - b.time);
      const startPrice = sortedTrades[0].price;
      const endPrice = sortedTrades[sortedTrades.length - 1].price;
      const priceChange = (endPrice - startPrice) / startPrice;

      if (Math.abs(priceChange) > 0.001) {
        strength += 30;
        evidence.push(`Price moved ${(priceChange * 100).toFixed(2)}% during pushing`);
      }
    }

    // Check for sweep patterns
    const sweepResult = this.sweepDetector.analyzeSweeps(symbol, trades);
    if (sweepResult.sweeps.length > 0) {
      strength += 30;
      evidence.push(`${sweepResult.sweeps.length} sweep pattern(s) detected`);
    }

    const detected = strength >= 50;

    return {
      detected,
      strength: Math.min(100, strength),
      direction,
      evidence,
    };
  }

  // ============================================================================
  // FLOW VALIDATION SCORING SYSTEM
  // ============================================================================

  /**
   * Build comprehensive flow validation score
   * Requirement 2.6: Build flow validation scoring system
   */
  buildFlowValidationScore(
    symbol: string,
    trades: CVDTrade[],
    priceLevel?: number
  ): FlowValidation {
    // Detect patterns
    const absorption = this.detectPassiveAbsorption(symbol, trades, priceLevel);
    const pushing = this.detectAggressivePushing(symbol, trades);

    // Analyze sweeps
    const sweepResult = this.sweepDetector.analyzeSweeps(symbol, trades);

    // Analyze iceberg (if price level provided)
    let icebergDensity = 0;
    if (priceLevel) {
      const icebergAnalysis = this.icebergDetector.calculateIcebergDensity(
        symbol,
        priceLevel,
        trades
      );
      icebergDensity = icebergAnalysis.density;
    }

    // Determine flow type
    let flowType: 'passive_absorption' | 'aggressive_pushing' | 'neutral' = 'neutral';
    if (absorption.detected && absorption.strength > pushing.strength) {
      flowType = 'passive_absorption';
    } else if (pushing.detected && pushing.strength > absorption.strength) {
      flowType = 'aggressive_pushing';
    }

    // Calculate confidence
    const confidence = Math.max(absorption.strength, pushing.strength);

    // Calculate institutional probability
    const institutionalProbability = this.calculateInstitutionalProbability(
      absorption,
      pushing,
      sweepResult,
      icebergDensity
    );

    const validation: FlowValidation = {
      isValid: confidence >= this.config.minConfidence,
      confidence,
      flowType,
      sweepCount: sweepResult.sweeps.length,
      icebergDensity,
      institutionalProbability,
      timestamp: new Date(),
    };

    this.emit('flowValidated', { symbol, validation });

    return validation;
  }

  /**
   * Calculate probability of institutional activity
   */
  private calculateInstitutionalProbability(
    absorption: { detected: boolean; strength: number },
    pushing: { detected: boolean; strength: number },
    sweepResult: SweepDetectionResult,
    icebergDensity: number
  ): number {
    let probability = 0;

    // Absorption contributes to institutional probability
    if (absorption.detected) {
      probability += absorption.strength * 0.3;
    }

    // Aggressive pushing with sweeps indicates institutional activity
    if (pushing.detected && sweepResult.sweeps.length > 0) {
      probability += pushing.strength * 0.25;
    }

    // Sweep patterns strongly indicate institutional activity
    probability += sweepResult.institutionalProbability * 0.25;

    // Iceberg detection indicates hidden institutional orders
    probability += icebergDensity * 0.2;

    return Math.min(100, probability);
  }

  // ============================================================================
  // COMPREHENSIVE FLOW CLASSIFICATION
  // ============================================================================

  /**
   * Perform comprehensive flow classification
   */
  classifyFlow(symbol: string, trades: CVDTrade[], priceLevel?: number): FlowClassificationResult {
    const reasoning: string[] = [];

    // Get flow validation
    const flowValidation = this.buildFlowValidationScore(symbol, trades, priceLevel);

    // Detect patterns
    const absorption = this.detectPassiveAbsorption(symbol, trades, priceLevel);
    const pushing = this.detectAggressivePushing(symbol, trades);

    // Analyze sweeps
    const sweepResult = this.sweepDetector.analyzeSweeps(symbol, trades);

    // Analyze iceberg
    let icebergAnalysis: IcebergAnalysis | null = null;
    if (priceLevel) {
      icebergAnalysis = this.icebergDetector.calculateIcebergDensity(symbol, priceLevel, trades);
    }

    // Calculate component scores
    const footprintScore = this.calculateFootprintScore(trades);
    const sweepScore = sweepResult.urgencyScore;
    const icebergScore = icebergAnalysis?.density || 0;
    const cvdScore = this.calculateCVDScore(trades);

    // Build reasoning
    if (absorption.detected) {
      reasoning.push(...absorption.evidence);
    }
    if (pushing.detected) {
      reasoning.push(...pushing.evidence);
    }
    if (sweepResult.sweeps.length > 0) {
      reasoning.push(
        `${sweepResult.sweeps.length} sweep(s) with ${sweepResult.dominantDirection} direction`
      );
    }
    if (icebergAnalysis?.isIceberg) {
      reasoning.push(`Iceberg detected with ${icebergAnalysis.density.toFixed(1)}% density`);
    }

    // Determine recommendation
    const recommendation = this.determineRecommendation(
      flowValidation.flowType,
      flowValidation.confidence,
      pushing.direction
    );

    const result: FlowClassificationResult = {
      flowType: flowValidation.flowType,
      confidence: flowValidation.confidence,
      institutionalProbability: flowValidation.institutionalProbability,
      breakdown: {
        footprintScore,
        sweepScore,
        icebergScore,
        cvdScore,
      },
      signals: {
        passiveAbsorption: absorption.detected,
        aggressivePushing: pushing.detected,
        icebergDetected: icebergAnalysis?.isIceberg || false,
        sweepDetected: sweepResult.sweeps.length > 0,
      },
      recommendation,
      reasoning,
    };

    // Cache result
    this.cacheClassification(symbol, result);

    this.emit('flowClassified', { symbol, result });

    return result;
  }

  /**
   * Calculate footprint-based score
   */
  private calculateFootprintScore(trades: CVDTrade[]): number {
    const classification = this.footprintAnalyzer.classifyVolume(trades);

    // Higher aggressive ratio = higher score
    return classification.ratio * 100;
  }

  /**
   * Calculate CVD-based score
   */
  private calculateCVDScore(trades: CVDTrade[]): number {
    let cvd = 0;
    let totalVolume = 0;

    for (const trade of trades) {
      const volume = trade.qty * trade.price;
      totalVolume += volume;

      if (trade.isBuyerMaker) {
        cvd -= volume;
      } else {
        cvd += volume;
      }
    }

    // Normalize to 0-100 scale
    if (totalVolume === 0) return 50;

    const normalizedCVD = (cvd / totalVolume + 1) / 2; // Convert -1 to 1 range to 0 to 1
    return normalizedCVD * 100;
  }

  /**
   * Determine trading recommendation based on flow analysis
   */
  private determineRecommendation(
    flowType: 'passive_absorption' | 'aggressive_pushing' | 'neutral',
    confidence: number,
    pushingDirection?: 'up' | 'down'
  ): 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell' {
    if (confidence < this.config.minConfidence) {
      return 'neutral';
    }

    if (flowType === 'passive_absorption') {
      // Passive absorption is bullish
      return confidence >= 75 ? 'strong_buy' : 'buy';
    }

    if (flowType === 'aggressive_pushing') {
      if (pushingDirection === 'up') {
        return confidence >= 75 ? 'strong_buy' : 'buy';
      } else {
        return confidence >= 75 ? 'strong_sell' : 'sell';
      }
    }

    return 'neutral';
  }

  // ============================================================================
  // CVD VALIDATOR INTEGRATION
  // ============================================================================

  /**
   * Integrate with CVD validator for enhanced confirmation
   * Requirement 2.6: Integrate with existing CVD validator for enhanced confirmation
   */
  integrateWithCVD(
    symbol: string,
    trades: CVDTrade[],
    cvdValue: number,
    absorption?: Absorption | null,
    distribution?: Distribution | null
  ): CVDIntegrationResult {
    // Determine CVD direction
    let cvdDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (cvdValue > 0) {
      cvdDirection = 'bullish';
    } else if (cvdValue < 0) {
      cvdDirection = 'bearish';
    }

    // Get flow classification
    const flowResult = this.classifyFlow(symbol, trades);

    // Check for confirmation
    let cvdConfirmed = false;
    let confidenceAdjustment = 0;

    // CVD confirms passive absorption (bullish)
    if (flowResult.flowType === 'passive_absorption' && cvdDirection === 'bullish') {
      cvdConfirmed = true;
      confidenceAdjustment = 20;
    }

    // CVD confirms aggressive selling
    if (flowResult.flowType === 'aggressive_pushing' && cvdDirection === 'bearish') {
      cvdConfirmed = true;
      confidenceAdjustment = 20;
    }

    // Absorption/Distribution signals add confirmation
    if (absorption && flowResult.flowType === 'passive_absorption') {
      cvdConfirmed = true;
      confidenceAdjustment += 15;
    }

    if (distribution && flowResult.flowType === 'aggressive_pushing') {
      cvdConfirmed = true;
      confidenceAdjustment += 15;
    }

    // Conflict reduces confidence
    if (flowResult.flowType === 'passive_absorption' && cvdDirection === 'bearish') {
      confidenceAdjustment = -20;
    }

    if (flowResult.flowType === 'aggressive_pushing' && cvdDirection === 'bullish') {
      confidenceAdjustment = -20;
    }

    const result: CVDIntegrationResult = {
      cvdConfirmed,
      cvdValue,
      cvdDirection,
      absorptionDetected: !!absorption,
      distributionDetected: !!distribution,
      confidenceAdjustment,
    };

    this.emit('cvdIntegrated', { symbol, result });

    return result;
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Cache classification result
   */
  private cacheClassification(symbol: string, result: FlowClassificationResult): void {
    if (!this.classificationCache.has(symbol)) {
      this.classificationCache.set(symbol, []);
    }

    const cache = this.classificationCache.get(symbol)!;
    cache.push(result);

    if (cache.length > this.MAX_CACHE_SIZE) {
      cache.shift();
    }
  }

  /**
   * Get cached classifications
   */
  getCachedClassifications(symbol: string, count?: number): FlowClassificationResult[] {
    const cache = this.classificationCache.get(symbol) || [];
    return count ? cache.slice(-count) : cache;
  }

  /**
   * Get latest classification
   * Runs analysis on current buffer if available
   */
  getLatestClassification(symbol: string): FlowClassificationResult | null {
    // Check if we have trades to analyze
    const trades = this.tradeBuffer.get(symbol);
    if (trades && trades.length > 0) {
      // Run fresh analysis
      // Note: priceLevel is optional, we might miss iceberg nuances without it here,
      // but for general flow score it's fine.
      return this.classifyFlow(symbol, trades);
    }

    // Fallback to cache if no fresh buffer (unlikely if active)
    const cache = this.classificationCache.get(symbol);
    return cache && cache.length > 0 ? cache[cache.length - 1] : null;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FlowClassifierConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): FlowClassifierConfig {
    return { ...this.config };
  }

  /**
   * Get component analyzers
   */
  getAnalyzers(): {
    footprint: FootprintAnalyzer;
    sweep: SweepDetector;
    iceberg: IcebergDetector;
  } {
    return {
      footprint: this.footprintAnalyzer,
      sweep: this.sweepDetector,
      iceberg: this.icebergDetector,
    };
  }

  /**
   * Get statistics
   */
  getStats(): {
    symbolsClassified: number;
    cachedClassifications: number;
    footprintStats: ReturnType<FootprintAnalyzer['getStats']>;
    sweepStats: ReturnType<SweepDetector['getStats']>;
    icebergStats: ReturnType<IcebergDetector['getStats']>;
  } {
    let cachedClassifications = 0;
    for (const cache of this.classificationCache.values()) {
      cachedClassifications += cache.length;
    }

    return {
      symbolsClassified: this.classificationCache.size,
      cachedClassifications,
      footprintStats: this.footprintAnalyzer.getStats(),
      sweepStats: this.sweepDetector.getStats(),
      icebergStats: this.icebergDetector.getStats(),
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.classificationCache.clear();
    this.footprintAnalyzer.destroy();
    this.sweepDetector.destroy();
    this.icebergDetector.destroy();
    this.removeAllListeners();
  }
}
