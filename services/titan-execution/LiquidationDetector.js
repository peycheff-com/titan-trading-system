/**
 * LiquidationDetector - Cascade Protection
 * 
 * Detects liquidation cascades and pauses trading.
 */

import axios from 'axios';
import { EventEmitter } from 'events';

class LiquidationDetector extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            oiDropThreshold: config.oiDropThreshold || 0.05,
            priceMoveThreshold: config.priceMoveThreshold || 0.03,
            volumeSpikeRatio: config.volumeSpikeRatio || 3,
            cooldownMs: config.cooldownMs || 900000,
            apiBaseUrl: config.apiBaseUrl || 'https://fapi.binance.com',
            checkIntervalMs: config.checkIntervalMs || 30000,
            ...config
        };

        this.lastOI = null;
        this.lastPrice = null;
        this.avgVolume = null;
        this.cascadeActive = false;
        this.cascadeEndTime = 0;
        this.checkInterval = null;
        this.symbol = 'BTCUSDT';
    }

    start(symbol = 'BTCUSDT') {
        this.symbol = symbol;
        this.check();
        this.checkInterval = setInterval(() => this.check(), this.config.checkIntervalMs);
        console.log(`[LiquidationDetector] Started monitoring ${symbol}`);
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    async check() {
        try {
            const [oiData, tickerData] = await Promise.all([
                this.getOpenInterest(),
                this.getTicker()
            ]);

            const currentOI = parseFloat(oiData.openInterest);
            const currentPrice = parseFloat(tickerData.lastPrice);
            const volume24h = parseFloat(tickerData.volume);

            if (!this.lastOI) {
                this.lastOI = currentOI;
                this.lastPrice = currentPrice;
                this.avgVolume = volume24h;
                return;
            }

            const oiChange = (currentOI - this.lastOI) / this.lastOI;
            const priceChange = (currentPrice - this.lastPrice) / this.lastPrice;
            const volumeRatio = volume24h / this.avgVolume;

            const cascade = this.detectCascade(oiChange, priceChange, volumeRatio);

            if (cascade.detected && !this.cascadeActive) {
                this.cascadeActive = true;
                this.cascadeEndTime = Date.now() + this.config.cooldownMs;
                console.warn('[LiquidationDetector] CASCADE DETECTED:', cascade);
                this.emit('cascade', cascade);
            }

            this.lastOI = currentOI * 0.1 + this.lastOI * 0.9;
            this.lastPrice = currentPrice;
            this.avgVolume = volume24h * 0.05 + this.avgVolume * 0.95;

            if (this.cascadeActive && Date.now() > this.cascadeEndTime) {
                this.cascadeActive = false;
                console.log('[LiquidationDetector] Cascade cooldown ended');
                this.emit('cascade_ended');
            }
        } catch (err) {
            console.error('[LiquidationDetector] Check failed:', err.message);
        }
    }

    detectCascade(oiChange, priceChange, volumeRatio) {
        const conditions = {
            rapidOIDrop: oiChange < -this.config.oiDropThreshold,
            largePriceMove: Math.abs(priceChange) > this.config.priceMoveThreshold,
            volumeSpike: volumeRatio > this.config.volumeSpikeRatio
        };

        const conditionsMet = Object.values(conditions).filter(Boolean).length;

        if (conditionsMet >= 2) {
            return {
                detected: true,
                direction: priceChange < 0 ? 'LONG_LIQUIDATION' : 'SHORT_LIQUIDATION',
                severity: conditionsMet === 3 ? 'SEVERE' : 'MODERATE',
                conditions,
                metrics: { oiChange, priceChange, volumeRatio }
            };
        }
        return { detected: false, conditions };
    }

    async getOpenInterest() {
        const resp = await axios.get(`${this.config.apiBaseUrl}/fapi/v1/openInterest`, {
            params: { symbol: this.symbol },
            timeout: 5000
        });
        return resp.data;
    }

    async getTicker() {
        const resp = await axios.get(`${this.config.apiBaseUrl}/fapi/v1/ticker/24hr`, {
            params: { symbol: this.symbol },
            timeout: 5000
        });
        return resp.data;
    }

    isTradingPaused() {
        return this.cascadeActive;
    }

    gateSignal(signal) {
        if (this.cascadeActive) {
            return {
                ...signal,
                blocked: true,
                blockReason: 'liquidation_cascade',
                resumeAt: this.cascadeEndTime
            };
        }
        return signal;
    }
}

export { LiquidationDetector };
