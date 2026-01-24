import {
    ConfigManager,
    MergedConfig,
    TrapConfig,
} from "titan-phase1-scavenger/dist/config/ConfigManager.js";
import { EventEmitter } from "events";

export class MockConfigManager extends EventEmitter {
    private config: MergedConfig;

    constructor() {
        super();
        this.config = this.getDefaultConfig();
    }

    getConfig(): MergedConfig {
        return this.config;
    }

    getPhaseConfig(): TrapConfig {
        return this.config;
    }

    // Helper to modify config during test
    public setConfig(updates: Partial<MergedConfig>) {
        this.config = { ...this.config, ...updates };
        this.emit("configChanged", {
            type: "merged",
            source: "mock",
            changes: updates,
            timestamp: Date.now(),
        });
    }

    private getDefaultConfig(): MergedConfig {
        return {
            updateInterval: 1000,
            topSymbolsCount: 10,
            liquidationConfidence: 95,
            dailyLevelConfidence: 85,
            bollingerConfidence: 90,
            minTradesIn100ms: 10,
            volumeWindowMs: 100,
            extremeVelocityThreshold: 0.005,
            moderateVelocityThreshold: 0.001,
            aggressiveLimitMarkup: 0.002,
            maxLeverage: 10,
            maxPositionSizePercent: 0.5,
            maxPositionSize: 0.5,
            stopLossPercent: 0.01,
            targetPercent: 0.03,
            enabled: true,
            maxDrawdown: 0.2,
            riskPerTrade: 0.01,
            ghostMode: false, // We want "real" execution in backtest (captured by mock client)
            exchanges: {
                binance: {
                    enabled: true,
                    executeOn: false,
                    testnet: false,
                    rateLimit: 100,
                    timeout: 5000,
                },
                bybit: {
                    enabled: true,
                    executeOn: true,
                    testnet: false,
                    rateLimit: 100,
                    timeout: 5000,
                },
                mexc: {
                    enabled: false,
                    executeOn: false,
                    testnet: false,
                    rateLimit: 100,
                    timeout: 5000,
                },
            },
            brainOverrides: {
                source: "default",
                timestamp: Date.now(),
                version: "1.0",
            },
            effective: {
                maxLeverage: 10,
                maxPositionSizePercent: 0.5,
                enabled: true,
                riskMultiplier: 1.0,
            },
            // Index signature
            ["mock"]: true,
        } as MergedConfig;
    }
}
