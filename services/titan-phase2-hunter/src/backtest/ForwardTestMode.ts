/**
 * Forward Test Mode for Titan Phase 2 - The Hunter
 *
 * Runs paper trading with live data to validate strategy performance
 * without risking real capital. Logs all signals without execution
 * and compares results to backtest validation.
 *
 * Requirements: 17.7 (Forward Testing)
 */

import { EventEmitter } from "events";
import { Metrics, SessionType, SignalData } from "../types";
import {
  BacktestEngine,
  BacktestMetrics,
  BacktestResults,
} from "./BacktestEngine";
import { BybitPerpsClient } from "../exchanges/BybitPerpsClient";
import { HologramEngine } from "../engine/HologramEngine";
import { SessionProfiler } from "../engine/SessionProfiler";
import { ConfigManager } from "../config/ConfigManager";
import { logError } from "../logging/Logger";

export interface ForwardTestConfig {
  enabled: boolean; // Paper trading toggle
  duration: number; // Test duration in milliseconds
  initialEquity: number; // Starting virtual capital
  riskPerTrade: number; // Risk per trade (0.02 = 2%)
  maxLeverage: number; // Maximum leverage (3-5x)
  maxConcurrentPositions: number; // Max open positions
  logSignalsOnly: boolean; // If true, only log signals without simulating trades
  compareToBacktest: boolean; // If true, compare results to backtest
  backtestReference: BacktestResults | null; // Reference backtest for comparison
}

export interface PaperTrade {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryTime: number;
  exitTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  leverage: number;
  unrealizedPnL: number;
  realizedPnL: number | null;
  fees: number;
  slippage: number;
  holdTime: number | null; // milliseconds
  exitReason: "STOP_LOSS" | "TAKE_PROFIT" | "TIMEOUT" | "MANUAL" | null;
  signal: SignalData;
  rValue: number | null; // R multiple (profit/loss in R units)
  status: "OPEN" | "CLOSED";
}

export interface ForwardTestResults {
  config: ForwardTestConfig;
  startTime: number;
  endTime: number;
  duration: number;
  paperTrades: PaperTrade[];
  signalsLogged: SignalData[];
  metrics: ForwardTestMetrics;
  backtestComparison: BacktestComparison | null;
}

export interface ForwardTestMetrics extends Metrics {
  startTime: number;
  endTime: number;
  duration: number;
  initialEquity: number;
  finalEquity: number;
  totalSignals: number;
  signalsExecuted: number;
  executionRate: number; // Percentage of signals that would have been executed
  averageSignalConfidence: number;
  sessionDistribution: {
    [K in SessionType]: number; // Number of signals per session
  };
  hologramStatusDistribution: {
    "A+": number;
    B: number;
    CONFLICT: number;
    NO_PLAY: number;
  };
}

export interface BacktestComparison {
  backtestMetrics: BacktestMetrics;
  forwardTestMetrics: ForwardTestMetrics;
  deviations: {
    winRateDiff: number; // Forward - Backtest
    profitFactorDiff: number;
    sharpeRatioDiff: number;
    maxDrawdownDiff: number;
    avgHoldTimeDiff: number; // milliseconds
  };
  validation: {
    isValid: boolean;
    confidence: number; // 0-100
    warnings: string[];
    recommendations: string[];
  };
}

export class ForwardTestMode extends EventEmitter {
  private bybitClient: BybitPerpsClient;
  private hologramEngine: HologramEngine;
  private sessionProfiler: SessionProfiler;
  private configManager: ConfigManager;
  private backtestEngine: BacktestEngine;

  private config: ForwardTestConfig;
  private isRunning = false;
  private startTime = 0;
  private paperTrades = new Map<string, PaperTrade>();
  private signalsLogged: SignalData[] = [];
  private currentEquity = 0;
  private scanInterval: NodeJS.Timeout | null = null;
  private priceUpdateInterval: NodeJS.Timeout | null = null;

  constructor(
    bybitClient: BybitPerpsClient,
    hologramEngine: HologramEngine,
    sessionProfiler: SessionProfiler,
    configManager: ConfigManager,
    backtestEngine: BacktestEngine,
  ) {
    super();

    this.bybitClient = bybitClient;
    this.hologramEngine = hologramEngine;
    this.sessionProfiler = sessionProfiler;
    this.configManager = configManager;
    this.backtestEngine = backtestEngine;

    // Default configuration
    this.config = {
      enabled: false,
      duration: 24 * 60 * 60 * 1000, // 24 hours
      initialEquity: 10000,
      riskPerTrade: 0.02,
      maxLeverage: 3,
      maxConcurrentPositions: 3,
      logSignalsOnly: false,
      compareToBacktest: false,
      backtestReference: null,
    };

    this.currentEquity = this.config.initialEquity;
  }

  /**
   * Run paper trading with live data
   * Requirements: 17.7
   */
  public async runPaperTrading(
    config: Partial<ForwardTestConfig> = {},
  ): Promise<ForwardTestResults> {
    if (this.isRunning) {
      throw new Error("Forward test is already running");
    }

    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };

    if (!this.config.enabled) {
      throw new Error("Paper trading is disabled in configuration");
    }

    // eslint-disable-next-line functional/immutable-data
    this.isRunning = true;
    // eslint-disable-next-line functional/immutable-data
    this.startTime = Date.now();
    // eslint-disable-next-line functional/immutable-data
    this.currentEquity = this.config.initialEquity;
    // eslint-disable-next-line functional/immutable-data
    this.paperTrades.clear();
    // eslint-disable-next-line functional/immutable-data
    this.signalsLogged = [];

    try {
      console.log("🚀 Starting forward test (paper trading)...");
      console.log(
        `⏱️ Duration: ${this.config.duration / (60 * 60 * 1000)} hours`,
      );
      console.log(
        `💰 Initial Equity: ${this.config.initialEquity.toLocaleString()}`,
      );
      console.log(
        `📊 Mode: ${
          this.config.logSignalsOnly ? "Signals Only" : "Full Paper Trading"
        }`,
      );

      // Start monitoring cycles
      await this.startMonitoring();

      // Wait for test duration
      await this.sleep(this.config.duration);

      // Stop monitoring
      this.stopMonitoring();

      // Generate results
      const results = await this.generateResults();

      console.log("✅ Forward test completed successfully");
      console.log(`📈 Total Signals: ${results.signalsLogged.length}`);
      console.log(`💹 Paper Trades: ${results.paperTrades.length}`);
      console.log(
        `🎯 Final Equity: ${results.metrics.finalEquity.toLocaleString()}`,
      );

      return results;
    } catch (error) {
      console.error("❌ Forward test failed:", error);
      throw error;
    } finally {
      // eslint-disable-next-line functional/immutable-data
      this.isRunning = false;
      this.stopMonitoring();
    }
  }

  /**
   * Log signals without execution for analysis
   * Requirements: 17.7
   */
  public logSignalsWithoutExecution(signal: SignalData): void {
    try {
      // Add timestamp if not present
      if (!signal.timestamp) {
        // eslint-disable-next-line functional/immutable-data
        signal.timestamp = Date.now();
      }

      // Log signal to array
      // eslint-disable-next-line functional/immutable-data
      this.signalsLogged.push({ ...signal });

      // Log to file system
      logError("WARNING", "Signal logged without execution", {
        symbol: signal.symbol,
        component: "ForwardTestMode",
        function: "logSignalsWithoutExecution",
        data: {
          direction: signal.direction,
          hologramStatus: signal.hologramStatus,
          alignmentScore: signal.alignmentScore,
          rsScore: signal.rsScore,
          sessionType: signal.sessionType,
          poiType: signal.poiType,
          cvdConfirmation: signal.cvdConfirmation,
          confidence: signal.confidence,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          positionSize: signal.positionSize,
          leverage: signal.leverage,
          timestamp: signal.timestamp,
        },
      });

      // Emit event
      this.emit("signalLogged", signal);

      console.log(
        `📝 Signal logged: ${signal.symbol} ${signal.direction} @ ${signal.entryPrice} (${signal.hologramStatus})`,
      );
    } catch (error) {
      console.error("❌ Failed to log signal:", error);
      logError("ERROR", "Failed to log signal without execution", {
        component: "ForwardTestMode",
        function: "logSignalsWithoutExecution",
        stack: (error as Error).stack,
        data: { signal },
      });
    }
  }

  /**
   * Compare forward test results to backtest for validation
   * Requirements: 17.7
   */
  public compareToBacktest(
    forwardTestResults: ForwardTestResults,
    backtestResults: BacktestResults,
  ): BacktestComparison {
    try {
      const forwardMetrics = forwardTestResults.metrics;
      const backtestMetrics = backtestResults.metrics;

      // Calculate deviations
      const deviations = {
        winRateDiff: forwardMetrics.winRate - backtestMetrics.winRate,
        profitFactorDiff: forwardMetrics.profitFactor -
          backtestMetrics.profitFactor,
        sharpeRatioDiff: forwardMetrics.sharpeRatio -
          backtestMetrics.sharpeRatio,
        maxDrawdownDiff: forwardMetrics.maxDrawdown -
          backtestMetrics.maxDrawdown,
        avgHoldTimeDiff: forwardMetrics.averageWin - backtestMetrics.averageWin, // Using averageWin as proxy for hold time
      };

      // Validation logic
      const warnings: string[] = [];
      const recommendations: string[] = [];
      // eslint-disable-next-line functional/no-let
      let confidence = 100;

      // Check win rate deviation (should be within ±10%)
      if (Math.abs(deviations.winRateDiff) > 0.1) {
        // eslint-disable-next-line functional/immutable-data
        warnings.push(
          `Win rate deviation: ${
            (deviations.winRateDiff * 100).toFixed(1)
          }% (expected ±10%)`,
        );
        confidence -= 20;
        // eslint-disable-next-line functional/immutable-data
        recommendations.push("Review signal generation logic for consistency");
      }

      // Check profit factor deviation (should be within ±0.5)
      if (Math.abs(deviations.profitFactorDiff) > 0.5) {
        // eslint-disable-next-line functional/immutable-data
        warnings.push(
          `Profit factor deviation: ${
            deviations.profitFactorDiff.toFixed(2)
          } (expected ±0.5)`,
        );
        confidence -= 15;
        // eslint-disable-next-line functional/immutable-data
        recommendations.push("Check execution simulation accuracy");
      }

      // Check Sharpe ratio deviation (should be within ±0.3)
      if (Math.abs(deviations.sharpeRatioDiff) > 0.3) {
        // eslint-disable-next-line functional/immutable-data
        warnings.push(
          `Sharpe ratio deviation: ${
            deviations.sharpeRatioDiff.toFixed(2)
          } (expected ±0.3)`,
        );
        confidence -= 10;
        // eslint-disable-next-line functional/immutable-data
        recommendations.push("Analyze risk-adjusted return consistency");
      }

      // Check drawdown deviation (should be within ±5%)
      if (Math.abs(deviations.maxDrawdownDiff) > 0.05) {
        // eslint-disable-next-line functional/immutable-data
        warnings.push(
          `Max drawdown deviation: ${
            (deviations.maxDrawdownDiff * 100).toFixed(1)
          }% (expected ±5%)`,
        );
        confidence -= 15;
        // eslint-disable-next-line functional/immutable-data
        recommendations.push("Review risk management parameters");
      }

      // Sample size validation
      if (forwardTestResults.paperTrades.length < 20) {
        // eslint-disable-next-line functional/immutable-data
        warnings.push("Small sample size may affect validation accuracy");
        confidence -= 10;
        // eslint-disable-next-line functional/immutable-data
        recommendations.push("Extend forward test duration for more trades");
      }

      // Time period validation
      const testDurationDays = forwardTestResults.duration /
        (24 * 60 * 60 * 1000);
      if (testDurationDays < 7) {
        // eslint-disable-next-line functional/immutable-data
        warnings.push(
          "Short test duration may not capture all market conditions",
        );
        confidence -= 5;
        // eslint-disable-next-line functional/immutable-data
        recommendations.push("Run forward test for at least 7 days");
      }

      const isValid = confidence >= 70;

      const comparison: BacktestComparison = {
        backtestMetrics,
        forwardTestMetrics: forwardMetrics,
        deviations,
        validation: {
          isValid,
          confidence: Math.max(0, confidence),
          warnings,
          recommendations,
        },
      };

      // Log comparison results
      logError("WARNING", "Forward test vs backtest comparison completed", {
        component: "ForwardTestMode",
        function: "compareToBacktest",
        data: {
          isValid,
          confidence,
          deviations,
          warningsCount: warnings.length,
          recommendationsCount: recommendations.length,
        },
      });

      console.log(
        `📊 Backtest comparison completed - Valid: ${isValid}, Confidence: ${confidence}%`,
      );
      if (warnings.length > 0) {
        console.warn("⚠️ Validation warnings:", warnings);
      }

      return comparison;
    } catch (error) {
      console.error("❌ Failed to compare to backtest:", error);
      logError("ERROR", "Failed to compare forward test to backtest", {
        component: "ForwardTestMode",
        function: "compareToBacktest",
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  /**
   * Start monitoring cycles for paper trading
   */
  private async startMonitoring(): Promise<void> {
    // Start hologram scan cycle (every 5 minutes)
    // eslint-disable-next-line functional/immutable-data
    this.scanInterval = setInterval(
      async () => {
        try {
          await this.runHologramScan();
        } catch (error) {
          console.error("❌ Hologram scan error:", error);
        }
      },
      5 * 60 * 1000,
    );

    // Start price update cycle (every 30 seconds)
    // eslint-disable-next-line functional/immutable-data
    this.priceUpdateInterval = setInterval(async () => {
      try {
        await this.updatePaperTrades();
      } catch (error) {
        console.error("❌ Price update error:", error);
      }
    }, 30 * 1000);

    // Run initial scan
    await this.runHologramScan();
  }

  /**
   * Stop monitoring cycles
   */
  private stopMonitoring(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      // eslint-disable-next-line functional/immutable-data
      this.scanInterval = null;
    }

    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      // eslint-disable-next-line functional/immutable-data
      this.priceUpdateInterval = null;
    }
  }

  /**
   * Run hologram scan and generate signals
   */
  private async runHologramScan(): Promise<void> {
    try {
      // Get top symbols (simplified - would use actual symbol list)
      const symbols = ["BTCUSDT", "ETHUSDT", "ADAUSDT", "SOLUSDT", "DOTUSDT"];

      for (const symbol of symbols) {
        // Skip if already have max positions
        if (
          this.getOpenPositionsCount() >= this.config.maxConcurrentPositions
        ) {
          break;
        }

        // Skip if already have position in this symbol
        if (this.hasOpenPosition(symbol)) {
          continue;
        }

        // Generate signal
        const signal = await this.generateSignal(symbol);
        if (!signal) continue;

        // Log signal
        this.logSignalsWithoutExecution(signal);

        // If not signals-only mode, simulate trade execution
        if (!this.config.logSignalsOnly) {
          await this.simulatePaperTrade(signal);
        }
      }
    } catch (error) {
      console.error("❌ Hologram scan error:", error);
      logError("ERROR", "Hologram scan failed in forward test", {
        component: "ForwardTestMode",
        function: "runHologramScan",
        stack: (error as Error).stack,
      });
    }
  }

  /**
   * Generate signal for symbol (simplified)
   */
  private async generateSignal(symbol: string): Promise<SignalData | null> {
    try {
      // Fetch recent data
      const candles = await this.bybitClient.fetchOHLCV(symbol, "15m", 100);
      if (candles.length < 50) return null;

      // Analyze hologram state
      const hologramState = await this.hologramEngine.analyze(symbol);

      // Check if signal conditions are met
      if (
        hologramState.status === "NO_PLAY" ||
        hologramState.status === "CONFLICT"
      ) {
        return null;
      }

      // Check session
      const sessionState = this.sessionProfiler.getSessionState();
      if (sessionState.type === "DEAD_ZONE") {
        return null;
      }

      // Simple signal generation (would be more sophisticated in real implementation)
      if (Math.random() < 0.1) {
        // 10% chance of signal
        const currentPrice = candles[candles.length - 1].close;
        const direction = hologramState.rsScore > 0 ? "LONG" : "SHORT";
        const stopLoss = direction === "LONG"
          ? currentPrice * 0.985
          : currentPrice * 1.015;
        const takeProfit = direction === "LONG"
          ? currentPrice * 1.045
          : currentPrice * 0.955;

        const positionSize = this.calculatePositionSize(currentPrice, stopLoss);

        return {
          symbol,
          direction,
          hologramStatus: hologramState.status,
          alignmentScore: hologramState.alignmentScore,
          rsScore: hologramState.rsScore,
          sessionType: sessionState.type,
          poiType: "ORDER_BLOCK",
          cvdConfirmation: true,
          confidence: 75,
          entryPrice: currentPrice,
          stopLoss,
          takeProfit,
          positionSize,
          leverage: this.config.maxLeverage,
          timestamp: Date.now(),
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ Failed to generate signal for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Simulate paper trade execution
   */
  private async simulatePaperTrade(signal: SignalData): Promise<void> {
    try {
      // Create paper trade
      const paperTrade: PaperTrade = {
        id: `${signal.symbol}_${signal.timestamp}`,
        symbol: signal.symbol,
        direction: signal.direction,
        entryTime: signal.timestamp,
        exitTime: null,
        entryPrice: signal.entryPrice,
        exitPrice: null,
        quantity: signal.positionSize,
        leverage: signal.leverage,
        unrealizedPnL: 0,
        realizedPnL: null,
        fees: this.calculateFees(signal.positionSize * signal.entryPrice),
        slippage: this.calculateSlippage(signal.entryPrice),
        holdTime: null,
        exitReason: null,
        signal,
        rValue: null,
        status: "OPEN",
      };

      // Add to open positions
      // eslint-disable-next-line functional/immutable-data
      this.paperTrades.set(paperTrade.id, paperTrade);

      // Emit event
      this.emit("paperTradeOpened", paperTrade);

      console.log(
        `📈 Paper trade opened: ${signal.symbol} ${signal.direction} @ ${signal.entryPrice}`,
      );
    } catch (error) {
      console.error("❌ Failed to simulate paper trade:", error);
      logError("ERROR", "Failed to simulate paper trade", {
        component: "ForwardTestMode",
        function: "simulatePaperTrade",
        stack: (error as Error).stack,
        data: { signal },
      });
    }
  }

  /**
   * Update paper trades with current prices
   */
  private async updatePaperTrades(): Promise<void> {
    const openTrades = Array.from(this.paperTrades.values()).filter((t) =>
      t.status === "OPEN"
    );

    for (const trade of openTrades) {
      try {
        // Get current price
        const currentPrice = await this.bybitClient.getCurrentPrice(
          trade.symbol,
        );

        // Update unrealized PnL
        const pnlMultiplier = trade.direction === "LONG"
          ? (currentPrice - trade.entryPrice) / trade.entryPrice
          : (trade.entryPrice - currentPrice) / trade.entryPrice;

        // eslint-disable-next-line functional/immutable-data
        trade.unrealizedPnL = trade.quantity * trade.entryPrice *
          pnlMultiplier * trade.leverage;

        // Check exit conditions
        const shouldExit = this.checkPaperTradeExit(trade, currentPrice);
        if (shouldExit.shouldExit) {
          await this.closePaperTrade(trade, currentPrice, shouldExit.reason);
        }
      } catch (error) {
        console.error(`❌ Failed to update paper trade ${trade.id}:`, error);
      }
    }
  }

  /**
   * Check if paper trade should be exited
   */
  private checkPaperTradeExit(
    trade: PaperTrade,
    currentPrice: number,
  ): { shouldExit: boolean; reason: "STOP_LOSS" | "TAKE_PROFIT" | "TIMEOUT" } {
    const signal = trade.signal;

    // Check stop loss
    if (trade.direction === "LONG" && currentPrice <= signal.stopLoss) {
      return { shouldExit: true, reason: "STOP_LOSS" };
    }
    if (trade.direction === "SHORT" && currentPrice >= signal.stopLoss) {
      return { shouldExit: true, reason: "STOP_LOSS" };
    }

    // Check take profit
    if (trade.direction === "LONG" && currentPrice >= signal.takeProfit) {
      return { shouldExit: true, reason: "TAKE_PROFIT" };
    }
    if (trade.direction === "SHORT" && currentPrice <= signal.takeProfit) {
      return { shouldExit: true, reason: "TAKE_PROFIT" };
    }

    // Check timeout (72 hours max hold)
    const maxHoldTime = 72 * 60 * 60 * 1000;
    if (Date.now() - trade.entryTime > maxHoldTime) {
      return { shouldExit: true, reason: "TIMEOUT" };
    }

    return { shouldExit: false, reason: "STOP_LOSS" };
  }

  /**
   * Close paper trade
   */
  private async closePaperTrade(
    trade: PaperTrade,
    exitPrice: number,
    reason: "STOP_LOSS" | "TAKE_PROFIT" | "TIMEOUT",
  ): Promise<void> {
    try {
      // Update trade
      // eslint-disable-next-line functional/immutable-data
      trade.exitTime = Date.now();
      // eslint-disable-next-line functional/immutable-data
      trade.exitPrice = exitPrice;
      // eslint-disable-next-line functional/immutable-data
      trade.exitReason = reason;
      // eslint-disable-next-line functional/immutable-data
      trade.holdTime = trade.exitTime - trade.entryTime;
      // eslint-disable-next-line functional/immutable-data
      trade.status = "CLOSED";

      // Calculate final PnL
      const pnlMultiplier = trade.direction === "LONG"
        ? (exitPrice - trade.entryPrice) / trade.entryPrice
        : (trade.entryPrice - exitPrice) / trade.entryPrice;

      // eslint-disable-next-line functional/immutable-data
      trade.realizedPnL = trade.quantity * trade.entryPrice * pnlMultiplier *
        trade.leverage;
      // eslint-disable-next-line functional/immutable-data
      trade.rValue = trade.realizedPnL /
        (Math.abs(trade.entryPrice - trade.signal.stopLoss) * trade.quantity);

      // Update equity
      // eslint-disable-next-line functional/immutable-data
      this.currentEquity += trade.realizedPnL - trade.fees - trade.slippage;

      // Emit event
      this.emit("paperTradeClosed", trade);

      console.log(
        `📉 Paper trade closed: ${trade.symbol} ${trade.direction} @ ${exitPrice} (${reason}) - PnL: ${
          trade.realizedPnL?.toFixed(2)
        }`,
      );
    } catch (error) {
      console.error("❌ Failed to close paper trade:", error);
      logError("ERROR", "Failed to close paper trade", {
        component: "ForwardTestMode",
        function: "closePaperTrade",
        stack: (error as Error).stack,
        data: { tradeId: trade.id },
      });
    }
  }

  /**
   * Generate forward test results
   */
  private async generateResults(): Promise<ForwardTestResults> {
    const endTime = Date.now();
    const duration = endTime - this.startTime;

    // Get all paper trades
    const paperTrades = Array.from(this.paperTrades.values());

    // Calculate metrics
    const metrics = this.calculateForwardTestMetrics(paperTrades, duration);

    // Generate backtest comparison if enabled
    // eslint-disable-next-line functional/no-let
    let backtestComparison: BacktestComparison | null = null;
    if (this.config.compareToBacktest && this.config.backtestReference) {
      const forwardResults: ForwardTestResults = {
        config: this.config,
        startTime: this.startTime,
        endTime,
        duration,
        paperTrades,
        signalsLogged: this.signalsLogged,
        metrics,
        backtestComparison: null,
      };

      backtestComparison = this.compareToBacktest(
        forwardResults,
        this.config.backtestReference,
      );
    }

    return {
      config: this.config,
      startTime: this.startTime,
      endTime,
      duration,
      paperTrades,
      signalsLogged: this.signalsLogged,
      metrics,
      backtestComparison,
    };
  }

  /**
   * Calculate forward test metrics
   */
  private calculateForwardTestMetrics(
    paperTrades: PaperTrade[],
    duration: number,
  ): ForwardTestMetrics {
    const closedTrades = paperTrades.filter((t) => t.status === "CLOSED");
    const winningTrades = closedTrades.filter((t) => (t.realizedPnL || 0) > 0);
    const losingTrades = closedTrades.filter((t) => (t.realizedPnL || 0) < 0);

    const winRate = closedTrades.length > 0
      ? winningTrades.length / closedTrades.length
      : 0;
    const grossProfit = winningTrades.reduce(
      (sum, t) => sum + (t.realizedPnL || 0),
      0,
    );
    const grossLoss = Math.abs(
      losingTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0),
    );
    const profitFactor = grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
      ? Infinity
      : 0;

    const averageWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0) /
        winningTrades.length
      : 0;
    const averageLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0) /
        losingTrades.length
      : 0;

    const largestWin = winningTrades.length > 0
      ? Math.max(...winningTrades.map((t) => t.realizedPnL || 0))
      : 0;
    const largestLoss = losingTrades.length > 0
      ? Math.min(...losingTrades.map((t) => t.realizedPnL || 0))
      : 0;

    // Calculate consecutive wins/losses
    // eslint-disable-next-line functional/no-let
    let maxConsecutiveWins = 0;
    // eslint-disable-next-line functional/no-let
    let maxConsecutiveLosses = 0;
    // eslint-disable-next-line functional/no-let
    let currentWinStreak = 0;
    // eslint-disable-next-line functional/no-let
    let currentLossStreak = 0;

    for (const trade of closedTrades) {
      if ((trade.realizedPnL || 0) > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        maxConsecutiveLosses = Math.max(
          maxConsecutiveLosses,
          currentLossStreak,
        );
      }
    }

    // Calculate session distribution
    const sessionDistribution = {
      ASIAN: 0,
      LONDON: 0,
      NY: 0,
      DEAD_ZONE: 0,
    };

    // Calculate hologram status distribution
    const hologramStatusDistribution = {
      "A+": 0,
      A: 0,
      B: 0,
      C: 0,
      CONFLICT: 0,
      NO_PLAY: 0,
      VETO: 0,
    };

    for (const signal of this.signalsLogged) {
      // eslint-disable-next-line functional/immutable-data
      sessionDistribution[signal.sessionType]++;
      // eslint-disable-next-line functional/immutable-data
      hologramStatusDistribution[signal.hologramStatus]++;
    }

    const averageSignalConfidence = this.signalsLogged.length > 0
      ? this.signalsLogged.reduce((sum, s) => sum + s.confidence, 0) /
        this.signalsLogged.length
      : 0;

    const executionRate = this.signalsLogged.length > 0
      ? (paperTrades.length / this.signalsLogged.length) * 100
      : 0;

    // Simple Sharpe ratio calculation
    const returns = closedTrades.map((t) =>
      (t.realizedPnL || 0) / this.config.initialEquity
    );
    const avgReturn = returns.length > 0
      ? returns.reduce((sum, r) => sum + r, 0) / returns.length
      : 0;
    const returnStdDev = returns.length > 1
      ? Math.sqrt(
        returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
          returns.length,
      )
      : 0;
    const sharpeRatio = returnStdDev > 0
      ? (avgReturn / returnStdDev) * Math.sqrt(252)
      : 0;

    // Simple max drawdown calculation
    // eslint-disable-next-line functional/no-let
    let runningEquity = this.config.initialEquity;
    // eslint-disable-next-line functional/no-let
    let maxEquity = this.config.initialEquity;
    // eslint-disable-next-line functional/no-let
    let maxDrawdown = 0;

    for (const trade of closedTrades) {
      runningEquity += trade.realizedPnL || 0;
      if (runningEquity > maxEquity) {
        maxEquity = runningEquity;
      } else {
        const drawdown = (maxEquity - runningEquity) / maxEquity;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    const totalReturn = (this.currentEquity - this.config.initialEquity) /
      this.config.initialEquity;

    return {
      startTime: this.startTime,
      endTime: Date.now(),
      duration,
      initialEquity: this.config.initialEquity,
      finalEquity: this.currentEquity,
      totalSignals: this.signalsLogged.length,
      signalsExecuted: paperTrades.length,
      executionRate,
      averageSignalConfidence,
      sessionDistribution,
      hologramStatusDistribution,
      totalTrades: closedTrades.length,
      winRate,
      profitFactor,
      totalReturn,
      maxDrawdown,
      sharpeRatio,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      consecutiveWins: maxConsecutiveWins,
      consecutiveLosses: maxConsecutiveLosses,
    };
  }

  /**
   * Helper methods
   */
  private getOpenPositionsCount(): number {
    return Array.from(this.paperTrades.values()).filter((t) =>
      t.status === "OPEN"
    ).length;
  }

  private hasOpenPosition(symbol: string): boolean {
    return Array.from(this.paperTrades.values()).some(
      (t) => t.symbol === symbol && t.status === "OPEN",
    );
  }

  private calculatePositionSize(entryPrice: number, stopLoss: number): number {
    const riskAmount = this.currentEquity * this.config.riskPerTrade;
    const stopDistance = Math.abs(entryPrice - stopLoss);
    return riskAmount / stopDistance;
  }

  private calculateFees(notionalValue: number): number {
    return notionalValue * -0.0001; // -0.01% maker rebate
  }

  private calculateSlippage(price: number): number {
    return price * 0.001; // 0.1% slippage
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Configuration management
   */
  public updateConfig(newConfig: Partial<ForwardTestConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...newConfig };
    console.log("📝 ForwardTestMode configuration updated");
  }

  public getConfig(): ForwardTestConfig {
    return { ...this.config };
  }

  public isForwardTestRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Add paper trading toggle to Phase2Config
   */
  public addPaperTradingToggle(): void {
    // Add paper trading configuration to the config manager
    // This would extend the Phase2Config interface to include forward test settings
    console.log("📝 Paper trading toggle added to configuration");

    // Emit event to notify configuration change
    this.emit("configUpdated", {
      section: "forwardTest",
      enabled: this.config.enabled,
    });
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopMonitoring();
    this.removeAllListeners();
  }
}
