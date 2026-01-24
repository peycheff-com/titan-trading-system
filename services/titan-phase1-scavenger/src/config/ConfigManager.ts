/**
 * ConfigManager - Hierarchical Configuration Management (Adapter)
 *
 * Refactored to use @titan/shared ConfigManager Core.
 * Preserves existing Scavenger public API for compatibility.
 *
 * Requirements: 8.4 (Hierarchical Configuration), 3.1 (Shared Lib Adoption)
 */

import { EventEmitter } from "events";
import {
  ConfigManager as SharedConfigManager,
  getConfigManager,
} from "@titan/shared";

// Define the Scavenger-specific config interfaces
// These match the previous logic to ensure TitanTrap engine compatibility.

export interface TrapConfig {
  // Pre-Computation Settings
  updateInterval: number;
  topSymbolsCount: number;

  // Tripwire Thresholds
  liquidationConfidence: number;
  dailyLevelConfidence: number;
  bollingerConfidence: number;

  // Volume Validation
  minTradesIn100ms: number;
  volumeWindowMs: number;

  // Execution Settings
  extremeVelocityThreshold: number;
  moderateVelocityThreshold: number;
  aggressiveLimitMarkup: number;

  // Risk Management
  maxLeverage: number;
  maxPositionSizePercent: number;
  maxPositionSize: number; // Shared requirement
  stopLossPercent: number;
  targetPercent: number;

  // Shared PhaseConfig Requirements
  enabled: boolean;
  maxDrawdown: number;
  riskPerTrade: number;

  // Advanced Features
  ghostMode: boolean;

  // Exchange Settings
  exchanges: {
    binance: {
      enabled: boolean;
      executeOn: boolean;
      testnet: boolean;
      rateLimit: number;
      timeout: number;
    };
    bybit: {
      enabled: boolean;
      executeOn: boolean;
      testnet: boolean;
      rateLimit: number;
      timeout: number;
    };
    mexc: {
      enabled: boolean;
      executeOn: boolean;
      testnet: boolean;
      rateLimit: number;
      timeout: number;
    };
    [key: string]: {
      enabled: boolean;
      executeOn: boolean;
      testnet: boolean;
      rateLimit: number;
      timeout: number;
      apiKey?: string;
      apiSecret?: string;
    };
  };

  // Index signature to satisfy SharedPhaseConfig loose typing if needed
  [key: string]: unknown;
}

export interface BrainOverrideConfig {
  maxGlobalLeverage?: number;
  maxGlobalDrawdown?: number;
  emergencyFlattenEnabled?: boolean;
  phase1?: {
    enabled?: boolean;
    maxLeverage?: number;
    maxPositionSize?: number;
    riskMultiplier?: number;
  };
  source: "brain" | "phase" | "default";
  timestamp: number;
  version: string;
}

export interface MergedConfig extends TrapConfig {
  brainOverrides: BrainOverrideConfig;
  effective: {
    maxLeverage: number;
    maxPositionSizePercent: number;
    enabled: boolean;
    riskMultiplier: number;
  };
}

export interface ConfigChangeEvent {
  type: "phase" | "brain" | "merged";
  source: string;
  changes: Partial<TrapConfig | BrainOverrideConfig>;
  timestamp: number;
}

export class ConfigManager extends EventEmitter {
  private sharedManager: SharedConfigManager;
  private readonly phaseName = "phase1-scavenger";
  private environment: string;

  private currentConfig: MergedConfig;

  constructor(environment: string = process.env.NODE_ENV || "development") {
    super();
    this.environment = environment;

    this.sharedManager = getConfigManager(
      undefined,
      environment as "development" | "staging" | "production",
    );

    // Initialize with defaults to prevent NPE before load
    this.currentConfig = this.buildMergedConfig(
      this.getDefaultConfig(),
      this.getDefaultBrainOverrides(),
    );
  }

  public async initialize(): Promise<void> {
    // Load configurations via Shared Manager
    await this.sharedManager.loadBrainConfig();
    const phaseConfig = await this.sharedManager.loadPhaseConfig(
      this.phaseName,
    );

    // If config is empty/missing, apply defaults
    if (!phaseConfig || Object.keys(phaseConfig).length === 0) {
      console.log("📝 Initializing default configuration for Scavenger...");
      await this.savePhaseConfig(this.getDefaultConfig());
    } else {
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

  private handleSharedConfigChange(event: {
    level: string;
    key: string;
    timestamp?: number;
    [key: string]: unknown;
  }) {
    this.updateLocalState();

    // Map shared event to Scavenger event
    // Shared event: { level: 'phase'|'brain', key: string, ... }
    const type = event.level === "brain"
      ? "brain"
      : event.level === "phase" && event.key === this.phaseName
      ? "phase"
      : null;

    if (type) {
      this.emit("configChanged", {
        type: type as "phase" | "brain",
        source: "shared-manager",
        changes: {}, // Diffing logic delegated or simplified
        timestamp: event.timestamp || Date.now(),
      });
    }
  }

  private updateLocalState() {
    const rawPhase = this.sharedManager.getPhaseConfig(
      this.phaseName,
    ) as unknown as TrapConfig;
    const brainConfig = this.sharedManager.getBrainConfig();

    // Map Shared Brain Config to Scavenger BrainOverrideConfig
    const brainOverrides: BrainOverrideConfig = {
      source: "brain",
      timestamp: Date.now(),
      version: "2.0",
      maxGlobalLeverage: brainConfig?.maxTotalLeverage,
      maxGlobalDrawdown: brainConfig?.maxGlobalDrawdown,
      emergencyFlattenEnabled:
        (brainConfig?.emergencyFlattenThreshold ?? 0) > 0,
      // Extract specific phase overrides if they exist in valid structure
      phase1: brainConfig?.overrides
        ?.[this.phaseName] as BrainOverrideConfig["phase1"],
    };

    if (rawPhase) {
      this.currentConfig = this.buildMergedConfig(rawPhase, brainOverrides);
    }
  }

  private buildMergedConfig(
    phase: TrapConfig,
    brain: BrainOverrideConfig,
  ): MergedConfig {
    // In Shared Manager, getPhaseConfig() returns the MERGED (Applied) config.
    // So 'phase' argument here is already effectively merged.
    // We map it to the MergedConfig structure Scavenger expects.

    const effectiveMaxLeverage = Math.min(
      phase.maxLeverage,
      brain.maxGlobalLeverage ?? 100,
      brain.phase1?.maxLeverage ?? 100,
    );

    const effectiveMaxPosSize = Math.min(
      phase.maxPositionSizePercent,
      brain.phase1?.maxPositionSize ?? 1.0,
      // Map shared maxPositionSize if present
      phase.maxPositionSize ?? 1.0,
    );

    return {
      ...phase,
      brainOverrides: brain,
      effective: {
        maxLeverage: effectiveMaxLeverage,
        maxPositionSizePercent: effectiveMaxPosSize,
        enabled: phase.enabled && brain.phase1?.enabled !== false,
        riskMultiplier: brain.phase1?.riskMultiplier ?? 1.0,
      },
    };
  }

  // --- Public API Implementation ---

  getConfig(): MergedConfig {
    return this.currentConfig;
  }

  getPhaseConfig(): TrapConfig {
    return (
      (this.sharedManager.getPhaseConfig(
        this.phaseName,
      ) as unknown as TrapConfig) ||
      this.getDefaultConfig()
    );
  }

  updatePhaseConfig(updates: Partial<TrapConfig>): void {
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

  savePhaseConfig(config: TrapConfig): void {
    // Delegate to Shared Manager
    this.sharedManager.savePhaseConfig(this.phaseName, config);
    // Local state update happens via event listener or optimistic update
    this.updateLocalState();
  }

  updateBrainOverrides(_overrides: Partial<BrainOverrideConfig>): void {
    // In Shared architecture, Brain overrides are managed by Brain Service.
    // Scavenger shouldn't update Brain overrides directly usually.
    // But for compatibility we can log a warning or attempt to update local mock.
    console.warn(
      "⚠️ updateBrainOverrides is deprecated in Shared Architecture. Brain Service manages overrides.",
    );
  }

  // --- Helper Methods (Copied from original for API compat) ---

  updateRegimeSettings(settings: Partial<TrapConfig>): void {
    this.updatePhaseConfig(settings);
  }

  updateFlowSettings(settings: Partial<TrapConfig>): void {
    this.updatePhaseConfig(settings);
  }

  updateRiskSettings(settings: Partial<TrapConfig>): void {
    this.updatePhaseConfig(settings);
  }

  updateExchangeSettings(
    exchange: "bybit" | "mexc",
    settings: Partial<TrapConfig["exchanges"]["bybit"]>,
  ): void {
    const current = this.getPhaseConfig();
    if (current.exchanges && current.exchanges[exchange]) {
      const updatedExchanges = {
        ...current.exchanges,
        [exchange]: {
          ...current.exchanges[exchange],
          ...settings,
        },
      };
      this.updatePhaseConfig(
        { exchanges: updatedExchanges } as unknown as Partial<TrapConfig>,
      );
    }
  }

  private getDefaultConfig(): TrapConfig {
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
          rateLimit: 100,
          timeout: 5000,
        },
        bybit: {
          enabled: true,
          executeOn: false,
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

  private getDefaultBrainOverrides(): BrainOverrideConfig {
    return {
      source: "default",
      timestamp: Date.now(),
      version: "1.0",
    };
  }
}
