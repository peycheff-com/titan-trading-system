import { Logger } from "@titan/shared";
import { Pool } from "pg";
import { OHLCV, RegimeSnapshot } from "../types/index.js";

export class HistoricalDataService {
    private db: Pool;
    private logger: Logger;

    constructor(logger: Logger, dbConfig?: { connectionString: string }) {
        this.logger = logger;
        this.db = new Pool({
            connectionString: dbConfig?.connectionString ||
                process.env.DATABASE_URL ||
                "postgres://postgres:postgres@localhost:5432/titan",
        });
    }

    async getCandles(
        symbol: string,
        timeframe: string,
        start: number,
        end: number,
    ): Promise<OHLCV[]> {
        const client = await this.db.connect();
        try {
            // Basic query
            const res = await client.query(
                `
        SELECT time, open, high, low, close, volume
        FROM market_data_ohlcv
        WHERE symbol = $1 AND timeframe = $2
          AND time >= to_timestamp($3::double precision / 1000)
          AND time <= to_timestamp($4::double precision / 1000)
        ORDER BY time ASC
        `,
                [symbol, timeframe, start, end],
            );

            const candles = res.rows.map((row) => ({
                timestamp: new Date(row.time).getTime(),
                open: parseFloat(row.open),
                high: parseFloat(row.high),
                low: parseFloat(row.low),
                close: parseFloat(row.close),
                volume: parseFloat(row.volume),
                symbol,
                timeframe,
            }));

            // INTEGRITY CHECK: Gap Detection
            this.validateContinuity(candles, timeframe);

            return candles;
        } finally {
            client.release();
        }
    }

    async getRegimeSnapshots(
        symbol: string,
        start: number,
        end: number,
    ): Promise<RegimeSnapshot[]> {
        const client = await this.db.connect();
        try {
            // Check if table exists first (optional safety) or just query
            // Assuming market_regimes table exists with schema:
            // time: timestamptz, symbol: text, trend: int, vol: int, liq: int
            const res = await client.query(
                `
                SELECT time, symbol, trend_state, vol_state, liq_state
                FROM market_regimes
                WHERE symbol = $1
                  AND time >= to_timestamp($2::double precision / 1000)
                  AND time <= to_timestamp($3::double precision / 1000)
                ORDER BY time ASC
                `,
                [symbol, start, end],
            );

            return res.rows.map((row) => ({
                timestamp: new Date(row.time).getTime(),
                symbol: row.symbol,
                trendState: row.trend_state, // -1, 0, 1
                volState: row.vol_state, // 0, 1, 2
                liquidityState: row.liq_state, // 0, 1, 2
            }));
        } catch (error) {
            this.logger.warn(
                `Failed to fetch regime snapshots for ${symbol}`,
                String(error),
            );
            return []; // Fallback to empty
        } finally {
            client.release();
        }
    }

    private validateContinuity(candles: OHLCV[], timeframe: string) {
        if (candles.length < 2) return;

        const intervalMs = this.parseTimeframe(timeframe);
        for (let i = 1; i < candles.length; i++) {
            const diff = candles[i].timestamp - candles[i - 1].timestamp;
            if (diff > intervalMs * 1.5) { // Allow slight jitter, but flag big gaps
                this.logger.warn(
                    `Data Gap detected for ${candles[i].symbol} ${timeframe}`,
                    undefined,
                    {
                        start: candles[i - 1].timestamp,
                        end: candles[i].timestamp,
                        gapMs: diff,
                    },
                );
            }
        }
    }

    private parseTimeframe(tf: string): number {
        const unit = tf.slice(-1);
        const val = parseInt(tf.slice(0, -1));
        if (unit === "m") return val * 60 * 1000;
        if (unit === "h") return val * 3600 * 1000;
        if (unit === "d") return val * 86400 * 1000;
        return 60000; // Default 1m
    }
}
