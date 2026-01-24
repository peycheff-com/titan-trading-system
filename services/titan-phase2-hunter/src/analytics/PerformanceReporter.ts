/**
 * PerformanceReporter - Comprehensive Performance Reporting
 *
 * Generates detailed performance reports and optimization suggestions
 * for the 2026 enhancement layers.
 *
 * Requirements:
 * - 15.4: Compare Oracle Score predictions with actual outcomes
 * - 15.5: Track performance impact of Conviction Multipliers
 * - 15.6: Show contribution of each enhancement layer
 * - 15.7: Suggest optimization priorities
 */

import { EventEmitter } from 'events';
import {
  BotTrapEffectivenessMetrics,
  EnhancedTradeRecord,
  GlobalCVDEffectivenessMetrics,
  OptimizationSuggestion,
  OracleEffectivenessMetrics,
  PerformanceAnalytics,
  PerformanceReport,
  PredictionAccuracyMetrics,
} from './PerformanceAnalytics';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuration for Performance Reporter
 */
export interface PerformanceReporterConfig {
  /** Minimum trades for report generation */
  minTradesForReport: number;
  /** Target win rate for suggestions */
  targetWinRate: number;
  /** Target Sharpe ratio */
  targetSharpeRatio: number;
  /** Enable auto-suggestions */
  enableAutoSuggestions: boolean;
}

/**
 * Layer contribution analysis
 */
export interface LayerContribution {
  layer: string;
  winRateContribution: number;
  returnContribution: number;
  riskReduction: number;
  overallScore: number;
}

/**
 * Comparative analysis between enhanced and classic
 */
export interface ComparativeAnalysis {
  enhancedWinRate: number;
  classicWinRate: number;
  winRateDifference: number;
  enhancedReturn: number;
  classicReturn: number;
  returnDifference: number;
  enhancedSharpe: number;
  classicSharpe: number;
  sharpeDifference: number;
  enhancedMaxDrawdown: number;
  classicMaxDrawdown: number;
  drawdownImprovement: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_REPORTER_CONFIG: PerformanceReporterConfig = {
  minTradesForReport: 20,
  targetWinRate: 55,
  targetSharpeRatio: 1.5,
  enableAutoSuggestions: true,
};

// ============================================================================
// PERFORMANCE REPORTER CLASS
// ============================================================================

/**
 * PerformanceReporter - Generates comprehensive performance reports
 *
 * Requirements:
 * - 15.6: Show contribution of each enhancement layer to overall results
 * - 15.7: Suggest optimization priorities based on enhancement effectiveness
 */
export class PerformanceReporter extends EventEmitter {
  private config: PerformanceReporterConfig;
  private analytics: PerformanceAnalytics;

  constructor(analytics: PerformanceAnalytics, config: Partial<PerformanceReporterConfig> = {}) {
    super();
    this.analytics = analytics;
    this.config = { ...DEFAULT_REPORTER_CONFIG, ...config };
  }

  // ============================================================================
  // COMPREHENSIVE REPORT GENERATION (Requirements 15.6, 15.7)
  // ============================================================================

  /**
   * Generate comprehensive performance report
   * Requirement 15.6: Show contribution of each enhancement layer
   */
  generateReport(windowDays?: number): PerformanceReport {
    const trades = this.analytics.getTradeRecords();
    const days = windowDays || 30;

    // Filter trades by window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const windowTrades = trades.filter(t => t.timestamp >= cutoff);

    // Separate enhanced vs classic trades
    const enhancedTrades = windowTrades.filter(t => t.usedEnhancements);
    const classicTrades = windowTrades.filter(t => !t.usedEnhancements);

    // Calculate metrics
    const oracleMetrics = this.analytics.calculateOracleEffectiveness(days);
    const globalCVDMetrics = this.analytics.calculateGlobalCVDEffectiveness(days);
    const botTrapMetrics = this.analytics.calculateBotTrapEffectiveness(days);
    const predictionMetrics = this.analytics.calculatePredictionAccuracy(days);

    // Calculate overall metrics
    const overallWinRate = this.calculateWinRate(windowTrades);
    const enhancedWinRate = this.calculateWinRate(enhancedTrades);
    const classicWinRate = this.calculateWinRate(classicTrades);

    const totalReturn = this.calculateTotalReturn(windowTrades);
    const enhancedReturn = this.calculateTotalReturn(enhancedTrades);
    const classicReturn = this.calculateTotalReturn(classicTrades);

    const sharpeRatio = this.calculateSharpeRatio(windowTrades);
    const enhancedSharpeRatio = this.calculateSharpeRatio(enhancedTrades);
    const classicSharpeRatio = this.calculateSharpeRatio(classicTrades);

    // Calculate layer contributions
    const oracleContribution = this.calculateOracleContribution(oracleMetrics, enhancedTrades);
    const globalCVDContribution = this.calculateGlobalCVDContribution(
      globalCVDMetrics,
      enhancedTrades
    );
    const botTrapContribution = this.calculateBotTrapContribution(botTrapMetrics);

    // Generate optimization suggestions
    const suggestions = this.config.enableAutoSuggestions
      ? this.generateOptimizationSuggestions(
          oracleMetrics,
          globalCVDMetrics,
          botTrapMetrics,
          predictionMetrics,
          enhancedWinRate,
          sharpeRatio
        )
      : [];

    // Calculate trading days
    const tradingDays = this.calculateTradingDays(windowTrades);

    const report: PerformanceReport = {
      period: {
        start: cutoff,
        end: new Date(),
        tradingDays,
      },
      totalTrades: windowTrades.length,
      enhancedTrades: enhancedTrades.length,
      classicTrades: classicTrades.length,
      overallWinRate,
      enhancedWinRate,
      classicWinRate,
      totalReturn,
      enhancedReturn,
      classicReturn,
      sharpeRatio,
      enhancedSharpeRatio,
      classicSharpeRatio,
      oracleContribution,
      globalCVDContribution,
      botTrapContribution,
      oracleMetrics,
      globalCVDMetrics,
      botTrapMetrics,
      predictionMetrics,
      suggestions,
      timestamp: new Date(),
    };

    this.emit('reportGenerated', report);
    return report;
  }

  // ============================================================================
  // OPTIMIZATION SUGGESTIONS (Requirement 15.7)
  // ============================================================================

  /**
   * Generate optimization suggestions based on performance data
   * Requirement 15.7: Suggest optimization priorities
   */
  generateOptimizationSuggestions(
    oracleMetrics: OracleEffectivenessMetrics,
    globalCVDMetrics: GlobalCVDEffectivenessMetrics,
    botTrapMetrics: BotTrapEffectivenessMetrics,
    predictionMetrics: PredictionAccuracyMetrics,
    currentWinRate: number,
    currentSharpe: number
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Oracle suggestions
    if (oracleMetrics.totalSignals >= 10) {
      if (oracleMetrics.vetoEffectiveness < 60) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'oracle',
          priority: 'high',
          suggestion: 'Adjust Oracle veto threshold - current veto effectiveness is low',
          expectedImprovement: 5,
          reasoning: `Veto effectiveness is ${oracleMetrics.vetoEffectiveness.toFixed(
            1
          )}%, consider lowering the conflict threshold to catch more losing trades`,
        });
      }

      if (oracleMetrics.winRateImprovement < 5) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'oracle',
          priority: 'medium',
          suggestion: 'Review Oracle alignment criteria - win rate improvement is minimal',
          expectedImprovement: 3,
          reasoning: `Aligned trades only show ${oracleMetrics.winRateImprovement.toFixed(
            1
          )}% better win rate than conflicting trades`,
        });
      }

      if (oracleMetrics.avgMultiplierOnLosses > oracleMetrics.avgMultiplierOnWins) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'conviction',
          priority: 'high',
          suggestion: 'Conviction multiplier is hurting performance - higher multipliers on losses',
          expectedImprovement: 8,
          reasoning: `Average multiplier on losses (${oracleMetrics.avgMultiplierOnLosses.toFixed(
            2
          )}x) exceeds wins (${oracleMetrics.avgMultiplierOnWins.toFixed(2)}x)`,
        });
      }
    }

    // Global CVD suggestions
    if (globalCVDMetrics.totalSignals >= 10) {
      if (globalCVDMetrics.falseSignalReductionRate < 50) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'globalCVD',
          priority: 'medium',
          suggestion: 'Increase Global CVD consensus threshold for better false signal filtering',
          expectedImprovement: 4,
          reasoning: `Only ${globalCVDMetrics.falseSignalReductionRate.toFixed(
            1
          )}% of rejected signals would have been losses`,
        });
      }

      if (globalCVDMetrics.multiExchangeImprovement < 3) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'globalCVD',
          priority: 'low',
          suggestion: 'Multi-exchange confirmation providing minimal benefit',
          expectedImprovement: 2,
          reasoning: `Multi-exchange win rate only ${globalCVDMetrics.multiExchangeImprovement.toFixed(
            1
          )}% better than single exchange`,
        });
      }
    }

    // Bot Trap suggestions
    if (botTrapMetrics.totalPatterns >= 10) {
      if (botTrapMetrics.falsePositiveRate > 30) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'botTrap',
          priority: 'high',
          suggestion: 'Reduce Bot Trap precision threshold - too many false positives',
          expectedImprovement: 6,
          reasoning: `False positive rate is ${botTrapMetrics.falsePositiveRate.toFixed(
            1
          )}%, missing profitable patterns`,
        });
      }

      if (botTrapMetrics.falseNegativeRate > 20) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'botTrap',
          priority: 'medium',
          suggestion: 'Increase Bot Trap sensitivity - missing trap patterns',
          expectedImprovement: 4,
          reasoning: `False negative rate is ${botTrapMetrics.falseNegativeRate.toFixed(
            1
          )}%, some traps are not being detected`,
        });
      }

      if (botTrapMetrics.avoidedLosses > 0 && botTrapMetrics.avgAvoidedLossPercent > 2) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'botTrap',
          priority: 'low',
          suggestion: 'Bot Trap detection is working well - consider maintaining current settings',
          expectedImprovement: 0,
          reasoning: `Avoided ${botTrapMetrics.avoidedLosses} losses averaging ${botTrapMetrics.avgAvoidedLossPercent.toFixed(
            1
          )}% each`,
        });
      }
    }

    // Prediction accuracy suggestions
    if (predictionMetrics.totalPredictions >= 10) {
      if (predictionMetrics.sentimentAccuracy < 55) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'oracle',
          priority: 'medium',
          suggestion: 'Oracle sentiment predictions underperforming - review event mapping',
          expectedImprovement: 3,
          reasoning: `Sentiment accuracy is only ${predictionMetrics.sentimentAccuracy.toFixed(
            1
          )}%`,
        });
      }

      if (predictionMetrics.highConvictionWinRate < predictionMetrics.lowConvictionWinRate) {
        // eslint-disable-next-line functional/immutable-data
        suggestions.push({
          layer: 'conviction',
          priority: 'high',
          suggestion: 'High conviction trades performing worse than low conviction',
          expectedImprovement: 7,
          reasoning: `High conviction win rate (${predictionMetrics.highConvictionWinRate.toFixed(
            1
          )}%) < low conviction (${predictionMetrics.lowConvictionWinRate.toFixed(1)}%)`,
        });
      }
    }

    // General suggestions based on overall performance
    if (currentWinRate < this.config.targetWinRate) {
      // eslint-disable-next-line functional/immutable-data
      suggestions.push({
        layer: 'general',
        priority: 'high',
        suggestion: `Win rate below target (${this.config.targetWinRate}%) - review signal quality`,
        expectedImprovement: 5,
        reasoning: `Current win rate is ${currentWinRate.toFixed(1)}%, ${(
          this.config.targetWinRate - currentWinRate
        ).toFixed(1)}% below target`,
      });
    }

    if (currentSharpe < this.config.targetSharpeRatio) {
      // eslint-disable-next-line functional/immutable-data
      suggestions.push({
        layer: 'general',
        priority: 'medium',
        suggestion: `Sharpe ratio below target (${this.config.targetSharpeRatio}) - consider risk adjustment`,
        expectedImprovement: 3,
        reasoning: `Current Sharpe is ${currentSharpe.toFixed(2)}, ${(
          this.config.targetSharpeRatio - currentSharpe
        ).toFixed(2)} below target`,
      });
    }

    // Sort by priority and expected improvement
    // eslint-disable-next-line functional/immutable-data
    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.expectedImprovement - a.expectedImprovement;
    });
  }

  // ============================================================================
  // COMPARATIVE ANALYSIS
  // ============================================================================

  /**
   * Generate comparative analysis between enhanced and classic trading
   */
  generateComparativeAnalysis(windowDays?: number): ComparativeAnalysis {
    const trades = this.analytics.getTradeRecords();
    const days = windowDays || 30;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const windowTrades = trades.filter(t => t.timestamp >= cutoff);

    const enhancedTrades = windowTrades.filter(t => t.usedEnhancements);
    const classicTrades = windowTrades.filter(t => !t.usedEnhancements);

    const enhancedWinRate = this.calculateWinRate(enhancedTrades);
    const classicWinRate = this.calculateWinRate(classicTrades);
    const enhancedReturn = this.calculateTotalReturn(enhancedTrades);
    const classicReturn = this.calculateTotalReturn(classicTrades);
    const enhancedSharpe = this.calculateSharpeRatio(enhancedTrades);
    const classicSharpe = this.calculateSharpeRatio(classicTrades);
    const enhancedMaxDrawdown = this.calculateMaxDrawdown(enhancedTrades);
    const classicMaxDrawdown = this.calculateMaxDrawdown(classicTrades);

    return {
      enhancedWinRate,
      classicWinRate,
      winRateDifference: enhancedWinRate - classicWinRate,
      enhancedReturn,
      classicReturn,
      returnDifference: enhancedReturn - classicReturn,
      enhancedSharpe,
      classicSharpe,
      sharpeDifference: enhancedSharpe - classicSharpe,
      enhancedMaxDrawdown,
      classicMaxDrawdown,
      drawdownImprovement: classicMaxDrawdown - enhancedMaxDrawdown,
    };
  }

  // ============================================================================
  // LAYER CONTRIBUTION ANALYSIS
  // ============================================================================

  /**
   * Analyze contribution of each enhancement layer
   */
  analyzeLayerContributions(windowDays?: number): LayerContribution[] {
    const oracleMetrics = this.analytics.calculateOracleEffectiveness(windowDays);
    const globalCVDMetrics = this.analytics.calculateGlobalCVDEffectiveness(windowDays);
    const botTrapMetrics = this.analytics.calculateBotTrapEffectiveness(windowDays);

    const trades = this.analytics.getTradeRecords();
    const enhancedTrades = trades.filter(t => t.usedEnhancements);

    return [
      {
        layer: 'Oracle',
        winRateContribution: oracleMetrics.winRateImprovement,
        returnContribution: this.calculateOracleContribution(oracleMetrics, enhancedTrades),
        riskReduction: oracleMetrics.vetoEffectiveness,
        overallScore: this.calculateLayerScore(
          oracleMetrics.winRateImprovement,
          oracleMetrics.vetoEffectiveness,
          oracleMetrics.multiplierProfitContribution
        ),
      },
      {
        layer: 'Global CVD',
        winRateContribution: globalCVDMetrics.multiExchangeImprovement,
        returnContribution: this.calculateGlobalCVDContribution(globalCVDMetrics, enhancedTrades),
        riskReduction: globalCVDMetrics.falseSignalReductionRate,
        overallScore: this.calculateLayerScore(
          globalCVDMetrics.multiExchangeImprovement,
          globalCVDMetrics.falseSignalReductionRate,
          globalCVDMetrics.consensusAccuracy
        ),
      },
      {
        layer: 'Bot Trap',
        winRateContribution: botTrapMetrics.detectionAccuracy - 50, // Contribution above baseline
        returnContribution: this.calculateBotTrapContribution(botTrapMetrics),
        riskReduction: 100 - botTrapMetrics.falseNegativeRate,
        overallScore: this.calculateLayerScore(
          botTrapMetrics.detectionAccuracy,
          100 - botTrapMetrics.falsePositiveRate,
          botTrapMetrics.avoidedLossAmount
        ),
      },
    ];
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Calculate win rate for a set of trades
   */
  private calculateWinRate(trades: EnhancedTradeRecord[]): number {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => t.pnl > 0).length;
    return (wins / trades.length) * 100;
  }

  /**
   * Calculate total return for a set of trades
   */
  private calculateTotalReturn(trades: EnhancedTradeRecord[]): number {
    return trades.reduce((sum, t) => sum + t.pnlPercent, 0);
  }

  /**
   * Calculate Sharpe ratio for a set of trades
   */
  private calculateSharpeRatio(trades: EnhancedTradeRecord[]): number {
    if (trades.length < 2) return 0;

    const returns = trades.map(t => t.pnlPercent);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize assuming 252 trading days
    const annualizedReturn = avgReturn * 252;
    const annualizedStdDev = stdDev * Math.sqrt(252);

    return annualizedReturn / annualizedStdDev;
  }

  /**
   * Calculate maximum drawdown for a set of trades
   */
  private calculateMaxDrawdown(trades: EnhancedTradeRecord[]): number {
    if (trades.length === 0) return 0;

    // eslint-disable-next-line functional/no-let
    let peak = 0;
    // eslint-disable-next-line functional/no-let
    let maxDrawdown = 0;
    // eslint-disable-next-line functional/no-let
    let cumulative = 0;

    for (const trade of trades) {
      cumulative += trade.pnlPercent;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate trading days from trades
   */
  private calculateTradingDays(trades: EnhancedTradeRecord[]): number {
    if (trades.length === 0) return 0;

    const uniqueDays = new Set(trades.map(t => t.timestamp.toISOString().split('T')[0]));

    return uniqueDays.size;
  }

  /**
   * Calculate Oracle contribution to returns
   */
  private calculateOracleContribution(
    metrics: OracleEffectivenessMetrics,
    _trades: EnhancedTradeRecord[]
  ): number {
    // Contribution = multiplier profit + avoided losses from vetoes
    const vetoedSignals = this.analytics.getVetoedSignals().filter(v => v.vetoSource === 'oracle');
    const avoidedLosses = vetoedSignals
      .filter(v => !v.wouldHaveWon)
      .reduce((sum, v) => sum + Math.abs(v.potentialPnlPercent), 0);

    return metrics.multiplierProfitContribution + avoidedLosses;
  }

  /**
   * Calculate Global CVD contribution to returns
   */
  private calculateGlobalCVDContribution(
    metrics: GlobalCVDEffectivenessMetrics,
    _trades: EnhancedTradeRecord[]
  ): number {
    // Contribution = avoided false signals
    const vetoedSignals = this.analytics
      .getVetoedSignals()
      .filter(v => v.vetoSource === 'globalCVD');
    const avoidedLosses = vetoedSignals
      .filter(v => !v.wouldHaveWon)
      .reduce((sum, v) => sum + Math.abs(v.potentialPnlPercent), 0);

    return avoidedLosses;
  }

  /**
   * Calculate Bot Trap contribution to returns
   */
  private calculateBotTrapContribution(metrics: BotTrapEffectivenessMetrics): number {
    return metrics.avoidedLossAmount;
  }

  /**
   * Calculate overall layer score
   */
  private calculateLayerScore(
    winRateContrib: number,
    riskReduction: number,
    profitContrib: number
  ): number {
    // Weighted score: 40% win rate, 30% risk reduction, 30% profit contribution
    const normalizedProfit = Math.min(profitContrib / 10, 100); // Normalize profit to 0-100
    return winRateContrib * 0.4 + riskReduction * 0.3 + normalizedProfit * 0.3;
  }

  // ============================================================================
  // REPORT FORMATTING
  // ============================================================================

  /**
   * Format report as string for display
   */
  formatReportAsString(report: PerformanceReport): string {
    const lines: string[] = [
      '═══════════════════════════════════════════════════════════════',
      '                 TITAN PHASE 2 - 2026 PERFORMANCE REPORT',
      '═══════════════════════════════════════════════════════════════',
      '',
      `📅 Period: ${report.period.start.toLocaleDateString()} - ${report.period.end.toLocaleDateString()} (${report.period.tradingDays} trading days)`,
      '',
      '📊 OVERALL PERFORMANCE',
      '───────────────────────────────────────────────────────────────',
      `   Total Trades: ${report.totalTrades} (Enhanced: ${report.enhancedTrades}, Classic: ${report.classicTrades})`,
      `   Win Rate: ${report.overallWinRate.toFixed(1)}% (Enhanced: ${report.enhancedWinRate.toFixed(
        1
      )}%, Classic: ${report.classicWinRate.toFixed(1)}%)`,
      `   Total Return: ${report.totalReturn.toFixed(2)}% (Enhanced: ${report.enhancedReturn.toFixed(
        2
      )}%, Classic: ${report.classicReturn.toFixed(2)}%)`,
      `   Sharpe Ratio: ${report.sharpeRatio.toFixed(2)} (Enhanced: ${report.enhancedSharpeRatio.toFixed(
        2
      )}, Classic: ${report.classicSharpeRatio.toFixed(2)})`,
      '',
      '🔮 ORACLE EFFECTIVENESS',
      '───────────────────────────────────────────────────────────────',
      `   Aligned Win Rate: ${report.oracleMetrics.alignedWinRate.toFixed(1)}%`,
      `   Conflicting Win Rate: ${report.oracleMetrics.conflictingWinRate.toFixed(1)}%`,
      `   Win Rate Improvement: ${report.oracleMetrics.winRateImprovement.toFixed(1)}%`,
      `   Veto Effectiveness: ${report.oracleMetrics.vetoEffectiveness.toFixed(1)}%`,
      `   Contribution: ${report.oracleContribution.toFixed(2)}%`,
      '',
      '🌐 GLOBAL CVD EFFECTIVENESS',
      '───────────────────────────────────────────────────────────────',
      `   Confirmed Win Rate: ${report.globalCVDMetrics.confirmedWinRate.toFixed(1)}%`,
      `   False Signal Reduction: ${report.globalCVDMetrics.falseSignalReductionRate.toFixed(1)}%`,
      `   Multi-Exchange Improvement: ${report.globalCVDMetrics.multiExchangeImprovement.toFixed(
        1
      )}%`,
      `   Contribution: ${report.globalCVDContribution.toFixed(2)}%`,
      '',
      '🤖 BOT TRAP EFFECTIVENESS',
      '───────────────────────────────────────────────────────────────',
      `   Detection Accuracy: ${report.botTrapMetrics.detectionAccuracy.toFixed(1)}%`,
      `   False Positive Rate: ${report.botTrapMetrics.falsePositiveRate.toFixed(1)}%`,
      `   Avoided Losses: ${report.botTrapMetrics.avoidedLosses} trades (${report.botTrapMetrics.avoidedLossAmount.toFixed(
        2
      )}%)`,
      `   Contribution: ${report.botTrapContribution.toFixed(2)}%`,
      '',
      '🎯 PREDICTION ACCURACY',
      '───────────────────────────────────────────────────────────────',
      `   Sentiment Accuracy: ${report.predictionMetrics.sentimentAccuracy.toFixed(1)}%`,
      `   High Conviction Win Rate: ${report.predictionMetrics.highConvictionWinRate.toFixed(1)}%`,
      `   Low Conviction Win Rate: ${report.predictionMetrics.lowConvictionWinRate.toFixed(1)}%`,
      `   Conviction Correlation: ${report.predictionMetrics.convictionCorrelation.toFixed(3)}`,
      '',
    ];

    if (report.suggestions.length > 0) {
      // eslint-disable-next-line functional/immutable-data
      lines.push('💡 OPTIMIZATION SUGGESTIONS');
      // eslint-disable-next-line functional/immutable-data
      lines.push('───────────────────────────────────────────────────────────────');

      for (const suggestion of report.suggestions) {
        const priorityIcon =
          suggestion.priority === 'high' ? '🔴' : suggestion.priority === 'medium' ? '🟡' : '🟢';
        // eslint-disable-next-line functional/immutable-data
        lines.push(
          `   ${priorityIcon} [${suggestion.layer.toUpperCase()}] ${suggestion.suggestion}`
        );
        // eslint-disable-next-line functional/immutable-data
        lines.push(`      Expected improvement: ${suggestion.expectedImprovement}%`);
        // eslint-disable-next-line functional/immutable-data
        lines.push(`      Reasoning: ${suggestion.reasoning}`);
        // eslint-disable-next-line functional/immutable-data
        lines.push('');
      }
    }

    // eslint-disable-next-line functional/immutable-data
    lines.push('═══════════════════════════════════════════════════════════════');
    // eslint-disable-next-line functional/immutable-data
    lines.push(`Generated: ${report.timestamp.toISOString()}`);

    return lines.join('\n');
  }

  /**
   * Format report as JSON
   */
  formatReportAsJSON(report: PerformanceReport): string {
    return JSON.stringify(report, null, 2);
  }
}
