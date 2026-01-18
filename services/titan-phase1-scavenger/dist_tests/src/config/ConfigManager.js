/**
 * ConfigManager - Hierarchical Configuration Management (Adapter)
 *
 * Refactored to use @titan/shared ConfigManager Core.
 * Preserves existing Scavenger public API for compatibility.
 *
 * Requirements: 8.4 (Hierarchical Configuration), 3.1 (Shared Lib Adoption)
 */
import { EventEmitter } from "events";
import { getConfigManager, } from "@titan/shared";
export class ConfigManager extends EventEmitter {
    sharedManager;
    phaseName = "phase1-scavenger";
    environment;
    currentConfig;
    constructor(environment = process.env.NODE_ENV || "development") {
        super();
        this.environment = environment;
        // Initialize Shared Manager
        // Using default config paths (usually ~/.titan or ./config)
        this.sharedManager = getConfigManager(undefined, environment);
        // Initialize with defaults to prevent NPE before load
        this.currentConfig = this.buildMergedConfig(this.getDefaultConfig(), this.getDefaultBrainOverrides());
        this.init();
    }
    async init() {
        try {
            // Load configurations via Shared Manager
            await this.sharedManager.loadBrainConfig();
            const phaseConfig = await this.sharedManager.loadPhaseConfig(this.phaseName);
            // If config is empty/missing, apply defaults
            if (!phaseConfig || Object.keys(phaseConfig).length === 0) {
                console.log("📝 Initializing default configuration for Scavenger...");
                await this.savePhaseConfig(this.getDefaultConfig());
            }
            else {
                this.updateLocalState();
            }
            // Setup Event Listeners from Shared Manager
            this.sharedManager.on("configChanged", (event) => {
                this.handleSharedConfigChange(event);
            });
            this.sharedManager.on("configReloaded", (event) => {
                this.handleSharedConfigChange(event);
            });
            console.log("✅ ConfigManager Adapter initialized via @titan/shared");
        }
        catch (err) {
            console.error("❌ ConfigManager loading failed:", err);
            // Fallback to defaults already set in constructor
        }
    }
    handleSharedConfigChange(event) {
        this.updateLocalState();
        // Map shared event to Scavenger event
        // Shared event: { level: 'phase'|'brain', key: string, ... }
        const type = event.level === "brain"
            ? "brain"
            : (event.level === "phase" && event.key === this.phaseName)
                ? "phase"
                : null;
        if (type) {
            this.emit("configChanged", {
                type: type,
                source: "shared-manager",
                changes: {}, // Diffing logic delegated or simplified
                timestamp: event.timestamp || Date.now(),
            });
        }
    }
    updateLocalState() {
        const rawPhase = this.sharedManager.getPhaseConfig(this.phaseName);
        const brainConfig = this.sharedManager.getBrainConfig();
        // Map Shared Brain Config to Scavenger BrainOverrideConfig
        const brainOverrides = {
            source: "brain",
            timestamp: Date.now(),
            version: "2.0",
            maxGlobalLeverage: brainConfig?.maxTotalLeverage,
            maxGlobalDrawdown: brainConfig?.maxGlobalDrawdown,
            emergencyFlattenEnabled: (brainConfig?.emergencyFlattenThreshold ?? 0) > 0,
            // Extract specific phase overrides if they exist in valid structure
            phase1: brainConfig?.overrides?.[this.phaseName],
        };
        if (rawPhase) {
            this.currentConfig = this.buildMergedConfig(rawPhase, brainOverrides);
        }
    }
    buildMergedConfig(phase, brain) {
        // In Shared Manager, getPhaseConfig() returns the MERGED (Applied) config.
        // So 'phase' argument here is already effectively merged.
        // We map it to the MergedConfig structure Scavenger expects.
        const effectiveMaxLeverage = Math.min(phase.maxLeverage, brain.maxGlobalLeverage ?? 100, brain.phase1?.maxLeverage ?? 100);
        const effectiveMaxPosSize = Math.min(phase.maxPositionSizePercent, brain.phase1?.maxPositionSize ?? 1.0, 
        // Map shared maxPositionSize if present
        phase.maxPositionSize ?? 1.0);
        return {
            ...phase,
            brainOverrides: brain,
            effective: {
                maxLeverage: effectiveMaxLeverage,
                maxPositionSizePercent: effectiveMaxPosSize,
                enabled: (phase.enabled) && (brain.phase1?.enabled !== false),
                riskMultiplier: brain.phase1?.riskMultiplier ?? 1.0,
            },
        };
    }
    // --- Public API Implementation ---
    getConfig() {
        return this.currentConfig;
    }
    getPhaseConfig() {
        return this.sharedManager.getPhaseConfig(this.phaseName) || this.getDefaultConfig();
    }
    updatePhaseConfig(updates) {
        const current = this.getPhaseConfig();
        const updated = {
            ...current,
            ...updates,
            exchanges: {
                ...current.exchanges,
                ...(updates.exchanges || {}),
            },
        };
        this.savePhaseConfig(updated);
    }
    savePhaseConfig(config) {
        // Delegate to Shared Manager
        this.sharedManager.savePhaseConfig(this.phaseName, config);
        // Local state update happens via event listener or optimistic update
        this.updateLocalState();
    }
    updateBrainOverrides(overrides) {
        // In Shared architecture, Brain overrides are managed by Brain Service.
        // Scavenger shouldn't update Brain overrides directly usually.
        // But for compatibility we can log a warning or attempt to update local mock.
        console.warn("⚠️ updateBrainOverrides is deprecated in Shared Architecture. Brain Service manages overrides.");
    }
    // --- Helper Methods (Copied from original for API compat) ---
    updateRegimeSettings(settings) {
        this.updatePhaseConfig(settings);
    }
    updateFlowSettings(settings) {
        this.updatePhaseConfig(settings);
    }
    updateRiskSettings(settings) {
        this.updatePhaseConfig(settings);
    }
    updateExchangeSettings(exchange, settings) {
        const current = this.getPhaseConfig();
        if (current.exchanges && current.exchanges[exchange]) {
            const updatedExchanges = {
                ...current.exchanges,
                [exchange]: {
                    ...current.exchanges[exchange],
                    ...settings,
                },
            };
            this.updatePhaseConfig({ exchanges: updatedExchanges });
        }
    }
    getDefaultConfig() {
        return {
            updateInterval: 60000,
            topSymbolsCount: 20,
            liquidationConfidence: 95,
            dailyLevelConfidence: 85,
            bollingerConfidence: 90,
            minTradesIn100ms: 50,
            volumeWindowMs: 100,
            extremeVelocityThreshold: 0.005,
            moderateVelocityThreshold: 0.001,
            aggressiveLimitMarkup: 0.002,
            maxLeverage: 20,
            maxPositionSizePercent: 0.5,
            maxPositionSize: 0.5, // Sync with percent
            stopLossPercent: 0.01,
            targetPercent: 0.03,
            // Shared Requirements
            enabled: true,
            maxDrawdown: 0.2, // 20% max drawdown default
            riskPerTrade: 0.01, // 1% risk per trade default
            ghostMode: true,
            exchanges: {
                binance: {
                    enabled: true,
                    executeOn: false,
                    testnet: false,
                    rateLimit: 1200,
                    timeout: 5000,
                },
                bybit: {
                    enabled: true,
                    executeOn: true,
                    testnet: false,
                    rateLimit: 100, // 100 requests per second (approx)
                    timeout: 5000,
                },
                mexc: {
                    enabled: false,
                    executeOn: false,
                    testnet: false,
                    rateLimit: 60,
                    timeout: 5000,
                },
            },
        };
    }
    getDefaultBrainOverrides() {
        return {
            source: "default",
            timestamp: Date.now(),
            version: "1.0",
        };
    }
}
//# sourceMappingURL=ConfigManager.js.map