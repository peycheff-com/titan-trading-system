/**
 * PerformanceAnalytics - Enhancement Effectiveness Tracking
 *
 * Tracks and analyzes the performance of 2026 enhancement layers:
 * - Oracle integration win rate improvement
 * - Global CVD false signal reduction
 * - Bot Trap avoided loss tracking
 * - Prediction accuracy measurement
 * - Conviction multiplier performance
 *
 * Requirements: 15.1-15.7 (Performance Analytics for 2026 Enhancements)
 */

import { EventEmitter } from 'events';
import { BotTrapAnalysis, GlobalCVDData, OracleScore, TechnicalSignal } from '../types';
import { Logger } from '@titan/shared';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Trade record with enhancement data
 */
const logger = Logger.getInstance('hunter:PerformanceAnalytics');

export interface EnhancedTradeRecord {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  duration: number;
  exitReason: 'take_profit' | 'stop_loss' | 'manual' | 'emergency';
  timestamp: Date;

  // Enhancement data at entry
  oracleScore: OracleScore | null;
  oracleAligned: boolean;
  globalCVDConfirmed: boolean;
  globalCVDConsensus: string | null;
  botTrapFlagged: boolean;
  botTrapSuspicionScore: number;
  convictionMultiplier: number;

  // Classic vs Enhanced comparison
  usedEnhancements: boolean;
  classicSignalConfidence: number;
  enhancedSignalConfidence: number;
}

/**
 * Oracle effectiveness metrics
 * Requirement 15.1: Track win rate improvement from Oracle integration
 */
export interface OracleEffectivenessMetrics {
  totalSignals: number;
  alignedSignals: number;
  conflictingSignals: number;
  vetoedSignals: number;

  // Win rates
  alignedWinRate: number;
  conflictingWinRate: number;
  overallWinRate: number;

  // Win rate improvement
  winRateImprovement: number; // Percentage improvement when aligned

  // Veto effectiveness
  vetoedWouldHaveLost: number;
  vetoEffectiveness: number; // % of vetoes that prevented losses

  // Conviction multiplier impact
  avgMultiplierOnWins: number;
  avgMultiplierOnLosses: number;
  multiplierProfitContribution: number;
}

/**
 * Global CVD effectiveness metrics
 * Requirement 15.2: Measure false signal reduction from Global CVD
 */
export interface GlobalCVDEffectivenessMetrics {
  totalSignals: number;
  confirmedSignals: number;
  rejectedSignals: number;

  // Win rates
  confirmedWinRate: number;
  rejectedWouldHaveWonRate: number;

  // False signal reduction
  falseSignalsAvoided: number;
  falseSignalReductionRate: number;

  // Consensus accuracy
  consensusAccuracy: number;
  manipulationDetections: number;
  manipulationAccuracy: number;

  // Multi-exchange benefit
  singleExchangeWinRate: number;
  multiExchangeWinRate: number;
  multiExchangeImprovement: number;
}

/**
 * Bot Trap effectiveness metrics
 * Requirement 15.3: Track avoided losses from Bot Trap detection
 */
export interface BotTrapEffectivenessMetrics {
  totalPatterns: number;
  flaggedPatterns: number;
  unflaggedPatterns: number;

  // Accuracy
  truePositives: number; // Flagged and would have lost
  falsePositives: number; // Flagged but would have won
  trueNegatives: number; // Not flagged and won
  falseNegatives: number; // Not flagged but lost

  // Rates
  detectionAccuracy: number;
  falsePositiveRate: number;
  falseNegativeRate: number;

  // Avoided losses
  avoidedLosses: number;
  avoidedLossAmount: number;
  avgAvoidedLossPercent: number;

  // Risk adjustment effectiveness
  reducedSizeWinRate: number;
  reducedSizeProfitFactor: number;
}

/**
 * Prediction accuracy metrics
 * Requirement 15.4, 15.5: Measure Oracle Score vs actual outcome
 */
export interface PredictionAccuracyMetrics {
  totalPredictions: number;

  // Sentiment accuracy
  bullishPredictions: number;
  bullishCorrect: number;
  bearishPredictions: number;
  bearishCorrect: number;
  sentimentAccuracy: number;

  // Conviction multiplier performance
  highConvictionTrades: number;
  highConvictionWinRate: number;
  lowConvictionTrades: number;
  lowConvictionWinRate: number;
  convictionCorrelation: number;

  // Event prediction accuracy
  eventPredictions: number;
  eventCorrect: number;
  eventAccuracy: number;

  // Volatility forecasting
  volatilityPredictions: number;
  volatilityCorrect: number;
  volatilityAccuracy: number;
}

/**
 * Comprehensive performance report
 * Requirement 15.6, 15.7: Generate comparative performance reports
 */
export interface PerformanceReport {
  period: {
    start: Date;
    end: Date;
    tradingDays: number;
  };

  // Overall metrics
  totalTrades: number;
  enhancedTrades: number;
  classicTrades: number;

  // Win rates
  overallWinRate: number;
  enhancedWinRate: number;
  classicWinRate: number;

  // Returns
  totalReturn: number;
  enhancedReturn: number;
  classicReturn: number;

  // Risk-adjusted returns
  sharpeRatio: number;
  enhancedSharpeRatio: number;
  classicSharpeRatio: number;

  // Enhancement layer contributions
  oracleContribution: number;
  globalCVDContribution: number;
  botTrapContribution: number;

  // Detailed metrics
  oracleMetrics: OracleEffectivenessMetrics;
  globalCVDMetrics: GlobalCVDEffectivenessMetrics;
  botTrapMetrics: BotTrapEffectivenessMetrics;
  predictionMetrics: PredictionAccuracyMetrics;

  // Optimization suggestions
  suggestions: OptimizationSuggestion[];

  timestamp: Date;
}

/**
 * Optimization suggestion
 * Requirement 15.7: Suggest optimization priorities
 */
export interface OptimizationSuggestion {
  layer: 'oracle' | 'globalCVD' | 'botTrap' | 'conviction' | 'general';
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
  expectedImprovement: number;
  reasoning: string;
}

/**
 * Vetoed signal record for tracking
 */
export interface VetoedSignalRecord {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  vetoReason: string;
  vetoSource: 'oracle' | 'globalCVD' | 'botTrap' | 'risk';
  timestamp: Date;

  // What would have happened
  wouldHaveEnteredAt: number;
  actualPriceAfter: number;
  wouldHaveWon: boolean;
  potentialPnlPercent: number;
}

/**
 * Configuration for Performance Analytics
 */
export interface PerformanceAnalyticsConfig {
  /** Minimum trades for statistical significance */
  minTradesForStats: number;
  /** Rolling window for metrics (days) */
  rollingWindowDays: number;
  /** High conviction threshold */
  highConvictionThreshold: number;
  /** Enable detailed logging */
  enableDetailedLogging: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_PERFORMANCE_ANALYTICS_CONFIG: PerformanceAnalyticsConfig = {
  minTradesForStats: 20,
  rollingWindowDays: 30,
  highConvictionThreshold: 1.3,
  enableDetailedLogging: true,
};

// ============================================================================
// PERFORMANCE ANALYTICS CLASS
// ============================================================================

/**
 * PerformanceAnalytics - Main analytics engine for 2026 enhancements
 *
 * Requirements:
 * - 15.1: Track win rate improvement from Oracle integration
 * - 15.2: Measure false signal reduction from Global CVD
 * - 15.3: Track avoided losses from Bot Trap detection
 * - 15.4: Compare Oracle Score predictions with actual outcomes
 * - 15.5: Track performance impact of Conviction Multipliers
 * - 15.6: Show contribution of each enhancement layer
 * - 15.7: Suggest optimization priorities
 */
export class PerformanceAnalytics extends EventEmitter {
  private config: PerformanceAnalyticsConfig;
  private tradeRecords: EnhancedTradeRecord[] = [];
  private vetoedSignals: VetoedSignalRecord[] = [];
  private pendingSignals: Map<string, TechnicalSignal & { enhancementData: any }> = new Map();

  constructor(config: Partial<PerformanceAnalyticsConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PERFORMANCE_ANALYTICS_CONFIG, ...config };
  }

  // ============================================================================
  // TRADE RECORDING
  // ============================================================================

  /**
   * Record a completed trade with enhancement data
   */
  recordTrade(trade: EnhancedTradeRecord): void {
    // eslint-disable-next-line functional/immutable-data
    this.tradeRecords.push(trade);
    this.emit('tradeRecorded', trade);

    // Remove from pending if exists
    // eslint-disable-next-line functional/immutable-data
    this.pendingSignals.delete(trade.id);

    if (this.config.enableDetailedLogging) {
      logger.info(
        `📊 Trade recorded: ${trade.symbol} ${trade.direction} - PnL: ${trade.pnlPercent.toFixed(
          2
        )}%`
      );
    }
  }

  /**
   * Record a signal that was generated (before execution)
   */
  recordSignal(
    signalId: string,
    signal: TechnicalSignal,
    enhancementData: {
      oracleScore: OracleScore | null;
      globalCVD: GlobalCVDData | null;
      botTrapAnalysis: BotTrapAnalysis | null;
      convictionMultiplier: number;
      usedEnhancements: boolean;
    }
  ): void {
    // eslint-disable-next-line functional/immutable-data
    this.pendingSignals.set(signalId, { ...signal, enhancementData });
  }

  /**
   * Record a vetoed signal for effectiveness tracking
   */
  recordVetoedSignal(record: VetoedSignalRecord): void {
    // eslint-disable-next-line functional/immutable-data
    this.vetoedSignals.push(record);
    this.emit('signalVetoed', record);

    if (this.config.enableDetailedLogging) {
      logger.info(
        `🚫 Signal vetoed: ${record.symbol} ${record.direction} - Reason: ${record.vetoReason}`
      );
    }
  }

  /**
   * Update vetoed signal with actual outcome
   */
  updateVetoedSignalOutcome(
    signalId: string,
    actualPriceAfter: number,
    wouldHaveWon: boolean,
    potentialPnlPercent: number
  ): void {
    const record = this.vetoedSignals.find(v => v.id === signalId);
    if (record) {
      // eslint-disable-next-line functional/immutable-data
      record.actualPriceAfter = actualPriceAfter;
      // eslint-disable-next-line functional/immutable-data
      record.wouldHaveWon = wouldHaveWon;
      // eslint-disable-next-line functional/immutable-data
      record.potentialPnlPercent = potentialPnlPercent;
    }
  }

  // ============================================================================
  // ORACLE EFFECTIVENESS (Requirement 15.1)
  // ============================================================================

  /**
   * Calculate Oracle effectiveness metrics
   * Requirement 15.1: Track win rate improvement from Oracle integration
   */
  calculateOracleEffectiveness(windowDays?: number): OracleEffectivenessMetrics {
    const trades = this.getTradesInWindow(windowDays);

    if (trades.length < this.config.minTradesForStats) {
      return this.createEmptyOracleMetrics();
    }

    // Separate trades by Oracle alignment
    const alignedTrades = trades.filter(t => t.oracleAligned && t.oracleScore !== null);
    const conflictingTrades = trades.filter(t => !t.oracleAligned && t.oracleScore !== null);
    const vetoedByOracle = this.vetoedSignals.filter(v => v.vetoSource === 'oracle');

    // Calculate win rates
    const alignedWins = alignedTrades.filter(t => t.pnl > 0).length;
    const conflictingWins = conflictingTrades.filter(t => t.pnl > 0).length;
    const overallWins = trades.filter(t => t.pnl > 0).length;

    const alignedWinRate =
      alignedTrades.length > 0 ? (alignedWins / alignedTrades.length) * 100 : 0;
    const conflictingWinRate =
      conflictingTrades.length > 0 ? (conflictingWins / conflictingTrades.length) * 100 : 0;
    const overallWinRate = trades.length > 0 ? (overallWins / trades.length) * 100 : 0;

    // Calculate win rate improvement
    const winRateImprovement = alignedWinRate - conflictingWinRate;

    // Calculate veto effectiveness
    const vetoedWouldHaveLost = vetoedByOracle.filter(v => !v.wouldHaveWon).length;
    const vetoEffectiveness =
      vetoedByOracle.length > 0 ? (vetoedWouldHaveLost / vetoedByOracle.length) * 100 : 0;

    // Calculate conviction multiplier impact
    const winsWithMultiplier = alignedTrades.filter(t => t.pnl > 0);
    const lossesWithMultiplier = alignedTrades.filter(t => t.pnl <= 0);

    const avgMultiplierOnWins =
      winsWithMultiplier.length > 0
        ? winsWithMultiplier.reduce((sum, t) => sum + t.convictionMultiplier, 0) /
          winsWithMultiplier.length
        : 1.0;
    const avgMultiplierOnLosses =
      lossesWithMultiplier.length > 0
        ? lossesWithMultiplier.reduce((sum, t) => sum + t.convictionMultiplier, 0) /
          lossesWithMultiplier.length
        : 1.0;

    // Calculate profit contribution from multipliers
    const multiplierProfitContribution = this.calculateMultiplierContribution(alignedTrades);

    return {
      totalSignals: trades.filter(t => t.oracleScore !== null).length,
      alignedSignals: alignedTrades.length,
      conflictingSignals: conflictingTrades.length,
      vetoedSignals: vetoedByOracle.length,
      alignedWinRate,
      conflictingWinRate,
      overallWinRate,
      winRateImprovement,
      vetoedWouldHaveLost,
      vetoEffectiveness,
      avgMultiplierOnWins,
      avgMultiplierOnLosses,
      multiplierProfitContribution,
    };
  }

  // ============================================================================
  // GLOBAL CVD EFFECTIVENESS (Requirement 15.2)
  // ============================================================================

  /**
   * Calculate Global CVD effectiveness metrics
   * Requirement 15.2: Measure false signal reduction from Global CVD
   */
  calculateGlobalCVDEffectiveness(windowDays?: number): GlobalCVDEffectivenessMetrics {
    const trades = this.getTradesInWindow(windowDays);

    if (trades.length < this.config.minTradesForStats) {
      return this.createEmptyGlobalCVDMetrics();
    }

    // Separate trades by Global CVD confirmation
    const confirmedTrades = trades.filter(t => t.globalCVDConfirmed);
    const rejectedByGlobalCVD = this.vetoedSignals.filter(v => v.vetoSource === 'globalCVD');

    // Calculate win rates
    const confirmedWins = confirmedTrades.filter(t => t.pnl > 0).length;
    const confirmedWinRate =
      confirmedTrades.length > 0 ? (confirmedWins / confirmedTrades.length) * 100 : 0;

    // Calculate rejected signals that would have won
    const rejectedWouldHaveWon = rejectedByGlobalCVD.filter(v => v.wouldHaveWon).length;
    const rejectedWouldHaveWonRate =
      rejectedByGlobalCVD.length > 0
        ? (rejectedWouldHaveWon / rejectedByGlobalCVD.length) * 100
        : 0;

    // Calculate false signal reduction
    const falseSignalsAvoided = rejectedByGlobalCVD.filter(v => !v.wouldHaveWon).length;
    const falseSignalReductionRate =
      rejectedByGlobalCVD.length > 0 ? (falseSignalsAvoided / rejectedByGlobalCVD.length) * 100 : 0;

    // Calculate consensus accuracy
    const consensusTrades = trades.filter(t => t.globalCVDConsensus !== null);
    const consensusCorrect = consensusTrades.filter(t => {
      const expectedDirection = t.globalCVDConsensus === 'bullish' ? 'LONG' : 'SHORT';
      return t.direction === expectedDirection && t.pnl > 0;
    }).length;
    const consensusAccuracy =
      consensusTrades.length > 0 ? (consensusCorrect / consensusTrades.length) * 100 : 0;

    // Multi-exchange vs single exchange comparison
    const multiExchangeTrades = confirmedTrades;
    const singleExchangeTrades = trades.filter(t => !t.globalCVDConfirmed && !t.usedEnhancements);

    const multiExchangeWinRate =
      multiExchangeTrades.length > 0
        ? (multiExchangeTrades.filter(t => t.pnl > 0).length / multiExchangeTrades.length) * 100
        : 0;
    const singleExchangeWinRate =
      singleExchangeTrades.length > 0
        ? (singleExchangeTrades.filter(t => t.pnl > 0).length / singleExchangeTrades.length) * 100
        : 0;

    return {
      totalSignals: trades.length,
      confirmedSignals: confirmedTrades.length,
      rejectedSignals: rejectedByGlobalCVD.length,
      confirmedWinRate,
      rejectedWouldHaveWonRate,
      falseSignalsAvoided,
      falseSignalReductionRate,
      consensusAccuracy,
      manipulationDetections: 0, // TODO: Track from GlobalLiquidityAggregator
      manipulationAccuracy: 0,
      singleExchangeWinRate,
      multiExchangeWinRate,
      multiExchangeImprovement: multiExchangeWinRate - singleExchangeWinRate,
    };
  }

  // ============================================================================
  // BOT TRAP EFFECTIVENESS (Requirement 15.3)
  // ============================================================================

  /**
   * Calculate Bot Trap effectiveness metrics
   * Requirement 15.3: Track avoided losses from Bot Trap detection
   */
  calculateBotTrapEffectiveness(windowDays?: number): BotTrapEffectivenessMetrics {
    const trades = this.getTradesInWindow(windowDays);
    const vetoedByBotTrap = this.vetoedSignals.filter(v => v.vetoSource === 'botTrap');

    if (trades.length < this.config.minTradesForStats) {
      return this.createEmptyBotTrapMetrics();
    }

    // Separate trades by bot trap flagging
    const flaggedTrades = trades.filter(t => t.botTrapFlagged);
    const unflaggedTrades = trades.filter(t => !t.botTrapFlagged);

    // Calculate confusion matrix
    const truePositives = vetoedByBotTrap.filter(v => !v.wouldHaveWon).length;
    const falsePositives = vetoedByBotTrap.filter(v => v.wouldHaveWon).length;
    const trueNegatives = unflaggedTrades.filter(t => t.pnl > 0).length;
    const falseNegatives = unflaggedTrades.filter(t => t.pnl <= 0).length;

    const total = truePositives + falsePositives + trueNegatives + falseNegatives;
    const detectionAccuracy = total > 0 ? ((truePositives + trueNegatives) / total) * 100 : 0;
    const falsePositiveRate =
      truePositives + falsePositives > 0
        ? (falsePositives / (truePositives + falsePositives)) * 100
        : 0;
    const falseNegativeRate =
      trueNegatives + falseNegatives > 0
        ? (falseNegatives / (trueNegatives + falseNegatives)) * 100
        : 0;

    // Calculate avoided losses
    const avoidedLosses = truePositives;
    const avoidedLossAmount = vetoedByBotTrap
      .filter(v => !v.wouldHaveWon)
      .reduce((sum, v) => sum + Math.abs(v.potentialPnlPercent), 0);
    const avgAvoidedLossPercent = avoidedLosses > 0 ? avoidedLossAmount / avoidedLosses : 0;

    // Calculate reduced size trade performance
    const reducedSizeTrades = flaggedTrades.filter(t => t.convictionMultiplier < 1.0);
    const reducedSizeWins = reducedSizeTrades.filter(t => t.pnl > 0).length;
    const reducedSizeWinRate =
      reducedSizeTrades.length > 0 ? (reducedSizeWins / reducedSizeTrades.length) * 100 : 0;

    const reducedSizeProfit = reducedSizeTrades
      .filter(t => t.pnl > 0)
      .reduce((sum, t) => sum + t.pnl, 0);
    const reducedSizeLoss = Math.abs(
      reducedSizeTrades.filter(t => t.pnl <= 0).reduce((sum, t) => sum + t.pnl, 0)
    );
    const reducedSizeProfitFactor =
      reducedSizeLoss > 0 ? reducedSizeProfit / reducedSizeLoss : reducedSizeProfit;

    return {
      totalPatterns: trades.length,
      flaggedPatterns: flaggedTrades.length + vetoedByBotTrap.length,
      unflaggedPatterns: unflaggedTrades.length,
      truePositives,
      falsePositives,
      trueNegatives,
      falseNegatives,
      detectionAccuracy,
      falsePositiveRate,
      falseNegativeRate,
      avoidedLosses,
      avoidedLossAmount,
      avgAvoidedLossPercent,
      reducedSizeWinRate,
      reducedSizeProfitFactor,
    };
  }

  // ============================================================================
  // PREDICTION ACCURACY (Requirements 15.4, 15.5)
  // ============================================================================

  /**
   * Calculate prediction accuracy metrics
   * Requirements 15.4, 15.5: Compare Oracle Score with actual outcomes
   */
  calculatePredictionAccuracy(windowDays?: number): PredictionAccuracyMetrics {
    const trades = this.getTradesInWindow(windowDays);
    const tradesWithOracle = trades.filter(t => t.oracleScore !== null);

    if (tradesWithOracle.length < this.config.minTradesForStats) {
      return this.createEmptyPredictionMetrics();
    }

    // Sentiment accuracy
    const bullishPredictions = tradesWithOracle.filter(t => t.oracleScore!.sentiment > 0);
    const bearishPredictions = tradesWithOracle.filter(t => t.oracleScore!.sentiment < 0);

    const bullishCorrect = bullishPredictions.filter(
      t => (t.direction === 'LONG' && t.pnl > 0) || (t.direction === 'SHORT' && t.pnl <= 0)
    ).length;
    const bearishCorrect = bearishPredictions.filter(
      t => (t.direction === 'SHORT' && t.pnl > 0) || (t.direction === 'LONG' && t.pnl <= 0)
    ).length;

    const sentimentAccuracy =
      bullishPredictions.length + bearishPredictions.length > 0
        ? ((bullishCorrect + bearishCorrect) /
            (bullishPredictions.length + bearishPredictions.length)) *
          100
        : 0;

    // Conviction multiplier performance
    const highConvictionTrades = tradesWithOracle.filter(
      t => t.convictionMultiplier >= this.config.highConvictionThreshold
    );
    const lowConvictionTrades = tradesWithOracle.filter(
      t => t.convictionMultiplier < this.config.highConvictionThreshold
    );

    const highConvictionWinRate =
      highConvictionTrades.length > 0
        ? (highConvictionTrades.filter(t => t.pnl > 0).length / highConvictionTrades.length) * 100
        : 0;
    const lowConvictionWinRate =
      lowConvictionTrades.length > 0
        ? (lowConvictionTrades.filter(t => t.pnl > 0).length / lowConvictionTrades.length) * 100
        : 0;

    // Calculate conviction correlation
    const convictionCorrelation = this.calculateCorrelation(
      tradesWithOracle.map(t => t.convictionMultiplier),
      tradesWithOracle.map(t => (t.pnl > 0 ? 1 : 0))
    );

    return {
      totalPredictions: tradesWithOracle.length,
      bullishPredictions: bullishPredictions.length,
      bullishCorrect,
      bearishPredictions: bearishPredictions.length,
      bearishCorrect,
      sentimentAccuracy,
      highConvictionTrades: highConvictionTrades.length,
      highConvictionWinRate,
      lowConvictionTrades: lowConvictionTrades.length,
      lowConvictionWinRate,
      convictionCorrelation,
      eventPredictions: 0, // TODO: Track event-specific predictions
      eventCorrect: 0,
      eventAccuracy: 0,
      volatilityPredictions: 0,
      volatilityCorrect: 0,
      volatilityAccuracy: 0,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get trades within the specified window
   */
  private getTradesInWindow(windowDays?: number): EnhancedTradeRecord[] {
    const days = windowDays || this.config.rollingWindowDays;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.tradeRecords.filter(t => t.timestamp >= cutoff);
  }

  /**
   * Calculate multiplier contribution to profits
   */
  private calculateMultiplierContribution(trades: EnhancedTradeRecord[]): number {
    if (trades.length === 0) return 0;

    // eslint-disable-next-line functional/no-let
    let actualProfit = 0;
    // eslint-disable-next-line functional/no-let
    let baseProfit = 0;

    for (const trade of trades) {
      actualProfit += trade.pnl;
      baseProfit += trade.pnl / trade.convictionMultiplier;
    }

    return actualProfit - baseProfit;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Create empty Oracle metrics
   */
  private createEmptyOracleMetrics(): OracleEffectivenessMetrics {
    return {
      totalSignals: 0,
      alignedSignals: 0,
      conflictingSignals: 0,
      vetoedSignals: 0,
      alignedWinRate: 0,
      conflictingWinRate: 0,
      overallWinRate: 0,
      winRateImprovement: 0,
      vetoedWouldHaveLost: 0,
      vetoEffectiveness: 0,
      avgMultiplierOnWins: 1.0,
      avgMultiplierOnLosses: 1.0,
      multiplierProfitContribution: 0,
    };
  }

  /**
   * Create empty Global CVD metrics
   */
  private createEmptyGlobalCVDMetrics(): GlobalCVDEffectivenessMetrics {
    return {
      totalSignals: 0,
      confirmedSignals: 0,
      rejectedSignals: 0,
      confirmedWinRate: 0,
      rejectedWouldHaveWonRate: 0,
      falseSignalsAvoided: 0,
      falseSignalReductionRate: 0,
      consensusAccuracy: 0,
      manipulationDetections: 0,
      manipulationAccuracy: 0,
      singleExchangeWinRate: 0,
      multiExchangeWinRate: 0,
      multiExchangeImprovement: 0,
    };
  }

  /**
   * Create empty Bot Trap metrics
   */
  private createEmptyBotTrapMetrics(): BotTrapEffectivenessMetrics {
    return {
      totalPatterns: 0,
      flaggedPatterns: 0,
      unflaggedPatterns: 0,
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
      detectionAccuracy: 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      avoidedLosses: 0,
      avoidedLossAmount: 0,
      avgAvoidedLossPercent: 0,
      reducedSizeWinRate: 0,
      reducedSizeProfitFactor: 0,
    };
  }

  /**
   * Create empty Prediction metrics
   */
  private createEmptyPredictionMetrics(): PredictionAccuracyMetrics {
    return {
      totalPredictions: 0,
      bullishPredictions: 0,
      bullishCorrect: 0,
      bearishPredictions: 0,
      bearishCorrect: 0,
      sentimentAccuracy: 0,
      highConvictionTrades: 0,
      highConvictionWinRate: 0,
      lowConvictionTrades: 0,
      lowConvictionWinRate: 0,
      convictionCorrelation: 0,
      eventPredictions: 0,
      eventCorrect: 0,
      eventAccuracy: 0,
      volatilityPredictions: 0,
      volatilityCorrect: 0,
      volatilityAccuracy: 0,
    };
  }

  // ============================================================================
  // DATA ACCESS
  // ============================================================================

  /**
   * Get all trade records
   */
  getTradeRecords(): EnhancedTradeRecord[] {
    return [...this.tradeRecords];
  }

  /**
   * Get all vetoed signals
   */
  getVetoedSignals(): VetoedSignalRecord[] {
    return [...this.vetoedSignals];
  }

  /**
   * Get trade count
   */
  getTradeCount(): number {
    return this.tradeRecords.length;
  }

  /**
   * Clear all data
   */
  clearData(): void {
    // eslint-disable-next-line functional/immutable-data
    this.tradeRecords = [];
    // eslint-disable-next-line functional/immutable-data
    this.vetoedSignals = [];
    // eslint-disable-next-line functional/immutable-data
    this.pendingSignals.clear();
  }

  /**
   * Export data for persistence
   */
  exportData(): {
    trades: EnhancedTradeRecord[];
    vetoed: VetoedSignalRecord[];
  } {
    return {
      trades: [...this.tradeRecords],
      vetoed: [...this.vetoedSignals],
    };
  }

  /**
   * Import data from persistence
   */
  importData(data: { trades: EnhancedTradeRecord[]; vetoed: VetoedSignalRecord[] }): void {
    // eslint-disable-next-line functional/immutable-data
    this.tradeRecords = data.trades.map(t => ({
      ...t,
      timestamp: new Date(t.timestamp),
    }));
    // eslint-disable-next-line functional/immutable-data
    this.vetoedSignals = data.vetoed.map(v => ({
      ...v,
      timestamp: new Date(v.timestamp),
    }));
  }
}
