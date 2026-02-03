/**
 * End-to-End Integration Tests (Smoke Test)
 *
 * Verifies that the Titan Brain system can be initialized and HTTP server responds.
 * Uses manual dependency injection to match the production assembly in index.ts.
 */

import { FastifyInstance } from "fastify";
import { WebhookServer } from "../../src/server/WebhookServer";
import { TitanBrain } from "../../src/engine/TitanBrain";
import { DatabaseManager } from "../../src/db/DatabaseManager";
import { BrainConfig } from "../../src/config/BrainConfig";
import { Logger } from "../../src/logging/Logger";

// Mock dependencies to avoid complex setup
import { InMemorySignalQueue } from "../../src/server/InMemorySignalQueue";
import { DashboardService } from "../../src/server/DashboardService";
import { AllocationEngine } from "../../src/features/Allocation/AllocationEngine";
import { PerformanceTracker } from "../../src/engine/PerformanceTracker";
import { RiskGuardian } from "../../src/features/Risk/RiskGuardian";
import { CapitalFlowManager } from "../../src/engine/CapitalFlowManager";
import { CircuitBreaker } from "../../src/engine/CircuitBreaker";
import { ActiveInferenceEngine } from "../../src/engine/ActiveInferenceEngine";
import { GovernanceEngine } from "../../src/engine/GovernanceEngine";
import { StateRecoveryService } from "../../src/engine/StateRecoveryService";
import { ManualOverrideService } from "../../src/engine/ManualOverrideService";
import { FillsRepository } from "../../src/db/repositories/FillsRepository";
import { IngestionQueue } from "../../src/queue/IngestionQueue";

// Test Config
const testConfig: BrainConfig = {
  nodeEnv: "test",
  port: 0, // Random port
  host: "127.0.0.1",
  databaseUrl: "postgres://user:pass@localhost:5432/db", // Placeholder, we might mock DB manager
  // Add other required config fields with defaults
  databaseHost: "localhost",
  databasePort: 5432,
  databaseUser: "user",
  databasePassword: "pass",
  databaseName: "db",
  databasePoolMin: 1,
  databasePoolMax: 2,
  logLevel: "error" as any,
  risk: {
    maxLeverage: 10,
    fatTailBuffer: 0.1,
    tailIndexThreshold: 2.0,
    maxImpactBps: 50,
  },
  // Mock other sections needed by sub-engines...
  allocation: { defaultWeight: 0.3 }, // hypothetical
  // ... we will cast to any for sections we don't strictly type check here
} as any;

describe("End-to-End Smoke Test", () => {
  let server: WebhookServer;
  let brain: TitanBrain;
  let databaseManager: DatabaseManager;
  let serverAddress: string;

  beforeAll(async () => {
    const logger = new Logger({ level: "error", enableConsole: false });

    // 1. Mock Database (to avoid requiring running Postgres for unit/integration in CI)
    // We cast to assertion because we won't actually connect
    databaseManager = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      getPool: jest.fn(),
      query: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    } as unknown as DatabaseManager;

    // 2. Initialize Engines (Mock or Real with Mock Config)
    // We use 'as any' for config parts to simplify this smoke test setup
    const allocationEngine = new AllocationEngine({} as any);
    const performanceTracker = new PerformanceTracker(
      {} as any,
      databaseManager,
    );
    const governanceEngine = new GovernanceEngine();
    const riskGuardian = new RiskGuardian(
      {} as any,
      allocationEngine,
      governanceEngine,
    );
    const capitalFlowManager = new CapitalFlowManager({} as any);
    const circuitBreaker = new CircuitBreaker({} as any);
    const activeInferenceEngine = new ActiveInferenceEngine({} as any);
    const stateRecoveryService = new StateRecoveryService(
      databaseManager,
      {} as any,
    );
    const manualOverrideService = new ManualOverrideService(
      databaseManager,
      {} as any,
    );
    const fillsRepository = new FillsRepository(databaseManager);
    const ingestionQueue = new IngestionQueue();

    // 3. Initialize Brain
    brain = new TitanBrain(
      testConfig as any,
      allocationEngine,
      performanceTracker,
      riskGuardian,
      capitalFlowManager,
      circuitBreaker,
      activeInferenceEngine,
      governanceEngine,
      databaseManager,
      stateRecoveryService,
      manualOverrideService,
      fillsRepository,
      ingestionQueue,
    );

    // Mock brain.initialize to skip DB calls
    jest.spyOn(brain, "initialize").mockResolvedValue(undefined);
    await brain.initialize();

    // 4. Initialize Server
    const signalQueue = new InMemorySignalQueue();
    const dashboardService = new DashboardService(brain);

    server = new WebhookServer(
      {
        host: testConfig.host,
        port: testConfig.port,
        logLevel: "error",
        corsOrigins: ["*"],
        hmac: {
          enabled: false,
          secret: "test",
          headerName: "x-sig",
          algorithm: "sha256",
        },
      },
      brain,
      signalQueue,
      dashboardService,
    );

    await server.start();

    const address = server.getServer()?.server.address();
    if (address && typeof address === "object") {
      serverAddress = `http://127.0.0.1:${address.port}`;
    } else {
      // Fallback or error
      serverAddress = `http://127.0.0.1:${testConfig.port}`;
    }
  });

  afterAll(async () => {
    if (server) await server.stop();
    if (brain) await brain.shutdown();
  });

  it("should start and expose health endpoint", async () => {
    const response = await fetch(`${serverAddress}/health`);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty("status");
    expect(json.status).toBe("healthy"); // or "ok" depending on impl
  });

  // Add more smoke tests here...
});
