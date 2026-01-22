/**
 * Sentiment Calculator for Titan Phase 2 - 2026 Modernization
 *
 * Calculates weighted sentiment scores from prediction market events
 * with time decay and confidence calculations.
 *
 * Requirement 1.2: Compute weighted sentiment score between -100 and +100
 */

import { EventEmitter } from 'events';
import { EventCategory, ImpactLevel, OracleScore, PredictionMarketEvent } from '../types';
import { EventRelevance } from './EventMapper';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Sentiment calculation result
 */
export interface SentimentResult {
  sentiment: number; // -100 to +100
  confidence: number; // 0-100
  bullishScore: number;
  bearishScore: number;
  neutralScore: number;
  eventContributions: EventContribution[];
}

/**
 * Individual event contribution to sentiment
 */
export interface EventContribution {
  eventId: string;
  eventTitle: string;
  contribution: number; // -100 to +100
  weight: number; // 0-1
  direction: 'bullish' | 'bearish' | 'neutral';
  timeDecay: number; // 0-1
}

/**
 * Sentiment calculator configuration
 */
export interface SentimentCalculatorConfig {
  // Weight factors for different event categories
  categoryWeights: Record<EventCategory, number>;
  // Time decay parameters
  timeDecayHalfLife: number; // hours
  // Minimum confidence threshold
  minConfidenceThreshold: number;
  // Volume/liquidity weight factor
  volumeWeightFactor: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: SentimentCalculatorConfig = {
  categoryWeights: {
    [EventCategory.CRYPTO_PRICE]: 1.0,
    [EventCategory.FED_POLICY]: 0.8,
    [EventCategory.REGULATORY]: 0.9,
    [EventCategory.MACRO_ECONOMIC]: 0.6,
    [EventCategory.GEOPOLITICAL]: 0.5,
  },
  timeDecayHalfLife: 48, // 48 hours
  minConfidenceThreshold: 20,
  volumeWeightFactor: 0.3,
};

// ============================================================================
// BULLISH/BEARISH KEYWORD PATTERNS
// ============================================================================

const BULLISH_PATTERNS = [
  'above',
  'ath',
  'all time high',
  'new high',
  'bull',
  'rally',
  'approval',
  'approved',
  'etf approved',
  'adoption',
  'institutional',
  'rate cut',
  'dovish',
  'stimulus',
  'easing',
  'growth',
];

const BEARISH_PATTERNS = [
  'below',
  'crash',
  'bear',
  'decline',
  'drop',
  'fall',
  'rejection',
  'rejected',
  'ban',
  'banned',
  'lawsuit',
  'sec action',
  'rate hike',
  'hawkish',
  'tightening',
  'recession',
  'inflation',
];

// ============================================================================
// SENTIMENT CALCULATOR CLASS
// ============================================================================

/**
 * Sentiment Calculator
 *
 * Calculates weighted sentiment scores from prediction market events
 * using configurable weights, time decay, and confidence calculations.
 */
export class SentimentCalculator extends EventEmitter {
  private config: SentimentCalculatorConfig;

  constructor(config?: Partial<SentimentCalculatorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Merge category weights if provided
    if (config?.categoryWeights) {
      this.config.categoryWeights = {
        ...DEFAULT_CONFIG.categoryWeights,
        ...config.categoryWeights,
      };
    }
  }

  // ============================================================================
  // SENTIMENT CALCULATION
  // ============================================================================

  /**
   * Calculate sentiment score from prediction events
   * Requirement 1.2: Compute weighted sentiment score between -100 and +100
   */
  calculateSentiment(
    events: PredictionMarketEvent[],
    direction: 'long' | 'short'
  ): SentimentResult {
    if (events.length === 0) {
      return this.createNeutralResult();
    }

    const contributions: EventContribution[] = [];
    // eslint-disable-next-line functional/no-let
    let totalWeight = 0;
    // eslint-disable-next-line functional/no-let
    let weightedSentiment = 0;
    // eslint-disable-next-line functional/no-let
    let bullishScore = 0;
    // eslint-disable-next-line functional/no-let
    let bearishScore = 0;
    // eslint-disable-next-line functional/no-let
    let neutralScore = 0;

    for (const event of events) {
      const contribution = this.calculateEventContribution(event, direction);
      // eslint-disable-next-line functional/immutable-data
      contributions.push(contribution);

      // Accumulate weighted sentiment
      totalWeight += contribution.weight;
      weightedSentiment += contribution.contribution * contribution.weight;

      // Track directional scores
      if (contribution.direction === 'bullish') {
        bullishScore += contribution.weight * 100;
      } else if (contribution.direction === 'bearish') {
        bearishScore += contribution.weight * 100;
      } else {
        neutralScore += contribution.weight * 100;
      }
    }

    // Normalize sentiment to -100 to +100 range
    const sentiment = totalWeight > 0 ? Math.round(weightedSentiment / totalWeight) : 0;

    // Calculate confidence based on event quality and agreement
    const confidence = this.calculateConfidence(contributions, totalWeight);

    // Normalize directional scores
    const totalDirectional = bullishScore + bearishScore + neutralScore;
    if (totalDirectional > 0) {
      bullishScore = Math.round((bullishScore / totalDirectional) * 100);
      bearishScore = Math.round((bearishScore / totalDirectional) * 100);
      neutralScore = Math.round((neutralScore / totalDirectional) * 100);
    }

    return {
      sentiment: this.clampSentiment(sentiment),
      confidence: Math.round(confidence),
      bullishScore,
      bearishScore,
      neutralScore,
      eventContributions: contributions,
    };
  }

  /**
   * Calculate sentiment from relevance-scored events
   */
  calculateSentimentFromRelevance(
    relevances: EventRelevance[],
    direction: 'long' | 'short'
  ): SentimentResult {
    if (relevances.length === 0) {
      return this.createNeutralResult();
    }

    const contributions: EventContribution[] = [];
    // eslint-disable-next-line functional/no-let
    let totalWeight = 0;
    // eslint-disable-next-line functional/no-let
    let weightedSentiment = 0;
    // eslint-disable-next-line functional/no-let
    let bullishScore = 0;
    // eslint-disable-next-line functional/no-let
    let bearishScore = 0;
    // eslint-disable-next-line functional/no-let
    let neutralScore = 0;

    for (const relevance of relevances) {
      const contribution = this.calculateEventContribution(
        relevance.event,
        direction,
        relevance.relevanceScore / 100 // Use relevance as additional weight
      );
      // eslint-disable-next-line functional/immutable-data
      contributions.push(contribution);

      totalWeight += contribution.weight;
      weightedSentiment += contribution.contribution * contribution.weight;

      if (contribution.direction === 'bullish') {
        bullishScore += contribution.weight * 100;
      } else if (contribution.direction === 'bearish') {
        bearishScore += contribution.weight * 100;
      } else {
        neutralScore += contribution.weight * 100;
      }
    }

    const sentiment = totalWeight > 0 ? Math.round(weightedSentiment / totalWeight) : 0;

    const confidence = this.calculateConfidence(contributions, totalWeight);

    const totalDirectional = bullishScore + bearishScore + neutralScore;
    if (totalDirectional > 0) {
      bullishScore = Math.round((bullishScore / totalDirectional) * 100);
      bearishScore = Math.round((bearishScore / totalDirectional) * 100);
      neutralScore = Math.round((neutralScore / totalDirectional) * 100);
    }

    return {
      sentiment: this.clampSentiment(sentiment),
      confidence: Math.round(confidence),
      bullishScore,
      bearishScore,
      neutralScore,
      eventContributions: contributions,
    };
  }

  /**
   * Calculate individual event contribution to sentiment
   */
  private calculateEventContribution(
    event: PredictionMarketEvent,
    direction: 'long' | 'short',
    relevanceWeight: number = 1.0
  ): EventContribution {
    // Determine event direction (bullish/bearish/neutral)
    const eventDirection = this.determineEventDirection(event);

    // Calculate base contribution from probability
    // eslint-disable-next-line functional/no-let
    let contribution = this.calculateBaseContribution(event, eventDirection);

    // Adjust for trading direction
    if (direction === 'short') {
      contribution = -contribution; // Invert for short positions
    }

    // Calculate weight factors
    const categoryWeight = this.config.categoryWeights[event.category] || 0.5;
    const impactWeight = this.getImpactWeight(event.impact);
    const timeDecay = this.calculateTimeDecay(event.resolution);
    const volumeWeight = this.calculateVolumeWeight(event.volume, event.liquidity);

    // Combine weights
    const weight = categoryWeight * impactWeight * timeDecay * volumeWeight * relevanceWeight;

    return {
      eventId: event.id,
      eventTitle: event.title,
      contribution: this.clampSentiment(contribution),
      weight: Math.min(1, Math.max(0, weight)),
      direction: eventDirection,
      timeDecay,
    };
  }

  /**
   * Determine if an event is bullish, bearish, or neutral
   */
  private determineEventDirection(event: PredictionMarketEvent): 'bullish' | 'bearish' | 'neutral' {
    const text = `${event.title} ${event.description}`.toLowerCase();

    // Check for bullish patterns
    const bullishMatches = BULLISH_PATTERNS.filter(p => text.includes(p)).length;

    // Check for bearish patterns
    const bearishMatches = BEARISH_PATTERNS.filter(p => text.includes(p)).length;

    if (bullishMatches > bearishMatches) {
      return 'bullish';
    }

    if (bearishMatches > bullishMatches) {
      return 'bearish';
    }

    return 'neutral';
  }

  /**
   * Calculate base contribution from event probability
   */
  private calculateBaseContribution(
    event: PredictionMarketEvent,
    direction: 'bullish' | 'bearish' | 'neutral'
  ): number {
    const probability =
      !isNaN(event.probability) && event.probability >= 0 && event.probability <= 100
        ? event.probability
        : 50;

    if (direction === 'neutral') {
      // Neutral events contribute based on uncertainty
      // High probability (either way) = low uncertainty = low contribution
      const uncertainty = 100 - Math.abs(probability - 50) * 2;
      return (uncertainty - 50) * 0.2; // Small contribution
    }

    if (direction === 'bullish') {
      // High probability of bullish event = positive contribution
      return (probability - 50) * 2; // Scale to -100 to +100
    }

    // Bearish: High probability of bearish event = negative contribution
    return -(probability - 50) * 2;
  }

  // ============================================================================
  // WEIGHT CALCULATIONS
  // ============================================================================

  /**
   * Get weight multiplier for impact level
   */
  private getImpactWeight(impact: ImpactLevel): number {
    switch (impact) {
      case ImpactLevel.EXTREME:
        return 1.0;
      case ImpactLevel.HIGH:
        return 0.8;
      case ImpactLevel.MEDIUM:
        return 0.6;
      case ImpactLevel.LOW:
      default:
        return 0.4;
    }
  }

  /**
   * Calculate time decay factor
   * Events closer to resolution have higher weight
   */
  calculateTimeDecay(resolution: Date): number {
    const now = new Date();
    const hoursUntilResolution = (resolution.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilResolution <= 0) {
      return 0.1; // Past events have minimal weight
    }

    // Exponential decay with configurable half-life
    const halfLife = this.config.timeDecayHalfLife;
    const decay = Math.pow(0.5, hoursUntilResolution / halfLife);

    // Higher decay value = closer event = higher weight
    return decay + 0.1; // Minimum 0.1 weight
  }

  /**
   * Calculate volume/liquidity weight
   * Higher volume and liquidity = more reliable signal
   */
  private calculateVolumeWeight(volume: number, liquidity: number): number {
    // Normalize volume (assume $1M is high volume)
    const safeVolume = typeof volume === 'number' && !isNaN(volume) ? volume : 0;
    const normalizedVolume = Math.min(1, safeVolume / 1000000);

    // Normalize liquidity (assume $100K is high liquidity)
    const safeLiquidity = typeof liquidity === 'number' && !isNaN(liquidity) ? liquidity : 0;
    const normalizedLiquidity = Math.min(1, safeLiquidity / 100000);

    // Combine with configurable factor
    const volumeComponent = normalizedVolume * this.config.volumeWeightFactor;
    const liquidityComponent = normalizedLiquidity * this.config.volumeWeightFactor;
    const baseWeight = 1 - this.config.volumeWeightFactor * 2;

    return baseWeight + volumeComponent + liquidityComponent;
  }

  // ============================================================================
  // CONFIDENCE CALCULATION
  // ============================================================================

  /**
   * Calculate confidence score based on event quality and agreement
   * Requirement 1.2: Add confidence calculation based on event volume and liquidity
   */
  private calculateConfidence(contributions: EventContribution[], totalWeight: number): number {
    if (contributions.length === 0) {
      return 0;
    }

    // Factor 1: Number of events (more events = higher confidence)
    const eventCountFactor = Math.min(1, contributions.length / 10) * 30;

    // Factor 2: Total weight (higher quality events = higher confidence)
    const weightFactor = Math.min(1, totalWeight / contributions.length) * 30;

    // Factor 3: Agreement between events
    const agreementFactor = this.calculateAgreementFactor(contributions) * 40;

    const confidence = eventCountFactor + weightFactor + agreementFactor;

    return Math.min(100, Math.max(0, confidence));
  }

  /**
   * Calculate agreement factor between events
   */
  private calculateAgreementFactor(contributions: EventContribution[]): number {
    if (contributions.length <= 1) {
      return 0.5; // Single event = neutral agreement
    }

    // eslint-disable-next-line functional/no-let
    let bullishCount = 0;
    // eslint-disable-next-line functional/no-let
    let bearishCount = 0;
    // eslint-disable-next-line functional/no-let
    let neutralCount = 0;

    for (const contribution of contributions) {
      if (contribution.direction === 'bullish') bullishCount++;
      else if (contribution.direction === 'bearish') bearishCount++;
      else neutralCount++;
    }

    const total = contributions.length;
    const maxDirection = Math.max(bullishCount, bearishCount, neutralCount);

    // Higher agreement = higher factor
    return maxDirection / total;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clamp sentiment to valid range
   */
  private clampSentiment(sentiment: number): number {
    return Math.min(100, Math.max(-100, Math.round(sentiment)));
  }

  /**
   * Create neutral result for empty events
   */
  private createNeutralResult(): SentimentResult {
    return {
      sentiment: 0,
      confidence: 0,
      bullishScore: 0,
      bearishScore: 0,
      neutralScore: 100,
      eventContributions: [],
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SentimentCalculatorConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };

    if (config.categoryWeights) {
      // eslint-disable-next-line functional/immutable-data
      this.config.categoryWeights = {
        ...this.config.categoryWeights,
        ...config.categoryWeights,
      };
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): SentimentCalculatorConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.removeAllListeners();
  }
}
