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
    /**
     * Update configuration dynamically
     * @param {Object} config - Configuration updates for safety components
     */
    updateConfig(config) {
        if (config.circuit_breaker) {
            this.circuitBreaker.updateConfig(config.circuit_breaker);
        }
        
        if (config.rate_limiter || config.system) {
            // Support both direct rate_limiter config and system.rate_limit_per_sec
            const newLimit = config.rate_limiter?.requestsPerSecond || config.system?.rate_limit_per_sec;
            
            if (newLimit) {
                this.rateLimiter.updateLimits('binance', {
                    requestsPerSecond: newLimit,
                    // Scale per minute limit proportionally or keep default? 
                    // Let's assume per minute is 60 * per second for now to keep it safe
                    requestsPerMinute: newLimit * 60 
                });
            }
        }

        console.log('[SafetyGates] Configuration updated');
    }
}

export { SafetyGates };
