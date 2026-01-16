/**
 * Titan Brain - Phase 5 Orchestrator (Enhanced)
 *
 * Main entry point for the Titan Brain service with enhanced startup management.
 * Integrates StartupManager and ConfigManager for reliable Railway deployment.
 *
 * Enhanced with StartupManager and ConfigManager for reliable Railway deployment.
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
    "║                  Enhanced Railway Deployment                    ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝",
  );
  console.log("");

  try {
    // Initialize startup manager
    startupManager = new StartupManager({
      maxStartupTime: 60000, // 60 seconds for Railway
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

      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(
        `Server Port: ${process.env.SERVER_PORT || process.env.PORT}`,
      );
      console.log(`Database Host: ${process.env.DB_HOST}`);
      console.log(`Log Level: ${process.env.LOG_LEVEL || "info"}`);
    };

    initSteps[1].execute = async () => {
      // Load configuration using new ConfigManager
      console.log("📋 Loading configuration with ConfigManager...");
      const brainConfig = await configManager!.loadConfig();

      // Also load legacy config for compatibility
      const { config, validation } = loadConfig({
        validate: true,
        throwOnError: true,
      });

      if (validation.warnings.length > 0) {
        console.log("⚠️  Configuration warnings:");
        validation.warnings.forEach((w) => console.log(`   - ${w}`));
      }

      // Initialize database
      console.log("🗄️  Initializing database...");
      // Initialize database
      console.log("🗄️  Initializing database...");
      databaseManager = new DatabaseManager(configManager!.getDatabaseConfig());
      await databaseManager.connect();

      // Run migrations
      console.log("📦 Running database migrations...");
      await runMigrations(databaseManager);
    };

    initSteps[2].execute = async () => {
      // Redis connection (optional)
      console.log("📬 Initializing signal queue...");
      if (
        process.env.REDIS_DISABLED === "true" ||
        process.env.RAILWAY_ENVIRONMENT === "true"
      ) {
        console.log(
          "   ⚠️  Redis disabled, using in-memory queue",
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
          console.log("   ✅ Redis signal queue connected");
        } catch (error) {
          console.log("   ⚠️  Redis not available, using in-memory queue");
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

      console.log("⚙️  Initializing core engines...");

      const allocationEngine = new AllocationEngine(config.allocationEngine);
      console.log("   ✅ AllocationEngine initialized");

      const performanceTracker = new PerformanceTracker(
        config.performanceTracker,
        databaseManager!,
      );
      console.log("   ✅ PerformanceTracker initialized");

      const riskGuardian = new RiskGuardian(
        config.riskGuardian,
        allocationEngine,
      );
      console.log("   ✅ RiskGuardian initialized");

      const capitalFlowManager = new CapitalFlowManager(config.capitalFlow);
      console.log("   ✅ CapitalFlowManager initialized");

      const circuitBreaker = new CircuitBreaker(config.circuitBreaker);
      console.log("   ✅ CircuitBreaker initialized");

      // Initialize state recovery service
      const stateRecoveryService = new StateRecoveryService(databaseManager!, {
        performanceWindowDays: config.performanceTracker.windowDays,
        defaultAllocation: { w1: 1.0, w2: 0.0, w3: 0.0, timestamp: Date.now() },
        defaultHighWatermark: 0,
      });
      console.log("   ✅ StateRecoveryService initialized");

      // Initialize manual override service
      const manualOverrideService = new ManualOverrideService(
        databaseManager!,
        {
          maxOverrideDurationHours: 24,
          requiredPermissions: ["override"],
          warningBannerTimeout: 300000, // 5 minutes
        },
      );
      console.log("   ✅ ManualOverrideService initialized");

      // Initialize notification service
      const notificationService = new NotificationService(config.notifications);
      console.log("   ✅ NotificationService initialized");

      // Create TitanBrain orchestrator
      console.log("🧠 Creating TitanBrain orchestrator...");
      brain = new TitanBrain(
        config.brain,
        allocationEngine,
        performanceTracker,
        riskGuardian,
        capitalFlowManager,
        circuitBreaker,
        databaseManager!,
        stateRecoveryService,
        manualOverrideService,
      );

      // Set initial equity from environment or default
      const initialEquity = (config as any).trading?.initialEquity || 100000;
      brain.setEquity(initialEquity);
      console.log(`   💰 Initial equity: ${initialEquity.toLocaleString()}`);

      // Initialize brain (loads state from database)
      await brain.initialize();
      console.log("   ✅ TitanBrain initialized");

      // Wire up notification handler
      const notificationHandler = new TitanNotificationHandler(
        notificationService,
      );
      circuitBreaker.setNotificationHandler(notificationHandler);
      riskGuardian.setCorrelationNotifier(notificationHandler);
      capitalFlowManager.setSweepNotifier(notificationHandler);
      console.log("   ✅ Notification handlers wired");
    };

    initSteps[4].execute = async () => {
      // HTTP server startup
      const brainConfig = configManager!.getConfig();

      console.log("🔗 Initializing integration services...");

      // Execution Engine Client (optional)
      // Use legacy config for execution URL as it's not in proper BrainConfig yet
      const { config } = loadConfig({ validate: false });
      if ((config as any).services?.execution) {
        executionEngineClient = new ExecutionEngineClient({
          baseUrl: (config as any).services.execution,
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
        console.log(
          `   ✅ ExecutionEngineClient connected to ${
            (config as any).services.execution
          }`,
        );
      } else {
        console.log(
          "   ⚠️  Execution service URL not configured, signal forwarding disabled",
        );
      }

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
        console.log("   ✅ PhaseIntegrationService initialized");
        if (brainConfig.phase1ServiceUrl) {
          console.log(`      Phase 1: ${brainConfig.phase1ServiceUrl}`);
        }
        if (brainConfig.phase2ServiceUrl) {
          console.log(`      Phase 2: ${brainConfig.phase2ServiceUrl}`);
        }
        if (brainConfig.phase3ServiceUrl) {
          console.log(`      Phase 3: ${brainConfig.phase3ServiceUrl}`);
        }
      } else {
        console.log(
          "   ⚠️  No phase webhook URLs configured, phase notifications disabled",
        );
      }

      // Create dashboard service
      const dashboardService = new DashboardService(brain!);

      // Start Dashboard Service publishing
      console.log("📊 Starting Dashboard Service publishing...");
      dashboardService.startPublishing(1000);

      // Create and start webhook server
      console.log("🚀 Starting webhook server...");
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
      console.log("📡 Initializing WebSocket service...");
      const wsPort = parseInt(process.env.WS_PORT || "3101", 10);
      webSocketService = new WebSocketService(brain!, {
        pingInterval: 30000,
        pingTimeout: 10000,
        stateUpdateInterval: 0, // Disable polling, use NATS
      });
      // Start listening later or now? listen() starts server.
      webSocketService.listen(wsPort, brainConfig.host);

      // Initialize NATS Consumer
      console.log("📨 Starting NATS Consumer...");
      natsConsumer = new NatsConsumer(brain!, webSocketService);
      await natsConsumer.start(brainConfig.natsUrl);
      console.log("   ✅ NATS Consumer started");

      // Initialize NATS Publisher for AI optimization triggers
      console.log("📤 Starting NATS Publisher...");
      const { getNatsPublisher } = await import("./server/NatsPublisher.js");
      const natsPublisher = getNatsPublisher();
      await natsPublisher.connect(brainConfig.natsUrl);
      console.log("   ✅ NATS Publisher started");

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
    console.error("❌ Failed to start Titan Brain:", error);
    process.exit(1);
  }
}

/**
 * Display startup summary
 */
function displayStartupSummary(config: BrainConfig): void {
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
  console.log("📊 Current Allocation:");
  console.log(`   Phase 1 (Scavenger): ${(allocation.w1 * 100).toFixed(1)}%`);
  console.log(`   Phase 2 (Hunter):    ${(allocation.w2 * 100).toFixed(1)}%`);
  console.log(`   Phase 3 (Sentinel):  ${(allocation.w3 * 100).toFixed(1)}%`);
  console.log("");

  console.log("🌐 API Endpoints:");
  console.log(`   Health:     http://${config.host}:${config.port}/health`);
  console.log(`   Dashboard:  http://${config.host}:${config.port}/dashboard`);
  console.log(`   Signal:     http://${config.host}:${config.port}/signal`);
  console.log(`   Allocation: http://${config.host}:${config.port}/allocation`);
  console.log(
    `   WebSocket:  ws://${config.host}:${
      parseInt(process.env.WS_PORT || "3101")
    }/ws/console`,
  );
  console.log("");

  console.log("📡 Phase Webhooks:");
  console.log(
    `   Phase 1:    http://${config.host}:${config.port}/webhook/phase1`,
  );
  console.log(
    `   Phase 2:    http://${config.host}:${config.port}/webhook/phase2`,
  );
  console.log(
    `   Phase 3:    http://${config.host}:${config.port}/webhook/phase3`,
  );
  console.log("");

  console.log("🔗 Integration Status:");
  console.log(
    `   Execution Engine: ${
      executionEngineClient ? "✅ Connected" : "⚠️ Not configured"
    }`,
  );
  console.log(
    `   Phase Notifier:   ${
      phaseIntegrationService ? "✅ Configured" : "⚠️ Not configured"
    }`,
  );
  console.log(
    `   Signal Queue:     ${signalQueue ? "✅ Redis" : "⚠️ In-memory"}`,
  );
  console.log("");

  console.log("✅ Titan Brain is ready to receive signals");
  console.log("");
}

/**
 * Enhanced graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log("");
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);

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

      console.log("✅ Titan Brain shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  }
}

// Register shutdown handlers
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
  shutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled rejection at:", promise, "reason:", reason);
});

// Start the application
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

// Export for testing
export { main, shutdown };
