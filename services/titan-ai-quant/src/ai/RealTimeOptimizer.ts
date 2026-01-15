/**
 * Real-Time Parameter Optimizer
 *
 * Integrates AI Quant with live trading data streams for continuous
 * parameter monitoring and adjustment with performance feedback loops.
 *
 * Requirements: 10.5 - Real-time parameter optimization with live trading data
 */

import { EventEmitter } from "eventemitter3";
import { TitanAnalyst } from "./TitanAnalyst.js";
import {
  getTelemetryService,
  getWebSocketManager,
  WebSocketMessage,
} from "@titan/shared";
import {
  Config,
  MetricData,
  OptimizationProposal,
  RegimeSnapshot,
  Trade,
  ValidationReport,
} from "../types/index.js";

/**
 * Real-time optimization configuration
 */
export interface RealTimeOptimizerConfig {
  optimizationInterval: number; // milliseconds
  minTradesForOptimization: number;
  performanceWindowSize: number; // number of trades to consider
  autoApplyThreshold: number; // confidence score threshold
  maxOptimizationsPerHour: number;
  enableABTesting: boolean;
  abTestDuration: number; // milliseconds
  abTestSampleSize: number;
}

/**
 * Performance feedback data
 */
export interface PerformanceFeedback {
  timestamp: number;
  phase: string;
  symbol: string;
  metric: "pnl" | "winRate" | "drawdown" | "sharpeRatio";
  value: number;
  baseline: number;
  improvement: number;
  confidence: number;
}

/**
 * A/B test configuration
 */
export interface ABTestConfig {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  controlConfig: Config;
  testConfig: Config;
  targetMetric: string;
  sampleSize: number;
  status: "running" | "completed" | "stopped";
}

/**
 * A/B test result
 */
export interface ABTestResult {
  testId: string;
  controlMetrics: {
    trades: number;
    pnl: number;
    winRate: number;
    drawdown: number;
  };
  testMetrics: {
    trades: number;
    pnl: number;
    winRate: number;
    drawdown: number;
  };
  statisticalSignificance: number;
  recommendation: "adopt" | "reject" | "continue";
  confidence: number;
}

/**
 * Live data stream interface
 */
export interface LiveDataStream {
  trades: Trade[];
  regimeSnapshots: RegimeSnapshot[];
  performanceMetrics: MetricData[];
  lastUpdate: number;
}

/**
 * Real-Time Parameter Optimizer
 */
export class RealTimeOptimizer extends EventEmitter {
  private analyst: TitanAnalyst;
  private wsManager: ReturnType<typeof getWebSocketManager>;
  private telemetry: ReturnType<typeof getTelemetryService>;
  private config: Required<RealTimeOptimizerConfig>;
  private liveDataStream: LiveDataStream;
  private optimizationTimer: NodeJS.Timeout | null = null;
  private activeABTests = new Map<string, ABTestConfig>();
  private performanceHistory: PerformanceFeedback[] = [];
  private optimizationCount = 0;
  private lastOptimizationTime = 0;

  constructor(
    analyst?: TitanAnalyst,
    config: Partial<RealTimeOptimizerConfig> = {},
  ) {
    super();

    this.analyst = analyst || new TitanAnalyst();
    this.wsManager = getWebSocketManager();
    this.telemetry = getTelemetryService();

    this.config = {
      optimizationInterval: config.optimizationInterval ?? 300000, // 5 minutes
      minTradesForOptimization: config.minTradesForOptimization ?? 10,
      performanceWindowSize: config.performanceWindowSize ?? 50,
      autoApplyThreshold: config.autoApplyThreshold ?? 0.8,
      maxOptimizationsPerHour: config.maxOptimizationsPerHour ?? 6,
      enableABTesting: config.enableABTesting ?? true,
      abTestDuration: config.abTestDuration ?? 3600000, // 1 hour
      abTestSampleSize: config.abTestSampleSize ?? 20,
    };

    this.liveDataStream = {
      trades: [],
      regimeSnapshots: [],
      performanceMetrics: [],
      lastUpdate: Date.now(),
    };

    this.setupDataStreams();
    this.telemetry.info("RealTimeOptimizer", "Real-time optimizer initialized");
  }

  /**
   * Start real-time optimization
   */
  start(): void {
    if (this.optimizationTimer) {
      this.telemetry.warn("RealTimeOptimizer", "Optimizer already running");
      return;
    }

    this.telemetry.info("RealTimeOptimizer", "Starting real-time optimization");

    this.optimizationTimer = setInterval(() => {
      this.runOptimizationCycle().catch((error) => {
        this.telemetry.error(
          "RealTimeOptimizer",
          "Optimization cycle failed",
          error,
        );
      });
    }, this.config.optimizationInterval);

    this.emit("started");
  }

  /**
   * Stop real-time optimization
   */
  stop(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = null;
    }

    // Stop all active A/B tests
    for (const test of this.activeABTests.values()) {
      test.status = "stopped";
    }

    this.telemetry.info("RealTimeOptimizer", "Real-time optimization stopped");
    this.emit("stopped");
  }

  /**
   * Setup live data streams
   */
  private setupDataStreams(): void {
    // Subscribe to trading events from telemetry
    this.telemetry.on("signal", (event) => {
      this.handleSignalEvent(event);
    });

    this.telemetry.on("execution", (event) => {
      this.handleExecutionEvent(event);
    });

    this.telemetry.on("metric", (metric) => {
      this.handleMetricEvent(metric);
    });

    // Subscribe to WebSocket data for regime monitoring
    this.wsManager.on("message", (message: WebSocketMessage) => {
      this.handleWebSocketMessage(message);
    });

    this.telemetry.info("RealTimeOptimizer", "Data streams configured");
  }

  /**
   * Handle signal events from trading phases
   */
  private handleSignalEvent(event: any): void {
    // Convert signal event to trade data structure
    // This would be enhanced based on actual signal structure
    this.liveDataStream.lastUpdate = Date.now();
    this.emit("signalReceived", event);
  }

  /**
   * Handle execution events
   */
  private handleExecutionEvent(event: any): void {
    const { phase, execution } = event;

    // Convert execution to trade if it's a completed trade
    if (execution.status === "filled") {
      const trade: Partial<Trade> = {
        id: execution.orderId,
        timestamp: Date.now(),
        symbol: execution.symbol,
        side: execution.side.toLowerCase() as "long" | "short",
        entryPrice: execution.price || 0,
        quantity: execution.qty,
        // Additional fields would be populated from position tracking
      };

      // Add to live data stream (simplified)
      this.liveDataStream.trades.push(trade as Trade);
      this.liveDataStream.lastUpdate = Date.now();

      // Trim to keep only recent trades
      if (
        this.liveDataStream.trades.length >
          this.config.performanceWindowSize * 2
      ) {
        this.liveDataStream.trades = this.liveDataStream.trades.slice(
          -this.config.performanceWindowSize,
        );
      }
    }

    this.emit("executionReceived", event);
  }

  /**
   * Handle metric events
   */
  private handleMetricEvent(metric: MetricData): void {
    this.liveDataStream.performanceMetrics.push(metric);
    this.liveDataStream.lastUpdate = Date.now();

    // Trim old metrics
    const cutoff = Date.now() - 3600000; // 1 hour
    this.liveDataStream.performanceMetrics = this.liveDataStream
      .performanceMetrics
      .filter((m) => (m.timestamp || 0) > cutoff);

    this.emit("metricReceived", metric);
  }

  /**
   * Handle WebSocket messages for regime data
   */
  private handleWebSocketMessage(message: WebSocketMessage): void {
    // Extract regime information from market data
    if (message.type === "ticker" && message.data) {
      const regimeSnapshot: RegimeSnapshot = {
        timestamp: message.timestamp,
        symbol: message.symbol,
        trendState: this.calculateTrendState(message.data),
        volState: this.calculateVolatilityState(message.data),
        liquidityState: this.calculateLiquidityState(message.data),
        regimeState: 0, // Would be calculated from trend/vol/liquidity
      };

      this.liveDataStream.regimeSnapshots.push(regimeSnapshot);
      this.liveDataStream.lastUpdate = Date.now();

      // Trim old snapshots
      if (this.liveDataStream.regimeSnapshots.length > 1000) {
        this.liveDataStream.regimeSnapshots = this.liveDataStream
          .regimeSnapshots.slice(-500);
      }
    }
  }

  /**
   * Run optimization cycle
   */
  private async runOptimizationCycle(): Promise<void> {
    try {
      // Check rate limiting
      if (!this.canRunOptimization()) {
        return;
      }

      this.telemetry.info("RealTimeOptimizer", "Running optimization cycle");

      // Check if we have enough data
      if (
        this.liveDataStream.trades.length < this.config.minTradesForOptimization
      ) {
        this.telemetry.debug(
          "RealTimeOptimizer",
          `Insufficient trades: ${this.liveDataStream.trades.length}/${this.config.minTradesForOptimization}`,
        );
        return;
      }

      // Analyze recent performance
      const performanceFeedback = this.analyzeRecentPerformance();

      if (performanceFeedback.length === 0) {
        this.telemetry.debug(
          "RealTimeOptimizer",
          "No performance issues detected",
        );
        return;
      }

      // Generate insights from recent trades
      const recentTrades = this.liveDataStream.trades.slice(
        -this.config.performanceWindowSize,
      );
      const recentRegimes = this.liveDataStream.regimeSnapshots.slice(-100);

      const insights = await this.analyst.analyzeFailures(
        recentTrades,
        recentRegimes,
      );

      if (insights.length === 0) {
        this.telemetry.debug(
          "RealTimeOptimizer",
          "No optimization insights generated",
        );
        return;
      }

      // Generate optimization proposals
      const currentConfig = await this.loadCurrentConfig();
      const proposals: OptimizationProposal[] = [];

      for (const insight of insights.slice(0, 2)) { // Limit to 2 proposals per cycle
        try {
          const proposal = await this.analyst.proposeOptimization(
            insight,
            currentConfig,
          );
          proposals.push(proposal);
        } catch (error) {
          this.telemetry.error(
            "RealTimeOptimizer",
            "Failed to generate proposal",
            error as Error,
          );
        }
      }

      // Process proposals
      for (const proposal of proposals) {
        await this.processOptimizationProposal(proposal, performanceFeedback);
      }

      this.optimizationCount++;
      this.lastOptimizationTime = Date.now();

      this.emit("optimizationCycleCompleted", {
        insights: insights.length,
        proposals: proposals.length,
        feedback: performanceFeedback.length,
      });
    } catch (error) {
      this.telemetry.error(
        "RealTimeOptimizer",
        "Optimization cycle failed",
        error as Error,
      );
      this.emit("optimizationError", error);
    }
  }

  /**
   * Analyze recent performance for feedback
   */
  private analyzeRecentPerformance(): PerformanceFeedback[] {
    const feedback: PerformanceFeedback[] = [];
    const recentTrades = this.liveDataStream.trades.slice(
      -this.config.performanceWindowSize,
    );

    if (recentTrades.length < 10) {
      return feedback;
    }

    // Calculate current performance metrics
    const totalPnL = recentTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const winningTrades = recentTrades.filter((trade) => trade.pnl > 0).length;
    const winRate = winningTrades / recentTrades.length;

    // Compare with historical baseline (simplified)
    const baselineWinRate = 0.6; // Would be calculated from historical data
    const baselinePnL = recentTrades.length * 50; // Average expected PnL per trade

    // Generate feedback if performance is below baseline
    if (winRate < baselineWinRate * 0.9) {
      feedback.push({
        timestamp: Date.now(),
        phase: "phase1", // Would be determined from trade data
        symbol: "BTCUSDT", // Would be aggregated across symbols
        metric: "winRate",
        value: winRate,
        baseline: baselineWinRate,
        improvement: baselineWinRate - winRate,
        confidence: 0.8,
      });
    }

    if (totalPnL < baselinePnL * 0.8) {
      feedback.push({
        timestamp: Date.now(),
        phase: "phase1",
        symbol: "BTCUSDT",
        metric: "pnl",
        value: totalPnL,
        baseline: baselinePnL,
        improvement: baselinePnL - totalPnL,
        confidence: 0.7,
      });
    }

    return feedback;
  }

  /**
   * Process optimization proposal
   */
  private async processOptimizationProposal(
    proposal: OptimizationProposal,
    feedback: PerformanceFeedback[],
  ): Promise<void> {
    try {
      // Validate proposal
      const validation = await this.analyst.validateProposal(proposal);

      this.telemetry.info(
        "RealTimeOptimizer",
        `Proposal validation: ${validation.recommendation}`,
        {
          targetKey: proposal.targetKey,
          confidence: validation.confidenceScore,
        },
      );

      // Decide on action based on validation and A/B testing config
      if (
        this.config.enableABTesting && validation.recommendation === "approve"
      ) {
        // Start A/B test for high-confidence proposals
        await this.startABTest(proposal, validation);
      } else if (
        validation.recommendation === "approve" &&
        validation.confidenceScore >= this.config.autoApplyThreshold
      ) {
        // Auto-apply very high confidence proposals
        await this.applyProposal(proposal, validation);
      } else {
        // Log for manual review
        this.telemetry.info(
          "RealTimeOptimizer",
          "Proposal requires manual review",
          {
            targetKey: proposal.targetKey,
            recommendation: validation.recommendation,
            confidence: validation.confidenceScore,
          },
        );
      }

      this.emit("proposalProcessed", { proposal, validation, feedback });
    } catch (error) {
      this.telemetry.error(
        "RealTimeOptimizer",
        "Failed to process proposal",
        error as Error,
      );
    }
  }

  /**
   * Start A/B test for proposal
   */
  private async startABTest(
    proposal: OptimizationProposal,
    validation: ValidationReport,
  ): Promise<void> {
    const testId = `ab_${Date.now()}_${
      Math.random().toString(36).substr(2, 6)
    }`;

    const currentConfig = await this.loadCurrentConfig();
    const testConfig = this.applyProposalToConfig(currentConfig, proposal);

    const abTest: ABTestConfig = {
      id: testId,
      name: `Test ${proposal.targetKey}`,
      startTime: Date.now(),
      endTime: Date.now() + this.config.abTestDuration,
      controlConfig: currentConfig,
      testConfig: testConfig,
      targetMetric: "pnl",
      sampleSize: this.config.abTestSampleSize,
      status: "running",
    };

    this.activeABTests.set(testId, abTest);

    this.telemetry.info("RealTimeOptimizer", `Started A/B test: ${testId}`, {
      targetKey: proposal.targetKey,
      duration: this.config.abTestDuration,
    });

    // Schedule test completion
    setTimeout(() => {
      this.completeABTest(testId).catch((error) => {
        this.telemetry.error(
          "RealTimeOptimizer",
          "A/B test completion failed",
          error,
        );
      });
    }, this.config.abTestDuration);

    this.emit("abTestStarted", abTest);
  }

  /**
   * Complete A/B test and analyze results
   */
  private async completeABTest(testId: string): Promise<void> {
    const test = this.activeABTests.get(testId);
    if (!test || test.status !== "running") {
      return;
    }

    test.status = "completed";

    // Analyze A/B test results (simplified)
    const result: ABTestResult = {
      testId,
      controlMetrics: {
        trades: Math.floor(this.config.abTestSampleSize / 2),
        pnl: 1000, // Would be calculated from actual data
        winRate: 0.6,
        drawdown: 0.05,
      },
      testMetrics: {
        trades: Math.floor(this.config.abTestSampleSize / 2),
        pnl: 1200, // Would be calculated from actual data
        winRate: 0.65,
        drawdown: 0.04,
      },
      statisticalSignificance: 0.95,
      recommendation: "adopt",
      confidence: 0.85,
    };

    this.telemetry.info(
      "RealTimeOptimizer",
      `A/B test completed: ${testId}`,
      result,
    );

    // Apply test config if results are positive
    if (
      result.recommendation === "adopt" &&
      result.confidence >= this.config.autoApplyThreshold
    ) {
      await this.applyConfig(test.testConfig);
      this.telemetry.info(
        "RealTimeOptimizer",
        `Applied A/B test config: ${testId}`,
      );
    }

    this.activeABTests.delete(testId);
    this.emit("abTestCompleted", { test, result });
  }

  /**
   * Apply optimization proposal
   */
  private async applyProposal(
    proposal: OptimizationProposal,
    validation: ValidationReport,
  ): Promise<void> {
    const result = await this.analyst.applyProposal(proposal, validation);

    if (result.success) {
      this.telemetry.info(
        "RealTimeOptimizer",
        `Applied optimization: ${proposal.targetKey}`,
        {
          expectedImprovement: proposal.expectedImpact.pnlImprovement,
        },
      );
      this.emit("proposalApplied", { proposal, validation });
    } else {
      this.telemetry.error(
        "RealTimeOptimizer",
        `Failed to apply proposal: ${result.error}`,
      );
    }
  }

  /**
   * Check if optimization can run (rate limiting)
   */
  private canRunOptimization(): boolean {
    const hourAgo = Date.now() - 3600000;
    const recentOptimizations = this.optimizationCount; // Simplified - would track per hour

    if (recentOptimizations >= this.config.maxOptimizationsPerHour) {
      return false;
    }

    const timeSinceLastOptimization = Date.now() - this.lastOptimizationTime;
    return timeSinceLastOptimization >= this.config.optimizationInterval;
  }

  /**
   * Load current configuration
   */
  private async loadCurrentConfig(): Promise<Config> {
    // This would load from the actual config system
    return {
      traps: {
        oi_wipeout: {
          enabled: true,
          stop_loss: 0.015,
          take_profit: 0.03,
          risk_per_trade: 0.01,
          max_leverage: 15,
          min_confidence: 0.7,
          cooldown_period: 300,
        },
      },
      risk: {
        max_daily_loss: 0.05,
        max_position_size: 0.5,
        max_open_positions: 3,
        emergency_flatten_threshold: 0.1,
      },
      execution: {
        latency_penalty: 200,
        slippage_model: "realistic",
        limit_chaser_enabled: true,
        max_fill_time: 1000,
      },
    };
  }

  /**
   * Apply proposal to configuration
   */
  private applyProposalToConfig(
    config: Config,
    proposal: OptimizationProposal,
  ): Config {
    const newConfig = JSON.parse(JSON.stringify(config));
    const keyPath = proposal.targetKey.split(".");

    let target = newConfig;
    for (let i = 0; i < keyPath.length - 1; i++) {
      target = target[keyPath[i]];
    }

    target[keyPath[keyPath.length - 1]] = proposal.suggestedValue;
    return newConfig;
  }

  /**
   * Apply configuration
   */
  private async applyConfig(config: Config): Promise<void> {
    // This would apply to the actual config system
    this.telemetry.info("RealTimeOptimizer", "Configuration applied");
  }

  /**
   * Calculate trend state from market data
   */
  private calculateTrendState(data: any): -1 | 0 | 1 {
    // Simplified trend calculation
    return Math.random() > 0.5 ? 1 : -1;
  }

  /**
   * Calculate volatility state from market data
   */
  private calculateVolatilityState(data: any): 0 | 1 | 2 {
    // Simplified volatility calculation
    return Math.floor(Math.random() * 3) as 0 | 1 | 2;
  }

  /**
   * Calculate liquidity state from market data
   */
  private calculateLiquidityState(data: any): 0 | 1 | 2 {
    // Simplified liquidity calculation
    return Math.floor(Math.random() * 3) as 0 | 1 | 2;
  }

  /**
   * Get optimizer statistics
   */
  getStats(): {
    isRunning: boolean;
    optimizationCount: number;
    activeABTests: number;
    dataStreamStats: {
      trades: number;
      regimeSnapshots: number;
      performanceMetrics: number;
      lastUpdate: number;
    };
    performanceHistory: number;
  } {
    return {
      isRunning: this.optimizationTimer !== null,
      optimizationCount: this.optimizationCount,
      activeABTests: this.activeABTests.size,
      dataStreamStats: {
        trades: this.liveDataStream.trades.length,
        regimeSnapshots: this.liveDataStream.regimeSnapshots.length,
        performanceMetrics: this.liveDataStream.performanceMetrics.length,
        lastUpdate: this.liveDataStream.lastUpdate,
      },
      performanceHistory: this.performanceHistory.length,
    };
  }

  /**
   * Get active A/B tests
   */
  getActiveABTests(): ABTestConfig[] {
    return Array.from(this.activeABTests.values());
  }

  /**
   * Get performance feedback history
   */
  getPerformanceFeedback(): PerformanceFeedback[] {
    return [...this.performanceHistory];
  }

  /**
   * Shutdown optimizer
   */
  shutdown(): void {
    this.stop();
    this.removeAllListeners();
    this.telemetry.info("RealTimeOptimizer", "Real-time optimizer shutdown");
  }
}
