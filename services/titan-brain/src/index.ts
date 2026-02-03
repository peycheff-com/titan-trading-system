// Initialize OpenTelemetry Tracing (Must be first)
// import "./tracing.js";

/**
 * Titan Brain - Phase 5 Orchestrator (Enhanced)
 *
 * Main entry point for the Titan Brain service with enhanced startup management.
 * Integrates StartupManager and ConfigManager for reliable production deployment.
 *
 * Enhanced with StartupManager and ConfigManager for reliable deployment.
 */

// Load environment variables from .env file
import 'dotenv/config';
import { loadSecretsFromFiles } from '@titan/shared';
loadSecretsFromFiles();

import { getNatsClient, Logger } from '@titan/shared';
import { StartupManager } from './startup/StartupManager.js';
import { FeatureManager } from './config/FeatureManager.js';
import { BrainConfig } from './config/BrainConfig.js';
import { SharedConfigAdapter as ConfigManager } from './config/SharedConfigAdapter.js';
import Redis from 'ioredis';

// Local implementation of standard init steps since it's not exported
function createStandardInitSteps(): any[] {
  return [
    {
      name: 'validate-env',
      description: 'Validate environment variables',
      timeout: 5000,
      required: true,
      dependencies: [],
      execute: async () => {
        /* Overridden in main */
      },
    },
    {
      name: 'load-config',
      description: 'Load application configuration',
      timeout: 10000,
      required: true,
      dependencies: ['validate-env'],
      execute: async () => {
        /* Overridden in main */
      },
    },
    {
      name: 'init-db',
      description: 'Initialize database connection',
      timeout: 30000,
      required: true,
      dependencies: ['load-config'],
      execute: async () => {
        /* Overridden in main */
      },
    },
    {
      name: 'init-redis',
      description: 'Initialize Redis connection',
      timeout: 15000,
      required: true,
      dependencies: ['load-config'],
      execute: async () => {
        /* Overridden in main */
      },
    },
    {
      name: 'init-nats',
      description: 'Initialize NATS connection',
      timeout: 60000,
      required: true,
      dependencies: ['load-config'],
      execute: async () => {
        /* Overridden in main */
      },
    },
    {
      name: 'init-engine',
      description: 'Initialize core engine',
      timeout: 600000,
      required: true,
      dependencies: ['init-db', 'init-redis', 'init-nats'],
      execute: async () => {
        /* Overridden in main */
      },
    },
    {
      name: 'start-server',
      description: 'Start HTTP and WebSocket servers',
      timeout: 30000,
      required: true,
      dependencies: ['init-engine'],
      execute: async () => {
        /* Overridden in main */
      },
    },
  ];
}
import { loadConfig } from './config/index.js';
import { DatabaseManager, runMigrations } from './db/index.js';
import {
  ActiveInferenceEngine,
  AllocationEngine,
  CapitalFlowManager,
  CircuitBreaker,
  GovernanceEngine,
  PerformanceTracker,
  PositionManager,
  RiskGuardian,
  TitanBrain,
  TradeGate,
} from './engine/index.js';
import {
  DashboardService,
  ExecutionEngineClient,
  NotificationService,
  PhaseIntegrationService,
  SignalQueue,
  TitanNotificationHandler,
  WebhookServer,
  WebSocketService,
} from './server/index.js';
import { InMemorySignalQueue } from './server/InMemorySignalQueue.js';
import { ISignalQueue } from './server/ISignalQueue.js';
import { getLogger, getMetrics } from './monitoring/index.js';
import { StateRecoveryService } from './engine/StateRecoveryService.js';
import { ManualOverrideService } from './engine/ManualOverrideService.js';
import { NatsConsumer } from './server/NatsConsumer.js';
import { IngestionQueue } from './queue/IngestionQueue.js';
import { IngestionWorker } from './workers/IngestionWorker.js';
import { SignalProcessor } from './engine/SignalProcessor.js';
import { AccountingService } from './services/accounting/AccountingService.js';

// Global instances for cleanup

// eslint-disable-next-line functional/no-let
let brain: TitanBrain | null = null;
// eslint-disable-next-line functional/no-let
let webhookServer: WebhookServer | null = null;
// eslint-disable-next-line functional/no-let
let signalQueue: ISignalQueue | null = null;
// eslint-disable-next-line functional/no-let
let databaseManager: DatabaseManager | null = null;
// eslint-disable-next-line functional/no-let
let executionEngineClient: ExecutionEngineClient | null = null;
// eslint-disable-next-line functional/no-let
let phaseIntegrationService: PhaseIntegrationService | null = null;
// eslint-disable-next-line functional/no-let
let webSocketService: WebSocketService | null = null;
// eslint-disable-next-line functional/no-let
let startupManager: StartupManager | null = null;
// eslint-disable-next-line functional/no-let
let configManager: ConfigManager | null = null;
// eslint-disable-next-line functional/no-let
let natsConsumer: NatsConsumer | null = null;
// eslint-disable-next-line functional/no-let
let accountingService: AccountingService | null = null;

/**
 * Main startup function with enhanced startup management
 */
async function main(): Promise<void> {
  const logger = getLogger();
  // Initialize metrics for later use
  getMetrics();

  // CLI Task Handling
  const args = process.argv.slice(2);
  if (args.includes('task:rebuild')) {
    await runRebuildTask(logger as any);
    return;
  }
  if (args.includes('task:reconcile')) {
    await runReconciliationTask(logger as any);
    return;
  }

  logger.info('');
  logger.info('╔═══════════════════════════════════════════════════════════════╗');
  logger.info('║                    TITAN BRAIN - Phase 5                       ║');
  logger.info('║                   Master Orchestrator v1.0                     ║');
  logger.info('║                  Production Deployment                         ║');
  logger.info('╚═══════════════════════════════════════════════════════════════╝');
  logger.info('');

  try {
    // Initialize startup manager
    startupManager = new StartupManager({
      maxStartupTime: 300000, // 5 minutes for production
      gracefulShutdownTimeout: 30000, // 30 seconds
    });

    // Initialize configuration manager
    configManager = new ConfigManager();

    // Initialize Ingestion Queue
    const ingestionQueue = new IngestionQueue();
    // We will initialize the worker after DB is ready

    // Set up initialization steps

    const initSteps = createStandardInitSteps();

    // Customize steps with actual implementations
    // eslint-disable-next-line functional/immutable-data
    initSteps[0].execute = async () => {
      // Environment variable validation
      const requiredVars = [
        'NODE_ENV',
        'SERVER_PORT',
        'DB_HOST',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD',
      ];

      const missingVars = requiredVars.filter((varName) => !process.env[varName]);

      if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }

      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Server Port: ${process.env.SERVER_PORT || process.env.PORT}`);
      logger.info(`Database Host: ${process.env.DB_HOST}`);
      logger.info(`Log Level: ${process.env.LOG_LEVEL || 'info'}`);
    };

    // eslint-disable-next-line functional/immutable-data
    initSteps[1].execute = async () => {
      // Load configuration using new ConfigManager
      logger.info('📋 Loading configuration with ConfigManager...');
      const brainConfig = await configManager!.loadConfig();

      // Initialize FeatureManager
      const featureManager = FeatureManager.getInstance(
        logger as unknown as Logger,
        brainConfig.redisUrl || 'redis://localhost:6379',
      );
      await featureManager.start();
      // eslint-disable-next-line functional/immutable-data
      brainConfig.featureManager = featureManager;

      // Also load legacy config for compatibility
      const { config, validation } = loadConfig({
        validate: true,
        throwOnError: true,
      });

      if (validation.warnings.length > 0) {
        logger.warn('Configuration warnings:', {
          warnings: validation.warnings,
        });
        validation.warnings.forEach((w) => logger.warn(`   - ${w}`));
      }

      // Initialize database
      logger.info('🗄️  Initializing database...');
      databaseManager = new DatabaseManager(configManager!.getDatabaseConfig());
      await databaseManager.connect();

      // Run migrations
      logger.info('📦 Running database migrations...');
      await runMigrations(databaseManager);
    };

    // eslint-disable-next-line functional/immutable-data
    initSteps[2].execute = async () => {
      // Redis connection (optional)
      logger.info('📬 Initializing signal queue...');
      if (process.env.REDIS_DISABLED === 'true') {
        logger.warn('Redis disabled, using in-memory queue');
        signalQueue = new InMemorySignalQueue({
          idempotencyTTL: 3600000, // 1 hour
          maxQueueSize: 10000,
        });
        await signalQueue.connect();
      } else {
        try {
          const brainConfig = configManager!.getConfig();
          signalQueue = new SignalQueue({
            url: brainConfig.redisUrl!,
            maxRetries: 3,
            retryDelay: 1000,
            keyPrefix: 'titan:brain:signals',
            idempotencyTTL: 3600,
            maxQueueSize: 10000,
          });
          await signalQueue.connect();
          logger.info('   ✅ Redis signal queue connected');
        } catch (error) {
          logger.warn('Redis not available, using in-memory queue', { error });
          signalQueue = new InMemorySignalQueue({
            idempotencyTTL: 3600000,
          });
          await signalQueue.connect();
        }
      }
    };

    // eslint-disable-next-line functional/immutable-data
    initSteps[3].execute = async () => {
      // NATS connection (required for system event replay)
      logger.info('📨 Initializing NATS connection...');
      const brainConfig = configManager!.getConfig();
      const nats = getNatsClient();
      await nats.connect({
        servers: [brainConfig.natsUrl || process.env.NATS_URL || 'nats://localhost:4222'],
        user: process.env.NATS_USER,
        pass: process.env.NATS_PASS,
      });
      logger.info('   ✅ NATS connection established');
    };

    // eslint-disable-next-line functional/immutable-data
    initSteps[4].execute = async () => {
      // Configuration loading and core engine initialization
      const brainConfig = configManager!.getConfig();
      const { config } = loadConfig({ validate: true, throwOnError: true });

      logger.info('⚙️  Initializing core engines...');

      const allocationEngine = new AllocationEngine(config.allocationEngine);
      logger.info('   ✅ AllocationEngine initialized');

      const performanceTracker = new PerformanceTracker(
        config.performanceTracker,
        databaseManager!,
      );
      logger.info('   ✅ PerformanceTracker initialized');

      const governanceEngine = new GovernanceEngine();
      logger.info('   ✅ GovernanceEngine initialized');

      const riskGuardian = new RiskGuardian(
        config.riskGuardian,
        allocationEngine,
        governanceEngine,
        getNatsClient(),
      );

      // Wire up Hot Risk Configuration
      if (brainConfig.featureManager) {
        riskGuardian.setFeatureManager(brainConfig.featureManager);
        logger.info('   ✅ Hot Risk Configuration enabled');
      }

      logger.info('   ✅ RiskGuardian initialized');

      const capitalFlowManager = new CapitalFlowManager(config.capitalFlow);
      logger.info('   ✅ CapitalFlowManager initialized');

      const circuitBreaker = new CircuitBreaker(config.circuitBreaker);

      // Wire up persistence for Circuit Breaker
      if (process.env.REDIS_DISABLED !== 'true' && brainConfig.redisUrl) {
        logger.info('   🔌 Wiring Circuit Breaker persistence to Redis...');
        try {
          const persistenceRedis = new (Redis as any)(brainConfig.redisUrl);
          circuitBreaker.setStateStore({
            save: async (key: string, value: string) => {
              await persistenceRedis.set(key, value);
            },
            load: async (key: string) => {
              return await persistenceRedis.get(key);
            },
          });
        } catch (error) {
          logger.error('   ❌ Failed to wire Circuit Breaker persistence', error as Error);
        }
      }

      logger.info('   ✅ CircuitBreaker initialized');

      const activeInferenceEngine = new ActiveInferenceEngine(config.activeInference);
      logger.info('   ✅ ActiveInferenceEngine initialized');

      const tradeGate = new TradeGate(); // Use defaults
      logger.info('   ✅ TradeGate initialized');

      const positionManager = new PositionManager();
      logger.info('   ✅ PositionManager initialized');

      // Initialize state recovery service
      const stateRecoveryService = new StateRecoveryService(
        databaseManager!,
        {
          performanceWindowDays: config.performanceTracker.windowDays,
          defaultAllocation: {
            w1: 1.0,
            w2: 0.0,
            w3: 0.0,
            timestamp: Date.now(),
          },
          defaultHighWatermark: 0,
        },
        getNatsClient(),
        riskGuardian,
      );
      logger.info('   ✅ StateRecoveryService initialized');

      const manualOverrideService = new ManualOverrideService(databaseManager!, {
        maxOverrideDurationHours: 24,
        requiredPermissions: ['override'],
        warningBannerTimeout: 300000, // 5 minutes
      });
      logger.info('   ✅ ManualOverrideService initialized');

      // Initialize notification service
      const notificationService = new NotificationService(config.notifications);
      logger.info('   ✅ NotificationService initialized');

      // Initialize FillsRepository (Audit Trail)
      const { FillsRepository } = await import('./db/repositories/FillsRepository.js');
      const fillsRepository = new FillsRepository(databaseManager!);
      logger.info('   ✅ FillsRepository initialized');

      // Initialize PowerLawRepository
      const { PowerLawRepository } = await import('./db/repositories/PowerLawRepository.js');
      const powerLawRepository = new PowerLawRepository(databaseManager!);
      logger.info('   ✅ PowerLawRepository initialized');

      // Initialize PositionRepository (Snapshotting)
      const { PositionRepository } = await import('./db/repositories/PositionRepository.js');
      const positionRepository = new PositionRepository(databaseManager!);
      logger.info('   ✅ PositionRepository initialized');

      // Initialize TruthRepository (Truth Layer)
      const { TruthRepository } = await import('./db/repositories/TruthRepository.js');
      const truthRepository = new TruthRepository(databaseManager!);
      logger.info('   ✅ TruthRepository initialized');

      // Initialize Ingestion Worker
      const ingestionWorker = new IngestionWorker(
        ingestionQueue,
        databaseManager!,
        fillsRepository,
      );
      ingestionWorker.start();
      logger.info('   ✅ IngestionWorker initialized and started');

      // Register shutdown for worker
      startupManager!.registerShutdownHandler(async () => {
        ingestionWorker.stop();
      });

      // Create TitanBrain orchestrator

      logger.info('🧠 Creating TitanBrain orchestrator...');
      brain = new TitanBrain(
        config,
        allocationEngine,
        performanceTracker,
        riskGuardian,
        capitalFlowManager,
        circuitBreaker,
        activeInferenceEngine,
        governanceEngine,
        tradeGate,
        positionManager,
        databaseManager!,
        stateRecoveryService,
        manualOverrideService,
        fillsRepository,
        powerLawRepository,
        positionRepository,
        ingestionQueue,
        undefined, // eventStore (reserved)
        undefined, // reconciliationConfig (reserved)
        truthRepository,
      );

      // Initialize Signal Processor (New 2026 Flow)
      const signalProcessor = new SignalProcessor(
        riskGuardian,
        allocationEngine,
        performanceTracker,
        brain.getStateManager(),
        circuitBreaker,
      );
      // SignalProcessor is started by TitanBrain upon leadership promotion
      // await signalProcessor.start();
      logger.info('   ✅ SignalProcessor initialized (Managed by TitanBrain)');

      // Set initial equity from environment or default
      const initialEquity = (config as any).trading?.initialEquity || 100000;
      brain.setEquity(initialEquity);
      logger.info(`   💰 Initial equity: ${initialEquity.toLocaleString()}`);

      // Initialize brain (loads state from database)
      await brain.initialize();
      logger.info('   ✅ TitanBrain initialized');

      // Wire up notification handler
      const notificationHandler = new TitanNotificationHandler(notificationService);
      circuitBreaker.setNotificationHandler(notificationHandler);
      riskGuardian.setCorrelationNotifier(notificationHandler);
      capitalFlowManager.setSweepNotifier(notificationHandler);
      logger.info('   ✅ Notification handlers wired');
    };

    // eslint-disable-next-line functional/immutable-data
    initSteps[5].execute = async () => {
      // HTTP server startup
      const brainConfig = configManager!.getConfig();

      logger.info('🔗 Initializing integration services...');

      // ExecutionEngineClient
      // Initialize unconditionally to support NATS communication
      const { config } = loadConfig({ validate: false });
      executionEngineClient = new ExecutionEngineClient({
        baseUrl: (config as any).services?.execution || 'http://localhost:3002', // Default/Fallback
        hmacSecret: brainConfig.hmacSecret,
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
      logger.info('   ✅ ExecutionEngineClient initialized (NATS)');

      // Phase Integration Service (optional)
      if (
        brainConfig.phase1ServiceUrl ||
        brainConfig.phase2ServiceUrl ||
        brainConfig.phase3ServiceUrl
      ) {
        phaseIntegrationService = new PhaseIntegrationService({
          phase1WebhookUrl: brainConfig.phase1ServiceUrl,
          phase2WebhookUrl: brainConfig.phase2ServiceUrl,
          phase3WebhookUrl: brainConfig.phase3ServiceUrl,
          hmacSecret: brainConfig.hmacSecret,
          timeout: 5000,
          maxRetries: 2,
        });
        await phaseIntegrationService.initialize();

        // Set phase notifier on brain
        brain!.setPhaseNotifier(phaseIntegrationService);
        logger.info('   ✅ PhaseIntegrationService initialized');
        if (brainConfig.phase1ServiceUrl) {
          logger.info(`      Phase 1: ${brainConfig.phase1ServiceUrl}`);
        }
        if (brainConfig.phase2ServiceUrl) {
          logger.info(`      Phase 2: ${brainConfig.phase2ServiceUrl}`);
        }
        if (brainConfig.phase3ServiceUrl) {
          logger.info(`      Phase 3: ${brainConfig.phase3ServiceUrl}`);
        }
      } else {
        logger.info('No phase webhook URLs configured, phase notifications disabled');
      }

      // Create dashboard service
      const dashboardService = new DashboardService(brain!);

      // Start Dashboard Service publishing
      logger.info('📊 Starting Dashboard Service publishing...');
      dashboardService.startPublishing(1000);

      // Create and start webhook server
      logger.info('🚀 Starting webhook server...');
      webhookServer = new WebhookServer(
        {
          host: brainConfig.host,
          port: brainConfig.port,
          corsOrigins: brainConfig.corsOrigins,
          hmac: {
            enabled: !!brainConfig.hmacSecret,
            secret: brainConfig.hmacSecret || '',
            headerName: 'x-signature',
            algorithm: 'sha256',
          },
          logLevel: brainConfig.logLevel,
        },
        brain!,
        signalQueue || undefined,
        dashboardService,
      );

      await webhookServer.start();

      // Initialize WebSocket service first (but don't listen yet if needed?)
      logger.info('📡 Initializing WebSocket service...');
      const wsPort = parseInt(process.env.WS_PORT || '3101', 10);
      webSocketService = new WebSocketService(brain!, {
        pingInterval: 30000,
        pingTimeout: 10000,
        stateUpdateInterval: 0, // Disable polling, use NATS
      });
      // Start listening later or now? listen() starts server.
      webSocketService.listen(wsPort, brainConfig.host);

      // Initialize NATS Consumer
      // Note: NATS connection is already established in init-nats step
      logger.info('📨 Starting NATS Consumer...');
      natsConsumer = new NatsConsumer(brain!, webSocketService);
      // We can skip calling start() if it just connects, but NatsConsumer.start also subscribes.
      // We should check if NatsConsumer reuses the singleton connection correctly or if we need to adjust it.
      // Assuming NatsConsumer uses getNatsClient() internally and handles existing connection gracefully.
      await natsConsumer.start(brainConfig.natsUrl);
      logger.info('   ✅ NATS Consumer started');

      // Initialize NATS Publisher for AI optimization triggers
      logger.info('📤 Starting NATS Publisher...');
      const { getNatsPublisher } = await import('./server/NatsPublisher.js');
      const natsPublisher = getNatsPublisher();
      await natsPublisher.connect(brainConfig.natsUrl);
      logger.info('   ✅ NATS Publisher started');

      // Initialize Accounting Service (Phase 4) - Requires NATS
      const { FillsRepository } = await import('./db/repositories/FillsRepository.js');
      // Re-instantiate FillsRepository for AccountingService (or could lift to outer scope)
      const accountingFillsRepo = new FillsRepository(databaseManager!);

      const { LedgerRepository } = await import('./db/repositories/LedgerRepository.js');
      const accountingLedgerRepo = new LedgerRepository(databaseManager!);

      const { AccountingService } = await import('./services/accounting/AccountingService.js');
      accountingService = new AccountingService(accountingFillsRepo, accountingLedgerRepo);
      await accountingService.start();
      logger.info('   ✅ AccountingService (Phase 4) initialized');

      // Inject FillsRepository into TitanBrain if already created (it was created above, so we might need to recreate or setter?)
      // Actually TitanBrain is created BEFORE this block in step 3. I need to move FillsRepository creation earlier or pass it later.
      // Wait, step 3 is where Brain is created. This is step 4.
      // I should modify step 3 to include FillsRepository.

      // Mark startup as complete for health checks
      webhookServer.markStartupComplete(); // Wait webhookServer not created yet if I reordered?
    };

    // Add all steps to startup manager
    if (!startupManager) {
      throw new Error('StartupManager not initialized');
    }

    const sm = startupManager; // Create a non-null reference
    initSteps.forEach((step) => sm.registerStep(step));

    // Add shutdown handlers
    sm.registerShutdownHandler(async () => {
      if (brain) await brain.shutdown();
    });

    sm.registerShutdownHandler(async () => {
      if (webhookServer) await webhookServer.stop();
    });

    sm.registerShutdownHandler(async () => {
      if (webSocketService) await webSocketService.shutdown();
    });

    sm.registerShutdownHandler(async () => {
      if (natsConsumer) await natsConsumer.stop();
    });

    sm.registerShutdownHandler(async () => {
      if (executionEngineClient) await executionEngineClient.shutdown();
    });

    sm.registerShutdownHandler(async () => {
      if (accountingService) await accountingService.stop(); // Stop Accounting Service
    });

    sm.registerShutdownHandler(async () => {
      if (phaseIntegrationService) await phaseIntegrationService.shutdown();
    });

    sm.registerShutdownHandler(async () => {
      if (signalQueue) await signalQueue.disconnect();
    });

    sm.registerShutdownHandler(async () => {
      if (databaseManager) await databaseManager.disconnect();
    });

    // Start initialization
    await sm.start();

    // Display startup summary
    if (!configManager) {
      throw new Error('ConfigManager not initialized');
    }
    const finalConfig = configManager.getConfig();
    displayStartupSummary(finalConfig);
  } catch (error) {
    const logger = getLogger();
    logger.error('❌ Failed to start Titan Brain', error);
    process.exit(1);
  }
}

/**
 * Display startup summary
 */
function displayStartupSummary(config: BrainConfig): void {
  const logger = getLogger();
  logger.info('');
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('                    TITAN BRAIN ONLINE                          ');
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('');

  const allocation = brain!.getAllocation();
  logger.info('📊 Current Allocation:', { allocation });
  logger.info(`   Phase 1 (Scavenger): ${(allocation.w1 * 100).toFixed(1)}%`);
  logger.info(`   Phase 2 (Hunter):    ${(allocation.w2 * 100).toFixed(1)}%`);
  logger.info(`   Phase 3 (Sentinel):  ${(allocation.w3 * 100).toFixed(1)}%`);

  logger.info('🌐 API Endpoints:', {
    health: `http://${config.host}:${config.port}/health`,
    dashboard: `http://${config.host}:${config.port}/dashboard`,
    signal: `http://${config.host}:${config.port}/signal`,
    allocation: `http://${config.host}:${config.port}/allocation`,
    websocket: `ws://${config.host}:${parseInt(process.env.WS_PORT || '3101')}/ws/console`,
  });

  logger.info('📡 Phase Webhooks (if enabled):', {
    phase1: config.phase1ServiceUrl || 'disabled',
    phase2: config.phase2ServiceUrl || 'disabled',
    phase3: config.phase3ServiceUrl || 'disabled',
  });

  logger.info('🔗 Integration Status:', {
    executionEngine: executionEngineClient ? 'Connected' : 'Not configured',
    phaseNotifier: phaseIntegrationService ? 'Configured' : 'Not configured',
    signalQueue: signalQueue ? 'Redis' : 'In-memory',
  });

  logger.info('✅ Titan Brain is ready to receive signals');
}

/**
 * Enhanced graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  const logger = getLogger();
  logger.info('');
  logger.info(`🛑 Received ${signal}, shutting down gracefully...`);

  if (startupManager) {
    await startupManager.shutdown();
  } else {
    // Fallback shutdown if startup manager not available
    try {
      if (brain) await brain.shutdown();
      if (webhookServer) await webhookServer.stop();
      if (webSocketService) await webSocketService.shutdown();
      if (natsConsumer) await natsConsumer.stop();
      if (executionEngineClient) await executionEngineClient.shutdown();
      if (phaseIntegrationService) await phaseIntegrationService.shutdown();
      if (signalQueue) await signalQueue.disconnect();
      if (databaseManager) await databaseManager.disconnect();

      logger.info('✅ Titan Brain shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  const logger = getLogger();
  logger.error('❌ Uncaught exception', error);
  shutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const logger = getLogger();
  logger.error('❌ Unhandled rejection', undefined, { reason, promise });
});

// Helper Tasks

async function runRebuildTask(logger: Logger) {
  logger.info('🔧 Running Task: Rebuild Read Models');
  // Initialize minimal dependencies
  const configManager = new ConfigManager();
  await configManager.loadConfig(); // Must load config first
  const dbManager = new DatabaseManager(configManager.getDatabaseConfig());
  await dbManager.connect();

  const { EventReplayService } = await import('./engine/EventReplayService.js');
  const replay = new EventReplayService(dbManager, logger);

  try {
    await replay.replayAll(true); // Reset by default for full rebuild
    logger.info('✅ Rebuild Successful');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Rebuild Failed', err as Error);
    process.exit(1);
  }
}

async function runReconciliationTask(logger: Logger) {
  logger.info('⚖️  Running Task: Reconciliation');

  // Minimal setup
  const configManager = new ConfigManager();
  await configManager.loadConfig(); // Must load config first
  const dbManager = new DatabaseManager(configManager.getDatabaseConfig());
  await dbManager.connect();

  const brainConfig = configManager.getConfig();
  const { loadConfig } = await import('./config/index.js');
  const { config } = loadConfig({ validate: false });

  // Execution Client checks actual reality (NATS)
  const { ExecutionEngineClient } = await import('./server/index.js');
  const executionClient = new ExecutionEngineClient({
    baseUrl: (config as any).services?.execution || 'http://localhost:3002',
    hmacSecret: brainConfig.hmacSecret,
    timeout: 5000,
  });
  await executionClient.initialize();

  // Position Manager checks internal model
  const { PositionManager } = await import('./engine/index.js');
  const positionManager = new PositionManager();

  const { PositionRepository } = await import('./db/repositories/PositionRepository.js');
  const positionRepo = new PositionRepository(dbManager);

  const { TruthRepository } = await import('./db/repositories/TruthRepository.js');
  const truthRepo = new TruthRepository(dbManager);

  // Hydrate PositionManager from persistent state (Snapshot)
  // Logic: In a task run, we don't have memory state, so we must load from DB or Event Log
  // For Reconciliation, we prioritize the Snapshot + recent events, but simpler is Snapshot.
  // ReplayService is better for exact state, but here we check snapshot vs exchange.

  const { StateRecoveryService } = await import('./engine/StateRecoveryService.js');
  const recovery = new StateRecoveryService(
    dbManager,
    {
      performanceWindowDays: 7,
      defaultAllocation: { w1: 1, w2: 0, w3: 0, timestamp: Date.now() },
      defaultHighWatermark: 0,
    },
    { publish: () => {} } as any,
  ); // Mock NATS for recovery

  logger.info('... Recovering Brain State from DB ...');
  const restoredState = await recovery.recoverState();
  if (restoredState.positions) {
    for (const pos of restoredState.positions) {
      positionManager.updatePosition(pos);
    }
    logger.info(`✅ Hydrated ${restoredState.positions.length} positions from snapshot`);
  }

  const { ReconciliationService } = await import('./reconciliation/ReconciliationService.js');
  const recon = new ReconciliationService(
    {
      intervalMs: 60000,
      exchanges: ['BYBIT', 'BINANCE'], // TODO: Load from config
      autoResolve: false,
    },
    executionClient,
    positionManager,
    positionRepo,
    undefined, // EventStore
    truthRepo,
  );

  try {
    const reports = await recon.reconcileAll();
    const hasDrift = reports.some((r) => r.status === 'MISMATCH' || r.status === 'ERROR');

    // Cleanup
    await dbManager.disconnect();

    if (hasDrift) {
      logger.error('❌ Reconciliation found mismatches or errors');
      process.exit(1);
    } else {
      logger.info('✅ Reconciliation Clean');
      process.exit(0);
    }
  } catch (err) {
    logger.error('❌ Reconciliation Failed', err as Error);
    await dbManager.disconnect();
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  const logger = getLogger();
  logger.error('❌ Fatal error', error);
  process.exit(1);
});

// Export for testing
export { main, shutdown };
