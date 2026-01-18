import { EventEmitter } from "events";
import { HawkesProcess } from "@titan/shared/src/utils/math/HawkesProcess.js";
import { PowerLawCalculators } from "@titan/shared/src/utils/math/PowerLawCalculators.js";
/**
 * BurstDetector
 *
 * Detects "Micro-Bursts" in order flow and "Power Law" price moves.
 *
 * Components:
 * 1. Hawkes Process: Models trade arrival intensity.
 * 2. Volatility Z-Score: Normalizes price moves by current volatility.
 *
 * Signals:
 * - BURST_DETECTED: When trade intensity > threshold (clustering).
 * - TAIL_MOVE_DETECTED: When price move > k * sigma (fat tail event).
 */
export class BurstDetector extends EventEmitter {
    hawkes;
    volScaler;
    // Configuration
    hawkesThreshold;
    tailZScoreThreshold;
    // State
    lastPrice = 0;
    recentIntensities = [];
    /**
     * @param volScaler Instance of VolatilityScaler
     * @param hawkesThreshold Intensity threshold for burst detection (default 20.0)
     * @param tailZScoreThreshold Sigma z-score for tail events (default 4.0)
     */
    constructor(volScaler, hawkesThreshold = 20.0, tailZScoreThreshold = 4.0) {
        super();
        this.volScaler = volScaler;
        this.hawkesThreshold = hawkesThreshold;
        this.tailZScoreThreshold = tailZScoreThreshold;
        // Initialize Hawkes with crypto-tuned params (fast decay for HFT)
        // mu=1 trade/s, alpha=0.5 (jump), beta=2.0 (fast decay usually < 1s in HFT)
        this.hawkes = new HawkesProcess(1.0, 0.5, 2.0);
    }
    /**
     * Process a new trade
     */
    processTrade(trade, currentVolatility) {
        // 1. Update Hawkes Process (Trade Arrival Intensity)
        // Normalize trade size into the "jump" (alpha) if desired,
        // but for now we just count "events" (arrival rate).
        // Optionally, could make alpha proportional to log(qty).
        const intensity = this.hawkes.addEvent(trade.time / 1000);
        // Check for Burst
        if (intensity > this.hawkesThreshold) {
            this.emit("BURST_DETECTED", {
                symbol: trade.symbol,
                intensity: intensity,
                timestamp: trade.time,
            });
        }
        // 2. Check for Tail Move (Price Z-Score)
        if (this.lastPrice > 0 && currentVolatility > 0) {
            const priceMovePct = (trade.price - this.lastPrice) /
                this.lastPrice;
            const absMove = Math.abs(priceMovePct);
            // Calculate Z-Score
            // Scale-Invariant Trigger: Is this move big RELATIVE to vol?
            const zScore = PowerLawCalculators.calculateVolatilityZScore(absMove, currentVolatility);
            if (zScore > this.tailZScoreThreshold) {
                this.emit("TAIL_MOVE_DETECTED", {
                    symbol: trade.symbol,
                    price: trade.price,
                    zScore: zScore,
                    volatility: currentVolatility,
                    timestamp: trade.time,
                });
            }
        }
        this.lastPrice = trade.price;
    }
    /**
     * Get current burst intensity
     */
    getIntensity() {
        return this.hawkes.getIntensity();
    }
}
//# sourceMappingURL=BurstDetector.js.map