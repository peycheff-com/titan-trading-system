import { Logger } from '@titan/shared';
import { BacktestEngine } from './BacktestEngine.js';
import { BrainConfig } from '../config/BrainConfig.js';

export interface WalkForwardConfig {
  symbol: string;
  exchange: string;
  timeframe: string;
  trainWindowDays: number;
  testWindowDays: number;
  startDate: Date;
  endDate: Date;
}

export class WalkForwardVerifier {
  private readonly logger: Logger;
  private readonly engine: BacktestEngine;

  constructor(logger: Logger, engine: BacktestEngine) {
    this.logger = logger;
    this.engine = engine;
  }

  async run(config: WalkForwardConfig) {
    this.logger.info('Starting Walk-Forward Verification', undefined, {
      config,
    });

    let windowStart = new Date(config.startDate);

    while (windowStart < config.endDate) {
      const trainEnd = new Date(
        windowStart.getTime() + config.trainWindowDays * 24 * 60 * 60 * 1000,
      );
      const testEnd = new Date(trainEnd.getTime() + config.testWindowDays * 24 * 60 * 60 * 1000);

      if (trainEnd > config.endDate) break;

      this.logger.info(
        `Processing Window: Train [${windowStart.toISOString()} - ${trainEnd.toISOString()}] Test [${trainEnd.toISOString()} - ${testEnd.toISOString()}]`,
      );

      // 1. Train / Optimization Phase (Simulated)
      // In a real implementation, we would run multiple iterations with different params here
      // and pick the best set.
      this.logger.debug('Optimization phase (stubbed)');

      // 2. Test / Validation Phase
      // Run backtest with "best" params on out-of-sample data
      await this.engine.run(
        config.symbol,
        config.exchange,
        config.timeframe,
        trainEnd, // Start test where train ended
        testEnd > config.endDate ? config.endDate : testEnd,
      );

      // Slide window forward by test window size
      windowStart = new Date(windowStart.getTime() + config.testWindowDays * 24 * 60 * 60 * 1000);
    }

    this.logger.info('Walk-Forward Verification Complete');
  }
}
