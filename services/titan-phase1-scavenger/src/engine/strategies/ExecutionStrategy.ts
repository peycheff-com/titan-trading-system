import { Tripwire } from '../../types/index.js';
import { TrapConfig } from '../../config/ConfigManager.js';
import { Logger } from '../../logging/Logger.js';

export interface ExecutionParams {
  orderType: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  maxSlippageBps: number;
}

export class ExecutionStrategy {
  constructor(private logger: Logger) {}

  determineExecutionParams(
    trap: Tripwire,
    config: TrapConfig,
    currentPrice: number,
    velocity: number,
    leaderStatus: 'BYBIT' | 'BINANCE' | 'EQUAL',
  ): ExecutionParams {
    // 1. Lead/Lag Slippage Adjustment
    let maxSlippageBps = 50;
    if (leaderStatus === 'BYBIT') {
      maxSlippageBps = 30;
      this.logger.warn(`   ⚠️ Perps Leading: Tightening slippage to 30bps`);
    }

    // 2. Dynamic Velocity Thresholds
    let extremeVelocity = config.extremeVelocityThreshold || 0.005;
    let moderateVelocity = config.moderateVelocityThreshold || 0.001;

    if (trap.volatilityMetrics?.atr) {
      if (trap.volatilityMetrics.regime === 'HIGH_VOL') {
        extremeVelocity *= 1.5;
        moderateVelocity *= 1.5;
        this.logger.info(`   🌊 High Volatility Regime: Scaling velocity thresholds x1.5`);
      } else if (trap.volatilityMetrics.regime === 'LOW_VOL') {
        extremeVelocity *= 0.8;
        moderateVelocity *= 0.8;
        this.logger.info(`   🧊 Low Volatility Regime: Scaling velocity thresholds x0.8`);
      }
    }

    // 3. Order Type Logic
    const aggressiveMarkup = config.aggressiveLimitMarkup || 0.002;
    let orderType: 'MARKET' | 'LIMIT';
    let limitPrice: number | undefined;

    if (velocity > extremeVelocity) {
      orderType = 'MARKET';
      this.logger.info(
        `   🚀 Using MARKET order (velocity: ${(velocity * 100).toFixed(
          2,
        )}% > ${extremeVelocity * 100}%)`,
      );
    } else if (velocity > moderateVelocity) {
      orderType = 'LIMIT';
      limitPrice =
        trap.direction === 'LONG'
          ? currentPrice * (1 + aggressiveMarkup)
          : currentPrice * (1 - aggressiveMarkup);
      this.logger.info(
        `   ⚡ Using AGGRESSIVE LIMIT at ${limitPrice.toFixed(
          2,
        )} (velocity: ${(velocity * 100).toFixed(2)}%)`,
      );
    } else {
      orderType = 'LIMIT';
      limitPrice = trap.direction === 'LONG' ? currentPrice * 1.0001 : currentPrice * 0.9999;
      this.logger.info(
        `   📍 Using LIMIT at ${limitPrice.toFixed(2)} (velocity: ${(velocity * 100).toFixed(2)}%)`,
      );
    }

    return { orderType, limitPrice, maxSlippageBps };
  }
}
