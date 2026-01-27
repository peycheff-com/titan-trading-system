import {
  getNatsClient,
  IntentSignal,
  PhaseBudget,
  SignalClient,
  TitanSubject,
} from '@titan/shared';
import { Logger } from '../../logging/Logger.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import { EventEmitter } from '../../events/EventEmitter.js';
import { BybitPerpsClient } from '../../exchanges/BybitPerpsClient.js';
import { TrapStateManager } from './TrapStateManager.js';
import { PositionSizeCalculator } from '../../calculators/PositionSizeCalculator.js';
import { VelocityCalculator } from '../../calculators/VelocityCalculator.js';
import { CVDCalculator } from '../../calculators/CVDCalculator.js';
import { LeadLagDetector } from '../../calculators/LeadLagDetector.js';
import { Tripwire } from '../../types/index.js';
import { CvdValidator } from '../strategies/CvdValidator.js';
import { TrendValidator } from '../strategies/TrendValidator.js';
import { ExecutionStrategy } from '../strategies/ExecutionStrategy.js';

interface TrapExecutorDependencies {
  logger: Logger;
  config: ConfigManager;
  eventEmitter: EventEmitter;
  bybitClient: BybitPerpsClient | null;
  stateManager: TrapStateManager;
  signalClient: SignalClient;
  positionSizeCalculator: PositionSizeCalculator;
  velocityCalculator: VelocityCalculator;
  cvdCalculator: CVDCalculator;
  leadLagDetector: LeadLagDetector;
}

/**
 * TrapExecutor (The Bite)
 *
 * Handles execution logic, position sizing, and communicating with the Execution Service.
 */
export class TrapExecutor {
  private logger: Logger;
  private config: ConfigManager;
  private eventEmitter: EventEmitter;
  private bybitClient: BybitPerpsClient | null;
  private stateManager: TrapStateManager;

  private positionSizeCalculator: PositionSizeCalculator;
  private velocityCalculator: VelocityCalculator;
  private cvdCalculator: CVDCalculator;
  private leadLagDetector: LeadLagDetector;
  private signalClient: SignalClient;

  private cvdValidator: CvdValidator;
  private trendValidator: TrendValidator;
  private executionStrategy: ExecutionStrategy;

  private cachedEquity: number = 0;
  private readonly brainUrl: string;

  constructor(dependencies: TrapExecutorDependencies) {
    this.logger = dependencies.logger;
    this.config = dependencies.config;
    this.eventEmitter = dependencies.eventEmitter;
    this.bybitClient = dependencies.bybitClient;
    this.stateManager = dependencies.stateManager;
    this.signalClient = dependencies.signalClient;
    this.positionSizeCalculator = dependencies.positionSizeCalculator;
    this.velocityCalculator = dependencies.velocityCalculator;
    this.cvdCalculator = dependencies.cvdCalculator;
    this.leadLagDetector = dependencies.leadLagDetector;

    // Initialize Strategies
    this.cvdValidator = new CvdValidator(this.cvdCalculator, this.logger);
    this.trendValidator = new TrendValidator(this.velocityCalculator, this.logger);
    this.executionStrategy = new ExecutionStrategy(this.logger);

    // Listen to budget updates
    this.setupBudgetListener();
    this.brainUrl = process.env.TITAN_BRAIN_URL || 'http://localhost:3000';
  }

  getCachedEquity(): number {
    return this.cachedEquity;
  }

  /**
   * Setup Budget Listener (Truth Layer Integration)
   */
  private async setupBudgetListener(): Promise<void> {
    const nats = getNatsClient();
    if (!nats.isConnected()) {
      try {
        await nats.connect();
      } catch (e) {
        this.logger.error('Failed to connect NATS for Budget Listener', e as Error, undefined, {
          error: e,
        });
      }
    }

    nats.subscribe<PhaseBudget>(TitanSubject.EVT_BUDGET_UPDATE, (budget: PhaseBudget) => {
      if (budget.phaseId === 'phase1') {
        this.cachedEquity = budget.maxNotional;
        if (Math.random() < 0.05) {
          this.logger.info(
            `💰 Budget Updated: $${this.cachedEquity.toFixed(2)} (State: ${budget.state})`,
          );
        }
      }
    });

    this.logger.info('✅ Subscribed to Budget Updates');
  }

  /**
   * EXECUTION LAYER (The Bite)
   */
  async fire(trap: Tripwire, microCVD?: number, burstVolume?: number): Promise<void> {
    let signalId: string | undefined;

    try {
      if (!this.checkCooldowns(trap)) return;

      // 1. STRATEGY VALIDATION
      const cvdResult = await this.cvdValidator.validate(trap, microCVD, burstVolume);
      if (!cvdResult.isValid) return;

      const trendResult = await this.trendValidator.validate(trap);
      if (!trendResult.isValid) return;

      // Mark trap as activated
      trap.activated = true;
      trap.activatedAt = Date.now();
      this.stateManager.setLastActivationTime(trap.symbol, Date.now());

      this.logger.info(`🔥 FIRING TRAP: ${trap.symbol} ${trap.trapType}`);

      // 2. MARKET STATE
      const bybitPrice = this.bybitClient
        ? await this.bybitClient.getCurrentPrice(trap.symbol)
        : trap.triggerPrice;
      const velocity = this.velocityCalculator.calcVelocity(trap.symbol);
      const leaderStatus = this.leadLagDetector.getLeader(trap.symbol);

      this.logger.info(`   🏁 Lead/Lag Status: ${leaderStatus} leads`);

      // 3. EXECUTION PARAMS
      const { orderType, limitPrice, maxSlippageBps } =
        this.executionStrategy.determineExecutionParams(
          trap,
          this.config.getConfig(),
          bybitPrice,
          velocity,
          leaderStatus as 'BYBIT' | 'BINANCE' | 'EQUAL',
        );

      // 4. POSITION SIZING
      const config = this.config.getConfig();
      const positionSize = PositionSizeCalculator.calcPositionSize({
        equity: this.cachedEquity,
        confidence: trap.confidence,
        leverage: trap.leverage,
        stopLossPercent: config.stopLossPercent || 0.01,
        targetPercent: config.targetPercent || 0.03,
        maxPositionSizePercent: config.maxPositionSizePercent || 0.5,
      });

      // Adaptive Sizing
      const volMultiplier = trap.volatilityMetrics?.positionSizeMultiplier || 1;
      const adjustedPositionSize = positionSize * volMultiplier;

      if (volMultiplier !== 1) {
        this.logger.info(
          `   📉 Volatility Adjustment: Size scaled by ${volMultiplier.toFixed(
            2,
          )}x -> ${adjustedPositionSize.toFixed(4)}`,
        );
      }

      // 5. RISK PARAMETERS
      const stopLossPercent = config.stopLossPercent || 0.01;
      const targetPercent = config.targetPercent || 0.03;

      const stopLoss =
        trap.stopLoss ||
        (trap.direction === 'LONG'
          ? bybitPrice * (1 - stopLossPercent)
          : bybitPrice * (1 + stopLossPercent));

      const target =
        trap.targetPrice ||
        (trap.direction === 'LONG'
          ? bybitPrice * (1 + targetPercent)
          : bybitPrice * (1 - targetPercent));

      // 6. PAYLOAD CONSTRUCTION
      const payload = this.buildPayload(
        trap,
        positionSize,
        bybitPrice,
        limitPrice,
        maxSlippageBps,
        velocity,
        orderType,
        stopLoss,
        target,
      );

      // Ghost Mode
      if (config.ghostMode) {
        this.logger.info(`👻 GHOST MODE ACTIVE: Skipping Brain execution for ${trap.symbol}`);
        return;
      }

      // FINAL VALIDATION BEFORE DISPATCH
      if (!this.isTrapStillValid(trap)) {
        this.logger.warn(`🛑 PRE-FLIGHT VETO: Trap invalidated before dispatch for ${trap.symbol}`);
        return;
      }

      // 7. EXECUTION
      signalId = payload.signal_id;
      if (!signalId) throw new Error('Signal ID missing');
      await this.dispatchToBrain(trap, payload, signalId, bybitPrice);
    } catch (error) {
      this.logger.error(`❌ Trap execution error: ${trap.symbol}`, error as Error, signalId);
      trap.activated = false;
      trap.activatedAt = undefined;
    }
  }

  private checkCooldowns(trap: Tripwire): boolean {
    const lastActive = this.stateManager.getLastActivationTime(trap.symbol);
    if (Date.now() - lastActive < 1000) {
      this.logger.info(`   ⏳ Cooldown active for ${trap.symbol}, skipping...`);
      return false;
    }
    if (trap.activated) {
      this.logger.warn(`⚠️ Trap already activated: ${trap.symbol}`);
      return false;
    }
    const timeSinceActivation = Date.now() - (trap.activatedAt || 0);
    if (trap.activatedAt && timeSinceActivation < 300000) {
      this.logger.warn(
        `⚠️ Trap cooldown: ${trap.symbol} (${Math.floor(timeSinceActivation / 1000)}s ago)`,
      );
      return false;
    }
    return true;
  }

  private async dispatchToBrain(trap: Tripwire, payload: any, signalId: string, fillPrice: number) {
    try {
      this.logger.info(`   🧠 Dispatching to Brain via NATS...`, signalId);

      const intent: IntentSignal = {
        signal_id: payload.signal_id,
        source: 'scavenger',
        symbol: payload.symbol as string,
        direction: (payload.direction as string) === 'LONG' ? 'LONG' : 'SHORT',
        entry_zone: {
          min: (payload.entry_price as number) * 0.999,
          max: (payload.entry_price as number) * 1.001,
        },
        stop_loss: payload.stop_loss as number,
        take_profits: payload.take_profit as number[],
        confidence: payload.confidence as number,
        leverage: payload.leverage as number,
        timestamp: payload.timestamp as number,
        // Envelope Standards (Phase 1 Hardening)
        env: process.env.NODE_ENV || 'development',
        subject: `market.${trap.symbol.toLowerCase().replace('/', '')}.signal`,
        ttl_ms: 5000, // 5s validity
        causation_id: payload.signal_id, // Self-caused for now, or trigger event ID
        partition_key: trap.symbol,
      };

      await this.signalClient.sendPrepare(intent);
      const confirmResponse = await this.signalClient.sendConfirm(signalId);

      if (!confirmResponse.executed) {
        throw new Error(`Brain rejected signal: ${confirmResponse.reason}`);
      }

      this.stateManager.resetFailedAttempts(trap.symbol);
      this.eventEmitter.emit('EXECUTION_COMPLETE', {
        signal_id: signalId,
        symbol: trap.symbol,
        trapType: trap.trapType,
        fillPrice: fillPrice,
        routedTo: 'Brain/NATS',
      });
    } catch (error) {
      this.logger.error(`❌ Brain dispatch failed: ${trap.symbol}`, error as Error, signalId);
      this.handleFailure(trap.symbol);
      this.eventEmitter.emit('TRAP_ABORTED', {
        signal_id: signalId,
        symbol: trap.symbol,
        reason: 'brain_dispatch_failed',
      });
      trap.activated = false;
      trap.activatedAt = undefined;
    }
  }

  private isTrapStillValid(trap: Tripwire): boolean {
    if (!trap.activated) return false;

    const currentPrice = this.velocityCalculator.getLastPrice(trap.symbol);
    if (!currentPrice) return false;

    const priceDistance = Math.abs(currentPrice - trap.triggerPrice) / trap.triggerPrice;
    if (priceDistance > 0.001) return false;

    const volumeCounter = this.stateManager.getVolumeCounter(trap.symbol);
    if (!volumeCounter) return false;

    const timeSinceVolumeStart = Date.now() - volumeCounter.startTime;
    if (timeSinceVolumeStart > 200) return false;

    return true;
  }

  private handleFailure(symbol: string): void {
    const failures = this.stateManager.incrementFailedAttempts(symbol);
    if (failures >= 3) {
      this.logger.warn(`   ⛔ BLACKLISTING ${symbol} for 5 minutes`);
      this.stateManager.blacklistSymbol(symbol, Date.now() + 300000);
      this.stateManager.resetFailedAttempts(symbol);

      this.eventEmitter.emit('SYMBOL_BLACKLISTED', {
        symbol,
        reason: 'too_many_failures',
        durationMs: 300000,
      });
    }
  }
  private buildPayload(
    trap: Tripwire,
    size: number,
    bybitPrice: number,
    limitPrice: number | undefined,
    maxSlippageBps: number,
    velocity: number,
    orderType: string,
    stopLoss: number,
    target: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    return {
      signal_id: `scavenger-${trap.symbol}-${Date.now()}`,
      symbol: trap.symbol,
      direction: trap.direction,
      size: size,
      entry_price: limitPrice || bybitPrice,
      stop_loss: stopLoss,
      take_profit: [target],
      leverage: trap.leverage,
      confidence: trap.confidence,
      trap_type: trap.trapType,
      timestamp: Date.now(),
      metadata: {
        source: 'scavenger',
        velocity,
        max_slippage_bps: maxSlippageBps,
        order_type: orderType,
        entry_zone_min: limitPrice ? limitPrice * 0.999 : bybitPrice * 0.999,
        entry_zone_max: limitPrice ? limitPrice * 1.001 : bybitPrice * 1.001,
      },
    };
  }
}
