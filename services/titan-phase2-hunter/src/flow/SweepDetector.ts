/**
 * SweepDetector - Sweep Pattern Detection System
 * 
 * Purpose: Identify aggressive orders that clear multiple price levels,
 * indicating urgent institutional flow.
 * 
 * Key Features:
 * - Detect single aggressive orders clearing 5+ price levels
 * - Classify urgency (low/medium/high) based on speed and volume
 * - Validate and score sweep patterns
 * 
 * Requirements: 2.2 (Identify Sweep Patterns)
 */

import { EventEmitter } from 'events';
import { SweepPattern } from '../types/enhanced-2026';
import { CVDTrade } from '../types';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuration for sweep detection
 */
export interface SweepDetectorConfig {
  /** Minimum price levels to clear for sweep detection */
  minLevelsCleared: number;
  /** Time window for sweep detection (ms) */
  sweepTimeWindow: number;
  /** Minimum volume for significant sweep */
  minSweepVolume: number;
  /** Price level granularity (tick size) */
  tickSize: number;
  /** Speed threshold for high urgency (levels/second) */
  highUrgencySpeed: number;
  /** Speed threshold for medium urgency (levels/second) */
  mediumUrgencySpeed: number;
}

/**
 * Sweep detection result with scoring
 */
export interface SweepDetectionResult {
  sweeps: SweepPattern[];
  totalSweepVolume: number;
  dominantDirection: 'up' | 'down' | 'mixed';
  urgencyScore: number; // 0-100
  institutionalProbability: number; // 0-100
}

/**
 * Internal sweep candidate during detection
 */
interface SweepCandidate {
  startPrice: number;
  endPrice: number;
  startTime: number;
  endTime: number;
  volume: number;
  trades: CVDTrade[];
  levelsCleared: Set<number>;
  direction: 'up' | 'down';
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: SweepDetectorConfig = {
  minLevelsCleared: 5,
  sweepTimeWindow: 1000, // 1 second
  minSweepVolume: 1000, // $1000 minimum
  tickSize: 0.01,
  highUrgencySpeed: 10, // 10 levels/second
  mediumUrgencySpeed: 5 // 5 levels/second
};

// ============================================================================
// SWEEP DETECTOR CLASS
// ============================================================================

/**
 * SweepDetector - Identifies aggressive sweep patterns
 * 
 * Sweeps indicate urgent institutional flow where a single aggressive
 * order clears multiple price levels in rapid succession.
 */
export class SweepDetector extends EventEmitter {
  private config: SweepDetectorConfig;
  private tradeBuffer: Map<string, CVDTrade[]> = new Map();
  private sweepHistory: Map<string, SweepPattern[]> = new Map();
  private readonly MAX_HISTORY_SIZE = 50;
  private readonly BUFFER_WINDOW = 60000; // 1 minute buffer

  constructor(config: Partial<SweepDetectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // SWEEP DETECTION
  // ============================================================================

  /**
   * Detect sweep patterns from trades
   * Requirement 2.2: Identify Sweep Patterns where single aggressive order clears 5+ levels
   */
  detectSweeps(symbol: string, trades: CVDTrade[]): SweepPattern[] {
    if (trades.length < 2) return [];

    const sweeps: SweepPattern[] = [];
    const tickSize = this.calculateTickSize(trades[0]?.price || 0);

    // Sort trades by time
    const sortedTrades = [...trades].sort((a, b) => a.time - b.time);

    // Track active sweep candidates
    let currentCandidate: SweepCandidate | null = null;

    for (let i = 0; i < sortedTrades.length; i++) {
      const trade = sortedTrades[i];
      const priceLevel = this.roundToTick(trade.price, tickSize);

      // Determine trade direction based on aggressor
      const isAggressiveBuy = !trade.isBuyerMaker;
      const isAggressiveSell = trade.isBuyerMaker;

      if (!currentCandidate) {
        // Start new candidate
        currentCandidate = {
          startPrice: trade.price,
          endPrice: trade.price,
          startTime: trade.time,
          endTime: trade.time,
          volume: trade.qty * trade.price,
          trades: [trade],
          levelsCleared: new Set([priceLevel]),
          direction: isAggressiveBuy ? 'up' : 'down'
        };
        continue;
      }

      // Check if trade continues the sweep
      const timeDiff = trade.time - currentCandidate.endTime;
      const sameDirection = 
        (currentCandidate.direction === 'up' && isAggressiveBuy) ||
        (currentCandidate.direction === 'down' && isAggressiveSell);

      if (timeDiff <= this.config.sweepTimeWindow && sameDirection) {
        // Continue sweep
        currentCandidate.endPrice = trade.price;
        currentCandidate.endTime = trade.time;
        currentCandidate.volume += trade.qty * trade.price;
        currentCandidate.trades.push(trade);
        currentCandidate.levelsCleared.add(priceLevel);
      } else {
        // Check if current candidate qualifies as sweep
        if (this.qualifiesAsSweep(currentCandidate)) {
          const sweep = this.createSweepPattern(currentCandidate);
          sweeps.push(sweep);
          this.emit('sweepDetected', sweep);
        }

        // Start new candidate
        currentCandidate = {
          startPrice: trade.price,
          endPrice: trade.price,
          startTime: trade.time,
          endTime: trade.time,
          volume: trade.qty * trade.price,
          trades: [trade],
          levelsCleared: new Set([priceLevel]),
          direction: isAggressiveBuy ? 'up' : 'down'
        };
      }
    }

    // Check final candidate
    if (currentCandidate && this.qualifiesAsSweep(currentCandidate)) {
      const sweep = this.createSweepPattern(currentCandidate);
      sweeps.push(sweep);
      this.emit('sweepDetected', sweep);
    }

    // Cache sweeps
    this.cacheSweeps(symbol, sweeps);

    return sweeps;
  }

  /**
   * Analyze sweeps and return comprehensive result
   */
  analyzeSweeps(symbol: string, trades: CVDTrade[]): SweepDetectionResult {
    const sweeps = this.detectSweeps(symbol, trades);

    if (sweeps.length === 0) {
      return {
        sweeps: [],
        totalSweepVolume: 0,
        dominantDirection: 'mixed',
        urgencyScore: 0,
        institutionalProbability: 0
      };
    }

    // Calculate total sweep volume
    const totalSweepVolume = sweeps.reduce((sum, s) => sum + s.volume, 0);

    // Determine dominant direction
    const upSweeps = sweeps.filter(s => s.direction === 'up');
    const downSweeps = sweeps.filter(s => s.direction === 'down');
    let dominantDirection: 'up' | 'down' | 'mixed' = 'mixed';
    
    if (upSweeps.length > downSweeps.length * 1.5) {
      dominantDirection = 'up';
    } else if (downSweeps.length > upSweeps.length * 1.5) {
      dominantDirection = 'down';
    }

    // Calculate urgency score
    const urgencyScore = this.calculateUrgencyScore(sweeps);

    // Calculate institutional probability
    const institutionalProbability = this.calculateInstitutionalProbability(sweeps);

    const result: SweepDetectionResult = {
      sweeps,
      totalSweepVolume,
      dominantDirection,
      urgencyScore,
      institutionalProbability
    };

    this.emit('sweepsAnalyzed', result);

    return result;
  }

  // ============================================================================
  // URGENCY CLASSIFICATION
  // ============================================================================

  /**
   * Classify sweep urgency based on speed and volume
   * Requirement 2.2: Add urgency classification (low/medium/high)
   */
  classifyUrgency(sweep: SweepPattern): 'low' | 'medium' | 'high' {
    // Calculate speed (levels per second)
    const duration = (sweep.timestamp.getTime() - sweep.timestamp.getTime()) || 1;
    const speed = (sweep.levelsCleared / duration) * 1000;

    if (speed >= this.config.highUrgencySpeed) {
      return 'high';
    } else if (speed >= this.config.mediumUrgencySpeed) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Calculate overall urgency score for multiple sweeps
   */
  private calculateUrgencyScore(sweeps: SweepPattern[]): number {
    if (sweeps.length === 0) return 0;

    let score = 0;
    for (const sweep of sweeps) {
      switch (sweep.urgency) {
        case 'high':
          score += 40;
          break;
        case 'medium':
          score += 25;
          break;
        case 'low':
          score += 10;
          break;
      }
    }

    // Normalize to 0-100
    return Math.min(100, score);
  }

  // ============================================================================
  // SWEEP VALIDATION AND SCORING
  // ============================================================================

  /**
   * Validate and score a sweep pattern
   * Requirement 2.2: Create sweep pattern validation and scoring
   */
  validateSweep(sweep: SweepPattern): {
    isValid: boolean;
    score: number;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let score = 0;

    // Check minimum levels cleared
    if (sweep.levelsCleared >= this.config.minLevelsCleared) {
      score += 30;
      reasons.push(`Cleared ${sweep.levelsCleared} levels (min: ${this.config.minLevelsCleared})`);
    } else {
      reasons.push(`Insufficient levels: ${sweep.levelsCleared} < ${this.config.minLevelsCleared}`);
    }

    // Check minimum volume
    if (sweep.volume >= this.config.minSweepVolume) {
      score += 25;
      reasons.push(`Volume $${sweep.volume.toFixed(0)} meets threshold`);
    } else {
      reasons.push(`Insufficient volume: $${sweep.volume.toFixed(0)} < $${this.config.minSweepVolume}`);
    }

    // Score urgency
    switch (sweep.urgency) {
      case 'high':
        score += 30;
        reasons.push('High urgency sweep');
        break;
      case 'medium':
        score += 20;
        reasons.push('Medium urgency sweep');
        break;
      case 'low':
        score += 10;
        reasons.push('Low urgency sweep');
        break;
    }

    // Bonus for large sweeps
    if (sweep.levelsCleared >= 10) {
      score += 15;
      reasons.push('Large sweep (10+ levels)');
    }

    const isValid = sweep.levelsCleared >= this.config.minLevelsCleared &&
                    sweep.volume >= this.config.minSweepVolume;

    return {
      isValid,
      score: Math.min(100, score),
      reasons
    };
  }

  /**
   * Calculate probability that sweeps indicate institutional activity
   */
  private calculateInstitutionalProbability(sweeps: SweepPattern[]): number {
    if (sweeps.length === 0) return 0;

    let probability = 0;

    // More sweeps = higher probability
    probability += Math.min(30, sweeps.length * 10);

    // High urgency sweeps increase probability
    const highUrgencyCount = sweeps.filter(s => s.urgency === 'high').length;
    probability += highUrgencyCount * 15;

    // Large volume sweeps increase probability
    const avgVolume = sweeps.reduce((sum, s) => sum + s.volume, 0) / sweeps.length;
    if (avgVolume > this.config.minSweepVolume * 5) {
      probability += 25;
    } else if (avgVolume > this.config.minSweepVolume * 2) {
      probability += 15;
    }

    // Consistent direction increases probability
    const upCount = sweeps.filter(s => s.direction === 'up').length;
    const downCount = sweeps.filter(s => s.direction === 'down').length;
    const directionRatio = Math.max(upCount, downCount) / sweeps.length;
    if (directionRatio > 0.8) {
      probability += 20;
    }

    return Math.min(100, probability);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check if candidate qualifies as a sweep
   */
  private qualifiesAsSweep(candidate: SweepCandidate): boolean {
    return candidate.levelsCleared.size >= this.config.minLevelsCleared &&
           candidate.volume >= this.config.minSweepVolume;
  }

  /**
   * Create SweepPattern from candidate
   */
  private createSweepPattern(candidate: SweepCandidate): SweepPattern {
    const duration = candidate.endTime - candidate.startTime || 1;
    const speed = (candidate.levelsCleared.size / duration) * 1000;

    let urgency: 'low' | 'medium' | 'high' = 'low';
    if (speed >= this.config.highUrgencySpeed) {
      urgency = 'high';
    } else if (speed >= this.config.mediumUrgencySpeed) {
      urgency = 'medium';
    }

    return {
      startPrice: candidate.startPrice,
      endPrice: candidate.endPrice,
      levelsCleared: candidate.levelsCleared.size,
      volume: candidate.volume,
      timestamp: new Date(candidate.startTime),
      direction: candidate.direction,
      urgency
    };
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

  // ============================================================================
  // TRADE BUFFER MANAGEMENT
  // ============================================================================

  /**
   * Add trade to buffer
   */
  addTrade(trade: CVDTrade): void {
    if (!this.tradeBuffer.has(trade.symbol)) {
      this.tradeBuffer.set(trade.symbol, []);
    }

    const buffer = this.tradeBuffer.get(trade.symbol)!;
    buffer.push(trade);

    // Keep buffer size manageable
    const cutoff = Date.now() - this.BUFFER_WINDOW;
    const filtered = buffer.filter(t => t.time > cutoff);
    this.tradeBuffer.set(trade.symbol, filtered);
  }

  /**
   * Get trades from buffer
   */
  getTrades(symbol: string, windowMs?: number): CVDTrade[] {
    const buffer = this.tradeBuffer.get(symbol) || [];
    if (!windowMs) return buffer;

    const cutoff = Date.now() - windowMs;
    return buffer.filter(t => t.time > cutoff);
  }

  /**
   * Detect sweeps from buffered trades
   */
  detectFromBuffer(symbol: string, windowMs?: number): SweepPattern[] {
    const trades = this.getTrades(symbol, windowMs);
    return this.detectSweeps(symbol, trades);
  }

  // ============================================================================
  // SWEEP HISTORY
  // ============================================================================

  /**
   * Cache detected sweeps
   */
  private cacheSweeps(symbol: string, sweeps: SweepPattern[]): void {
    if (!this.sweepHistory.has(symbol)) {
      this.sweepHistory.set(symbol, []);
    }

    const history = this.sweepHistory.get(symbol)!;
    history.push(...sweeps);

    // Limit history size
    if (history.length > this.MAX_HISTORY_SIZE) {
      history.splice(0, history.length - this.MAX_HISTORY_SIZE);
    }
  }

  /**
   * Get sweep history for a symbol
   */
  getSweepHistory(symbol: string, count?: number): SweepPattern[] {
    const history = this.sweepHistory.get(symbol) || [];
    return count ? history.slice(-count) : history;
  }

  /**
   * Get recent sweep count
   */
  getRecentSweepCount(symbol: string, windowMs: number = 300000): number {
    const history = this.sweepHistory.get(symbol) || [];
    const cutoff = Date.now() - windowMs;
    return history.filter(s => s.timestamp.getTime() > cutoff).length;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SweepDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): SweepDetectorConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    symbolsTracked: number;
    totalTrades: number;
    totalSweeps: number;
  } {
    let totalTrades = 0;
    let totalSweeps = 0;

    for (const buffer of this.tradeBuffer.values()) {
      totalTrades += buffer.length;
    }

    for (const history of this.sweepHistory.values()) {
      totalSweeps += history.length;
    }

    return {
      symbolsTracked: this.tradeBuffer.size,
      totalTrades,
      totalSweeps
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.tradeBuffer.clear();
    this.sweepHistory.clear();
    this.removeAllListeners();
  }
}
