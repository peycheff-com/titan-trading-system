/**
 * Titan Brain - Phase 5 Orchestrator
 * 
 * Main entry point for the Titan Brain service.
 * Initializes all components and starts the webhook server.
 */

// Load environment variables from .env file
import 'dotenv/config';

import { loadConfig } from './config/index.js';
import { DatabaseManager, runMigrations } from './db/index.js';
import {
  AllocationEngine,
  PerformanceTracker,
  RiskGuardian,
  CapitalFlowManager,
  CircuitBreaker,
  TitanBrain,
} from './engine/index.js';
import {
  WebhookServer,
  SignalQueue,
  DashboardService,
  NotificationService,
  TitanNotificationHandler,
  ExecutionEngineClient,
  PhaseIntegrationService,
  WebSocketService,
} from './server/index.js';
import { getLogger, getMetrics } from './monitoring/index.js';
import { StateRecoveryService } from './engine/StateRecoveryService.js';
import { ManualOverrideService } from './engine/ManualOverrideService.js';

// Global instances for cleanup
let brain: TitanBrain | null = null;
let webhookServer: WebhookServer | null = null;
let signalQueue: SignalQueue | null = null;
let databaseManager: DatabaseManager | null = null;
let executionEngineClient: ExecutionEngineClient | null = null;
let phaseIntegrationService: PhaseIntegrationService | null = null;
let webSocketService: WebSocketService | null = null;

/**
 * Main startup function
 */
async function main(): Promise<void> {
  const logger = getLogger();
  const metrics = getMetrics();
  
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    TITAN BRAIN - Phase 5                       ║');
  console.log('║                   Master Orchestrator v1.0                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Load configuration
    console.log('📋 Loading configuration...');
    const { config, validation, sources } = loadConfig({
      validate: true,
      throwOnError: true,
    });

    if (validation.warnings.length > 0) {
      console.log('⚠️  Configuration warnings:');
      validation.warnings.forEach(w => console.log(`   - ${w}`));
    }

    logger.info('Configuration loaded', { sources });

    // Initialize database
    console.log('🗄️  Initializing database...');
    databaseManager = new DatabaseManager(config.database);
    await databaseManager.connect();
    
    // Run migrations
    console.log('📦 Running database migrations...');
    await runMigrations(databaseManager);

    // Initialize Redis signal queue (optional)
    console.log('📬 Initializing signal queue...');
    try {
      signalQueue = new SignalQueue({
        url: config.redis.url,
        maxRetries: config.redis.maxRetries,
        retryDelay: config.redis.retryDelay,
        keyPrefix: 'titan:brain:signals',
        idempotencyTTL: 3600,
        maxQueueSize: config.brain.maxQueueSize,
      });
      await signalQueue.connect();
      console.log('   ✅ Redis signal queue connected');
    } catch (error) {
      console.log('   ⚠️  Redis not available, using in-memory queue');
      signalQueue = null;
    }

    // Initialize core engines
    console.log('⚙️  Initializing core engines...');
    
    const allocationEngine = new AllocationEngine(config.allocationEngine);
    console.log('   ✅ AllocationEngine initialized');

    const performanceTracker = new PerformanceTracker(
      config.performanceTracker,
      databaseManager
    );
    console.log('   ✅ PerformanceTracker initialized');

    const riskGuardian = new RiskGuardian(config.riskGuardian, allocationEngine);
    console.log('   ✅ RiskGuardian initialized');

    const capitalFlowManager = new CapitalFlowManager(config.capitalFlow);
    console.log('   ✅ CapitalFlowManager initialized');

    const circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    console.log('   ✅ CircuitBreaker initialized');

    // Initialize state recovery service
    const stateRecoveryService = new StateRecoveryService(databaseManager, {
      performanceWindowDays: config.performanceTracker.windowDays,
      defaultAllocation: { w1: 1.0, w2: 0.0, w3: 0.0, timestamp: Date.now() },
      defaultHighWatermark: 0,
    });
    console.log('   ✅ StateRecoveryService initialized');

    // Initialize manual override service
    const manualOverrideService = new ManualOverrideService(databaseManager, {
      maxOverrideDurationHours: 24,
      requiredPermissions: ['override'],
      warningBannerTimeout: 300000, // 5 minutes
    });
    console.log('   ✅ ManualOverrideService initialized');

    // Initialize notification service
    const notificationService = new NotificationService(config.notifications);
    console.log('   ✅ NotificationService initialized');

    // Create TitanBrain orchestrator
    console.log('🧠 Creating TitanBrain orchestrator...');
    brain = new TitanBrain(
      config.brain,
      allocationEngine,
      performanceTracker,
      riskGuardian,
      capitalFlowManager,
      circuitBreaker,
      databaseManager,
      stateRecoveryService,
      manualOverrideService
    );

    // Set initial equity from environment or default
    const initialEquity = parseInt(process.env.INITIAL_EQUITY || '200', 10);
    brain.setEquity(initialEquity);
    console.log(`   💰 Initial equity: $${initialEquity.toLocaleString()}`);

    // Initialize brain (loads state from database)
    await brain.initialize();
    console.log('   ✅ TitanBrain initialized');

    // Wire up notification handler
    const notificationHandler = new TitanNotificationHandler(notificationService);
    circuitBreaker.setNotificationHandler(notificationHandler);
    riskGuardian.setCorrelationNotifier(notificationHandler);
    capitalFlowManager.setSweepNotifier(notificationHandler);
    console.log('   ✅ Notification handlers wired');

    // Initialize integration services
    console.log('🔗 Initializing integration services...');

    // Execution Engine Client (optional)
    const executionEngineUrl = process.env.EXECUTION_ENGINE_URL;
    if (executionEngineUrl) {
      executionEngineClient = new ExecutionEngineClient({
        baseUrl: executionEngineUrl,
        hmacSecret: process.env.WEBHOOK_SECRET,
        timeout: 5000,
        maxRetries: 3,
      });
      await executionEngineClient.initialize();
      
      // Wire up fill confirmation handling
      executionEngineClient.onFillConfirmation((fill) => {
        logger.info('Fill confirmation received', {
          signalId: fill.signalId,
          symbol: fill.symbol,
          fillPrice: fill.fillPrice,
          fillSize: fill.fillSize,
        });
        // Record trade in performance tracker
        // Note: In a full implementation, we'd need to determine PnL from the fill
        // For now, we log the fill for monitoring
      });
      
      // Set execution engine client on brain
      brain.setExecutionEngine(executionEngineClient);
      console.log(`   ✅ ExecutionEngineClient connected to ${executionEngineUrl}`);
    } else {
      console.log('   ⚠️  EXECUTION_ENGINE_URL not set, signal forwarding disabled');
    }

    // Phase Integration Service (optional)
    const phase1Url = process.env.PHASE1_WEBHOOK_URL;
    const phase2Url = process.env.PHASE2_WEBHOOK_URL;
    const phase3Url = process.env.PHASE3_WEBHOOK_URL;
    
    if (phase1Url || phase2Url || phase3Url) {
      phaseIntegrationService = new PhaseIntegrationService({
        phase1WebhookUrl: phase1Url,
        phase2WebhookUrl: phase2Url,
        phase3WebhookUrl: phase3Url,
        hmacSecret: process.env.WEBHOOK_SECRET,
        timeout: 5000,
        maxRetries: 2,
      });
      await phaseIntegrationService.initialize();
      
      // Set phase notifier on brain
      brain.setPhaseNotifier(phaseIntegrationService);
      console.log('   ✅ PhaseIntegrationService initialized');
      if (phase1Url) console.log(`      Phase 1: ${phase1Url}`);
      if (phase2Url) console.log(`      Phase 2: ${phase2Url}`);
      if (phase3Url) console.log(`      Phase 3: ${phase3Url}`);
    } else {
      console.log('   ⚠️  No phase webhook URLs configured, phase notifications disabled');
    }

    // Create dashboard service
    const dashboardService = new DashboardService(brain);

    // Get HMAC secret from environment
    const hmacSecret = process.env.WEBHOOK_SECRET || '';

    // Create and start webhook server
    console.log('🚀 Starting webhook server...');
    webhookServer = new WebhookServer(
      {
        host: config.server.host,
        port: config.server.port,
        corsOrigins: config.server.corsOrigins,
        hmac: {
          enabled: !!hmacSecret,
          secret: hmacSecret,
          headerName: 'x-signature',
          algorithm: 'sha256',
        },
        logLevel: process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info',
      },
      brain,
      signalQueue || undefined,
      dashboardService
    );

    await webhookServer.start();

    // Initialize WebSocket service for real-time updates
    console.log('📡 Starting WebSocket service...');
    const wsPort = parseInt(process.env.WS_PORT || '3101', 10);
    webSocketService = new WebSocketService(brain, {
      pingInterval: 30000,
      pingTimeout: 10000,
      stateUpdateInterval: 1000,
    });
    webSocketService.listen(wsPort, config.server.host);

    // Display startup summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    TITAN BRAIN ONLINE                          ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    const allocation = brain.getAllocation();
    console.log('📊 Current Allocation:');
    console.log(`   Phase 1 (Scavenger): ${(allocation.w1 * 100).toFixed(1)}%`);
    console.log(`   Phase 2 (Hunter):    ${(allocation.w2 * 100).toFixed(1)}%`);
    console.log(`   Phase 3 (Sentinel):  ${(allocation.w3 * 100).toFixed(1)}%`);
    console.log('');
    
    console.log('🌐 API Endpoints:');
    console.log(`   Health:     http://${config.server.host}:${config.server.port}/status`);
    console.log(`   Dashboard:  http://${config.server.host}:${config.server.port}/dashboard`);
    console.log(`   Signal:     http://${config.server.host}:${config.server.port}/signal`);
    console.log(`   Allocation: http://${config.server.host}:${config.server.port}/allocation`);
    console.log(`   WebSocket:  ws://${config.server.host}:${wsPort}/ws/console`);
    console.log('');
    
    console.log('📡 Phase Webhooks:');
    console.log(`   Phase 1:    http://${config.server.host}:${config.server.port}/webhook/phase1`);
    console.log(`   Phase 2:    http://${config.server.host}:${config.server.port}/webhook/phase2`);
    console.log(`   Phase 3:    http://${config.server.host}:${config.server.port}/webhook/phase3`);
    console.log('');

    console.log('🔗 Integration Status:');
    console.log(`   Execution Engine: ${executionEngineClient ? '✅ Connected' : '⚠️ Not configured'}`);
    console.log(`   Phase Notifier:   ${phaseIntegrationService ? '✅ Configured' : '⚠️ Not configured'}`);
    console.log(`   Signal Queue:     ${signalQueue ? '✅ Redis' : '⚠️ In-memory'}`);
    console.log('');

    console.log('✅ Titan Brain is ready to receive signals');
    console.log('');

    // Note: Metric updates are started automatically during brain.initialize()

  } catch (error) {
    console.error('❌ Failed to start Titan Brain:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log('');
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);

  try {
    // Shutdown brain (stops metric updates internally)
    if (brain) {
      await brain.shutdown();
    }

    // Stop webhook server
    if (webhookServer) {
      await webhookServer.stop();
    }

    // Stop WebSocket service
    if (webSocketService) {
      await webSocketService.shutdown();
    }

    // Shutdown integration services
    if (executionEngineClient) {
      await executionEngineClient.shutdown();
    }

    if (phaseIntegrationService) {
      await phaseIntegrationService.shutdown();
    }

    // Disconnect signal queue
    if (signalQueue) {
      await signalQueue.disconnect();
    }

    // Close database connection
    if (databaseManager) {
      await databaseManager.disconnect();
    }

    console.log('✅ Titan Brain shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  shutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the application
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

// Export for testing
export { main, shutdown };
