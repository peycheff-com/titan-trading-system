/**
 * Titan Execution Microservice - Production Server
 * 
 * Clean production-ready server with web UI for API configuration and live trading.
 * Removes terminal dashboard and mock features.
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { EventEmitter } from 'events';
import fs from 'fs';
import http from 'http';

// Core components
import { validateConfig, validateRedisConnection } from './ConfigSchema.js';
import { WebSocketStatus } from './WebSocketStatus.js';
import { ConsoleWebSocket } from './ConsoleWebSocket.js';
import { ScavengerWebSocket } from './ScavengerWebSocket.js';
import { MockBrokerAdapter } from './BrokerGateway.js';

// Component initialization
import { 
  initializeComponents, 
  initializeBrokerAdapter,
  createBrokerGateway 
} from './components/initializeComponents.js';

// Services
import { Container } from './utils/Container.js';

// Utilities
import { CONSTANTS } from './utils/constants.js';
import { createLoggerAdapter } from './utils/loggerAdapter.js';

// Routes
import { registerHealthRoutes } from './routes/health.js';
import { registerWebhookRoutes } from './routes/webhook.js';
import { registerStateRoutes } from './routes/state.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerDatabaseRoutes } from './routes/database.js';
import configRoutes from './routes/config.js';
import positionRoutes from './routes/positions.js';
import accountRoutes from './routes/account.js';
import tradesRoutes from './routes/trades.js';

// Production Readiness Components
import { getMetrics } from './monitoring/PrometheusMetrics.js';
import { sanitizationHook } from './middleware/inputValidator.js';
import { registerGlobalRateLimiting } from './middleware/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting Titan Execution Microservice (Production)...');
console.log('Validating environment configuration...\n');

const config = validateConfig();
await validateRedisConnection(config.REDIS_URL, config.REDIS_REQUIRED);

console.log('\n✓ All startup validations passed');
console.log('Initializing components...\n');


// Map validated config to internal config
const internalConfig = {
  port: config.PORT,
  host: config.HOST,
  hmacSecret: config.HMAC_SECRET,
  httpsEnabled: config.HTTPS_ENABLED,
  sslCertPath: config.SSL_CERT_PATH,
  sslKeyPath: config.SSL_KEY_PATH,
  httpsPort: config.HTTPS_PORT,
  httpsRedirect: config.HTTPS_REDIRECT,
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
  maxConsecutiveLosses: config.MAX_CONSECUTIVE_LOSSES,
  maxDailyDrawdownPct: config.MAX_DAILY_DRAWDOWN_PCT,
  maxWeeklyDrawdownPct: config.MAX_WEEKLY_DRAWDOWN_PCT,
  circuitBreakerCooldownHours: config.CIRCUIT_BREAKER_COOLDOWN_HOURS,
  fundingGreedThreshold: config.FUNDING_GREED_THRESHOLD,
  fundingHighGreedThreshold: config.FUNDING_HIGH_GREED_THRESHOLD,
  fundingFearThreshold: config.FUNDING_FEAR_THRESHOLD,
  maxRiskPct: config.MAX_RISK_PCT,
  phase1RiskPct: config.PHASE_1_RISK_PCT,
  phase2RiskPct: config.PHASE_2_RISK_PCT,
  makerFeePct: config.MAKER_FEE_PCT,
  takerFeePct: config.TAKER_FEE_PCT,
  rateLimitPerSec: config.RATE_LIMIT_PER_SEC,
};

/**
 * Configure Fastify with optional HTTPS support
 * Requirements: 10.7 - Use HTTPS protocol for all external communication in production
 */
function configureFastifyOptions(internalCfg) {
  const options = {
    logger: {
      level: internalCfg.logLevel,
    },
  };

  if (internalCfg.httpsEnabled) {
    if (!internalCfg.sslCertPath || !internalCfg.sslKeyPath) {
      console.error('❌ HTTPS enabled but SSL_CERT_PATH or SSL_KEY_PATH not provided');
      console.error('   Set SSL_CERT_PATH and SSL_KEY_PATH environment variables');
      console.error('   Or run: node scripts/generate-ssl-cert.js to create self-signed certificates');
      process.exit(1);
    }

    try {
      options.https = {
        key: fs.readFileSync(internalCfg.sslKeyPath),
        cert: fs.readFileSync(internalCfg.sslCertPath),
      };
      console.log('✅ HTTPS enabled with SSL certificates');
    } catch (error) {
      console.error(`❌ Failed to load SSL certificates: ${error.message}`);
      console.error('   Ensure SSL_CERT_PATH and SSL_KEY_PATH point to valid certificate files');
      process.exit(1);
    }
  }

  return options;
}

// Initialize Fastify
const fastifyOptions = configureFastifyOptions(internalConfig);
const fastify = Fastify(fastifyOptions);

// Create logger adapter
const loggerAdapter = createLoggerAdapter(fastify.log);

// Initialize Prometheus metrics
// Requirements: 6.1-6.7 - Operational monitoring with Prometheus
const metrics = getMetrics();
fastify.log.info('Prometheus metrics initialized');

// System event bus for config updates
const systemBus = new EventEmitter();
fastify.decorate('systemBus', systemBus);

// Initialize dependency injection container
const container = new Container();

// Initialize all core components and register in container
const components = await initializeComponents(internalConfig, __dirname, loggerAdapter);

// Register components in container
Object.entries(components).forEach(([name, instance]) => {
  container.register(name, () => instance);
});

// Decorate fastify with container access
fastify.decorate('container', container);
fastify.decorate('getComponents', () => components);

// Master arm state
let masterArm = true;
const preparedIntents = new Map();
let wsStatus = null;
let consoleWs = null;
let scavengerWs = null;
let metricsUpdateInterval = null;

// Master arm accessors
function getMasterArm() {
  return masterArm;
}

function setMasterArm(enabled) {
  masterArm = enabled;
}


// Register CORS
await fastify.register(cors, {
  origin: true,
  credentials: true,
});

// Register rate limiting
// Requirements: 10.1-10.2 - Enforce rate limits to prevent abuse
try {
  await registerGlobalRateLimiting(fastify, {
    max: CONSTANTS.DEFAULT_RATE_LIMIT_MAX,
    timeWindow: CONSTANTS.DEFAULT_RATE_LIMIT_WINDOW,
    redis: internalConfig.redisUrl || null,
    allowList: ['127.0.0.1', '::1'],
    logger: fastify.log
  });
} catch (error) {
  fastify.log.warn({ error: error.message }, '⚠️  Rate limiting failed to initialize - continuing without it');
  fastify.log.warn('   This is acceptable for development but should be fixed for production');
}

// Add input sanitization hook
// Requirements: 10.3 - Validate and sanitize all user inputs
fastify.addHook('onRequest', sanitizationHook);
fastify.log.info('Input sanitization hook registered');

// Serve static files (web UI)
await fastify.register(fastifyStatic, {
  root: join(__dirname, 'public'),
  prefix: '/',
});

/**
 * Register all API routes with consistent plugin pattern
 */
async function registerRoutes() {
  const { registerLegacyRoutes, registerModernRoutes } = await import('./routes/routeHelpers.js');
  
  const state = {
    preparedIntents,
    wsStatus,
    getMasterArm,
    setMasterArm,
  };

  await registerLegacyRoutes(fastify, components, state, config, loggerAdapter);
  await registerModernRoutes(fastify, components, loggerAdapter);
}

await registerRoutes();

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


// Initialize config update handler
const { ConfigUpdateHandler } = await import('./handlers/ConfigUpdateHandler.js');
const configUpdateHandler = new ConfigUpdateHandler({
  container,
  loggerAdapter,
  initializeBrokerAdapter,
  createBrokerGateway,
});

// Listen for config updates with proper error handling
systemBus.on('config:updated', async (update) => {
  try {
    await configUpdateHandler.handle(update);
  } catch (error) {
    loggerAdapter.error({ error: error.message, update }, 'Config update failed');
    systemBus.emit('error', { source: 'config:updated', error });
  }
});

// Handle system bus errors
systemBus.on('error', ({ source, error }) => {
  loggerAdapter.error({ source, error: error.message }, 'System bus error');
});

/**
 * Initialize and start metrics service
 * Requirements: 6.3-6.5 - Update equity, position, and health metrics
 */
async function initializeMetricsService() {
  const { MetricsService } = await import('./services/MetricsService.js');
  const metricsService = new MetricsService({
    container,
    loggerAdapter,
    metrics,
  });
  
  // Register in container
  container.register('metricsService', () => metricsService);
  
  return metricsService;
}


/**
 * Initialize WebSocket status server
 */
function initializeWebSocketStatus() {
  const ws = new WebSocketStatus({
    server: fastify.server,
    path: CONSTANTS.WS_STATUS_PATH,
    logger: loggerAdapter,
  });

  // Connect BrokerGateway to WebSocket
  components.brokerGateway.setWebSocketServer({
    broadcast: (message) => {
      if (ws) {
        const data = typeof message === 'string' ? JSON.parse(message) : message;
        ws.broadcast(data);
      }
    },
  });

  // Listen for broker events
  components.brokerGateway.on('order:filled', (data) => {
    if (ws) {
      ws.pushOrderFill({
        symbol: data.symbol || 'UNKNOWN',
        side: data.side || 'UNKNOWN',
        fill_price: data.fill_price,
        fill_size: data.fill_size,
        broker_order_id: data.broker_order_id,
      });
    }
  });

  return ws;
}

/**
 * Initialize Console WebSocket server
 * Requirements: 89.6, 95.3-95.6 - Real-time state updates to Command Console
 */
function initializeConsoleWebSocket() {
  const ws = new ConsoleWebSocket({
    server: fastify.server,
    path: CONSTANTS.WS_CONSOLE_PATH,
    logger: loggerAdapter,
  });

  // Set up state provider
  ws.setStateProvider(async () => {
    const { phaseManager, shadowState } = components;
    const currentPhase = phaseManager.getCurrentPhase();
    const equity = phaseManager.getLastKnownEquity();
    const phaseConfig = phaseManager.getPhaseConfig();
    const positions = shadowState.getAllPositions();
    const pnlStats = shadowState.calculatePnLStats(1);

    return {
      equity: equity || 0,
      daily_pnl: pnlStats.total_pnl || 0,
      daily_pnl_pct: pnlStats.total_pnl_pct || 0,
      active_positions: positions.size,
      phase: currentPhase,
      phase_label: phaseConfig?.label || null,
      regime: null,
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

  fastify.log.info(`Console WebSocket available at ws://${internalConfig.host}:${internalConfig.port}${CONSTANTS.WS_CONSOLE_PATH}`);
  return ws;
}

/**
 * Initialize Scavenger WebSocket server
 * Requirements: 10.1-10.5 - Real-time Phase 1 (Scavenger) activity updates
 */
function initializeScavengerWebSocket() {
  const ws = new ScavengerWebSocket({
    server: fastify.server,
    path: '/ws/scavenger',
    logger: loggerAdapter,
  });

  // Set up state provider
  ws.setStateProvider(async () => {
    return {
      tripwires: [],
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

  fastify.log.info(`Scavenger WebSocket available at ws://${internalConfig.host}:${internalConfig.port}/ws/scavenger`);
  return ws;
}

/**
 * Start HTTP redirect server for HTTPS
 * Requirements: 10.7 - Redirect HTTP to HTTPS
 */
function startHttpRedirectServer() {
  if (!internalConfig.httpsEnabled || !internalConfig.httpsRedirect) {
    return null;
  }

  const httpRedirectServer = http.createServer((req, res) => {
    const host = req.headers.host?.split(':')[0] || internalConfig.host;
    const redirectUrl = `https://${host}:${internalConfig.httpsPort}${req.url}`;
    res.writeHead(301, { Location: redirectUrl });
    res.end();
  });

  httpRedirectServer.listen(internalConfig.port, internalConfig.host, () => {
    fastify.log.info(
      `🔄 HTTP redirect server: http://${internalConfig.host}:${internalConfig.port} → https://${internalConfig.host}:${internalConfig.httpsPort}`
    );
  });

  return httpRedirectServer;
}

/**
 * Perform broker health check
 * Requirements: 3.1 - Validate broker connection on startup
 */
async function performBrokerHealthCheck() {
  const { brokerGateway } = components;
  const adapter = brokerGateway.adapter;

  if (adapter && typeof adapter.healthCheck === 'function') {
    try {
      const healthCheck = await adapter.healthCheck();
      if (healthCheck.success) {
        fastify.log.info('✅ Broker adapter health check passed');
      } else {
        fastify.log.warn({ error: healthCheck.error }, '⚠️  Broker adapter health check failed');
      }
    } catch (error) {
      fastify.log.error({ error: error.message }, '❌ Broker adapter health check error');
    }
  }
}


/**
 * Start the server
 */
async function start() {
  try {
    const { databaseManager, replayGuard, phaseManager, safetyGates } = components;

    if (!config.HMAC_SECRET) {
      fastify.log.warn('HMAC_SECRET not configured - webhook authentication disabled');
    }

    // Initialize Database
    await databaseManager.initDatabase();
    fastify.log.info('Database Manager initialized');

    // Initialize Redis
    if (config.REDIS_URL) {
      await replayGuard.initRedis();
    } else {
      fastify.log.info('Redis not configured - using in-memory LRU cache');
    }

    // Initialize Safety Gates
    const initialEquity = phaseManager.getLastKnownEquity() || 10000;
    await safetyGates.initialize(initialEquity, 'BTCUSDT');
    fastify.log.info({ equity: initialEquity }, 'Safety Gates initialized');

    // Perform broker health check
    await performBrokerHealthCheck();

    // Start server
    const serverPort = internalConfig.httpsEnabled ? internalConfig.httpsPort : internalConfig.port;
    await fastify.listen({ port: serverPort, host: internalConfig.host });

    const protocol = internalConfig.httpsEnabled ? 'https' : 'http';
    fastify.log.info(`🎯 Titan Execution Console: ${protocol}://${internalConfig.host}:${serverPort}`);

    // Start HTTP redirect server if configured
    const httpRedirectServer = startHttpRedirectServer();
    if (httpRedirectServer) {
      fastify.decorate('httpRedirectServer', httpRedirectServer);
    }

    // Initialize and start metrics service
    const metricsService = await initializeMetricsService();
    metricsService.start();

    // Initialize WebSocket Status
    wsStatus = initializeWebSocketStatus();
    container.register('wsStatus', () => wsStatus);

    // Initialize Console WebSocket
    consoleWs = initializeConsoleWebSocket();
    container.register('consoleWs', () => consoleWs);

    // Initialize Scavenger WebSocket
    scavengerWs = initializeScavengerWebSocket();
    container.register('scavengerWs', () => scavengerWs);

    // Initialize graceful shutdown
    await initializeGracefulShutdown();

    console.log('\n✅ Titan Execution Microservice is ready');
    console.log(`📊 Web Console: ${protocol}://${internalConfig.host}:${serverPort}`);
    console.log(`🔗 Webhook endpoint: POST ${protocol}://${internalConfig.host}:${serverPort}/webhook`);
    console.log(`💾 Database: ${join(__dirname, 'titan_execution.db')}`);
    if (internalConfig.httpsEnabled) {
      console.log('🔒 HTTPS enabled with SSL/TLS encryption');
      if (internalConfig.httpsRedirect) {
        console.log(`🔄 HTTP → HTTPS redirect active on port ${internalConfig.port}`);
      }
    }
    console.log('\n🔑 Configure API keys in the web console to start live trading\n');
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

/**
 * Initialize graceful shutdown service
 */
async function initializeGracefulShutdown() {
  const { GracefulShutdownService } = await import('./services/GracefulShutdownService.js');
  const shutdownService = new GracefulShutdownService({
    container,
    loggerAdapter,
    fastify,
  });
  
  shutdownService.registerHandlers();
  return shutdownService;
}

// Start the server
start();
