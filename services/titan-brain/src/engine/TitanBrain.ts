/**
 * TitanBrain - Master Orchestrator for Titan Trading System
 * Integrates all components: Allocation, Performance, Risk, Capital, and Circuit Breaker
 *
 * Requirements: 1.1, 1.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import {
  AllocationVector,
  BrainConfig,
  BrainDecision,
  BreakerStatus,
  DashboardData,
  DecisionRecord,
  ExecutionReport,
  HealthStatus,
  IntentSignal,
  PhaseId,
  PhasePerformance,
  Position,
  QueuedSignal,
  RiskDecision,
  RiskMetrics,
  TreasuryStatus,
} from '../types/index.js';
import { AllocationEngine } from './AllocationEngine.js';
import { PerformanceTracker } from './PerformanceTracker.js';
import { HighCorrelationNotifier, RiskGuardian } from './RiskGuardian.js';
import { CapitalFlowManager, SweepNotifier } from './CapitalFlowManager.js';
import {
  BreakerEventPersistence,
  CircuitBreaker,
  NotificationHandler,
  PositionClosureHandler,
} from './CircuitBreaker.js';
import { GovernanceEngine, SystemHealth } from './GovernanceEngine.js';
import { RecoveredState, StateRecoveryService } from './StateRecoveryService.js';
import { getMetrics } from '../monitoring/PrometheusMetrics.js';
import { ManualOverrideService } from './ManualOverrideService.js';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { getNatsPublisher, NatsPublisher } from '../server/NatsPublisher.js';
import { ActiveInferenceEngine } from './ActiveInferenceEngine.js';

/**
 * Phase priority for signal processing
 * Requirement 7.1: P3 > P2 > P1
 */
const PHASE_PRIORITY: Record<PhaseId, number> = {
  phase3: 3,
  phase2: 2,
  phase1: 1,
};

/**
 * Interface for execution engine communication
 */
export interface ExecutionEngineClient {
  forwardSignal(signal: IntentSignal, authorizedSize: number): Promise<void>;
  closeAllPositions(): Promise<void>;
  getPositions(): Promise<Position[]>;
}

/**
 * Interface for phase notification
 */
export interface PhaseNotifier {
  notifyVeto(phaseId: PhaseId, signalId: string, reason: string): Promise<void>;
}

/**
 * TitanBrain orchestrates all components and processes signals
 */
export class TitanBrain implements PositionClosureHandler, BreakerEventPersistence {
  private readonly config: BrainConfig;
  private readonly allocationEngine: AllocationEngine;
  private readonly performanceTracker: PerformanceTracker;
  private readonly riskGuardian: RiskGuardian;
  private readonly capitalFlowManager: CapitalFlowManager;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly governanceEngine: GovernanceEngine;
  private readonly activeInferenceEngine: ActiveInferenceEngine;
  private readonly stateRecoveryService: StateRecoveryService | null;
  private readonly manualOverrideService: ManualOverrideService | null;
  private readonly db: DatabaseManager | null;

  /** External integrations */
  private executionEngine: ExecutionEngineClient | null = null;
  private phaseNotifier: PhaseNotifier | null = null;
  private notificationHandler: NotificationHandler | null = null;

  /** Signal queue for priority processing */
  private signalQueue: QueuedSignal[] = [];

  /** Current state */
  private currentEquity: number = 0;
  private currentPositions: Position[] = [];
  private recentDecisions: BrainDecision[] = [];
  private dailyStartEquity: number = 0;
  private recentTrades: Array<{ pnl: number; timestamp: number }> = [];

  /** Dashboard cache */
  private dashboardCache: DashboardData | null = null;
  private dashboardCacheTime: number = 0;

  /** Metrics update timer */
  private metricsUpdateTimer: NodeJS.Timeout | null = null;

  /** Signal approval tracking per phase */
  private signalStats: Record<PhaseId, { approved: number; total: number }> = {
    phase1: { approved: 0, total: 0 },
    phase2: { approved: 0, total: 0 },
    phase3: { approved: 0, total: 0 },
  };

  /** AI Optimization trigger state */
  private lastAIOptimizationTrigger: number = 0;
  private readonly AI_OPTIMIZATION_COOLDOWN_MS = 3600000; // 1 hour cooldown
  private readonly AI_TRIGGER_SHARPE_THRESHOLD = 0; // Trigger when Sharpe < 0

  constructor(
    config: BrainConfig,
    allocationEngine: AllocationEngine,
    performanceTracker: PerformanceTracker,
    riskGuardian: RiskGuardian,
    capitalFlowManager: CapitalFlowManager,
    circuitBreaker: CircuitBreaker,
    activeInferenceEngine: ActiveInferenceEngine,
    governanceEngine: GovernanceEngine,
    db?: DatabaseManager,
    stateRecoveryService?: StateRecoveryService,
    manualOverrideService?: ManualOverrideService,
  ) {
    this.config = config;
    this.allocationEngine = allocationEngine;
    this.performanceTracker = performanceTracker;
    this.riskGuardian = riskGuardian;
    this.capitalFlowManager = capitalFlowManager;
    this.circuitBreaker = circuitBreaker;
    this.activeInferenceEngine = activeInferenceEngine;
    this.governanceEngine = governanceEngine;
    this.db = db ?? null;
    this.stateRecoveryService = stateRecoveryService ?? null;
    this.manualOverrideService = manualOverrideService ?? null;

    // Wire up circuit breaker handlers
    this.circuitBreaker.setPositionHandler(this);
    this.circuitBreaker.setEventPersistence(this);
  }

  /**
   * Initialize the brain and start metric updates
   * Requirement 9.4, 9.5: Load state and recalculate metrics on startup
   */
  async initialize(): Promise<void> {
    console.log('🧠 Initializing Titan Brain...');

    // Recover system state on startup
    if (this.stateRecoveryService) {
      console.log('📊 Recovering system state...');
      const recoveredState = await this.stateRecoveryService.recoverState();

      // Validate recovered state
      if (!this.stateRecoveryService.validateRecoveredState(recoveredState)) {
        console.warn('⚠️ Recovered state validation failed, using defaults');
      } else {
        console.log('✅ State recovery completed successfully');

        // Apply recovered allocation if available
        if (recoveredState.allocation) {
          console.log(
            `📈 Restored allocation: w1=${recoveredState.allocation.w1}, w2=${recoveredState.allocation.w2}, w3=${recoveredState.allocation.w3}`,
          );
        }

        // Apply recovered high watermark
        if (recoveredState.highWatermark > 0) {
          await this.capitalFlowManager.setHighWatermark(recoveredState.highWatermark);
          console.log(`💰 Restored high watermark: $${recoveredState.highWatermark}`);
        }

        // Apply recovered performance metrics
        for (const [phaseId, performance] of Object.entries(recoveredState.performance)) {
          console.log(
            `📊 Restored performance for ${phaseId}: Sharpe=${performance.sharpeRatio.toFixed(
              2,
            )}, Modifier=${performance.modifier.toFixed(2)}`,
          );
        }
      }

      // Recalculate risk metrics with current positions
      // Requirement 9.5: Recalculate all risk metrics before accepting new signals
      if (this.currentPositions.length > 0) {
        console.log('🔍 Recalculating risk metrics with current positions...');
        const riskMetrics = this.stateRecoveryService.recalculateRiskMetrics(
          this.currentPositions,
          this.currentEquity,
        );
        console.log('✅ Risk metrics recalculated');
      }
    }

    // Initialize manual override service
    if (this.manualOverrideService) {
      await this.manualOverrideService.initialize();
      console.log('🔧 Manual override service initialized');
    }

    // Initialize capital flow manager
    await this.capitalFlowManager.initialize();

    // Load daily start equity
    this.dailyStartEquity = this.currentEquity;
    this.circuitBreaker.setDailyStartEquity(this.dailyStartEquity);

    // Start periodic metric updates
    this.startMetricUpdates();

    console.log('🧠 Titan Brain initialization completed');
  }

  /**
   * Shutdown the brain gracefully
   */
  async shutdown(): Promise<void> {
    if (this.metricsUpdateTimer) {
      clearInterval(this.metricsUpdateTimer);
      this.metricsUpdateTimer = null;
    }
  }

  /**
   * Set the execution engine client
   */
  setExecutionEngine(client: ExecutionEngineClient): void {
    this.executionEngine = client;
  }

  /**
   * Set the phase notifier
   */
  setPhaseNotifier(notifier: PhaseNotifier): void {
    this.phaseNotifier = notifier;
  }

  /**
   * Set the notification handler
   */
  setNotificationHandler(handler: NotificationHandler): void {
    this.notificationHandler = handler;
    this.circuitBreaker.setNotificationHandler(handler);

    // Set correlation notifier if handler supports it
    if ('sendHighCorrelationWarning' in handler) {
      this.riskGuardian.setCorrelationNotifier(handler as any);
    }

    // Set sweep notifier if handler supports it
    if ('sendSweepNotification' in handler) {
      this.capitalFlowManager.setSweepNotifier(handler as any);
    }
  }

  /**
   * Update current equity
   */
  setEquity(equity: number): void {
    this.currentEquity = Math.max(0, equity);
    this.riskGuardian.setEquity(this.currentEquity);
  }

  /**
   * Update current positions
   */
  setPositions(positions: Position[]): void {
    this.currentPositions = positions;
  }

  /**
   * Set daily start equity (called at start of trading day)
   */
  setDailyStartEquity(equity: number): void {
    this.dailyStartEquity = Math.max(0, equity);
    this.circuitBreaker.setDailyStartEquity(this.dailyStartEquity);
  }

  /**
   * Process an intent signal through the full pipeline
   * Requirement 7.5: Maximum latency of 100ms
   *
   * Pipeline:
   * 1. Check circuit breaker
   * 2. Get allocation weights
   * 3. Apply performance modifiers
   * 4. Check risk constraints
   * 5. Calculate authorized size
   * 6. Forward to execution or veto
   *
   * @param signal - Intent signal from a phase
   * @returns BrainDecision with approval status
   */
  async processSignal(signal: IntentSignal): Promise<BrainDecision> {
    const startTime = Date.now();
    const timestamp = startTime;

    // Check circuit breaker first
    if (this.circuitBreaker.isActive()) {
      const decision = this.createVetoDecision(
        signal,
        'Circuit breaker active: all signals rejected',
        timestamp,
      );
      await this.recordDecision(decision, signal);
      return decision;
    }

    // Check Active Inference (Cortisol Level)
    // Requirement 7.2: Freeze trading if market surprise is too high
    const cortisol = this.activeInferenceEngine.getCortisol();
    const FREEZE_THRESHOLD = 0.8; // Configurable?

    if (cortisol > FREEZE_THRESHOLD) {
      const decision = this.createVetoDecision(
        signal,
        `High Cortisol/Surprise Level (${cortisol.toFixed(
          2,
        )} > ${FREEZE_THRESHOLD}): Market Freeze`,
        timestamp,
      );
      await this.recordDecision(decision, signal);
      return decision;
    }

    // Check breaker conditions with current state
    const breakerStatus = this.circuitBreaker.checkConditions({
      equity: this.currentEquity,
      positions: this.currentPositions,
      dailyStartEquity: this.dailyStartEquity,
      recentTrades: this.recentTrades,
    });

    if (breakerStatus.active) {
      const decision = this.createVetoDecision(
        signal,
        `Circuit breaker triggered: ${breakerStatus.reason}`,
        timestamp,
      );
      await this.recordDecision(decision, signal);
      return decision;
    }

    // Get allocation weights (with manual override if active)
    const allocation = this.getAllocation();

    // Get performance modifier for the phase
    const performance = await this.performanceTracker.getPhasePerformance(signal.phaseId);

    // Calculate base allocation for this phase
    const phaseWeight = this.getPhaseWeight(signal.phaseId, allocation);
    const adjustedWeight = phaseWeight * performance.modifier;

    // Calculate max position size based on allocation
    // Requirement 1.7: Cap position size at Equity * Phase_Weight
    const maxPositionSize = this.currentEquity * adjustedWeight;

    // Check risk constraints
    const riskDecision = await this.riskGuardian.checkSignal(signal, this.currentPositions);

    // Determine final authorized size
    let authorizedSize: number;
    let approved: boolean;
    let reason: string;

    if (!riskDecision.approved) {
      // Risk veto
      approved = false;
      authorizedSize = 0;
      reason = riskDecision.reason;
    } else {
      // Apply all constraints
      const riskAdjustedSize = riskDecision.adjustedSize ?? signal.requestedSize;
      authorizedSize = Math.min(signal.requestedSize, maxPositionSize, riskAdjustedSize);

      // Requirement 1.7: Position size consistency
      if (authorizedSize <= 0) {
        approved = false;
        authorizedSize = 0;
        reason = 'Authorized size is zero after applying constraints';
      } else {
        approved = true;
        reason = this.buildApprovalReason(
          signal.requestedSize,
          authorizedSize,
          maxPositionSize,
          riskDecision, // Now passing the value, not the promise
        );
      }
    }

    const decision: BrainDecision = {
      signalId: signal.signalId,
      approved,
      authorizedSize,
      reason,
      allocation,
      performance,
      risk: riskDecision, // Now passing the value
      timestamp,
    };

    // Record decision
    await this.recordDecision(decision, signal);

    // Update signal stats
    this.updateSignalStats(signal.phaseId, approved);

    // Forward to execution or notify veto
    if (approved && this.executionEngine) {
      await this.executionEngine.forwardSignal(signal, authorizedSize);
    } else if (!approved) {
      // Requirement 7.6: Notify originating phase of veto
      if (this.phaseNotifier) {
        await this.phaseNotifier.notifyVeto(signal.phaseId, signal.signalId, reason);
      }

      // Send veto notification via notification service
      if (this.notificationHandler && 'sendVetoNotification' in this.notificationHandler) {
        try {
          await (this.notificationHandler as any).sendVetoNotification(
            signal.phaseId,
            signal.signalId,
            signal.symbol,
            reason,
            signal.requestedSize,
          );
        } catch (error) {
          console.error('Failed to send veto notification:', error);
        }
      }
    }

    // Check processing latency and record metrics
    const processingTime = Date.now() - startTime;
    if (processingTime > this.config.signalTimeout) {
      console.warn(
        `Signal processing exceeded timeout: ${processingTime}ms > ${this.config.signalTimeout}ms`,
      );
    }

    // Record metrics
    const metrics = getMetrics();
    metrics.recordSignalLatency(signal.phaseId, processingTime, approved);

    return decision;
  }

  /**
   * Process multiple signals with priority ordering
   * Requirement 7.1: Process in priority order (P3 > P2 > P1)
   *
   * @param signals - Array of intent signals
   * @returns Array of brain decisions
   */
  async processSignals(signals: IntentSignal[]): Promise<BrainDecision[]> {
    // Sort by priority (highest first)
    const sortedSignals = [...signals].sort((a, b) => {
      return PHASE_PRIORITY[b.phaseId] - PHASE_PRIORITY[a.phaseId];
    });

    const decisions: BrainDecision[] = [];

    for (const signal of sortedSignals) {
      const decision = await this.processSignal(signal);
      decisions.push(decision);

      // Update positions after each approved signal
      if (decision.approved && this.executionEngine) {
        this.currentPositions = await this.executionEngine.getPositions();
      }
    }

    return decisions;
  }

  /**
   * Enqueue a signal for processing
   * Requirement 7.4: Maintain signal queue with timestamps and phase source
   *
   * @param signal - Intent signal to enqueue
   */
  enqueueSignal(signal: IntentSignal): void {
    if (this.signalQueue.length >= this.config.maxQueueSize) {
      // Remove oldest signal
      this.signalQueue.shift();
    }

    this.signalQueue.push({
      signal,
      priority: PHASE_PRIORITY[signal.phaseId],
      enqueuedAt: Date.now(),
    });

    // Sort queue by priority
    this.signalQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Process all queued signals
   */
  async processQueue(): Promise<BrainDecision[]> {
    const signals = this.signalQueue.map((q) => q.signal);
    this.signalQueue = [];
    return this.processSignals(signals);
  }

  /**
   * Update all metrics periodically
   * Requirement 1.1: Recalculate allocation every 1 minute or on trade close
   */
  async updateMetrics(): Promise<void> {
    // Update allocation
    // Gather performance metrics for Bandit Allocator
    const performances = await this.performanceTracker.getAllPhasePerformance();
    const metricsForBandit = performances.map((p) => ({
      phaseId: p.phaseId,
      sharpeRatio: p.sharpeRatio,
    }));

    // Use adaptive weights (70% exploration/safety, 30% exploitation/performance)
    const allocation = this.allocationEngine.getAdaptiveWeights(
      this.currentEquity,
      metricsForBandit,
    );

    // Update capital flow target allocation
    const futuresAllocation = this.currentEquity * (allocation.w1 + allocation.w2);
    this.capitalFlowManager.setTargetAllocation(futuresAllocation);

    // Update high watermark
    await this.capitalFlowManager.updateHighWatermark(this.currentEquity);

    // Check sweep conditions
    await this.capitalFlowManager.performSweepIfNeeded();

    // Invalidate dashboard cache
    this.dashboardCache = null;

    // Update Prometheus metrics
    const metrics = getMetrics();
    metrics.updateEquity(this.currentEquity);
    metrics.updateAllocation(allocation.w1, allocation.w2, allocation.w3);
    metrics.updateCircuitBreakerStatus(this.circuitBreaker.isActive());
    metrics.updateHighWatermark(this.capitalFlowManager.getHighWatermark());

    // Update daily drawdown
    const dailyDrawdown =
      this.dailyStartEquity > 0
        ? ((this.dailyStartEquity - this.currentEquity) / this.dailyStartEquity) * 100
        : 0;
    metrics.updateDailyDrawdown(Math.max(0, dailyDrawdown));

    // Update phase performance metrics
    for (const phaseId of ['phase1', 'phase2', 'phase3'] as PhaseId[]) {
      const performance = await this.performanceTracker.getPhasePerformance(phaseId);
      metrics.updatePhasePerformance(phaseId, performance.sharpeRatio, performance.modifier);
    }

    // Update Governance Health
    const health: SystemHealth = {
      latency_ms: 100, // TODO: Get tracking from Metrics
      error_rate_5m: 0.0, // TODO: Get from error tracking
      drawdown_pct: dailyDrawdown,
    };
    this.governanceEngine.updateHealth(health);
  }

  /**
   * Handle execution report from Titan Execution
   * Updates positions and calculates Realized PnL
   */
  async handleExecutionReport(report: ExecutionReport): Promise<void> {
    console.log(`🧠 Processing execution report for ${report.symbol} (${report.side})`);

    // Find existing position
    const existingPosIndex = this.currentPositions.findIndex((p) => p.symbol === report.symbol);
    const existingPos = existingPosIndex >= 0 ? this.currentPositions[existingPosIndex] : null;

    if (!existingPos) {
      // Open new position
      this.currentPositions.push({
        symbol: report.symbol,
        side: report.side === 'BUY' ? 'LONG' : 'SHORT',
        size: report.qty,
        entryPrice: report.price,
        unrealizedPnL: 0,
        leverage: 1, // Default or from report
        phaseId: report.phaseId, // Added missing phaseId
      });
      console.log(`Positions updated: New position opened for ${report.symbol}`);
    } else {
      // Update existing position
      const reportSide = report.side === 'BUY' ? 'LONG' : 'SHORT';
      if (existingPos.side === reportSide) {
        // Increase Position (Weighted Average Price)
        const totalValue = existingPos.size * existingPos.entryPrice + report.qty * report.price;
        const totalSize = existingPos.size + report.qty;
        existingPos.entryPrice = totalValue / totalSize;
        existingPos.size = totalSize;
        console.log(`Positions updated: Increased size for ${report.symbol}`);
      } else {
        // Reduce/Close Position
        const closeSize = Math.min(existingPos.size, report.qty);

        // Calculate Realized PnL
        // Long: (Exit - Entry) * Size
        // Short: (Entry - Exit) * Size
        let realizedPnL = 0;
        if (existingPos.side === 'LONG') {
          realizedPnL = (report.price - existingPos.entryPrice) * closeSize;
        } else {
          realizedPnL = (existingPos.entryPrice - report.price) * closeSize;
        }

        console.log(`💰 Realized PnL for ${report.symbol}: $${realizedPnL.toFixed(2)}`);

        // Record Trade
        await this.recordTrade(
          report.phaseId,
          realizedPnL,
          report.symbol,
          reportSide === 'LONG' ? 'SELL' : 'BUY',
        );

        // Update remaining size
        existingPos.size -= closeSize;

        if (existingPos.size <= 0.00000001) {
          // Floating point tolerance
          this.currentPositions.splice(existingPosIndex, 1);
          console.log(`Positions updated: Closed position for ${report.symbol}`);
        } else {
          // Determine if flip (net opposite) - For simplicty, assuming reduce-only or flip handling logic separate
          // If remaining report qty > 0, we flip.
          // Basic implementation handles reduce to zero.
        }
      }
    }
  }

  /**
   * Record a trade result
   * Updates performance tracking and circuit breaker state
   *
   * @param phaseId - Phase that executed the trade
   * @param pnl - Trade PnL
   * @param symbol - Trading symbol
   * @param side - Trade side
   */
  async recordTrade(
    phaseId: PhaseId,
    pnl: number,
    symbol?: string,
    side?: 'BUY' | 'SELL',
  ): Promise<void> {
    const timestamp = Date.now();

    // Record in performance tracker
    await this.performanceTracker.recordTrade(phaseId, pnl, timestamp, symbol, side);

    // Record for circuit breaker
    this.recentTrades.push({ pnl, timestamp });
    this.circuitBreaker.recordTrade(pnl, timestamp);

    // Clean up old trades (keep last hour)
    const oneHourAgo = timestamp - 3600000;
    this.recentTrades = this.recentTrades.filter((t) => t.timestamp >= oneHourAgo);

    // Check if AI optimization should be triggered
    await this.checkAIOptimizationTrigger(phaseId, pnl);

    // Update metrics after trade
    await this.updateMetrics();
  }

  /**
   * Check if AI optimization should be triggered based on phase performance
   * Triggers when Sharpe drops below threshold with cooldown to prevent spam
   */
  private async checkAIOptimizationTrigger(phaseId: PhaseId, lastPnl: number): Promise<void> {
    const now = Date.now();

    // Check cooldown
    if (now - this.lastAIOptimizationTrigger < this.AI_OPTIMIZATION_COOLDOWN_MS) {
      return;
    }

    // Get phase performance
    const performance = await this.performanceTracker.getPhasePerformance(phaseId);

    // Trigger if Sharpe is below threshold and we have enough trades
    if (performance.sharpeRatio < this.AI_TRIGGER_SHARPE_THRESHOLD && performance.tradeCount >= 5) {
      console.log(
        `🤖 AI Optimization triggered for ${phaseId}: Sharpe=${performance.sharpeRatio.toFixed(2)}`,
      );

      try {
        const publisher = getNatsPublisher();
        await publisher.triggerAIOptimization({
          reason: `Poor performance detected: Sharpe ratio ${performance.sharpeRatio.toFixed(
            2,
          )} below threshold`,
          triggeredBy: 'titan-brain',
          phaseId,
          metrics: {
            sharpeRatio: performance.sharpeRatio,
            totalPnL: performance.totalPnL,
            winRate: performance.winRate,
          },
          timestamp: now,
        });

        this.lastAIOptimizationTrigger = now;
      } catch (err) {
        console.error('Failed to trigger AI optimization:', err);
      }
    }
  }

  /**
   * Get dashboard data for UI
   * Requirement 10.1-10.7: Dashboard visibility
   *
   * @returns DashboardData with all metrics
   */
  async getDashboardData(): Promise<DashboardData> {
    // Check cache
    if (
      this.dashboardCache &&
      Date.now() - this.dashboardCacheTime < this.config.dashboardCacheTTL
    ) {
      return this.dashboardCache;
    }

    // Get allocation
    const allocation = this.allocationEngine.getWeights(this.currentEquity);

    // Calculate phase equity
    const phaseEquity: Record<PhaseId, number> = {
      phase1: this.currentEquity * allocation.w1,
      phase2: this.currentEquity * allocation.w2,
      phase3: this.currentEquity * allocation.w3,
    };

    // Get risk metrics
    const riskMetrics = this.riskGuardian.getRiskMetrics(this.currentPositions);

    // Get treasury status
    const treasury = await this.capitalFlowManager.getTreasuryStatus();

    // Get circuit breaker status
    const circuitBreaker = this.circuitBreaker.getStatus();

    // Get recent decisions (last 20)
    const recentDecisions = this.recentDecisions.slice(-20);

    // Get manual override status
    const manualOverride = this.getCurrentManualOverride();
    const warningBannerActive = this.isWarningBannerActive();

    const dashboardData: DashboardData = {
      nav: this.currentEquity,
      allocation,
      phaseEquity,
      riskMetrics: {
        globalLeverage: riskMetrics.currentLeverage,
        netDelta: riskMetrics.portfolioDelta,
        correlationScore: riskMetrics.correlation,
        portfolioBeta: riskMetrics.portfolioBeta,
      },
      treasury,
      circuitBreaker,
      recentDecisions,
      lastUpdated: Date.now(),
      manualOverride: manualOverride
        ? {
            active: true,
            operatorId: manualOverride.operatorId,
            reason: manualOverride.reason,
            allocation: manualOverride.overrideAllocation,
            expiresAt: manualOverride.expiresAt,
          }
        : null,
      warningBannerActive,
    };

    // Cache the result
    this.dashboardCache = dashboardData;
    this.dashboardCacheTime = Date.now();

    return dashboardData;
  }

  /**
   * Get system health status
   *
   * @returns HealthStatus with component health
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const errors: string[] = [];
    const components = {
      database: false,
      redis: false,
      executionEngine: false,
      phases: {
        phase1: false,
        phase2: false,
        phase3: false,
      } as Record<PhaseId, boolean>,
    };

    // Check database
    if (this.db) {
      try {
        await this.db.query('SELECT 1');
        components.database = true;
      } catch (error) {
        errors.push(`Database: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // For Railway deployment without database, consider it healthy
      components.database = true;
    }

    // Check execution engine (optional for Railway)
    if (this.executionEngine) {
      try {
        await this.executionEngine.getPositions();
        components.executionEngine = true;
      } catch (error) {
        errors.push(
          `Execution Engine: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    } else {
      // For Railway deployment without execution engine, consider it healthy
      components.executionEngine = true;
    }

    // Check phase approval rates
    // Requirement 7.8: Flag for review if approval rate < 50%
    for (const phaseId of ['phase1', 'phase2', 'phase3'] as PhaseId[]) {
      const stats = this.signalStats[phaseId];
      if (stats.total > 0) {
        const approvalRate = stats.approved / stats.total;
        components.phases[phaseId] = approvalRate >= 0.5;
        if (approvalRate < 0.5) {
          errors.push(`${phaseId}: Approval rate ${(approvalRate * 100).toFixed(1)}% < 50%`);
        }
      } else {
        components.phases[phaseId] = true; // No signals yet
      }
    }

    // For production deployment, be more lenient with health checks
    const isProduction = process.env.NODE_ENV === 'production';
    const healthy = isProduction
      ? // Production: Just check that the service is running (phases are healthy)
        Object.values(components.phases).every(Boolean)
      : // Local: Check all components
        components.database &&
        components.executionEngine &&
        Object.values(components.phases).every(Boolean);

    return {
      healthy,
      components,
      lastCheck: Date.now(),
      errors,
    };
  }

  /**
   * Get signal approval rate for a phase
   * Requirement 7.7: Track signal approval rate per phase
   *
   * @param phaseId - Phase to check
   * @returns Approval rate (0-1)
   */
  getApprovalRate(phaseId: PhaseId): number {
    const stats = this.signalStats[phaseId];
    if (stats.total === 0) return 1.0;
    return stats.approved / stats.total;
  }

  /**
   * Get all phase approval rates
   */
  getAllApprovalRates(): Record<PhaseId, number> {
    return {
      phase1: this.getApprovalRate('phase1'),
      phase2: this.getApprovalRate('phase2'),
      phase3: this.getApprovalRate('phase3'),
    };
  }

  /**
   * Reset signal stats (e.g., at start of day)
   */
  resetSignalStats(): void {
    this.signalStats = {
      phase1: { approved: 0, total: 0 },
      phase2: { approved: 0, total: 0 },
      phase3: { approved: 0, total: 0 },
    };
  }

  /**
   * Get current allocation vector (with manual override if active)
   * Requirement 9.7: Support manual override of allocation weights
   */
  getAllocation(): AllocationVector {
    const normalAllocation = this.allocationEngine.getWeights(this.currentEquity);

    // Apply manual override if active
    if (this.manualOverrideService) {
      return this.manualOverrideService.getEffectiveAllocation(normalAllocation);
    }

    return normalAllocation;
  }

  /**
   * Get current equity
   */
  getEquity(): number {
    return this.currentEquity;
  }

  /**
   * Get current positions
   */
  getPositions(): Position[] {
    return [...this.currentPositions];
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): BreakerStatus {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Manually reset circuit breaker
   * Requirement 5.8: Require operator ID
   *
   * @param operatorId - ID of operator performing reset
   */
  async resetCircuitBreaker(operatorId: string): Promise<void> {
    await this.circuitBreaker.reset(operatorId);
  }

  /**
   * Get configuration
   */
  getConfig(): BrainConfig {
    return { ...this.config };
  }

  /**
   * Create a manual allocation override
   * Requirement 9.7: Create admin endpoint for allocation override
   *
   * @param operatorId - Operator creating the override
   * @param password - Operator password
   * @param allocation - New allocation vector
   * @param reason - Reason for override
   * @param durationHours - Optional duration in hours
   * @returns True if override created successfully
   */
  async createManualOverride(
    operatorId: string,
    password: string,
    allocation: AllocationVector,
    reason: string,
    durationHours?: number,
  ): Promise<boolean> {
    if (!this.manualOverrideService) {
      console.error('Manual override service not available');
      return false;
    }

    // Authenticate operator
    const authenticated = await this.manualOverrideService.authenticateOperator(
      operatorId,
      password,
    );
    if (!authenticated) {
      console.warn(`Manual override rejected: authentication failed for operator ${operatorId}`);
      return false;
    }

    // Create override
    const override = await this.manualOverrideService.createOverride({
      operatorId,
      allocation,
      reason,
      durationHours,
    });

    if (override) {
      console.log(`✅ Manual override created by operator ${operatorId}`);
      console.log(
        `   New allocation: w1=${allocation.w1}, w2=${allocation.w2}, w3=${allocation.w3}`,
      );
      console.log(`   Reason: ${reason}`);

      // Invalidate dashboard cache to show warning banner
      this.dashboardCache = null;

      return true;
    }

    return false;
  }

  /**
   * Deactivate the current manual override
   *
   * @param operatorId - Operator deactivating the override
   * @param password - Operator password
   * @returns True if successfully deactivated
   */
  async deactivateManualOverride(operatorId: string, password: string): Promise<boolean> {
    if (!this.manualOverrideService) {
      console.error('Manual override service not available');
      return false;
    }

    // Authenticate operator
    const authenticated = await this.manualOverrideService.authenticateOperator(
      operatorId,
      password,
    );
    if (!authenticated) {
      console.warn(
        `Manual override deactivation rejected: authentication failed for operator ${operatorId}`,
      );
      return false;
    }

    const success = await this.manualOverrideService.deactivateOverride(operatorId);

    if (success) {
      console.log(`✅ Manual override deactivated by operator ${operatorId}`);

      // Invalidate dashboard cache to hide warning banner
      this.dashboardCache = null;
    }

    return success;
  }

  /**
   * Get current manual override status
   *
   * @returns Current override or null if none active
   */
  getCurrentManualOverride() {
    if (!this.manualOverrideService) return null;
    return this.manualOverrideService.getCurrentOverride();
  }

  /**
   * Check if warning banner should be displayed
   * Requirement 9.8: Implement warning banner flag
   *
   * @returns True if warning banner should be shown
   */
  isWarningBannerActive(): boolean {
    if (!this.manualOverrideService) return false;
    return this.manualOverrideService.isWarningBannerActive();
  }

  /**
   * Get manual override history
   *
   * @param operatorId - Optional operator filter
   * @param limit - Maximum number of records
   * @returns Array of historical overrides
   */
  async getManualOverrideHistory(operatorId?: string, limit: number = 50) {
    if (!this.manualOverrideService) return [];
    return this.manualOverrideService.getOverrideHistory(operatorId, limit);
  }

  /**
   * Create a new operator account
   *
   * @param operatorId - Unique operator identifier
   * @param password - Operator password
   * @param permissions - Array of permissions
   * @returns True if created successfully
   */
  async createOperator(
    operatorId: string,
    password: string,
    permissions: string[],
  ): Promise<boolean> {
    if (!this.manualOverrideService) {
      console.error('Manual override service not available');
      return false;
    }

    return this.manualOverrideService.createOperator(operatorId, password, permissions);
  }

  // ============ PositionClosureHandler Implementation ============

  /**
   * Close all positions (called by circuit breaker)
   */
  async closeAllPositions(): Promise<void> {
    if (this.executionEngine) {
      await this.executionEngine.closeAllPositions();
      this.currentPositions = [];
    }
  }

  // ============ BreakerEventPersistence Implementation ============

  /**
   * Persist circuit breaker event to database
   */
  async persistEvent(event: {
    timestamp: number;
    eventType: 'TRIGGER' | 'RESET';
    breakerType?: string;
    reason: string;
    equity: number;
    operatorId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.db) return;

    await this.db.query(
      `INSERT INTO circuit_breaker_events 
       (timestamp, event_type, reason, equity, operator_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.timestamp,
        event.eventType,
        event.reason,
        event.equity,
        event.operatorId ?? null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ],
    );
  }

  // ============ Private Helper Methods ============

  /**
   * Start periodic metric updates
   */
  private startMetricUpdates(): void {
    if (this.metricsUpdateTimer) {
      clearInterval(this.metricsUpdateTimer);
    }

    this.metricsUpdateTimer = setInterval(async () => {
      try {
        await this.updateMetrics();
      } catch (error) {
        console.error('Error updating metrics:', error);
      }
    }, this.config.metricUpdateInterval);
  }

  /**
   * Get phase weight from allocation vector
   */
  private getPhaseWeight(phaseId: PhaseId, allocation: AllocationVector): number {
    switch (phaseId) {
      case 'phase1':
        return allocation.w1;
      case 'phase2':
        return allocation.w2;
      case 'phase3':
        return allocation.w3;
      default:
        return 0;
    }
  }

  /**
   * Create a veto decision
   */
  private createVetoDecision(
    signal: IntentSignal,
    reason: string,
    timestamp: number,
  ): BrainDecision {
    const allocation = this.allocationEngine.getWeights(this.currentEquity);
    const riskMetrics = this.riskGuardian.getRiskMetrics(this.currentPositions);

    return {
      signalId: signal.signalId,
      approved: false,
      authorizedSize: 0,
      reason,
      allocation,
      performance: {
        phaseId: signal.phaseId,
        sharpeRatio: 0,
        totalPnL: 0,
        tradeCount: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        modifier: 1.0,
      },
      risk: {
        approved: false,
        reason,
        riskMetrics,
      },
      timestamp,
    };
  }

  /**
   * Build approval reason string
   */
  private buildApprovalReason(
    requestedSize: number,
    authorizedSize: number,
    maxPositionSize: number,
    riskDecision: RiskDecision,
  ): string {
    const parts: string[] = ['Signal approved'];

    if (authorizedSize < requestedSize) {
      const reductions: string[] = [];

      if (authorizedSize <= maxPositionSize && requestedSize > maxPositionSize) {
        reductions.push(`allocation cap (${maxPositionSize.toFixed(2)})`);
      }

      if (riskDecision.adjustedSize && riskDecision.adjustedSize < requestedSize) {
        reductions.push(`risk adjustment`);
      }

      if (reductions.length > 0) {
        parts.push(`with size reduction due to ${reductions.join(', ')}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Record a decision to database and memory
   */
  private async recordDecision(decision: BrainDecision, signal: IntentSignal): Promise<void> {
    // Add to recent decisions
    this.recentDecisions.push(decision);

    // Keep only last 100 decisions in memory
    if (this.recentDecisions.length > 100) {
      this.recentDecisions.shift();
    }

    // Persist to database
    if (this.db) {
      const record: DecisionRecord = {
        signalId: signal.signalId,
        phaseId: signal.phaseId,
        timestamp: decision.timestamp,
        approved: decision.approved,
        requestedSize: signal.requestedSize,
        authorizedSize: decision.approved ? decision.authorizedSize : null,
        reason: decision.reason,
        riskMetrics: decision.risk.riskMetrics,
      };

      await this.db.query(
        `INSERT INTO brain_decisions 
         (signal_id, phase_id, timestamp, approved, requested_size, authorized_size, reason, risk_metrics)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (signal_id) DO NOTHING`,
        [
          record.signalId,
          record.phaseId,
          record.timestamp,
          record.approved,
          record.requestedSize,
          record.authorizedSize,
          record.reason,
          record.riskMetrics ? JSON.stringify(record.riskMetrics) : null,
        ],
      );
    }
  }

  /**
   * Update signal statistics
   */
  private updateSignalStats(phaseId: PhaseId, approved: boolean): void {
    this.signalStats[phaseId].total++;
    if (approved) {
      this.signalStats[phaseId].approved++;
    }
  }

  /**
   * Calculate net position for opposite signals
   * Requirement 7.3: Calculate net position for opposite signals on same asset
   *
   * @param signals - Array of signals for the same asset
   * @returns Net position size and direction
   */
  calculateNetPosition(signals: IntentSignal[]): {
    netSize: number;
    side: 'BUY' | 'SELL' | 'NEUTRAL';
  } {
    let netSize = 0;

    for (const signal of signals) {
      if (signal.side === 'BUY') {
        netSize += signal.requestedSize;
      } else {
        netSize -= signal.requestedSize;
      }
    }

    if (netSize > 0) {
      return { netSize, side: 'BUY' };
    } else if (netSize < 0) {
      return { netSize: Math.abs(netSize), side: 'SELL' };
    } else {
      return { netSize: 0, side: 'NEUTRAL' };
    }
  }

  /**
   * Get recent decisions
   *
   * @param limit - Maximum number of decisions to return
   * @returns Array of recent decisions
   */
  getRecentDecisions(limit: number = 20): BrainDecision[] {
    return this.recentDecisions.slice(-limit);
  }

  /**
   * Export dashboard data to JSON
   * Requirement 10.8: Support exporting dashboard data to JSON
   *
   * @returns JSON string of dashboard data
   */
  async exportDashboardJSON(): Promise<string> {
    const data = await this.getDashboardData();
    return JSON.stringify(data, null, 2);
  }

  /**
   * Get performance for all phases
   */
  async getAllPhasePerformance(): Promise<PhasePerformance[]> {
    return this.performanceTracker.getAllPhasePerformance();
  }

  /**
   * Get treasury status
   */
  async getTreasuryStatus(): Promise<TreasuryStatus> {
    return this.capitalFlowManager.getTreasuryStatus();
  }

  /**
   * Get next sweep trigger level
   */
  getNextSweepTriggerLevel(): number {
    return this.capitalFlowManager.getNextSweepTriggerLevel();
  }

  /**
   * Get total swept amount
   */
  getTotalSwept(): number {
    return this.capitalFlowManager.getTotalSwept();
  }

  /**
   * Get high watermark
   */
  getHighWatermark(): number {
    return this.capitalFlowManager.getHighWatermark();
  }

  /**
   * Update price history for correlation calculations
   *
   * @param symbol - Asset symbol
   * @param price - Current price
   */
  updatePriceHistory(symbol: string, price: number): void {
    this.riskGuardian.updatePriceHistory(symbol, price);

    // Feed Active Inference Engine with market proxy
    // Using BTCUSDT as the representative market signal for "Surprise" calculation
    if (symbol === 'BTCUSDT') {
      this.activeInferenceEngine.processUpdate({
        price,
        volume: 0, // not used for surprise calculation currently
        timestamp: Date.now(),
      });
    }
  }
  /**
   * Get database manager
   */
  getDatabaseManager(): DatabaseManager | null {
    return this.db;
  }
}
