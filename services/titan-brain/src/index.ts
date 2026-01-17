/**
 * Titan Brain - Phase 5 Orchestrator (Enhanced)
 *
 * Main entry point for the Titan Brain service with enhanced startup management.
 * Integrates StartupManager and ConfigManager for reliable production deployment.
 *
 * Enhanced with StartupManager and ConfigManager for reliable deployment.
 */

// Load environment variables from .env file
import "dotenv/config";

import { StartupManager } from "./startup/StartupManager.js";
import { BrainConfig, ConfigManager } from "./config/ConfigManager.js";

// Local implementation of standard init steps since it's not exported
function createStandardInitSteps(): any[] {
  return [
    {
      name: "validate-env",
      description: "Validate environment variables",
      timeout: 5000,
      required: true,
      dependencies: [],
      execute: async () => {/* Overridden in main */},
    },
    {
      name: "load-config",
      description: "Load application configuration",
      timeout: 10000,
      required: true,
      dependencies: ["validate-env"],
      execute: async () => {/* Overridden in main */},
    },
    {
      name: "init-db",
      description: "Initialize database connection",
      timeout: 30000,
      required: true,
      dependencies: ["load-config"],
      execute: async () => {/* Overridden in main */},
    },
    {
      name: "init-redis",
      description: "Initialize Redis connection",
      timeout: 15000,
      required: true,
      dependencies: ["load-config"],
      execute: async () => {/* Overridden in main */},
    },
    {
      name: "init-engine",
      description: "Initialize core engine",
      timeout: 60000,
      required: true,
      dependencies: ["init-db", "init-redis"],
      execute: async () => {/* Overridden in main */},
    },
    {
      name: "start-server",
      description: "Start HTTP and WebSocket servers",
      timeout: 30000,
      required: true,
      dependencies: ["init-engine"],
      execute: async () => {/* Overridden in main */},
    },
  ];
}
import { loadConfig } from "./config/index.js";
import { DatabaseManager, runMigrations } from "./db/index.js";
import {
  ActiveInferenceEngine,
  AllocationEngine,
  CapitalFlowManager,
  CircuitBreaker,
  PerformanceTracker,
  RiskGuardian,
  TitanBrain,
} from "./engine/index.js";
import {
  DashboardService,
  ExecutionEngineClient,
  NotificationService,
  PhaseIntegrationService,
  SignalQueue,
  TitanNotificationHandler,
  WebhookServer,
  WebSocketService,
} from "./server/index.js";
import { InMemorySignalQueue } from "./server/InMemorySignalQueue.js";
import { ISignalQueue } from "./server/ISignalQueue.js";
import { getLogger, getMetrics } from "./monitoring/index.js";
import { StateRecoveryService } from "./engine/StateRecoveryService.js";
import { ManualOverrideService } from "./engine/ManualOverrideService.js";
import { NatsConsumer } from "./server/NatsConsumer.js";

// Global instances for cleanup
let brain: TitanBrain | null = null;
let webhookServer: WebhookServer | null = null;
let signalQueue: ISignalQueue | null = null;
let databaseManager: DatabaseManager | null = null;
let executionEngineClient: ExecutionEngineClient | null = null;
let phaseIntegrationService: PhaseIntegrationService | null = null;
let webSocketService: WebSocketService | null = null;
let startupManager: StartupManager | null = null;
let configManager: ConfigManager | null = null;
let natsConsumer: NatsConsumer | null = null;

/**
 * Main startup function with enhanced startup management
 */
async function main(): Promise<void> {
  const logger = getLogger();
  // Initialize metrics for later use
  getMetrics();

  console.log("");
  console.log(
    "╔═══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                    TITAN BRAIN - Phase 5                       ║",
  );
  console.log(
    "║                   Master Orchestrator v1.0                     ║",
  );
  console.log(
    "║                  Production Deployment                         ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝",
  );
  console.log("");

  try {
    // Initialize startup manager
    startupManager = new StartupManager({
      maxStartupTime: 60000, // 60 seconds for production
      gracefulShutdownTimeout: 30000, // 30 seconds
    });

    // Initialize configuration manager
    configManager = new ConfigManager();

    // Set up initialization steps
    const initSteps = createStandardInitSteps();

    // Customize steps with actual implementations
    initSteps[0].execute = async () => {
      // Environment variable validation
      const requiredVars = [
        "NODE_ENV",
        "SERVER_PORT",
        "DB_HOST",
        "DB_NAME",
        "DB_USER",
        "DB_PASSWORD",
      ];

      const missingVars = requiredVars.filter((varName) =>
        !process.env[varName]
      );

      if (missingVars.length > 0) {
        throw new Error(
          `Missing required environment variables: ${missingVars.join(", ")}`,
        );
      }

      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(
        `Server Port: ${process.env.SERVER_PORT || process.env.PORT}`,
      );
      logger.info(`Database Host: ${process.env.DB_HOST}`);
      logger.info(`Log Level: ${process.env.LOG_LEVEL || "info"}`);
    };

    initSteps[1].execute = async () => {
      // Load configuration using new ConfigManager
      logger.info("📋 Loading configuration with ConfigManager...");
      const brainConfig = await configManager!.loadConfig();

      // Also load legacy config for compatibility
      const { config, validation } = loadConfig({
        validate: true,
        throwOnError: true,
      });

      if (validation.warnings.length > 0) {
        logger.warn("Configuration warnings:", {
          warnings: validation.warnings,
        });
        validation.warnings.forEach((w) => logger.warn(`   - ${w}`));
      }

      // Initialize database
      logger.info("🗄️  Initializing database...");
      databaseManager = new DatabaseManager(configManager!.getDatabaseConfig());
      await databaseManager.connect();

      // Run migrations
      logger.info("📦 Running database migrations...");
      await runMigrations(databaseManager);
    };

    initSteps[2].execute = async () => {
      // Redis connection (optional)
      logger.info("📬 Initializing signal queue...");
      if (
        process.env.REDIS_DISABLED === "true"
      ) {
        logger.warn(
          "Redis disabled, using in-memory queue",
        );
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
            keyPrefix: "titan:brain:signals",
            idempotencyTTL: 3600,
            maxQueueSize: 10000,
          });
          await signalQueue.connect();
          logger.info("   ✅ Redis signal queue connected");
        } catch (error) {
          logger.warn("Redis not available, using in-memory queue", { error });
          signalQueue = new InMemorySignalQueue({
            idempotencyTTL: 3600000,
            maxQueueSize: 10000,
          });
          await signalQueue.connect();
        }
      }
    };

    initSteps[3].execute = async () => {
      // Configuration loading and core engine initialization
      const brainConfig = configManager!.getConfig();
      const { config } = loadConfig({ validate: true, throwOnError: true });

      logger.info("⚙️  Initializing core engines...");

      const allocationEngine = new AllocationEngine(config.allocationEngine);
      logger.info("   ✅ AllocationEngine initialized");

      const performanceTracker = new PerformanceTracker(
        config.performanceTracker,
        databaseManager!,
      );
      logger.info("   ✅ PerformanceTracker initialized");

      const riskGuardian = new RiskGuardian(
        config.riskGuardian,
        allocationEngine,
      );
      logger.info("   ✅ RiskGuardian initialized");

      const capitalFlowManager = new CapitalFlowManager(config.capitalFlow);
      logger.info("   ✅ CapitalFlowManager initialized");

      const circuitBreaker = new CircuitBreaker(config.circuitBreaker);
      logger.info("   ✅ CircuitBreaker initialized");

      const activeInferenceEngine = new ActiveInferenceEngine(
        config.activeInference,
      );
      logger.info("   ✅ ActiveInferenceEngine initialized");

      // Initialize state recovery service
      const stateRecoveryService = new StateRecoveryService(databaseManager!, {
        performanceWindowDays: config.performanceTracker.windowDays,
        defaultAllocation: { w1: 1.0, w2: 0.0, w3: 0.0, timestamp: Date.now() },
        defaultHighWatermark: 0,
      });
      logger.info("   ✅ StateRecoveryService initialized");

      const manualOverrideService = new ManualOverrideService(
        databaseManager!,
        {
          maxOverrideDurationHours: 24,
          requiredPermissions: ["override"],
          warningBannerTimeout: 300000, // 5 minutes
        },
      );
      logger.info("   ✅ ManualOverrideService initialized");

      // Initialize notification service
      const notificationService = new NotificationService(config.notifications);
      logger.info("   ✅ NotificationService initialized");

      // Create TitanBrain orchestrator
      logger.info("🧠 Creating TitanBrain orchestrator...");
      brain = new TitanBrain(
        config.brain,
        allocationEngine,
        performanceTracker,
        riskGuardian,
        capitalFlowManager,
        circuitBreaker,
        activeInferenceEngine,
        databaseManager!,
        stateRecoveryService,
        manualOverrideService,
      );

      // Set initial equity from environment or default
      const initialEquity = (config as any).trading?.initialEquity || 100000;
      brain.setEquity(initialEquity);
      logger.info(`   💰 Initial equity: ${initialEquity.toLocaleString()}`);

      // Initialize brain (loads state from database)
      await brain.initialize();
      logger.info("   ✅ TitanBrain initialized");

      // Wire up notification handler
      const notificationHandler = new TitanNotificationHandler(
        notificationService,
      );
      circuitBreaker.setNotificationHandler(notificationHandler);
      riskGuardian.setCorrelationNotifier(notificationHandler);
      capitalFlowManager.setSweepNotifier(notificationHandler);
      logger.info("   ✅ Notification handlers wired");
    };

    initSteps[4].execute = async () => {
      // HTTP server startup
      const brainConfig = configManager!.getConfig();

      logger.info("🔗 Initializing integration services...");

      // ExecutionEngineClient
      // Initialize unconditionally to support NATS communication
      const { config } = loadConfig({ validate: false });
      executionEngineClient = new ExecutionEngineClient({
        baseUrl: (config as any).services?.execution || "http://localhost:3002", // Default/Fallback
        hmacSecret: brainConfig.hmacSecret,
        timeout: 5000,
        maxRetries: 3,
      });
      await executionEngineClient.initialize();

      // Wire up fill confirmation handling
      executionEngineClient.onFillConfirmation((fill) => {
        logger.info("Fill confirmation received", {
          signalId: fill.signalId,
          symbol: fill.symbol,
          fillPrice: fill.fillPrice,
          fillSize: fill.fillSize,
        });
      });

      // Set execution engine client on brain
      brain!.setExecutionEngine(executionEngineClient);
      logger.info("   ✅ ExecutionEngineClient initialized (NATS)");

      // Phase Integration Service (optional)
      if (
        brainConfig.phase1ServiceUrl || brainConfig.phase2ServiceUrl ||
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
        logger.info("   ✅ PhaseIntegrationService initialized");
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
        logger.info(
          "No phase webhook URLs configured, phase notifications disabled",
        );
      }

      // Create dashboard service
      const dashboardService = new DashboardService(brain!);

      // Start Dashboard Service publishing
      logger.info("📊 Starting Dashboard Service publishing...");
      dashboardService.startPublishing(1000);

      // Create and start webhook server
      logger.info("🚀 Starting webhook server...");
      webhookServer = new WebhookServer(
        {
          host: brainConfig.host,
          port: brainConfig.port,
          corsOrigins: brainConfig.corsOrigins,
          hmac: {
            enabled: !!brainConfig.hmacSecret,
            secret: brainConfig.hmacSecret,
            headerName: "x-signature",
            algorithm: "sha256",
          },
          logLevel: brainConfig.logLevel,
        },
        brain!,
        signalQueue || undefined,
        dashboardService,
      );

      await webhookServer.start();

      // Initialize WebSocket service first (but don't listen yet if needed?)
      logger.info("📡 Initializing WebSocket service...");
      const wsPort = parseInt(process.env.WS_PORT || "3101", 10);
      webSocketService = new WebSocketService(brain!, {
        pingInterval: 30000,
        pingTimeout: 10000,
        stateUpdateInterval: 0, // Disable polling, use NATS
      });
      // Start listening later or now? listen() starts server.
      webSocketService.listen(wsPort, brainConfig.host);

      // Initialize NATS Consumer
      logger.info("📨 Starting NATS Consumer...");
      natsConsumer = new NatsConsumer(brain!, webSocketService);
      await natsConsumer.start(brainConfig.natsUrl);
      logger.info("   ✅ NATS Consumer started");

      // Initialize NATS Publisher for AI optimization triggers
      logger.info("📤 Starting NATS Publisher...");
      const { getNatsPublisher } = await import("./server/NatsPublisher.js");
      const natsPublisher = getNatsPublisher();
      await natsPublisher.connect(brainConfig.natsUrl);
      logger.info("   ✅ NATS Publisher started");

      // Initialize Accounting Service (Phase 4) - Requires NATS
      const { TreasuryRepository } = await import(
        "./db/repositories/TreasuryRepository.js"
      );
      const treasuryRepository = new TreasuryRepository(databaseManager!);
      const { AccountingService } = await import(
        "./services/accounting/AccountingService.js"
      );
      const accountingService = new AccountingService(treasuryRepository);
      await accountingService.start();
      logger.info("   ✅ AccountingService (Phase 4) initialized");

      // Mark startup as complete for health checks
      webhookServer.markStartupComplete(); // Wait webhookServer not created yet if I reordered?
    };

    // Add all steps to startup manager
    if (!startupManager) {
      throw new Error("StartupManager not initialized");
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
      throw new Error("ConfigManager not initialized");
    }
    const finalConfig = configManager.getConfig();
    displayStartupSummary(finalConfig);
  } catch (error) {
    const logger = getLogger();
    logger.error("❌ Failed to start Titan Brain", error);
    process.exit(1);
  }
}

/**
 * Display startup summary
 */
function displayStartupSummary(config: BrainConfig): void {
  const logger = getLogger();
  console.log("");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(
    "                    TITAN BRAIN ONLINE                          ",
  );
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("");

  const allocation = brain!.getAllocation();
  logger.info("📊 Current Allocation:", { allocation });
  logger.info(`   Phase 1 (Scavenger): ${(allocation.w1 * 100).toFixed(1)}%`);
  logger.info(`   Phase 2 (Hunter):    ${(allocation.w2 * 100).toFixed(1)}%`);
  logger.info(`   Phase 3 (Sentinel):  ${(allocation.w3 * 100).toFixed(1)}%`);

  logger.info("🌐 API Endpoints:", {
    health: `http://${config.host}:${config.port}/health`,
    dashboard: `http://${config.host}:${config.port}/dashboard`,
    signal: `http://${config.host}:${config.port}/signal`,
    allocation: `http://${config.host}:${config.port}/allocation`,
    websocket: `ws://${config.host}:${
      parseInt(process.env.WS_PORT || "3101")
    }/ws/console`,
  });

  logger.info("📡 Phase Webhooks (if enabled):", {
    phase1: config.phase1ServiceUrl || "disabled",
    phase2: config.phase2ServiceUrl || "disabled",
    phase3: config.phase3ServiceUrl || "disabled",
  });

  logger.info("🔗 Integration Status:", {
    executionEngine: executionEngineClient ? "Connected" : "Not configured",
    phaseNotifier: phaseIntegrationService ? "Configured" : "Not configured",
    signalQueue: signalQueue ? "Redis" : "In-memory",
  });

  logger.info("✅ Titan Brain is ready to receive signals");
}

/**
 * Enhanced graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  const logger = getLogger();
  console.log("");
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

      logger.info("✅ Titan Brain shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error("❌ Error during shutdown", error);
      process.exit(1);
    }
  }
}

// Register shutdown handlers
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  const logger = getLogger();
  logger.error("❌ Uncaught exception", error);
  shutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  const logger = getLogger();
  logger.error("❌ Unhandled rejection", undefined, { reason, promise });
});

// Start the application
main().catch((error) => {
  const logger = getLogger();
  logger.error("❌ Fatal error", error);
  process.exit(1);
});

// Export for testing
export { main, shutdown };
