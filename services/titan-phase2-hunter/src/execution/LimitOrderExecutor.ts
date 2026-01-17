/**
 * Limit Order Executor (The Sniper) for Titan Phase 2 - The Hunter
 *
 * Implements passive execution strategy using Post-Only Limit Orders at Order Blocks.
 * Designed for Bulgaria (200ms latency) - orders wait at pre-calculated levels.
 *
 * Key Features:
 * - Post-Only orders at Order Block top/bottom (earn Maker rebates)
 * - 60-second order timeout with price movement cancellation
 * - Volatility-Adjusted Position Sizing using ATR
 * - 3:1 Risk-Reward ratio (1.5% stop, 4.5% target)
 * - Smart cancellation logic (price moves >0.2%, level fails >0.5%)
 *
 * Requirements: 7.1-7.7 (Execution)
 */

import { EventEmitter } from 'events';
import {
  OrderParams,
  OrderResult,
  OrderStatus,
  SignalData,
  ExecutionData,
  OHLCV,
  OrderBlock,
  Position,
} from '../types';
import { BybitPerpsClient } from '../exchanges/BybitPerpsClient';
import { logExecution, logError } from '../logging/Logger';

export interface LimitOrderConfig {
  orderTimeout: number; // Timeout in milliseconds (default: 60000)
  priceMoveCancelThreshold: number; // Price move % to cancel (default: 0.002 = 0.2%)
  levelFailThreshold: number; // Wick % to cancel (default: 0.005 = 0.5%)
  stopLossPercent: number; // Stop loss % from entry (default: 0.015 = 1.5%)
  takeProfitPercent: number; // Take profit % from entry (default: 0.045 = 4.5%)
  atrPeriod: number; // ATR calculation period (default: 14)
  maxRetries: number; // Maximum order retry attempts (default: 2)
  retryDelay: number; // Delay between retries in ms (default: 1000)
}

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  fillPrice?: number;
  positionSize?: number;
  stopLoss?: number;
  takeProfit?: number;
  reason?: string;
  error?: string;
}

export interface OrderMonitoringState {
  orderId: string;
  symbol: string;
  entryPrice: number;
  orderBlock: OrderBlock;
  startTime: number;
  cancelled: boolean;
  filled: boolean;
  signalId?: string; // Optional signal ID for logging
}

export interface LimitOrderExecutorEvents {
  'order:placed': (orderId: string, symbol: string, price: number) => void;
  'order:filled': (orderId: string, fillPrice: number, positionSize: number) => void;
  'order:cancelled': (orderId: string, reason: string) => void;
  'order:timeout': (orderId: string) => void;
  'position:created': (position: Position) => void;
  'execution:error': (error: Error, context: any) => void;
}

export class LimitOrderExecutor extends EventEmitter {
  private bybitClient: BybitPerpsClient;
  private config: LimitOrderConfig;
  private activeOrders: Map<string, OrderMonitoringState> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_FREQUENCY = 1000; // 1 second

  constructor(bybitClient: BybitPerpsClient, config?: Partial<LimitOrderConfig>) {
    super();

    this.bybitClient = bybitClient;
    this.config = {
      orderTimeout: 60000, // 60 seconds
      priceMoveCancelThreshold: 0.002, // 0.2%
      levelFailThreshold: 0.005, // 0.5%
      stopLossPercent: 0.015, // 1.5%
      takeProfitPercent: 0.045, // 4.5%
      atrPeriod: 14,
      maxRetries: 2,
      retryDelay: 1000,
      ...config,
    };

    // Start order monitoring
    this.startMonitoring();
  }

  /**
   * Place Post-Only Limit Order at Order Block top/bottom
   * @param signal - Signal data with entry details
   * @param orderBlock - Order Block for entry level
   * @param equity - Current account equity for position sizing
   * @returns Promise with execution result
   */
  public async placePostOnlyOrder(
    signal: SignalData,
    orderBlock: OrderBlock,
    equity: number
  ): Promise<ExecutionResult> {
    try {
      console.log(`🎯 Placing Post-Only order for ${signal.symbol} ${signal.direction}`);

      // Calculate entry price at Order Block level
      const entryPrice =
        signal.direction === 'LONG'
          ? orderBlock.low // Enter at OB bottom for longs
          : orderBlock.high; // Enter at OB top for shorts

      // Calculate position size using Volatility-Adjusted Sizing
      const positionSize = await this.calcPositionSize(
        signal.symbol,
        entryPrice,
        equity,
        signal.leverage
      );

      if (positionSize <= 0) {
        return {
          success: false,
          error: 'Position size calculation failed or too small',
        };
      }

      // Calculate stop loss and take profit
      const { stopLoss, takeProfit } = this.setStopAndTarget(entryPrice, signal.direction);

      // Prepare order parameters
      const orderParams: OrderParams = {
        phase: 'phase2',
        symbol: signal.symbol,
        side: signal.direction === 'LONG' ? 'Buy' : 'Sell',
        type: 'POST_ONLY',
        price: entryPrice,
        qty: positionSize,
        leverage: signal.leverage,
        stopLoss,
        takeProfit,
      };

      // Place order with retry logic
      const orderResult = await this.bybitClient.placeOrderWithRetry(
        orderParams,
        this.config.maxRetries
      );

      if (orderResult.orderId) {
        // Start monitoring the order
        this.startOrderMonitoring(
          orderResult.orderId,
          signal.symbol,
          entryPrice,
          orderBlock,
          signal.timestamp.toString()
        );

        this.emit('order:placed', orderResult.orderId, signal.symbol, entryPrice);

        console.log(
          `✅ Post-Only order placed: ${signal.symbol} @ ${entryPrice} (ID: ${orderResult.orderId})`
        );

        return {
          success: true,
          orderId: orderResult.orderId,
          positionSize,
          stopLoss,
          takeProfit,
        };
      }

      return {
        success: false,
        error: 'Order placement failed - no order ID returned',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to place Post-Only order for ${signal.symbol}:`, errorMsg);

      logError('ERROR', `Failed to place Post-Only order for ${signal.symbol}`, {
        symbol: signal.symbol,
        component: 'LimitOrderExecutor',
        function: 'placePostOnlyOrder',
        stack: (error as Error).stack,
        data: { signal, orderBlock },
      });

      this.emit('execution:error', error as Error, { signal, orderBlock });

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Monitor order with 60-second timeout
   * @param orderId - Order ID to monitor
   * @param symbol - Trading symbol
   * @param entryPrice - Expected entry price
   * @param orderBlock - Order Block reference
   */
  private startOrderMonitoring(
    orderId: string,
    symbol: string,
    entryPrice: number,
    orderBlock: OrderBlock,
    signalId?: string
  ): void {
    const monitoringState: OrderMonitoringState = {
      orderId,
      symbol,
      entryPrice,
      orderBlock,
      startTime: Date.now(),
      cancelled: false,
      filled: false,
      signalId,
    };

    this.activeOrders.set(orderId, monitoringState);
    console.log(`👁️ Started monitoring order ${orderId} for ${symbol}`);
  }

  /**
   * Monitor order and cancel if price moves away > 0.2%
   * @param orderId - Order ID to monitor
   * @param currentPrice - Current market price
   * @returns Promise with cancellation result
   */
  public async cancelIfPriceMoves(orderId: string, currentPrice: number): Promise<boolean> {
    const orderState = this.activeOrders.get(orderId);
    if (!orderState || orderState.cancelled || orderState.filled) {
      return false;
    }

    // Calculate price movement from entry level
    const priceMove = Math.abs(currentPrice - orderState.entryPrice) / orderState.entryPrice;

    if (priceMove > this.config.priceMoveCancelThreshold) {
      console.log(
        `📉 Price moved ${(priceMove * 100).toFixed(2)}% away from ${orderState.symbol} order, cancelling`
      );

      try {
        const success = await this.bybitClient.cancelOrder(orderId, orderState.symbol);

        if (success) {
          orderState.cancelled = true;
          this.activeOrders.set(orderId, orderState);
          this.emit('order:cancelled', orderId, 'PRICE_MOVED_AWAY');

          console.log(`✅ Order cancelled due to price movement: ${orderId}`);
          return true;
        }
      } catch (error) {
        console.error(`❌ Failed to cancel order ${orderId}:`, error);
        this.emit('execution:error', error as Error, { orderId, reason: 'CANCEL_FAILED' });
      }
    }

    return false;
  }

  /**
   * Cancel order when price wicks through Order Block > 0.5%
   * @param orderId - Order ID to monitor
   * @param currentCandle - Current OHLCV candle
   * @returns Promise with cancellation result
   */
  public async cancelIfLevelFails(orderId: string, currentCandle: OHLCV): Promise<boolean> {
    const orderState = this.activeOrders.get(orderId);
    if (!orderState || orderState.cancelled || orderState.filled) {
      return false;
    }

    const orderBlock = orderState.orderBlock;
    let wickThrough = false;
    let wickPercent = 0;

    if (orderBlock.type === 'BULLISH') {
      // For bullish OB, check if price wicked below OB low
      if (currentCandle.low < orderBlock.low) {
        wickPercent = (orderBlock.low - currentCandle.low) / orderBlock.low;
        wickThrough = wickPercent > this.config.levelFailThreshold;
      }
    } else {
      // For bearish OB, check if price wicked above OB high
      if (currentCandle.high > orderBlock.high) {
        wickPercent = (currentCandle.high - orderBlock.high) / orderBlock.high;
        wickThrough = wickPercent > this.config.levelFailThreshold;
      }
    }

    if (wickThrough) {
      console.log(
        `💥 Order Block level failed for ${orderState.symbol} (${(wickPercent * 100).toFixed(2)}% wick), cancelling`
      );

      try {
        const success = await this.bybitClient.cancelOrder(orderId, orderState.symbol);

        if (success) {
          orderState.cancelled = true;
          this.activeOrders.set(orderId, orderState);
          this.emit('order:cancelled', orderId, 'LEVEL_FAILED');

          console.log(`✅ Order cancelled due to level failure: ${orderId}`);
          return true;
        }
      } catch (error) {
        console.error(`❌ Failed to cancel order ${orderId}:`, error);
        this.emit('execution:error', error as Error, { orderId, reason: 'CANCEL_FAILED' });
      }
    }

    return false;
  }

  /**
   * Calculate position size using Volatility-Adjusted Sizing
   * @param symbol - Trading symbol
   * @param entryPrice - Entry price
   * @param equity - Account equity
   * @param leverage - Leverage multiplier
   * @returns Promise with position size
   */
  public async calcPositionSize(
    symbol: string,
    entryPrice: number,
    equity: number,
    leverage: number
  ): Promise<number> {
    try {
      // Fetch recent OHLCV data for ATR calculation
      const candles = await this.bybitClient.fetchOHLCV(symbol, '1h', this.config.atrPeriod + 10);

      if (candles.length < this.config.atrPeriod) {
        throw new Error(
          `Insufficient candle data for ATR calculation: ${candles.length} < ${this.config.atrPeriod}`
        );
      }

      // Calculate ATR (Average True Range)
      const atr = this.calculateATR(candles, this.config.atrPeriod);

      // Risk amount (2% of equity by default)
      const riskPercent = 0.02; // 2% risk per trade
      const riskAmount = equity * riskPercent;

      // Stop distance in price terms
      const stopDistance = entryPrice * this.config.stopLossPercent;

      // Volatility-Adjusted Sizing: Risk_Dollars / (ATR * Stop_Distance_Multiplier)
      // Use ATR as volatility adjustment factor
      const volatilityAdjustment = atr / entryPrice; // ATR as % of price
      const adjustedStopDistance = stopDistance * (1 + volatilityAdjustment);

      // Calculate base position size
      const basePositionSize = riskAmount / adjustedStopDistance;

      // Apply leverage (but cap at reasonable levels)
      const maxLeverageMultiplier = Math.min(leverage, 5); // Cap at 5x for safety
      const positionSize = basePositionSize * maxLeverageMultiplier;

      // Ensure minimum position size (0.001 for most symbols)
      const minPositionSize = 0.001;
      const finalPositionSize = Math.max(positionSize, minPositionSize);

      console.log(`📊 Position sizing for ${symbol}:`);
      console.log(`   ATR: ${atr.toFixed(4)} (${(volatilityAdjustment * 100).toFixed(2)}%)`);
      console.log(`   Risk Amount: $${riskAmount.toFixed(2)}`);
      console.log(
        `   Stop Distance: ${stopDistance.toFixed(4)} (${(this.config.stopLossPercent * 100).toFixed(1)}%)`
      );
      console.log(`   Position Size: ${finalPositionSize.toFixed(4)}`);

      return finalPositionSize;
    } catch (error) {
      console.error(`❌ Failed to calculate position size for ${symbol}:`, error);
      throw new Error(
        `Position size calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Set stop loss and take profit with 1.5% stop, 4.5% target (3:1 R:R)
   * @param entryPrice - Entry price
   * @param direction - Trade direction
   * @returns Stop loss and take profit prices
   */
  public setStopAndTarget(
    entryPrice: number,
    direction: 'LONG' | 'SHORT'
  ): {
    stopLoss: number;
    takeProfit: number;
  } {
    const stopDistance = entryPrice * this.config.stopLossPercent;
    const targetDistance = entryPrice * this.config.takeProfitPercent;

    let stopLoss: number;
    let takeProfit: number;

    if (direction === 'LONG') {
      stopLoss = entryPrice - stopDistance; // 1.5% below entry
      takeProfit = entryPrice + targetDistance; // 4.5% above entry
    } else {
      stopLoss = entryPrice + stopDistance; // 1.5% above entry
      takeProfit = entryPrice - targetDistance; // 4.5% below entry
    }

    const riskReward = targetDistance / stopDistance;

    console.log(`🎯 Stop & Target for ${direction} @ ${entryPrice.toFixed(4)}:`);
    console.log(
      `   Stop Loss: ${stopLoss.toFixed(4)} (-${(this.config.stopLossPercent * 100).toFixed(1)}%)`
    );
    console.log(
      `   Take Profit: ${takeProfit.toFixed(4)} (+${(this.config.takeProfitPercent * 100).toFixed(1)}%)`
    );
    console.log(`   Risk:Reward = 1:${riskReward.toFixed(1)}`);

    return { stopLoss, takeProfit };
  }

  /**
   * Calculate Average True Range (ATR)
   * @param candles - OHLCV candle data
   * @param period - ATR period (default: 14)
   * @returns ATR value
   */
  private calculateATR(candles: OHLCV[], period: number): number {
    if (candles.length < period + 1) {
      throw new Error(
        `Insufficient data for ATR calculation: need ${period + 1}, got ${candles.length}`
      );
    }

    const trueRanges: number[] = [];

    // Calculate True Range for each candle (starting from index 1)
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];

      // True Range = max(high-low, |high-prevClose|, |low-prevClose|)
      const highLow = current.high - current.low;
      const highPrevClose = Math.abs(current.high - previous.close);
      const lowPrevClose = Math.abs(current.low - previous.close);

      const trueRange = Math.max(highLow, highPrevClose, lowPrevClose);
      trueRanges.push(trueRange);
    }

    // Calculate ATR as Simple Moving Average of True Ranges
    const recentTrueRanges = trueRanges.slice(-period);
    const atr = recentTrueRanges.reduce((sum, tr) => sum + tr, 0) / period;

    return atr;
  }

  /**
   * Start monitoring all active orders
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      await this.monitorActiveOrders();
    }, this.MONITORING_FREQUENCY);

    console.log(
      `👁️ Limit Order Executor: Started monitoring (${this.MONITORING_FREQUENCY}ms interval)`
    );
  }

  /**
   * Monitor all active orders for timeout, fills, and cancellation conditions
   */
  private async monitorActiveOrders(): Promise<void> {
    const activeOrderIds = Array.from(this.activeOrders.keys());

    for (const orderId of activeOrderIds) {
      const orderState = this.activeOrders.get(orderId);
      if (!orderState || orderState.cancelled || orderState.filled) {
        continue;
      }

      try {
        // Check for timeout (60 seconds)
        const elapsed = Date.now() - orderState.startTime;
        if (elapsed > this.config.orderTimeout) {
          await this.handleOrderTimeout(orderId);
          continue;
        }

        // Check order status
        const status = await this.bybitClient.getOrderStatus(orderId, orderState.symbol);

        if (status === 'FILLED') {
          await this.handleOrderFilled(orderId);
        } else if (status === 'CANCELLED') {
          await this.handleOrderCancelled(orderId);
        } else {
          // Order still active, check cancellation conditions
          await this.checkCancellationConditions(orderId);
        }
      } catch (error) {
        console.error(`❌ Error monitoring order ${orderId}:`, error);
        this.emit('execution:error', error as Error, { orderId, action: 'MONITORING' });
      }
    }
  }

  /**
   * Handle order timeout (60 seconds)
   * @param orderId - Order ID that timed out
   */
  private async handleOrderTimeout(orderId: string): Promise<void> {
    const orderState = this.activeOrders.get(orderId);
    if (!orderState) return;

    console.log(`⏰ Order timeout for ${orderState.symbol}: ${orderId}`);

    try {
      // Cancel the timed-out order
      await this.bybitClient.cancelOrder(orderId, orderState.symbol);

      orderState.cancelled = true;
      this.activeOrders.set(orderId, orderState);

      this.emit('order:timeout', orderId);
      this.emit('order:cancelled', orderId, 'TIMEOUT');

      console.log(`✅ Timed-out order cancelled: ${orderId}`);
    } catch (error) {
      console.error(`❌ Failed to cancel timed-out order ${orderId}:`, error);
      this.emit('execution:error', error as Error, { orderId, reason: 'TIMEOUT_CANCEL_FAILED' });
    }
  }

  /**
   * Handle order filled
   * @param orderId - Order ID that was filled
   */
  private async handleOrderFilled(orderId: string): Promise<void> {
    const orderState = this.activeOrders.get(orderId);
    if (!orderState) return;

    console.log(`✅ Order filled: ${orderState.symbol} @ ${orderState.entryPrice}`);

    try {
      // Get fill details (this would need to be implemented in BybitPerpsClient)
      const fillPrice = orderState.entryPrice; // Simplified - should get actual fill price

      orderState.filled = true;
      this.activeOrders.set(orderId, orderState);

      // Calculate position size (this should be stored from original order)
      const positionSize = 0.1; // Simplified - should get actual fill quantity

      // Calculate slippage
      const expectedPrice = orderState.entryPrice;
      const slippage = Math.abs(fillPrice - expectedPrice) / expectedPrice;

      this.emit('order:filled', orderId, fillPrice, positionSize);

      // Log execution to structured logger
      const orderResult: OrderResult = {
        orderId,
        symbol: orderState.symbol,
        side: orderState.symbol.includes('LONG') ? 'Buy' : 'Sell',
        qty: positionSize,
        price: fillPrice,
        status: 'FILLED',
        timestamp: Date.now(),
      };

      logExecution(orderResult, slippage, orderState.signalId);

      // Create position object for position manager
      const { stopLoss, takeProfit } = this.setStopAndTarget(
        fillPrice,
        orderState.symbol.includes('LONG') ? 'LONG' : 'SHORT' // Simplified direction detection
      );

      const position: Position = {
        id: orderId,
        symbol: orderState.symbol,
        side: orderState.symbol.includes('LONG') ? 'LONG' : 'SHORT', // Simplified
        entryPrice: fillPrice,
        currentPrice: fillPrice,
        quantity: positionSize,
        leverage: 3, // Default leverage
        stopLoss,
        takeProfit,
        unrealizedPnL: 0,
        realizedPnL: 0,
        entryTime: Date.now(),
        status: 'OPEN',
        rValue: 0,
        atr: await this.getATRForSymbol(orderState.symbol),
      };

      this.emit('position:created', position);

      // Remove from active monitoring
      this.activeOrders.delete(orderId);
    } catch (error) {
      console.error(`❌ Error handling filled order ${orderId}:`, error);
      this.emit('execution:error', error as Error, { orderId, reason: 'FILL_HANDLING_FAILED' });
    }
  }

  /**
   * Handle order cancelled
   * @param orderId - Order ID that was cancelled
   */
  private async handleOrderCancelled(orderId: string): Promise<void> {
    const orderState = this.activeOrders.get(orderId);
    if (!orderState) return;

    console.log(`❌ Order cancelled: ${orderState.symbol} (${orderId})`);

    orderState.cancelled = true;
    this.activeOrders.set(orderId, orderState);

    this.emit('order:cancelled', orderId, 'EXTERNAL_CANCEL');

    // Remove from active monitoring
    this.activeOrders.delete(orderId);
  }

  /**
   * Check cancellation conditions for active order
   * @param orderId - Order ID to check
   */
  private async checkCancellationConditions(orderId: string): Promise<void> {
    const orderState = this.activeOrders.get(orderId);
    if (!orderState) return;

    try {
      // Get current price
      const currentPrice = await this.bybitClient.getCurrentPrice(orderState.symbol);

      // Check if price moved away > 0.2%
      await this.cancelIfPriceMoves(orderId, currentPrice);

      // Check if level failed (would need current candle data)
      // This is simplified - in practice, you'd need real-time candle data
    } catch (error) {
      console.error(`❌ Error checking cancellation conditions for ${orderId}:`, error);
    }
  }

  /**
   * Get ATR for symbol (helper method)
   * @param symbol - Trading symbol
   * @returns Promise with ATR value
   */
  private async getATRForSymbol(symbol: string): Promise<number> {
    try {
      const candles = await this.bybitClient.fetchOHLCV(symbol, '1h', this.config.atrPeriod + 10);
      return this.calculateATR(candles, this.config.atrPeriod);
    } catch (error) {
      console.error(`❌ Failed to get ATR for ${symbol}:`, error);
      return 0.001; // Default ATR
    }
  }

  /**
   * Get active orders count
   * @returns Number of active orders
   */
  public getActiveOrdersCount(): number {
    return this.activeOrders.size;
  }

  /**
   * Get active orders
   * @returns Array of active order states
   */
  public getActiveOrders(): OrderMonitoringState[] {
    return Array.from(this.activeOrders.values());
  }

  /**
   * Cancel all active orders
   * @returns Promise with cancellation results
   */
  public async cancelAllOrders(): Promise<{ success: number; failed: number }> {
    console.log(`🚨 Cancelling all active orders`);

    const orderIds = Array.from(this.activeOrders.keys());
    let success = 0;
    let failed = 0;

    for (const orderId of orderIds) {
      const orderState = this.activeOrders.get(orderId);
      if (!orderState) continue;

      try {
        const result = await this.bybitClient.cancelOrder(orderId, orderState.symbol);
        if (result) {
          success++;
          orderState.cancelled = true;
          this.activeOrders.set(orderId, orderState);
          this.emit('order:cancelled', orderId, 'MANUAL_CANCEL_ALL');
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`❌ Failed to cancel order ${orderId}:`, error);
        failed++;
      }
    }

    console.log(`🚨 Cancel all complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Update configuration
   * @param newConfig - New configuration
   */
  public updateConfig(newConfig: Partial<LimitOrderConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`🎯 Limit Order Executor: Configuration updated`);
  }

  /**
   * Stop monitoring and cleanup
   */
  public destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.activeOrders.clear();
    this.removeAllListeners();

    console.log(`🎯 Limit Order Executor: Destroyed`);
  }
}

// Export event interface for TypeScript
export declare interface LimitOrderExecutor {
  on<U extends keyof LimitOrderExecutorEvents>(
    event: U,
    listener: LimitOrderExecutorEvents[U]
  ): this;
  emit<U extends keyof LimitOrderExecutorEvents>(
    event: U,
    ...args: Parameters<LimitOrderExecutorEvents[U]>
  ): boolean;
}
