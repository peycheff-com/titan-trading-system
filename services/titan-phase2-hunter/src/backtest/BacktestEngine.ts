/**
 * Backtest Engine for Titan Phase 2 - The Hunter
 *
 * Validates the Holographic Market Structure strategy on historical data with realistic
 * execution simulation including slippage, fees, and market conditions analysis.
 *
 * Requirements: 17.1-17.7 (Backtesting & Forward Testing)
 */

import {
  HologramState,
  Metrics,
  OHLCV,
  OrderParams,
  OrderResult,
  OrderStatus,
  Position,
  SessionType,
  SignalData,
  TimeRange,
} from '../types';
import { BybitPerpsClient } from '../exchanges/BybitPerpsClient';
import { HologramEngine } from '../engine/HologramEngine';
import { SessionProfiler } from '../engine/SessionProfiler';
import { InefficiencyMapper } from '../engine/InefficiencyMapper';
import { CVDValidator } from '../engine/CVDValidator';
import { SignalGenerator } from '../execution/SignalGenerator';
import { Oracle } from '../oracle/Oracle';
import { GlobalLiquidityAggregator } from '../global-liquidity/GlobalLiquidityAggregator';
import { logError } from '../logging/Logger';

export interface BacktestConfig {
  startDate: number; // Unix timestamp
  endDate: number; // Unix timestamp
  symbols: string[]; // Symbols to backtest
  initialEquity: number; // Starting capital
  riskPerTrade: number; // Risk per trade (0.02 = 2%)
  maxLeverage: number; // Maximum leverage (3-5x)
  maxConcurrentPositions: number; // Max open positions
  slippageModel: SlippageModel;
  feeModel: FeeModel;
  timeframe: string; // Primary timeframe for signals ('15m')
}

export interface SlippageModel {
  postOnlySlippage: number; // 0.001 = 0.1%
  iocSlippage: number; // 0.002 = 0.2%
  marketSlippage: number; // 0.003 = 0.3%
}

export interface FeeModel {
  makerFee: number; // -0.0001 = -0.01% (rebate)
  takerFee: number; // 0.0005 = 0.05%
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  fees: number;
  slippage: number;
  holdTime: number; // milliseconds
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIMEOUT' | 'MANUAL';
  signal: SignalData;
  rValue: number; // R multiple (profit/loss in R units)
}

export interface BacktestResults {
  config: BacktestConfig;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  drawdownCurve: DrawdownPoint[];
  losingPeriods: LosingPeriod[];
  marketConditionAnalysis: MarketConditionAnalysis;
}

export interface BacktestMetrics extends Metrics {
  startDate: number;
  endDate: number;
  duration: number; // milliseconds
  initialEquity: number;
  finalEquity: number;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  maxDrawdownDuration: number; // milliseconds
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageHoldTime: number; // milliseconds
  totalFees: number;
  totalSlippage: number;
  maxConcurrentPositions: number;
  averagePositionsOpen: number;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  drawdown: number;
  openPositions: number;
}

export interface DrawdownPoint {
  timestamp: number;
  drawdown: number;
  duration: number; // milliseconds since drawdown started
  peak: number;
  trough: number;
}

export interface LosingPeriod {
  startTime: number;
  endTime: number;
  duration: number;
  consecutiveLosses: number;
  totalLoss: number;
  maxDrawdown: number;
  marketConditions: {
    volatility: number;
    trend: 'BULL' | 'BEAR' | 'RANGE';
    session: SessionType;
    btcCorrelation: number;
  };
  suggestedAdjustments: string[];
}

export interface MarketConditionAnalysis {
  volatilityRegimes: {
    low: { winRate: number; profitFactor: number; trades: number };
    medium: { winRate: number; profitFactor: number; trades: number };
    high: { winRate: number; profitFactor: number; trades: number };
  };
  sessionPerformance: {
    [K in SessionType]: {
      winRate: number;
      profitFactor: number;
      trades: number;
    };
  };
  trendPerformance: {
    BULL: { winRate: number; profitFactor: number; trades: number };
    BEAR: { winRate: number; profitFactor: number; trades: number };
    RANGE: { winRate: number; profitFactor: number; trades: number };
  };
  correlationImpact: {
    lowCorrelation: { winRate: number; profitFactor: number; trades: number };
    highCorrelation: { winRate: number; profitFactor: number; trades: number };
  };
}

export class BacktestEngine {
  private bybitClient: BybitPerpsClient;
  private hologramEngine: HologramEngine;
  private sessionProfiler: SessionProfiler;
  private inefficiencyMapper: InefficiencyMapper;
  private cvdValidator: CVDValidator;
  private signalGenerator: SignalGenerator;
  private oracle?: Oracle;
  private globalLiquidity?: GlobalLiquidityAggregator;
  private config: BacktestConfig;
  private isRunning = false;

  constructor(
    bybitClient: BybitPerpsClient,
    hologramEngine: HologramEngine,
    sessionProfiler: SessionProfiler,
    inefficiencyMapper: InefficiencyMapper,
    cvdValidator: CVDValidator,
    signalGenerator: SignalGenerator,
    oracle?: Oracle,
    globalLiquidity?: GlobalLiquidityAggregator
  ) {
    this.bybitClient = bybitClient;
    this.hologramEngine = hologramEngine;
    this.sessionProfiler = sessionProfiler;
    this.inefficiencyMapper = inefficiencyMapper;
    this.cvdValidator = cvdValidator;
    this.signalGenerator = signalGenerator;
    this.oracle = oracle;
    this.globalLiquidity = globalLiquidity;

    // Default configuration
    this.config = {
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      endDate: Date.now(),
      symbols: ['BTCUSDT', 'ETHUSDT'],
      initialEquity: 10000,
      riskPerTrade: 0.02,
      maxLeverage: 3,
      maxConcurrentPositions: 3,
      slippageModel: {
        postOnlySlippage: 0.001, // 0.1%
        iocSlippage: 0.002, // 0.2%
        marketSlippage: 0.003, // 0.3%
      },
      feeModel: {
        makerFee: -0.0001, // -0.01% (rebate)
        takerFee: 0.0005, // 0.05%
      },
      timeframe: '15m',
    };
  }

  /**
   * Fetch historical OHLCV data for specified date range and symbols
   * Requirements: 17.1
   */
  public async fetchHistoricalData(
    symbols: string[],
    timeframe: string,
    startDate: number,
    endDate: number
  ): Promise<Map<string, OHLCV[]>> {
    const historicalData = new Map<string, OHLCV[]>();

    try {
      console.log(
        `📊 Fetching historical data for ${symbols.length} symbols from ${new Date(
          startDate
        ).toISOString()} to ${new Date(endDate).toISOString()}`
      );

      for (const symbol of symbols) {
        try {
          // Calculate required number of candles
          const timeframeMs = this.getTimeframeMs(timeframe);
          const duration = endDate - startDate;
          const requiredCandles = Math.ceil(duration / timeframeMs) + 100; // Add buffer for indicators

          // Fetch data in chunks if needed (Bybit limit is 1000 candles per request)
          const allCandles: OHLCV[] = [];
          // eslint-disable-next-line functional/no-let
          let currentEndTime = endDate;

          while (currentEndTime > startDate && allCandles.length < requiredCandles) {
            const chunkSize = Math.min(1000, requiredCandles - allCandles.length);

            const candles = await this.bybitClient.fetchOHLCV(symbol, timeframe, chunkSize);

            if (candles.length === 0) break;

            // Filter candles within date range
            const filteredCandles = candles.filter(
              candle => candle.timestamp >= startDate && candle.timestamp <= endDate
            );

            // eslint-disable-next-line functional/immutable-data
            allCandles.unshift(...filteredCandles);

            // Update currentEndTime for next chunk
            currentEndTime = candles[0].timestamp - timeframeMs;

            // Add delay to respect rate limits
            await this.sleep(100);
          }

          // Sort by timestamp and remove duplicates
          const uniqueCandles = Array.from(
            new Map(allCandles.map(candle => [candle.timestamp, candle])).values()
          ).sort((a, b) => a.timestamp - b.timestamp);

          // eslint-disable-next-line functional/immutable-data
          historicalData.set(symbol, uniqueCandles);
          console.log(`✅ Fetched ${uniqueCandles.length} candles for ${symbol}`);
        } catch (error) {
          console.error(`❌ Failed to fetch data for ${symbol}:`, error);
          logError('ERROR', `Failed to fetch historical data for ${symbol}`, {
            symbol,
            component: 'BacktestEngine',
            function: 'fetchHistoricalData',
            stack: (error as Error).stack,
          });
        }
      }

      console.log(`✅ Historical data fetch complete: ${historicalData.size} symbols`);
      return historicalData;
    } catch (error) {
      console.error('❌ Error fetching historical data:', error);
      throw new Error(
        `Failed to fetch historical data: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Simulate trade execution with realistic slippage
   * Requirements: 17.2
   */
  public simulateTrade(
    signal: SignalData,
    orderType: 'POST_ONLY' | 'IOC' | 'MARKET',
    currentPrice: number
  ): { fillPrice: number; slippage: number; filled: boolean } {
    // eslint-disable-next-line functional/no-let
    let slippagePercent: number;
    // eslint-disable-next-line functional/no-let
    let filled = true;

    // Apply slippage based on order type
    switch (orderType) {
      case 'POST_ONLY':
        slippagePercent = this.config.slippageModel.postOnlySlippage;
        // Post-Only orders have a chance of not filling if price moves away
        if (Math.random() < 0.1) {
          // 10% chance of no fill
          filled = false;
        }
        break;
      case 'IOC':
        slippagePercent = this.config.slippageModel.iocSlippage;
        break;
      case 'MARKET':
        slippagePercent = this.config.slippageModel.marketSlippage;
        break;
      default:
        slippagePercent = this.config.slippageModel.iocSlippage;
    }

    if (!filled) {
      return { fillPrice: 0, slippage: 0, filled: false };
    }

    // Calculate slippage direction based on trade direction
    const slippageDirection = signal.direction === 'LONG' ? 1 : -1;
    const slippageAmount = currentPrice * slippagePercent * slippageDirection;
    const fillPrice = currentPrice + slippageAmount;
    const slippage = Math.abs(slippageAmount);

    return { fillPrice, slippage, filled: true };
  }

  /**
   * Apply fee model to trades
   * Requirements: 17.3
   */
  public applyFees(notionalValue: number, orderType: 'POST_ONLY' | 'IOC' | 'MARKET'): number {
    // eslint-disable-next-line functional/no-let
    let feeRate: number;

    // Apply fees based on order type
    switch (orderType) {
      case 'POST_ONLY':
        feeRate = this.config.feeModel.makerFee; // Negative = rebate
        break;
      case 'IOC':
      case 'MARKET':
        feeRate = this.config.feeModel.takerFee;
        break;
      default:
        feeRate = this.config.feeModel.takerFee;
    }

    return notionalValue * feeRate;
  }

  /**
   * Calculate comprehensive backtest results
   * Requirements: 17.4
   */
  public calcBacktestResults(trades: BacktestTrade[], config: BacktestConfig): BacktestMetrics {
    if (trades.length === 0) {
      return this.getEmptyMetrics(config);
    }

    const duration = config.endDate - config.startDate;
    const durationYears = duration / (365.25 * 24 * 60 * 60 * 1000);

    // Basic trade statistics
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalFees = trades.reduce((sum, t) => sum + t.fees, 0);
    const totalSlippage = trades.reduce((sum, t) => sum + t.slippage, 0);

    // Calculate equity curve for drawdown analysis
    // eslint-disable-next-line functional/no-let
    let runningEquity = config.initialEquity;
    // eslint-disable-next-line functional/no-let
    let maxEquity = config.initialEquity;
    // eslint-disable-next-line functional/no-let
    let maxDrawdown = 0;
    // eslint-disable-next-line functional/no-let
    let currentDrawdownStart = 0;
    // eslint-disable-next-line functional/no-let
    let maxDrawdownDuration = 0;

    for (const trade of trades) {
      runningEquity += trade.pnl;

      if (runningEquity > maxEquity) {
        maxEquity = runningEquity;
        currentDrawdownStart = 0;
      } else {
        const drawdown = (maxEquity - runningEquity) / maxEquity;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }

        if (currentDrawdownStart === 0) {
          currentDrawdownStart = trade.exitTime;
        } else {
          const drawdownDuration = trade.exitTime - currentDrawdownStart;
          if (drawdownDuration > maxDrawdownDuration) {
            maxDrawdownDuration = drawdownDuration;
          }
        }
      }
    }

    const finalEquity = config.initialEquity + totalPnl;
    const totalReturn = (finalEquity - config.initialEquity) / config.initialEquity;
    const annualizedReturn = Math.pow(1 + totalReturn, 1 / durationYears) - 1;

    // Risk metrics
    const returns = trades.map(t => t.pnlPercent);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const returnStdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    const sharpeRatio = returnStdDev > 0 ? (avgReturn / returnStdDev) * Math.sqrt(252) : 0;

    const negativeReturns = returns.filter(r => r < 0);
    const downsideStdDev =
      negativeReturns.length > 0
        ? Math.sqrt(
            negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
          )
        : 0;
    const sortinoRatio = downsideStdDev > 0 ? (avgReturn / downsideStdDev) * Math.sqrt(252) : 0;

    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

    // Trade statistics
    const winRate = winningTrades.length / trades.length;
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const averageWin =
      winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
        : 0;
    const averageLoss =
      losingTrades.length > 0
        ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length
        : 0;

    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;

    const averageHoldTime = trades.reduce((sum, t) => sum + t.holdTime, 0) / trades.length;

    // Consecutive wins/losses
    // eslint-disable-next-line functional/no-let
    let maxConsecutiveWins = 0;
    // eslint-disable-next-line functional/no-let
    let maxConsecutiveLosses = 0;
    // eslint-disable-next-line functional/no-let
    let currentWinStreak = 0;
    // eslint-disable-next-line functional/no-let
    let currentLossStreak = 0;

    for (const trade of trades) {
      if (trade.pnl > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
      }
    }

    // Position statistics
    const positionCounts = trades.map(t => 1); // Simplified - would need actual concurrent position tracking
    const maxConcurrentPositions = Math.max(...positionCounts);
    const averagePositionsOpen =
      positionCounts.reduce((sum, c) => sum + c, 0) / positionCounts.length;

    return {
      startDate: config.startDate,
      endDate: config.endDate,
      duration,
      initialEquity: config.initialEquity,
      finalEquity,
      totalReturn,
      annualizedReturn,
      maxDrawdown,
      maxDrawdownDuration,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      winRate,
      profitFactor,
      totalTrades: trades.length,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      consecutiveWins: maxConsecutiveWins,
      consecutiveLosses: maxConsecutiveLosses,
      averageHoldTime,
      totalFees,
      totalSlippage,
      maxConcurrentPositions,
      averagePositionsOpen,
    };
  }

  /**
   * Generate equity curve chart data
   * Requirements: 17.5
   */
  public generateEquityCurve(trades: BacktestTrade[], initialEquity: number): EquityPoint[] {
    const equityCurve: EquityPoint[] = [];
    // eslint-disable-next-line functional/no-let
    let runningEquity = initialEquity;
    // eslint-disable-next-line functional/no-let
    let maxEquity = initialEquity;
    // eslint-disable-next-line functional/no-let
    let openPositions = 0;

    // Add starting point
    // eslint-disable-next-line functional/immutable-data
    equityCurve.push({
      timestamp: trades.length > 0 ? trades[0].entryTime : Date.now(),
      equity: initialEquity,
      drawdown: 0,
      openPositions: 0,
    });

    for (const trade of trades) {
      // Entry point
      openPositions++;
      // eslint-disable-next-line functional/immutable-data
      equityCurve.push({
        timestamp: trade.entryTime,
        equity: runningEquity,
        drawdown: maxEquity > 0 ? (maxEquity - runningEquity) / maxEquity : 0,
        openPositions,
      });

      // Exit point
      runningEquity += trade.pnl;
      openPositions--;

      if (runningEquity > maxEquity) {
        maxEquity = runningEquity;
      }

      // eslint-disable-next-line functional/immutable-data
      equityCurve.push({
        timestamp: trade.exitTime,
        equity: runningEquity,
        drawdown: maxEquity > 0 ? (maxEquity - runningEquity) / maxEquity : 0,
        openPositions,
      });
    }

    return equityCurve;
  }

  /**
   * Analyze losing periods and correlate with market conditions
   * Requirements: 17.6
   */
  public analyzeLosingPeriods(
    trades: BacktestTrade[],
    historicalData: Map<string, OHLCV[]>
  ): LosingPeriod[] {
    const losingPeriods: LosingPeriod[] = [];
    // eslint-disable-next-line functional/no-let
    let currentPeriod: Partial<LosingPeriod> | null = null;
    // eslint-disable-next-line functional/no-let
    let consecutiveLosses = 0;

    for (const trade of trades) {
      if (trade.pnl < 0) {
        consecutiveLosses++;

        if (!currentPeriod) {
          // Start new losing period
          currentPeriod = {
            startTime: trade.entryTime,
            consecutiveLosses: 1,
            totalLoss: trade.pnl,
            maxDrawdown: Math.abs(trade.pnl),
          };
        } else {
          // Continue losing period
          // eslint-disable-next-line functional/immutable-data
          currentPeriod.consecutiveLosses = consecutiveLosses;
          currentPeriod.totalLoss! += trade.pnl;
          // eslint-disable-next-line functional/immutable-data
          currentPeriod.maxDrawdown = Math.max(
            currentPeriod.maxDrawdown!,
            Math.abs(currentPeriod.totalLoss!)
          );
        }
      } else {
        // End losing period if it exists
        if (currentPeriod && consecutiveLosses >= 3) {
          // eslint-disable-next-line functional/immutable-data
          currentPeriod.endTime = trade.entryTime;
          // eslint-disable-next-line functional/immutable-data
          currentPeriod.duration = currentPeriod.endTime - currentPeriod.startTime!;

          // Analyze market conditions during this period
          // eslint-disable-next-line functional/immutable-data
          currentPeriod.marketConditions = this.analyzeMarketConditions(
            currentPeriod.startTime!,
            currentPeriod.endTime,
            historicalData
          );

          // Generate suggested adjustments
          // eslint-disable-next-line functional/immutable-data
          currentPeriod.suggestedAdjustments = this.generateAdjustmentSuggestions(
            currentPeriod as LosingPeriod
          );

          // eslint-disable-next-line functional/immutable-data
          losingPeriods.push(currentPeriod as LosingPeriod);
        }

        currentPeriod = null;
        consecutiveLosses = 0;
      }
    }

    // Handle ongoing losing period at end
    if (currentPeriod && consecutiveLosses >= 3) {
      const lastTrade = trades[trades.length - 1];
      // eslint-disable-next-line functional/immutable-data
      currentPeriod.endTime = lastTrade.exitTime;
      // eslint-disable-next-line functional/immutable-data
      currentPeriod.duration = currentPeriod.endTime - currentPeriod.startTime!;
      // eslint-disable-next-line functional/immutable-data
      currentPeriod.marketConditions = this.analyzeMarketConditions(
        currentPeriod.startTime!,
        currentPeriod.endTime,
        historicalData
      );
      // eslint-disable-next-line functional/immutable-data
      currentPeriod.suggestedAdjustments = this.generateAdjustmentSuggestions(
        currentPeriod as LosingPeriod
      );
      // eslint-disable-next-line functional/immutable-data
      losingPeriods.push(currentPeriod as LosingPeriod);
    }

    return losingPeriods;
  }

  /**
   * Run complete backtest
   */
  public async runBacktest(config: Partial<BacktestConfig> = {}): Promise<BacktestResults> {
    if (this.isRunning) {
      throw new Error('Backtest is already running');
    }

    // eslint-disable-next-line functional/immutable-data
    this.isRunning = true;
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };

    try {
      console.log('🚀 Starting backtest...');
      console.log(
        `📅 Period: ${new Date(this.config.startDate).toISOString()} to ${new Date(
          this.config.endDate
        ).toISOString()}`
      );
      console.log(`💰 Initial Equity: $${this.config.initialEquity.toLocaleString()}`);
      console.log(`📊 Symbols: ${this.config.symbols.join(', ')}`);

      // Fetch historical data
      const historicalData = await this.fetchHistoricalData(
        this.config.symbols,
        this.config.timeframe,
        this.config.startDate,
        this.config.endDate
      );

      // Simulate trading
      const trades = await this.simulateTrading(historicalData);

      // Calculate results
      const metrics = this.calcBacktestResults(trades, this.config);
      const equityCurve = this.generateEquityCurve(trades, this.config.initialEquity);
      const drawdownCurve = this.generateDrawdownCurve(equityCurve);
      const losingPeriods = this.analyzeLosingPeriods(trades, historicalData);
      const marketConditionAnalysis = this.analyzeMarketConditionPerformance(
        trades,
        historicalData
      );

      const results: BacktestResults = {
        config: this.config,
        trades,
        metrics,
        equityCurve,
        drawdownCurve,
        losingPeriods,
        marketConditionAnalysis,
      };

      console.log('✅ Backtest completed successfully');
      console.log(`📈 Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%`);
      console.log(`🎯 Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);
      console.log(`💹 Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
      console.log(`📉 Max Drawdown: ${(metrics.maxDrawdown * 100).toFixed(2)}%`);

      return results;
    } catch (error) {
      console.error('❌ Backtest failed:', error);
      throw error;
    } finally {
      // eslint-disable-next-line functional/immutable-data
      this.isRunning = false;
    }
  }

  /**
   * Simulate trading over historical data
   */
  private async simulateTrading(historicalData: Map<string, OHLCV[]>): Promise<BacktestTrade[]> {
    const trades: BacktestTrade[] = [];
    const openPositions = new Map<string, BacktestTrade>();
    // eslint-disable-next-line functional/no-let
    let currentEquity = this.config.initialEquity;

    // Get all timestamps across all symbols
    const allTimestamps = new Set<number>();
    for (const candles of Array.from(historicalData.values())) {
      // eslint-disable-next-line functional/immutable-data
      candles.forEach(candle => allTimestamps.add(candle.timestamp));
    }
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    console.log(`🔄 Simulating trading across ${sortedTimestamps.length} time periods...`);

    // eslint-disable-next-line functional/no-let
    for (let i = 0; i < sortedTimestamps.length; i++) {
      const timestamp = sortedTimestamps[i];

      // Check for exits first
      for (const [symbol, position] of Array.from(openPositions.entries())) {
        const candles = historicalData.get(symbol);
        if (!candles) continue;

        const currentCandle = candles.find(c => c.timestamp === timestamp);
        if (!currentCandle) continue;

        const exitResult = this.checkExit(position, currentCandle);
        if (exitResult.shouldExit) {
          // Close position
          // eslint-disable-next-line functional/immutable-data
          position.exitTime = timestamp;
          // eslint-disable-next-line functional/immutable-data
          position.exitPrice = exitResult.exitPrice;
          // eslint-disable-next-line functional/immutable-data
          position.exitReason = exitResult.reason;
          // eslint-disable-next-line functional/immutable-data
          position.holdTime = position.exitTime - position.entryTime;

          // Calculate PnL
          const pnlMultiplier =
            position.direction === 'LONG'
              ? (position.exitPrice - position.entryPrice) / position.entryPrice
              : (position.entryPrice - position.exitPrice) / position.entryPrice;

          // eslint-disable-next-line functional/immutable-data
          position.pnl =
            position.quantity * position.entryPrice * pnlMultiplier * position.leverage;
          // eslint-disable-next-line functional/immutable-data
          position.pnlPercent = pnlMultiplier * position.leverage;
          // eslint-disable-next-line functional/immutable-data
          position.rValue =
            position.pnl /
            (Math.abs(position.entryPrice - position.signal.stopLoss) * position.quantity);

          // Apply fees and slippage
          const notionalValue = position.quantity * position.exitPrice;
          // eslint-disable-next-line functional/immutable-data
          position.fees += this.applyFees(notionalValue, 'IOC'); // Assume IOC for exits

          const slippageResult = this.simulateTrade(position.signal, 'IOC', position.exitPrice);
          // eslint-disable-next-line functional/immutable-data
          position.slippage += slippageResult.slippage;

          currentEquity += position.pnl - position.fees - position.slippage;
          // eslint-disable-next-line functional/immutable-data
          trades.push(position);
          // eslint-disable-next-line functional/immutable-data
          openPositions.delete(symbol);
        }
      }

      // Check for new entries
      if (openPositions.size < this.config.maxConcurrentPositions) {
        for (const symbol of this.config.symbols) {
          if (openPositions.has(symbol)) continue;

          const candles = historicalData.get(symbol);
          if (!candles) continue;

          const currentCandle = candles.find(c => c.timestamp === timestamp);
          if (!currentCandle) continue;

          // Update Mocks if present to simulate time passing
          if (this.oracle && 'updateState' in this.oracle) {
            (this.oracle as any).updateState(timestamp);
          }
          if (this.globalLiquidity && 'updateState' in this.globalLiquidity) {
            (this.globalLiquidity as any).updateState(timestamp);
          }

          // Generate signal using enhanced SignalGenerator
          // Try LONG
          // eslint-disable-next-line functional/no-let
          let signal = await this.signalGenerator.generateSignal(
            symbol,
            'LONG',
            currentEquity,
            this.config.riskPerTrade,
            this.config.maxLeverage
          );

          if (!signal) {
            // Try SHORT
            signal = await this.signalGenerator.generateSignal(
              symbol,
              'SHORT',
              currentEquity,
              this.config.riskPerTrade,
              this.config.maxLeverage
            );
          }

          if (!signal) continue;

          // Simulate order execution
          const orderType = 'POST_ONLY'; // Hunter uses Post-Only orders
          const executionResult = this.simulateTrade(signal, orderType, currentCandle.close);

          if (executionResult.filled) {
            // Create new position
            const position: BacktestTrade = {
              id: `${symbol}_${timestamp}`,
              symbol,
              direction: signal.direction,
              entryTime: timestamp,
              exitTime: 0,
              entryPrice: executionResult.fillPrice,
              exitPrice: 0,
              quantity: signal.positionSize,
              leverage: signal.leverage,
              pnl: 0,
              pnlPercent: 0,
              fees: this.applyFees(signal.positionSize * executionResult.fillPrice, orderType),
              slippage: executionResult.slippage,
              holdTime: 0,
              exitReason: 'MANUAL',
              signal,
              rValue: 0,
            };

            // eslint-disable-next-line functional/immutable-data
            openPositions.set(symbol, position);
          }
        }
      }

      // Progress logging
      if (i % 1000 === 0) {
        const progress = ((i / sortedTimestamps.length) * 100).toFixed(1);
        console.log(
          `📊 Progress: ${progress}% - Open positions: ${openPositions.size} - Completed trades: ${trades.length}`
        );
      }
    }

    // Close any remaining open positions
    for (const position of Array.from(openPositions.values())) {
      const lastCandle = historicalData.get(position.symbol)?.slice(-1)[0];
      if (lastCandle) {
        // eslint-disable-next-line functional/immutable-data
        position.exitTime = lastCandle.timestamp;
        // eslint-disable-next-line functional/immutable-data
        position.exitPrice = lastCandle.close;
        // eslint-disable-next-line functional/immutable-data
        position.exitReason = 'MANUAL';
        // eslint-disable-next-line functional/immutable-data
        position.holdTime = position.exitTime - position.entryTime;

        const pnlMultiplier =
          position.direction === 'LONG'
            ? (position.exitPrice - position.entryPrice) / position.entryPrice
            : (position.entryPrice - position.exitPrice) / position.entryPrice;

        // eslint-disable-next-line functional/immutable-data
        position.pnl = position.quantity * position.entryPrice * pnlMultiplier * position.leverage;
        // eslint-disable-next-line functional/immutable-data
        position.pnlPercent = pnlMultiplier * position.leverage;
        // eslint-disable-next-line functional/immutable-data
        position.rValue =
          position.pnl /
          (Math.abs(position.entryPrice - position.signal.stopLoss) * position.quantity);

        // eslint-disable-next-line functional/immutable-data
        trades.push(position);
      }
    }

    return trades;
  }

  /**
   * Check if position should be exited
   */
  private checkExit(
    position: BacktestTrade,
    currentCandle: OHLCV
  ): {
    shouldExit: boolean;
    exitPrice: number;
    reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIMEOUT' | 'MANUAL';
  } {
    const signal = position.signal;

    // Check stop loss
    if (position.direction === 'LONG' && currentCandle.low <= signal.stopLoss) {
      return {
        shouldExit: true,
        exitPrice: signal.stopLoss,
        reason: 'STOP_LOSS',
      };
    }
    if (position.direction === 'SHORT' && currentCandle.high >= signal.stopLoss) {
      return {
        shouldExit: true,
        exitPrice: signal.stopLoss,
        reason: 'STOP_LOSS',
      };
    }

    // Check take profit
    if (position.direction === 'LONG' && currentCandle.high >= signal.takeProfit) {
      return {
        shouldExit: true,
        exitPrice: signal.takeProfit,
        reason: 'TAKE_PROFIT',
      };
    }
    if (position.direction === 'SHORT' && currentCandle.low <= signal.takeProfit) {
      return {
        shouldExit: true,
        exitPrice: signal.takeProfit,
        reason: 'TAKE_PROFIT',
      };
    }

    // Check timeout (72 hours max hold)
    const maxHoldTime = 72 * 60 * 60 * 1000; // 72 hours
    if (currentCandle.timestamp - position.entryTime > maxHoldTime) {
      return {
        shouldExit: true,
        exitPrice: currentCandle.close,
        reason: 'TIMEOUT',
      };
    }

    return { shouldExit: false, exitPrice: 0, reason: 'MANUAL' };
  }

  /**
   * Helper methods
   */
  private getTimeframeMs(timeframe: string): number {
    const timeframeMap: { [key: string]: number } = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return timeframeMap[timeframe] || 15 * 60 * 1000;
  }

  private calculateSMA(candles: OHLCV[], field: keyof OHLCV): number {
    const sum = candles.reduce((acc, candle) => acc + (candle[field] as number), 0);
    return sum / candles.length;
  }

  private generateDrawdownCurve(equityCurve: EquityPoint[]): DrawdownPoint[] {
    const drawdownCurve: DrawdownPoint[] = [];
    // eslint-disable-next-line functional/no-let
    let maxEquity = 0;
    // eslint-disable-next-line functional/no-let
    let drawdownStart = 0;

    for (const point of equityCurve) {
      if (point.equity > maxEquity) {
        maxEquity = point.equity;
        drawdownStart = 0;
      }

      const drawdown = maxEquity > 0 ? (maxEquity - point.equity) / maxEquity : 0;

      if (drawdown > 0 && drawdownStart === 0) {
        drawdownStart = point.timestamp;
      }

      // eslint-disable-next-line functional/immutable-data
      drawdownCurve.push({
        timestamp: point.timestamp,
        drawdown,
        duration: drawdownStart > 0 ? point.timestamp - drawdownStart : 0,
        peak: maxEquity,
        trough: point.equity,
      });
    }

    return drawdownCurve;
  }

  private analyzeMarketConditions(
    startTime: number,
    endTime: number,
    historicalData: Map<string, OHLCV[]>
  ): LosingPeriod['marketConditions'] {
    // Simplified market condition analysis
    // In a real implementation, this would be more sophisticated

    return {
      volatility: 0.02, // Placeholder
      trend: 'RANGE',
      session: 'LONDON',
      btcCorrelation: 0.8,
    };
  }

  private generateAdjustmentSuggestions(period: LosingPeriod): string[] {
    const suggestions: string[] = [];

    if (period.marketConditions.volatility > 0.03) {
      // eslint-disable-next-line functional/immutable-data
      suggestions.push('Reduce position sizes during high volatility periods');
    }

    if (period.marketConditions.btcCorrelation > 0.9) {
      // eslint-disable-next-line functional/immutable-data
      suggestions.push('Avoid trading during high BTC correlation periods');
    }

    if (period.consecutiveLosses > 5) {
      // eslint-disable-next-line functional/immutable-data
      suggestions.push('Implement circuit breaker after 3 consecutive losses');
    }

    return suggestions;
  }

  private analyzeMarketConditionPerformance(
    trades: BacktestTrade[],
    historicalData: Map<string, OHLCV[]>
  ): MarketConditionAnalysis {
    // Simplified analysis - would be more detailed in real implementation
    const defaultPerf = { winRate: 0.5, profitFactor: 1.0, trades: 0 };

    return {
      volatilityRegimes: {
        low: defaultPerf,
        medium: defaultPerf,
        high: defaultPerf,
      },
      sessionPerformance: {
        ASIAN: defaultPerf,
        LONDON: defaultPerf,
        NY: defaultPerf,
        DEAD_ZONE: defaultPerf,
      },
      trendPerformance: {
        BULL: defaultPerf,
        BEAR: defaultPerf,
        RANGE: defaultPerf,
      },
      correlationImpact: {
        lowCorrelation: defaultPerf,
        highCorrelation: defaultPerf,
      },
    };
  }

  private getEmptyMetrics(config: BacktestConfig): BacktestMetrics {
    return {
      startDate: config.startDate,
      endDate: config.endDate,
      duration: config.endDate - config.startDate,
      initialEquity: config.initialEquity,
      finalEquity: config.initialEquity,
      totalReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      winRate: 0,
      profitFactor: 0,
      totalTrades: 0,
      averageWin: 0,
      averageLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      averageHoldTime: 0,
      totalFees: 0,
      totalSlippage: 0,
      maxConcurrentPositions: 0,
      averagePositionsOpen: 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<BacktestConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...newConfig };
    console.log('📝 BacktestEngine configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfig(): BacktestConfig {
    return { ...this.config };
  }

  /**
   * Check if backtest is currently running
   */
  public isBacktestRunning(): boolean {
    return this.isRunning;
  }
}
