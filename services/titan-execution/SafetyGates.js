/**
 * SafetyGates - Signal Safety Layer
 * 
 * Combines all safety modules into a single signal processing pipeline.
 */

import { DerivativesRegime } from './DerivativesRegime.js';
import { LiquidationDetector } from './LiquidationDetector.js';
import { AdaptiveRateLimiter } from './AdaptiveRateLimiter.js';
import { CircuitBreaker } from './CircuitBreaker.js';

class SafetyGates {
    constructor(config = {}) {
        this.derivativesRegime = new DerivativesRegime(config);
        this.liquidationDetector = new LiquidationDetector(config);
        this.rateLimiter = new AdaptiveRateLimiter();
        this.circuitBreaker = new CircuitBreaker(config);

        this.rateLimiter.register('binance', {
            requestsPerSecond: 10,
            requestsPerMinute: 1200
        });
    }

    async initialize(equity, symbol = 'BTCUSDT') {
        this.circuitBreaker.initialize(equity);
        this.liquidationDetector.start(symbol);

        this.liquidationDetector.on('cascade', (cascade) => {
            console.warn('[SafetyGates] Liquidation cascade:', cascade.direction, cascade.severity);
        });

        this.circuitBreaker.on('tripped', ({ message }) => {
            console.error('[SafetyGates] Circuit breaker tripped:', message);
        });

        console.log('[SafetyGates] Initialized');
    }

    async processSignal(signal) {
        // Gate 1: Circuit breaker (fastest - no API call)
        signal = this.circuitBreaker.gateSignal(signal);
        if (signal.blocked) {
            console.log(`[SafetyGates] Blocked by circuit breaker: ${signal.blockReason}`);
            return signal;
        }

        // Gate 2: Liquidation detector (no API call)
        signal = this.liquidationDetector.gateSignal(signal);
        if (signal.blocked) {
            console.log('[SafetyGates] Blocked by liquidation detector');
            return signal;
        }

        // Gate 3: Derivatives regime (requires API - rate limited)
        await this.rateLimiter.throttle('binance', 2);
        signal = await this.derivativesRegime.gateSignal(signal);
        if (signal.blocked) {
            console.log(`[SafetyGates] Blocked by derivatives regime: ${signal.regimeData?.regime}`);
            return signal;
        }

        return signal;
    }

    recordTrade(trade) {
        this.circuitBreaker.recordTrade(trade);
    }

    getStatus() {
        return {
            circuitBreaker: this.circuitBreaker.getState(),
            liquidationPaused: this.liquidationDetector.isTradingPaused(),
            rateLimiter: this.rateLimiter.getStatus('binance'),
            tradingAllowed: this.circuitBreaker.isTradingAllowed() && !this.liquidationDetector.isTradingPaused()
        };
    }

    stop() {
        this.liquidationDetector.stop();
    }
}

export { SafetyGates };
