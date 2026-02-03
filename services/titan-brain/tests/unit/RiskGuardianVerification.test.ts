import { RiskGuardian } from "../../src/features/Risk/RiskGuardian";
import {
    DefconLevel,
    GovernanceEngine,
} from "../../src/engine/GovernanceEngine";
import { AllocationEngine } from "../../src/features/Allocation/AllocationEngine";
import {
    IntentSignal,
    PowerLawMetrics,
    RiskGuardianConfig,
} from "../../src/types";
import { NatsClient } from "@titan/shared";

// Mock dependencies
const mockAllocationEngine = {
    getMaxLeverage: jest.fn().mockReturnValue(10), // 10x max
} as unknown as AllocationEngine;

const mockGovernanceEngine = {
    getDefconLevel: jest.fn().mockReturnValue(DefconLevel.NORMAL),
    canOpenNewPosition: jest.fn().mockReturnValue(true),
    getLeverageMultiplier: jest.fn().mockReturnValue(1.0),
    setOverride: jest.fn(),
} as unknown as GovernanceEngine;

const mockNatsClient = {
    publish: jest.fn().mockResolvedValue(undefined),
} as unknown as NatsClient;

// Base config
const baseConfig: RiskGuardianConfig = {
    // --- Policy V1 Fields (set very permissive to not interfere with test scenarios) ---
    maxAccountLeverage: 1000,
    maxPositionNotional: 1_000_000_000,
    maxDailyLoss: -1_000_000,
    maxOpenOrdersPerSymbol: 100,
    symbolWhitelist: [], // Empty = allow all
    maxSlippageBps: 10000,
    maxStalenessMs: 60_000,
    version: 1,
    lastUpdated: 0,

    // --- Legacy/Extended Fields ---
    maxCorrelation: 0.7,
    correlationPenalty: 0.5,
    minConfidenceScore: 0.6,
    minStopDistanceMultiplier: 1.0,
    betaUpdateInterval: 60000,
    correlationUpdateInterval: 60000,
    confidence: {
        decayRate: 0.1,
        recoveryRate: 0.05,
        threshold: 0.5,
    },
    fractal: {
        phase1: { maxAllocation: 10.0, maxLeverage: 10, maxDrawdown: 0.02 }, // Increased allocation/leverage for testing
        phase2: { maxAllocation: 10.0, maxLeverage: 10, maxDrawdown: 0.05 },
        phase3: { maxAllocation: 0.8, maxLeverage: 2, maxDrawdown: 0.10 },
    },
    costVeto: {
        enabled: true,
        minExpectancyRatio: 2.0,
        baseFeeBps: 10,
    },
};

describe("RiskGuardian Logic Verification", () => {
    let riskGuardian: RiskGuardian;

    beforeEach(() => {
        jest.clearAllMocks();
        riskGuardian = new RiskGuardian(
            baseConfig,
            mockAllocationEngine,
            mockGovernanceEngine,
            mockNatsClient,
        );
        riskGuardian.setEquity(10000); // $10k equity
    });

    describe("Cost Veto (Expectancy)", () => {
        it("should reject signals with negative or low expectancy", () => {
            // Expectancy = (0.5 * 0.1) - (0.5 * 0.2) = -0.05
            const signal: IntentSignal = {
                signalId: "s1",
                phaseId: "phase1",
                symbol: "BTCUSDT",
                side: "BUY",
                requestedSize: 1000,
                entryPrice: 100,
                targetPrice: 100.10,
                stopLossPrice: 99.80,
                confidence: 70,
                type: "MANUAL",
                leverage: 1,
                volatility: 1.0, // Explicit volatility (1%) to pass Stop Distance check (1.0 vs 0.2)
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);
            expect(decision.approved).toBe(false);
            expect(decision.reason).toContain("Expectancy too low");
        });

        it("should approve signals with high positive expectancy", () => {
            // Expectancy ~ 0.8
            // Cost ~ 0.15
            // Ratio > 2.0
            const signal: IntentSignal = {
                signalId: "s2",
                phaseId: "phase1",
                symbol: "BTCUSDT",
                side: "BUY",
                requestedSize: 1000,
                entryPrice: 100,
                targetPrice: 102.00,
                stopLossPrice: 99.00, // Distance 1.0
                confidence: 70,
                type: "MANUAL",
                leverage: 1,
                volatility: 0.5, // Explicit volatility: 0.5. MinDistance = 0.5. StopDistance 1.0 > 0.5. Pass.
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);
            if (!decision.approved) {
                console.error("Failed Cost Veto Approval:", decision.reason);
            }
            expect(decision.approved).toBe(true);
        });
    });

    describe("Latency Penalties", () => {
        it("should penalize size for high latency (200-500ms)", () => {
            const signal: IntentSignal = {
                signalId: "s3",
                phaseId: "phase1",
                symbol: "ETHUSDT",
                side: "BUY",
                requestedSize: 1000,
                entryPrice: 2000,
                targetPrice: 2040,
                stopLossPrice: 1980,
                confidence: 70,
                type: "MANUAL",
                leverage: 1,
                volatility: 10,
                latencyProfile: {
                    transit: 50,
                    processing: 50,
                    endToEnd: 300,
                },
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);
            expect(decision.approved).toBe(true);
            expect(decision.adjustedSize).toBe(750);
        });
    });

    describe("Alpha Throttling (PowerLaw)", () => {
        it("should reduce size for low alpha (fat tails)", () => {
            const metrics: PowerLawMetrics = {
                symbol: "BTCUSDT",
                tailExponent: 1.8,
                tailConfidence: 0.95,
                exceedanceProbability: 0.05,
                volatilityCluster: {
                    state: "stable",
                    sigma: 0.02,
                    persistence: 0.5,
                },
                timestamp: Date.now(),
            };
            riskGuardian.updatePowerLawMetrics(metrics);

            const signal: IntentSignal = {
                signalId: "s5",
                phaseId: "phase1",
                symbol: "BTCUSDT",
                side: "BUY",
                requestedSize: 1000,
                entryPrice: 50000,
                targetPrice: 51000,
                stopLossPrice: 49000,
                confidence: 70,
                type: "MANUAL",
                leverage: 1,
                volatility: 500,
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);
            expect(decision.approved).toBe(true);
            expect(decision.adjustedSize).toBeCloseTo(280, 0);
        });

        it("should veto high leverage with critical alpha", () => {
            const metrics: PowerLawMetrics = {
                symbol: "BTCUSDT",
                tailExponent: 1.5, // < 2.0
                tailConfidence: 0.95,
                exceedanceProbability: 0.05,
                volatilityCluster: {
                    state: "stable",
                    sigma: 0.02,
                    persistence: 0.5,
                },
                timestamp: Date.now(),
            };
            riskGuardian.updatePowerLawMetrics(metrics);

            const signal: IntentSignal = {
                signalId: "s6",
                phaseId: "phase1",
                symbol: "BTCUSDT",
                side: "BUY",
                requestedSize: 60000,
                entryPrice: 50000,
                confidence: 70,
                type: "MANUAL",
                leverage: 6, // > 5
                volatility: 500,
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);
            expect(decision.approved).toBe(false);
            expect(decision.reason).toContain("TAIL_RISK_VETO");
        });
    });
});
