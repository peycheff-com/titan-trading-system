/**
 * ConsensusValidator - Multi-Exchange Consensus Validation System
 * 
 * Implements 2-out-of-3 exchange consensus requirement for signal validation
 * with confidence scoring based on exchange agreement.
 * 
 * Requirements: 4.4 (Cross-Exchange Consensus)
 */

import { EventEmitter } from 'events';
import { ExchangeFlow, ConnectionStatus, GlobalCVDData } from '../types';

/**
 * Consensus validation configuration
 */
export interface ConsensusValidatorConfig {
  consensusThreshold: number; // Minimum ratio of exchanges that must agree (default: 0.67 = 2/3)
  minConnectedExchanges: number; // Minimum exchanges required for validation
  cvdDirectionThreshold: number; // Minimum CVD magnitude to determine direction
  confidenceBoostOnConsensus: number; // Confidence boost when consensus achieved
  confidencePenaltyOnConflict: number; // Confidence penalty when exchanges conflict
}

/**
 * Signal direction for consensus
 */
export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

/**
 * Exchange vote for consensus
 */
export interface ExchangeVote {
  exchange: 'binance' | 'coinbase' | 'kraken';
  direction: SignalDirection;
  cvd: number;
  volume: number;
  weight: number;
  confidence: number;
}

/**
 * Consensus validation result
 */
export interface ConsensusValidationResult {
  isValid: boolean;
  hasConsensus: boolean;
  consensusDirection: SignalDirection;
  confidence: number; // 0-100
  votes: ExchangeVote[];
  agreementRatio: number; // 0-1
  connectedExchanges: number;
  reasoning: string[];
  timestamp: Date;
}

/**
 * Signal validation request
 */
export interface SignalValidationRequest {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  globalCVD: GlobalCVDData;
  technicalConfidence: number;
}

/**
 * Signal validation response
 */
export interface SignalValidationResponse {
  isValid: boolean;
  adjustedConfidence: number;
  consensusResult: ConsensusValidationResult;
  recommendation: 'proceed' | 'reduce_size' | 'veto';
  reasoning: string[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ConsensusValidatorConfig = {
  consensusThreshold: 0.67, // 2 out of 3
  minConnectedExchanges: 2,
  cvdDirectionThreshold: 1000, // $1000 minimum CVD to determine direction
  confidenceBoostOnConsensus: 40, // +40 points on consensus
  confidencePenaltyOnConflict: 30 // -30 points on conflict
};

/**
 * ConsensusValidator - Validates signals using multi-exchange consensus
 * 
 * Requirement 4.4: Require minimum 2 out of 3 exchanges showing same flow direction
 * 
 * Emits events:
 * - 'consensusReached': ConsensusValidationResult
 * - 'consensusFailed': ConsensusValidationResult
 * - 'signalValidated': SignalValidationResponse
 */
export class ConsensusValidator extends EventEmitter {
  private config: ConsensusValidatorConfig;

  constructor(config: Partial<ConsensusValidatorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate consensus from exchange flows
   * Requirement 4.4: Require minimum 2 out of 3 exchanges showing same flow direction
   */
  validateConsensus(exchangeFlows: ExchangeFlow[]): ConsensusValidationResult {
    const reasoning: string[] = [];
    
    // Filter to connected exchanges with trades
    const connectedFlows = exchangeFlows.filter(
      f => f.status === ConnectionStatus.CONNECTED && f.trades > 0
    );

    // Check minimum connected exchanges
    if (connectedFlows.length < this.config.minConnectedExchanges) {
      reasoning.push(`Insufficient connected exchanges: ${connectedFlows.length}/${this.config.minConnectedExchanges} required`);
      return this.createFailedConsensus(exchangeFlows, reasoning);
    }

    // Calculate votes for each exchange
    const votes = this.calculateVotes(connectedFlows);

    // Count votes by direction
    const directionCounts: Record<SignalDirection, number> = {
      bullish: 0,
      bearish: 0,
      neutral: 0
    };

    const weightedVotes: Record<SignalDirection, number> = {
      bullish: 0,
      bearish: 0,
      neutral: 0
    };

    for (const vote of votes) {
      directionCounts[vote.direction]++;
      weightedVotes[vote.direction] += vote.weight;
    }

    // Determine consensus direction (majority vote)
    let consensusDirection: SignalDirection = 'neutral';
    let maxVotes = 0;

    for (const [direction, count] of Object.entries(directionCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        consensusDirection = direction as SignalDirection;
      }
    }

    // Calculate agreement ratio
    const agreementRatio = maxVotes / connectedFlows.length;
    const hasConsensus = agreementRatio >= this.config.consensusThreshold;

    // Calculate confidence
    const confidence = this.calculateConsensusConfidence(votes, hasConsensus, agreementRatio);

    // Build reasoning
    if (hasConsensus) {
      reasoning.push(`Consensus reached: ${maxVotes}/${connectedFlows.length} exchanges agree on ${consensusDirection}`);
      reasoning.push(`Agreement ratio: ${(agreementRatio * 100).toFixed(0)}%`);
    } else {
      reasoning.push(`No consensus: ${maxVotes}/${connectedFlows.length} exchanges agree (need ${(this.config.consensusThreshold * 100).toFixed(0)}%)`);
      reasoning.push(`Votes: Bullish=${directionCounts.bullish}, Bearish=${directionCounts.bearish}, Neutral=${directionCounts.neutral}`);
    }

    const result: ConsensusValidationResult = {
      isValid: hasConsensus,
      hasConsensus,
      consensusDirection,
      confidence,
      votes,
      agreementRatio,
      connectedExchanges: connectedFlows.length,
      reasoning,
      timestamp: new Date()
    };

    // Emit appropriate event
    if (hasConsensus) {
      this.emit('consensusReached', result);
    } else {
      this.emit('consensusFailed', result);
    }

    return result;
  }

  /**
   * Validate a trading signal against multi-exchange consensus
   * Requirement 6.1: Require Global CVD confirmation from minimum 2 out of 3 exchanges
   */
  validateSignal(request: SignalValidationRequest): SignalValidationResponse {
    const { symbol, direction, globalCVD, technicalConfidence } = request;
    const reasoning: string[] = [];

    // Get consensus validation
    const consensusResult = this.validateConsensus(globalCVD.exchangeFlows);

    // Determine expected CVD direction based on signal
    const expectedDirection: SignalDirection = direction === 'LONG' ? 'bullish' : 'bearish';

    // Check if consensus aligns with signal direction
    const consensusAligns = consensusResult.consensusDirection === expectedDirection;
    const consensusConflicts = consensusResult.hasConsensus && 
      consensusResult.consensusDirection !== 'neutral' && 
      !consensusAligns;

    // Calculate adjusted confidence
    let adjustedConfidence = technicalConfidence;

    if (consensusResult.hasConsensus && consensusAligns) {
      // Consensus supports signal - boost confidence
      adjustedConfidence += this.config.confidenceBoostOnConsensus;
      reasoning.push(`Consensus supports ${direction} signal: +${this.config.confidenceBoostOnConsensus} confidence`);
    } else if (consensusConflicts) {
      // Consensus conflicts with signal - reduce confidence
      adjustedConfidence -= this.config.confidencePenaltyOnConflict;
      reasoning.push(`Consensus conflicts with ${direction} signal: -${this.config.confidencePenaltyOnConflict} confidence`);
    } else if (!consensusResult.hasConsensus) {
      // No consensus - slight penalty
      adjustedConfidence -= 10;
      reasoning.push('No exchange consensus: -10 confidence');
    }

    // Cap confidence at 0-100
    adjustedConfidence = Math.max(0, Math.min(100, adjustedConfidence));

    // Determine recommendation
    let recommendation: 'proceed' | 'reduce_size' | 'veto';
    let isValid: boolean;

    if (consensusConflicts && consensusResult.confidence > 70) {
      recommendation = 'veto';
      isValid = false;
      reasoning.push('Strong consensus against signal direction - VETO');
    } else if (consensusConflicts || !consensusResult.hasConsensus) {
      recommendation = 'reduce_size';
      isValid = true;
      reasoning.push('Weak or conflicting consensus - reduce position size');
    } else {
      recommendation = 'proceed';
      isValid = true;
      reasoning.push('Consensus supports signal - proceed with full size');
    }

    const response: SignalValidationResponse = {
      isValid,
      adjustedConfidence,
      consensusResult,
      recommendation,
      reasoning
    };

    this.emit('signalValidated', response);
    return response;
  }

  /**
   * Check if exchanges agree on flow direction
   * Requirement 6.2: Check Coinbase and Kraken for confirmation
   */
  checkExchangeAgreement(
    primaryExchange: 'binance' | 'coinbase' | 'kraken',
    exchangeFlows: ExchangeFlow[]
  ): { agrees: boolean; agreementCount: number; totalExchanges: number } {
    const connectedFlows = exchangeFlows.filter(
      f => f.status === ConnectionStatus.CONNECTED && f.trades > 0
    );

    const primaryFlow = connectedFlows.find(f => f.exchange === primaryExchange);
    if (!primaryFlow) {
      return { agrees: false, agreementCount: 0, totalExchanges: connectedFlows.length };
    }

    const primaryDirection = this.determineDirection(primaryFlow.cvd);
    let agreementCount = 0;

    for (const flow of connectedFlows) {
      const direction = this.determineDirection(flow.cvd);
      if (direction === primaryDirection) {
        agreementCount++;
      }
    }

    return {
      agrees: agreementCount >= this.config.minConnectedExchanges,
      agreementCount,
      totalExchanges: connectedFlows.length
    };
  }

  /**
   * Calculate votes from exchange flows
   */
  private calculateVotes(flows: ExchangeFlow[]): ExchangeVote[] {
    const totalVolume = flows.reduce((sum, f) => sum + f.volume, 0);

    return flows.map(flow => ({
      exchange: flow.exchange,
      direction: this.determineDirection(flow.cvd),
      cvd: flow.cvd,
      volume: flow.volume,
      weight: totalVolume > 0 ? flow.volume / totalVolume : 1 / flows.length,
      confidence: this.calculateVoteConfidence(flow)
    }));
  }

  /**
   * Determine direction from CVD value
   */
  private determineDirection(cvd: number): SignalDirection {
    if (cvd > this.config.cvdDirectionThreshold) return 'bullish';
    if (cvd < -this.config.cvdDirectionThreshold) return 'bearish';
    return 'neutral';
  }

  /**
   * Calculate confidence for a single vote
   */
  private calculateVoteConfidence(flow: ExchangeFlow): number {
    // Base confidence on CVD magnitude and trade count
    const cvdMagnitude = Math.abs(flow.cvd);
    const cvdConfidence = Math.min(50, (cvdMagnitude / 10000) * 50); // Scale to $10k
    const tradeConfidence = Math.min(30, (flow.trades / 100) * 30); // Scale to 100 trades
    const volumeConfidence = Math.min(20, (flow.volume / 100000) * 20); // Scale to $100k

    return cvdConfidence + tradeConfidence + volumeConfidence;
  }

  /**
   * Calculate overall consensus confidence
   */
  private calculateConsensusConfidence(
    votes: ExchangeVote[],
    hasConsensus: boolean,
    agreementRatio: number
  ): number {
    if (!hasConsensus) {
      return Math.max(0, agreementRatio * 50); // Max 50% confidence without consensus
    }

    // Base confidence on agreement ratio
    let confidence = agreementRatio * 60;

    // Add weighted vote confidence
    const avgVoteConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;
    confidence += avgVoteConfidence * 0.4;

    return Math.min(100, confidence);
  }

  /**
   * Create failed consensus result
   */
  private createFailedConsensus(
    exchangeFlows: ExchangeFlow[],
    reasoning: string[]
  ): ConsensusValidationResult {
    const connectedFlows = exchangeFlows.filter(
      f => f.status === ConnectionStatus.CONNECTED
    );

    return {
      isValid: false,
      hasConsensus: false,
      consensusDirection: 'neutral',
      confidence: 0,
      votes: [],
      agreementRatio: 0,
      connectedExchanges: connectedFlows.length,
      reasoning,
      timestamp: new Date()
    };
  }

  /**
   * Get configuration
   */
  getConfig(): ConsensusValidatorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConsensusValidatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Calculate consensus score for display
   * Returns a score from -100 (strong bearish) to +100 (strong bullish)
   */
  calculateConsensusScore(exchangeFlows: ExchangeFlow[]): number {
    const connectedFlows = exchangeFlows.filter(
      f => f.status === ConnectionStatus.CONNECTED && f.trades > 0
    );

    if (connectedFlows.length === 0) return 0;

    // Calculate weighted CVD
    const totalVolume = connectedFlows.reduce((sum, f) => sum + f.volume, 0);
    let weightedCVD = 0;

    for (const flow of connectedFlows) {
      const weight = totalVolume > 0 ? flow.volume / totalVolume : 1 / connectedFlows.length;
      weightedCVD += flow.cvd * weight;
    }

    // Normalize to -100 to +100 scale
    // Assuming $100k CVD is "maximum" for scaling
    const normalizedScore = (weightedCVD / 100000) * 100;
    return Math.max(-100, Math.min(100, normalizedScore));
  }
}
