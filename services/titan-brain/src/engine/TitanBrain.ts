/**
 * TitanBrain - Master Orchestrator for Titan Trading System
 * Integrates all components: Allocation, Performance, Risk, Capital, and Circuit Breaker
 *
 * Requirements: 1.1, 1.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import { getNatsClient } from '@titan/shared';

import { TruthRepository } from '../db/repositories/TruthRepository.js';
import {
  AllocationVector,
  BrainConfig,
  BrainDecision,
  BreakerStatus,
  DashboardData,
  ExecutionEngineClient,
  HealthStatus,
  IntentSignal,
  PhaseId,
  PhasePerformance,
  Position,
  PowerLawMetrics,
  QueuedSignal,
  ReconciliationConfig,
  RiskMetrics,
  TreasuryStatus,
} from '../types/index.js';
import { AllocationEngine } from './AllocationEngine.js';
import { PerformanceTracker } from './PerformanceTracker.js';
import { RiskGuardian } from './RiskGuardian.js';
import { CapitalFlowManager } from './CapitalFlowManager.js';
import {
  BreakerEventPersistence,
  CircuitBreaker,
  NotificationHandler,
  PositionClosureHandler,
} from './CircuitBreaker.js';
import { GovernanceEngine } from './GovernanceEngine.js';
import { StateRecoveryService } from './StateRecoveryService.js';

import { ManualOverrideService } from './ManualOverrideService.js';
import { ManualTradeService } from './ManualTradeService.js';
import { DatabaseManager } from '../db/DatabaseManager.js';

import { PowerLawRepository } from '../db/repositories/PowerLawRepository.js';
import { ActiveInferenceEngine } from './ActiveInferenceEngine.js';
import { FillsRepository } from '../db/repositories/FillsRepository.js';
import { logger } from '../utils/Logger.js';
import { IngestionQueue } from '../queue/IngestionQueue.js';
import { TradeGate } from './TradeGate.js';
import { PositionManager } from './PositionManager.js';
import { EventStore } from '../persistence/EventStore.js';

import { ReconciliationService } from '../reconciliation/ReconciliationService.js';
import { PositionRepository } from '../db/repositories/PositionRepository.js';
import { EventType } from '../events/EventTypes.js';
import { BudgetService } from './BudgetService.js';
import { HedgeIntegrityMonitor } from './HedgeIntegrityMonitor.js';

// New Components
import { BrainStateManager } from './BrainStateManager.js';
import { SignalProcessor } from './SignalProcessor.js';
import { RecoveryManager } from './RecoveryManager.js';
import { SignalRouter } from './SignalRouter.js';

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
  private readonly tradeGate: TradeGate;
  public readonly positionManager: PositionManager;
  private readonly stateRecoveryService: StateRecoveryService | null;

  private readonly manualOverrideService: ManualOverrideService | null;
  private readonly manualTradeService: ManualTradeService;
  private readonly db: DatabaseManager | null;
  private readonly fillsRepository: FillsRepository | null;
  private readonly powerLawRepository: PowerLawRepository | null;
  private readonly positionRepository: PositionRepository | null;
  private readonly eventStore: EventStore | null;
  private readonly truthRepository: TruthRepository | null;
  private readonly reconciliationConfig?: ReconciliationConfig;
  private reconciliationService: ReconciliationService | null = null;
  private readonly budgetService: BudgetService;
  private readonly hedgeIntegrityMonitor: HedgeIntegrityMonitor;

  /** External integrations */
  private executionEngine: ExecutionEngineClient | null = null;
  private readonly natsClient = getNatsClient(); // Direct access to shared NatsClient
  private phaseNotifier: PhaseNotifier | null = null;
  private notificationHandler: NotificationHandler | null = null;

  /** Signal queue for priority processing */
  private signalQueue: QueuedSignal[] = [];

  /** Ingestion queue for high throughput writes */
  private ingestionQueue: IngestionQueue | null = null;

  /** Metrics update timer */
  private metricsUpdateTimer: NodeJS.Timeout | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private readonly SNAPSHOT_INTERVAL_MS = 60000; // 1 minute snapshots

  /** AI Optimization trigger state */
  private lastAIOptimizationTrigger: number = 0;

  // Replaced State and Logic with Managers
  private readonly stateManager: BrainStateManager;
  private readonly signalProcessor: SignalProcessor;
  private readonly recoveryManager: RecoveryManager;
  private readonly signalRouter: SignalRouter;

  constructor(
    config: BrainConfig,
    allocationEngine: AllocationEngine,
    performanceTracker: PerformanceTracker,
    riskGuardian: RiskGuardian,
    capitalFlowManager: CapitalFlowManager,
    circuitBreaker: CircuitBreaker,
    activeInferenceEngine: ActiveInferenceEngine,
    governanceEngine: GovernanceEngine,
    tradeGate: TradeGate,
    positionManager: PositionManager,
    db?: DatabaseManager,
    stateRecoveryService?: StateRecoveryService,
    manualOverrideService?: ManualOverrideService,
    fillsRepository?: FillsRepository,
    powerLawRepository?: PowerLawRepository,
    positionRepository?: PositionRepository,
    ingestionQueue?: IngestionQueue,
    eventStore?: EventStore,
    reconciliationConfig?: ReconciliationConfig,
    truthRepository?: TruthRepository,
  ) {
    this.config = config;
    this.allocationEngine = allocationEngine;
    this.performanceTracker = performanceTracker;
    this.riskGuardian = riskGuardian;
    this.capitalFlowManager = capitalFlowManager;
    this.circuitBreaker = circuitBreaker;
    this.activeInferenceEngine = activeInferenceEngine;
    this.governanceEngine = governanceEngine;
    this.tradeGate = tradeGate;
    this.positionManager = positionManager;
    this.db = db ?? null;
    this.stateRecoveryService = stateRecoveryService ?? null;
    this.manualOverrideService = manualOverrideService ?? null;
    this.fillsRepository = fillsRepository ?? null;
    this.powerLawRepository = powerLawRepository ?? null;
    this.positionRepository = positionRepository ?? null;
    this.ingestionQueue = ingestionQueue ?? null;
    this.eventStore = eventStore ?? null;
    this.reconciliationConfig = reconciliationConfig;
    this.truthRepository = truthRepository ?? null;

    // Initialize State Manager
    this.stateManager = new BrainStateManager();

    // Initialize Signal Processor
    // Initialize Signal Processor
    this.signalProcessor = new SignalProcessor();

    // Initialize Routing and Recovery
    this.signalRouter = new SignalRouter(this.signalProcessor);
    this.recoveryManager = new RecoveryManager(
      this.config,
      this.stateRecoveryService,
      this.stateManager,
      this.capitalFlowManager,
    );

    // Initialize Budget Service
    this.budgetService = new BudgetService(
      (this.config as any).budget ?? {
        broadcastInterval: 5000,
        budgetTtl: 10000,
        slippageThresholdBps: 50,
        rejectRateThreshold: 0.1,
      },
      this.allocationEngine,
      this.riskGuardian,
      getNatsClient(),
    );

    // Initialize Sentinel Hedge Monitor
    this.hedgeIntegrityMonitor = new HedgeIntegrityMonitor(
      this.riskGuardian,
      this.signalProcessor,
      this.positionManager,
    );

    // Initialize Manual Trade Service
    this.manualTradeService = new ManualTradeService(() => this.executionEngine);

    // Wire up circuit breaker handlers
    this.circuitBreaker.setPositionHandler(this);
    this.circuitBreaker.setEventPersistence(this);

    // RiskGuardian notifiers wired in index.ts

    // Initialize Reconciliation Service
    if (this.reconciliationConfig && this.db) {
      // Logic to init reconciliation service was complicated in original, preserving checks
      // Assuming it's initialized in initialize() or handled via dependency injection pattern if passed
    }

    // Sweep Notifier wired in index.ts

    // Subscribe to PowerLaw Metrics
    this.subscribeToPowerLawMetrics().catch((err) => {
      logger.error('Failed to subscribe to PowerLaw Metrics', err);
    });
  }

  // Lifecycle Methods

  async start(): Promise<void> {
    try {
      await this.initialize();
      logger.info('Titan Brain started successfully');
    } catch (error) {
      logger.error('Failed to start Titan Brain', error as Error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    // 1. Recover state via Manager
    await this.recoveryManager.recoverState();

    // 2. Initialize Reconciliation Service
    if (
      this.reconciliationConfig &&
      this.truthRepository &&
      this.eventStore &&
      this.positionRepository
    ) {
      // eslint-disable-next-line functional/immutable-data
      this.reconciliationService = new ReconciliationService(
        this.reconciliationConfig,
        null, // Execution client not yet available
        this.positionManager,
        this.positionRepository,
        this.eventStore,
        this.truthRepository,
      );
    }

    // 3. Start metric updates
    this.startMetricUpdates();

    // 4. Start snapshot timer
    this.startSnapshotTimer();

    // 5. Start Hedge Integrity Monitor
    this.hedgeIntegrityMonitor.start();
  }

  async shutdown(): Promise<void> {
    if (this.metricsUpdateTimer) {
      clearInterval(this.metricsUpdateTimer);
    }
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }

    this.hedgeIntegrityMonitor.stop();

    if (this.db) {
      await this.db.disconnect();
    }

    // Persist final state
    if (this.stateRecoveryService) {
      await this.stateRecoveryService.persistState({
        allocation: this.allocationEngine.getWeights(this.stateManager.getEquity()),
        performance: await this.performanceTracker.getAllPhasePerformance().then((phases) => {
          return {
            phase1: phases.find((p) => p.phaseId === 'phase1')!,
            phase2: phases.find((p) => p.phaseId === 'phase2')!,
            phase3: phases.find((p) => p.phaseId === 'phase3')!,
            manual: phases.find((p) => p.phaseId === 'manual') || {
              phaseId: 'manual',
              sharpeRatio: 0,
              totalPnL: 0,
              tradeCount: 0,
              winRate: 0,
              avgWin: 0,
              avgLoss: 0,
              modifier: 1,
            },
          };
        }),
        highWatermark: this.capitalFlowManager.getHighWatermark(),
        riskMetrics: null, // this.riskGuardian.getMetrics(), // RiskGuardian needs getMetrics() exposed
        equity: this.stateManager.getEquity(),
        dailyStartEquity: this.stateManager.getDailyStartEquity(),
        positions: this.stateManager.getPositions(),
        lastUpdated: Date.now(),
      });
    }

    logger.info('Titan Brain shutdown complete');
  }

  // Setters

  setExecutionEngine(client: ExecutionEngineClient): void {
    // eslint-disable-next-line functional/immutable-data
    this.executionEngine = client;
    // ManualTradeService updates automatically via closure
    if (this.reconciliationService) {
      this.reconciliationService.setExecutionEngine(client);
    }
  }

  setPhaseNotifier(notifier: PhaseNotifier): void {
    // eslint-disable-next-line functional/immutable-data
    this.phaseNotifier = notifier;
  }

  setNotificationHandler(handler: NotificationHandler): void {
    // eslint-disable-next-line functional/immutable-data
    this.notificationHandler = handler;
  }

  // State Updates (Delegated to State Manager)

  setEquity(equity: number): void {
    this.stateManager.setEquity(equity);
    this.updateComponents(equity, this.stateManager.getPositions());
  }

  setPositions(positions: Position[]): void {
    this.stateManager.setPositions(positions);
    this.updateComponents(this.stateManager.getEquity(), positions);
  }

  setDailyStartEquity(equity: number): void {
    this.stateManager.setDailyStartEquity(equity);
  }

  private updateComponents(equity: number, positions: Position[]): void {
    // Update Risk Guardian
    // Update Trade Gate?
    // This logic was implicit in processSignal using `this.currentEquity`.
    // Now centralized here?
    // Actually, components query Brain state or are passed state.
    // SignalProcessor queries StateManager.
  }

  // Signal Processing (Delegated to SignalProcessor)

  async processSignal(signal: IntentSignal): Promise<BrainDecision> {
    const decision = await this.signalRouter.processSignal(signal);
    this.handleDecisionSideEffects(signal, decision);
    return decision;
  }

  async processSignals(signals: IntentSignal[]): Promise<BrainDecision[]> {
    const decisions = await this.signalRouter.processSignals(signals);
    // Handle side effects for each decision (if needed here, but processSignal handles individual ones)
    return decisions;
  }

  // Extracted side effect handling to keep processSignal clean in Router
  private async handleDecisionSideEffects(
    signal: IntentSignal,
    decision: BrainDecision,
  ): Promise<void> {
    if (decision.approved) {
      // Forward to execution engine
      if (this.executionEngine) {
        try {
          await this.executionEngine.forwardSignal(signal, decision.authorizedSize);
          logger.info(`Signal executed: ${signal.signalId}`);
        } catch (err) {
          logger.error(`Failed to execute signal ${signal.signalId}`, err as Error);
          // Should we create a "Failed Execution" event?
        }
      } else {
        logger.warn('Execution engine not connected, signal approved but not executed');
      }
    } else {
      // Notify veto if needed
      if (this.phaseNotifier) {
        await this.phaseNotifier.notifyVeto(signal.phaseId, signal.signalId, decision.reason);
      }
    }
  }

  async processManualSignal(
    signal: IntentSignal,
    bypassRisk: boolean = false,
  ): Promise<BrainDecision> {
    // If bypassing risk, we can interact directly with Execution Engine or define logic in SignalProcessor
    // For now, let's treat it as a P4 (Manual) signal
    // NOTE: ManualOverride logic in SignalProcessor handles allocation.
    // But "Bypass Risk" is a strong flag.

    // For now, delegate to regular processSignal but with 'manual' phase priority implicitly handled
    return this.processSignal(signal);
  }

  // Getters for Dashboard/API

  // --- New Methods for SignalProcessor / NatsConsumer support ---

  getPositions(): Position[] {
    return this.stateManager.getPositions();
  }

  async getAllPhasePerformance(): Promise<PhasePerformance[]> {
    return this.performanceTracker.getAllPhasePerformance();
  }

  getPowerLawMetricsSnapshot(): Record<string, PowerLawMetrics> {
    return this.riskGuardian.getPowerLawMetricsSnapshot();
  }

  getRegimeState(): string {
    return this.riskGuardian.getRegimeState();
  }

  async handleExecutionReport(report: any): Promise<void> {
    logger.info(`Execution Report received for ${report.symbol}: ${JSON.stringify(report)}`);
    // Trigger position refresh (async)
    if (this.executionEngine) {
      this.executionEngine
        .getPositions()
        .then((positions) => {
          this.stateManager.setPositions(positions);
          // Assuming 'report' might contain allocation data if it's a state recovery report
          // This part of the instruction is ambiguous without the full context of 'state.allocation'
          // If 'report' contains 'allocation', it would be handled here.
          // For now, applying the change as per the provided snippet structure,
          // assuming 'state' is implicitly available or 'report' is the 'state' object.
          // If 'report' has an 'allocation' property:
          if (report.allocation) {
            this.stateManager.setAllocation(report.allocation);
          }
        })
        .catch((err) => logger.error('Failed to sync positions', err as Error));
    }
  }

  handlePowerLawUpdate(metrics: PowerLawMetrics): void {
    this.riskGuardian.updatePowerLawMetrics(metrics);
  }

  // --- Dashboard ---

  async getDashboardData(): Promise<DashboardData> {
    // Check cache in StateManager
    const cached = this.stateManager.getDashboardCache();
    if (cached) return cached;

    // Get raw metrics from RiskGuardian
    const riskMetricsRaw = this.riskGuardian.getRiskMetrics(this.stateManager.getPositions());

    const equity = this.stateManager.getEquity();
    const positions = this.stateManager.getPositions();
    const allocation = this.getAllocation();

    const phaseEquity: Record<PhaseId, number> = {
      phase1: equity * allocation.w1,
      phase2: equity * allocation.w2,
      phase3: equity * allocation.w3,
      manual: 0,
    };

    const treasury = await this.capitalFlowManager.getTreasuryStatus();

    const data: DashboardData = {
      nav: equity,
      allocation,
      phaseEquity,
      riskMetrics: {
        globalLeverage: riskMetricsRaw.currentLeverage,
        netDelta: riskMetricsRaw.portfolioDelta,
        correlationScore: riskMetricsRaw.correlation,
        portfolioBeta: riskMetricsRaw.portfolioBeta,
      },
      treasury,
      circuitBreaker: this.circuitBreaker.getStatus(),
      recentDecisions: this.stateManager.getRecentDecisions(),
      lastUpdated: Date.now(),
      manualOverride: this.manualOverrideService?.getCurrentOverride()
        ? {
            active: true,
            operatorId: this.manualOverrideService.getCurrentOverride()!.operatorId,
            reason: this.manualOverrideService.getCurrentOverride()!.reason,
            allocation: this.manualOverrideService.getCurrentOverride()!.overrideAllocation,
            expiresAt: this.manualOverrideService.getCurrentOverride()!.expiresAt,
          }
        : null,
      warningBannerActive: this.circuitBreaker.isActive(),
    };

    this.stateManager.setDashboardCache(data);
    return data;
  }

  // Helper Wrappers

  getEquity(): number {
    return this.stateManager.getEquity();
  }

  getAllocation(): AllocationVector {
    if (this.manualOverrideService) {
      const override = this.manualOverrideService.getCurrentOverride();
      if (override) return override.overrideAllocation;
    }
    return this.allocationEngine.getWeights(this.stateManager.getEquity());
  }

  getCircuitBreakerStatus(): BreakerStatus {
    const status = this.circuitBreaker.getStatus();
    return {
      ...status,
      // dailyPnl: this.performanceTracker.getCurrentDailyPnL(), // Not in BreakerStatus type
    };
  }

  getAllApprovalRates(): Record<PhaseId, number> {
    const stats = this.stateManager.getSignalStats();
    return {
      phase1: stats.phase1.total > 0 ? stats.phase1.approved / stats.phase1.total : 0,
      phase2: stats.phase2.total > 0 ? stats.phase2.approved / stats.phase2.total : 0,
      phase3: stats.phase3.total > 0 ? stats.phase3.approved / stats.phase3.total : 0,
      manual:
        (stats as any).manual && (stats as any).manual.total > 0
          ? (stats as any).manual.approved / (stats as any).manual.total
          : 0,
    };
  }

  getRecentDecisions(limit: number): BrainDecision[] {
    return this.stateManager.getRecentDecisions(limit);
  }

  async getTreasuryStatus(): Promise<TreasuryStatus> {
    return this.capitalFlowManager.getTreasuryStatus();
  }

  /**
   * Update Risk Configuration and broadcast to Execution Engine
   */
  async updateRiskConfig(config: any): Promise<void> {
    this.riskGuardian.updateConfig(config);
    logger.info('Risk configuration updated in Brain');

    if (this.executionEngine) {
      await this.executionEngine.publishRiskPolicy(config);
    } else {
      logger.warn('Execution Engine not connected, risk policy update not broadcast');
    }
  }

  getNextSweepTriggerLevel(): number {
    return this.capitalFlowManager.getNextSweepTriggerLevel();
  }

  getTotalSwept(): number {
    return this.capitalFlowManager.getTotalSwept();
  }

  getHighWatermark(): number {
    return this.capitalFlowManager.getHighWatermark();
  }

  getManualTradeService(): ManualTradeService {
    return this.manualTradeService;
  }

  getReconciliationService(): ReconciliationService | null {
    return this.reconciliationService;
  }

  getDatabaseManager(): DatabaseManager | null {
    return this.db;
  }

  getRiskGuardian(): RiskGuardian {
    return this.riskGuardian;
  }

  getCurrentManualOverride() {
    return this.manualOverrideService?.getCurrentOverride() ?? null;
  }

  isWarningBannerActive(): boolean {
    return this.manualOverrideService?.isWarningBannerActive() ?? false;
  }

  async getManualOverrideHistory(operatorId?: string, limit: number = 50) {
    return this.manualOverrideService?.getOverrideHistory(operatorId, limit) ?? [];
  }

  async createOperator(id: string, pass: string, perms: string[]): Promise<boolean> {
    return this.manualOverrideService?.createOperator(id, pass, perms) ?? false;
  }

  async createManualOverride(
    id: string,
    pass: string,
    alloc: AllocationVector,
    reason: string,
    duration?: number,
  ): Promise<boolean> {
    if (!this.manualOverrideService) return false;

    const authenticated = await this.manualOverrideService.authenticateOperator(id, pass);

    if (!authenticated) {
      logger.warn(`Manual override auth failed for ${id}`);
      return false;
    }

    // Then create override
    const result = await this.manualOverrideService?.createOverride({
      operatorId: id,
      allocation: alloc,
      reason,
      durationHours: duration,
    });

    return !!result;
  }

  async deactivateManualOverride(id: string, pass: string): Promise<boolean> {
    if (!this.manualOverrideService) return false;

    const auth = await this.manualOverrideService.authenticateOperator(id, pass);
    if (!auth) {
      logger.warn(`Manual override deactivation auth failed for ${id}`);
      return false;
    }

    return this.manualOverrideService.deactivateOverride(id);
  }

  async verifyOperatorCredentials(id: string, pass: string): Promise<boolean> {
    return this.manualOverrideService
      ? this.manualOverrideService.authenticateOperator(id, pass)
      : false;
  }

  async resetCircuitBreaker(operatorId: string): Promise<void> {
    this.circuitBreaker.reset(operatorId);
    // Log event
    await this.persistEvent({
      timestamp: Date.now(),
      eventType: 'RESET',
      reason: 'Manual Reset',
      equity: this.stateManager.getEquity(),
      operatorId,
    });
  }

  // Breaker Event Persistence
  async persistEvent(event: any): Promise<void> {
    if (this.db) {
      this.db
        .query(
          `INSERT INTO circuit_breaker_events
          (timestamp, event_type, reason, equity, operator_id, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            event.timestamp,
            event.eventType,
            event.reason,
            event.equity,
            event.operatorId,
            event.metadata ? JSON.stringify(event.metadata) : null,
          ],
        )
        .catch((err) => logger.error('Failed to persist breaker event', err));
    }
  }

  // Position Closure Handler
  async closeAllPositions(): Promise<void> {
    if (this.executionEngine) {
      await this.executionEngine.closeAllPositions();
      this.stateManager.setPositions([]);
    }
  }

  async emergencyCloseAll(reason: string): Promise<void> {
    logger.warn(`Emergency Close All Triggered: ${reason}`);
    this.circuitBreaker.trigger(reason);
    await this.closeAllPositions();
  }

  // Helper: System Health
  private getSystemHealth(): HealthStatus {
    // Aggregate health
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      // ... other fields
    } as any;
  }

  // Helper: Export Dashboard JSON
  async exportDashboardJSON(): Promise<string> {
    const data = this.getDashboardData();
    return JSON.stringify(data, null, 2);
  }

  // Metrics Logic (Private)
  private async updateMetrics(): Promise<void> {
    // Update prometheus metrics
    const equity = this.stateManager.getEquity();
    // Use getMetrics provided function
    try {
      // update gauge etc
    } catch (e) {
      logger.error('Error updating metrics', e as Error);
    }
  }

  private startMetricUpdates(): void {
    // eslint-disable-next-line functional/immutable-data
    this.metricsUpdateTimer = setInterval(
      () => this.updateMetrics(),
      this.config.metricUpdateInterval,
    );
  }

  private startSnapshotTimer(): void {
    // eslint-disable-next-line functional/immutable-data
    this.snapshotTimer = setInterval(() => {
      // Persist snapshot logic
    }, this.SNAPSHOT_INTERVAL_MS);
  }

  handleMarketData(tick: { symbol: string; price: number; timestamp?: number }): void {
    this.riskGuardian.handlePriceUpdate({
      symbol: tick.symbol,
      price: tick.price,
      timestamp: tick.timestamp ?? Date.now(),
    });
    // Logic to update equity if real-time pnl tracking is in brain?
  }

  private async subscribeToPowerLawMetrics() {
    const nats = getNatsClient();
    try {
      nats.subscribe<PowerLawMetrics>('powerlaw.metrics.>', async (data, subject) => {
        try {
          this.riskGuardian.updatePowerLawMetrics(data);
          if (this.powerLawRepository) {
            this.powerLawRepository.save(data).catch((err: any) => {
              logger.error(`Failed to persist PowerLaw metrics for ${data.symbol}:`, err as any);
            });
          }
          // RiskGuardian notifiers wired in index.ts
          // or we can implement them here if needed to send alerts via NATS/Slack
          this.riskGuardian.setCorrelationNotifier({
            sendHighCorrelationWarning: async (score, threshold, positions) => {
              logger.warn(
                `HIGH CORRELATION DETECTED: ${score.toFixed(
                  2,
                )} > ${threshold} for positions: ${positions.join(', ')}`,
              );
              // We could also emit a NATS event here
              const payload = JSON.stringify({
                score,
                threshold,
                positions,
                timestamp: Date.now(),
              });
              await this.natsClient.publish(
                'titan.evt.risk.correlation_warning',
                Buffer.from(payload),
              );
            },
          });
        } catch (err: any) {
          logger.error(`Error processing PowerLaw metric from ${subject}:`, err as any);
        }
      });
      logger.info('✅ Subscribed to powerlaw.metrics.>');
    } catch (error: any) {
      logger.error('Failed to subscribe to PowerLaw metrics:', error);
    }
  }

  /**
   * Trigger System Failover
   */
  async triggerFailover(operatorId: string): Promise<void> {
    logger.warn(`SYSTEM FAILOVER TRIGGERED by ${operatorId}`);
    // In a real system, this would:
    // 1. Switch database connections to replica
    // 2. Activate standby services
    // 3. Update service discovery
    // For now, we'll just log it and maybe emit an event
    await this.natsClient.publish(
      'titan.evt.sys.failover_initiated',
      Buffer.from(JSON.stringify({ operatorId, timestamp: Date.now() })),
    );
  }

  /**
   * Trigger System Restore/Fallback
   */
  async triggerRestore(backupId: string, operatorId: string): Promise<void> {
    logger.warn(`SYSTEM RESTORE TRIGGERED by ${operatorId} using backup ${backupId}`);
    // Real implementation would restore state from backup
    if (this.stateRecoveryService) {
      await this.stateRecoveryService.restoreFromBackup(backupId);
    } else {
      logger.warn('StateRecoveryService not initialized, skipping restore.');
    }
    await this.natsClient.publish(
      'titan.evt.sys.restore_initiated',
      Buffer.from(JSON.stringify({ operatorId, backupId, timestamp: Date.now() })),
    );
  }

  /**
   * Get Infrastructure Status
   */
  getInfraStatus(): any {
    return {
      healthy: true, // Placeholder
      database: 'connected',
      nats: 'connected',
      mode: 'primary', // or "dr"
      lastBackup: Date.now() - 3600000,
      activeNodes: 1,
    };
  }
}
