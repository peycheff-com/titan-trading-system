/**
 * Titan Brain - Phase 5 Orchestrator (Enhanced)
 * 
 * Main entry point for the Titan Brain service with enhanced startup management.
 * Integrates StartupManager and ConfigManager for reliable Railway deployment.
 * 
 * Enhanced with StartupManager and ConfigManager for reliable Railway deployment.
 */

// Load environment variables from .env file
import 'dotenv/config';

import { StartupManager, createStandardInitSteps } from './startup/StartupManager.js';
import { ConfigManager, BrainConfig } from './config/ConfigManager.js';
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
let startupManager: StartupManager | null = null;
let configManager: ConfigManager | null = null;

/**
 * Main startup function with enhanced startup management
 */
async function main(): Promise<void> {
  const logger = getLogger();
  // Initialize metrics for later use
  getMetrics();
  
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    TITAN BRAIN - Phase 5                       ║');
  console.log('║                   Master Orchestrator v1.0                     ║');
  console.log('║                  Enhanced Railway Deployment                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Initialize startup manager
    startupManager = new StartupManager({
      maxStartupTime: 60000, // 60 seconds for Railway
      gracefulShutdownTimeout: 30000, // 30 seconds
      logLevel: (process.env.LOG_LEVEL as any) || 'info'
    });

    // Initialize configuration manager
    configManager = new ConfigManager();

    // Set up initialization steps
    const initSteps = createStandardInitSteps();
    
    // Customize steps with actual implementations
    initSteps[0].execute = async () => {
      // Environment variable validation
      const requiredVars = [
        'NODE_ENV',
        'SERVER_PORT',
        'DB_HOST',
        'DB_NAME', 
        'DB_USER',
        'DB_PASSWORD'
      ];
      
      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }
      
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Server Port: ${process.env.SERVER_PORT || process.env.PORT}`);
      console.log(`Database Host: ${process.env.DB_HOST}`);
      console.log(`Log Level: ${process.env.LOG_LEVEL || 'info'}`);
    };

    initSteps[1].execute = async () => {
      // Load configuration using new ConfigManager
      console.log('📋 Loading configuration with ConfigManager...');
      const brainConfig = await configManager!.loadConfiguration();
      
      // Also load legacy config for compatibility
      const { config, validation } = loadConfig({
        validate: true,
        throwOnError: true,
      });

      if (validation.warnings.length > 0) {
        console.log('⚠️  Configuration warnings:');
        validation.warnings.forEach(w => console.log(`   - ${w}`));
      }

      // Initialize database
      console.log('🗄️  Initializing database...');
      databaseManager = new DatabaseManager(brainConfig.database);
      await databaseManager.connect();
      
      // Run migrations
      console.log('📦 Running database migrations...');
      await runMigrations(databaseManager);
    };

    initSteps[2].execute = async () => {
      // Redis connection (optional)
      console.log('📬 Initializing signal queue...');
      if (process.env.REDIS_DISABLED === 'true' || process.env.RAILWAY_ENVIRONMENT === 'true') {
        console.log('   ⚠️  Redis disabled for Railway deployment, using in-memory queue');
        signalQueue = null;
      } else {
        try {
          const brainConfig = configManager!.getConfiguration();
          signalQueue = new SignalQueue({
            url: brainConfig.redis.url,
            maxRetries: brainConfig.redis.maxRetries,
            retryDelay: brainConfig.redis.retryDelay,
            keyPrefix: 'titan:brain:signals',
            idempotencyTTL: 3600,
            maxQueueSize: brainConfig.trading.maxQueueSize,
          });
          await signalQueue.connect();
          console.log('   ✅ Redis signal queue connected');
        } catch (error) {
          console.log('   ⚠️  Redis not available, using in-memory queue');
          signalQueue = null;
        }
      }
    };

    initSteps[3].execute = async () => {
      // Configuration loading and core engine initialization
      const brainConfig = configManager!.getConfiguration();
      const { config } = loadConfig({ validate: true, throwOnError: true });

      console.log('⚙️  Initializing core engines...');
      
      const allocationEngine = new AllocationEngine(config.allocationEngine);
      console.log('   ✅ AllocationEngine initialized');

      const performanceTracker = new PerformanceTracker(
        config.performanceTracker,
        databaseManager!
      );
      console.log('   ✅ PerformanceTracker initialized');

      const riskGuardian = new RiskGuardian(config.riskGuardian, allocationEngine);
      console.log('   ✅ RiskGuardian initialized');

      const capitalFlowManager = new CapitalFlowManager(config.capitalFlow);
      console.log('   ✅ CapitalFlowManager initialized');

      const circuitBreaker = new CircuitBreaker(config.circuitBreaker);
      console.log('   ✅ CircuitBreaker initialized');

      // Initialize state recovery service
      const stateRecoveryService = new StateRecoveryService(databaseManager!, {
        performanceWindowDays: config.performanceTracker.windowDays,
        defaultAllocation: { w1: 1.0, w2: 0.0, w3: 0.0, timestamp: Date.now() },
        defaultHighWatermark: 0,
      });
      console.log('   ✅ StateRecoveryService initialized');

      // Initialize manual override service
      const manualOverrideService = new ManualOverrideService(databaseManager!, {
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
        databaseManager!,
        stateRecoveryService,
        manualOverrideService
      );

      // Set initial equity from environment or default
      const initialEquity = brainConfig.trading.initialEquity;
      brain.setEquity(initialEquity);
      console.log(`   💰 Initial equity: ${initialEquity.toLocaleString()}`);

      // Initialize brain (loads state from database)
      await brain.initialize();
      console.log('   ✅ TitanBrain initialized');

      // Wire up notification handler
      const notificationHandler = new TitanNotificationHandler(notificationService);
      circuitBreaker.setNotificationHandler(notificationHandler);
      riskGuardian.setCorrelationNotifier(notificationHandler);
      capitalFlowManager.setSweepNotifier(notificationHandler);
      console.log('   ✅ Notification handlers wired');
    };

    initSteps[4].execute = async () => {
      // HTTP server startup
      const brainConfig = configManager!.getConfiguration();
      
      console.log('🔗 Initializing integration services...');

      // Execution Engine Client (optional)
      if (brainConfig.services.execution) {
        executionEngineClient = new ExecutionEngineClient({
          baseUrl: brainConfig.services.execution,
          hmacSecret: brainConfig.security.webhookSecret,
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
        });
        
        // Set execution engine client on brain
        brain!.setExecutionEngine(executionEngineClient);
        console.log(`   ✅ ExecutionEngineClient connected to ${brainConfig.services.execution}`);
      } else {
        console.log('   ⚠️  Execution service URL not configured, signal forwarding disabled');
      }

      // Phase Integration Service (optional)
      if (brainConfig.services.phase1 || brainConfig.services.phase2 || brainConfig.services.phase3) {
        phaseIntegrationService = new PhaseIntegrationService({
          phase1WebhookUrl: brainConfig.services.phase1,
          phase2WebhookUrl: brainConfig.services.phase2,
          phase3WebhookUrl: brainConfig.services.phase3,
          hmacSecret: brainConfig.security.webhookSecret,
          timeout: 5000,
          maxRetries: 2,
        });
        await phaseIntegrationService.initialize();
        
        // Set phase notifier on brain
        brain!.setPhaseNotifier(phaseIntegrationService);
        console.log('   ✅ PhaseIntegrationService initialized');
        if (brainConfig.services.phase1) console.log(`      Phase 1: ${brainConfig.services.phase1}`);
        if (brainConfig.services.phase2) console.log(`      Phase 2: ${brainConfig.services.phase2}`);
        if (brainConfig.services.phase3) console.log(`      Phase 3: ${brainConfig.services.phase3}`);
      } else {
        console.log('   ⚠️  No phase webhook URLs configured, phase notifications disabled');
      }

      // Create dashboard service
      const dashboardService = new DashboardService(brain!);

      // Create and start webhook server
      console.log('🚀 Starting webhook server...');
      webhookServer = new WebhookServer(
        {
          host: brainConfig.server.host,
          port: brainConfig.server.port,
          corsOrigins: brainConfig.security.corsOrigins,
          hmac: {
            enabled: !!brainConfig.security.hmacSecret,
            secret: brainConfig.security.hmacSecret,
            headerName: 'x-signature',
            algorithm: 'sha256',
          },
          logLevel: brainConfig.server.logLevel,
        },
        brain!,
        signalQueue || undefined,
        dashboardService
      );

      await webhookServer.start();
      
      // Mark startup as complete for health checks
      webhookServer.markStartupComplete();

      // Initialize WebSocket service for real-time updates
      console.log('📡 Starting WebSocket service...');
      const wsPort = parseInt(process.env.WS_PORT || '3101', 10);
      webSocketService = new WebSocketService(brain!, {
        pingInterval: 30000,
        pingTimeout: 10000,
        stateUpdateInterval: 1000,
      });
      webSocketService.listen(wsPort, brainConfig.server.host);
    };

    // Add all steps to startup manager
    if (!startupManager) {
      throw new Error('StartupManager not initialized');
    }
    
    const sm = startupManager; // Create a non-null reference
    initSteps.forEach(step => sm.addStep(step));

    // Add shutdown handlers
    sm.addShutdownHandler(async () => {
      if (brain) await brain.shutdown();
    });
    
    sm.addShutdownHandler(async () => {
      if (webhookServer) await webhookServer.stop();
    });
    
    sm.addShutdownHandler(async () => {
      if (webSocketService) await webSocketService.shutdown();
    });
    
    sm.addShutdownHandler(async () => {
      if (executionEngineClient) await executionEngineClient.shutdown();
    });
    
    sm.addShutdownHandler(async () => {
      if (phaseIntegrationService) await phaseIntegrationService.shutdown();
    });
    
    sm.addShutdownHandler(async () => {
      if (signalQueue) await signalQueue.disconnect();
    });
    
    sm.addShutdownHandler(async () => {
      if (databaseManager) await databaseManager.disconnect();
    });

    // Start initialization
    await sm.initialize();

    // Display startup summary
    if (!configManager) {
      throw new Error('ConfigManager not initialized');
    }
    const brainConfig = configManager.getConfiguration();
    displayStartupSummary(brainConfig);

  } catch (error) {
    console.error('❌ Failed to start Titan Brain:', error);
    process.exit(1);
  }
}

/**
 * Display startup summary
 */
function displayStartupSummary(config: BrainConfig): void {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    TITAN BRAIN ONLINE                          ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  const allocation = brain!.getAllocation();
  console.log('📊 Current Allocation:');
  console.log(`   Phase 1 (Scavenger): ${(allocation.w1 * 100).toFixed(1)}%`);
  console.log(`   Phase 2 (Hunter):    ${(allocation.w2 * 100).toFixed(1)}%`);
  console.log(`   Phase 3 (Sentinel):  ${(allocation.w3 * 100).toFixed(1)}%`);
  console.log('');
  
  console.log('🌐 API Endpoints:');
  console.log(`   Health:     http://${config.server.host}:${config.server.port}/health`);
  console.log(`   Dashboard:  http://${config.server.host}:${config.server.port}/dashboard`);
  console.log(`   Signal:     http://${config.server.host}:${config.server.port}/signal`);
  console.log(`   Allocation: http://${config.server.host}:${config.server.port}/allocation`);
  console.log(`   WebSocket:  ws://${config.server.host}:${parseInt(process.env.WS_PORT || '3101')}/ws/console`);
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
}

/**
 * Enhanced graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log('');
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);

  if (startupManager) {
    await startupManager.shutdown();
  } else {
    // Fallback shutdown if startup manager not available
    try {
      if (brain) await brain.shutdown();
      if (webhookServer) await webhookServer.stop();
      if (webSocketService) await webSocketService.shutdown();
      if (executionEngineClient) await executionEngineClient.shutdown();
      if (phaseIntegrationService) await phaseIntegrationService.shutdown();
      if (signalQueue) await signalQueue.disconnect();
      if (databaseManager) await databaseManager.disconnect();
      
      console.log('✅ Titan Brain shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
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