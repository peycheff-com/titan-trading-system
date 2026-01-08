/**
 * Default Configuration for Titan Brain
 * Contains all default values for the system
 */

import { EquityTier, TitanBrainConfig } from "../types/index.js";

export const defaultConfig: TitanBrainConfig = {
  brain: {
    signalTimeout: 100, // 100ms max latency
    metricUpdateInterval: 60000, // 1 minute
    dashboardCacheTTL: 5000, // 5 seconds
    maxQueueSize: 100,
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
};

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): Partial<TitanBrainConfig> {
  const config: Partial<TitanBrainConfig> = {};

  // Database config from env
  if (process.env.DB_HOST) {
    config.database = {
      ...defaultConfig.database,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432"),
      database: process.env.DB_NAME || "titan_brain",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
    };
  }

  // Redis config from env
  if (process.env.REDIS_URL) {
    config.redis = {
      ...defaultConfig.redis,
      url: process.env.REDIS_URL,
    };
  }

  // Server config from env
  if (process.env.SERVER_PORT) {
    config.server = {
      ...defaultConfig.server,
      host: process.env.SERVER_HOST || "0.0.0.0",
      port: parseInt(process.env.PORT || process.env.SERVER_PORT || "3100"),
    };
  }

  // Telegram notifications from env
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    config.notifications = {
      ...defaultConfig.notifications,
      telegram: {
        enabled: true,
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
      },
    };
  }

  return config;
}

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
  };
}
