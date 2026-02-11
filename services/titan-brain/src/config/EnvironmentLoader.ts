import { EquityTier, TitanBrainConfigInput } from './ConfigSchema.js';

export function loadConfigFromEnvironment(): Partial<TitanBrainConfigInput> {
  return {
    ...loadBrainConfig(),
    ...loadAllocationConfig(),
    ...loadPerformanceConfig(),
    ...loadRiskConfig(),
    ...loadCapitalConfig(),
    ...loadBreakerConfig(),
    ...loadDatabaseConfig(),
    ...loadRedisConfig(),
    ...loadServerConfig(),
    ...loadNotificationConfig(),
    ...loadServicesConfig(),
    ...loadReconciliationConfig(),
  };
}

function loadBrainConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.BRAIN_SIGNAL_TIMEOUT || process.env.BRAIN_METRIC_UPDATE_INTERVAL) {
    return {
      brain: {
        signalTimeout: process.env.BRAIN_SIGNAL_TIMEOUT
          ? parseInt(process.env.BRAIN_SIGNAL_TIMEOUT)
          : undefined,
        metricUpdateInterval: process.env.BRAIN_METRIC_UPDATE_INTERVAL
          ? parseInt(process.env.BRAIN_METRIC_UPDATE_INTERVAL)
          : undefined,
        dashboardCacheTTL: process.env.BRAIN_DASHBOARD_CACHE_TTL
          ? parseInt(process.env.BRAIN_DASHBOARD_CACHE_TTL)
          : undefined,
        maxQueueSize: process.env.BRAIN_MAX_QUEUE_SIZE
          ? parseInt(process.env.BRAIN_MAX_QUEUE_SIZE)
          : undefined,
      },
    };
  }
  return {};
}

function loadAllocationConfig(): Partial<TitanBrainConfigInput> {
  if (
    process.env.ALLOCATION_START_P2 ||
    process.env.ALLOCATION_FULL_P2 ||
    process.env.ALLOCATION_START_P3
  ) {
    return {
      allocationEngine: {
        transitionPoints: {
          startP2: process.env.ALLOCATION_START_P2
            ? parseInt(process.env.ALLOCATION_START_P2)
            : undefined,
          fullP2: process.env.ALLOCATION_FULL_P2
            ? parseInt(process.env.ALLOCATION_FULL_P2)
            : undefined,
          startP3: process.env.ALLOCATION_START_P3
            ? parseInt(process.env.ALLOCATION_START_P3)
            : undefined,
        },
        leverageCaps: {
          [EquityTier.MICRO]: process.env.LEVERAGE_CAP_MICRO
            ? parseInt(process.env.LEVERAGE_CAP_MICRO)
            : undefined,
          [EquityTier.SMALL]: process.env.LEVERAGE_CAP_SMALL
            ? parseInt(process.env.LEVERAGE_CAP_SMALL)
            : undefined,
          [EquityTier.MEDIUM]: process.env.LEVERAGE_CAP_MEDIUM
            ? parseInt(process.env.LEVERAGE_CAP_MEDIUM)
            : undefined,
          [EquityTier.LARGE]: process.env.LEVERAGE_CAP_LARGE
            ? parseInt(process.env.LEVERAGE_CAP_LARGE)
            : undefined,
          [EquityTier.INSTITUTIONAL]: process.env.LEVERAGE_CAP_INSTITUTIONAL
            ? parseInt(process.env.LEVERAGE_CAP_INSTITUTIONAL)
            : undefined,
        },
      },
    };
  }
  return {};
}

function loadPerformanceConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.PERFORMANCE_WINDOW_DAYS || process.env.PERFORMANCE_MIN_TRADE_COUNT) {
    return {
      performanceTracker: {
        windowDays: process.env.PERFORMANCE_WINDOW_DAYS
          ? parseInt(process.env.PERFORMANCE_WINDOW_DAYS)
          : undefined,
        minTradeCount: process.env.PERFORMANCE_MIN_TRADE_COUNT
          ? parseInt(process.env.PERFORMANCE_MIN_TRADE_COUNT)
          : undefined,
        malusMultiplier: process.env.PERFORMANCE_MALUS_MULTIPLIER
          ? parseFloat(process.env.PERFORMANCE_MALUS_MULTIPLIER)
          : undefined,
        bonusMultiplier: process.env.PERFORMANCE_BONUS_MULTIPLIER
          ? parseFloat(process.env.PERFORMANCE_BONUS_MULTIPLIER)
          : undefined,
        malusThreshold: process.env.PERFORMANCE_MALUS_THRESHOLD
          ? parseFloat(process.env.PERFORMANCE_MALUS_THRESHOLD)
          : undefined,
        bonusThreshold: process.env.PERFORMANCE_BONUS_THRESHOLD
          ? parseFloat(process.env.PERFORMANCE_BONUS_THRESHOLD)
          : undefined,
      },
    };
  }
  return {};
}

function loadRiskConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.RISK_MAX_CORRELATION || process.env.RISK_CORRELATION_PENALTY) {
    return {
      riskGuardian: {
        maxCorrelation: process.env.RISK_MAX_CORRELATION
          ? parseFloat(process.env.RISK_MAX_CORRELATION)
          : undefined,
        correlationPenalty: process.env.RISK_CORRELATION_PENALTY
          ? parseFloat(process.env.RISK_CORRELATION_PENALTY)
          : undefined,
        betaUpdateInterval: process.env.RISK_BETA_UPDATE_INTERVAL
          ? parseInt(process.env.RISK_BETA_UPDATE_INTERVAL)
          : undefined,
        correlationUpdateInterval: process.env.RISK_CORRELATION_UPDATE_INTERVAL
          ? parseInt(process.env.RISK_CORRELATION_UPDATE_INTERVAL)
          : undefined,
        minStopDistanceMultiplier: process.env.RISK_MIN_STOP_DISTANCE_MULTIPLIER
          ? parseFloat(process.env.RISK_MIN_STOP_DISTANCE_MULTIPLIER)
          : undefined,
      },
    };
  }
  return {};
}

function loadCapitalConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.CAPITAL_SWEEP_THRESHOLD || process.env.CAPITAL_RESERVE_LIMIT) {
    return {
      capitalFlow: {
        sweepThreshold: process.env.CAPITAL_SWEEP_THRESHOLD
          ? parseFloat(process.env.CAPITAL_SWEEP_THRESHOLD)
          : undefined,
        reserveLimit: process.env.CAPITAL_RESERVE_LIMIT
          ? parseFloat(process.env.CAPITAL_RESERVE_LIMIT)
          : undefined,
        sweepSchedule: process.env.CAPITAL_SWEEP_SCHEDULE || undefined,
        maxRetries: process.env.CAPITAL_MAX_RETRIES
          ? parseInt(process.env.CAPITAL_MAX_RETRIES)
          : undefined,
        retryBaseDelay: process.env.CAPITAL_RETRY_BASE_DELAY
          ? parseInt(process.env.CAPITAL_RETRY_BASE_DELAY)
          : undefined,
      },
    };
  }
  return {};
}

function loadBreakerConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.BREAKER_MAX_DAILY_DRAWDOWN || process.env.BREAKER_MIN_EQUITY) {
    return {
      circuitBreaker: {
        maxDailyDrawdown: process.env.BREAKER_MAX_DAILY_DRAWDOWN
          ? parseFloat(process.env.BREAKER_MAX_DAILY_DRAWDOWN)
          : undefined,
        minEquity: process.env.BREAKER_MIN_EQUITY
          ? parseFloat(process.env.BREAKER_MIN_EQUITY)
          : undefined,
        consecutiveLossLimit: process.env.BREAKER_CONSECUTIVE_LOSS_LIMIT
          ? parseInt(process.env.BREAKER_CONSECUTIVE_LOSS_LIMIT)
          : undefined,
        consecutiveLossWindow: process.env.BREAKER_CONSECUTIVE_LOSS_WINDOW
          ? parseInt(process.env.BREAKER_CONSECUTIVE_LOSS_WINDOW)
          : undefined,
        cooldownMinutes: process.env.BREAKER_COOLDOWN_MINUTES
          ? parseInt(process.env.BREAKER_COOLDOWN_MINUTES)
          : undefined,
      },
    };
  }
  return {};
}

function loadDatabaseConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.DB_HOST) {
    return {
      database: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        maxConnections: process.env.DB_MAX_CONNECTIONS
          ? parseInt(process.env.DB_MAX_CONNECTIONS)
          : undefined,
        idleTimeout: process.env.DB_IDLE_TIMEOUT
          ? parseInt(process.env.DB_IDLE_TIMEOUT)
          : undefined,
      },
    };
  }
  return {};
}

function loadRedisConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.REDIS_URL) {
    return {
      redis: {
        url: process.env.REDIS_URL,
        maxRetries: process.env.REDIS_MAX_RETRIES
          ? parseInt(process.env.REDIS_MAX_RETRIES)
          : undefined,
        retryDelay: process.env.REDIS_RETRY_DELAY
          ? parseInt(process.env.REDIS_RETRY_DELAY)
          : undefined,
      },
    };
  }
  return {};
}

function loadServerConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.SERVER_PORT || process.env.SERVER_HOST) {
    return {
      server: {
        host: process.env.SERVER_HOST,
        port: process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : undefined,
        corsOrigins: process.env.CORS_ORIGINS?.split(','),
      },
    };
  }
  return {};
}

function loadNotificationConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.TELEGRAM_BOT_TOKEN || process.env.EMAIL_SMTP_HOST) {
    return {
      notifications: {
        telegram: {
          enabled: !!process.env.TELEGRAM_BOT_TOKEN,
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          chatId: process.env.TELEGRAM_CHAT_ID,
        },
        email: {
          enabled: !!process.env.EMAIL_SMTP_HOST,
          smtpHost: process.env.EMAIL_SMTP_HOST,
          smtpPort: process.env.EMAIL_SMTP_PORT ? parseInt(process.env.EMAIL_SMTP_PORT) : undefined,
          from: process.env.EMAIL_FROM,
          to: process.env.EMAIL_TO?.split(','),
        },
      },
    };
  }
  return {};
}

function loadServicesConfig(): Partial<TitanBrainConfigInput> {
  if (
    process.env.EXECUTION_SERVICE_URL ||
    process.env.PHASE1_WEBHOOK_URL ||
    process.env.PHASE2_WEBHOOK_URL ||
    process.env.PHASE3_WEBHOOK_URL
  ) {
    return {
      services: {
        executionUrl: process.env.EXECUTION_SERVICE_URL,
        phase1WebhookUrl: process.env.PHASE1_WEBHOOK_URL,
        phase2WebhookUrl: process.env.PHASE2_WEBHOOK_URL,
        phase3WebhookUrl: process.env.PHASE3_WEBHOOK_URL,
      },
    };
  }
  return {};
}

function loadReconciliationConfig(): Partial<TitanBrainConfigInput> {
  if (process.env.RECONCILIATION_INTERVAL || process.env.RECONCILIATION_EXCHANGES) {
    return {
      reconciliation: {
        intervalMs: process.env.RECONCILIATION_INTERVAL
          ? parseInt(process.env.RECONCILIATION_INTERVAL)
          : undefined,
        exchanges: process.env.RECONCILIATION_EXCHANGES?.split(','),
      },
    };
  }
  return {};
}
