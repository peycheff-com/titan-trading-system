/**
 * Basis Arb Detector (The Rubber Band)
 *
 * Strategy: Exploit Spot-Perp price disconnects during extreme volatility
 *
 * The Physics:
 * During extreme volatility, Perp price disconnects from Spot. Perp MUST return
 * to Spot price - it's mathematical law. The basis (Spot - Perp) / Spot represents
 * a rubber band that will snap back.
 *
 * The Edge:
 * HFTs close this gap, but during panic they widen spreads or turn off. That leaves
 * a 5-30 second window - you can drive a truck through it from Bulgaria (200ms latency).
 *
 * Detection Criteria:
 * 1. Basis > 0.5% (Perp is discounted relative to Spot)
 * 2. 24h volume > $1M (not a dead market)
 * 3. Perp must converge to Spot (mathematical certainty)
 *
 * Entry:
 * - Enter at Perp price + 0.1% (aggressive entry)
 * - Target: Spot price * 0.999 (slight discount for safety)
 * - Stop: Perp price * 0.995 (-0.5% tight stop)
 * - Confidence: 85%
 * - Leverage: 10x
 */
export class BasisArbDetector {
    binanceClient;
    bybitClient;
    isGeoBlocked = false;
    constructor(binanceClient, bybitClient) {
        this.binanceClient = binanceClient;
        this.bybitClient = bybitClient; // Can be null when using titan-execution service
    }
    /**
     * Detect Basis Arb pattern
     *
     * Returns a Tripwire if all conditions are met:
     * - Basis > 0.5% (Perp is discounted)
     * - 24h volume > $1M (not dead market)
     * - Perp will converge to Spot (mathematical certainty)
     */
    async detectBasisArb(symbol) {
        if (this.isGeoBlocked)
            return null;
        try {
            // 1. Get Spot price from Binance
            const spotPrice = await this.binanceClient.getSpotPrice(symbol);
            // 2. Get Perp price from Bybit
            const perpPrice = await this.bybitClient.getCurrentPrice(symbol);
            // 3. Calculate basis: (Spot - Perp) / Spot
            const basis = (spotPrice - perpPrice) / spotPrice;
            // 4. Check if basis exceeds threshold (Perp is discounted)
            if (basis <= 0.005) {
                // Basis <= 0.5%, not significant enough
                return null;
            }
            console.log(`🔍 Checking basis arb: ${symbol} (Basis: ${(basis * 100).toFixed(2)}%)`);
            // 5. Validate with volume (ensure it's not a dead market)
            const volume = await this.bybitClient.get24hVolume(symbol);
            if (volume < 1000000) {
                // Volume < $1M, market too illiquid
                return null;
            }
            // 6. Calculate target (Perp converges to Spot)
            const targetPrice = spotPrice * 0.999; // Slight discount for safety
            // 7. Calculate stop loss (tight stop for arb)
            const stopLoss = perpPrice * 0.995; // -0.5% stop
            console.log(`🎯 BASIS ARB DETECTED: ${symbol}`);
            console.log(`   Spot: ${spotPrice.toFixed(2)}`);
            console.log(`   Perp: ${perpPrice.toFixed(2)}`);
            console.log(`   Basis: ${(basis * 100).toFixed(2)}%`);
            console.log(`   Volume: $${(volume / 1000000).toFixed(1)}M`);
            console.log(`   Target: ${targetPrice.toFixed(2)} (+${((targetPrice / perpPrice - 1) * 100).toFixed(1)}%)`);
            return {
                symbol,
                triggerPrice: perpPrice * 1.001, // Aggressive entry (+0.1%)
                direction: "LONG",
                trapType: "BASIS_ARB",
                confidence: 85,
                leverage: 10,
                estimatedCascadeSize: basis, // Expected convergence
                activated: false,
                targetPrice,
                stopLoss,
            };
        }
        catch (error) {
            // Check for Geo-blocking (HTTP 403)
            if (error && (error.message || "").includes("403")) {
                if (!this.isGeoBlocked) {
                    console.warn(`⛔ Geo-blocking detected for ${symbol} (HTTP 403). Disabling BasisArbDetector.`);
                    this.isGeoBlocked = true;
                }
                return null;
            }
            console.error(`Error detecting basis arb for ${symbol}:`, error);
            return null;
        }
    }
}
//# sourceMappingURL=BasisArbDetector.js.map