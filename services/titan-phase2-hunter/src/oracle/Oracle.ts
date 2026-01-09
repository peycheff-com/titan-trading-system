/**
 * Oracle - Main Prediction Market Integration Component
 * 
 * Orchestrates all Oracle functionality including:
 * - Fetching prediction market data
 * - Mapping events to trading symbols
 * - Calculating sentiment scores
 * - Applying veto logic and conviction multipliers
 * 
 * Requirements:
 * - 1.1: Connect to Polymarket API
 * - 1.2: Compute weighted sentiment score
 * - 1.3: Apply Conviction Multiplier of 1.5x when aligned
 * - 1.4: Apply Conviction Multiplier for bearish alignment
 * - 1.5: Veto signal when conflict > 40 points
 * - 1.6: Veto Long A+ when BTC Crash > 40%
 * - 1.7: Increase position size when BTC ATH > 60%
 */

import { EventEmitter } from 'events';
import {
  PredictionMarketEvent,
  OracleScore,
  TechnicalSignal,
  EventCategory
} from '../types/enhanced-2026';
import { PolymarketClient, PolymarketClientConfig } from './PolymarketClient';
import { EventMapper, SymbolMappingResult } from './EventMapper';
import { SentimentCalculator, SentimentResult } from './SentimentCalculator';
import { OracleConfig } from '../config/Enhanced2026Config';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Oracle configuration (extended from Enhanced2026Config)
 */
export type { OracleConfig } from '../config/Enhanced2026Config';

/**
 * Veto result with detailed reasoning
 */
export interface VetoResult {
  shouldVeto: boolean;
  reason: string | null;
  vetoType: 'conflict' | 'btc_crash' | 'extreme_event' | null;
  conflictScore: number;
}

/**
 * Conviction multiplier result
 */
export interface ConvictionResult {
  multiplier: number;
  reason: string;
  factors: {
    oracleAlignment: number;
    btcAthBoost: number;
    conflictPenalty: number;
  };
}

/**
 * Oracle state for monitoring
 */
export interface OracleState {
  isConnected: boolean;
  lastUpdate: Date | null;
  eventsLoaded: number;
  activeSymbols: string[];
  btcCrashProbability: number;
  btcAthProbability: number;
}

// ============================================================================
// ORACLE CLASS
// ============================================================================

/**
 * Oracle - Prediction Market Integration Layer
 * 
 * The Oracle provides forward-looking institutional sentiment analysis
 * through prediction market probabilities. It acts as a veto layer to
 * prevent trading against institutional positioning.
 */
export class Oracle extends EventEmitter {
  private polymarketClient: PolymarketClient;
  private eventMapper: EventMapper;
  private sentimentCalculator: SentimentCalculator;
  private config: OracleConfig;

  // Cached data
  private eventCache: Map<string, PredictionMarketEvent[]> = new Map();
  private scoreCache: Map<string, { score: OracleScore; timestamp: number }> = new Map();
  private cacheTTL: number;

  // State tracking
  private isInitialized: boolean = false;
  private lastUpdate: Date | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(config: OracleConfig, polymarketConfig?: Partial<PolymarketClientConfig>) {
    super();
    this.config = config;
    this.cacheTTL = config.updateInterval * 1000;

    // Initialize components
    this.polymarketClient = new PolymarketClient({
      apiKey: config.polymarketApiKey,
      ...polymarketConfig
    });

    this.eventMapper = new EventMapper();
    this.sentimentCalculator = new SentimentCalculator();

    // Forward events from sub-components
    this.polymarketClient.on('rateLimited', (data) => this.emit('rateLimited', data));
    this.polymarketClient.on('connectionError', (error) => this.emit('connectionError', error));
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the Oracle and start data fetching
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) {
      this.emit('disabled');
      return false;
    }

    try {
      // Test connection
      const connected = await this.polymarketClient.connect();
      if (!connected) {
        this.emit('initializationFailed', { reason: 'Connection failed' });
        return false;
      }

      // Load initial events
      await this.refreshEvents();

      // Start periodic updates
      this.startPeriodicUpdates();

      this.isInitialized = true;
      this.emit('initialized');
      return true;

    } catch (error) {
      this.emit('initializationFailed', { reason: (error as Error).message });
      return false;
    }
  }

  /**
   * Start periodic event updates
   */
  private startPeriodicUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(
      () => this.refreshEvents(),
      this.config.updateInterval * 1000
    );
  }

  /**
   * Stop periodic updates
   */
  stopPeriodicUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Refresh events from Polymarket
   */
  async refreshEvents(): Promise<void> {
    try {
      const [cryptoEvents, macroEvents, regulatoryEvents] = await Promise.all([
        this.polymarketClient.fetchCryptoMarkets(),
        this.polymarketClient.fetchMacroMarkets(),
        this.polymarketClient.fetchRegulatoryMarkets()
      ]);

      // Convert to PredictionMarketEvent format
      const allEvents: PredictionMarketEvent[] = [];

      for (const market of [...cryptoEvents, ...macroEvents, ...regulatoryEvents]) {
        const event = this.polymarketClient.convertToPredictionEvent(market);
        allEvents.push(event);
      }

      // Deduplicate by ID
      const uniqueEvents = new Map<string, PredictionMarketEvent>();
      for (const event of allEvents) {
        uniqueEvents.set(event.id, event);
      }

      // Update cache
      this.eventCache.set('all', Array.from(uniqueEvents.values()));
      this.lastUpdate = new Date();

      // Clear score cache (events changed)
      this.scoreCache.clear();

      this.emit('eventsRefreshed', { count: uniqueEvents.size });

    } catch (error) {
      this.emit('refreshError', { error: (error as Error).message });
    }
  }

  // ============================================================================
  // ORACLE SCORE CALCULATION
  // ============================================================================

  /**
   * Calculate Oracle Score for a symbol and direction
   * Requirement 1.2: Compute weighted sentiment score between -100 and +100
   */
  async calculateOracleScore(
    symbol: string,
    direction: 'LONG' | 'SHORT'
  ): Promise<OracleScore> {
    // Check cache first
    const cacheKey = `${symbol}-${direction}`;
    const cached = this.scoreCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.score;
    }

    // Get all events
    const allEvents = this.eventCache.get('all') || [];
    if (allEvents.length === 0) {
      return this.createDefaultScore();
    }

    // Map events to symbol
    const mappingResult = this.eventMapper.mapEventsToSymbol(symbol, allEvents);

    // Calculate sentiment
    const sentimentDirection = direction === 'LONG' ? 'long' : 'short';
    const sentiment = this.sentimentCalculator.calculateSentimentFromRelevance(
      mappingResult.events,
      sentimentDirection
    );

    // Create Oracle Score
    const score: OracleScore = {
      sentiment: sentiment.sentiment,
      confidence: sentiment.confidence,
      events: mappingResult.events.map(r => r.event),
      veto: false,
      vetoReason: null,
      convictionMultiplier: 1.0,
      timestamp: new Date()
    };

    // Cache the score
    this.scoreCache.set(cacheKey, { score, timestamp: Date.now() });

    return score;
  }

  // ============================================================================
  // VETO LOGIC
  // ============================================================================

  /**
   * Determine if a signal should be vetoed
   * Requirements 1.5, 1.6: Veto logic for conflicts and BTC crash
   */
  async shouldVetoSignal(
    signal: TechnicalSignal,
    oracleScore?: OracleScore
  ): Promise<VetoResult> {
    // Get Oracle score if not provided
    const score = oracleScore || await this.calculateOracleScore(
      signal.symbol,
      signal.direction
    );

    // Check for BTC Crash veto (Requirement 1.6)
    if (signal.direction === 'LONG') {
      const btcCrashProb = this.getBTCCrashProbability();
      if (btcCrashProb > this.config.btcCrashVetoThreshold) {
        return {
          shouldVeto: true,
          reason: `BTC Crash probability (${btcCrashProb.toFixed(1)}%) exceeds threshold (${this.config.btcCrashVetoThreshold}%)`,
          vetoType: 'btc_crash',
          conflictScore: btcCrashProb
        };
      }
    }

    // Check for conflict veto (Requirement 1.5)
    const conflictScore = this.calculateConflictScore(signal, score);
    if (conflictScore > this.config.conflictThreshold) {
      return {
        shouldVeto: true,
        reason: `Oracle conflicts with technical signal by ${conflictScore.toFixed(1)} points (threshold: ${this.config.conflictThreshold})`,
        vetoType: 'conflict',
        conflictScore
      };
    }

    return {
      shouldVeto: false,
      reason: null,
      vetoType: null,
      conflictScore
    };
  }

  /**
   * Calculate conflict score between Oracle and technical signal
   * Requirement 1.5: Conflict > 40 points triggers veto
   */
  private calculateConflictScore(
    signal: TechnicalSignal,
    oracleScore: OracleScore
  ): number {
    // For LONG signals, negative Oracle sentiment = conflict
    // For SHORT signals, positive Oracle sentiment = conflict
    if (signal.direction === 'LONG') {
      // Conflict if Oracle is bearish (negative sentiment)
      return oracleScore.sentiment < 0 ? Math.abs(oracleScore.sentiment) : 0;
    } else {
      // Conflict if Oracle is bullish (positive sentiment)
      return oracleScore.sentiment > 0 ? oracleScore.sentiment : 0;
    }
  }

  // ============================================================================
  // CONVICTION MULTIPLIERS
  // ============================================================================

  /**
   * Calculate conviction multiplier for position sizing
   * Requirements 1.3, 1.4, 1.7: Conviction multipliers for aligned signals
   */
  async getConvictionMultiplier(
    signal: TechnicalSignal,
    oracleScore?: OracleScore
  ): Promise<ConvictionResult> {
    const score = oracleScore || await this.calculateOracleScore(
      signal.symbol,
      signal.direction
    );

    let multiplier = 1.0;
    const factors = {
      oracleAlignment: 1.0,
      btcAthBoost: 1.0,
      conflictPenalty: 1.0
    };
    const reasons: string[] = [];

    // Check for Oracle alignment (Requirements 1.3, 1.4)
    const isAligned = this.isOracleAligned(signal, score);
    
    if (isAligned && Math.abs(score.sentiment) >= 60) {
      // Strong alignment: Apply 1.5x multiplier
      factors.oracleAlignment = this.config.convictionMultiplierMax;
      reasons.push(`Oracle strongly aligned (sentiment: ${score.sentiment})`);
    } else if (isAligned && Math.abs(score.sentiment) >= 40) {
      // Moderate alignment: Apply partial multiplier
      const alignmentStrength = Math.abs(score.sentiment) / 100;
      factors.oracleAlignment = 1.0 + (this.config.convictionMultiplierMax - 1.0) * alignmentStrength;
      reasons.push(`Oracle moderately aligned (sentiment: ${score.sentiment})`);
    }

    // Check for BTC ATH boost (Requirement 1.7)
    if (signal.direction === 'LONG' && signal.symbol.includes('BTC')) {
      const btcAthProb = this.getBTCATHProbability();
      if (btcAthProb > this.config.btcAthBoostThreshold) {
        factors.btcAthBoost = 1.5;
        reasons.push(`BTC ATH probability high (${btcAthProb.toFixed(1)}%)`);
      }
    }

    // Check for conflict penalty
    const conflictScore = this.calculateConflictScore(signal, score);
    if (conflictScore > 20 && conflictScore <= this.config.conflictThreshold) {
      // Partial conflict: reduce multiplier
      factors.conflictPenalty = 1.0 - (conflictScore / 100) * 0.3;
      reasons.push(`Partial Oracle conflict (${conflictScore.toFixed(1)} points)`);
    }

    // Calculate final multiplier
    multiplier = factors.oracleAlignment * factors.btcAthBoost * factors.conflictPenalty;

    // Cap at maximum
    multiplier = Math.min(multiplier, this.config.convictionMultiplierMax);

    // Floor at 0.5 (never reduce more than 50%)
    multiplier = Math.max(multiplier, 0.5);

    return {
      multiplier: Math.round(multiplier * 100) / 100,
      reason: reasons.length > 0 ? reasons.join('; ') : 'No adjustment',
      factors
    };
  }

  /**
   * Check if Oracle sentiment aligns with signal direction
   */
  private isOracleAligned(signal: TechnicalSignal, score: OracleScore): boolean {
    if (signal.direction === 'LONG') {
      return score.sentiment > 0;
    } else {
      return score.sentiment < 0;
    }
  }

  // ============================================================================
  // BTC-SPECIFIC METHODS
  // ============================================================================

  /**
   * Get current BTC crash probability
   * Requirement 1.6: BTC Crash probability detection
   */
  getBTCCrashProbability(): number {
    const allEvents = this.eventCache.get('all') || [];
    return this.eventMapper.getHighestBTCCrashProbability(allEvents);
  }

  /**
   * Get current BTC ATH probability
   * Requirement 1.7: BTC ATH probability detection
   */
  getBTCATHProbability(): number {
    const allEvents = this.eventCache.get('all') || [];
    return this.eventMapper.getHighestBTCATHProbability(allEvents);
  }

  // ============================================================================
  // COMPLETE ORACLE EVALUATION
  // ============================================================================

  /**
   * Perform complete Oracle evaluation for a signal
   * Returns OracleScore with veto and conviction multiplier applied
   */
  async evaluateSignal(signal: TechnicalSignal): Promise<OracleScore> {
    // Calculate base Oracle score
    const score = await this.calculateOracleScore(signal.symbol, signal.direction);

    // Check for veto
    const vetoResult = await this.shouldVetoSignal(signal, score);
    score.veto = vetoResult.shouldVeto;
    score.vetoReason = vetoResult.reason;

    // Calculate conviction multiplier (only if not vetoed)
    if (!score.veto) {
      const convictionResult = await this.getConvictionMultiplier(signal, score);
      score.convictionMultiplier = convictionResult.multiplier;
    } else {
      score.convictionMultiplier = 0; // Vetoed signals get 0 multiplier
    }

    // Emit evaluation event
    this.emit('signalEvaluated', {
      symbol: signal.symbol,
      direction: signal.direction,
      sentiment: score.sentiment,
      veto: score.veto,
      convictionMultiplier: score.convictionMultiplier
    });

    return score;
  }

  // ============================================================================
  // STATE AND MONITORING
  // ============================================================================

  /**
   * Get current Oracle state
   */
  getState(): OracleState {
    const allEvents = this.eventCache.get('all') || [];
    const connectionStatus = this.polymarketClient.getConnectionStatus();

    return {
      isConnected: connectionStatus.connected,
      lastUpdate: this.lastUpdate,
      eventsLoaded: allEvents.length,
      activeSymbols: this.eventMapper.getConfiguredSymbols(),
      btcCrashProbability: this.getBTCCrashProbability(),
      btcAthProbability: this.getBTCATHProbability()
    };
  }

  /**
   * Check if Oracle is healthy
   */
  isHealthy(): boolean {
    if (!this.config.enabled) return true; // Disabled is considered healthy

    const state = this.getState();
    
    // Check connection
    if (!state.isConnected) return false;

    // Check data freshness (should update within 2x the interval)
    if (state.lastUpdate) {
      const staleness = Date.now() - state.lastUpdate.getTime();
      if (staleness > this.config.updateInterval * 2000) return false;
    }

    return true;
  }

  /**
   * Get events for a specific category
   */
  getEventsByCategory(category: EventCategory): PredictionMarketEvent[] {
    const allEvents = this.eventCache.get('all') || [];
    return this.eventMapper.filterEventsByCategory(allEvents, [category]);
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update Oracle configuration
   */
  updateConfig(config: Partial<OracleConfig>): void {
    this.config = { ...this.config, ...config };
    this.cacheTTL = this.config.updateInterval * 1000;

    // Restart periodic updates if interval changed
    if (config.updateInterval && this.updateInterval) {
      this.stopPeriodicUpdates();
      this.startPeriodicUpdates();
    }

    // Clear caches
    this.scoreCache.clear();

    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): OracleConfig {
    return { ...this.config };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Create default Oracle score for when no data is available
   */
  private createDefaultScore(): OracleScore {
    return {
      sentiment: 0,
      confidence: 0,
      events: [],
      veto: false,
      vetoReason: null,
      convictionMultiplier: 1.0,
      timestamp: new Date()
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.eventCache.clear();
    this.scoreCache.clear();
    this.polymarketClient.clearCache();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopPeriodicUpdates();
    this.clearCaches();
    this.polymarketClient.destroy();
    this.eventMapper.destroy();
    this.sentimentCalculator.destroy();
    this.removeAllListeners();
  }
}
