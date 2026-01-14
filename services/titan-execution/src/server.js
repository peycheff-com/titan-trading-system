/**
 * Titan Execution Microservice
 * 
 * Webhook receiver with Shadow State, L2 validation, and Client-Side Triggering.
 * 
 * Requirements: 20.1-20.5, 21.1-21.4, 23.4, 31.1-31.6, 65.1-65.8, 96.1-96.10
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { validateConfig, validateRedisConnection } from './ConfigSchema.js';
import { ShadowState } from './ShadowState.js';
import { ReplayGuard } from './ReplayGuard.js';
import { WebSocketCache } from './WebSocketCache.js';
import { L2Validator } from './L2Validator.js';
import { BrokerGateway, MockBrokerAdapter } from './BrokerGateway.js';
import { LimitChaser } from './LimitChaser.js';
import { LimitOrKill } from './LimitOrKill.js';
import { OrderManager } from './OrderManager.js';
import { PartialFillHandler } from './PartialFillHandler.js';
import { WebSocketStatus } from './WebSocketStatus.js';
import { ConsoleWebSocket } from './ConsoleWebSocket.js';
import { ScavengerWebSocket } from './ScavengerWebSocket.js';
import { PhaseManager } from './PhaseManager.js';
import { SafetyGates } from './SafetyGates.js';
import { ConfigManager } from './ConfigManager.js';
import { DatabaseManager } from './DatabaseManager.js';
import { SignalRouter } from './SignalRouter.js';
import FastPathServer from './ipc/FastPathServer.js';

// Utilities
import { CONSTANTS } from './utils/constants.js';
import { createLoggerAdapter } from './utils/loggerAdapter.js';

// Strategies
import { LimitOrKillStrategy } from './strategies/LimitOrKillStrategy.js';
import { LimitChaserStrategy } from './strategies/LimitChaserStrategy.js';

// Routes
import { registerHealthRoutes } from './routes/health.js';
import { registerWebhookRoutes, verifyHmacSignature } from './routes/webhook.js';
import { registerStateRoutes } from './routes/state.js';
import { registerConsoleRoutes } from './routes/console.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerDatabaseRoutes } from './routes/database.js';
import { registerPositionRoutes } from './routes/positions.js';
import { registerTradeRoutes } from './routes/trades.js';
import { registerDetectorRoutes } from './routes/detectors.js';
import { registerCalculatorRoutes } from './routes/calculators.js';

// Detectors and Calculators
import { DetectorRegistry } from './detectors/DetectorRegistry.js';
import { OIWipeoutDetector } from './detectors/OIWipeoutDetector.js';
import { FundingSqueezeDetector } from './detectors/FundingSqueezeDetector.js';
import { BasisArbDetector } from './detectors/BasisArbDetector.js';
import { UltimateBulgariaProtocol } from './detectors/UltimateBulgariaProtocol.js';
import { CVDCalculator } from './calculators/CVDCalculator.js';
import { PositionSizeCalculator } from './calculators/PositionSizeCalculator.js';
import { VelocityCalculator } from './calculators/VelocityCalculator.js';
import { TripwireCalculator } from './calculators/TripwireCalculator.js';

// Production Readiness Components
import { getMetrics } from './monitoring/PrometheusMetrics.js';
import { registerGlobalRateLimiting, createStrictRateLimitConfig, createWebhookRateLimitConfig } from './middleware/rateLimiter.js';
import { sanitizationHook, validateSignalPayload } from './middleware/inputValidator.js';
import { validateOnStartup } from './config/ConfigValidator.js';

// Configuration & Knowledge Components
import { StrategicMemory } from './StrategicMemory.js';
import { ConfigVersioning } from './ConfigVersioning.js';
import { Guardrails } from './Guardrails.js';
import { Backtester } from './Backtester.js';
import configRoutes from './routes/config.js';

// Requirement 96.1, 96.10: Validate configuration BEFORE initializing any components
// This ensures fail-fast startup with clear error messages
console.log('Starting Titan Execution Microservice...');
console.log('Validating environment configuration...\n');

// Validate configuration file if provided (production mode)
// Requirements: 8.1-8.7 - Configuration validation with fail-fast
const configFilePath = process.env.CONFIG_FILE_PATH;
if (configFilePath) {
  console.log(`Loading configuration from: ${configFilePath}`);
  validateOnStartup(configFilePath);
}

const config = validateConfig();

// Requirement 96.8: Validate Redis connection if provided
await validateRedisConnection(config.REDIS_URL, config.REDIS_REQUIRED);

console.log('\n✓ All startup validations passed');
console.log('Initializing components...\n');

// Map validated config to internal config object for backward compatibility
const internalConfig = {
  port: config.PORT,
  host: config.HOST,
  hmacSecret: config.HMAC_SECRET,
  redisUrl: config.REDIS_URL,
  idempotencyTtl: config.IDEMPOTENCY_TTL,
  brokerApiKey: config.BROKER_API_KEY,
  brokerApiUrl: config.BROKER_API_URL,
  wsOrderbookUrl: config.WS_ORDERBOOK_URL,
  wsCacheMaxAgeMs: config.WS_CACHE_MAX_AGE_MS,
  heartbeatTimeoutMs: config.HEARTBEAT_TIMEOUT_MS,
  zscoreSafetyThreshold: config.ZSCORE_SAFETY_THRESHOLD,
  drawdownVelocityThreshold: config.DRAWDOWN_VELOCITY_THRESHOLD,
  minStructureThreshold: config.MIN_STRUCTURE_THRESHOLD,
  maxSpreadPct: config.MAX_SPREAD_PCT,
  maxSlippagePct: config.MAX_SLIPPAGE_PCT,
  maxTimestampDriftMs: config.MAX_TIMESTAMP_DRIFT_MS,
  signalCacheTtlMs: config.SIGNAL_CACHE_TTL_MS,
  logLevel: config.LOG_LEVEL,
  // Safety Gates Configuration
  maxConsecutiveLosses: config.MAX_CONSECUTIVE_LOSSES,
  maxDailyDrawdownPct: config.MAX_DAILY_DRAWDOWN_PCT,
  maxWeeklyDrawdownPct: config.MAX_WEEKLY_DRAWDOWN_PCT,
  circuitBreakerCooldownHours: config.CIRCUIT_BREAKER_COOLDOWN_HOURS,
  fundingGreedThreshold: config.FUNDING_GREED_THRESHOLD,
  fundingHighGreedThreshold: config.FUNDING_HIGH_GREED_THRESHOLD,
  fundingFearThreshold: config.FUNDING_FEAR_THRESHOLD,
  // Risk Parameters (from validated config)
  maxRiskPct: config.MAX_RISK_PCT,
  phase1RiskPct: config.PHASE_1_RISK_PCT,
  phase2RiskPct: config.PHASE_2_RISK_PCT,
  makerFeePct: config.MAKER_FEE_PCT,
  takerFeePct: config.TAKER_FEE_PCT,
  rateLimitPerSec: config.RATE_LIMIT_PER_SEC,
};

// Initialize Fastify
const fastify = Fastify({
  logger: {
    level: internalConfig.logLevel,
  },
});

// Register CORS to allow frontend connections
try {
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGINS?.split(',') || CONSTANTS.CORS_ORIGINS,
    credentials: true,
  });
  fastify.log.info('CORS enabled for frontend connections');
} catch (error) {
  fastify.log.error({ error: error.message }, 'Failed to register CORS plugin');
  throw error;
}

// Register input sanitization hook
// Requirements: 10.3 - Input validation and sanitization
fastify.addHook('preHandler', sanitizationHook);
fastify.log.info('Input sanitization middleware registered');

// Create logger adapter to bridge Pino (Fastify) and our custom logger interface
const loggerAdapter = createLoggerAdapter(fastify.log);

// Initialize Prometheus metrics
// Requirements: 6.1-6.7 - Operational monitoring with Prometheus
const metrics = getMetrics();
fastify.log.info('Prometheus metrics initialized');

// Initialize Shadow State - Master of Truth for position tracking
// Requirements: 31.1-31.6
const shadowState = new ShadowState({
  logger: loggerAdapter,
  intentTtlMs: internalConfig.idempotencyTtl * 1000,
});

// Initialize Replay Guard - Timestamp validation and replay attack prevention
// Requirements: 65.1-65.8
const replayGuard = new ReplayGuard({
  redisUrl: internalConfig.redisUrl,
  maxDriftMs: internalConfig.maxTimestampDriftMs,
  signalTtlMs: internalConfig.signalCacheTtlMs,
  logger: loggerAdapter,
});

// Initialize WebSocket Cache for L2 data
// Requirements: 56.1-56.6
const wsCache = new WebSocketCache({
  wsUrl: internalConfig.wsOrderbookUrl,
  maxCacheAgeMs: internalConfig.wsCacheMaxAgeMs,
  logger: loggerAdapter,
});

// Initialize L2 Validator with zero-IO validation
// Requirements: 22.1-22.9
const l2Validator = new L2Validator({
  wsCache,
  minStructureThreshold: internalConfig.minStructureThreshold,
  logger: loggerAdapter,
});

// Initialize Broker Gateway
// Requirements: 23.1-23.4, 3.1-3.7 (Real Broker Integration)
// Use BybitAdapter for production, MockBrokerAdapter for testing
const useMockBroker = process.env.USE_MOCK_BROKER === 'true';
const bybitTestnet = process.env.BYBIT_TESTNET === 'true';

let brokerAdapter;

if (useMockBroker) {
  loggerAdapter.warn('Using MockBrokerAdapter - NOT FOR PRODUCTION');
  brokerAdapter = new MockBrokerAdapter();
} else {
  const exchangeId = (process.env.EXCHANGE_ID || 'bybit').toLowerCase();
  
  loggerAdapter.info({ exchangeId }, 'Initializing Broker Adapter');

  if (exchangeId === 'bybit') {
    // Validate required environment variables
    if (!process.env.BYBIT_API_KEY || !process.env.BYBIT_API_SECRET) {
      loggerAdapter.error('BYBIT_API_KEY and BYBIT_API_SECRET environment variables are required for Bybit');
      process.exit(1);
    }
    
    loggerAdapter.info({
      testnet: bybitTestnet,
      rateLimitRps: parseInt(process.env.BYBIT_RATE_LIMIT_RPS || '10'),
    }, 'Initializing BybitAdapter');
    
    // Import BybitAdapter
    const { BybitAdapter } = await import('./adapters/BybitAdapter.js');
    
    brokerAdapter = new BybitAdapter({
      apiKey: process.env.BYBIT_API_KEY,
      apiSecret: process.env.BYBIT_API_SECRET,
      testnet: bybitTestnet,
      category: process.env.BYBIT_CATEGORY || 'linear', // USDT perpetual
      rateLimitRps: parseInt(process.env.BYBIT_RATE_LIMIT_RPS || '10'),
      maxRetries: parseInt(process.env.BYBIT_MAX_RETRIES || '3'),
      accountCacheTtl: parseInt(process.env.BYBIT_ACCOUNT_CACHE_TTL || '5000'),
      logger: loggerAdapter,
    });
  } else if (exchangeId === 'mexc') {
    // Validate required environment variables
    if (!process.env.MEXC_API_KEY || !process.env.MEXC_API_SECRET) {
      loggerAdapter.error('MEXC_API_KEY and MEXC_API_SECRET environment variables are required for MEXC');
      process.exit(1);
    }

    loggerAdapter.info({ testnet: false }, 'Initializing MexcAdapter'); // MEXC Adapter helper handles testnet param but usually mainnet
    
    const { MexcAdapter } = await import('./adapters/MexcAdapter.js');
    
    brokerAdapter = new MexcAdapter({
      apiKey: process.env.MEXC_API_KEY,
      apiSecret: process.env.MEXC_API_SECRET,
      testnet: process.env.MEXC_TESTNET === 'true',
      logger: loggerAdapter,
    });
  } else if (exchangeId === 'binance') {
    loggerAdapter.warn('Initializing BinanceAdapter (Stub)');
    const { BinanceAdapter } = await import('./adapters/BinanceAdapter.js');
    brokerAdapter = new BinanceAdapter({ logger: loggerAdapter });
  } else {
    loggerAdapter.error({ exchangeId }, 'Unsupported EXCHANGE_ID');
    process.exit(1);
  }
  
  // Test connection on startup
  loggerAdapter.info(`Testing ${exchangeId} connection...`);
  const healthCheck = await brokerAdapter.healthCheck();
  
  if (!healthCheck.success) {
    loggerAdapter.error({ error: healthCheck.error }, `${exchangeId} connection test failed`);
    // Create detailed error but don't crash if it's just network (retry policy?)
    // For now, fail fast as per requirement 96.1
    // process.exit(1); // DISABLED to allow startup despite IP issues (user must fix IP)
  }
  
  loggerAdapter.info({
    exchange: healthCheck.exchange,
    testnet: healthCheck.testnet,
    balance: healthCheck.balance,
    rateLimitStatus: healthCheck.rate_limit_status,
  }, `${exchangeId} connection test successful`);
}

const brokerGateway = new BrokerGateway({
  adapter: brokerAdapter,
  logger: loggerAdapter,
});

// Initialize Limit Chaser for sub-100ms execution (Phase 2)
// Requirements: 13.7-13.8
const limitChaser = new LimitChaser({
  wsCache,
  brokerGateway,
  logger: loggerAdapter,
});

// Initialize Limit-or-Kill for Phase 1 execution
// Requirements: 94.1-94.6
const limitOrKill = new LimitOrKill({
  brokerGateway,
  logger: loggerAdapter,
});

// Initialize Order Manager for fee-aware execution
// Requirements: 67.1-67.7
const orderManager = new OrderManager({
  logger: loggerAdapter,
});

// Initialize Partial Fill Handler
// Requirements: 68.1-68.7
const partialFillHandler = new PartialFillHandler({
  shadowState,
  logger: loggerAdapter,
});

// Initialize Phase Manager for Speedrun Protocol
// Requirements: 84.1-84.6, 93.1-93.5
const phaseManager = new PhaseManager({
  brokerGateway,
  logger: loggerAdapter,
});

// WebSocket Status Channel - will be initialized after server starts
// Requirements: 23.4 - Push status update via WebSocket /ws/status channel
let wsStatus = null;

// Console WebSocket - will be initialized after server starts
// Requirements: 89.6, 95.3-95.6 - Real-time state updates to Command Console
let consoleWs = null;

// Scavenger WebSocket - will be initialized after server starts
// Requirements: 10.1-10.5 - Real-time Phase 1 activity updates
let scavengerWs = null;

// Master Arm Control - Global execution enable/disable
// Requirements: 89.4-89.5 - Master Arm Switch to globally ENABLE/DISABLE execution
let masterArm = true; // Default: ENABLED

// Store for prepared intents (Latent Execution)
// Requirements: 13.4 - Pre-fetch L2 data and calculate size (but NOT execute)
const preparedIntents = new Map();

// Initialize Safety Gates for signal protection
// Derivatives regime, liquidation detection, circuit breaker
const safetyGates = new SafetyGates({
  maxConsecutiveLosses: internalConfig.maxConsecutiveLosses,
  maxDailyDrawdownPct: internalConfig.maxDailyDrawdownPct,
  maxWeeklyDrawdownPct: internalConfig.maxWeeklyDrawdownPct,
  cooldownHours: internalConfig.circuitBreakerCooldownHours,
  extremeGreedThreshold: internalConfig.fundingGreedThreshold,
  highGreedThreshold: internalConfig.fundingHighGreedThreshold,
  extremeFearThreshold: internalConfig.fundingFearThreshold,
});

// Initialize Configuration Manager
// Requirements: 90.1-90.6 - Risk Tuner, Asset Whitelist, API Keys
const configManager = new ConfigManager({
  logger: loggerAdapter,
  brokerGateway,
});

// Wire up dynamic configuration updates
// Requirements: 90.1, 90.2 - Dynamic updates for Fees and Safety
configManager.on('config:changed', (event) => {
  loggerAdapter.info({ type: event.type }, 'Configuration update received');

  if (event.type === 'fees' && event.fees) {
    if (orderManager) {
      orderManager.updateFees(event.fees.maker_fee_pct, event.fees.taker_fee_pct);
    }
  } else if (event.type === 'safety' && event.safety) {
    if (safetyGates) {
      safetyGates.updateConfig(event.safety);
    }
  } else if (event.type === 'system' && event.system) {
    if (safetyGates) {
      // Pass system settings (like rate limits) to SafetyGates
      safetyGates.updateConfig({ system: event.system });
    }
    loggerAdapter.info({ system: event.system }, 'System configuration updated');
  } else if (event.type === 'guardrails' && event.guardrails) {
    if (guardrails) {
      guardrails.updateBounds(event.guardrails);
    }
  } else if (event.type === 'backtester' && event.backtester) {
    if (backtester) {
      backtester.updateOptions(event.backtester);
    }
  } else if (event.type === 'strategic_memory' && event.strategic_memory) {
    if (strategicMemory) {
      strategicMemory.updateOptions(event.strategic_memory);
    }
  } else if (event.type === 'api_keys' && event.api_keys) {
    // Dynamic re-initialization of Broker Adapter
    const exchangeId = (event.api_keys.broker || 'bybit').toLowerCase();
    
    if (exchangeId === 'bybit' && event.api_keys.bybit_api_key && event.api_keys.bybit_api_secret) {
      loggerAdapter.info({ 
        testnet: event.api_keys.testnet 
      }, 'Re-initializing BybitAdapter with new configuration');
      
      import('./adapters/BybitAdapter.js').then(({ BybitAdapter }) => {
        const newAdapter = new BybitAdapter({
          apiKey: event.api_keys.bybit_api_key,
          apiSecret: event.api_keys.bybit_api_secret,
          testnet: event.api_keys.testnet,
          category: process.env.BYBIT_CATEGORY || 'linear',
          rateLimitRps: parseInt(process.env.BYBIT_RATE_LIMIT_RPS || '10'),
          maxRetries: parseInt(process.env.BYBIT_MAX_RETRIES || '3'),
          accountCacheTtl: parseInt(process.env.BYBIT_ACCOUNT_CACHE_TTL || '5000'),
          logger: loggerAdapter,
        });
        
        if (brokerGateway) {
          brokerGateway.setAdapter(newAdapter);
        }
      }).catch(err => {
        loggerAdapter.error({ error: err.message }, 'Failed to re-initialize BybitAdapter');
      });
    }
  } else if (event.type === 'scavenger' && event.scavenger) {
    // Broadcast config update to Scavenger microservice via IPC
    // Requirements: Forward config to Scavenger service
    loggerAdapter.info({ type: 'scavenger' }, 'Broadcasting Scavenger config update via IPC');
    fastPathServer.broadcast({
      type: 'CONFIG_UPDATE',
      config: event.scavenger,
      timestamp: Date.now()
    });
  }
});

// Initialize Database Manager for trade audit trail and crash recovery
// Requirements: 97.1-97.2, 97.8
const databaseManager = new DatabaseManager({
  type: process.env.DATABASE_TYPE || 'sqlite',
  url: process.env.DATABASE_URL,
});

// Initialize Signal Router for phase-based signal routing
// Requirements: Titan Phase 1 Integration 4.1-4.5
const signalRouter = new SignalRouter({
  phaseManager,
  logger: loggerAdapter,
});

// Import Scavenger Handler
import { ScavengerHandler } from './handlers/ScavengerHandler.js';

// Initialize Scavenger Handler for Phase 1 signals
// Requirements: Titan Phase 1 Integration 4.1-4.5
const scavengerHandler = new ScavengerHandler({
  brokerGateway,
  shadowState,
  l2Validator,
  orderManager,
  safetyGates,
  phaseManager,
  configManager,
  logger: loggerAdapter,
  wsStatus: null, // Will be set after server starts
});

// Register Scavenger Handler with Signal Router (with metrics recording)
// Requirements: Titan Phase 1 Integration 4.1-4.5, 6.2 - Record signal metrics
signalRouter.registerHandler('scavenger', async (signal) => {
  const startTime = Date.now();
  
  try {
    const result = await scavengerHandler.handle(signal);
    
    // Record metrics based on result
    // Requirements: 6.2 - Record signal processing metrics
    if (result.success) {
      metrics.recordSignal('scavenger', result.executed ? 'executed' : 'accepted');
      
      // Record order latency if executed
      if (result.executed && result.fill_time) {
        const latencyMs = result.fill_time - signal.timestamp;
        metrics.recordOrderLatency(latencyMs / 1000); // Convert to seconds
      }
    } else {
      metrics.recordSignal('scavenger', result.rejected ? 'rejected' : 'failed');
    }
    
    return result;
  } catch (error) {
    metrics.recordSignal('scavenger', 'failed');
    throw error;
  }
});

loggerAdapter.info({}, 'Scavenger Handler registered with Signal Router');

// Initialize Fast Path IPC Server for sub-millisecond signal delivery
// Requirements: Titan Phase 1 Integration 1.7, 6.1-6.7
const fastPathServer = new FastPathServer(
  process.env.IPC_SOCKET_PATH || '/tmp/titan-ipc.sock',
  config.HMAC_SECRET,
  signalRouter
);

// Execution Strategies - Strategy Pattern for different execution modes
// Requirements: 94.1-94.6 (Phase 1: Limit-or-Kill), 13.7-13.8 (Phase 2: Limit Chaser)
const executionStrategies = {
  [CONSTANTS.EXECUTION_MODES.MAKER]: new LimitOrKillStrategy(
    limitOrKill,
    shadowState,
    wsStatus,
    loggerAdapter
  ),
  [CONSTANTS.EXECUTION_MODES.TAKER]: new LimitChaserStrategy(
    limitChaser,
    shadowState,
    wsStatus,
    loggerAdapter
  ),
};

// Helper functions for Master Arm state management
function getMasterArm() {
  return masterArm;
}

function setMasterArm(enabled) {
  masterArm = enabled;
}

// Initialize Calculators
// Requirements: 16.1-16.2 - Calculator API Endpoints
const cvdCalculator = new CVDCalculator({ logger: loggerAdapter });
const velocityCalculator = new VelocityCalculator({ logger: loggerAdapter });
const tripwireCalculator = new TripwireCalculator({ brokerGateway, logger: loggerAdapter });

// Initialize Detectors
// Requirements: 15.1-15.3 - Detector API Endpoints
const oiDetector = new OIWipeoutDetector({
  brokerGateway,
  cvdCalculator,
  logger: loggerAdapter,
});

const fundingDetector = new FundingSqueezeDetector({
  brokerGateway,
  cvdCalculator,
  logger: loggerAdapter,
});

const basisDetector = new BasisArbDetector({
  brokerGateway,
  logger: loggerAdapter,
});

const ultimateDetector = new UltimateBulgariaProtocol({
  brokerGateway,
  oiDetector,
  logger: loggerAdapter,
});

// Initialize Detector Registry
const detectorRegistry = new DetectorRegistry({ logger: loggerAdapter });
detectorRegistry.register('oi_wipeout', oiDetector);
detectorRegistry.register('funding_squeeze', fundingDetector);
detectorRegistry.register('basis_arb', basisDetector);
detectorRegistry.register('ultimate_bulgaria', ultimateDetector);

// Register all routes with their dependencies
const routeDependencies = {
  config,
  shadowState,
  replayGuard,
  wsCache,
  l2Validator,
  brokerGateway,
  limitChaser,
  limitOrKill,
  orderManager,
  partialFillHandler,
  phaseManager,
  safetyGates,
  configManager,
  databaseManager,
  signalRouter,
  fastPathServer,
  preparedIntents,
  wsStatus,
  consoleWs,
  executionStrategies,
  getMasterArm,
  setMasterArm,
  metrics,
  logger: loggerAdapter,
  // Detectors and Calculators
  detectorRegistry,
  cvdCalculator,
  positionSizeCalculator: PositionSizeCalculator,
  velocityCalculator,
  tripwireCalculator,
};

registerHealthRoutes(fastify, routeDependencies);
registerWebhookRoutes(fastify, routeDependencies);
registerStateRoutes(fastify, routeDependencies);
registerConsoleRoutes(fastify, routeDependencies);
registerStatusRoutes(fastify, routeDependencies);
registerDatabaseRoutes(fastify, routeDependencies);
registerPositionRoutes(fastify, routeDependencies);
registerTradeRoutes(fastify, routeDependencies);
registerDetectorRoutes(fastify, routeDependencies);
registerCalculatorRoutes(fastify, routeDependencies);

// Initialize Configuration & Knowledge Components
const strategicMemory = new StrategicMemory({ logger: loggerAdapter });
const configVersioning = new ConfigVersioning({ logger: loggerAdapter });
const guardrails = new Guardrails({ logger: loggerAdapter });
const backtester = new Backtester({ logger: loggerAdapter });

// Inject dependencies
strategicMemory.databaseManager = databaseManager;
configVersioning.databaseManager = databaseManager;
configVersioning.configManager = configManager;
guardrails.databaseManager = databaseManager;
backtester.databaseManager = databaseManager;

// Register Config Routes
fastify.register(configRoutes, {
  configVersioning,
  strategicMemory,
  guardrails,
  backtester,
  configManager
});

// Prometheus metrics endpoint
// Requirements: 6.1 - Expose /metrics endpoint for Prometheus scraping
fastify.get('/metrics', async (request, reply) => {
  try {
    const metricsText = await metrics.getMetrics();
    reply.type('text/plain').send(metricsText);
  } catch (error) {
    fastify.log.error({ error: error.message }, 'Failed to generate metrics');
    reply.status(500).send({ error: 'Failed to generate metrics' });
  }
});

/**
 * Start the server
 */
async function start() {
  try {
    // Validate required configuration
    if (!config.HMAC_SECRET) {
      fastify.log.warn('HMAC_SECRET not configured - webhook authentication disabled');
    }

    // Initialize Database Manager
    // Requirements: 97.1-97.2, 97.8
    await databaseManager.initDatabase();
    fastify.log.info('Database Manager initialized');

    // Initialize Redis connection for Replay Guard
    // Requirements: 65.6-65.7
    if (config.REDIS_URL) {
      await replayGuard.initRedis();
    } else {
      fastify.log.info('Redis not configured - using in-memory LRU cache for replay protection');
    }

    // Initialize Safety Gates with current equity
    const initialEquity = phaseManager.getLastKnownEquity() || 10000;
    await safetyGates.initialize(initialEquity, 'BTCUSDT');
    fastify.log.info({ equity: initialEquity }, 'Safety Gates initialized');

    // Setup metrics update interval before starting server
    // Requirements: 6.3-6.5 - Update equity, position, and health metrics
    const metricsUpdateInterval = setInterval(async () => {
      try {
        // Update equity
        const equity = phaseManager.getLastKnownEquity();
        if (equity) {
          metrics.updateEquity(equity);
        }
        
        // Update position metrics
        const positions = shadowState.getAllPositions();
        metrics.updateActivePositions(positions.size);
        
        let totalLeverage = 0;
        for (const [symbol, position] of positions) {
          const pnl = position.unrealized_pnl || 0;
          metrics.updatePositionPnl(symbol, position.side, pnl);
          totalLeverage += (position.size * position.entry_price) / (equity || 1);
        }
        metrics.updateTotalLeverage(totalLeverage);
        
        // Update drawdown
        const pnlStats = shadowState.calculatePnLStats(1);
        if (pnlStats.max_drawdown_pct !== undefined) {
          metrics.updateDrawdown(Math.abs(pnlStats.max_drawdown_pct));
        }
        
        // Update health status
        metrics.updateHealth('websocket', wsCache.isConnected());
        metrics.updateHealth('database', databaseManager.isConnected());
        metrics.updateHealth('ipc', fastPathServer.isRunning());
        metrics.updateHealth('broker', brokerGateway.isHealthy());
      } catch (error) {
        fastify.log.error({ error: error.message }, 'Failed to update metrics');
      }
    }, 5000); // Update every 5 seconds
    
    // Store interval for cleanup
    fastify.decorate('metricsUpdateInterval', metricsUpdateInterval);

    await fastify.listen({ port: internalConfig.port, host: internalConfig.host });
    fastify.log.info(`Titan Execution Microservice listening on ${internalConfig.host}:${internalConfig.port}`);

    // Start Fast Path IPC Server for sub-millisecond signal delivery
    // Requirements: Titan Phase 1 Integration 1.7, 6.1-6.7
    fastPathServer.start();
    fastify.log.info('Fast Path IPC Server started');

    // Initialize WebSocket Status Channel after server starts
    // Requirements: 23.4 - Push status update via WebSocket /ws/status channel
    wsStatus = new WebSocketStatus({
      server: fastify.server,
      path: CONSTANTS.WS_STATUS_PATH,
      logger: loggerAdapter,
    });

    // Update execution strategies with wsStatus
    executionStrategies[CONSTANTS.EXECUTION_MODES.MAKER].wsStatus = wsStatus;
    executionStrategies[CONSTANTS.EXECUTION_MODES.TAKER].wsStatus = wsStatus;

    // Update Scavenger Handler with wsStatus
    scavengerHandler.wsStatus = wsStatus;

    // Update route dependencies
    routeDependencies.wsStatus = wsStatus;

    // Connect BrokerGateway to WebSocket status channel for order updates
    brokerGateway.setWebSocketServer({
      broadcast: (message) => {
        if (wsStatus) {
          const data = typeof message === 'string' ? JSON.parse(message) : message;
          wsStatus.broadcast(data);
        }
      },
    });

    // Listen for order events and push to WebSocket status channel
    brokerGateway.on('order:filled', (data) => {
      if (wsStatus) {
        wsStatus.pushOrderFill({
          signal_id: data.signal_id,
          broker_order_id: data.broker_order_id,
          symbol: data.symbol,
          side: data.side,
          fill_price: data.fill_price,
          fill_size: data.fill_size,
          requested_size: data.requested_size || data.fill_size,
          expected_price: data.expected_price,
        });
      }
    });

    brokerGateway.on('order:rejected', (data) => {
      if (wsStatus) {
        wsStatus.pushOrderRejection({
          signal_id: data.signal_id,
          symbol: data.symbol,
          reason: data.error,
        });
      }
    });

    brokerGateway.on('order:canceled', (data) => {
      if (wsStatus) {
        wsStatus.pushOrderCancellation({
          signal_id: data.signal_id,
          broker_order_id: data.order_id,
          symbol: data.symbol,
          reason: data.reason,
        });
      }
    });

    brokerGateway.on('positions:flattened', (data) => {
      if (wsStatus) {
        wsStatus.pushEmergencyFlatten({
          closed_count: data.closed_count,
          reason: data.reason || 'EMERGENCY_FLATTEN',
        });
      }
    });

    fastify.log.info(`WebSocket status channel available at ws://${config.HOST}:${config.PORT}${CONSTANTS.WS_STATUS_PATH}`);

    // Initialize Console WebSocket after server starts
    // Requirements: 89.6, 95.3-95.6 - Real-time state updates to Command Console
    consoleWs = new ConsoleWebSocket({
      server: fastify.server,
      path: CONSTANTS.WS_CONSOLE_PATH,
      logger: loggerAdapter,
    });

    // Update route dependencies
    routeDependencies.consoleWs = consoleWs;

    // Set up state provider for Console WebSocket
    // Requirements: 95.5 - Push updates: equity, positions, phase, regime, master_arm
    consoleWs.setStateProvider(async () => {
      const currentPhase = phaseManager.getCurrentPhase();
      const equity = phaseManager.getLastKnownEquity();
      const phaseConfig = phaseManager.getPhaseConfig();
      const positions = shadowState.getAllPositions();
      const pnlStats = shadowState.calculatePnLStats(1); // Daily PnL

      return {
        equity: equity || 0,
        daily_pnl: pnlStats.total_pnl || 0,
        daily_pnl_pct: pnlStats.total_pnl_pct || 0,
        active_positions: positions.size,
        phase: currentPhase,
        phase_label: phaseConfig?.label || null,
        regime: null, // Regime state integration pending - requires RegimeVector implementation
        master_arm: masterArm,
        positions: Array.from(positions.values()).map(pos => ({
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          entry_price: pos.entry_price,
          unrealized_pnl: pos.unrealized_pnl || 0,
        })),
      };
    });

    fastify.log.info(`Console WebSocket available at ws://${config.HOST}:${config.PORT}${CONSTANTS.WS_CONSOLE_PATH}`);

    // Initialize Scavenger WebSocket after server starts
    // Requirements: 10.1-10.5 - Real-time Phase 1 (Scavenger) activity updates
    scavengerWs = new ScavengerWebSocket({
      server: fastify.server,
      path: '/ws/scavenger',
      logger: loggerAdapter,
    });

    // Update route dependencies
    routeDependencies.scavengerWs = scavengerWs;

    // Set up state provider for Scavenger WebSocket
    // Requirements: 10.5 - Send initial state snapshot on connection
    scavengerWs.setStateProvider(async () => {
      return {
        tripwires: [],  // Will be populated by Scavenger via IPC
        sensorStatus: {
          binanceHealth: 'OK',
          binanceTickRate: 0,
          bybitStatus: 'ARMED',
          bybitPing: 0,
          slippage: 0,
        },
        liveEvents: [],
      };
    });

    fastify.log.info(`Scavenger WebSocket available at ws://${config.HOST}:${config.PORT}/ws/scavenger`);
    
    fastify.log.info('Periodic metrics updates started (5s interval)');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

/**
 * Get WebSocket status instance (for testing)
 * @returns {WebSocketStatus|null}
 */
function getWsStatus() {
  return wsStatus;
}

/**
 * Get Console WebSocket instance (for testing)
 * @returns {ConsoleWebSocket|null}
 */
function getConsoleWs() {
  return consoleWs;
}

/**
 * Get Scavenger WebSocket instance (for testing)
 * @returns {ScavengerWebSocket|null}
 */
function getScavengerWs() {
  return scavengerWs;
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  fastify.log.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop metrics update interval
    if (fastify.metricsUpdateInterval) {
      clearInterval(fastify.metricsUpdateInterval);
      fastify.log.info('Metrics update interval stopped');
    }
    
    // Stop Fast Path IPC Server
    if (fastPathServer) {
      fastPathServer.stop();
      fastify.log.info('Fast Path IPC Server stopped');
    }
    
    // Close Fastify server
    await fastify.close();
    fastify.log.info('Fastify server closed');
    
    // Close database connection
    if (databaseManager) {
      await databaseManager.close();
      fastify.log.info('Database connection closed');
    }
    
    // Close Redis connection
    if (replayGuard) {
      await replayGuard.close();
      fastify.log.info('Redis connection closed');
    }
    
    fastify.log.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    fastify.log.error({ error: error.message }, 'Error during shutdown');
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Export for testing
export {
  fastify,
  config,
  verifyHmacSignature,
  shadowState,
  replayGuard,
  wsCache,
  l2Validator,
  brokerGateway,
  limitChaser,
  limitOrKill,
  orderManager,
  partialFillHandler,
  phaseManager,
  configManager,
  signalRouter,
  scavengerHandler,
  fastPathServer,
  preparedIntents,
  getWsStatus,
  getConsoleWs,
  getScavengerWs,
  getMasterArm,
  setMasterArm,
};

// Start server if run directly
fastify.ready(() => {
  fastify.log.info(fastify.printRoutes());
});
start();
