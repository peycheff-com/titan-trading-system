/**
 * Property-Based Tests for RiskGuardian
 *
 * Tests universal properties that should hold across all inputs
 */

import * as fc from "fast-check";
import { RiskGuardian } from "../../src/engine/RiskGuardian";
import { AllocationEngine } from "../../src/engine/AllocationEngine";
import {
  AllocationEngineConfig,
  EquityTier,
  IntentSignal,
  PhaseId,
  Position,
  RiskGuardianConfig,
} from "../../src/types/index";

// Test configurations
const allocationConfig: AllocationEngineConfig = {
  transitionPoints: {
    startP2: 1500,
    fullP2: 5000,
    startP3: 25000,
  },
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
  correlationUpdateInterval: 300000, // 5 minutes
  betaUpdateInterval: 300000, // 5 minutes
  minStopDistanceMultiplier: 2.0, // Added missing prop
};

import {
  DefconLevel,
  GovernanceEngine,
} from "../../src/engine/GovernanceEngine";

describe("RiskGuardian Property Tests", () => {
  let allocationEngine: AllocationEngine;
  let riskGuardian: RiskGuardian;
  let governanceEngine: GovernanceEngine;

  beforeEach(() => {
    allocationEngine = new AllocationEngine(allocationConfig);

    // Mock GovernanceEngine
    governanceEngine = {
      getDefconLevel: jest.fn().mockReturnValue(DefconLevel.NORMAL),
      getLeverageMultiplier: jest.fn().mockReturnValue(1.0),
      canOpenNewPosition: jest.fn().mockReturnValue(true),
    } as unknown as GovernanceEngine;

    riskGuardian = new RiskGuardian(
      riskConfig,
      allocationEngine,
      governanceEngine,
    );
  });

  describe("Property 2: Leverage Cap Enforcement", () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * For any equity level and any signal, the system should never approve
     * a signal that would result in leverage exceeding the equity-tier maximum:
     * - $200 equity = 20x max leverage
     * - $5,000 equity = 5x max leverage
     * - $50,000 equity = 2x max leverage
     */
    it("should never approve signals that exceed leverage caps", () => {
      fc.assert(
        fc.property(
          // Generate random equity values across all tiers
          fc.float({
            min: Math.fround(200),
            max: Math.fround(100000),
            noNaN: true,
          }),
          // Generate random signal size
          fc.float({
            min: Math.fround(100),
            max: Math.fround(50000),
            noNaN: true,
          }),
          // Generate random existing positions
          fc.array(
            fc.record({
              symbol: fc.constantFrom(
                "BTCUSDT",
                "ETHUSDT",
                "ADAUSDT",
                "SOLUSDT",
              ),
              side: fc.constantFrom("LONG", "SHORT"),
              size: fc.float({
                min: Math.fround(100),
                max: Math.fround(10000),
                noNaN: true,
              }),
            }),
            { maxLength: 5 },
          ),
          (equity, signalSize, existingPositions) => {
            // Set up the test scenario
            riskGuardian.setEquity(equity);

            const signal: IntentSignal = {
              signalId: "test-signal",
              phaseId: "phase1" as PhaseId,
              symbol: "BTCUSDT",
              side: "BUY",
              requestedSize: signalSize,
              timestamp: Date.now(),
            };

            const positions: Position[] = existingPositions.map((
              pos,
              index,
            ) => ({
              symbol: pos.symbol,
              side: pos.side as "LONG" | "SHORT",
              size: pos.size,
              entryPrice: 50000,
              unrealizedPnL: 0,
              leverage: 1,
              phaseId: "phase1" as PhaseId,
            }));

            const decision = riskGuardian.checkSignal(signal, positions);

            // Property: If signal is approved, projected leverage must not exceed cap
            if (decision.approved) {
              const maxLeverage = allocationEngine.getMaxLeverage(equity);
              const projectedLeverage = decision.riskMetrics.projectedLeverage;

              expect(projectedLeverage).toBeLessThanOrEqual(
                maxLeverage + 0.001,
              ); // Small tolerance for floating point
            }

            // Property: If projected leverage exceeds cap, signal must be rejected
            const maxLeverage = allocationEngine.getMaxLeverage(equity);
            if (decision.riskMetrics.projectedLeverage > maxLeverage) {
              expect(decision.approved).toBe(false);
              expect(decision.reason).toContain("Leverage cap exceeded");
            }
          },
        ),
        { numRuns: 1000 },
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * For any equity level, the maximum leverage should follow the tier rules:
     * - Below $5,000: max 20x
     * - $5,000 to $50,000: max 5x
     * - Above $50,000: max 2x
     */
    it("should enforce correct leverage caps for each equity tier", () => {
      fc.assert(
        fc.property(
          fc.float({
            min: Math.fround(200),
            max: Math.fround(200000),
            noNaN: true,
          }),
          (equity) => {
            const maxLeverage = allocationEngine.getMaxLeverage(equity);

            // Property: Leverage caps should follow tier rules
            if (equity < 5000) {
              expect(maxLeverage).toBeLessThanOrEqual(20);
            } else if (equity < 50000) {
              expect(maxLeverage).toBeLessThanOrEqual(5);
            } else {
              expect(maxLeverage).toBeLessThanOrEqual(2);
            }

            // Property: Leverage should always be positive
            expect(maxLeverage).toBeGreaterThan(0);
          },
        ),
        { numRuns: 500 },
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * For any signal that would result in zero or negative projected leverage,
     * the system should handle it gracefully (not crash or give invalid results)
     */
    it("should handle edge cases with zero or minimal leverage gracefully", () => {
      fc.assert(
        fc.property(
          fc.float({
            min: Math.fround(200),
            max: Math.fround(10000),
            noNaN: true,
          }),
          fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
          (equity, signalSize) => {
            riskGuardian.setEquity(equity);

            const signal: IntentSignal = {
              signalId: "test-signal",
              phaseId: "phase1" as PhaseId,
              symbol: "BTCUSDT",
              side: "BUY",
              requestedSize: signalSize,
              timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);

            // Property: Decision should always be valid
            expect(decision).toBeDefined();
            expect(typeof decision.approved).toBe("boolean");
            expect(decision.riskMetrics).toBeDefined();
            expect(decision.riskMetrics.projectedLeverage)
              .toBeGreaterThanOrEqual(0);
            expect(isFinite(decision.riskMetrics.projectedLeverage)).toBe(true);
          },
        ),
        { numRuns: 500 },
      );
    });

    /**
     * **Validates: Requirements 3.5**
     *
     * Phase 3 hedge positions that reduce global delta should always be approved
     * regardless of leverage constraints
     */
    it("should always approve Phase 3 hedges that reduce delta regardless of leverage", () => {
      fc.assert(
        fc.property(
          fc.float({
            min: Math.fround(200),
            max: Math.fround(10000),
            noNaN: true,
          }),
          fc.float({
            min: Math.fround(1000),
            max: Math.fround(50000),
            noNaN: true,
          }),
          fc.constantFrom("LONG", "SHORT"),
          (equity, existingPositionSize, existingPositionSide) => {
            riskGuardian.setEquity(equity);

            // Create existing position that creates delta
            const existingPosition: Position = {
              symbol: "BTCUSDT",
              side: existingPositionSide as "LONG" | "SHORT",
              size: existingPositionSize,
              entryPrice: 50000,
              unrealizedPnL: 0,
              leverage: 1,
              phaseId: "phase1" as PhaseId,
            };

            // Create Phase 3 signal that reduces delta (opposite direction)
            const hedgeSignal: IntentSignal = {
              signalId: "hedge-signal",
              phaseId: "phase3" as PhaseId,
              symbol: "BTCUSDT",
              side: existingPositionSide === "LONG" ? "SELL" : "BUY",
              requestedSize: existingPositionSize * 0.5, // Partial hedge
              timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(hedgeSignal, [
              existingPosition,
            ]);

            // Property: Phase 3 hedges that reduce delta should always be approved
            expect(decision.approved).toBe(true);
            expect(decision.reason).toContain("Phase 3 hedge approved");
          },
        ),
        { numRuns: 500 },
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * The leverage calculation should be consistent and monotonic:
     * - Larger position sizes should result in higher leverage (given same equity)
     * - Higher equity should result in lower leverage (given same position size)
     */
    it("should have consistent and monotonic leverage calculations", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({
              min: Math.fround(200),
              max: Math.fround(10000),
              noNaN: true,
            }),
            fc.float({
              min: Math.fround(200),
              max: Math.fround(10000),
              noNaN: true,
            }),
          ).filter(([equity1, equity2]) => Math.abs(equity1 - equity2) > 100), // Ensure meaningful difference
          fc.float({
            min: Math.fround(1000),
            max: Math.fround(5000),
            noNaN: true,
          }),
          ([equity1, equity2], positionSize) => {
            const positions: Position[] = [{
              symbol: "BTCUSDT",
              side: "LONG",
              size: positionSize,
              entryPrice: 50000,
              unrealizedPnL: 0,
              leverage: 1,
              phaseId: "phase1" as PhaseId,
            }];

            // Calculate leverage for both equity levels
            riskGuardian.setEquity(equity1);
            const leverage1 = riskGuardian.calculateCombinedLeverage(positions);

            riskGuardian.setEquity(equity2);
            const leverage2 = riskGuardian.calculateCombinedLeverage(positions);

            // Property: Higher equity should result in lower leverage
            if (equity1 > equity2) {
              expect(leverage1).toBeLessThanOrEqual(leverage2 + 0.001); // Small tolerance
            } else {
              expect(leverage2).toBeLessThanOrEqual(leverage1 + 0.001);
            }

            // Property: Both leverages should be positive and finite
            expect(leverage1).toBeGreaterThanOrEqual(0);
            expect(leverage2).toBeGreaterThanOrEqual(0);
            expect(isFinite(leverage1)).toBe(true);
            expect(isFinite(leverage2)).toBe(true);
          },
        ),
        { numRuns: 500 },
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * When equity is zero or negative, leverage calculations should handle gracefully
     * and not approve any new positions
     */
    it("should handle zero or negative equity gracefully", () => {
      fc.assert(
        fc.property(
          fc.float({
            min: Math.fround(-1000),
            max: Math.fround(0),
            noNaN: true,
          }),
          fc.float({
            min: Math.fround(100),
            max: Math.fround(1000),
            noNaN: true,
          }),
          (equity, signalSize) => {
            riskGuardian.setEquity(equity);

            const signal: IntentSignal = {
              signalId: "test-signal",
              phaseId: "phase1" as PhaseId,
              symbol: "BTCUSDT",
              side: "BUY",
              requestedSize: signalSize,
              timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, []);

            // Property: Should not crash and should provide valid decision
            expect(decision).toBeDefined();
            expect(typeof decision.approved).toBe("boolean");

            // Property: Leverage should be 0 when equity is 0 or negative
            expect(decision.riskMetrics.projectedLeverage).toBe(0);
            expect(decision.riskMetrics.currentLeverage).toBe(0);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe("Portfolio Delta Calculation Properties", () => {
    /**
     * Property: Portfolio delta should be the sum of all position deltas
     */
    it("should calculate portfolio delta as sum of position deltas", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              symbol: fc.constantFrom("BTCUSDT", "ETHUSDT", "ADAUSDT"),
              side: fc.constantFrom("LONG", "SHORT"),
              size: fc.float({
                min: Math.fround(100),
                max: Math.fround(5000),
                noNaN: true,
              }),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          (positionData) => {
            const positions: Position[] = positionData.map((pos, index) => ({
              symbol: pos.symbol,
              side: pos.side as "LONG" | "SHORT",
              size: pos.size,
              entryPrice: 50000,
              unrealizedPnL: 0,
              leverage: 1,
              phaseId: "phase1" as PhaseId,
            }));

            const portfolioDelta = riskGuardian.calculatePortfolioDelta(
              positions,
            );

            // Calculate expected delta manually
            const expectedDelta = positions.reduce((delta, pos) => {
              const positionDelta = pos.side === "LONG" ? pos.size : -pos.size;
              return delta + positionDelta;
            }, 0);

            // Property: Portfolio delta should equal sum of position deltas
            expect(portfolioDelta).toBeCloseTo(expectedDelta, 2);
          },
        ),
        { numRuns: 500 },
      );
    });

    /**
     * Property: Empty portfolio should have zero delta
     */
    it("should return zero delta for empty portfolio", () => {
      const delta = riskGuardian.calculatePortfolioDelta([]);
      expect(delta).toBe(0);
    });
  });

  describe("Property 9: Correlation Veto Consistency", () => {
    /**
     * **Validates: Requirements 3.7**
     *
     * When correlation between a new signal and existing positions exceeds the threshold,
     * the system should consistently apply the same veto logic:
     * - If same direction as correlated position: reduce size by correlation penalty
     * - If opposite direction: allow full size (hedge effect)
     * - Correlation calculation should be symmetric and consistent
     */
    it("should consistently apply correlation veto logic", () => {
      fc.assert(
        fc.property(
          // Generate existing position
          fc.record({
            symbol: fc.constantFrom("BTCUSDT", "ETHUSDT", "ADAUSDT"),
            side: fc.constantFrom("LONG", "SHORT"),
            size: fc.float({
              min: Math.fround(1000),
              max: Math.fround(10000),
              noNaN: true,
            }),
          }),
          // Generate new signal
          fc.record({
            symbol: fc.constantFrom("BTCUSDT", "ETHUSDT", "ADAUSDT"),
            side: fc.constantFrom("BUY", "SELL"),
            size: fc.float({
              min: Math.fround(500),
              max: Math.fround(5000),
              noNaN: true,
            }),
          }),
          // Generate correlation value above threshold
          fc.float({
            min: Math.fround(0.85),
            max: Math.fround(1.0),
            noNaN: true,
          }),
          (existingPos, newSignal, correlation) => {
            // Set up high correlation with smaller moves to avoid CRASH regime
            riskGuardian.updatePriceHistory(
              existingPos.symbol,
              50000,
              Date.now() - 60000,
            );
            riskGuardian.updatePriceHistory(
              existingPos.symbol,
              50010,
              Date.now() - 30000,
            );
            riskGuardian.updatePriceHistory(
              existingPos.symbol,
              50020,
              Date.now(),
            );

            riskGuardian.updatePriceHistory(
              newSignal.symbol,
              50000,
              Date.now() - 60000,
            );
            riskGuardian.updatePriceHistory(
              newSignal.symbol,
              50010,
              Date.now() - 30000,
            );
            riskGuardian.updatePriceHistory(
              newSignal.symbol,
              50020,
              Date.now(),
            );

            const existingPosition: Position = {
              symbol: existingPos.symbol,
              side: existingPos.side as "LONG" | "SHORT",
              size: existingPos.size,
              entryPrice: 50000,
              unrealizedPnL: 0,
              leverage: 1,
              phaseId: "phase1" as PhaseId,
            };

            const signal: IntentSignal = {
              signalId: "correlation-test",
              phaseId: "phase1" as PhaseId,
              symbol: newSignal.symbol,
              side: newSignal.side as "BUY" | "SELL",
              requestedSize: newSignal.size,
              timestamp: Date.now(),
            };

            riskGuardian.setEquity(100000); // High equity to avoid leverage issues

            const decision = riskGuardian.checkSignal(signal, [
              existingPosition,
            ]);

            // Property: Decision should always be valid
            expect(decision).toBeDefined();
            expect(typeof decision.approved).toBe("boolean");
            expect(decision.riskMetrics).toBeDefined();

            // If symbols are different, check correlation veto logic
            if (existingPos.symbol !== newSignal.symbol) {
              const calculatedCorrelation = riskGuardian.calculateCorrelation(
                existingPos.symbol,
                newSignal.symbol,
              );

              // Property: Correlation should be symmetric
              const reverseCorrelation = riskGuardian.calculateCorrelation(
                newSignal.symbol,
                existingPos.symbol,
              );
              expect(Math.abs(calculatedCorrelation - reverseCorrelation))
                .toBeLessThan(0.001);

              // If correlation is high, check veto logic
              if (Math.abs(calculatedCorrelation) > 0.8) {
                const existingSide = existingPos.side === "LONG"
                  ? "BUY"
                  : "SELL";
                const isSameDirection = newSignal.side === existingSide;

                if (isSameDirection) {
                  // Property: Same direction with high correlation should reduce size
                  if (decision.approved && decision.adjustedSize) {
                    expect(decision.adjustedSize).toBeLessThan(newSignal.size);
                    expect(decision.reason).toContain("correlation");
                  }
                }
              }
            } else {
              // Same symbol always has correlation = 1.0
              expect(decision.riskMetrics.correlation).toBeCloseTo(1.0, 2);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements 3.7**
     *
     * Correlation calculation should be deterministic and consistent:
     * - Same inputs should always produce same correlation
     * - Correlation should be bounded between -1 and 1
     * - Correlation with self should be 1.0
     */
    it("should have deterministic and bounded correlation calculations", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("BTCUSDT", "ETHUSDT", "ADAUSDT", "SOLUSDT"),
          fc.constantFrom("BTCUSDT", "ETHUSDT", "ADAUSDT", "SOLUSDT"),
          (symbolA, symbolB) => {
            // Add some price history
            const baseTime = Date.now() - 300000; // 5 minutes ago
            for (let i = 0; i < 10; i++) {
              const time = baseTime + i * 30000; // 30 second intervals
              const priceA = 50000 + Math.sin(i * 0.5) * 1000;
              const priceB = 3000 + Math.sin(i * 0.5 + 0.2) * 200;

              riskGuardian.updatePriceHistory(symbolA, priceA, time);
              riskGuardian.updatePriceHistory(symbolB, priceB, time);
            }

            const correlation1 = riskGuardian.calculateCorrelation(
              symbolA,
              symbolB,
            );
            const correlation2 = riskGuardian.calculateCorrelation(
              symbolA,
              symbolB,
            );

            // Property: Deterministic - same inputs produce same output
            expect(correlation1).toBe(correlation2);

            // Property: Bounded - correlation should be between -1 and 1
            expect(correlation1).toBeGreaterThanOrEqual(-1);
            expect(correlation1).toBeLessThanOrEqual(1);
            expect(isFinite(correlation1)).toBe(true);

            // Property: Self-correlation should be 1.0
            if (symbolA === symbolB) {
              expect(Math.abs(correlation1 - 1.0)).toBeLessThan(0.001);
            }

            // Property: Symmetry - correlation(A,B) = correlation(B,A)
            const reverseCorrelation = riskGuardian.calculateCorrelation(
              symbolB,
              symbolA,
            );
            expect(Math.abs(correlation1 - reverseCorrelation)).toBeLessThan(
              0.001,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 3.7**
     *
     * High correlation warnings should be triggered consistently:
     * - When correlation exceeds threshold, warning should be sent
     * - Warning should include correct correlation value and affected positions
     * - Multiple calls with same data should not spam warnings
     */
    it("should trigger high correlation warnings consistently", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              symbol: fc.constantFrom("BTCUSDT", "ETHUSDT", "ADAUSDT"),
              side: fc.constantFrom("LONG", "SHORT"),
              size: fc.float({
                min: Math.fround(1000),
                max: Math.fround(5000),
                noNaN: true,
              }),
            }),
            { minLength: 2, maxLength: 4 },
          ),
          (positionData) => {
            // Create positions with high correlation (same price movements)
            const positions: Position[] = positionData.map((pos, index) => {
              // Update price history to create high correlation
              const baseTime = Date.now() - 180000; // 3 minutes ago
              for (let i = 0; i < 6; i++) {
                const time = baseTime + i * 30000;
                const price = 50000 + i * 1000; // Same price pattern for all
                riskGuardian.updatePriceHistory(pos.symbol, price, time);
              }

              return {
                symbol: pos.symbol,
                side: pos.side as "LONG" | "SHORT",
                size: pos.size,
                entryPrice: 50000,
                unrealizedPnL: 0,
                leverage: 1,
                phaseId: "phase1" as PhaseId,
              };
            });

            // Mock correlation notifier to track warnings
            let warningCount = 0;
            let lastWarningCorrelation = 0;
            let lastAffectedPositions: string[] = [];

            const mockNotifier = {
              sendHighCorrelationWarning: async (
                correlationScore: number,
                threshold: number,
                affectedPositions: string[],
              ) => {
                warningCount++;
                lastWarningCorrelation = correlationScore;
                lastAffectedPositions = [...affectedPositions];
              },
            };

            riskGuardian.setCorrelationNotifier(mockNotifier);
            riskGuardian.setEquity(50000);

            // Create signal that should trigger correlation warning
            const signal: IntentSignal = {
              signalId: "warning-test",
              phaseId: "phase1" as PhaseId,
              symbol: positions[0].symbol, // Same symbol as first position
              side: (positions[0].side === "LONG" ? "BUY" : "SELL") as
                | "BUY"
                | "SELL", // Same direction
              requestedSize: 2000,
              timestamp: Date.now(),
            };

            const decision = riskGuardian.checkSignal(signal, positions);

            // Property: Decision should be valid
            expect(decision).toBeDefined();
            expect(typeof decision.approved).toBe("boolean");

            // Property: High correlation should be detected
            expect(decision.riskMetrics.correlation).toBeGreaterThanOrEqual(0);
            expect(decision.riskMetrics.correlation).toBeLessThanOrEqual(1);

            // Property: If correlation is high and warning was sent, it should be valid
            if (warningCount > 0) {
              expect(lastWarningCorrelation).toBeGreaterThan(0.8);
              expect(lastAffectedPositions.length).toBeGreaterThan(0);
              expect(lastAffectedPositions).toContain(signal.symbol);
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe("Combined Leverage Calculation Properties", () => {
    /**
     * Property: Combined leverage should be total notional divided by equity
     */
    it("should calculate combined leverage correctly", () => {
      fc.assert(
        fc.property(
          fc.float({
            min: Math.fround(1000),
            max: Math.fround(50000),
            noNaN: true,
          }),
          fc.array(
            fc.record({
              size: fc.float({
                min: Math.fround(100),
                max: Math.fround(5000),
                noNaN: true,
              }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          (equity, positionData) => {
            riskGuardian.setEquity(equity);

            const positions: Position[] = positionData.map((pos, index) => ({
              symbol: "BTCUSDT",
              side: "LONG",
              size: pos.size,
              entryPrice: 50000,
              unrealizedPnL: 0,
              leverage: 1,
              phaseId: "phase1" as PhaseId,
            }));

            const leverage = riskGuardian.calculateCombinedLeverage(positions);

            // Calculate expected leverage manually
            const totalNotional = positions.reduce(
              (sum, pos) => sum + pos.size,
              0,
            );
            const expectedLeverage = totalNotional / equity;

            // Property: Leverage should equal total notional / equity
            expect(leverage).toBeCloseTo(expectedLeverage, 6);
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
