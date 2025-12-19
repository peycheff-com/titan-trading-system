/**
 * AdaptiveRateLimiter - API Ban Prevention
 * 
 * Prevents exchange API bans with automatic backoff.
 */

class AdaptiveRateLimiter {
    constructor() {
        this.limits = new Map();
        this.usage = new Map();
        this.backoff = new Map();
    }

    register(exchangeId, config) {
        this.limits.set(exchangeId, {
            requestsPerSecond: config.requestsPerSecond || 10,
            requestsPerMinute: config.requestsPerMinute || 1200,
            weightPerRequest: config.weightPerRequest || 1
        });
        this.usage.set(exchangeId, []);
        this.backoff.set(exchangeId, 1);
        console.log(`[RateLimiter] Registered ${exchangeId}: ${config.requestsPerMinute}/min`);
    }

    async throttle(exchangeId, weight = 1) {
        const limits = this.limits.get(exchangeId);
        if (!limits) {
            console.warn(`[RateLimiter] Exchange ${exchangeId} not registered`);
            return;
        }

        const usage = this.usage.get(exchangeId);
        const backoffMultiplier = this.backoff.get(exchangeId);
        const now = Date.now();

        const oneSecAgo = now - 1000;
        const oneMinAgo = now - 60000;
        const filtered = usage.filter(t => t.time > oneMinAgo);
        this.usage.set(exchangeId, filtered);

        const lastSecond = filtered.filter(t => t.time > oneSecAgo).reduce((sum, t) => sum + t.weight, 0);
        const lastMinute = filtered.reduce((sum, t) => sum + t.weight, 0);

        const adjustedPerSec = limits.requestsPerSecond / backoffMultiplier;
        const adjustedPerMin = limits.requestsPerMinute / backoffMultiplier;

        if (lastSecond + weight > adjustedPerSec) {
            await this.sleep(1000);
            return this.throttle(exchangeId, weight);
        }

        if (lastMinute + weight > adjustedPerMin) {
            console.warn(`[RateLimiter] ${exchangeId} minute limit - waiting 5s`);
            await this.sleep(5000);
            return this.throttle(exchangeId, weight);
        }

        filtered.push({ time: now, weight });
        this.usage.set(exchangeId, filtered);
    }

    handleRateLimitError(exchangeId, retryAfterMs = null) {
        const current = this.backoff.get(exchangeId) || 1;
        const newBackoff = Math.min(current * 2, 16);
        this.backoff.set(exchangeId, newBackoff);

        console.warn(`[RateLimiter] ${exchangeId} rate limited - backoff now ${newBackoff}x`);

        setTimeout(() => {
            const currentBackoff = this.backoff.get(exchangeId);
            if (currentBackoff === newBackoff) {
                this.backoff.set(exchangeId, Math.max(1, currentBackoff / 2));
            }
        }, 300000);

        return retryAfterMs || (1000 * newBackoff);
    }

    async execute(exchangeId, fn, weight = 1) {
        await this.throttle(exchangeId, weight);

        try {
            return await fn();
        } catch (err) {
            if (err.response?.status === 429 || err.code === 'RATE_LIMITED') {
                const retryAfter = err.response?.headers?.['retry-after'];
                const waitMs = this.handleRateLimitError(exchangeId, retryAfter ? parseInt(retryAfter) * 1000 : null);
                await this.sleep(waitMs);
                return this.execute(exchangeId, fn, weight);
            }
            throw err;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStatus(exchangeId) {
        const usage = this.usage.get(exchangeId) || [];
        const limits = this.limits.get(exchangeId);
        const backoff = this.backoff.get(exchangeId) || 1;
        const now = Date.now();
        const lastMinute = usage.filter(t => t.time > now - 60000);

        return {
            requestsLastMinute: lastMinute.reduce((s, t) => s + t.weight, 0),
            limitPerMinute: limits?.requestsPerMinute || 0,
            backoffMultiplier: backoff,
            healthy: backoff === 1
        };
    }
}

export { AdaptiveRateLimiter };
