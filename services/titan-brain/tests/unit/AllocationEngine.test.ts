/**
 * Unit Tests for AllocationEngine
 *
 * Tests boundary conditions, sigmoid smoothness, and leverage cap lookup.
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 3.4
 */

import { AllocationEngine } from "../../src/features/Allocation/AllocationEngine.js";
import { EquityTier } from "../../src/types/index.js";
import { defaultConfig } from "../../src/config/defaults.js";
import { RegimeState } from "@titan/shared";

describe("AllocationEngine", () => {
  let engine: AllocationEngine;

  beforeEach(() => {
    engine = new AllocationEngine(defaultConfig.allocationEngine);
  });

  describe("constructor", () => {
    it("should initialize with provided configuration", () => {
      const transitionPoints = engine.getTransitionPoints();
      const leverageCaps = engine.getLeverageCaps();

      expect(transitionPoints.startP2).toBe(1500);
      expect(transitionPoints.fullP2).toBe(5000);
      expect(transitionPoints.startP3).toBe(25000);
      expect(leverageCaps[EquityTier.MICRO]).toBe(20);
      expect(leverageCaps[EquityTier.INSTITUTIONAL]).toBe(2);
    });

    it("should accept custom configuration", () => {
      const customEngine = new AllocationEngine({
        transitionPoints: {
          startP2: 2000,
          fullP2: 10000,
          startP3: 50000,
        },
        leverageCaps: {
          [EquityTier.MICRO]: 25,
          [EquityTier.SMALL]: 15,
          [EquityTier.MEDIUM]: 8,
          [EquityTier.LARGE]: 4,
          [EquityTier.INSTITUTIONAL]: 2,
        },
      });

      const transitionPoints = customEngine.getTransitionPoints();
      expect(transitionPoints.startP2).toBe(2000);
      expect(transitionPoints.fullP2).toBe(10000);
    });
  });

  describe("getWeights", () => {
    describe("boundary conditions", () => {
      it("should return 100% Phase 1 at $0", () => {
        const weights = engine.getWeights(0);
        expect(weights.w1).toBe(1.0);
        expect(weights.w2).toBe(0.0);
        expect(weights.w3).toBe(0.0);
      });

      it("should return 100% Phase 1 at $1,499", () => {
        const weights = engine.getWeights(1499);
        expect(weights.w1).toBe(1.0);
        expect(weights.w2).toBe(0.0);
        expect(weights.w3).toBe(0.0);
      });

      it("should start transitioning at $1,500", () => {
        const weights = engine.getWeights(1500);
        // At the start of transition, Phase 1 should still be dominant
        expect(weights.w1).toBeGreaterThan(0.5);
        expect(weights.w2).toBeLessThan(0.5);
        expect(weights.w3).toBe(0.0);
      });

      it("should be at stable allocation at $5,000", () => {
        const weights = engine.getWeights(5000);
        // At full P2, should be approximately 20% P1, 80% P2
        expect(weights.w1).toBeCloseTo(0.2, 1);
        expect(weights.w2).toBeCloseTo(0.8, 1);
        expect(weights.w3).toBe(0.0);
      });

      it("should maintain stable allocation at $10,000", () => {
        const weights = engine.getWeights(10000);
        expect(weights.w1).toBeCloseTo(0.2, 1);
        expect(weights.w2).toBeCloseTo(0.8, 1);
        expect(weights.w3).toBe(0.0);
      });

      it("should start Phase 3 transition at $25,000", () => {
        const weights = engine.getWeights(25000);
        // At the start of P3 transition
        expect(weights.w1).toBeCloseTo(0.2, 1);
        expect(weights.w2).toBeLessThanOrEqual(0.8);
        expect(weights.w3).toBeGreaterThanOrEqual(0);
      });

      it("should have significant Phase 3 allocation at $50,000", () => {
        const weights = engine.getWeights(50000);
        expect(weights.w1).toBeCloseTo(0.2, 1);
        expect(weights.w3).toBeGreaterThan(0.1);
        // Sum should still be 1.0
        expect(weights.w1 + weights.w2 + weights.w3).toBeCloseTo(1.0, 10);
      });
    });

    describe("sigmoid smoothness", () => {
      it("should have smooth transition in Phase 1 → Phase 2 zone", () => {
        const equityLevels = [1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000];
        const weights = equityLevels.map((e) => engine.getWeights(e));

        // Phase 1 weight should monotonically decrease
        for (let i = 1; i < weights.length; i++) {
          expect(weights[i].w1).toBeLessThanOrEqual(weights[i - 1].w1);
        }

        // Phase 2 weight should monotonically increase
        for (let i = 1; i < weights.length; i++) {
          expect(weights[i].w2).toBeGreaterThanOrEqual(weights[i - 1].w2);
        }
      });

      it("should have no sudden jumps in allocation", () => {
        const step = 100;
        let prevWeights = engine.getWeights(1500);

        for (let equity = 1600; equity <= 5000; equity += step) {
          const weights = engine.getWeights(equity);

          // No weight should change by more than 20% per $100 step
          expect(Math.abs(weights.w1 - prevWeights.w1)).toBeLessThan(0.2);
          expect(Math.abs(weights.w2 - prevWeights.w2)).toBeLessThan(0.2);

          prevWeights = weights;
        }
      });

      it("should have smooth transition in Phase 2 → Phase 3 zone", () => {
        const equityLevels = [25000, 30000, 35000, 40000, 45000, 50000];
        const weights = equityLevels.map((e) => engine.getWeights(e));

        // Phase 3 weight should monotonically increase
        for (let i = 1; i < weights.length; i++) {
          expect(weights[i].w3).toBeGreaterThanOrEqual(weights[i - 1].w3);
        }

        // Phase 2 weight should monotonically decrease (as P3 takes over)
        for (let i = 1; i < weights.length; i++) {
          expect(weights[i].w2).toBeLessThanOrEqual(weights[i - 1].w2);
        }
      });
    });

    describe("weight sum invariant", () => {
      it("should always sum to 1.0", () => {
        const testEquities = [
          0,
          100,
          500,
          1000,
          1500,
          2500,
          5000,
          10000,
          25000,
          50000,
          100000,
        ];

        for (const equity of testEquities) {
          const weights = engine.getWeights(equity);
          const sum = weights.w1 + weights.w2 + weights.w3;
          expect(sum).toBeCloseTo(1.0, 10);
        }
      });
    });

    describe("edge cases", () => {
      it("should handle negative equity as $0", () => {
        const weights = engine.getWeights(-1000);
        expect(weights.w1).toBe(1.0);
        expect(weights.w2).toBe(0.0);
        expect(weights.w3).toBe(0.0);
      });

      it("should handle very large equity", () => {
        const weights = engine.getWeights(10000000);
        expect(weights.w1 + weights.w2 + weights.w3).toBeCloseTo(1.0, 10);
        expect(weights.w3).toBeGreaterThan(0);
      });

      it("should include timestamp in result", () => {
        const before = Date.now();
        const weights = engine.getWeights(5000);
        const after = Date.now();

        expect(weights.timestamp).toBeGreaterThanOrEqual(before);
        expect(weights.timestamp).toBeLessThanOrEqual(after);
      });
    });
  });

  describe("getEquityTier", () => {
    describe("tier boundaries", () => {
      it("should return MICRO for equity < $1,500", () => {
        expect(engine.getEquityTier(0)).toBe(EquityTier.MICRO);
        expect(engine.getEquityTier(500)).toBe(EquityTier.MICRO);
        expect(engine.getEquityTier(1499.99)).toBe(EquityTier.MICRO);
      });

      it("should return SMALL for equity $1,500 - $4,999.99", () => {
        expect(engine.getEquityTier(1500)).toBe(EquityTier.SMALL);
        expect(engine.getEquityTier(3000)).toBe(EquityTier.SMALL);
        expect(engine.getEquityTier(4999.99)).toBe(EquityTier.SMALL);
      });

      it("should return MEDIUM for equity $5,000 - $24,999.99", () => {
        expect(engine.getEquityTier(5000)).toBe(EquityTier.MEDIUM);
        expect(engine.getEquityTier(15000)).toBe(EquityTier.MEDIUM);
        expect(engine.getEquityTier(24999.99)).toBe(EquityTier.MEDIUM);
      });

      it("should return LARGE for equity $25,000 - $49,999.99", () => {
        expect(engine.getEquityTier(25000)).toBe(EquityTier.LARGE);
        expect(engine.getEquityTier(35000)).toBe(EquityTier.LARGE);
        expect(engine.getEquityTier(49999.99)).toBe(EquityTier.LARGE);
      });

      it("should return INSTITUTIONAL for equity >= $50,000", () => {
        expect(engine.getEquityTier(50000)).toBe(EquityTier.INSTITUTIONAL);
        expect(engine.getEquityTier(100000)).toBe(EquityTier.INSTITUTIONAL);
        expect(engine.getEquityTier(1000000)).toBe(EquityTier.INSTITUTIONAL);
      });
    });

    describe("edge cases", () => {
      it("should handle negative equity as MICRO", () => {
        expect(engine.getEquityTier(-100)).toBe(EquityTier.MICRO);
        expect(engine.getEquityTier(-1000000)).toBe(EquityTier.MICRO);
      });

      it("should handle exact boundary values", () => {
        // Exact boundaries should be in the higher tier
        expect(engine.getEquityTier(1500)).toBe(EquityTier.SMALL);
        expect(engine.getEquityTier(5000)).toBe(EquityTier.MEDIUM);
        expect(engine.getEquityTier(25000)).toBe(EquityTier.LARGE);
        expect(engine.getEquityTier(50000)).toBe(EquityTier.INSTITUTIONAL);
      });
    });
  });

  describe("getMaxLeverage", () => {
    describe("leverage cap lookup", () => {
      it("should return 20x for MICRO tier", () => {
        expect(engine.getMaxLeverage(0)).toBe(20);
        expect(engine.getMaxLeverage(500)).toBe(20);
        expect(engine.getMaxLeverage(1499)).toBe(20);
      });

      it("should return 10x for SMALL tier", () => {
        expect(engine.getMaxLeverage(1500)).toBe(10);
        expect(engine.getMaxLeverage(3000)).toBe(10);
        expect(engine.getMaxLeverage(4999)).toBe(10);
      });

      it("should return 5x for MEDIUM tier", () => {
        expect(engine.getMaxLeverage(5000)).toBe(5);
        expect(engine.getMaxLeverage(15000)).toBe(5);
        expect(engine.getMaxLeverage(24999)).toBe(5);
      });

      it("should return 3x for LARGE tier", () => {
        expect(engine.getMaxLeverage(25000)).toBe(3);
        expect(engine.getMaxLeverage(35000)).toBe(3);
        expect(engine.getMaxLeverage(49999)).toBe(3);
      });

      it("should return 2x for INSTITUTIONAL tier", () => {
        expect(engine.getMaxLeverage(50000)).toBe(2);
        expect(engine.getMaxLeverage(100000)).toBe(2);
        expect(engine.getMaxLeverage(1000000)).toBe(2);
      });
    });

    describe("leverage decreases with equity", () => {
      it("should have decreasing leverage as equity increases", () => {
        const leverages = [
          engine.getMaxLeverage(500), // MICRO
          engine.getMaxLeverage(2500), // SMALL
          engine.getMaxLeverage(10000), // MEDIUM
          engine.getMaxLeverage(35000), // LARGE
          engine.getMaxLeverage(75000), // INSTITUTIONAL
        ];

        for (let i = 1; i < leverages.length; i++) {
          expect(leverages[i]).toBeLessThanOrEqual(leverages[i - 1]);
        }
      });
    });
  });

  describe("getTransitionPoints", () => {
    it("should return a copy of transition points", () => {
      const points1 = engine.getTransitionPoints();
      const points2 = engine.getTransitionPoints();

      expect(points1).toEqual(points2);
      expect(points1).not.toBe(points2); // Should be different objects
    });
  });

  describe("getLeverageCaps", () => {
    it("should return a copy of leverage caps", () => {
      const caps1 = engine.getLeverageCaps();
      const caps2 = engine.getLeverageCaps();

      expect(caps1).toEqual(caps2);
      expect(caps1).not.toBe(caps2); // Should be different objects
    });
  });

  describe("Regime Awareness", () => {
    it("forces 100% Phase 1 (Scavenger) in CRASH regime", () => {
      const weights = engine.getRegimeAdjustedWeights(
        100000,
        RegimeState.CRASH,
      );
      expect(weights.w1).toBe(1.0);
      expect(weights.w2).toBe(0.0);
      expect(weights.w3).toBe(0.0);
    });

    it("boosts Phase 2 in VOLATILE_BREAKOUT regime when active", () => {
      const equity = 15000;
      const baseWeights = engine.getWeights(equity);
      const adjusted = engine.getRegimeAdjustedWeights(
        equity,
        RegimeState.VOLATILE_BREAKOUT,
      );

      // P2 active at 15000, should be boosted
      expect(adjusted.w2).toBeGreaterThan(baseWeights.w2);
      expect(adjusted.w1 + adjusted.w2 + adjusted.w3).toBeCloseTo(1.0);
    });

    it("boosts Phase 3 in MEAN_REVERSION regime when active", () => {
      const equity = 50000;
      const baseWeights = engine.getWeights(equity);
      const adjusted = engine.getRegimeAdjustedWeights(
        equity,
        RegimeState.MEAN_REVERSION,
      );

      // P3 active at 50000, should be boosted
      expect(adjusted.w3).toBeGreaterThan(baseWeights.w3);
      expect(adjusted.w1 + adjusted.w2 + adjusted.w3).toBeCloseTo(1.0);
    });

    it("returns standard weights in STABLE regime", () => {
      const equity = 50000;
      const baseWeights = engine.getWeights(equity);
      const adjusted = engine.getRegimeAdjustedWeights(
        equity,
        RegimeState.STABLE,
      );
      expect(adjusted).toEqual(baseWeights);
    });
  });
});
