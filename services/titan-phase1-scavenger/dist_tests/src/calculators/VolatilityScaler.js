/**
 * Volatility Scaler
 *
 * Implements adaptive risk management logic based on market volatility (ATR).
 *
 * Logic:
 * - Calculates ATR (Average True Range) over a specified period.
 * - Determines a "Volatility Regime" (Low, Medium, High, Extreme).
 * - Returns multipliers for:
 *   1. Stop Loss (Wider in high volatility)
 *   2. Position Size (Smaller in high volatility)
 *   3. Sensitivity (Higher threshold in high volatility)
 */
export class VolatilityScaler {
    DEFAULT_PERIOD = 14;
    BASE_ATR_PERCENT = 0.5; // Baseline volatility (0.5% price movement)
    /**
     * Calculate volatility metrics for a symbol
     */
    calculateMetrics(ohlcv, period = this.DEFAULT_PERIOD) {
        if (ohlcv.length < period + 1) {
            // Not enough data, return defaults
            return this.getDefaultMetrics();
        }
        const atr = this.calculateATR(ohlcv, period);
        const currentPrice = ohlcv[ohlcv.length - 1].close;
        const atrPercent = (atr / currentPrice) * 100;
        // Determine multipliers based on deviation from baseline
        // Ratio > 1 means higher volatility than baseline
        const ratio = atrPercent / this.BASE_ATR_PERCENT;
        // Cap ratio to avoid extreme values (0.5x to 3.0x)
        const clampedRatio = Math.min(Math.max(ratio, 0.5), 3.0);
        let regime = "NORMAL";
        if (clampedRatio < 0.8)
            regime = "LOW";
        else if (clampedRatio > 1.5)
            regime = "HIGH";
        else if (clampedRatio > 2.5)
            regime = "EXTREME";
        return {
            atr,
            atrPercent,
            regime,
            // High Volatility -> Wider Stop Loss (up to 2x)
            stopLossMultiplier: Math.min(clampedRatio, 2.0),
            // High Volatility -> Smaller Position Size (down to 0.5x)
            // Inverse relationship: 1 / ratio
            positionSizeMultiplier: Math.max(1 / clampedRatio, 0.33),
            // High Volatility -> Higher Sensitivity Threshold (to avoid noise)
            sensitivityMultiplier: Math.min(clampedRatio, 1.5),
        };
    }
    /**
     * Calculate Average True Range (ATR)
     */
    calculateATR(ohlcv, period) {
        // 1. Calculate True Ranges (TR)
        // TR = Max(High-Low, Abs(High-PrevClose), Abs(Low-PrevClose))
        const trueRanges = [];
        // Start from index 1 (need previous close)
        for (let i = ohlcv.length - period - 1; i < ohlcv.length; i++) {
            if (i <= 0)
                continue; // Skip first candle if it's index 0
            const current = ohlcv[i];
            const prev = ohlcv[i - 1];
            const tr = Math.max(current.high - current.low, Math.abs(current.high - prev.close), Math.abs(current.low - prev.close));
            trueRanges.push(tr);
        }
        // 2. Calculate Average (Simple Moving Average of TRs for simplicity/speed)
        // Standard ATR uses Wilder's Smoothing, but SMA is sufficient for this adaptive logic
        const sum = trueRanges.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    }
    getDefaultMetrics() {
        return {
            atr: 0,
            atrPercent: 0,
            regime: "NORMAL",
            stopLossMultiplier: 1.0,
            positionSizeMultiplier: 1.0,
            sensitivityMultiplier: 1.0,
        };
    }
}
//# sourceMappingURL=VolatilityScaler.js.map