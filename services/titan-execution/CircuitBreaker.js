/**
 * CircuitBreaker - Drawdown Protection
 * 
 * Stops trading after consecutive losses or max drawdown.
 */

import { EventEmitter } from 'events';

class CircuitBreaker extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            maxConsecutiveLosses: config.maxConsecutiveLosses || 3,
            maxDailyDrawdownPct: config.maxDailyDrawdownPct || 0.05,
            maxWeeklyDrawdownPct: config.maxWeeklyDrawdownPct || 0.10,
            cooldownHours: config.cooldownHours || 4,
            autoReset: config.autoReset ?? true,
            ...config
        };

        this.state = {
            consecutiveLosses: 0,
            dailyPnL: 0,
            weeklyPnL: 0,
            peakEquity: 0,
            currentEquity: 0,
            tripped: false,
            tripReason: null,
            tripTime: null,
            trades: []
        };
    }

    initialize(equity) {
        this.state.peakEquity = equity;
        this.state.currentEquity = equity;
        console.log(`[CircuitBreaker] Initialized with equity: $${equity}`);
    }

    recordTrade(trade) {
        const { pnl, equity } = trade;

        this.state.currentEquity = equity;
        if (equity > this.state.peakEquity) {
            this.state.peakEquity = equity;
        }

        this.state.dailyPnL += pnl;
        this.state.weeklyPnL += pnl;

        if (pnl < 0) {
            this.state.consecutiveLosses++;
        } else {
            this.state.consecutiveLosses = 0;
        }

        this.state.trades.push({ pnl, equity, timestamp: Date.now() });
        this.checkBreakers();
    }

    checkBreakers() {
        if (this.state.tripped) return;

        if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses) {
            this.trip('consecutive_losses', `${this.state.consecutiveLosses} consecutive losses`);
            return;
        }

        const dailyDrawdown = -this.state.dailyPnL / this.state.peakEquity;
        if (dailyDrawdown >= this.config.maxDailyDrawdownPct) {
            this.trip('daily_drawdown', `Daily drawdown ${(dailyDrawdown * 100).toFixed(1)}%`);
            return;
        }

        const weeklyDrawdown = -this.state.weeklyPnL / this.state.peakEquity;
        if (weeklyDrawdown >= this.config.maxWeeklyDrawdownPct) {
            this.trip('weekly_drawdown', `Weekly drawdown ${(weeklyDrawdown * 100).toFixed(1)}%`);
        }
    }

    trip(reason, message) {
        this.state.tripped = true;
        this.state.tripReason = reason;
        this.state.tripTime = Date.now();

        console.error(`[CircuitBreaker] TRIPPED: ${message}`);
        this.emit('tripped', { reason, message, state: this.getState() });

        if (this.config.autoReset) {
            setTimeout(() => this.reset(), this.config.cooldownHours * 3600000);
        }
    }

    reset() {
        this.state.tripped = false;
        this.state.tripReason = null;
        this.state.tripTime = null;
        this.state.consecutiveLosses = 0;
        console.log('[CircuitBreaker] Reset - trading enabled');
        this.emit('reset');
    }

    resetDaily() {
        this.state.dailyPnL = 0;
        this.state.trades = this.state.trades.filter(t => Date.now() - t.timestamp < 7 * 86400000);
    }

    resetWeekly() {
        this.state.weeklyPnL = 0;
    }

    isTradingAllowed() {
        return !this.state.tripped;
    }

    gateSignal(signal) {
        if (this.state.tripped) {
            const resumeTime = this.state.tripTime + (this.config.cooldownHours * 3600000);
            return {
                ...signal,
                blocked: true,
                blockReason: `circuit_breaker_${this.state.tripReason}`,
                resumeAt: resumeTime,
                manualResetRequired: !this.config.autoReset
            };
        }
        return signal;
    }

    getState() {
        return {
            ...this.state,
            drawdownFromPeak: this.state.peakEquity > 0
                ? (this.state.peakEquity - this.state.currentEquity) / this.state.peakEquity
                : 0
        };
    }
    /**
     * Update configuration dynamically
     * @param {Object} newConfig - New configuration values
     */
    updateConfig(newConfig) {
        if (!newConfig) return;
        
        const validKeys = ['maxConsecutiveLosses', 'maxDailyDrawdownPct', 'maxWeeklyDrawdownPct', 'cooldownHours', 'autoReset'];
        let updated = false;

        for (const key of validKeys) {
            if (newConfig[key] !== undefined) {
                this.config[key] = newConfig[key];
                updated = true;
            }
        }

        if (updated) {
            console.log('[CircuitBreaker] Configuration updated:', this.config);
            // Re-check breakers with new thresholds immediately
            this.checkBreakers();
        }
    }
}

export { CircuitBreaker };
