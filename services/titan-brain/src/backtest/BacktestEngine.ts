import { Logger } from '@titan/shared';
import { HistoricalDataService, OHLCV } from './HistoricalDataService.js';
import { BacktestClock } from '../utils/Clock.js';
import { BrainConfig } from '../config/BrainConfig.js';

export class BacktestEngine {
  private readonly clock: BacktestClock;
  private readonly logger: Logger;
  private readonly dataService: HistoricalDataService;

  constructor(
    config: BrainConfig,
    logger: Logger,
    dataService: HistoricalDataService,
    startTime: number,
  ) {
    this.logger = logger;
    this.dataService = dataService;
    this.clock = new BacktestClock(startTime);
  }

  async run(symbol: string, exchange: string, timeframe: string, start: Date, end: Date) {
    this.logger.info(
      `Starting backtest for ${symbol} on ${exchange} (${timeframe}) from ${start.toISOString()} to ${end.toISOString()}`,
    );

    // Fetch data
    const candles = await this.dataService.getCandles(symbol, exchange, timeframe, start, end);
    if (candles.length === 0) {
      this.logger.warn('No data found for backtest range');
      return;
    }

    this.logger.info(`Loaded ${candles.length} candles. Beginning replay...`);

    for (const candle of candles) {
      const candleTime = new Date(candle.timestamp).getTime();

      // Advance clock to candle time
      this.clock.setTime(candleTime);

      // TODO: Emit candle event to Strategy / Brain
      // brain.processCandle(candle);

      this.logger.debug(`Processed candle at ${candle.timestamp}`, undefined, {
        close: candle.close,
      });
    }

    this.logger.info('Backtest complete');
  }

  getClock() {
    return this.clock;
  }
}
