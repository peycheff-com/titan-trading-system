/**
 * Configuration Module Exports
 */

// Inlined EquityTier to remove external dependency
export enum EquityTier {
  MICRO = "MICRO", // < $1,500
  SMALL = "SMALL", // $1,500 - $5,000
  MEDIUM = "MEDIUM", // $5,000 - $25,000
  LARGE = "LARGE", // $25,000 - $50,000
  INSTITUTIONAL = "INSTITUTIONAL", // > $50,000
}

// Loosen type to avoid importing from missing types module
export type TitanBrainConfig = any;

export const defaultConfig: TitanBrainConfig = {
  brain: {
    signalTimeout: 100, // 100ms max latency
    metricUpdateInterval: 60000, // 1 minute
    dashboardCacheTTL: 5000, // 5 seconds
    maxQueueSize: 100,
    initialCapital: 1000,
  },

  allocationEngine: {
    transitionPoints: {
      startP2: 1500, // Phase 2 starts at $1,500
      fullP2: 5000, // Phase 2 full allocation at $5,000
      startP3: 25000, // Phase 3 starts at $25,000
    },
    leverageCaps: {
      [EquityTier.MICRO]: 20, // < $1,500: 20x max
      [EquityTier.SMALL]: 10, // $1,500 - $5,000: 10x max
      [EquityTier.MEDIUM]: 5, // $5,000 - $25,000: 5x max
      [EquityTier.LARGE]: 3, // $25,000 - $50,000: 3x max
      [EquityTier.INSTITUTIONAL]: 2, // > $50,000: 2x max
    },
  },

  performanceTracker: {
    windowDays: 7,
    minTradeCount: 10,
    malusMultiplier: 0.5,
    bonusMultiplier: 1.2,
    malusThreshold: 0,
    bonusThreshold: 2.0,
  },

  riskGuardian: {
    maxCorrelation: 0.8,
    correlationPenalty: 0.5, // 50% size reduction
    betaUpdateInterval: 300000, // 5 minutes
    correlationUpdateInterval: 300000, // 5 minutes
    minStopDistanceMultiplier: 2.0, // 2x ATR default
    minConfidenceScore: 0.7,
    confidence: {
      decayRate: 0.1,
      recoveryRate: 0.01,
      threshold: 0.5,
    },
    fractal: {},
  },

  capitalFlow: {
    sweepThreshold: 1.2, // 20% excess triggers sweep
    reserveLimit: 200, // $200 minimum
    sweepSchedule: "0 0 * * *", // Daily at midnight UTC
    maxRetries: 3,
    retryBaseDelay: 1000, // 1 second
  },

  circuitBreaker: {
    maxDailyDrawdown: 0.15, // 15%
    minEquity: 150, // $150 (75% of $200 starting)
    consecutiveLossLimit: 3,
    consecutiveLossWindow: 3600000, // 1 hour
    cooldownMinutes: 30,
  },

  database: {
    host: "localhost",
    port: 5432,
    database: "titan_brain",
    user: "postgres",
    password: "postgres",
    maxConnections: 20,
    idleTimeout: 30000,
  },

  redis: {
    url: "redis://localhost:6379",
    maxRetries: 3,
    retryDelay: 1000,
  },

  server: {
    host: "0.0.0.0",
    port: 3100,
    corsOrigins: ["http://localhost:3000"],
  },

  notifications: {
    telegram: {
      enabled: false,
    },
    email: {
      enabled: false,
    },
  },

  activeInference: {
    distributionBins: 20,
    windowSize: 100, // 100 data points
    minHistory: 10,
    sensitivity: 5.0, // Sigmoid steepness
    surpriseOffset: 0.5, // Center of sigmoid
  },

  services: {
    executionUrl: undefined,
  },

  reconciliation: {
    intervalMs: 60000,
    exchanges: ["BYBIT"],
  },
};

/**
 * Merge configurations with defaults
 */
export function mergeConfig(
  partial: Partial<TitanBrainConfig>,
): TitanBrainConfig {
  return {
    brain: { ...defaultConfig.brain, ...partial.brain },
    allocationEngine: {
      ...defaultConfig.allocationEngine,
      ...partial.allocationEngine,
    },
    performanceTracker: {
      ...defaultConfig.performanceTracker,
      ...partial.performanceTracker,
    },
    riskGuardian: { ...defaultConfig.riskGuardian, ...partial.riskGuardian },
    capitalFlow: { ...defaultConfig.capitalFlow, ...partial.capitalFlow },
    circuitBreaker: {
      ...defaultConfig.circuitBreaker,
      ...partial.circuitBreaker,
    },
    database: { ...defaultConfig.database, ...partial.database },
    redis: { ...defaultConfig.redis, ...partial.redis },
    server: { ...defaultConfig.server, ...partial.server },
    notifications: {
      ...defaultConfig.notifications,
      ...partial.notifications,
    },
    activeInference: {
      ...defaultConfig.activeInference,
      ...partial.activeInference,
    },
    services: { ...defaultConfig.services, ...partial.services },
    reconciliation: {
      ...defaultConfig.reconciliation,
      ...partial.reconciliation,
    },
  };
}

export {
  ConfigLoader,
  ConfigValidationError,
  getConfigLoader,
  loadConfig,
  loadConfigFromEnvironment,
  loadConfigFromFile,
  resetConfigLoader,
  validateConfig,
} from "./ConfigLoader.js";

export type {
  ConfigLoaderOptions,
  ConfigLoaderResult,
  ValidationResult,
} from "./ConfigLoader.js";
