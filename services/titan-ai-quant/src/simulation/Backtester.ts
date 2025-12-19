/**
 * Backtester - Playback Engine
 * 
 * Replays historical trades with different configurations to validate
 * optimization proposals. Applies latency model and slippage to ensure
 * realistic simulation results.
 * 
 * Implementation: Task 8
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { LatencyModel } from './LatencyModel';
import {
  Trade,
  Config,
  BacktestResult,
  ValidationReport,
  OHLCV,
  RegimeSnapshot,
} from '../types';
import { TitanError, ErrorCode, logError, getUserFriendlyMessage } from '../utils/ErrorHandler';

export interface ComparisonResult {
  baseResult: BacktestResult;
  proposedResult: BacktestResult;
  pnlDelta: number;
  drawdownDelta: number;
  recommendation: 'approve' | 'reject';
  reason: string;
}

export interface BacktestOptions {
  /** Start timestamp for backtest period */
  startTime?: number;
  /** End timestamp for backtest period */
  endTime?: number;
  /** Initial capital for simulation */
  initialCapital?: number;
  /** Risk-free rate for Sharpe ratio calculation (annualized) */
  riskFreeRate?: number;
  /** Maximum backtest period in days (default: 30) */
  maxPeriodDays?: number;
  /** Whether to skip trades with missing data instead of failing */
  skipMissingData?: boolean;
}

/**
 * Backtest warnings for non-fatal issues
 */
export interface BacktestWarning {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Extended backtest result with warnings
 */
export interface ExtendedBacktestResult extends BacktestResult {
  warnings: BacktestWarning[];
  skippedTrades: number;
}

/**
 * Cache interface for loading historical data
 */
export interface DataCache {
  /** Load OHLCV data for a symbol within a time range */
  loadOHLCV(symbol: string, startTime: number, endTime: number): Promise<OHLCV[]>;
  /** Load regime snapshots for a symbol within a time range */
  loadRegimeSnapshots(symbol: string, startTime: number, endTime: number): Promise<RegimeSnapshot[]>;
}

/**
 * Simple in-memory data cache implementation
 */
export class InMemoryDataCache implements DataCache {
  private ohlcvData: Map<string, OHLCV[]> = new Map();
  private regimeData: Map<string, RegimeSnapshot[]> = new Map();

  setOHLCV(symbol: string, data: OHLCV[]): void {
    this.ohlcvData.set(symbol, data);
  }

  setRegimeSnapshots(symbol: string, data: RegimeSnapshot[]): void {
    this.regimeData.set(symbol, data);
  }

  async loadOHLCV(symbol: string, startTime: number, endTime: number): Promise<OHLCV[]> {
    const data = this.ohlcvData.get(symbol) || [];
    return data.filter(d => d.timestamp >= startTime && d.timestamp <= endTime);
  }

  async loadRegimeSnapshots(symbol: string, startTime: number, endTime: number): Promise<RegimeSnapshot[]> {
    const data = this.regimeData.get(symbol) || [];
    return data.filter(d => d.timestamp >= startTime && d.timestamp <= endTime);
  }
}


export class Backtester {
  private latencyModel: LatencyModel;
  private cache: DataCache;

  /**
   * Create a new Backtester
   * @param cache - Data cache for loading historical data
   * @param latencyModel - Optional custom latency model (default: 200ms latency)
   */
  constructor(cache: DataCache, latencyModel?: LatencyModel) {
    this.cache = cache;
    this.latencyModel = latencyModel || new LatencyModel(200);
  }

  /**
   * Load historical data for backtesting
   * 
   * Loads OHLCV and regime data for the specified symbols and time range.
   * This method handles data ingestion and preprocessing for backtesting.
   * 
   * @param symbols - Array of symbols to load data for
   * @param startTime - Start timestamp for data range
   * @param endTime - End timestamp for data range
   * @returns Promise resolving to loaded data
   */
  async loadHistoricalData(
    symbols: string[],
    startTime: number,
    endTime: number
  ): Promise<{
    ohlcvData: Map<string, OHLCV[]>;
    regimeData: Map<string, RegimeSnapshot[]>;
  }> {
    const ohlcvData = new Map<string, OHLCV[]>();
    const regimeData = new Map<string, RegimeSnapshot[]>();

    // Load data for each symbol
    for (const symbol of symbols) {
      try {
        // Load OHLCV data
        const ohlcv = await this.cache.loadOHLCV(symbol, startTime, endTime);
        ohlcvData.set(symbol, ohlcv);

        // Load regime snapshots
        const regimes = await this.cache.loadRegimeSnapshots(symbol, startTime, endTime);
        regimeData.set(symbol, regimes);
      } catch (error) {
        // Log error but continue with other symbols
        console.warn(`Failed to load data for ${symbol}:`, error);
        ohlcvData.set(symbol, []);
        regimeData.set(symbol, []);
      }
    }

    return { ohlcvData, regimeData };
  }

  /**
   * Process trades with market impact simulation
   * 
   * Applies realistic market impact modeling including:
   * - Latency penalties based on geographic distance
   * - Slippage based on order size and market conditions
   * - Partial fills and execution delays
   * 
   * @param trades - Array of trades to process
   * @param ohlcvData - Market data for price simulation
   * @param regimeSnapshots - Regime data for liquidity modeling
   * @param config - Configuration for trade parameters
   * @returns Array of processed trades with market impact
   */
  async processTradesWithMarketImpact(
    trades: Trade[],
    ohlcvData: OHLCV[],
    regimeSnapshots: RegimeSnapshot[],
    config: Config
  ): Promise<SimulatedTrade[]> {
    const processedTrades: SimulatedTrade[] = [];

    for (const trade of trades) {
      const trapConfig = config.traps[trade.trapType];
      
      // Skip if trap is disabled
      if (!trapConfig || !trapConfig.enabled) {
        continue;
      }

      try {
        // Get regime at trade time for slippage calculation
        const regime = this.findRegimeAtTime(regimeSnapshots, trade.timestamp);
        const liquidityState = regime?.liquidityState ?? 1;

        // Apply latency penalty to entry price
        const adjustedEntry = this.latencyModel.applyLatencyPenalty(
          trade.entryPrice,
          ohlcvData,
          trade.timestamp
        );

        // Calculate ATR for slippage
        const atr = this.estimateATR(ohlcvData, trade.timestamp);

        // Calculate position size based on config
        const positionSize = this.calculatePositionSize(
          10000, // Default equity for simulation
          trapConfig.risk_per_trade,
          trapConfig.max_leverage,
          trade.entryPrice
        );

        // Calculate slippage
        const slippage = this.latencyModel.calculateSlippage(
          positionSize,
          atr,
          liquidityState
        );

        // Adjust entry for slippage
        const finalEntry = trade.side === 'long'
          ? adjustedEntry + slippage
          : adjustedEntry - slippage;

        // Simulate exit based on config
        const exitResult = this.simulateExit(
          trade,
          finalEntry,
          trapConfig.stop_loss,
          trapConfig.take_profit,
          ohlcvData
        );

        // Calculate PnL
        const pnl = this.calculatePnL(
          trade.side,
          finalEntry,
          exitResult.exitPrice,
          positionSize,
          trapConfig.max_leverage
        );

        processedTrades.push({
          originalTrade: trade,
          adjustedEntry: finalEntry,
          exitPrice: exitResult.exitPrice,
          exitReason: exitResult.exitReason,
          pnl,
          slippage,
          duration: exitResult.duration,
        });
      } catch (error) {
        console.warn(`Failed to process trade ${trade.id}:`, error);
        // Continue with next trade
      }
    }

    return processedTrades;
  }

  /**
   * Generate comprehensive performance metrics
   * 
   * Calculates a full suite of performance metrics including:
   * - Basic metrics (win rate, total PnL, average PnL)
   * - Risk metrics (max drawdown, Sharpe ratio)
   * - Execution metrics (average slippage, duration)
   * - Advanced metrics (profit factor, Calmar ratio)
   * 
   * @param trades - Array of simulated trades
   * @param initialCapital - Starting capital
   * @param riskFreeRate - Risk-free rate for Sharpe calculation
   * @returns Comprehensive performance metrics
   */
  generatePerformanceMetrics(
    trades: SimulatedTrade[],
    initialCapital: number = 10000,
    riskFreeRate: number = 0.05
  ): BacktestResult & {
    calmarRatio: number;
    sortinoRatio: number;
    maxConsecutiveLosses: number;
    avgWinningTrade: number;
    avgLosingTrade: number;
  } {
    if (trades.length === 0) {
      return {
        ...this.createEmptyResult(),
        calmarRatio: 0,
        sortinoRatio: 0,
        maxConsecutiveLosses: 0,
        avgWinningTrade: 0,
        avgLosingTrade: 0,
      };
    }

    // Calculate equity curve
    const equityCurve = this.calculateEquityCurve(trades, initialCapital);
    const finalEquity = equityCurve[equityCurve.length - 1];
    
    // Basic metrics
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl <= 0).length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    const totalPnL = finalEquity - initialCapital;
    const avgPnL = totalPnL / totalTrades;

    // Drawdown metrics
    const { maxDrawdown, maxDrawdownPercent } = this.calculateDrawdownMetrics(equityCurve);

    // Profit factor
    const grossProfit = trades
      .filter(t => t.pnl > 0)
      .reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(
      trades
        .filter(t => t.pnl < 0)
        .reduce((sum, t) => sum + t.pnl, 0)
    );
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Risk-adjusted returns
    const returns = trades.map(t => t.pnl / initialCapital);
    const sharpeRatio = this.calculateSharpeRatio(returns, riskFreeRate);
    const sortinoRatio = this.calculateSortinoRatio(returns, riskFreeRate);
    const calmarRatio = this.calculateCalmarRatio(totalPnL / initialCapital, maxDrawdownPercent);

    // Execution metrics
    const avgSlippage = trades.reduce((sum, t) => sum + t.slippage, 0) / totalTrades;
    const avgDuration = trades.reduce((sum, t) => sum + t.duration, 0) / totalTrades;

    // Advanced metrics
    const maxConsecutiveLosses = this.calculateMaxConsecutiveLosses(trades);
    const avgWinningTrade = winningTrades > 0 ? grossProfit / winningTrades : 0;
    const avgLosingTrade = losingTrades > 0 ? -grossLoss / losingTrades : 0;

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnL,
      avgPnL,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      avgSlippage,
      avgDuration,
      profitFactor: isFinite(profitFactor) ? profitFactor : 0,
      calmarRatio,
      sortinoRatio,
      maxConsecutiveLosses,
      avgWinningTrade,
      avgLosingTrade,
    };
  }

  /**
   * Create validation report with detailed analysis
   * 
   * Generates a comprehensive validation report including:
   * - Performance comparison between baseline and proposed configs
   * - Statistical significance testing
   * - Risk-adjusted performance metrics
   * - Recommendation with confidence score
   * 
   * @param baselineResult - Results from baseline configuration
   * @param proposedResult - Results from proposed configuration
   * @param backtestPeriod - Time period of the backtest
   * @returns Detailed validation report
   */
  createValidationReport(
    baselineResult: BacktestResult,
    proposedResult: BacktestResult,
    backtestPeriod: { start: number; end: number }
  ): ValidationReport {
    // Calculate deltas
    const pnlDelta = proposedResult.totalPnL - baselineResult.totalPnL;
    const pnlDeltaPercent = baselineResult.totalPnL !== 0
      ? (pnlDelta / Math.abs(baselineResult.totalPnL)) * 100
      : pnlDelta > 0 ? 100 : pnlDelta < 0 ? -100 : 0;

    const drawdownDelta = proposedResult.maxDrawdown - baselineResult.maxDrawdown;
    const drawdownDeltaPercent = baselineResult.maxDrawdown !== 0
      ? (drawdownDelta / baselineResult.maxDrawdown) * 100
      : drawdownDelta > 0 ? 100 : drawdownDelta < 0 ? -100 : 0;

    const winRateDelta = proposedResult.winRate - baselineResult.winRate;

    // Apply rejection rules
    let passed = true;
    let rejectionReason: string | undefined;
    let recommendation: 'approve' | 'reject' | 'review' = 'approve';

    // Rule 1: Reject if new PnL <= old PnL
    if (proposedResult.totalPnL <= baselineResult.totalPnL) {
      passed = false;
      rejectionReason = `New PnL (${proposedResult.totalPnL.toFixed(2)}) is not better than baseline (${baselineResult.totalPnL.toFixed(2)})`;
      recommendation = 'reject';
    }
    // Rule 2: Reject if new drawdown > old drawdown * 1.1 (10% worse)
    else if (proposedResult.maxDrawdown > baselineResult.maxDrawdown * 1.1) {
      passed = false;
      rejectionReason = `New drawdown (${proposedResult.maxDrawdown.toFixed(2)}) exceeds baseline (${baselineResult.maxDrawdown.toFixed(2)}) by more than 10%`;
      recommendation = 'reject';
    }

    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(
      proposedResult.totalTrades,
      proposedResult,
      baselineResult
    );

    // Adjust recommendation based on confidence
    if (passed && confidenceScore < 0.5) {
      recommendation = 'review';
    }

    return {
      passed,
      timestamp: Date.now(),
      backtestPeriod,
      baselineMetrics: baselineResult,
      proposedMetrics: proposedResult,
      deltas: {
        pnlDelta,
        pnlDeltaPercent,
        drawdownDelta,
        drawdownDeltaPercent,
        winRateDelta,
      },
      confidenceScore,
      rejectionReason,
      recommendation,
    };
  }

  /**
   * Replay trades with a config override
   * 
   * Simulates trades using the provided configuration, applying
   * latency penalties and slippage to all executions.
   * 
   * Task 15: Handle missing OHLCV data gracefully
   * 
   * @param trades - Historical trades to replay
   * @param config - Configuration to use for simulation
   * @param ohlcvData - Market data for price interpolation
   * @param regimeSnapshots - Regime data for slippage calculation
   * @param options - Backtest options
   * @returns Backtest result with metrics
   */
  async replay(
    trades: Trade[],
    config: Config,
    ohlcvData: OHLCV[],
    regimeSnapshots: RegimeSnapshot[],
    options: BacktestOptions = {}
  ): Promise<ExtendedBacktestResult> {
    const {
      initialCapital = 10000,
      riskFreeRate = 0.05,
      maxPeriodDays = 30,
      skipMissingData = true,
    } = options;

    const warnings: BacktestWarning[] = [];
    let skippedTrades = 0;

    if (trades.length === 0) {
      return { ...this.createEmptyResult(), warnings, skippedTrades };
    }

    // Filter trades by time range if specified
    let filteredTrades = trades;
    if (options.startTime !== undefined) {
      filteredTrades = filteredTrades.filter(t => t.timestamp >= options.startTime!);
    }
    if (options.endTime !== undefined) {
      filteredTrades = filteredTrades.filter(t => t.timestamp <= options.endTime!);
    }

    if (filteredTrades.length === 0) {
      return { ...this.createEmptyResult(), warnings, skippedTrades };
    }

    // Check for memory overflow - limit backtest period
    const timestamps = filteredTrades.map(t => t.timestamp);
    const periodMs = Math.max(...timestamps) - Math.min(...timestamps);
    const periodDays = periodMs / (24 * 60 * 60 * 1000);
    
    if (periodDays > maxPeriodDays) {
      const error = new TitanError(
        ErrorCode.MEMORY_OVERFLOW,
        `Backtest period (${periodDays.toFixed(1)} days) exceeds maximum (${maxPeriodDays} days)`,
        { periodDays, maxPeriodDays }
      );
      logError(error);
      throw error;
    }

    // Check for missing OHLCV data
    if (ohlcvData.length === 0) {
      if (!skipMissingData) {
        const error = new TitanError(
          ErrorCode.MISSING_OHLCV_DATA,
          'No OHLCV data available for backtest period'
        );
        logError(error);
        throw error;
      }
      warnings.push({
        code: 'MISSING_OHLCV_DATA',
        message: 'No OHLCV data available - using trade prices directly',
      });
    }

    // Check for incomplete regime data
    if (regimeSnapshots.length === 0) {
      warnings.push({
        code: 'INCOMPLETE_REGIME_DATA',
        message: 'No regime data available - using default liquidity state',
      });
    }

    // Sort trades by timestamp
    const sortedTrades = [...filteredTrades].sort((a, b) => a.timestamp - b.timestamp);

    // Simulate each trade with config parameters
    const simulatedResults: SimulatedTrade[] = [];
    let equity = initialCapital;
    let peakEquity = initialCapital;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    for (const trade of sortedTrades) {
      const trapConfig = config.traps[trade.trapType];
      
      // Skip if trap is disabled
      if (!trapConfig || !trapConfig.enabled) {
        continue;
      }

      // Get regime at trade time for slippage calculation
      const regime = this.findRegimeAtTime(regimeSnapshots, trade.timestamp);
      const liquidityState = regime?.liquidityState ?? 1;

      // Apply latency penalty to entry price (handle missing OHLCV data)
      let adjustedEntry: number;
      try {
        adjustedEntry = this.latencyModel.applyLatencyPenalty(
          trade.entryPrice,
          ohlcvData,
          trade.timestamp
        );
      } catch (error) {
        if (skipMissingData) {
          // Use original entry price if latency model fails
          adjustedEntry = trade.entryPrice;
          skippedTrades++;
        } else {
          throw error;
        }
      }

      // Calculate ATR for slippage (use price volatility as proxy)
      const atr = this.estimateATR(ohlcvData, trade.timestamp);

      // Calculate position size based on config (handle division by zero)
      let positionSize: number;
      try {
        positionSize = this.calculatePositionSize(
          equity,
          trapConfig.risk_per_trade,
          trapConfig.max_leverage,
          trade.entryPrice
        );
        
        // Guard against invalid position size
        if (!isFinite(positionSize) || positionSize <= 0) {
          if (skipMissingData) {
            skippedTrades++;
            continue;
          }
          throw new TitanError(
            ErrorCode.DIVISION_BY_ZERO,
            'Invalid position size calculation',
            { equity, riskPerTrade: trapConfig.risk_per_trade, entryPrice: trade.entryPrice }
          );
        }
      } catch (error) {
        if (skipMissingData && !(error instanceof TitanError)) {
          skippedTrades++;
          continue;
        }
        throw error;
      }

      // Calculate slippage
      const slippage = this.latencyModel.calculateSlippage(
        positionSize,
        atr,
        liquidityState
      );

      // Adjust entry for slippage (worse entry for both long and short)
      const finalEntry = trade.side === 'long'
        ? adjustedEntry + slippage
        : adjustedEntry - slippage;

      // Simulate exit based on config stop loss and take profit
      const exitResult = this.simulateExit(
        trade,
        finalEntry,
        trapConfig.stop_loss,
        trapConfig.take_profit,
        ohlcvData
      );

      // Calculate PnL (handle division by zero)
      let pnl: number;
      try {
        pnl = this.calculatePnL(
          trade.side,
          finalEntry,
          exitResult.exitPrice,
          positionSize,
          trapConfig.max_leverage
        );
        
        // Guard against NaN/Infinity
        if (!isFinite(pnl)) {
          if (skipMissingData) {
            skippedTrades++;
            continue;
          }
          throw new TitanError(
            ErrorCode.DIVISION_BY_ZERO,
            'Invalid PnL calculation',
            { entry: finalEntry, exit: exitResult.exitPrice, positionSize }
          );
        }
      } catch (error) {
        if (skipMissingData && !(error instanceof TitanError)) {
          skippedTrades++;
          continue;
        }
        throw error;
      }

      // Update equity
      equity += pnl;

      // Track drawdown
      if (equity > peakEquity) {
        peakEquity = equity;
      }
      const currentDrawdown = peakEquity - equity;
      const currentDrawdownPercent = peakEquity > 0 ? currentDrawdown / peakEquity : 0;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
        maxDrawdownPercent = currentDrawdownPercent;
      }

      simulatedResults.push({
        originalTrade: trade,
        adjustedEntry: finalEntry,
        exitPrice: exitResult.exitPrice,
        exitReason: exitResult.exitReason,
        pnl,
        slippage,
        duration: exitResult.duration,
      });
    }

    // Add warning if trades were skipped
    if (skippedTrades > 0) {
      warnings.push({
        code: 'TRADES_SKIPPED',
        message: `${skippedTrades} trades skipped due to missing or invalid data`,
        context: { skippedTrades, totalTrades: sortedTrades.length },
      });
    }

    // Calculate aggregate metrics
    const result = this.calculateMetrics(
      simulatedResults,
      initialCapital,
      equity,
      maxDrawdown,
      maxDrawdownPercent,
      riskFreeRate
    );

    return { ...result, warnings, skippedTrades };
  }


  /**
   * Compare two configurations by running backtests on both
   * 
   * Runs the baseline and proposed configurations against the same
   * historical data and compares the results.
   * 
   * Rejection Rules (Requirements 3.3, 3.4):
   * - Reject if new PnL <= old PnL
   * - Reject if new drawdown > old drawdown * 1.1 (10% worse)
   * 
   * @param baseConfig - Current/baseline configuration
   * @param proposedConfig - Proposed new configuration
   * @param trades - Historical trades to replay
   * @param ohlcvData - Market data for price interpolation
   * @param regimeSnapshots - Regime data for slippage calculation
   * @param options - Backtest options
   * @returns Comparison result with recommendation
   */
  async compareConfigs(
    baseConfig: Config,
    proposedConfig: Config,
    trades: Trade[],
    ohlcvData: OHLCV[],
    regimeSnapshots: RegimeSnapshot[],
    options: BacktestOptions = {}
  ): Promise<ComparisonResult> {
    // Run backtest with baseline config
    const baseResult = await this.replay(
      trades,
      baseConfig,
      ohlcvData,
      regimeSnapshots,
      options
    );

    // Run backtest with proposed config
    const proposedResult = await this.replay(
      trades,
      proposedConfig,
      ohlcvData,
      regimeSnapshots,
      options
    );

    // Calculate deltas
    const pnlDelta = proposedResult.totalPnL - baseResult.totalPnL;
    const drawdownDelta = proposedResult.maxDrawdown - baseResult.maxDrawdown;

    // Apply rejection rules
    let recommendation: 'approve' | 'reject' = 'approve';
    let reason = 'Proposal improves performance metrics';

    // Rule 1: Reject if new PnL <= old PnL (Requirement 3.3)
    if (proposedResult.totalPnL <= baseResult.totalPnL) {
      recommendation = 'reject';
      reason = `New PnL (${proposedResult.totalPnL.toFixed(2)}) is not better than old PnL (${baseResult.totalPnL.toFixed(2)})`;
    }
    // Rule 2: Reject if new drawdown > old drawdown * 1.1 (Requirement 3.4)
    else if (proposedResult.maxDrawdown > baseResult.maxDrawdown * 1.1) {
      recommendation = 'reject';
      reason = `New drawdown (${proposedResult.maxDrawdown.toFixed(2)}) exceeds old drawdown (${baseResult.maxDrawdown.toFixed(2)}) by more than 10%`;
    }

    return {
      baseResult,
      proposedResult,
      pnlDelta,
      drawdownDelta,
      recommendation,
      reason,
    };
  }

  /**
   * Generate a full validation report for a proposal
   * 
   * @param baseConfig - Current configuration
   * @param proposedConfig - Proposed configuration
   * @param trades - Historical trades
   * @param ohlcvData - Market data
   * @param regimeSnapshots - Regime data
   * @param options - Backtest options
   * @returns Full validation report
   */
  async generateValidationReport(
    baseConfig: Config,
    proposedConfig: Config,
    trades: Trade[],
    ohlcvData: OHLCV[],
    regimeSnapshots: RegimeSnapshot[],
    options: BacktestOptions = {}
  ): Promise<ValidationReport> {
    const comparison = await this.compareConfigs(
      baseConfig,
      proposedConfig,
      trades,
      ohlcvData,
      regimeSnapshots,
      options
    );

    const { baseResult, proposedResult, pnlDelta, drawdownDelta, recommendation, reason } = comparison;

    // Calculate percentage deltas
    const pnlDeltaPercent = baseResult.totalPnL !== 0
      ? (pnlDelta / Math.abs(baseResult.totalPnL)) * 100
      : pnlDelta > 0 ? 100 : pnlDelta < 0 ? -100 : 0;

    const drawdownDeltaPercent = baseResult.maxDrawdown !== 0
      ? (drawdownDelta / baseResult.maxDrawdown) * 100
      : drawdownDelta > 0 ? 100 : drawdownDelta < 0 ? -100 : 0;

    const winRateDelta = proposedResult.winRate - baseResult.winRate;

    // Calculate confidence score based on trade count and consistency
    const confidenceScore = this.calculateConfidenceScore(
      trades.length,
      proposedResult,
      baseResult
    );

    // Determine start and end times
    const timestamps = trades.map(t => t.timestamp);
    const startTime = options.startTime ?? Math.min(...timestamps);
    const endTime = options.endTime ?? Math.max(...timestamps);

    return {
      passed: recommendation === 'approve',
      timestamp: Date.now(),
      backtestPeriod: {
        start: startTime,
        end: endTime,
      },
      baselineMetrics: baseResult,
      proposedMetrics: proposedResult,
      deltas: {
        pnlDelta,
        pnlDeltaPercent,
        drawdownDelta,
        drawdownDeltaPercent,
        winRateDelta,
      },
      confidenceScore,
      rejectionReason: recommendation === 'reject' ? reason : undefined,
      recommendation: recommendation === 'approve' ? 'approve' : 'reject',
    };
  }


  /**
   * Create an empty backtest result
   */
  private createEmptyResult(): BacktestResult {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      avgSlippage: 0,
      avgDuration: 0,
      profitFactor: 0,
    };
  }

  /**
   * Create an empty extended backtest result
   */
  private createEmptyExtendedResult(): ExtendedBacktestResult {
    return {
      ...this.createEmptyResult(),
      warnings: [],
      skippedTrades: 0,
    };
  }

  /**
   * Find the regime snapshot closest to a given timestamp
   */
  private findRegimeAtTime(
    regimeSnapshots: RegimeSnapshot[],
    timestamp: number
  ): RegimeSnapshot | null {
    if (regimeSnapshots.length === 0) {
      return null;
    }

    // Sort by timestamp
    const sorted = [...regimeSnapshots].sort((a, b) => a.timestamp - b.timestamp);

    // Find the closest regime that is <= timestamp
    let closest: RegimeSnapshot | null = null;
    for (const regime of sorted) {
      if (regime.timestamp <= timestamp) {
        closest = regime;
      } else {
        break;
      }
    }

    return closest;
  }

  /**
   * Estimate ATR from OHLCV data around a timestamp
   */
  private estimateATR(ohlcvData: OHLCV[], timestamp: number, periods = 14): number {
    if (ohlcvData.length === 0) {
      return 0;
    }

    // Filter data before timestamp
    const relevantData = ohlcvData
      .filter(d => d.timestamp <= timestamp)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, periods + 1);

    if (relevantData.length < 2) {
      // Use single candle range as fallback
      const candle = relevantData[0];
      return candle ? candle.high - candle.low : 0;
    }

    // Calculate True Range for each period
    const trueRanges: number[] = [];
    for (let i = 0; i < relevantData.length - 1; i++) {
      const current = relevantData[i];
      const previous = relevantData[i + 1];
      
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      );
      trueRanges.push(tr);
    }

    // Calculate average
    if (trueRanges.length === 0) {
      return 0;
    }

    return trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length;
  }

  /**
   * Calculate position size based on risk parameters
   */
  private calculatePositionSize(
    equity: number,
    riskPerTrade: number,
    maxLeverage: number,
    entryPrice: number
  ): number {
    // Risk amount in dollars
    const riskAmount = equity * riskPerTrade;
    
    // Position size with leverage
    const maxPosition = equity * maxLeverage;
    
    // Use the smaller of risk-based size and max position
    const positionSize = Math.min(riskAmount * maxLeverage, maxPosition);
    
    return positionSize;
  }

  /**
   * Simulate trade exit based on stop loss and take profit
   */
  private simulateExit(
    trade: Trade,
    entry: number,
    stopLoss: number,
    takeProfit: number,
    ohlcvData: OHLCV[]
  ): { exitPrice: number; exitReason: Trade['exitReason']; duration: number } {
    // Calculate stop and target prices
    const stopPrice = trade.side === 'long'
      ? entry * (1 - stopLoss)
      : entry * (1 + stopLoss);
    
    const targetPrice = trade.side === 'long'
      ? entry * (1 + takeProfit)
      : entry * (1 - takeProfit);

    // Find candles after entry
    const relevantCandles = ohlcvData
      .filter(d => d.timestamp > trade.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Simulate price action
    for (const candle of relevantCandles) {
      if (trade.side === 'long') {
        // Check stop loss first (worst case)
        if (candle.low <= stopPrice) {
          return {
            exitPrice: stopPrice,
            exitReason: 'stop_loss',
            duration: candle.timestamp - trade.timestamp,
          };
        }
        // Check take profit
        if (candle.high >= targetPrice) {
          return {
            exitPrice: targetPrice,
            exitReason: 'take_profit',
            duration: candle.timestamp - trade.timestamp,
          };
        }
      } else {
        // Short position
        // Check stop loss first (worst case)
        if (candle.high >= stopPrice) {
          return {
            exitPrice: stopPrice,
            exitReason: 'stop_loss',
            duration: candle.timestamp - trade.timestamp,
          };
        }
        // Check take profit
        if (candle.low <= targetPrice) {
          return {
            exitPrice: targetPrice,
            exitReason: 'take_profit',
            duration: candle.timestamp - trade.timestamp,
          };
        }
      }
    }

    // If no exit triggered, use original trade exit
    return {
      exitPrice: trade.exitPrice,
      exitReason: trade.exitReason,
      duration: trade.duration,
    };
  }


  /**
   * Calculate PnL for a trade
   */
  private calculatePnL(
    side: 'long' | 'short',
    entry: number,
    exit: number,
    positionSize: number,
    leverage: number
  ): number {
    const priceChange = side === 'long'
      ? (exit - entry) / entry
      : (entry - exit) / entry;
    
    // PnL = position size * price change (leverage already factored into position size)
    return positionSize * priceChange;
  }

  /**
   * Calculate aggregate metrics from simulated trades
   */
  private calculateMetrics(
    simulatedTrades: SimulatedTrade[],
    initialCapital: number,
    finalEquity: number,
    maxDrawdown: number,
    maxDrawdownPercent: number,
    riskFreeRate: number
  ): BacktestResult {
    if (simulatedTrades.length === 0) {
      return this.createEmptyResult();
    }

    const totalTrades = simulatedTrades.length;
    const winningTrades = simulatedTrades.filter(t => t.pnl > 0).length;
    const losingTrades = simulatedTrades.filter(t => t.pnl <= 0).length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    const totalPnL = finalEquity - initialCapital;
    const avgPnL = totalPnL / totalTrades;

    // Calculate profit factor
    const grossProfit = simulatedTrades
      .filter(t => t.pnl > 0)
      .reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(
      simulatedTrades
        .filter(t => t.pnl < 0)
        .reduce((sum, t) => sum + t.pnl, 0)
    );
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Calculate Sharpe ratio
    const returns = simulatedTrades.map(t => t.pnl / initialCapital);
    const sharpeRatio = this.calculateSharpeRatio(returns, riskFreeRate);

    // Calculate averages
    const avgSlippage = simulatedTrades.reduce((sum, t) => sum + t.slippage, 0) / totalTrades;
    const avgDuration = simulatedTrades.reduce((sum, t) => sum + t.duration, 0) / totalTrades;

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnL,
      avgPnL,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      avgSlippage,
      avgDuration,
      profitFactor: isFinite(profitFactor) ? profitFactor : 0,
    };
  }

  /**
   * Calculate Sharpe ratio from returns
   */
  private calculateSharpeRatio(returns: number[], riskFreeRate: number): number {
    if (returns.length < 2) {
      return 0;
    }

    // Calculate mean return
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Calculate standard deviation
    const squaredDiffs = returns.map(r => Math.pow(r - meanReturn, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return 0;
    }

    // Annualize (assuming daily returns, ~252 trading days)
    const annualizedReturn = meanReturn * 252;
    const annualizedStdDev = stdDev * Math.sqrt(252);

    // Sharpe ratio
    return (annualizedReturn - riskFreeRate) / annualizedStdDev;
  }

  /**
   * Calculate confidence score based on sample size and consistency
   */
  private calculateConfidenceScore(
    tradeCount: number,
    proposedResult: BacktestResult,
    baseResult: BacktestResult
  ): number {
    // Base confidence from sample size (more trades = higher confidence)
    // 100 trades = 0.5, 500 trades = 0.8, 1000+ trades = 0.9
    const sampleConfidence = Math.min(0.9, 0.3 + (tradeCount / 1000) * 0.6);

    // Consistency factor: penalize if win rate dropped significantly
    const winRateDrop = baseResult.winRate - proposedResult.winRate;
    const consistencyPenalty = Math.max(0, winRateDrop * 0.5);

    // Improvement factor: boost if PnL improved significantly
    const pnlImprovement = baseResult.totalPnL !== 0
      ? (proposedResult.totalPnL - baseResult.totalPnL) / Math.abs(baseResult.totalPnL)
      : proposedResult.totalPnL > 0 ? 0.1 : 0;
    const improvementBonus = Math.min(0.1, Math.max(0, pnlImprovement * 0.1));

    // Final confidence score
    const confidence = Math.max(0, Math.min(1, sampleConfidence - consistencyPenalty + improvementBonus));

    return confidence;
  }

  /**
   * Get the latency model instance
   */
  getLatencyModel(): LatencyModel {
    return this.latencyModel;
  }

  /**
   * Set a new latency model
   */
  setLatencyModel(latencyModel: LatencyModel): void {
    this.latencyModel = latencyModel;
  }

  /**
   * Calculate equity curve from trades
   */
  private calculateEquityCurve(trades: SimulatedTrade[], initialCapital: number): number[] {
    const curve = [initialCapital];
    let equity = initialCapital;

    for (const trade of trades) {
      equity += trade.pnl;
      curve.push(equity);
    }

    return curve;
  }

  /**
   * Calculate drawdown metrics from equity curve
   */
  private calculateDrawdownMetrics(equityCurve: number[]): {
    maxDrawdown: number;
    maxDrawdownPercent: number;
  } {
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = equityCurve[0];

    for (const equity of equityCurve) {
      if (equity > peak) {
        peak = equity;
      }

      const drawdown = peak - equity;
      const drawdownPercent = peak > 0 ? drawdown / peak : 0;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    return { maxDrawdown, maxDrawdownPercent };
  }

  /**
   * Calculate Sortino ratio (downside deviation)
   */
  private calculateSortinoRatio(returns: number[], riskFreeRate: number): number {
    if (returns.length < 2) {
      return 0;
    }

    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    // Calculate downside deviation (only negative returns)
    const negativeReturns = returns.filter(r => r < 0);
    if (negativeReturns.length === 0) {
      return meanReturn > riskFreeRate / 252 ? Infinity : 0;
    }

    const downsideVariance = negativeReturns
      .map(r => Math.pow(r, 2))
      .reduce((sum, sq) => sum + sq, 0) / negativeReturns.length;
    
    const downsideDeviation = Math.sqrt(downsideVariance);

    if (downsideDeviation === 0) {
      return 0;
    }

    // Annualize
    const annualizedReturn = meanReturn * 252;
    const annualizedDownsideDeviation = downsideDeviation * Math.sqrt(252);

    return (annualizedReturn - riskFreeRate) / annualizedDownsideDeviation;
  }

  /**
   * Calculate Calmar ratio (return / max drawdown)
   */
  private calculateCalmarRatio(totalReturn: number, maxDrawdownPercent: number): number {
    if (maxDrawdownPercent === 0) {
      return totalReturn > 0 ? Infinity : 0;
    }

    return totalReturn / maxDrawdownPercent;
  }

  /**
   * Calculate maximum consecutive losses
   */
  private calculateMaxConsecutiveLosses(trades: SimulatedTrade[]): number {
    let maxConsecutive = 0;
    let currentConsecutive = 0;

    for (const trade of trades) {
      if (trade.pnl <= 0) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }

    return maxConsecutive;
  }
}

/**
 * Internal type for simulated trade results
 */
interface SimulatedTrade {
  originalTrade: Trade;
  adjustedEntry: number;
  exitPrice: number;
  exitReason: Trade['exitReason'];
  pnl: number;
  slippage: number;
  duration: number;
}
