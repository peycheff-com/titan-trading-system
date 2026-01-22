import {
  BreakerAction,
  BreakerCheckInput,
  BreakerEvent,
  BreakerStatus,
  BreakerType,
  CircuitBreakerConfig,
  Position,
} from '../types/index.js';

/**
 * Interface for position closure callback
 * Allows external systems to handle position closure
 */
export interface PositionClosureHandler {
  closeAllPositions(): Promise<void>;
}

/**
 * Interface for notification callback
 * Allows external systems to send emergency notifications
 */
export interface NotificationHandler {
  sendEmergencyNotification(reason: string, equity: number): Promise<void>;
}

/**
 * Interface for event persistence
 * Allows external systems to persist breaker events
 */
export interface BreakerEventPersistence {
  persistEvent(event: BreakerEvent): Promise<void>;
}

/**
 * CircuitBreaker monitors for extreme conditions and triggers
 * emergency halt when thresholds are breached.
 *
 * Trigger conditions:
 * - Daily drawdown exceeds 15% (HARD)
 * - Equity drops below $150 (HARD)
 * - 3 consecutive losing trades within 1 hour (SOFT - 30 min cooldown)
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;

  /** Current breaker state */
  private active: boolean = false;
  private breakerType?: BreakerType;
  private triggerReason?: string;
  private triggeredAt?: number;
  private cooldownEndsAt?: number;

  /** Tracking state */
  private dailyStartEquity: number = 0;
  private recentLosses: Array<{ pnl: number; timestamp: number }> = [];
  private tripCount: number = 0;
  private lastTripTime?: number;

  /** State Persistence */
  private stateStore?: {
    save(key: string, value: string): Promise<void>;
    load(key: string): Promise<string | null>;
  };
  private readonly STATE_KEY = 'titan:brain:breaker:state';

  /** External handlers */
  private positionHandler?: PositionClosureHandler;
  private notificationHandler?: NotificationHandler;
  private eventPersistence?: BreakerEventPersistence;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Set the position closure handler
   */
  setPositionHandler(handler: PositionClosureHandler): void {
    // eslint-disable-next-line functional/immutable-data
    this.positionHandler = handler;
  }

  /**
   * Set the notification handler
   */
  setNotificationHandler(handler: NotificationHandler): void {
    // eslint-disable-next-line functional/immutable-data
    this.notificationHandler = handler;
  }

  /**
   * Set the event persistence handler
   */
  setEventPersistence(persistence: BreakerEventPersistence): void {
    // eslint-disable-next-line functional/immutable-data
    this.eventPersistence = persistence;
  }

  /**
   * Set the state store for persistence
   */
  setStateStore(store: {
    save(key: string, value: string): Promise<void>;
    load(key: string): Promise<string | null>;
  }): void {
    // eslint-disable-next-line functional/immutable-data
    this.stateStore = store;
  }

  /**
   * Persist current state
   */
  private async persistState(): Promise<void> {
    if (!this.stateStore) return;

    try {
      const state = {
        active: this.active,
        breakerType: this.breakerType,
        triggerReason: this.triggerReason,
        triggeredAt: this.triggeredAt,
        cooldownEndsAt: this.cooldownEndsAt,
        dailyStartEquity: this.dailyStartEquity,
        tripCount: this.tripCount,
        lastTripTime: this.lastTripTime,
        // We don't persist recentLosses to keep payload small, assuming acceptable loss on restart
      };
      await this.stateStore.save(this.STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to persist breaker state:', error);
    }
  }

  /**
   * Load state from persistence
   */
  async loadState(): Promise<void> {
    if (!this.stateStore) return;

    try {
      const data = await this.stateStore.load(this.STATE_KEY);
      if (data) {
        const state = JSON.parse(data);
        // eslint-disable-next-line functional/immutable-data
        this.active = state.active;
        // eslint-disable-next-line functional/immutable-data
        this.breakerType = state.breakerType;
        // eslint-disable-next-line functional/immutable-data
        this.triggerReason = state.triggerReason;
        // eslint-disable-next-line functional/immutable-data
        this.triggeredAt = state.triggeredAt;
        // eslint-disable-next-line functional/immutable-data
        this.cooldownEndsAt = state.cooldownEndsAt;
        // eslint-disable-next-line functional/immutable-data
        this.dailyStartEquity = state.dailyStartEquity;
        // eslint-disable-next-line functional/immutable-data
        this.tripCount = state.tripCount;
        // eslint-disable-next-line functional/immutable-data
        this.lastTripTime = state.lastTripTime;
        console.log('✅ Circuit Breaker state restored from persistence');
      }
    } catch (error) {
      console.error('Failed to load breaker state:', error);
    }
  }

  /**
   * Set daily start equity for drawdown calculation
   * Should be called at the start of each trading day
   */
  setDailyStartEquity(equity: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.dailyStartEquity = Math.max(0, equity);
  }

  /**
   * Get daily start equity
   */
  getDailyStartEquity(): number {
    return this.dailyStartEquity;
  }

  /**
   * Check all breaker conditions
   *
   * @param input - Breaker check input with equity, positions, and trade history
   * @returns Current breaker status
   */
  checkConditions(input: BreakerCheckInput): BreakerStatus {
    const { equity, positions, dailyStartEquity, recentTrades } = input;

    // Update daily start equity if provided
    if (dailyStartEquity > 0) {
      // eslint-disable-next-line functional/immutable-data
      this.dailyStartEquity = dailyStartEquity;
    }

    // Calculate daily drawdown
    const dailyDrawdown = this.calculateDailyDrawdown(equity);

    // Count consecutive losses within the time window
    const consecutiveLosses = this.countConsecutiveLosses(recentTrades);

    // Check for soft breaker cooldown expiry
    this.checkCooldownExpiry();

    // If already active with HARD breaker, maintain state
    if (this.active && this.breakerType === BreakerType.HARD) {
      return this.getStatus();
    }

    // Requirement 5.1: Daily drawdown exceeds 15%
    if (dailyDrawdown >= this.config.maxDailyDrawdown) {
      this.trigger(
        `Daily drawdown exceeded: ${(dailyDrawdown * 100).toFixed(2)}% >= ${(
          this.config.maxDailyDrawdown * 100
        ).toFixed(0)}%`,
      );
      return this.getStatus();
    }

    // Requirement 5.2: Equity below minimum
    if (equity < this.config.minEquity) {
      this.trigger(`Equity below minimum: $${equity.toFixed(2)} < $${this.config.minEquity}`);
      return this.getStatus();
    }

    // Requirement 5.3: Consecutive losses (soft pause)
    if (consecutiveLosses >= this.config.consecutiveLossLimit && !this.active) {
      this.triggerSoftPause(
        `${consecutiveLosses} consecutive losses within ${
          this.config.consecutiveLossWindow / 60000
        } minutes`,
      );
      return this.getStatus();
    }

    return {
      active: this.active,
      type: this.breakerType,
      action: this.calculateAction(),
      reason: this.triggerReason,
      triggeredAt: this.triggeredAt,
      dailyDrawdown,
      consecutiveLosses,
      equityLevel: equity,
      cooldownEndsAt: this.cooldownEndsAt,
      tripCount: this.tripCount,
      lastTripTime: this.lastTripTime,
    };
  }

  /**
   * Trigger the circuit breaker (HARD)
   * Requirement 5.4: Close all positions immediately
   * Requirement 5.5: Reject all new signals until manual reset
   *
   * @param reason - Reason for triggering
   */
  async trigger(reason: string): Promise<void> {
    // Requirement 5.4: Idempotence - don't create duplicate events
    if (this.active && this.breakerType === BreakerType.HARD) {
      return;
    }

    const timestamp = Date.now();

    // eslint-disable-next-line functional/immutable-data
    this.active = true;
    // eslint-disable-next-line functional/immutable-data
    this.breakerType = BreakerType.HARD;
    // eslint-disable-next-line functional/immutable-data
    this.triggerReason = reason;
    // eslint-disable-next-line functional/immutable-data
    this.triggeredAt = timestamp;
    // eslint-disable-next-line functional/immutable-data
    this.cooldownEndsAt = undefined;
    // eslint-disable-next-line functional/immutable-data
    this.tripCount++;
    // eslint-disable-next-line functional/immutable-data
    this.lastTripTime = timestamp;

    await this.persistState();

    // Requirement 5.4: Close all open positions immediately
    if (this.positionHandler) {
      try {
        await this.positionHandler.closeAllPositions();
      } catch (error) {
        // Log error but don't prevent breaker activation
        console.error('Failed to close positions during circuit breaker trigger:', error);
      }
    }

    // Requirement 5.6: Send emergency notifications
    if (this.notificationHandler) {
      try {
        await this.notificationHandler.sendEmergencyNotification(reason, this.dailyStartEquity);
      } catch (error) {
        console.error('Failed to send emergency notification:', error);
      }
    }

    // Requirement 5.7: Log the event
    const event: BreakerEvent = {
      timestamp,
      eventType: 'TRIGGER',
      breakerType: BreakerType.HARD,
      reason,
      equity: this.dailyStartEquity,
      metadata: {
        dailyDrawdown: this.calculateDailyDrawdown(this.dailyStartEquity),
      },
    };

    if (this.eventPersistence) {
      try {
        await this.eventPersistence.persistEvent(event);
      } catch (error) {
        console.error('Failed to persist breaker event:', error);
      }
    }
  }

  /**
   * Trigger a soft pause (cooldown period)
   * Requirement 5.3: 30 minute cooldown for consecutive losses
   *
   * @param reason - Reason for soft pause
   */
  private async triggerSoftPause(reason: string): Promise<void> {
    // Don't downgrade from HARD to SOFT
    if (this.active && this.breakerType === BreakerType.HARD) {
      return;
    }

    // Idempotence for SOFT breaker
    if (this.active && this.breakerType === BreakerType.SOFT) {
      return;
    }

    const timestamp = Date.now();

    // eslint-disable-next-line functional/immutable-data
    this.active = true;
    // eslint-disable-next-line functional/immutable-data
    this.breakerType = BreakerType.SOFT;
    // eslint-disable-next-line functional/immutable-data
    this.triggerReason = reason;
    // eslint-disable-next-line functional/immutable-data
    this.triggeredAt = timestamp;
    // eslint-disable-next-line functional/immutable-data
    this.cooldownEndsAt = timestamp + this.config.cooldownMinutes * 60 * 1000;
    // eslint-disable-next-line functional/immutable-data
    this.tripCount++;
    // eslint-disable-next-line functional/immutable-data
    this.lastTripTime = timestamp;

    await this.persistState();

    // Log the event
    const event: BreakerEvent = {
      timestamp,
      eventType: 'TRIGGER',
      breakerType: BreakerType.SOFT,
      reason,
      equity: this.dailyStartEquity,
      metadata: {
        cooldownMinutes: this.config.cooldownMinutes,
        cooldownEndsAt: this.cooldownEndsAt,
      },
    };

    if (this.eventPersistence) {
      try {
        await this.eventPersistence.persistEvent(event);
      } catch (error) {
        console.error('Failed to persist soft pause event:', error);
      }
    }
  }

  /**
   * Reset the circuit breaker (manual reset)
   * Requirement 5.8: Require confirmation and log operator identity
   *
   * @param operatorId - ID of the operator performing the reset
   */
  async reset(operatorId: string): Promise<void> {
    if (!this.active) {
      return;
    }

    if (!operatorId || operatorId.trim() === '') {
      throw new Error('Operator ID is required for circuit breaker reset');
    }

    const timestamp = Date.now();
    const previousReason = this.triggerReason;
    const previousType = this.breakerType;

    // Reset state
    // eslint-disable-next-line functional/immutable-data
    this.active = false;
    // eslint-disable-next-line functional/immutable-data
    this.breakerType = undefined;
    // eslint-disable-next-line functional/immutable-data
    this.triggerReason = undefined;
    // eslint-disable-next-line functional/immutable-data
    this.triggeredAt = undefined;
    // eslint-disable-next-line functional/immutable-data
    this.cooldownEndsAt = undefined;

    await this.persistState();

    // Requirement 5.8: Log the reset with operator identity
    const event: BreakerEvent = {
      timestamp,
      eventType: 'RESET',
      reason: `Manual reset by operator: ${operatorId}`,
      equity: this.dailyStartEquity,
      operatorId,
      metadata: {
        previousReason,
        previousType,
      },
    };

    if (this.eventPersistence) {
      try {
        await this.eventPersistence.persistEvent(event);
      } catch (error) {
        console.error('Failed to persist reset event:', error);
      }
    }
  }

  /**
   * Check if circuit breaker is active
   * Requirement 5.5: Reject all new signals until manual reset
   */
  isActive(): boolean {
    // Check for soft breaker cooldown expiry
    this.checkCooldownExpiry();
    return this.active;
  }

  /**
   * Get current breaker status
   */
  getStatus(): BreakerStatus {
    // Check for soft breaker cooldown expiry
    this.checkCooldownExpiry();

    return {
      active: this.active,
      type: this.breakerType,
      action: this.calculateAction(),
      reason: this.triggerReason,
      triggeredAt: this.triggeredAt,
      dailyDrawdown: this.calculateDailyDrawdown(this.dailyStartEquity),
      consecutiveLosses: this.recentLosses.length,
      equityLevel: this.dailyStartEquity,
      cooldownEndsAt: this.cooldownEndsAt,
      tripCount: this.tripCount,
      lastTripTime: this.lastTripTime,
    };
  }

  /**
   * Record a trade result for consecutive loss tracking
   *
   * @param pnl - Trade PnL (positive = profit, negative = loss)
   * @param timestamp - Trade timestamp
   */
  recordTrade(pnl: number, timestamp?: number): void {
    const tradeTime = timestamp ?? Date.now();

    // Add to recent losses tracking
    // eslint-disable-next-line functional/immutable-data
    this.recentLosses.push({ pnl, timestamp: tradeTime });

    // Clean up old trades outside the window
    const windowStart = tradeTime - this.config.consecutiveLossWindow;
    // eslint-disable-next-line functional/immutable-data
    this.recentLosses = this.recentLosses.filter((t) => t.timestamp >= windowStart);

    // If profitable trade, reset consecutive loss counter
    if (pnl >= 0) {
      // eslint-disable-next-line functional/immutable-data
      this.recentLosses = this.recentLosses.filter(
        (t) => t.pnl < 0 && t.timestamp > tradeTime - this.config.consecutiveLossWindow,
      );
    }
  }

  /**
   * Get configuration
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  // ============ Private Helper Methods ============

  /**
   * Calculate daily drawdown percentage
   */
  private calculateDailyDrawdown(currentEquity: number): number {
    if (this.dailyStartEquity <= 0) {
      return 0;
    }

    const drawdown = (this.dailyStartEquity - currentEquity) / this.dailyStartEquity;
    return Math.max(0, drawdown);
  }

  /**
   * Count consecutive losses within the time window
   */
  private countConsecutiveLosses(recentTrades: Array<{ pnl: number; timestamp: number }>): number {
    if (recentTrades.length === 0) {
      return 0;
    }

    const now = Date.now();
    const windowStart = now - this.config.consecutiveLossWindow;

    // Filter trades within the window and sort by timestamp (most recent first)
    const tradesInWindow = recentTrades
      .filter((t) => t.timestamp >= windowStart)
      .sort((a, b) => b.timestamp - a.timestamp);

    // Count consecutive losses from most recent
    // eslint-disable-next-line functional/no-let
    let consecutiveLosses = 0;
    for (const trade of tradesInWindow) {
      if (trade.pnl < 0) {
        consecutiveLosses++;
      } else {
        break; // Stop counting at first profitable trade
      }
    }

    return consecutiveLosses;
  }

  /**
   * Check if soft breaker cooldown has expired
   */
  private checkCooldownExpiry(): void {
    if (
      this.active &&
      this.breakerType === BreakerType.SOFT &&
      this.cooldownEndsAt &&
      Date.now() >= this.cooldownEndsAt
    ) {
      // Auto-reset soft breaker after cooldown
      // eslint-disable-next-line functional/immutable-data
      this.active = false;
      // eslint-disable-next-line functional/immutable-data
      this.breakerType = undefined;
      // eslint-disable-next-line functional/immutable-data
      this.triggerReason = undefined;
      // eslint-disable-next-line functional/immutable-data
      this.triggeredAt = undefined;
      // eslint-disable-next-line functional/immutable-data
      this.triggeredAt = undefined;
      // eslint-disable-next-line functional/immutable-data
      this.cooldownEndsAt = undefined;
      this.persistState().catch((err) => console.error('Failed to persist state check', err));
    }
  }
  /**
   * Determine the current breaker action based on state
   */
  private calculateAction(): BreakerAction {
    if (!this.active) {
      return BreakerAction.NONE;
    }

    switch (this.breakerType) {
      case BreakerType.HARD:
      case BreakerType.EMERGENCY_SHUTDOWN:
      case BreakerType.SYSTEM_FREEZE:
        return BreakerAction.FULL_HALT;

      case BreakerType.SOFT:
      case BreakerType.ENTRY_FREEZE:
        return BreakerAction.ENTRY_PAUSE;

      default:
        return BreakerAction.NONE;
    }
  }
}
