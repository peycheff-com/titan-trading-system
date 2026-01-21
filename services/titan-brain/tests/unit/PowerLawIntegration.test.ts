/**
 * Unit Tests for PowerLaw Integration
 *
 * Covers:
 * 1. PowerLawRepository persistence logic
 * 2. RiskGuardian PowerLaw metrics integration and gating rules
 */

import { RiskGuardian } from "../../src/engine/RiskGuardian";
import { AllocationEngine } from "../../src/engine/AllocationEngine";
import { PowerLawRepository } from "../../src/db/repositories/PowerLawRepository";
import { DatabaseManager } from "../../src/db/DatabaseManager";
import {
    AllocationEngineConfig,
    EquityTier,
    IntentSignal,
    PhaseId,
    Position,
    PowerLawMetrics,
    RiskGuardianConfig,
} from "../../src/types/index";
import {
    DefconLevel,
    GovernanceEngine,
} from "../../src/engine/GovernanceEngine";

// ============ Mocks ============

// Mock DatabaseManager
const mockDatabaseManager = {
    query: jest.fn(),
    queryOne: jest.fn(),
    queryAll: jest.fn(),
} as unknown as DatabaseManager;

// Mock TailRiskCalculator
jest.mock("../../src/engine/TailRiskCalculator", () => {
    return {
        TailRiskCalculator: jest.fn().mockImplementation(() => ({
            // We will override this implementation in individual tests if needed
            calculateAPTR: jest.fn().mockImplementation((positions, alphas) => {
                // Simple mock APTR calculation using passed alphas
                if (positions.length > 0 && alphas.size > 0) {
                    // If any positions, we return the max alpha across them for testing
                    return 2.0;
                }
                return 0.5;
            }),
            isRiskCritical: jest.fn().mockReturnValue(false),
        })),
    };
});

// Mock ChangePointDetector
jest.mock("../../src/engine/ChangePointDetector", () => {
    return {
        ChangePointDetector: jest.fn().mockImplementation(() => ({
            update: jest.fn().mockReturnValue({ regime: "STABLE", score: 0 }),
            detectChange: jest.fn().mockReturnValue({
                regime: "STABLE",
                score: 0,
            }),
            getRegime: jest.fn().mockReturnValue("STABLE"),
        })),
    };
});

// Mock configs
const allocationConfig: AllocationEngineConfig = {
    transitionPoints: { startP2: 1500, fullP2: 5000, startP3: 25000 },
    leverageCaps: {
        [EquityTier.MICRO]: 20,
        [EquityTier.SMALL]: 20,
        [EquityTier.MEDIUM]: 5,
        [EquityTier.LARGE]: 5,
        [EquityTier.INSTITUTIONAL]: 2,
    },
};

const riskConfig: RiskGuardianConfig = {
    maxCorrelation: 0.8,
    correlationPenalty: 0.5,
    correlationUpdateInterval: 300000,
    betaUpdateInterval: 300000,
    minStopDistanceMultiplier: 2.0,
    minConfidenceScore: 0,
    confidence: {
        decayRate: 0.1,
        recoveryRate: 0.05,
        threshold: 0.2,
    },
    fractal: {
        phase1: { maxLeverage: 1000, maxDrawdown: 1, maxAllocation: 1000 },
        phase2: { maxLeverage: 1000, maxDrawdown: 1, maxAllocation: 1000 },
        phase3: { maxLeverage: 1000, maxDrawdown: 1, maxAllocation: 1000 },
        manual: { maxLeverage: 1000, maxDrawdown: 1, maxAllocation: 1000 },
    },
};

describe("PowerLaw Integration", () => {
    // ============ PowerLawRepository Tests ============
    describe("PowerLawRepository", () => {
        let repository: PowerLawRepository;

        beforeEach(() => {
            jest.clearAllMocks();
            repository = new PowerLawRepository(mockDatabaseManager);
        });

        it("should save PowerLaw metrics correctly", async () => {
            const metrics: PowerLawMetrics = {
                symbol: "BTCUSDT",
                tailExponent: 2.5,
                tailConfidence: 0.95,
                exceedanceProbability: 0.1,
                volatilityCluster: {
                    state: "stable",
                    persistence: 0.8,
                    sigma: 0.02,
                },
                timestamp: 1234567890,
            };

            (mockDatabaseManager.queryOne as jest.Mock).mockResolvedValue({
                id: 1,
            });

            await repository.save(metrics);

            expect(mockDatabaseManager.queryOne).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO powerlaw_metrics"),
                [
                    metrics.symbol,
                    metrics.tailExponent,
                    metrics.tailConfidence,
                    metrics.exceedanceProbability,
                    metrics.volatilityCluster.state,
                    metrics.volatilityCluster.persistence,
                    metrics.timestamp,
                ],
            );
        });

        it("should retrieve latest metrics for a symbol", async () => {
            const mockRow = {
                symbol: "BTCUSDT",
                tail_exponent: "2.5",
                tail_confidence: "0.95",
                exceedance_probability: "0.1",
                vol_state: "expanding",
                vol_persistence: "0.8",
                timestamp: "1234567890",
            };

            (mockDatabaseManager.queryOne as jest.Mock).mockResolvedValue(
                mockRow,
            );

            const metrics = await repository.getLatestForSymbol("BTCUSDT");

            expect(mockDatabaseManager.queryOne).toHaveBeenCalledWith(
                expect.stringContaining("SELECT * FROM powerlaw_metrics"),
                ["BTCUSDT"],
            );

            expect(metrics).toBeDefined();
            expect(metrics?.symbol).toBe("BTCUSDT");
            expect(metrics?.tailExponent).toBe(2.5);
            expect(metrics?.volatilityCluster.state).toBe("expanding");
            expect(metrics?.volatilityCluster.sigma).toBe(0);
        });
    });

    // ============ RiskGuardian PowerLaw Gates Tests ============
    describe("RiskGuardian PowerLaw Gates", () => {
        let allocationEngine: AllocationEngine;
        let riskGuardian: RiskGuardian;
        let governanceEngine: GovernanceEngine;

        beforeEach(() => {
            jest.clearAllMocks();
            allocationEngine = new AllocationEngine(allocationConfig);

            governanceEngine = {
                getDefconLevel: jest.fn().mockReturnValue(DefconLevel.NORMAL),
                getLeverageMultiplier: jest.fn().mockReturnValue(1.0),
                canOpenNewPosition: jest.fn().mockReturnValue(true),
                setOverride: jest.fn(),
            } as unknown as GovernanceEngine;

            riskGuardian = new RiskGuardian(
                riskConfig,
                allocationEngine,
                governanceEngine,
            );

            // Set baseline equity
            riskGuardian.setEquity(10000);
        });

        it("should veto signals when tail exponent is critical (< 2.0) and leverage is high", () => {
            // Setup critical PowerLaw metrics
            const metrics: PowerLawMetrics = {
                symbol: "BTCUSDT",
                tailExponent: 1.5, // Critical < 2.0
                tailConfidence: 0.9,
                exceedanceProbability: 0.05,
                volatilityCluster: {
                    state: "stable",
                    persistence: 0.5,
                    sigma: 0.02,
                },
                timestamp: Date.now(),
            };
            riskGuardian.updatePowerLawMetrics(metrics);

            const signal: IntentSignal = {
                signalId: "high-lev-test",
                phaseId: "phase1",
                symbol: "BTCUSDT",
                side: "BUY",
                requestedSize: 60000, // 6x leverage (> 5x threshold)
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);

            expect(decision.approved).toBe(false);
            // Corrected expected string
            expect(decision.reason).toContain(
                "TAIL_RISK_VETO: Extreme tail risk",
            );
        });

        it("should allow signals when tail exponent is critical (< 2.0) but leverage is low", () => {
            // Setup critical PowerLaw metrics
            const metrics: PowerLawMetrics = {
                symbol: "BTCUSDT",
                tailExponent: 1.5, // Critical < 2.0
                tailConfidence: 0.9,
                exceedanceProbability: 0.05,
                volatilityCluster: {
                    state: "stable",
                    persistence: 0.5,
                    sigma: 0.02,
                },
                timestamp: Date.now(),
            };
            riskGuardian.updatePowerLawMetrics(metrics);

            const signal: IntentSignal = {
                signalId: "low-lev-test",
                phaseId: "phase1",
                symbol: "BTCUSDT",
                side: "BUY",
                requestedSize: 40000, // 4x leverage (< 5x threshold)
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);

            expect(decision.approved).toBe(true);
        });

        it("should veto Phase 1 signals during expanding volatility", () => {
            // Setup expanding volatility
            const metrics: PowerLawMetrics = {
                symbol: "ETHUSDT",
                tailExponent: 2.5, // Healthy alpha
                tailConfidence: 0.9,
                exceedanceProbability: 0.05,
                volatilityCluster: {
                    state: "expanding",
                    persistence: 0.8,
                    sigma: 0.05,
                },
                timestamp: Date.now(),
            };
            riskGuardian.updatePowerLawMetrics(metrics);

            const signal: IntentSignal = {
                signalId: "vol-gate-test",
                phaseId: "phase1", // Phase 1 should be gated
                symbol: "ETHUSDT",
                side: "BUY",
                requestedSize: 10000, // 1x leverage
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);

            expect(decision.approved).toBe(false);
            // Corrected expected string
            expect(decision.reason).toContain(
                "REGIME_VETO: Expanding volatility",
            );
        });

        it("should allow Phase 2 signals during expanding volatility (survival mode not triggered)", () => {
            // Setup expanding volatility
            const metrics: PowerLawMetrics = {
                symbol: "ETHUSDT",
                tailExponent: 2.5,
                tailConfidence: 0.9,
                exceedanceProbability: 0.05,
                volatilityCluster: {
                    state: "expanding",
                    persistence: 0.8,
                    sigma: 0.05,
                },
                timestamp: Date.now(),
            };
            riskGuardian.updatePowerLawMetrics(metrics);

            const signal: IntentSignal = {
                signalId: "phase2-vol-test",
                phaseId: "phase2", // Phase 2 allowed
                symbol: "ETHUSDT",
                side: "BUY",
                requestedSize: 10000,
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);
            expect(decision.approved).toBe(true);
        });

        it("should reduce effective size for Phase 1 based on dynamic leverage scaling", () => {
            // Set equity to 1000 (Micro Tier) to ensure base leverage cap is 20x
            riskGuardian.setEquity(1000);

            // Setup alpha that is safe enough to avoid hard veto (>2.0) but triggers scaling
            const alpha = 2.2;
            const metrics: PowerLawMetrics = {
                symbol: "SOLUSDT",
                tailExponent: alpha,
                tailConfidence: 0.9,
                exceedanceProbability: 0.05,
                volatilityCluster: {
                    state: "stable",
                    persistence: 0.5,
                    sigma: 0.05,
                },
                timestamp: Date.now(),
            };
            riskGuardian.updatePowerLawMetrics(metrics);

            // Base leverage for P1 is usually 20x.
            // Dynamic Max Leverage = 20 / 2.2 = 9.09x

            // Request 15x leverage (should be reduced)
            const requestedLeverage = 15;
            const requestedSize = 1000 * requestedLeverage; // 15,000

            const signal: IntentSignal = {
                signalId: "dynamic-scaling-test",
                phaseId: "phase1",
                symbol: "SOLUSDT",
                side: "BUY",
                requestedSize: requestedSize,
                timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);

            if (!decision.approved) {
                console.error(
                    "Dynamic scaling test rejected with reason:",
                    decision.reason,
                );
            }

            expect(decision.approved).toBe(true);
            expect(decision.adjustedSize).toBeDefined();
            // Since requested leverage (15) > max leverage (9.09), size should be reduced
            // Adjusted size should correspond to ~9.09x leverage on 1k equity = 9,090.9
            expect(decision.adjustedSize).toBeLessThan(requestedSize);
            expect(decision.adjustedSize).toBeCloseTo(9091, -2);
            expect(decision.reason).toContain("Risk/Latency");
            // "Signal approved with size adjustment: Risk/Latency"
        });
    });
});
