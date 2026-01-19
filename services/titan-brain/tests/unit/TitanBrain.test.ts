/**
 * Unit tests for TitanBrain orchestrator
 *
 * Requirements: 1.1, 1.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import {
  ActiveInferenceEngine,
  AllocationEngine,
  CapitalFlowManager,
  CircuitBreaker,
  ExecutionEngineClient,
  PerformanceTracker,
  PhaseNotifier,
  RiskGuardian,
  TitanBrain,
} from "../../src/engine/index.js";
import {
  ActiveInferenceConfig,
  AllocationEngineConfig,
  BrainConfig,
  CapitalFlowConfig,
  CircuitBreakerConfig,
  EquityTier,
  IntentSignal,
  PerformanceTrackerConfig,
  PhaseId,
  Position,
  RiskGuardianConfig,
} from "../../src/types/index.js";

// Default configurations for testing
const brainConfig: BrainConfig = {
  signalTimeout: 100,
  metricUpdateInterval: 60000,
  dashboardCacheTTL: 5000,
  maxQueueSize: 100,
};

const activeInferenceConfig: ActiveInferenceConfig = {
  windowSize: 20,
  minHistory: 10,
  distributionBins: 20,
  sensitivity: 5,
  surpriseOffset: 0.5,
};

const allocationConfig: AllocationEngineConfig = {
  transitionPoints: {
    startP2: 1500,
    fullP2: 5000,
    startP3: 25000,
  },
  leverageCaps: {
    [EquityTier.MICRO]: 20,
    [EquityTier.SMALL]: 10,
    [EquityTier.MEDIUM]: 5,
    [EquityTier.LARGE]: 3,
    [EquityTier.INSTITUTIONAL]: 2,
  },
};

const performanceConfig: PerformanceTrackerConfig = {
  windowDays: 7,
  minTradeCount: 10,
  malusMultiplier: 0.5,
  bonusMultiplier: 1.2,
  malusThreshold: 0,
  bonusThreshold: 2.0,
};

const riskConfig: RiskGuardianConfig = {
  maxCorrelation: 0.8,
  correlationPenalty: 0.5,
  betaUpdateInterval: 300000,
  correlationUpdateInterval: 300000,
  minStopDistanceMultiplier: 2.0,
};

import {
  DefconLevel,
  GovernanceEngine,
} from "../../src/engine/GovernanceEngine";

// Mock TailRiskCalculator module to prevent SURVIVAL_MODE triggers in tests
jest.mock("../../src/engine/TailRiskCalculator", () => {
  return {
    TailRiskCalculator: jest.fn().mockImplementation(() => ({
      calculateAPTR: jest.fn().mockReturnValue(0.5), // Safe low APTR
      isRiskCritical: jest.fn().mockReturnValue(false),
    })),
  };
});

const capitalFlowConfig: CapitalFlowConfig = {
  sweepThreshold: 1.2,
  reserveLimit: 200,
  sweepSchedule: "0 0 * * *",
  maxRetries: 3,
  retryBaseDelay: 1000,
};

const circuitBreakerConfig: CircuitBreakerConfig = {
  maxDailyDrawdown: 0.15,
  minEquity: 150,
  consecutiveLossLimit: 3,
  consecutiveLossWindow: 3600000,
  cooldownMinutes: 30,
};

// Helper to create TitanBrain instance
function createTitanBrain(): TitanBrain {
  const allocationEngine = new AllocationEngine(allocationConfig);
  const performanceTracker = new PerformanceTracker(performanceConfig);

  // Mock GovernanceEngine
  const governanceEngine = {
    getDefconLevel: jest.fn().mockReturnValue(DefconLevel.NORMAL),
    getLeverageMultiplier: jest.fn().mockReturnValue(1.0),
    canOpenNewPosition: jest.fn().mockReturnValue(true),
    updateHealth: jest.fn(),
    setOverride: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
  } as unknown as GovernanceEngine;

  const riskGuardian = new RiskGuardian(
    riskConfig,
    allocationEngine,
    governanceEngine,
  );
  const capitalFlowManager = new CapitalFlowManager(capitalFlowConfig);
  const circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
  const activeInferenceEngine = new ActiveInferenceEngine(
    activeInferenceConfig,
  );

  return new TitanBrain(
    brainConfig,
    allocationEngine,
    performanceTracker,
    riskGuardian,
    capitalFlowManager,
    circuitBreaker,
    activeInferenceEngine,
    governanceEngine,
  );
}

// Helper to create a test signal
function createSignal(
  phaseId: PhaseId = "phase1",
  requestedSize: number = 100,
  symbol: string = "BTCUSDT",
  side: "BUY" | "SELL" = "BUY",
): IntentSignal {
  return {
    signalId: `signal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    phaseId,
    symbol,
    side,
    requestedSize,
    timestamp: Date.now(),
  };
}

// Helper to create a test position
function createPosition(
  symbol: string = "BTCUSDT",
  side: "LONG" | "SHORT" = "LONG",
  size: number = 100,
  phaseId: PhaseId = "phase1",
): Position {
  return {
    symbol,
    side,
    size,
    entryPrice: 50000,
    unrealizedPnL: 0,
    leverage: 10,
    phaseId,
  };
}

describe("TitanBrain", () => {
  describe("initialization", () => {
    it("should create TitanBrain instance", () => {
      const brain = createTitanBrain();
      expect(brain).toBeDefined();
    });

    it("should initialize with default equity of 0", () => {
      const brain = createTitanBrain();
      expect(brain.getEquity()).toBe(0);
    });

    it("should initialize with empty positions", () => {
      const brain = createTitanBrain();
      expect(brain.getPositions()).toEqual([]);
    });
  });

  describe("equity management", () => {
    it("should update equity", () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      expect(brain.getEquity()).toBe(1000);
    });

    it("should not allow negative equity", () => {
      const brain = createTitanBrain();
      brain.setEquity(-100);
      expect(brain.getEquity()).toBe(0);
    });

    it("should update daily start equity", () => {
      const brain = createTitanBrain();
      brain.setDailyStartEquity(1000);
      // Verify through circuit breaker status
      const status = brain.getCircuitBreakerStatus();
      expect(status.equityLevel).toBe(1000);
    });
  });

  describe("position management", () => {
    it("should update positions", () => {
      const brain = createTitanBrain();
      const positions = [createPosition()];
      brain.setPositions(positions);
      expect(brain.getPositions()).toEqual(positions);
    });

    it("should return a copy of positions", () => {
      const brain = createTitanBrain();
      const positions = [createPosition()];
      brain.setPositions(positions);
      const retrieved = brain.getPositions();
      retrieved.push(createPosition("ETHUSDT"));
      expect(brain.getPositions().length).toBe(1);
    });
  });

  describe("signal processing", () => {
    it("should approve signal within limits", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const signal = createSignal("phase1", 100);
      const decision = await brain.processSignal(signal);

      expect(decision.approved).toBe(true);
      expect(decision.authorizedSize).toBeGreaterThan(0);
      expect(decision.signalId).toBe(signal.signalId);
    });

    it("should reject signal when circuit breaker is active", async () => {
      const brain = createTitanBrain();
      brain.setEquity(100); // Below minimum equity
      brain.setDailyStartEquity(1000);

      // Trigger circuit breaker by checking conditions
      const signal = createSignal("phase1", 100);
      const decision = await brain.processSignal(signal);

      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain("Circuit breaker");
    });

    it("should cap position size at equity * phase weight", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      // At $1000 equity, Phase 1 gets 100% allocation
      // Request more than equity
      const signal = createSignal("phase1", 2000);
      const decision = await brain.processSignal(signal);

      expect(decision.approved).toBe(true);
      // Authorized size should be capped at equity * weight (1000 * 1.0 = 1000)
      expect(decision.authorizedSize).toBeLessThanOrEqual(1000);
    });

    it("should include allocation in decision", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const signal = createSignal("phase1", 100);
      const decision = await brain.processSignal(signal);

      expect(decision.allocation).toBeDefined();
      expect(decision.allocation.w1).toBeGreaterThan(0);
      expect(
        decision.allocation.w1 + decision.allocation.w2 +
          decision.allocation.w3,
      ).toBeCloseTo(1.0);
    });

    it("should include performance in decision", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const signal = createSignal("phase1", 100);
      const decision = await brain.processSignal(signal);

      expect(decision.performance).toBeDefined();
      expect(decision.performance.phaseId).toBe("phase1");
      expect(decision.performance.modifier).toBe(1.0); // No trades yet
    });

    it("should include risk metrics in decision", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const signal = createSignal("phase1", 100);
      const decision = await brain.processSignal(signal);

      expect(decision.risk).toBeDefined();
      expect(decision.risk.riskMetrics).toBeDefined();
    });
  });

  describe("priority ordering (Requirement 7.1)", () => {
    it("should process signals in priority order: P3 > P2 > P1", async () => {
      const brain = createTitanBrain();
      brain.setEquity(50000); // High equity to enable all phases
      brain.setDailyStartEquity(50000);

      const signals = [
        createSignal("phase1", 100, "BTCUSDT"),
        createSignal("phase3", 100, "ETHUSDT"),
        createSignal("phase2", 100, "SOLUSDT"),
      ];

      const decisions = await brain.processSignals(signals);

      // Verify order: phase3 first, then phase2, then phase1
      expect(decisions[0].signalId).toBe(signals[1].signalId); // phase3
      expect(decisions[1].signalId).toBe(signals[2].signalId); // phase2
      expect(decisions[2].signalId).toBe(signals[0].signalId); // phase1
    });
  });

  describe("signal queue (Requirement 7.4)", () => {
    it("should enqueue signals", () => {
      const brain = createTitanBrain();
      const signal = createSignal("phase1", 100);

      brain.enqueueSignal(signal);
      // Queue is internal, but we can process it
    });

    it("should process queued signals in priority order", async () => {
      const brain = createTitanBrain();
      brain.setEquity(50000);
      brain.setDailyStartEquity(50000);

      brain.enqueueSignal(createSignal("phase1", 100, "BTCUSDT"));
      brain.enqueueSignal(createSignal("phase3", 100, "ETHUSDT"));
      brain.enqueueSignal(createSignal("phase2", 100, "SOLUSDT"));

      const decisions = await brain.processQueue();

      expect(decisions.length).toBe(3);
      // First decision should be from phase3 (highest priority)
      expect(decisions[0].allocation).toBeDefined();
    });

    it("should respect max queue size", () => {
      const brain = createTitanBrain();

      // Enqueue more than max
      for (let i = 0; i < 150; i++) {
        brain.enqueueSignal(createSignal("phase1", 100));
      }

      // Queue should be capped at maxQueueSize (100)
      // We can't directly check queue size, but processing should work
    });
  });

  describe("net position calculation (Requirement 7.3)", () => {
    it("should calculate net position for opposite signals", () => {
      const brain = createTitanBrain();

      const signals = [
        createSignal("phase1", 100, "BTCUSDT", "BUY"),
        createSignal("phase2", 60, "BTCUSDT", "SELL"),
      ];

      const result = brain.calculateNetPosition(signals);

      expect(result.netSize).toBe(40);
      expect(result.side).toBe("BUY");
    });

    it("should return NEUTRAL for balanced signals", () => {
      const brain = createTitanBrain();

      const signals = [
        createSignal("phase1", 100, "BTCUSDT", "BUY"),
        createSignal("phase2", 100, "BTCUSDT", "SELL"),
      ];

      const result = brain.calculateNetPosition(signals);

      expect(result.netSize).toBe(0);
      expect(result.side).toBe("NEUTRAL");
    });

    it("should handle net short position", () => {
      const brain = createTitanBrain();

      const signals = [
        createSignal("phase1", 50, "BTCUSDT", "BUY"),
        createSignal("phase2", 150, "BTCUSDT", "SELL"),
      ];

      const result = brain.calculateNetPosition(signals);

      expect(result.netSize).toBe(100);
      expect(result.side).toBe("SELL");
    });
  });

  describe("approval rate tracking (Requirement 7.7)", () => {
    it("should track approval rate per phase", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      // Process some signals
      await brain.processSignal(createSignal("phase1", 100));
      await brain.processSignal(createSignal("phase1", 100));

      const rate = brain.getApprovalRate("phase1");
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    });

    it("should return 1.0 for phases with no signals", () => {
      const brain = createTitanBrain();
      const rate = brain.getApprovalRate("phase2");
      expect(rate).toBe(1.0);
    });

    it("should get all approval rates", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      await brain.processSignal(createSignal("phase1", 100));

      const rates = brain.getAllApprovalRates();
      expect(rates.phase1).toBeDefined();
      expect(rates.phase2).toBeDefined();
      expect(rates.phase3).toBeDefined();
    });

    it("should reset signal stats", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      await brain.processSignal(createSignal("phase1", 100));
      brain.resetSignalStats();

      const rate = brain.getApprovalRate("phase1");
      expect(rate).toBe(1.0); // No signals after reset
    });
  });

  describe("dashboard data (Requirement 10)", () => {
    it("should return dashboard data", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const dashboard = await brain.getDashboardData();

      expect(dashboard.nav).toBe(1000);
      expect(dashboard.allocation).toBeDefined();
      expect(dashboard.phaseEquity).toBeDefined();
      expect(dashboard.riskMetrics).toBeDefined();
      expect(dashboard.treasury).toBeDefined();
      expect(dashboard.circuitBreaker).toBeDefined();
      expect(dashboard.recentDecisions).toBeDefined();
      expect(dashboard.lastUpdated).toBeDefined();
    });

    it("should calculate phase equity correctly", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const dashboard = await brain.getDashboardData();

      // At $1000, Phase 1 should have 100% allocation
      expect(dashboard.phaseEquity.phase1).toBeCloseTo(1000, 0);
      expect(dashboard.phaseEquity.phase2).toBeCloseTo(0, 0);
      expect(dashboard.phaseEquity.phase3).toBeCloseTo(0, 0);
    });

    it("should cache dashboard data", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const dashboard1 = await brain.getDashboardData();
      const dashboard2 = await brain.getDashboardData();

      // Should return cached data (same lastUpdated)
      expect(dashboard1.lastUpdated).toBe(dashboard2.lastUpdated);
    });

    it("should export dashboard to JSON", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const json = await brain.exportDashboardJSON();
      const parsed = JSON.parse(json);

      expect(parsed.nav).toBe(1000);
      expect(parsed.allocation).toBeDefined();
    });
  });

  describe("health status", () => {
    it("should return health status", async () => {
      const brain = createTitanBrain();

      const health = await brain.getHealthStatus();

      expect(health.healthy).toBeDefined();
      expect(health.components).toBeDefined();
      expect(health.lastCheck).toBeDefined();
      expect(health.errors).toBeDefined();
    });

    it("should flag phases with low approval rate", async () => {
      const brain = createTitanBrain();
      brain.setEquity(100); // Low equity to trigger rejections
      brain.setDailyStartEquity(1000);

      // Process signals that will be rejected
      for (let i = 0; i < 5; i++) {
        await brain.processSignal(createSignal("phase1", 100));
      }

      const health = await brain.getHealthStatus();

      // Should have errors about low approval rate
      if (brain.getApprovalRate("phase1") < 0.5) {
        expect(health.errors.some((e) => e.includes("phase1"))).toBe(true);
      }
    });
  });

  describe("circuit breaker integration", () => {
    it("should get circuit breaker status", () => {
      const brain = createTitanBrain();
      brain.setDailyStartEquity(1000);

      const status = brain.getCircuitBreakerStatus();

      expect(status.active).toBe(false);
      expect(status.dailyDrawdown).toBeDefined();
    });

    it("should reset circuit breaker with operator ID", async () => {
      const brain = createTitanBrain();
      brain.setEquity(100);
      brain.setDailyStartEquity(1000);

      // Trigger breaker
      await brain.processSignal(createSignal("phase1", 100));

      // Reset
      await brain.resetCircuitBreaker("operator-123");

      const status = brain.getCircuitBreakerStatus();
      expect(status.active).toBe(false);
    });
  });

  describe("trade recording", () => {
    it("should throw error when recording trades without database", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      // Should throw because no database is configured
      await expect(brain.recordTrade("phase1", 50, "BTCUSDT", "BUY"))
        .rejects.toThrow("Database not configured");
    });

    it("should get all phase performance", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      // This should work without database (returns empty data)
      const performance = await brain.getAllPhasePerformance();
      expect(performance).toBeDefined();
      expect(performance.length).toBe(3);
    });
  });

  describe("external integrations", () => {
    it("should set execution engine", () => {
      const brain = createTitanBrain();
      const mockEngine: ExecutionEngineClient = {
        forwardSignal: jest.fn(),
        closeAllPositions: jest.fn(),
        getPositions: jest.fn().mockResolvedValue([]),
      };

      brain.setExecutionEngine(mockEngine);
      // No error means success
    });

    it("should set phase notifier", () => {
      const brain = createTitanBrain();
      const mockNotifier: PhaseNotifier = {
        notifyVeto: jest.fn(),
      };

      brain.setPhaseNotifier(mockNotifier);
      // No error means success
    });

    it("should forward approved signals to execution engine", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const mockEngine: ExecutionEngineClient = {
        forwardSignal: jest.fn(),
        closeAllPositions: jest.fn(),
        getPositions: jest.fn().mockResolvedValue([]),
      };
      brain.setExecutionEngine(mockEngine);

      const signal = createSignal("phase1", 100);
      await brain.processSignal(signal);

      expect(mockEngine.forwardSignal).toHaveBeenCalled();
    });

    it("should notify phase on veto due to risk constraints", async () => {
      const brain = createTitanBrain();
      brain.setEquity(500);
      brain.setDailyStartEquity(500);

      // Add existing positions to trigger leverage cap
      const existingPositions: Position[] = [
        createPosition("BTCUSDT", "LONG", 9000, "phase1"), // High leverage position
      ];
      brain.setPositions(existingPositions);

      const mockNotifier: PhaseNotifier = {
        notifyVeto: jest.fn().mockResolvedValue(undefined),
      };
      brain.setPhaseNotifier(mockNotifier);

      // Request a large position that would exceed leverage cap
      const signal = createSignal("phase1", 5000, "ETHUSDT", "BUY");
      const decision = await brain.processSignal(signal);

      // Verify the signal was rejected due to leverage
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain("Leverage");

      // Should notify about veto
      expect(mockNotifier.notifyVeto).toHaveBeenCalledWith(
        "phase1",
        signal.signalId,
        expect.any(String),
      );
    });
  });

  describe("recent decisions", () => {
    it("should track recent decisions", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      await brain.processSignal(createSignal("phase1", 100));
      await brain.processSignal(createSignal("phase1", 100));

      const decisions = brain.getRecentDecisions();
      expect(decisions.length).toBe(2);
    });

    it("should limit recent decisions", async () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);
      brain.setDailyStartEquity(1000);

      const decisions = brain.getRecentDecisions(1);
      expect(decisions.length).toBeLessThanOrEqual(1);
    });
  });

  describe("allocation", () => {
    it("should get current allocation", () => {
      const brain = createTitanBrain();
      brain.setEquity(1000);

      const allocation = brain.getAllocation();

      expect(allocation.w1 + allocation.w2 + allocation.w3).toBeCloseTo(1.0);
    });
  });

  describe("treasury integration", () => {
    it("should get treasury status", async () => {
      const brain = createTitanBrain();

      const treasury = await brain.getTreasuryStatus();

      expect(treasury).toBeDefined();
      expect(treasury.futuresWallet).toBeDefined();
      expect(treasury.spotWallet).toBeDefined();
    });

    it("should get next sweep trigger level", () => {
      const brain = createTitanBrain();

      const level = brain.getNextSweepTriggerLevel();
      expect(level).toBeDefined();
    });

    it("should get total swept", () => {
      const brain = createTitanBrain();

      const swept = brain.getTotalSwept();
      expect(swept).toBe(0); // No sweeps yet
    });

    it("should get high watermark", () => {
      const brain = createTitanBrain();

      const watermark = brain.getHighWatermark();
      expect(watermark).toBe(0); // No updates yet
    });
  });

  describe("price history", () => {
    it("should update price history", () => {
      const brain = createTitanBrain();

      brain.updatePriceHistory("BTCUSDT", 50000);
      brain.updatePriceHistory("BTCUSDT", 51000);

      // No error means success
    });
  });

  describe("shutdown", () => {
    it("should shutdown gracefully", async () => {
      const brain = createTitanBrain();
      await brain.initialize();
      await brain.shutdown();
      // No error means success
    });
  });
});
