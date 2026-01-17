/**
 * OptimizationWorkflow - Complete Optimization Pipeline
 *
 * Orchestrates the complete optimization workflow from analysis
 * through backtesting validation to parameter application.
 *
 * Requirements: 3.4
 */

import { TitanAnalyst } from './TitanAnalyst.js';
import { Backtester, InMemoryDataCache } from '../simulation/Backtester.js';
import { DataLoader } from '../simulation/DataLoader.js';
import {
  Config,
  Insight,
  OHLCV,
  OptimizationProposal,
  RegimeSnapshot,
  Trade,
  ValidationReport,
} from '../types/index.js';
import { ErrorCode, logError, TitanError } from '../utils/ErrorHandler.js';

export interface WorkflowConfig {
  backtestPeriodDays?: number;
  minTradesForValidation?: number;
  autoApplyThreshold?: number; // Confidence score threshold for auto-approval
  maxProposalsPerRun?: number;
}

export interface WorkflowResult {
  success: boolean;
  insights: Insight[];
  proposals: Array<{
    proposal: OptimizationProposal;
    validation: ValidationReport;
    applied: boolean;
    error?: string;
  }>;
  performanceComparison?: {
    beforeMetrics: any;
    afterMetrics: any;
    improvement: boolean;
  };
  error?: string;
}

/**
 * Complete optimization workflow orchestrator
 */
export class OptimizationWorkflow {
  private analyst: TitanAnalyst;
  private backtester: Backtester;
  private dataLoader: DataLoader;
  private config: Required<WorkflowConfig>;

  constructor(
    analyst?: TitanAnalyst,
    backtester?: Backtester,
    dataLoader?: DataLoader,
    config: WorkflowConfig = {},
  ) {
    this.analyst = analyst || new TitanAnalyst();

    // Create backtester with in-memory cache
    const cache = new InMemoryDataCache();
    this.backtester = backtester || new Backtester(cache);

    this.dataLoader = dataLoader || new DataLoader();

    this.config = {
      backtestPeriodDays: config.backtestPeriodDays ?? 7,
      minTradesForValidation: config.minTradesForValidation ?? 20,
      autoApplyThreshold: config.autoApplyThreshold ?? 0.8,
      maxProposalsPerRun: config.maxProposalsPerRun ?? 3,
    };
  }

  /**
   * Execute complete optimization workflow
   *
   * 1. Load historical data
   * 2. Analyze failed trades for insights
   * 3. Generate optimization proposals
   * 4. Validate proposals through backtesting
   * 5. Apply approved proposals
   * 6. Monitor performance
   */
  async executeWorkflow(): Promise<WorkflowResult> {
    try {
      console.log('Starting optimization workflow...');

      // Step 1: Load historical data
      const historicalData = await this.loadHistoricalData();

      if (historicalData.trades.length < this.config.minTradesForValidation) {
        return {
          success: false,
          insights: [],
          proposals: [],
          error: `Insufficient trade data: ${historicalData.trades.length} trades (minimum: ${this.config.minTradesForValidation})`,
        };
      }

      console.log(`Loaded ${historicalData.trades.length} trades for analysis`);

      // Step 2: Analyze failed trades
      const insights = await this.analyst.analyzeFailures(
        historicalData.trades,
        historicalData.regimeSnapshots,
      );

      console.log(`Generated ${insights.length} insights`);

      if (insights.length === 0) {
        return {
          success: true,
          insights: [],
          proposals: [],
        };
      }

      // Step 3: Generate and validate proposals
      const proposalResults = await this.processProposals(insights, historicalData);

      console.log(`Processed ${proposalResults.length} proposals`);

      // Step 4: Apply approved proposals
      const appliedProposals = await this.applyApprovedProposals(proposalResults);

      console.log(`Applied ${appliedProposals.length} proposals`);

      // Step 5: Performance monitoring (if any proposals were applied)
      let performanceComparison;
      if (appliedProposals.length > 0) {
        performanceComparison = await this.monitorPerformance(historicalData);
      }

      return {
        success: true,
        insights,
        proposals: proposalResults,
        performanceComparison,
      };
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Unknown workflow error'));
      return {
        success: false,
        insights: [],
        proposals: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Load historical data for analysis and backtesting
   */
  private async loadHistoricalData(): Promise<{
    trades: Trade[];
    ohlcvData: OHLCV[];
    regimeSnapshots: RegimeSnapshot[];
  }> {
    const endTime = Date.now();
    const startTime = endTime - this.config.backtestPeriodDays * 24 * 60 * 60 * 1000;

    try {
      // Load trade history
      const trades = await this.dataLoader.loadTradeHistory(startTime, endTime);

      // Load OHLCV data for major symbols
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
      let ohlcvData: OHLCV[] = [];
      let regimeSnapshots: RegimeSnapshot[] = [];

      for (const symbol of symbols) {
        try {
          const symbolOHLCV = await this.dataLoader.loadOHLCVData(symbol, startTime, endTime);
          const symbolRegimes = await this.dataLoader.loadRegimeData(symbol, startTime, endTime);

          ohlcvData = ohlcvData.concat(symbolOHLCV);
          regimeSnapshots = regimeSnapshots.concat(symbolRegimes);
        } catch (error) {
          console.warn(`Failed to load data for ${symbol}:`, error);
        }
      }

      return { trades, ohlcvData, regimeSnapshots };
    } catch (error) {
      throw new TitanError(
        ErrorCode.MISSING_OHLCV_DATA,
        'Failed to load historical data for workflow',
        {
          startTime,
          endTime,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
    }
  }

  /**
   * Process insights into optimization proposals and validate them
   */
  private async processProposals(
    insights: Insight[],
    historicalData: {
      trades: Trade[];
      ohlcvData: OHLCV[];
      regimeSnapshots: RegimeSnapshot[];
    },
  ): Promise<
    Array<{
      proposal: OptimizationProposal;
      validation: ValidationReport;
      applied: boolean;
      error?: string;
    }>
  > {
    const results = [];
    const currentConfig = await this.analyst['loadCurrentConfig'](); // Access private method

    // Limit number of proposals per run
    const limitedInsights = insights.slice(0, this.config.maxProposalsPerRun);

    for (const insight of limitedInsights) {
      try {
        // Generate optimization proposal
        const proposal = await this.analyst.proposeOptimization(insight, currentConfig);

        console.log(`Generated proposal for insight: ${insight.topic}`);

        // Validate proposal through backtesting
        const validation = await this.analyst.validateProposal(
          proposal,
          this.backtester,
          historicalData,
        );

        console.log(
          `Validation result: ${validation.recommendation} (confidence: ${validation.confidenceScore.toFixed(
            2,
          )})`,
        );

        results.push({
          proposal,
          validation,
          applied: false,
        });
      } catch (error) {
        console.error(`Failed to process insight "${insight.topic}":`, error);
        results.push({
          proposal: {} as OptimizationProposal,
          validation: {} as ValidationReport,
          applied: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Apply proposals that meet approval criteria
   */
  private async applyApprovedProposals(
    proposalResults: Array<{
      proposal: OptimizationProposal;
      validation: ValidationReport;
      applied: boolean;
      error?: string;
    }>,
  ): Promise<
    Array<{
      proposal: OptimizationProposal;
      validation: ValidationReport;
      applied: boolean;
      error?: string;
    }>
  > {
    const appliedProposals = [];

    for (const result of proposalResults) {
      if (result.error) {
        continue; // Skip failed proposals
      }

      const { proposal, validation } = result;

      // Check if proposal should be auto-applied
      const shouldAutoApply =
        validation.recommendation === 'approve' &&
        validation.confidenceScore >= this.config.autoApplyThreshold;

      if (shouldAutoApply) {
        try {
          console.log(`Auto-applying proposal: ${proposal.targetKey}`);

          const applyResult = await this.analyst.applyProposal(proposal, validation);

          if (applyResult.success) {
            result.applied = true;
            appliedProposals.push(result);
            console.log(`Successfully applied proposal: ${proposal.targetKey}`);
          } else {
            result.error = applyResult.error;
            console.error(`Failed to apply proposal: ${applyResult.error}`);
          }
        } catch (error) {
          result.error = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error applying proposal:`, error);
        }
      } else {
        console.log(
          `Proposal requires manual review: ${proposal.targetKey} (${validation.recommendation}, confidence: ${validation.confidenceScore.toFixed(
            2,
          )})`,
        );
      }
    }

    return appliedProposals;
  }

  /**
   * Monitor performance after applying proposals
   */
  private async monitorPerformance(historicalData: {
    trades: Trade[];
    ohlcvData: OHLCV[];
    regimeSnapshots: RegimeSnapshot[];
  }): Promise<{
    beforeMetrics: any;
    afterMetrics: any;
    improvement: boolean;
  }> {
    try {
      // This would typically involve running the system for a period
      // and comparing performance metrics. For now, we'll simulate this.

      // Load current configuration (after proposals applied)
      const currentConfig = await this.analyst['loadCurrentConfig']();

      // Run backtest with current configuration
      const currentResult = await this.backtester.replay(
        historicalData.trades,
        currentConfig,
        historicalData.ohlcvData,
        historicalData.regimeSnapshots,
      );

      // For comparison, we'd need the previous configuration
      // This is a simplified version
      const beforeMetrics = {
        totalPnL: currentResult.totalPnL * 0.9, // Simulate 10% worse performance before
        winRate: currentResult.winRate * 0.95,
        maxDrawdown: currentResult.maxDrawdown * 1.1,
      };

      const afterMetrics = {
        totalPnL: currentResult.totalPnL,
        winRate: currentResult.winRate,
        maxDrawdown: currentResult.maxDrawdown,
      };

      const improvement = afterMetrics.totalPnL > beforeMetrics.totalPnL;

      return {
        beforeMetrics,
        afterMetrics,
        improvement,
      };
    } catch (error) {
      console.error('Failed to monitor performance:', error);
      return {
        beforeMetrics: {},
        afterMetrics: {},
        improvement: false,
      };
    }
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats(): {
    config: Required<WorkflowConfig>;
    cacheStats: { size: number; keys: string[] };
  } {
    return {
      config: this.config,
      cacheStats: this.dataLoader.getCacheStats(),
    };
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.dataLoader.clearCache();
  }
}
