import { OHLCV } from "../types/index.js";

export class LatencyModel {
    private baseLatency: number;

    /**
     * Create a new LatencyModel
     * @param baseLatencyMs - Base latency in milliseconds (default 200ms for Bulgaria)
     */
    constructor(baseLatencyMs = 200) {
        this.baseLatency = baseLatencyMs;
    }

    /**
     * Apply latency penalty to execution price
     */
    applyLatencyPenalty(
        idealEntry: number,
        marketData: OHLCV[],
        timestamp: number,
    ): number {
        if (marketData.length === 0) {
            return idealEntry;
        }

        const delayedTimestamp = timestamp + this.baseLatency;
        const delayedPrice = this.interpolatePrice(
            marketData,
            delayedTimestamp,
        );

        if (delayedPrice === null || isNaN(delayedPrice)) {
            return idealEntry;
        }

        return delayedPrice;
    }

    /**
     * Calculate slippage based on ATR and liquidity state
     */
    calculateSlippage(
        orderSize: number,
        atr: number,
        liquidityState: number,
    ): number {
        if (atr <= 0 || orderSize <= 0) {
            return 0;
        }

        // Base slippage from ATR (10% of ATR as baseline)
        let slippage = atr * 0.1;

        // Liquidity multiplier
        // Low liquidity (0) = 2x slippage
        // Normal liquidity (1) = 1x slippage
        // High liquidity (2) = 0.5x slippage
        const liquidityMultiplier = this.getLiquidityMultiplier(liquidityState);
        slippage *= liquidityMultiplier;

        // Size impact: larger orders have more market impact
        const sizeMultiplier = Math.max(1, Math.log10(orderSize / 1000) + 1);
        slippage *= sizeMultiplier;

        return slippage;
    }

    interpolatePrice(marketData: OHLCV[], timestamp: number): number | null {
        if (marketData.length === 0) return null;

        // Binary search would be better, but linear scan for now on sorted data is acceptable for MVP
        // Assuming marketData is sorted by timestamp

        // Quick bounds check
        if (timestamp <= marketData[0].timestamp) return marketData[0].open;
        if (timestamp >= marketData[marketData.length - 1].timestamp) {
            return marketData[marketData.length - 1].close;
        }

        // Find bracketing candles
        // Optimization: Since we usually call this sequentially, passing an index hint would be better.
        // For "100%" completion, let's just do a simple find for now or binary search.
        // Given the array might be large, binary search is preferred.

        let low = 0;
        let high = marketData.length - 1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const candle = marketData[mid];

            if (candle.timestamp === timestamp) return candle.open;

            if (candle.timestamp < timestamp) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        // high is now the index of the candle BEFORE timestamp
        // low is the index of the candle AFTER timestamp

        const prevCandle = marketData[high];
        const nextCandle = marketData[low];

        if (prevCandle && nextCandle) {
            return this.linearInterpolate(
                prevCandle.timestamp,
                prevCandle.close,
                nextCandle.timestamp,
                nextCandle.open,
                timestamp,
            );
        }

        return prevCandle ? prevCandle.close : null;
    }

    getBaseLatency(): number {
        return this.baseLatency;
    }

    private getLiquidityMultiplier(liquidityState: number): number {
        switch (liquidityState) {
            case 0:
                return 2.0;
            case 1:
                return 1.0;
            case 2:
                return 0.5;
            default:
                return 1.0;
        }
    }

    private linearInterpolate(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        x: number,
    ): number {
        if (x2 === x1) return y1;
        const t = (x - x1) / (x2 - x1);
        return y1 + t * (y2 - y1);
    }
}
