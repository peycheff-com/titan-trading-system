/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * PositionManager.ts
 * Unified Position Manager for Titan.
 *
 * Responsibilities:
 * - Single source of truth for all positions across exchanges.
 * - Handles Position Identity: Exchange + Symbol + Mode + Side.
 * - Manages Hedge Mode vs One-Way Mode logic.
 * - Aggregates exposure.
 */

import { Position } from '../types/index.js';
import { logger } from '../utils/Logger.js';

/**
 * Unique key for a position
 * Format: EXCHANGE:SYMBOL:MODE:SIDE
 */
export type PositionKey = string;

export class PositionManager {
  private positions: Map<PositionKey, Position> = new Map();

  constructor() {}

  /**
   * Generate a unique key for the position
   */
  private generateKey(pos: Position): PositionKey {
    const exchange = pos.exchange ?? 'UNKNOWN';
    const mode = pos.positionMode ?? 'ONE_WAY';
    // For One-Way mode, side might matter if we treat Long/Short as signed size,
    // but typically exchanges report them as a position.
    // In Hedge mode, we definitely have distinct Long and Short positions.
    // In One-Way, typically we just hold 'the position' which has a side.
    // To safe-guard, we include side in validity check.
    return `${exchange}:${pos.symbol}:${mode}:${pos.side}`;
  }

  /**
   * Update or Add a position
   */
  public updatePosition(position: Position): void {
    const key = this.generateKey(position);

    // If size is zero/negligible, remove it
    if (position.size <= 0.000001) {
      if (this.positions.has(key)) {
        this.positions.delete(key);
        logger.info(`[PositionManager] Closed/Removed position: ${key}`);
      }
      return;
    }

    this.positions.set(key, position);
    // logger.debug(`[PositionManager] Updated position: ${key} | Size: ${position.size}`);
  }

  /**
   * Get all active positions
   */
  public getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get specific position
   */
  public getPosition(
    exchange: string,
    symbol: string,
    side: 'LONG' | 'SHORT',
    mode: 'ONE_WAY' | 'HEDGE' = 'ONE_WAY',
  ): Position | undefined {
    const key = `${exchange}:${symbol}:${mode}:${side}`;
    return this.positions.get(key);
  }

  /**
   * Calculate total net exposure for a symbol across all exchanges and modes
   * Useful for risk aggregation.
   */
  public getNetExposure(symbol: string): number {
    let net = 0;
    for (const pos of this.positions.values()) {
      if (pos.symbol === symbol) {
        const value = pos.size * pos.entryPrice; // Approx notional value
        // Or simply sum 'size' if it is in USD.
        // Position type says "size: number; // Position size in USD notional".
        // So we can just sum size * sign.
        const sign = pos.side === 'LONG' ? 1 : -1;
        net += pos.size * sign;
      }
    }
    return net;
  }

  /**
   * Sync a full list of positions (e.g. from exchange/execution snapshot)
   * Removes positions that are not in the new list (for that exchange).
   */
  public syncExchangePositions(exchange: string, newPositions: Position[]): void {
    // 1. Identify all current keys for this exchange
    const keysToRemove = new Set<string>();
    for (const [key, pos] of this.positions) {
      if (pos.exchange === exchange) {
        keysToRemove.add(key);
      }
    }

    // 2. Update/Add new positions
    for (const pos of newPositions) {
      if (pos.exchange !== exchange) {
        logger.warn(
          `[PositionManager] Received sync for ${exchange} containing position from ${pos.exchange}`,
        );
        continue;
      }
      const key = this.generateKey(pos);
      this.updatePosition(pos);

      keysToRemove.delete(key);
    }

    // 3. Remove positions not in the new list (stale)
    for (const key of keysToRemove) {
      this.positions.delete(key);
      logger.info(`[PositionManager] Removed stale position during sync: ${key}`);
    }
  }

  public clear(): void {
    this.positions.clear();
  }
}
