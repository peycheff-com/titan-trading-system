/**
 * DerivativesRegime - Funding + OI Risk Gating
 * 
 * Gates trades based on derivatives market conditions.
 * NOT alpha generation - risk management only.
 */

import axios from 'axios';

class DerivativesRegime {
    constructor(config = {}) {
        this.config = {
            extremeGreedThreshold: config.extremeGreedThreshold || 100,
            highGreedThreshold: config.highGreedThreshold || 50,
            extremeFearThreshold: config.extremeFearThreshold || -50,
            oiSpikeThreshold: config.oiSpikeThreshold || 0.10,
            apiBaseUrl: config.apiBaseUrl || 'https://fapi.binance.com',
            cacheTTL: config.cacheTTL || 60000,
            ...config
        };

        this.cache = { data: null, timestamp: 0 };
    }

    async getFundingRate(symbol = 'BTCUSDT') {
        try {
            const resp = await axios.get(`${this.config.apiBaseUrl}/fapi/v1/premiumIndex`, {
                params: { symbol },
                timeout: 5000
            });
            return parseFloat(resp.data.lastFundingRate);
        } catch (err) {
            console.error('[DerivativesRegime] Funding rate fetch failed:', err.message);
            return 0;
        }
    }

    async getOpenInterest(symbol = 'BTCUSDT') {
        try {
            const resp = await axios.get(`${this.config.apiBaseUrl}/fapi/v1/openInterest`, {
                params: { symbol },
                timeout: 5000
            });
            return parseFloat(resp.data.openInterest);
        } catch (err) {
            console.error('[DerivativesRegime] OI fetch failed:', err.message);
            return null;
        }
    }

    async getRegime(symbol = 'BTCUSDT') {
        if (Date.now() - this.cache.timestamp < this.config.cacheTTL && this.cache.data) {
            return this.cache.data;
        }

        const fundingRate = await this.getFundingRate(symbol);
        const oi = await this.getOpenInterest(symbol);
        const fundingAnnualized = fundingRate * 3 * 365 * 100;
        const regime = this.classifyRegime(fundingAnnualized);

        const result = {
            fundingRate,
            fundingAnnualized,
            openInterest: oi,
            regime: regime.name,
            riskLevel: regime.risk,
            tradingAllowed: regime.tradingAllowed,
            sizeMultiplier: regime.sizeMultiplier,
            message: regime.message,
            timestamp: Date.now()
        };

        this.cache = { data: result, timestamp: Date.now() };
        return result;
    }

    classifyRegime(fundingAnnualized) {
        if (fundingAnnualized > this.config.extremeGreedThreshold) {
            return {
                name: 'EXTREME_GREED',
                risk: 'CRITICAL',
                tradingAllowed: { long: false, short: true },
                sizeMultiplier: 0.25,
                message: 'Funding >100% annualized - longs blocked'
            };
        }

        if (fundingAnnualized > this.config.highGreedThreshold) {
            return {
                name: 'HIGH_GREED',
                risk: 'HIGH',
                tradingAllowed: { long: true, short: true },
                sizeMultiplier: 0.5,
                message: 'Funding 50-100% - reduce long exposure'
            };
        }

        if (fundingAnnualized < this.config.extremeFearThreshold) {
            return {
                name: 'EXTREME_FEAR',
                risk: 'OPPORTUNITY',
                tradingAllowed: { long: true, short: false },
                sizeMultiplier: 1.25,
                message: 'Negative funding - short squeeze likely'
            };
        }

        return {
            name: 'NEUTRAL',
            risk: 'LOW',
            tradingAllowed: { long: true, short: true },
            sizeMultiplier: 1.0,
            message: 'Normal market conditions'
        };
    }

    async gateSignal(signal) {
        const regime = await this.getRegime(signal.symbol || 'BTCUSDT');
        const direction = signal.direction?.toUpperCase();

        if (direction === 'LONG' && !regime.tradingAllowed.long) {
            return { ...signal, blocked: true, blockReason: `derivatives_regime_${regime.regime}`, regimeData: regime };
        }
        if (direction === 'SHORT' && !regime.tradingAllowed.short) {
            return { ...signal, blocked: true, blockReason: `derivatives_regime_${regime.regime}`, regimeData: regime };
        }

        signal.sizeMultiplier = (signal.sizeMultiplier || 1) * regime.sizeMultiplier;
        signal.regimeData = regime;
        return signal;
    }
}

export { DerivativesRegime };
