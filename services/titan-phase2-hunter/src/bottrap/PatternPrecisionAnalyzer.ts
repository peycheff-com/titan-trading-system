/**
 * PatternPrecisionAnalyzer - Tick-Level Precision Analysis Engine
 * 
 * Analyzes patterns for artificial characteristics that indicate HFT traps.
 * Measures exact tick precision, timing perfection, and textbook pattern detection.
 * 
 * Requirements: 3.1, 3.2, 3.3 (Bot Trap Pattern Recognition)
 */

import {
  PatternPrecision,
  PatternCharacteristics,
  TrapIndicators
} from '../types';
import { FVG, OrderBlock, LiquidityPool, OHLCV } from '../types';

/**
 * Configuration for pattern precision analysis
 */
export interface PatternPrecisionConfig {
  /** Precision threshold for exact tick detection (0.0001 = 0.01%) */
  tickPrecisionThreshold: number;
  /** Timing perfection threshold (0-100) */
  timingPerfectionThreshold: number;
  /** Volume anomaly threshold (multiplier of average) */
  volumeAnomalyThreshold: number;
  /** Minimum pattern frequency to flag as suspicious */
  suspiciousFrequencyThreshold: number;
  /** Round number detection tolerance */
  roundNumberTolerance: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_PATTERN_PRECISION_CONFIG: PatternPrecisionConfig = {
  tickPrecisionThreshold: 0.0001, // 0.01% - exact tick precision
  timingPerfectionThreshold: 90, // 90% timing perfection
  volumeAnomalyThreshold: 2.5, // 2.5x average volume
  suspiciousFrequencyThreshold: 3, // 3+ similar patterns in short time
  roundNumberTolerance: 0.001 // 0.1% tolerance for round numbers
};

/**
 * Technical pattern for analysis
 */
export interface TechnicalPattern {
  type: 'equal_highs' | 'equal_lows' | 'fvg' | 'order_block' | 'liquidity_pool';
  levels: number[];
  timestamp: Date;
  barIndex: number;
  volume?: number;
  source?: FVG | OrderBlock | LiquidityPool;
}

/**
 * Pattern precision analysis result
 */
export interface PrecisionAnalysisResult {
  pattern: TechnicalPattern;
  precision: PatternPrecision;
  characteristics: PatternCharacteristics;
  indicators: TrapIndicators;
  isSuspect: boolean;
  suspicionScore: number;
}

/**
 * PatternPrecisionAnalyzer - Detects artificially perfect patterns
 * 
 * Requirement 3.1: Flag patterns with exact tick precision as SUSPECT_TRAP
 * Requirement 3.2: Check if highs are exact to the tick
 * Requirement 3.3: Flag FVGs with exact round numbers or previous session levels
 */
export class PatternPrecisionAnalyzer {
  private config: PatternPrecisionConfig;
  private recentPatterns: Map<string, TechnicalPattern[]>;
  private sessionLevels: number[];

  constructor(config: Partial<PatternPrecisionConfig> = {}) {
    this.config = { ...DEFAULT_PATTERN_PRECISION_CONFIG, ...config };
    this.recentPatterns = new Map();
    this.sessionLevels = [];
  }

  /**
   * Update session levels for round number detection
   */
  updateSessionLevels(levels: number[]): void {
    this.sessionLevels = levels;
  }

  /**
   * Analyze pattern precision for trap detection
   * 
   * Requirement 3.1: Flag patterns with exact tick precision as SUSPECT_TRAP
   */
  analyzePatternPrecision(pattern: TechnicalPattern): PrecisionAnalysisResult {
    // Calculate precision score (0-100, 100 = exact tick precision)
    const precisionScore = this.calculatePrecisionScore(pattern.levels);
    
    // Calculate timing perfection
    const timingScore = this.assessTimingPerfection(pattern);
    
    // Calculate volume characteristics
    const volumeScore = pattern.volume ? this.assessVolumeCharacteristics(pattern) : 50;
    
    // Calculate pattern complexity
    const complexityScore = this.calculateComplexity(pattern);
    
    // Calculate frequency (how often similar patterns appear)
    const frequencyScore = this.calculatePatternFrequency(pattern);
    
    // Build characteristics
    const characteristics: PatternCharacteristics = {
      precision: precisionScore,
      timing: timingScore,
      volume: volumeScore,
      complexity: complexityScore,
      frequency: frequencyScore
    };
    
    // Identify artificial characteristics
    const artificialCharacteristics = this.identifyArtificialCharacteristics(pattern, characteristics);
    
    // Build trap indicators
    const indicators: TrapIndicators = {
      exactTickPrecision: precisionScore >= 95,
      perfectTiming: timingScore >= this.config.timingPerfectionThreshold,
      unusualVolume: volumeScore > 80 || volumeScore < 20,
      textbookPattern: this.isTextbookPattern(pattern, characteristics),
      suspiciousFrequency: frequencyScore >= this.config.suspiciousFrequencyThreshold
    };
    
    // Calculate suspicion level
    const suspicionLevel = this.calculateSuspicionLevel(indicators, characteristics);
    
    // Calculate overall suspicion score
    const suspicionScore = this.calculateSuspicionScore(indicators, characteristics);
    
    // Build precision result
    const precision: PatternPrecision = {
      type: pattern.type,
      precision: precisionScore,
      suspicionLevel,
      characteristics: artificialCharacteristics
    };
    
    // Determine if pattern is suspect
    const isSuspect = suspicionScore >= 60 || indicators.exactTickPrecision;
    
    // Track pattern for frequency analysis
    this.trackPattern(pattern);
    
    return {
      pattern,
      precision,
      characteristics,
      indicators,
      isSuspect,
      suspicionScore
    };
  }

  /**
   * Calculate precision score for price levels
   * 
   * Requirement 3.2: Check if highs are exact to the tick
   */
  calculatePrecisionScore(levels: number[]): number {
    if (levels.length < 2) return 0;
    
    let totalPrecision = 0;
    let comparisons = 0;
    
    // Compare all pairs of levels
    for (let i = 0; i < levels.length; i++) {
      for (let j = i + 1; j < levels.length; j++) {
        const diff = Math.abs(levels[i] - levels[j]);
        const avgPrice = (levels[i] + levels[j]) / 2;
        const relativeDiff = diff / avgPrice;
        
        // Calculate precision: closer to 0 = higher precision
        // If difference is within tick precision threshold, score is 100
        if (relativeDiff <= this.config.tickPrecisionThreshold) {
          totalPrecision += 100;
        } else {
          // Decay precision score based on difference
          const decayFactor = Math.max(0, 1 - (relativeDiff / 0.01)); // 1% max
          totalPrecision += decayFactor * 100;
        }
        comparisons++;
      }
    }
    
    // Check for round numbers
    const roundNumberBonus = this.checkRoundNumbers(levels);
    
    // Check for session level alignment
    const sessionLevelBonus = this.checkSessionLevelAlignment(levels);
    
    const basePrecision = comparisons > 0 ? totalPrecision / comparisons : 0;
    
    // Add bonuses (capped at 100)
    return Math.min(100, basePrecision + roundNumberBonus + sessionLevelBonus);
  }

  /**
   * Check if levels align with round numbers
   * 
   * Requirement 3.3: Flag if gap boundaries are exact round numbers
   */
  private checkRoundNumbers(levels: number[]): number {
    let roundNumberCount = 0;
    
    for (const level of levels) {
      // Check for round numbers (100, 1000, 10000, etc.)
      const roundFactors = [100, 1000, 10000, 50000, 100000];
      
      for (const factor of roundFactors) {
        const remainder = level % factor;
        const relativeRemainder = remainder / level;
        
        if (relativeRemainder <= this.config.roundNumberTolerance) {
          roundNumberCount++;
          break;
        }
      }
    }
    
    // Return bonus based on round number alignment
    return (roundNumberCount / levels.length) * 15; // Max 15 point bonus
  }

  /**
   * Check if levels align with previous session levels
   * 
   * Requirement 3.3: Flag if boundaries are previous session levels
   */
  private checkSessionLevelAlignment(levels: number[]): number {
    if (this.sessionLevels.length === 0) return 0;
    
    let alignedCount = 0;
    
    for (const level of levels) {
      for (const sessionLevel of this.sessionLevels) {
        const diff = Math.abs(level - sessionLevel) / sessionLevel;
        
        if (diff <= this.config.roundNumberTolerance) {
          alignedCount++;
          break;
        }
      }
    }
    
    // Return bonus based on session level alignment
    return (alignedCount / levels.length) * 10; // Max 10 point bonus
  }

  /**
   * Assess timing perfection of pattern formation
   */
  private assessTimingPerfection(pattern: TechnicalPattern): number {
    // Check if pattern formed at session boundaries (London/NY open)
    const hour = pattern.timestamp.getUTCHours();
    
    // Session open times (UTC)
    const sessionOpenHours = [8, 13, 21]; // London, NY, Asia
    
    let timingScore = 50; // Base score
    
    // Check proximity to session opens
    for (const sessionHour of sessionOpenHours) {
      const hourDiff = Math.abs(hour - sessionHour);
      if (hourDiff <= 1) {
        timingScore += 25; // Bonus for session open timing
        break;
      }
    }
    
    // Check for round minute timing
    const minutes = pattern.timestamp.getMinutes();
    if (minutes === 0 || minutes === 15 || minutes === 30 || minutes === 45) {
      timingScore += 15;
    }
    
    return Math.min(100, timingScore);
  }

  /**
   * Assess volume characteristics during pattern formation
   */
  private assessVolumeCharacteristics(pattern: TechnicalPattern): number {
    // This would typically compare to average volume
    // For now, return a normalized score based on volume presence
    if (!pattern.volume) return 50;
    
    // Higher volume during pattern formation can indicate manipulation
    // Very low volume can also be suspicious (lack of organic interest)
    return 50; // Placeholder - would need historical volume data
  }

  /**
   * Calculate pattern complexity score
   */
  private calculateComplexity(pattern: TechnicalPattern): number {
    // Simple patterns are more likely to be traps
    // Complex patterns require more effort to create artificially
    
    let complexity = 50; // Base complexity
    
    // More levels = more complex
    complexity += Math.min(30, pattern.levels.length * 5);
    
    // Different pattern types have different base complexities
    switch (pattern.type) {
      case 'equal_highs':
      case 'equal_lows':
        complexity -= 20; // Simple patterns
        break;
      case 'fvg':
        complexity -= 10; // Moderately simple
        break;
      case 'order_block':
        complexity += 10; // More complex
        break;
      case 'liquidity_pool':
        complexity += 5; // Moderate complexity
        break;
    }
    
    return Math.max(0, Math.min(100, complexity));
  }

  /**
   * Calculate pattern frequency (how often similar patterns appear)
   */
  private calculatePatternFrequency(pattern: TechnicalPattern): number {
    const key = this.getPatternKey(pattern);
    const recentSimilar = this.recentPatterns.get(key) || [];
    
    // Count patterns in last hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentCount = recentSimilar.filter(
      p => p.timestamp.getTime() > oneHourAgo
    ).length;
    
    return recentCount;
  }

  /**
   * Track pattern for frequency analysis
   */
  private trackPattern(pattern: TechnicalPattern): void {
    const key = this.getPatternKey(pattern);
    const existing = this.recentPatterns.get(key) || [];
    
    // Add new pattern
    existing.push(pattern);
    
    // Keep only last 24 hours of patterns
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const filtered = existing.filter(p => p.timestamp.getTime() > oneDayAgo);
    
    this.recentPatterns.set(key, filtered);
  }

  /**
   * Get pattern key for frequency tracking
   */
  private getPatternKey(pattern: TechnicalPattern): string {
    // Create a key based on pattern type and approximate price level
    const avgLevel = pattern.levels.reduce((a, b) => a + b, 0) / pattern.levels.length;
    const roundedLevel = Math.round(avgLevel / 100) * 100; // Round to nearest 100
    return `${pattern.type}_${roundedLevel}`;
  }

  /**
   * Identify artificial characteristics in pattern
   */
  private identifyArtificialCharacteristics(
    pattern: TechnicalPattern,
    characteristics: PatternCharacteristics
  ): string[] {
    const artificial: string[] = [];
    
    if (characteristics.precision >= 95) {
      artificial.push('EXACT_TICK_PRECISION');
    }
    
    if (characteristics.timing >= 90) {
      artificial.push('PERFECT_TIMING');
    }
    
    if (characteristics.complexity < 30) {
      artificial.push('TEXTBOOK_SIMPLICITY');
    }
    
    if (characteristics.frequency >= this.config.suspiciousFrequencyThreshold) {
      artificial.push('HIGH_FREQUENCY');
    }
    
    // Check for round number alignment
    const roundNumberScore = this.checkRoundNumbers(pattern.levels);
    if (roundNumberScore >= 10) {
      artificial.push('ROUND_NUMBER_ALIGNMENT');
    }
    
    // Check for session level alignment
    const sessionScore = this.checkSessionLevelAlignment(pattern.levels);
    if (sessionScore >= 8) {
      artificial.push('SESSION_LEVEL_ALIGNMENT');
    }
    
    return artificial;
  }

  /**
   * Check if pattern matches textbook definition too perfectly
   */
  private isTextbookPattern(
    pattern: TechnicalPattern,
    characteristics: PatternCharacteristics
  ): boolean {
    // Textbook patterns have high precision, low complexity, and perfect timing
    return (
      characteristics.precision >= 85 &&
      characteristics.complexity < 40 &&
      characteristics.timing >= 80
    );
  }

  /**
   * Calculate suspicion level based on indicators
   */
  private calculateSuspicionLevel(
    indicators: TrapIndicators,
    characteristics: PatternCharacteristics
  ): 'low' | 'medium' | 'high' | 'extreme' {
    let score = 0;
    
    if (indicators.exactTickPrecision) score += 30;
    if (indicators.perfectTiming) score += 20;
    if (indicators.unusualVolume) score += 15;
    if (indicators.textbookPattern) score += 25;
    if (indicators.suspiciousFrequency) score += 10;
    
    if (score >= 70) return 'extreme';
    if (score >= 50) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  /**
   * Calculate overall suspicion score (0-100)
   */
  private calculateSuspicionScore(
    indicators: TrapIndicators,
    characteristics: PatternCharacteristics
  ): number {
    let score = 0;
    
    // Indicator-based scoring
    if (indicators.exactTickPrecision) score += 30;
    if (indicators.perfectTiming) score += 15;
    if (indicators.unusualVolume) score += 10;
    if (indicators.textbookPattern) score += 20;
    if (indicators.suspiciousFrequency) score += 10;
    
    // Characteristic-based scoring
    score += (characteristics.precision / 100) * 15;
    
    return Math.min(100, score);
  }

  /**
   * Analyze Equal Highs pattern for trap detection
   * 
   * Requirement 3.2: Check if highs are exact to the tick
   */
  analyzeEqualHighs(highs: number[], timestamp: Date, barIndex: number): PrecisionAnalysisResult {
    const pattern: TechnicalPattern = {
      type: 'equal_highs',
      levels: highs,
      timestamp,
      barIndex
    };
    
    return this.analyzePatternPrecision(pattern);
  }

  /**
   * Analyze Equal Lows pattern for trap detection
   */
  analyzeEqualLows(lows: number[], timestamp: Date, barIndex: number): PrecisionAnalysisResult {
    const pattern: TechnicalPattern = {
      type: 'equal_lows',
      levels: lows,
      timestamp,
      barIndex
    };
    
    return this.analyzePatternPrecision(pattern);
  }

  /**
   * Analyze FVG for trap detection
   * 
   * Requirement 3.3: Flag if gap boundaries are exact round numbers
   */
  analyzeFVG(fvg: FVG): PrecisionAnalysisResult {
    const pattern: TechnicalPattern = {
      type: 'fvg',
      levels: [fvg.top, fvg.bottom, fvg.midpoint],
      timestamp: new Date(fvg.timestamp),
      barIndex: fvg.barIndex,
      source: fvg
    };
    
    return this.analyzePatternPrecision(pattern);
  }

  /**
   * Analyze Order Block for trap detection
   */
  analyzeOrderBlock(ob: OrderBlock): PrecisionAnalysisResult {
    const pattern: TechnicalPattern = {
      type: 'order_block',
      levels: [ob.high, ob.low],
      timestamp: new Date(ob.timestamp),
      barIndex: ob.barIndex,
      source: ob
    };
    
    return this.analyzePatternPrecision(pattern);
  }

  /**
   * Analyze Liquidity Pool for trap detection
   */
  analyzeLiquidityPool(pool: LiquidityPool): PrecisionAnalysisResult {
    const pattern: TechnicalPattern = {
      type: 'liquidity_pool',
      levels: [pool.price],
      timestamp: new Date(pool.timestamp),
      barIndex: pool.barIndex,
      source: pool
    };
    
    return this.analyzePatternPrecision(pattern);
  }

  /**
   * Clear pattern history (for testing or reset)
   */
  clearHistory(): void {
    this.recentPatterns.clear();
  }
}
