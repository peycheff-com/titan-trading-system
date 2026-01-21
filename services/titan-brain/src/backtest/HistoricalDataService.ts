import { Logger } from '@titan/shared';
import { Pool } from 'pg';
import { BrainConfig } from '../config/BrainConfig.js';

export interface OHLCV {
  timestamp: string; // ISO string
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  exchange: string;
  timeframe: string;
}

export class HistoricalDataService {
  private db: Pool;
  private logger: Logger;

  constructor(config: BrainConfig, logger: Logger) {
    this.logger = logger;
    // Assuming BrainConfig would eventually expose DB config or we pass a pool.
    // For now using env vars or connection string from config if available.
    this.db = new Pool({
      connectionString:
        process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/titan',
    });
  }

  /**
   * Initialize the database schema for market data if it doesn't exist.
   */
  async initializeSchema(): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS market_data_ohlcv (
          time TIMESTAMPTZ NOT NULL,
          symbol TEXT NOT NULL,
          exchange TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          open DOUBLE PRECISION NOT NULL,
          high DOUBLE PRECISION NOT NULL,
          low DOUBLE PRECISION NOT NULL,
          close DOUBLE PRECISION NOT NULL,
          volume DOUBLE PRECISION NOT NULL,
          UNIQUE(time, symbol, exchange, timeframe)
        );
        -- Create hypertable if timescaledb extension exists (optional but recommended)
        -- SELECT create_hypertable('market_data_ohlcv', 'time', if_not_exists => TRUE);
      `);
      this.logger.info('Market data schema initialized');
    } catch (error) {
      this.logger.error('Failed to initialize market data schema', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save a batch of OHLCV candles.
   */
  async saveCandles(candles: OHLCV[]): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const queryText = `
        INSERT INTO market_data_ohlcv (time, symbol, exchange, timeframe, open, high, low, close, volume)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (time, symbol, exchange, timeframe) DO NOTHING
      `;

      for (const candle of candles) {
        await client.query(queryText, [
          candle.timestamp,
          candle.symbol,
          candle.exchange,
          candle.timeframe,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
        ]);
      }
      await client.query('COMMIT');
      this.logger.info(`Saved ${candles.length} candles`);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to save candles', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve candles for a specific range.
   */
  async getCandles(
    symbol: string,
    exchange: string,
    timeframe: string,
    start: Date,
    end: Date,
  ): Promise<OHLCV[]> {
    const client = await this.db.connect();
    try {
      const res = await client.query(
        `
        SELECT time, open, high, low, close, volume
        FROM market_data_ohlcv
        WHERE symbol = $1 AND exchange = $2 AND timeframe = $3 AND time >= $4 AND time <= $5
        ORDER BY time ASC
      `,
        [symbol, exchange, timeframe, start, end],
      );

      return res.rows.map((row) => ({
        timestamp: row.time.toISOString(),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        symbol,
        exchange,
        timeframe,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch candles', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.db.end();
  }
}
