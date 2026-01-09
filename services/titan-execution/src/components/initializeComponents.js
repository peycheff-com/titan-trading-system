/**
 * Component Initialization Module
 * 
 * Centralizes initialization of all core components for the Titan Execution service.
 * Provides clean separation between component setup and server configuration.
 */

import { join } from 'path';
import { ShadowState } from '../ShadowState.js';
import { ReplayGuard } from '../ReplayGuard.js';
import { WebSocketCache } from '../WebSocketCache.js';
import { L2Validator } from '../L2Validator.js';
import { BrokerGateway, MockBrokerAdapter } from '../BrokerGateway.js';
import { BybitAdapter } from '../adapters/BybitAdapter.js';
import { MexcAdapter } from '../adapters/MexcAdapter.js';
import { OrderManager } from '../OrderManager.js';
import { PhaseManager } from '../PhaseManager.js';
import { SafetyGates } from '../SafetyGates.js';
import { ConfigManager } from '../ConfigManager.js';
import { DatabaseManager } from '../DatabaseManager.js';

/**
 * Initialize broker adapter based on environment configuration
 * Supports MEXC (preferred) and Bybit exchanges
 * @param {Object} options - Broker options
 * @param {Object} logger - Logger instance
 * @returns {Object} Broker adapter instance
 */
export function initializeBrokerAdapter(options, logger) {
  const {
    useMockBroker,
    // MEXC options
    mexcApiKey,
    mexcApiSecret,
    mexcRateLimit,
    // Bybit options
    bybitApiKey,
    bybitApiSecret,
    bybitTestnet,
    bybitRateLimit,
    bybitMaxRetries,
    bybitCacheTtl,
    // Preferred broker
    preferredBroker,
  } = options;

  if (useMockBroker) {
    logger.info('Using mock broker adapter (USE_MOCK_BROKER=true)');
    return { adapter: new MockBrokerAdapter(), isReal: false };
  }

  // Check MEXC first (or if preferred)
  if (mexcApiKey && mexcApiSecret && (preferredBroker === 'MEXC' || !bybitApiKey)) {
    const adapter = new MexcAdapter({
      apiKey: mexcApiKey,
      apiSecret: mexcApiSecret,
      rateLimitPerSec: mexcRateLimit || 12,
    });

    logger.info({
      rateLimit: mexcRateLimit || 12,
    }, '✅ Using MEXC adapter');

    return { adapter, isReal: true, broker: 'MEXC' };
  }

  // Check Bybit
  if (bybitApiKey && bybitApiSecret) {
    const adapter = new BybitAdapter({
      apiKey: bybitApiKey,
      apiSecret: bybitApiSecret,
      testnet: bybitTestnet,
      rateLimitPerSec: bybitRateLimit,
      maxRetries: bybitMaxRetries,
      accountCacheTtlMs: bybitCacheTtl,
    });

    logger.info({
      testnet: bybitTestnet,
      rateLimit: bybitRateLimit,
    }, '✅ Using Bybit adapter');

    return { adapter, isReal: true, broker: 'BYBIT' };
  }

  // No API keys configured - use mock
  logger.warn('⚠️  No exchange API keys configured - using mock broker adapter');
  logger.warn('   Set MEXC_API_KEY/MEXC_API_SECRET or BYBIT_API_KEY/BYBIT_API_SECRET to enable live trading');

  return { adapter: new MockBrokerAdapter(), isReal: false };
}

/**
 * Initialize all core components
 * @param {Object} config - Internal configuration object
 * @param {string} basePath - Base path for file-based components
 * @param {Object} logger - Logger adapter instance
 * @returns {Object} Initialized components
 */
export async function initializeComponents(config, basePath, logger) {
  // Configuration Manager
  const configManager = new ConfigManager({
    configPath: join(basePath, 'config.json'),
    logger,
  });

  // Database Manager
  const databaseManager = new DatabaseManager({
    dbPath: join(basePath, 'titan_execution.db'),
    logger,
  });

  // Shadow State - Position tracking
  const shadowState = new ShadowState({
    logger,
  });

  // Replay Guard - Idempotency
  const replayGuard = new ReplayGuard({
    redisUrl: config.redisUrl,
    ttlMs: config.idempotencyTtl,
    logger,
  });

  // WebSocket Cache - Order book data
  const wsCache = new WebSocketCache({
    wsUrl: config.wsOrderbookUrl,
    maxAgeMs: config.wsCacheMaxAgeMs,
    logger,
  });

  // L2 Validator - Order book validation
  const l2Validator = new L2Validator({
    wsCache,
    maxSpreadPct: config.maxSpreadPct,
    logger,
  });

  // Broker Adapter - supports MEXC and Bybit
  const brokerOptions = {
    useMockBroker: process.env.USE_MOCK_BROKER === 'true',
    preferredBroker: process.env.PREFERRED_BROKER || 'MEXC', // MEXC or BYBIT
    // MEXC options
    mexcApiKey: process.env.MEXC_API_KEY,
    mexcApiSecret: process.env.MEXC_API_SECRET,
    mexcRateLimit: parseInt(process.env.MEXC_RATE_LIMIT || '12'),
    // Bybit options
    bybitApiKey: process.env.BYBIT_API_KEY,
    bybitApiSecret: process.env.BYBIT_API_SECRET,
    bybitTestnet: process.env.BYBIT_TESTNET === 'true',
    bybitRateLimit: parseInt(process.env.BYBIT_RATE_LIMIT || '10'),
    bybitMaxRetries: parseInt(process.env.BYBIT_MAX_RETRIES || '3'),
    bybitCacheTtl: parseInt(process.env.BYBIT_CACHE_TTL || '5000'),
  };

  const { adapter: brokerAdapter, isReal: isRealBroker, broker: activeBroker } = initializeBrokerAdapter(brokerOptions, logger);

  // Broker Gateway
  const brokerGateway = new BrokerGateway({
    adapter: brokerAdapter,
    logger,
    databaseManager,
  });

  // Order Manager
  const orderManager = new OrderManager({
    brokerGateway,
    shadowState,
    l2Validator,
    logger,
  });

  // Phase Manager
  const phaseManager = new PhaseManager({
    brokerGateway,
    phase1RiskPct: config.phase1RiskPct,
    phase2RiskPct: config.phase2RiskPct,
    logger,
  });

  // Safety Gates
  const safetyGates = new SafetyGates({
    maxConsecutiveLosses: config.maxConsecutiveLosses,
    maxDailyDrawdownPct: config.maxDailyDrawdownPct,
    maxWeeklyDrawdownPct: config.maxWeeklyDrawdownPct,
    circuitBreakerCooldownHours: config.circuitBreakerCooldownHours,
    fundingGreedThreshold: config.fundingGreedThreshold,
    fundingHighGreedThreshold: config.fundingHighGreedThreshold,
    fundingFearThreshold: config.fundingFearThreshold,
    logger,
  });

  return {
    configManager,
    databaseManager,
    shadowState,
    replayGuard,
    wsCache,
    l2Validator,
    brokerAdapter,
    brokerGateway,
    orderManager,
    phaseManager,
    safetyGates,
    isRealBroker,
  };
}

/**
 * Create a new broker gateway instance
 * Used for hot-reloading broker configuration
 * @param {Object} adapter - Broker adapter
 * @param {Object} logger - Logger instance
 * @param {Object} databaseManager - Database manager instance
 * @returns {BrokerGateway} New broker gateway instance
 */
export function createBrokerGateway(adapter, logger, databaseManager) {
  return new BrokerGateway({
    adapter,
    logger,
    databaseManager,
  });
}
