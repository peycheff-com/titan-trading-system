/**
 * Position Manager for Titan Phase 2 - The Hunter
 *
 * Handles automated position management including:
 * - Move stop to breakeven at 1.5R profit
 * - Take partial profit at 2R profit (50% close)
 * - Update trailing stop with 1 ATR distance
 * - Tighten stop after 48h to 0.5 ATR
 * - Close position for stop/target hits
 *
 * Requirements: 12.1-12.7 (Position Management)
 */

import { EventEmitter } from "events";
import {
  OrderParams,
  OrderResult,
  PartialProfitConfig,
  Position,
  PositionUpdate,
  TrailingStopConfig,
} from "../types";
import { BybitPerpsClient } from "../exchanges/BybitPerpsClient";
import { getLogger, logError, logPositionClose } from "../logging/Logger";

export interface PositionManagerConfig {
  breakevenRLevel: number; // R level to move stop to breakeven (default: 1.5)
  partialProfitRLevel: number; // R level to take partial profit (default: 2.0)
  partialProfitPercentage: number; // Percentage to close at partial (default: 50)
  trailingStopDistance: number; // ATR multiplier for trailing stop (default: 1.0)
  tightenAfterHours: number; // Hours after which to tighten stop (default: 48)
  tightenedStopDistance: number; // ATR multiplier for tightened stop (default: 0.5)
}

export interface PositionManagerEvents {
  "position:breakeven": (position: Position) => void;
  "position:partial": (position: Position, closedQuantity: number) => void;
  "position:trailing": (position: Position, newStopLoss: number) => void;
  "position:tightened": (position: Position, newStopLoss: number) => void;
  "position:closed": (
    position: Position,
    reason: "STOP_HIT" | "TARGET_HIT" | "MANUAL",
  ) => void;
  "position:error": (position: Position, error: Error) => void;
}

export class PositionManager extends EventEmitter {
  private positions: Map<string, Position> = new Map();
  private config: PositionManagerConfig;
  private bybitClient: BybitPerpsClient;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_FREQUENCY = 5000; // 5 seconds

  constructor(
    bybitClient: BybitPerpsClient,
    config?: Partial<PositionManagerConfig>,
  ) {
    super();

    this.bybitClient = bybitClient;
    this.config = {
      breakevenRLevel: 1.5,
      partialProfitRLevel: 2.0,
      partialProfitPercentage: 50,
      trailingStopDistance: 1.0,
      tightenAfterHours: 48,
      tightenedStopDistance: 0.5,
      ...config,
    };

    // Start position monitoring
    this.startMonitoring();
  }

  /**
   * Add a new position to management
   * @param position - Position to manage
   */
  public addPosition(position: Position): void {
    this.positions.set(position.id, { ...position });
    this.positions.set(position.id, { ...position });
    getLogger().info(
      `📊 Position Manager: Added position ${position.id} (${position.symbol} ${position.side})`,
    );
  }

  /**
   * Remove a position from management
   * @param positionId - Position ID to remove
   */
  public removePosition(positionId: string): void {
    const position = this.positions.get(positionId);
    if (position) {
      this.positions.delete(positionId);
      getLogger().info(`📊 Position Manager: Removed position ${positionId}`);
    }
  }

  /**
   * Get all managed positions
   * @returns Array of managed positions
   */
  public getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get a specific position
   * @param positionId - Position ID
   * @returns Position or undefined
   */
  public getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  /**
   * Update position with current market data
   * @param update - Position update data
   */
  public updatePosition(update: PositionUpdate): void {
    const position = this.positions.get(update.id);
    if (!position) return;

    // Update current price and P&L
    position.currentPrice = update.currentPrice;
    position.unrealizedPnL = update.unrealizedPnL;

    // Calculate current R value
    const riskAmount = Math.abs(position.entryPrice - position.stopLoss) *
      position.quantity;
    if (riskAmount > 0) {
      position.rValue = update.unrealizedPnL / riskAmount;
    }

    // Update position in map
    this.positions.set(update.id, position);

    // Check for management actions
    this.checkPositionManagement(position);
  }

  /**
   * Move stop loss to breakeven at 1.5R profit
   * @param position - Position to update
   * @returns Promise with success status
   */
  public async moveStopToBreakeven(position: Position): Promise<boolean> {
    try {
      // Check if already at breakeven
      if (Math.abs(position.stopLoss - position.entryPrice) < 0.01) {
        return true; // Already at breakeven
      }

      // Check if position has reached 1.5R profit
      if (position.rValue < this.config.breakevenRLevel) {
        return false; // Not profitable enough yet
      }

      getLogger().info(
        `🎯 Moving stop to breakeven for ${position.symbol} at ${
          position.rValue.toFixed(2)
        }R`,
      );

      // Set stop loss to entry price (breakeven)
      const success = await this.bybitClient.setStopLoss(
        position.symbol,
        position.entryPrice,
      );

      if (success) {
        position.stopLoss = position.entryPrice;
        this.positions.set(position.id, position);
        this.emit("position:breakeven", position);

        this.emit("position:breakeven", position);

        getLogger().info(
          `✅ Stop moved to breakeven: ${position.symbol} @ ${position.entryPrice}`,
        );
        return true;
      }

      return false;
    } catch (error) {
      logError(
        "ERROR",
        `Failed to move stop to breakeven for ${position.symbol}`,
        { error },
      );
      this.emit("position:error", position, error as Error);
      return false;
    }
  }

  /**
   * Take partial profit at 2R profit (50% close)
   * @param position - Position to partially close
   * @returns Promise with success status
   */
  public async takePartialProfit(position: Position): Promise<boolean> {
    try {
      // Check if position has reached 2R profit
      if (position.rValue < this.config.partialProfitRLevel) {
        return false; // Not profitable enough yet
      }

      // Check if partial profit already taken (quantity would be reduced)
      const originalQuantity = position.quantity;
      const partialQuantity = originalQuantity *
        (this.config.partialProfitPercentage / 100);

      getLogger().info(
        `💰 Taking partial profit for ${position.symbol} at ${
          position.rValue.toFixed(2)
        }R`,
      );

      // Place market order to close partial position
      const orderParams: OrderParams = {
        phase: "phase2",
        symbol: position.symbol,
        side: position.side === "LONG" ? "Sell" : "Buy",
        type: "MARKET",
        qty: partialQuantity,
        leverage: position.leverage,
      };

      const result = await this.bybitClient.placeOrderWithRetry(orderParams);

      if (result.status === "FILLED") {
        // Update position quantity
        position.quantity -= partialQuantity;
        position.realizedPnL += partialQuantity *
          (position.currentPrice - position.entryPrice);

        this.positions.set(position.id, position);
        this.emit("position:partial", position, partialQuantity);

        this.emit("position:partial", position, partialQuantity);

        getLogger().info(
          `✅ Partial profit taken: ${position.symbol} closed ${partialQuantity} at ${result.price}`,
        );
        return true;
      }

      return false;
    } catch (error) {
      logError(
        "ERROR",
        `Failed to take partial profit for ${position.symbol}`,
        { error },
      );
      this.emit("position:error", position, error as Error);
      return false;
    }
  }

  /**
   * Update trailing stop with 1 ATR distance
   * @param position - Position to update trailing stop
   * @returns Promise with success status
   */
  public async updateTrailingStop(position: Position): Promise<boolean> {
    try {
      // Only trail if position is profitable
      if (position.rValue <= 0) {
        return false;
      }

      const atrDistance = position.atr * this.config.trailingStopDistance;
      let newStopLoss: number;

      if (position.side === "LONG") {
        // For long positions, trail stop up
        newStopLoss = position.currentPrice - atrDistance;

        // Only update if new stop is higher than current stop
        if (newStopLoss <= position.stopLoss) {
          return false;
        }
      } else {
        // For short positions, trail stop down
        newStopLoss = position.currentPrice + atrDistance;

        // Only update if new stop is lower than current stop
        if (newStopLoss >= position.stopLoss) {
          return false;
        }
      }

      getLogger().info(
        `📈 Updating trailing stop for ${position.symbol}: ${
          position.stopLoss.toFixed(2)
        } → ${newStopLoss.toFixed(2)}`,
      );

      // Set new stop loss
      const success = await this.bybitClient.setStopLoss(
        position.symbol,
        newStopLoss,
      );

      if (success) {
        position.stopLoss = newStopLoss;
        this.positions.set(position.id, position);
        this.emit("position:trailing", position, newStopLoss);

        this.emit("position:trailing", position, newStopLoss);

        getLogger().info(
          `✅ Trailing stop updated: ${position.symbol} @ ${
            newStopLoss.toFixed(2)
          }`,
        );
        return true;
      }

      return false;
    } catch (error) {
      logError(
        "ERROR",
        `Failed to update trailing stop for ${position.symbol}`,
        { error },
      );
      this.emit("position:error", position, error as Error);
      return false;
    }
  }

  /**
   * Tighten stop loss to 0.5 ATR after 48 hours
   * @param position - Position to tighten stop
   * @returns Promise with success status
   */
  public async tightenStopAfter48h(position: Position): Promise<boolean> {
    try {
      // Check if position is older than configured hours
      const hoursOpen = (Date.now() - position.entryTime) / (1000 * 60 * 60);
      if (hoursOpen < this.config.tightenAfterHours) {
        return false; // Not old enough yet
      }

      const tightenedDistance = position.atr *
        this.config.tightenedStopDistance;
      let newStopLoss: number;

      if (position.side === "LONG") {
        newStopLoss = position.currentPrice - tightenedDistance;

        // Only tighten if new stop is higher than current stop
        if (newStopLoss <= position.stopLoss) {
          return false;
        }
      } else {
        newStopLoss = position.currentPrice + tightenedDistance;

        // Only tighten if new stop is lower than current stop
        if (newStopLoss >= position.stopLoss) {
          return false;
        }
      }

      getLogger().info(
        `⏰ Tightening stop after ${
          hoursOpen.toFixed(1)
        }h for ${position.symbol}: ${position.stopLoss.toFixed(2)} → ${
          newStopLoss.toFixed(2)
        }`,
      );

      // Set tightened stop loss
      const success = await this.bybitClient.setStopLoss(
        position.symbol,
        newStopLoss,
      );

      if (success) {
        position.stopLoss = newStopLoss;
        this.positions.set(position.id, position);
        this.emit("position:tightened", position, newStopLoss);

        this.emit("position:tightened", position, newStopLoss);

        getLogger().info(
          `✅ Stop tightened: ${position.symbol} @ ${newStopLoss.toFixed(2)}`,
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Failed to tighten stop for ${position.symbol}:`, error);
      // Keep compat with emit error but use logger too
      logError("ERROR", `Failed to tighten stop for ${position.symbol}`, {
        error,
      });
      this.emit("position:error", position, error as Error);
      return false;
    }
  }

  /**
   * Close position for stop/target hits
   * @param position - Position to close
   * @param reason - Reason for closing
   * @returns Promise with success status
   */
  public async closePosition(
    position: Position,
    reason: "STOP_HIT" | "TARGET_HIT" | "MANUAL",
  ): Promise<boolean> {
    try {
      getLogger().info(
        `🚪 Closing position ${position.symbol} - Reason: ${reason}`,
      );

      // Place market order to close entire position
      const orderParams: OrderParams = {
        phase: "phase2",
        symbol: position.symbol,
        side: position.side === "LONG" ? "Sell" : "Buy",
        type: "MARKET",
        qty: position.quantity,
        leverage: position.leverage,
      };

      const result = await this.bybitClient.placeOrderWithRetry(orderParams);

      if (result.status === "FILLED") {
        // Calculate profit percentage and hold time
        const profitPercentage =
          ((result.price - position.entryPrice) / position.entryPrice) * 100;
        const holdTime = Date.now() - position.entryTime;

        // Update position status
        position.status = "CLOSED";
        position.realizedPnL += position.quantity *
          (result.price - position.entryPrice);

        // Map PositionManager close reasons to Logger close reasons
        const loggerReason = reason === "STOP_HIT"
          ? "STOP_LOSS"
          : reason === "TARGET_HIT"
          ? "TAKE_PROFIT"
          : "MANUAL";

        // Log position close to structured logger
        logPositionClose(
          position.id,
          position.symbol,
          position.side,
          position.entryPrice,
          result.price,
          profitPercentage,
          loggerReason,
          holdTime,
          position.rValue,
        );

        // Remove from active management
        this.positions.delete(position.id);
        this.emit("position:closed", position, reason);

        this.emit("position:closed", position, reason);

        getLogger().info(
          `✅ Position closed: ${position.symbol} at ${result.price} (${reason})`,
        );
        return true;
      }

      return false;
    } catch (error) {
      // console.error already replaced by logError below in original code logic?
      // Original: console.error(...); logError(...);
      // We remove the console.error.
      logError("ERROR", `Failed to close position ${position.symbol}`, {
        symbol: position.symbol,
        component: "PositionManager",
        function: "closePosition",
        stack: (error as Error).stack,
        data: { position, reason },
      });
      this.emit("position:error", position, error as Error);
      return false;
    }
  }

  /**
   * Check if position needs management actions
   * @param position - Position to check
   */
  private async checkPositionManagement(position: Position): Promise<void> {
    try {
      // Check for stop/target hits first
      if (this.checkStopHit(position)) {
        await this.closePosition(position, "STOP_HIT");
        return;
      }

      if (this.checkTargetHit(position)) {
        await this.closePosition(position, "TARGET_HIT");
        return;
      }

      // Check for management actions (in order of priority)

      // 1. Move to breakeven at 1.5R
      if (
        position.rValue >= this.config.breakevenRLevel &&
        Math.abs(position.stopLoss - position.entryPrice) > 0.01
      ) {
        await this.moveStopToBreakeven(position);
      }

      // 2. Take partial profit at 2R
      if (position.rValue >= this.config.partialProfitRLevel) {
        await this.takePartialProfit(position);
      }

      // 3. Update trailing stop if profitable
      if (position.rValue > 0) {
        await this.updateTrailingStop(position);
      }

      // 4. Tighten stop after 48h
      const hoursOpen = (Date.now() - position.entryTime) / (1000 * 60 * 60);
      if (hoursOpen >= this.config.tightenAfterHours) {
        await this.tightenStopAfter48h(position);
      }
    } catch (error) {
      logError("ERROR", `Error in position management for ${position.symbol}`, {
        error,
      });
      this.emit("position:error", position, error as Error);
    }
  }

  /**
   * Check if stop loss was hit
   * @param position - Position to check
   * @returns True if stop was hit
   */
  private checkStopHit(position: Position): boolean {
    if (position.side === "LONG") {
      return position.currentPrice <= position.stopLoss;
    } else {
      return position.currentPrice >= position.stopLoss;
    }
  }

  /**
   * Check if take profit was hit
   * @param position - Position to check
   * @returns True if target was hit
   */
  private checkTargetHit(position: Position): boolean {
    if (position.side === "LONG") {
      return position.currentPrice >= position.takeProfit;
    } else {
      return position.currentPrice <= position.takeProfit;
    }
  }

  /**
   * Start monitoring positions
   */
  private startMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(async () => {
      await this.updateAllPositions();
    }, this.UPDATE_FREQUENCY);

    getLogger().info(
      `📊 Position Manager: Started monitoring (${this.UPDATE_FREQUENCY}ms interval)`,
    );
  }

  /**
   * Stop monitoring positions
   */
  public stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    getLogger().info(`📊 Position Manager: Stopped monitoring`);
  }

  /**
   * Update all positions with current market data
   */
  private async updateAllPositions(): Promise<void> {
    const positions = Array.from(this.positions.values());

    for (const position of positions) {
      try {
        // Get current price from exchange
        const currentPrice = await this.bybitClient.getCurrentPrice(
          position.symbol,
        );

        // Calculate unrealized P&L
        const priceDiff = position.side === "LONG"
          ? currentPrice - position.entryPrice
          : position.entryPrice - currentPrice;
        const unrealizedPnL = priceDiff * position.quantity;

        // Update position
        this.updatePosition({
          id: position.id,
          currentPrice,
          unrealizedPnL,
          timestamp: Date.now(),
        });
      } catch (error) {
        logError("ERROR", `Failed to update position ${position.symbol}`, {
          error,
        });
      }
    }
  }

  /**
   * Get position statistics
   * @returns Position statistics
   */
  public getStatistics(): {
    totalPositions: number;
    openPositions: number;
    totalUnrealizedPnL: number;
    totalRealizedPnL: number;
    averageRValue: number;
  } {
    const positions = Array.from(this.positions.values());
    const openPositions = positions.filter((p) => p.status === "OPEN");

    const totalUnrealizedPnL = openPositions.reduce(
      (sum, p) => sum + p.unrealizedPnL,
      0,
    );
    const totalRealizedPnL = positions.reduce(
      (sum, p) => sum + p.realizedPnL,
      0,
    );
    const averageRValue = openPositions.length > 0
      ? openPositions.reduce((sum, p) => sum + p.rValue, 0) /
        openPositions.length
      : 0;

    return {
      totalPositions: positions.length,
      openPositions: openPositions.length,
      totalUnrealizedPnL,
      totalRealizedPnL,
      averageRValue,
    };
  }

  /**
   * Update configuration
   * @param newConfig - New configuration
   */
  public updateConfig(newConfig: Partial<PositionManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    getLogger().info(`📊 Position Manager: Configuration updated`);
  }

  /**
   * Emergency close all positions
   * @returns Promise with results
   */
  public async emergencyCloseAll(): Promise<
    { success: number; failed: number }
  > {
    getLogger().info(`🚨 Emergency closing all positions`);

    const positions = Array.from(this.positions.values());
    let success = 0;
    let failed = 0;

    for (const position of positions) {
      try {
        const result = await this.closePosition(position, "MANUAL");
        if (result) {
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        logError("ERROR", `Failed to emergency close ${position.symbol}`, {
          error,
        });
        failed++;
      }
    }

    getLogger().info(
      `🚨 Emergency close complete: ${success} success, ${failed} failed`,
    );
    return { success, failed };
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopMonitoring();
    this.positions.clear();
    this.removeAllListeners();
    getLogger().info(`📊 Position Manager: Destroyed`);
  }
}

// Export event interface for TypeScript
export declare interface PositionManager {
  on<U extends keyof PositionManagerEvents>(
    event: U,
    listener: PositionManagerEvents[U],
  ): this;
  emit<U extends keyof PositionManagerEvents>(
    event: U,
    ...args: Parameters<PositionManagerEvents[U]>
  ): boolean;
}
