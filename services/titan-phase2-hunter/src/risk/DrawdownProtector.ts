/**
 * Drawdown Protector for Titan Phase 2 - The Hunter
 *
 * Provides automatic drawdown protection to preserve capital during adverse conditions:
 * - Daily drawdown thresholds: 3%, 5%, 7%
 * - Weekly drawdown threshold: 10%
 * - Consecutive loss protection: 3 trades
 * - Win rate monitoring: 40% threshold over 20 trades
 * - Emergency flatten at 7% drawdown
 *
 * Requirements: 15.1-15.7 (Drawdown Protection)
 */

import { EventEmitter } from 'events';
import { BybitPerpsClient } from '../exchanges/BybitPerpsClient';
import { Position } from '../types';
import { getLogger } from '../logging/Logger';

export interface DrawdownProtectorConfig {
  dailyDrawdownThresholds: {
    level1: number; // 3% - reduce position sizes by 50%
    level2: number; // 5% - halt new entries
    level3: number; // 7% - emergency flatten
  };
  weeklyDrawdownThreshold: number; // 10% - reduce max leverage
  consecutiveLossThreshold: number; // 3 trades
  consecutiveLossReduction: number; // 30% position size reduction
  winRateThreshold: number; // 40% over 20 trades
  winRateTradeCount: number; // 20 trades for win rate calculation
  emergencyPauseDuration: number; // 24 hours in milliseconds
  leverageReduction: {
    from: number; // 5x
    to: number; // 3x
  };
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  isWin: boolean;
  timestamp: number;
}

export interface DrawdownState {
  currentEquity: number;
  startOfDayEquity: number;
  startOfWeekEquity: number;
  dailyDrawdown: number; // Percentage
  weeklyDrawdown: number; // Percentage
  maxDailyDrawdown: number;
  maxWeeklyDrawdown: number;
  consecutiveLosses: number;
  recentTrades: TradeRecord[];
  winRate: number;
  isEmergencyPaused: boolean;
  emergencyPauseUntil: number;
  positionSizeReduction: number; // Multiplier (0.5 = 50% reduction)
  maxLeverageReduction: boolean;
  lastUpdate: number;
}

export interface DrawdownProtectorEvents {
  'drawdown:level1': (state: DrawdownState) => void; // 3% - reduce position sizes
  'drawdown:level2': (state: DrawdownState) => void; // 5% - halt new entries
  'drawdown:level3': (state: DrawdownState) => void; // 7% - emergency flatten
  'drawdown:weekly': (state: DrawdownState) => void; // 10% - reduce leverage
  'consecutive:losses': (state: DrawdownState, count: number) => void;
  'strategy:degradation': (state: DrawdownState, winRate: number) => void;
  'emergency:paused': (state: DrawdownState, duration: number) => void;
  'emergency:resumed': (state: DrawdownState) => void;
  'protection:activated': (state: DrawdownState, action: string) => void;
}

export class DrawdownProtector extends EventEmitter {
  private config: DrawdownProtectorConfig;
  private bybitClient: BybitPerpsClient;
  private state: DrawdownState;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_FREQUENCY = 30000; // 30 seconds

  constructor(bybitClient: BybitPerpsClient, config?: Partial<DrawdownProtectorConfig>) {
    super();

    this.bybitClient = bybitClient;
    this.config = {
      dailyDrawdownThresholds: {
        level1: 0.03, // 3%
        level2: 0.05, // 5%
        level3: 0.07, // 7%
      },
      weeklyDrawdownThreshold: 0.1, // 10%
      consecutiveLossThreshold: 3,
      consecutiveLossReduction: 0.3, // 30% reduction
      winRateThreshold: 0.4, // 40%
      winRateTradeCount: 20,
      emergencyPauseDuration: 24 * 60 * 60 * 1000, // 24 hours
      leverageReduction: {
        from: 5,
        to: 3,
      },
      ...config,
    };

    // Initialize state
    this.state = {
      currentEquity: 0,
      startOfDayEquity: 0,
      startOfWeekEquity: 0,
      dailyDrawdown: 0,
      weeklyDrawdown: 0,
      maxDailyDrawdown: 0,
      maxWeeklyDrawdown: 0,
      consecutiveLosses: 0,
      recentTrades: [],
      winRate: 0,
      isEmergencyPaused: false,
      emergencyPauseUntil: 0,
      positionSizeReduction: 1.0, // No reduction initially
      maxLeverageReduction: false,
      lastUpdate: Date.now(),
    };

    this.startMonitoring();
  }

  /**
   * Check daily drawdown and apply protection measures
   * @param currentEquity - Current account equity
   * @returns Protection action taken
   */
  public async checkDailyDrawdown(currentEquity: number): Promise<string | null> {
    try {
      // Update current equity
      // eslint-disable-next-line functional/immutable-data
      this.state.currentEquity = currentEquity;

      // Reset daily tracking if new day
      const now = new Date();
      const lastUpdate = new Date(this.state.lastUpdate);

      if (
        now.getDate() !== lastUpdate.getDate() ||
        now.getMonth() !== lastUpdate.getMonth() ||
        now.getFullYear() !== lastUpdate.getFullYear()
      ) {
        // eslint-disable-next-line functional/immutable-data
        this.state.startOfDayEquity = currentEquity; // Use the parameter, not the state
        // eslint-disable-next-line functional/immutable-data
        this.state.dailyDrawdown = 0;
        getLogger().info(
          `📅 New day detected. Reset daily equity baseline: ${currentEquity.toFixed(2)} USDT`
        );
      }

      // Calculate daily drawdown
      if (this.state.startOfDayEquity > 0) {
        // eslint-disable-next-line functional/immutable-data
        this.state.dailyDrawdown =
          (this.state.startOfDayEquity - currentEquity) / this.state.startOfDayEquity;
        // eslint-disable-next-line functional/immutable-data
        this.state.maxDailyDrawdown = Math.max(
          this.state.maxDailyDrawdown,
          this.state.dailyDrawdown
        );
      }

      const drawdownPercent = this.state.dailyDrawdown * 100;

      // Check thresholds (in order of severity)
      if (this.state.dailyDrawdown >= this.config.dailyDrawdownThresholds.level3) {
        // Level 3: 7% - Emergency flatten and pause
        if (!this.state.isEmergencyPaused) {
          getLogger().error(
            `🚨 CRITICAL: Daily drawdown ${drawdownPercent.toFixed(2)}% >= 7%. Emergency flatten triggered!`
          );

          // eslint-disable-next-line functional/immutable-data
          this.state.isEmergencyPaused = true;
          // eslint-disable-next-line functional/immutable-data
          this.state.emergencyPauseUntil = Date.now() + this.config.emergencyPauseDuration;

          this.emit('drawdown:level3', this.state);
          this.emit('emergency:paused', this.state, this.config.emergencyPauseDuration);
          this.logProtectionEvent('EMERGENCY_FLATTEN', drawdownPercent);

          return 'EMERGENCY_FLATTEN';
        }
      } else if (this.state.dailyDrawdown >= this.config.dailyDrawdownThresholds.level2) {
        // Level 2: 5% - Halt new entries
        getLogger().warn(
          `⚠️ WARNING: Daily drawdown ${drawdownPercent.toFixed(2)}% >= 5%. Halting new entries.`
        );

        this.emit('drawdown:level2', this.state);
        this.logProtectionEvent('HALT_NEW_ENTRIES', drawdownPercent);

        return 'HALT_NEW_ENTRIES';
      } else if (this.state.dailyDrawdown >= this.config.dailyDrawdownThresholds.level1) {
        // Level 1: 3% - Reduce position sizes by 50%
        if (this.state.positionSizeReduction === 1.0) {
          getLogger().warn(
            `⚠️ WARNING: Daily drawdown ${drawdownPercent.toFixed(2)}% >= 3%. Reducing position sizes by 50%.`
          );

          // eslint-disable-next-line functional/immutable-data
          this.state.positionSizeReduction = 0.5;
          this.emit('drawdown:level1', this.state);
          this.logProtectionEvent('REDUCE_POSITION_SIZES', drawdownPercent);

          return 'REDUCE_POSITION_SIZES';
        }
      } else {
        // Reset position size reduction if drawdown improves
        if (this.state.positionSizeReduction < 1.0) {
          // eslint-disable-next-line functional/immutable-data
          this.state.positionSizeReduction = 1.0;
          getLogger().info(
            `✅ Daily drawdown improved to ${drawdownPercent.toFixed(2)}%. Position size reduction lifted.`
          );
        }
      }

      return null;
    } catch (error) {
      getLogger().error(`❌ Error checking daily drawdown:`, error as Error);
      return null;
    }
  }

  /**
   * Check weekly drawdown and apply leverage reduction
   * @param currentEquity - Current account equity
   * @returns Protection action taken
   */
  public async checkWeeklyDrawdown(currentEquity: number): Promise<string | null> {
    try {
      // Update current equity
      // eslint-disable-next-line functional/immutable-data
      this.state.currentEquity = currentEquity;

      // Reset weekly tracking if new week
      const now = new Date();
      const lastUpdate = new Date(this.state.lastUpdate);
      const nowWeek = this.getWeekNumber(now);
      const lastWeek = this.getWeekNumber(lastUpdate);

      if (nowWeek !== lastWeek) {
        // eslint-disable-next-line functional/immutable-data
        this.state.startOfWeekEquity = currentEquity; // Use the parameter, not the state
        // eslint-disable-next-line functional/immutable-data
        this.state.weeklyDrawdown = 0;
        // eslint-disable-next-line functional/immutable-data
        this.state.maxLeverageReduction = false;
        getLogger().info(
          `📅 New week detected. Reset weekly equity baseline: ${currentEquity.toFixed(2)} USDT`
        );
      }

      // Calculate weekly drawdown
      if (this.state.startOfWeekEquity > 0) {
        // eslint-disable-next-line functional/immutable-data
        this.state.weeklyDrawdown =
          (this.state.startOfWeekEquity - currentEquity) / this.state.startOfWeekEquity;
        // eslint-disable-next-line functional/immutable-data
        this.state.maxWeeklyDrawdown = Math.max(
          this.state.maxWeeklyDrawdown,
          this.state.weeklyDrawdown
        );
      }

      const drawdownPercent = this.state.weeklyDrawdown * 100;

      // Check weekly threshold
      if (
        this.state.weeklyDrawdown >= this.config.weeklyDrawdownThreshold &&
        !this.state.maxLeverageReduction
      ) {
        getLogger().warn(
          `⚠️ WARNING: Weekly drawdown ${drawdownPercent.toFixed(2)}% >= 10%. Reducing max leverage from ${this.config.leverageReduction.from}x to ${this.config.leverageReduction.to}x.`
        );

        // eslint-disable-next-line functional/immutable-data
        this.state.maxLeverageReduction = true;
        this.emit('drawdown:weekly', this.state);
        this.logProtectionEvent('REDUCE_MAX_LEVERAGE', drawdownPercent);

        return 'REDUCE_MAX_LEVERAGE';
      }

      return null;
    } catch (error) {
      getLogger().error(`❌ Error checking weekly drawdown:`, error as Error);
      return null;
    }
  }

  /**
   * Check for consecutive losses and apply position size reduction
   * @param trades - Recent trade records
   * @returns Protection action taken
   */
  public checkConsecutiveLosses(trades: TradeRecord[]): string | null {
    try {
      // Sort trades by timestamp (most recent first)
      // eslint-disable-next-line functional/immutable-data
      const sortedTrades = trades.sort((a, b) => b.timestamp - a.timestamp);

      // Count consecutive losses from most recent trades
      // eslint-disable-next-line functional/no-let
      let consecutiveLosses = 0;
      for (const trade of sortedTrades) {
        if (!trade.isWin) {
          consecutiveLosses++;
        } else {
          break; // Stop at first win
        }
      }

      // eslint-disable-next-line functional/immutable-data
      this.state.consecutiveLosses = consecutiveLosses;

      // Check threshold
      if (consecutiveLosses >= this.config.consecutiveLossThreshold) {
        getLogger().warn(
          `⚠️ WARNING: ${consecutiveLosses} consecutive losses detected. Reducing position sizes by ${this.config.consecutiveLossReduction * 100}% for next 3 trades.`
        );

        // Apply additional reduction for consecutive losses
        const reductionMultiplier = 1 - this.config.consecutiveLossReduction;
        // eslint-disable-next-line functional/immutable-data
        this.state.positionSizeReduction = Math.min(
          this.state.positionSizeReduction,
          reductionMultiplier
        );

        this.emit('consecutive:losses', this.state, consecutiveLosses);
        this.logProtectionEvent('CONSECUTIVE_LOSSES', consecutiveLosses);

        return 'CONSECUTIVE_LOSSES';
      }

      return null;
    } catch (error) {
      getLogger().error(`❌ Error checking consecutive losses:`, error as Error);
      return null;
    }
  }

  /**
   * Check win rate over last 20 trades and emit warning if below 40%
   * @param trades - Recent trade records
   * @returns Protection action taken
   */
  public checkWinRate(trades: TradeRecord[]): string | null {
    try {
      // Get last N trades for win rate calculation
      // eslint-disable-next-line functional/immutable-data
      const recentTrades = trades
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, this.config.winRateTradeCount);

      if (recentTrades.length < this.config.winRateTradeCount) {
        // Not enough trades for meaningful win rate calculation
        return null;
      }

      // Calculate win rate
      const wins = recentTrades.filter(trade => trade.isWin).length;
      const winRate = wins / recentTrades.length;
      // eslint-disable-next-line functional/immutable-data
      this.state.winRate = winRate;

      // Check threshold
      if (winRate < this.config.winRateThreshold) {
        getLogger().warn(
          `⚠️ STRATEGY DEGRADATION: Win rate ${(winRate * 100).toFixed(1)}% < ${this.config.winRateThreshold * 100}% over last ${recentTrades.length} trades. Parameter review suggested.`
        );

        this.emit('strategy:degradation', this.state, winRate);
        this.logProtectionEvent('STRATEGY_DEGRADATION', winRate * 100);

        return 'STRATEGY_DEGRADATION';
      }

      return null;
    } catch (error) {
      getLogger().error(`❌ Error checking win rate:`, error as Error);
      return null;
    }
  }

  /**
   * Emergency flatten all positions and pause trading
   * @param positions - All open positions
   * @returns Promise with success status
   */
  public async emergencyFlatten(positions: Position[]): Promise<boolean> {
    try {
      getLogger().warn(`🚨 EMERGENCY FLATTEN: Closing ${positions.length} positions`);

      // eslint-disable-next-line functional/no-let
      let successCount = 0;
      // eslint-disable-next-line functional/no-let
      let failCount = 0;

      // Close all positions with market orders
      for (const position of positions) {
        try {
          const orderParams = {
            phase: 'phase2' as const,
            symbol: position.symbol,
            side: position.side === 'LONG' ? ('Sell' as const) : ('Buy' as const),
            type: 'MARKET' as const,
            qty: position.quantity,
            leverage: position.leverage,
          };

          const result = await this.bybitClient.placeOrderWithRetry(orderParams);

          if (result.status === 'FILLED') {
            successCount++;
            getLogger().info(`✅ Emergency closed: ${position.symbol} at ${result.price}`);
          } else {
            failCount++;
            getLogger().error(`❌ Failed to emergency close: ${position.symbol}`);
          }
        } catch (error) {
          failCount++;
          getLogger().error(`❌ Error closing position ${position.symbol}:`, error as Error);
        }
      }

      // Set emergency pause
      // eslint-disable-next-line functional/immutable-data
      this.state.isEmergencyPaused = true;
      // eslint-disable-next-line functional/immutable-data
      this.state.emergencyPauseUntil = Date.now() + this.config.emergencyPauseDuration;

      getLogger().warn(
        `🚨 Emergency flatten complete: ${successCount} success, ${failCount} failed`
      );
      getLogger().warn(
        `⏸️ Trading paused for ${this.config.emergencyPauseDuration / (1000 * 60 * 60)} hours`
      );

      this.logProtectionEvent('EMERGENCY_FLATTEN_COMPLETE', successCount);

      return failCount === 0;
    } catch (error) {
      getLogger().error(`❌ Error in emergency flatten:`, error as Error);
      return false;
    }
  }

  /**
   * Add a completed trade to the tracking system
   * @param trade - Trade record to add
   */
  public addTrade(trade: TradeRecord): void {
    // eslint-disable-next-line functional/immutable-data
    this.state.recentTrades.push(trade);

    // Keep only last 100 trades for memory efficiency
    if (this.state.recentTrades.length > 100) {
      // eslint-disable-next-line functional/immutable-data
      this.state.recentTrades = this.state.recentTrades.slice(-100);
    }

    getLogger().info(
      `📊 Trade recorded: ${trade.symbol} ${trade.side} ${trade.isWin ? 'WIN' : 'LOSS'} P&L: ${trade.pnl.toFixed(2)}`
    );

    // Check consecutive losses and win rate after each trade
    this.checkConsecutiveLosses(this.state.recentTrades);
    this.checkWinRate(this.state.recentTrades);
  }

  /**
   * Set the start of day equity (for testing purposes)
   * @param equity - Starting equity for the day
   */
  public setStartOfDayEquity(equity: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.state.startOfDayEquity = equity;
  }

  /**
   * Set the start of week equity (for testing purposes)
   * @param equity - Starting equity for the week
   */
  public setStartOfWeekEquity(equity: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.state.startOfWeekEquity = equity;
  }

  /**
   * Get current drawdown state
   * @returns Current drawdown state
   */
  public getState(): DrawdownState {
    return { ...this.state };
  }

  /**
   * Check if trading is currently paused due to emergency
   * @returns True if trading is paused
   */
  public isEmergencyPaused(): boolean {
    if (this.state.isEmergencyPaused && Date.now() > this.state.emergencyPauseUntil) {
      // Emergency pause period has ended
      // eslint-disable-next-line functional/immutable-data
      this.state.isEmergencyPaused = false;
      // eslint-disable-next-line functional/immutable-data
      this.state.emergencyPauseUntil = 0;
      getLogger().info(`✅ Emergency pause lifted. Trading resumed.`);
      this.emit('emergency:resumed', this.state);
    }

    return this.state.isEmergencyPaused;
  }

  /**
   * Get current position size multiplier based on drawdown protection
   * @returns Position size multiplier (0.5 = 50% reduction)
   */
  public getPositionSizeMultiplier(): number {
    return this.state.positionSizeReduction;
  }

  /**
   * Get current maximum leverage based on weekly drawdown
   * @returns Maximum leverage allowed
   */
  public getMaxLeverage(): number {
    return this.state.maxLeverageReduction
      ? this.config.leverageReduction.to
      : this.config.leverageReduction.from;
  }

  /**
   * Check if new entries are allowed
   * @returns True if new entries are allowed
   */
  public canOpenNewPositions(): boolean {
    // Block new entries if:
    // 1. Emergency paused
    // 2. Daily drawdown >= 5%
    return (
      !this.isEmergencyPaused() &&
      this.state.dailyDrawdown < this.config.dailyDrawdownThresholds.level2
    );
  }

  /**
   * Start monitoring drawdown protection
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // eslint-disable-next-line functional/immutable-data
    this.monitoringInterval = setInterval(async () => {
      await this.updateDrawdownState();
    }, this.MONITORING_FREQUENCY);

    getLogger().info(
      `🛡️ Drawdown Protector: Started monitoring (${this.MONITORING_FREQUENCY / 1000}s interval)`
    );
  }

  /**
   * Stop monitoring drawdown protection
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      // eslint-disable-next-line functional/immutable-data
      this.monitoringInterval = null;
    }
    getLogger().info(`🛡️ Drawdown Protector: Stopped monitoring`);
  }

  /**
   * Update drawdown state with current equity
   */
  private async updateDrawdownState(): Promise<void> {
    try {
      const currentEquity = await this.bybitClient.getEquity();

      // Initialize baselines if not set
      if (this.state.startOfDayEquity === 0) {
        // eslint-disable-next-line functional/immutable-data
        this.state.startOfDayEquity = currentEquity;
      }
      if (this.state.startOfWeekEquity === 0) {
        // eslint-disable-next-line functional/immutable-data
        this.state.startOfWeekEquity = currentEquity;
      }

      // Check all protection measures
      await this.checkDailyDrawdown(currentEquity);
      await this.checkWeeklyDrawdown(currentEquity);

      // eslint-disable-next-line functional/immutable-data
      this.state.lastUpdate = Date.now();
    } catch (error) {
      getLogger().error(`❌ Error updating drawdown state:`, error as Error);
    }
  }

  /**
   * Get week number for date
   * @param date - Date to get week number for
   * @returns Week number
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Log drawdown protection event
   * @param action - Action taken
   * @param value - Associated value (percentage, count, etc.)
   */
  private logProtectionEvent(action: string, value: number): void {
    const event = {
      timestamp: Date.now(),
      type: 'DRAWDOWN_PROTECTION',
      action,
      value,
      currentEquity: this.state.currentEquity,
      dailyDrawdown: this.state.dailyDrawdown * 100,
      weeklyDrawdown: this.state.weeklyDrawdown * 100,
      consecutiveLosses: this.state.consecutiveLosses,
      winRate: this.state.winRate * 100,
    };

    getLogger().info(`🛡️ DRAWDOWN_PROTECTION: ${JSON.stringify(event)}`);
    this.emit('protection:activated', this.state, action);
  }

  /**
   * Update configuration
   * @param newConfig - New configuration
   */
  public updateConfig(newConfig: Partial<DrawdownProtectorConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...newConfig };
    getLogger().info(`🛡️ Drawdown Protector: Configuration updated`);
  }

  /**
   * Reset drawdown state (for testing or manual reset)
   */
  public resetState(): void {
    // eslint-disable-next-line functional/immutable-data
    this.state = {
      currentEquity: 0,
      startOfDayEquity: 0,
      startOfWeekEquity: 0,
      dailyDrawdown: 0,
      weeklyDrawdown: 0,
      maxDailyDrawdown: 0,
      maxWeeklyDrawdown: 0,
      consecutiveLosses: 0,
      recentTrades: [],
      winRate: 0,
      isEmergencyPaused: false,
      emergencyPauseUntil: 0,
      positionSizeReduction: 1.0,
      maxLeverageReduction: false,
      lastUpdate: Date.now(),
    };
    getLogger().info(`🛡️ Drawdown Protector: State reset`);
  }

  /**
   * Get statistics for monitoring
   * @returns Drawdown statistics
   */
  public getStatistics(): {
    dailyDrawdown: number;
    weeklyDrawdown: number;
    maxDailyDrawdown: number;
    maxWeeklyDrawdown: number;
    consecutiveLosses: number;
    winRate: number;
    totalTrades: number;
    isEmergencyPaused: boolean;
    positionSizeReduction: number;
    maxLeverageReduction: boolean;
  } {
    return {
      dailyDrawdown: this.state.dailyDrawdown * 100,
      weeklyDrawdown: this.state.weeklyDrawdown * 100,
      maxDailyDrawdown: this.state.maxDailyDrawdown * 100,
      maxWeeklyDrawdown: this.state.maxWeeklyDrawdown * 100,
      consecutiveLosses: this.state.consecutiveLosses,
      winRate: this.state.winRate * 100,
      totalTrades: this.state.recentTrades.length,
      isEmergencyPaused: this.state.isEmergencyPaused,
      positionSizeReduction: this.state.positionSizeReduction,
      maxLeverageReduction: this.state.maxLeverageReduction,
    };
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopMonitoring();
    this.removeAllListeners();
    getLogger().info(`🛡️ Drawdown Protector: Destroyed`);
  }
}

// Export event interface for TypeScript
export declare interface DrawdownProtector {
  on<U extends keyof DrawdownProtectorEvents>(event: U, listener: DrawdownProtectorEvents[U]): this;
  emit<U extends keyof DrawdownProtectorEvents>(
    event: U,
    ...args: Parameters<DrawdownProtectorEvents[U]>
  ): boolean;
}
