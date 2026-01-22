import { Tripwire } from '../../types/index.js';
import { TrapStrategy, TrapValidationResult } from './TrapStrategy.js';
import { VelocityCalculator } from '../../calculators/VelocityCalculator.js';
import { Logger } from '../../logging/Logger.js';

export class TrendValidator implements TrapStrategy {
  constructor(
    private velocityCalculator: VelocityCalculator,
    private logger: Logger,
  ) {}

  async validate(trap: Tripwire): Promise<TrapValidationResult> {
    // 1. Acceleration Check
    const acceleration = this.velocityCalculator.getAcceleration(trap.symbol);
    if (acceleration > 0) {
      this.logger.warn(`🛑 KNIFE-CATCH VETO: Price is accelerating (${acceleration.toFixed(4)})`);
      return { isValid: false, reason: 'Acceleration Veto' };
    }
    this.logger.info(`✅ ACCELERATION CHECK: Safe (Acc: ${acceleration.toFixed(4)})`);

    // 2. Trend ADX Check
    if (trap.adx && trap.adx > 25) {
      const isFadingTrend =
        (trap.direction === 'LONG' && trap.trend === 'DOWN') ||
        (trap.direction === 'SHORT' && trap.trend === 'UP');
      if (isFadingTrend) {
        this.logger.warn(
          `🛑 TREND VETO: Strong Trend (ADX: ${trap.adx.toFixed(2)}) is against us.`,
        );
        return { isValid: false, reason: 'Trend Veto' };
      }
    }

    return { isValid: true };
  }
}
