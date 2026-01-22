import { Logger } from '../../logging/Logger.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import { EventEmitter } from '../../events/EventEmitter.js';
import { TrapStateManager } from './TrapStateManager.js';
import { TrapExecutor } from './TrapExecutor.js';
import { VelocityCalculator } from '../../calculators/VelocityCalculator.js';
import { CVDCalculator } from '../../calculators/CVDCalculator.js';
import { LeadLagDetector } from '../../calculators/LeadLagDetector.js';
import { Trade, Tripwire } from '../../types/index.js';

interface TrapDetectorDependencies {
  logger: Logger;
  config: ConfigManager;
  eventEmitter: EventEmitter;
  stateManager: TrapStateManager;
  executor: TrapExecutor;
  velocityCalculator: VelocityCalculator;
  cvdCalculator: CVDCalculator;
  leadLagDetector: LeadLagDetector;
}

/**
 * TrapDetector (The Spider)
 *
 * Monitors real-time market data to detect when traps are sprung.
 */
export class TrapDetector {
  private logger: Logger;
  private config: ConfigManager;
  private eventEmitter: EventEmitter;
  private stateManager: TrapStateManager;
  private executor: TrapExecutor;
  private velocityCalculator: VelocityCalculator;
  private cvdCalculator: CVDCalculator;
  private leadLagDetector: LeadLagDetector;

  constructor(dependencies: TrapDetectorDependencies) {
    this.logger = dependencies.logger;
    this.config = dependencies.config;
    this.eventEmitter = dependencies.eventEmitter;
    this.stateManager = dependencies.stateManager;
    this.executor = dependencies.executor;
    this.velocityCalculator = dependencies.velocityCalculator;
    this.cvdCalculator = dependencies.cvdCalculator;
    this.leadLagDetector = dependencies.leadLagDetector;
  }

  /**
   * Handle Bybit Ticker Updates (Execution/Perp Layer)
   */
  onBybitTicker(symbol: string, price: number, timestamp: number): void {
    this.leadLagDetector.recordPrice(symbol, 'BYBIT', price, timestamp);
  }

  /**
   * Real-time WebSocket handler for Binance Spot ticks.
   */
  onBinanceTick(symbol: string, price: number, trades: Trade[]): void {
    // 0. CHECK BLACKLIST
    if (this.stateManager.isBlacklisted(symbol)) {
      return;
    }

    const traps = this.stateManager.getTraps(symbol);
    if (!traps) return;

    // Record price
    const exchangeTime = trades[0].time;
    this.stateManager.setLatestPrice(symbol, price);
    this.velocityCalculator.recordPrice(symbol, price, exchangeTime);
    this.leadLagDetector.recordPrice(symbol, 'BINANCE', price, exchangeTime);

    // Feed CVD
    for (const trade of trades) {
      this.cvdCalculator.recordTrade(trade);
    }

    for (const trap of traps) {
      if (trap.activated) continue;

      // Cooldown check (5 min)
      const timeSinceActivation = Date.now() - (trap.activatedAt || 0);
      if (trap.activatedAt && timeSinceActivation < 300000) {
        continue;
      }

      // Check price trigger (0.1%)
      const priceDistance = Math.abs(price - trap.triggerPrice) / trap.triggerPrice;
      if (priceDistance > 0.001) continue;

      // Volume Accumulation
      let counter = this.stateManager.getVolumeCounter(symbol);
      if (!counter) {
        counter = {
          count: 0,
          buyVolume: 0,
          sellVolume: 0,
          startTime: Date.now(),
        };
        this.stateManager.setVolumeCounter(symbol, counter);
      }

      counter.count += trades.length;

      // Micro-CVD
      for (const trade of trades) {
        if (!trade.isBuyerMaker) {
          counter.buyVolume += trade.qty; // Taker BUY
        } else {
          counter.sellVolume += trade.qty; // Taker SELL
        }
      }

      // 100ms Window Check
      const elapsed = Date.now() - counter.startTime;
      if (elapsed >= 100) {
        const minTrades = this.config.getConfig().minTradesIn100ms || 50;

        if (counter.count >= minTrades) {
          const microCVD = counter.buyVolume - counter.sellVolume;

          this.logger.info(
            `⚡ TRAP SPRUNG: ${symbol} at ${price.toFixed(
              2,
            )} (${counter.count} trades, CVD: ${microCVD.toFixed(4)})`,
          );

          this.eventEmitter.emit('TRAP_SPRUNG', {
            symbol,
            price,
            trapType: trap.trapType,
            direction: trap.direction,
            tradeCount: counter.count,
            microCVD,
            elapsed,
          });

          // Phase 2: Confirmation Check (200ms Delay)
          const totalVolume = counter.buyVolume + counter.sellVolume;
          this.logger.info(`   ⏳ PENDING CONFIRMATION: Waiting 200ms...`);

          setTimeout(() => {
            this.checkConfirmation(symbol, trap, microCVD, totalVolume);
          }, 200);
        }

        // Reset
        this.stateManager.deleteVolumeCounter(symbol);
      }
    }
  }

  private async checkConfirmation(
    symbol: string,
    trap: Tripwire,
    microCVD: number,
    burstVolume: number,
  ): Promise<void> {
    const currentPrice = this.stateManager.getLatestPrice(symbol);

    if (!currentPrice) {
      this.logger.warn(`⚠️ Confirmation failed: No price data for ${symbol}`);
      return;
    }

    let isHolding = false;

    if (trap.direction === 'LONG') {
      isHolding = currentPrice >= trap.triggerPrice * 0.9995;
    } else {
      isHolding = currentPrice <= trap.triggerPrice * 1.0005;
    }

    if (isHolding) {
      this.logger.info(
        `✅ CONFIRMATION PASSED: ${symbol} holding at ${currentPrice.toFixed(
          2,
        )} vs Trigger ${trap.triggerPrice.toFixed(2)}`,
      );
      await this.executor.fire(trap, microCVD, burstVolume);
    } else {
      this.logger.warn(
        `❌ CONFIRMATION FAILED (WICK): ${symbol} reverted to ${currentPrice.toFixed(
          2,
        )} (Trigger: ${trap.triggerPrice.toFixed(2)})`,
      );
      this.eventEmitter.emit('TRAP_ABORTED', {
        symbol,
        reason: 'WICK_REVERSION',
        timestamp: Date.now(),
      });
    }
  }
}
