/**
 * Property-Based Tests for AllocationEngine
 *
 * Tests correctness properties using fast-check:
 * - Property 1: Allocation Vector Sum Invariant (Req 1.6)
 * - Property 12: Equity Tier Consistency (Req 1.2, 1.3, 1.4, 1.5)
 */

import * as fc from "fast-check";
import { AllocationEngine } from "../../src/features/Allocation/AllocationEngine";
import { EquityTier } from "../../src/types/index.js";
import { defaultConfig } from "../../src/config/defaults.js";

describe("AllocationEngine Property Tests", () => {
  let engine: AllocationEngine;

  beforeEach(() => {
    engine = new AllocationEngine(defaultConfig.allocationEngine);
  });

  /**
   * Property 1: Allocation Vector Sum Invariant
   *
   * For any equity level, the sum of all phase weights in the allocation
   * vector should always equal 1.0 (100% capital allocation).
   *
   * Validates: Requirements 1.6
   */
  describe("Property 1: Allocation Vector Sum Invariant", () => {
    it("should always sum to 1.0 for any positive equity", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000000, noNaN: true }),
          (equity) => {
            const weights = engine.getWeights(equity);
            const sum = weights.w1 + weights.w2 + weights.w3;

            // Allow for floating point precision (within 1e-10)
            return Math.abs(sum - 1.0) < 1e-10;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it("should always sum to 1.0 for edge case equity values", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(0),
            fc.constant(1),
            fc.constant(1499),
            fc.constant(1500),
            fc.constant(1501),
            fc.constant(4999),
            fc.constant(5000),
            fc.constant(5001),
            fc.constant(24999),
            fc.constant(25000),
            fc.constant(25001),
            fc.constant(49999),
            fc.constant(50000),
            fc.constant(50001),
            fc.constant(100000),
            fc.constant(1000000),
          ),
          (equity) => {
            const weights = engine.getWeights(equity);
            const sum = weights.w1 + weights.w2 + weights.w3;

            return Math.abs(sum - 1.0) < 1e-10;
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should have all weights between 0 and 1", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000000, noNaN: true }),
          (equity) => {
            const weights = engine.getWeights(equity);

            return (
              weights.w1 >= 0 && weights.w1 <= 1 &&
              weights.w2 >= 0 && weights.w2 <= 1 &&
              weights.w3 >= 0 && weights.w3 <= 1
            );
          },
        ),
        { numRuns: 1000 },
      );
    });

    it("should handle negative equity gracefully (treat as 0)", () => {
      fc.assert(
        fc.property(
          fc.float({ min: -1000000, max: 0, noNaN: true }),
          (equity) => {
            const weights = engine.getWeights(equity);
            const sum = weights.w1 + weights.w2 + weights.w3;

            // Should still sum to 1.0 and default to Phase 1 only
            return (
              Math.abs(sum - 1.0) < 1e-10 &&
              weights.w1 === 1.0 &&
              weights.w2 === 0.0 &&
              weights.w3 === 0.0
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 12: Equity Tier Consistency
   *
   * For any equity value, the assigned equity tier should match
   * the tier boundaries defined in the allocation engine.
   *
   * Validates: Requirements 1.2, 1.3, 1.4, 1.5
   */
  describe("Property 12: Equity Tier Consistency", () => {
    it("should assign MICRO tier for equity < $1,500", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: Math.fround(1499.99), noNaN: true }),
          (equity) => {
            const tier = engine.getEquityTier(equity);
            return tier === EquityTier.MICRO;
          },
        ),
        { numRuns: 500 },
      );
    });

    it("should assign SMALL tier for equity $1,500 - $4,999.99", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 1500, max: Math.fround(4999.99), noNaN: true }),
          (equity) => {
            const tier = engine.getEquityTier(equity);
            return tier === EquityTier.SMALL;
          },
        ),
        { numRuns: 500 },
      );
    });

    it("should assign MEDIUM tier for equity $5,000 - $24,999.99", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 5000, max: Math.fround(24999.99), noNaN: true }),
          (equity) => {
            const tier = engine.getEquityTier(equity);
            return tier === EquityTier.MEDIUM;
          },
        ),
        { numRuns: 500 },
      );
    });

    it("should assign LARGE tier for equity $25,000 - $49,999.99", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 25000, max: Math.fround(49999.99), noNaN: true }),
          (equity) => {
            const tier = engine.getEquityTier(equity);
            return tier === EquityTier.LARGE;
          },
        ),
        { numRuns: 500 },
      );
    });

    it("should assign INSTITUTIONAL tier for equity >= $50,000", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 50000, max: 10000000, noNaN: true }),
          (equity) => {
            const tier = engine.getEquityTier(equity);
            return tier === EquityTier.INSTITUTIONAL;
          },
        ),
        { numRuns: 500 },
      );
    });

    it("should have consistent tier boundaries (no gaps or overlaps)", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100000, noNaN: true }),
          (equity) => {
            const tier = engine.getEquityTier(equity);

            // Verify tier is one of the valid values
            const validTiers = [
              EquityTier.MICRO,
              EquityTier.SMALL,
              EquityTier.MEDIUM,
              EquityTier.LARGE,
              EquityTier.INSTITUTIONAL,
            ];

            return validTiers.includes(tier);
          },
        ),
        { numRuns: 1000 },
      );
    });

    it("should handle negative equity as MICRO tier", () => {
      fc.assert(
        fc.property(
          fc.float({ min: -1000000, max: 0, noNaN: true }),
          (equity) => {
            const tier = engine.getEquityTier(equity);
            return tier === EquityTier.MICRO;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Additional Property: Leverage Cap Consistency
   *
   * For any equity value, the max leverage should match the tier's cap.
   */
  describe("Leverage Cap Consistency", () => {
    it("should return correct leverage cap for each tier", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100000, noNaN: true }),
          (equity) => {
            const tier = engine.getEquityTier(equity);
            const maxLeverage = engine.getMaxLeverage(equity);
            const leverageCaps = engine.getLeverageCaps();

            return maxLeverage === leverageCaps[tier];
          },
        ),
        { numRuns: 1000 },
      );
    });

    it("should have decreasing leverage caps as equity increases", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: 0, max: 50000, noNaN: true }),
            fc.float({ min: 0, max: 50000, noNaN: true }),
          ),
          ([equity1, equity2]) => {
            const leverage1 = engine.getMaxLeverage(equity1);
            const leverage2 = engine.getMaxLeverage(equity2);

            // If equity1 < equity2, leverage1 should be >= leverage2
            // (higher equity = lower leverage allowed)
            if (equity1 < equity2) {
              return leverage1 >= leverage2;
            }
            return leverage2 >= leverage1;
          },
        ),
        { numRuns: 500 },
      );
    });
  });

  /**
   * Additional Property: Allocation Monotonicity
   *
   * Phase 1 weight should decrease as equity increases (in general trend).
   * Phase 2 weight should increase then stabilize.
   * Phase 3 weight should only appear at high equity.
   */
  describe("Allocation Monotonicity", () => {
    it("should have Phase 1 weight = 1.0 below $1,500", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1499, noNaN: true }),
          (equity) => {
            const weights = engine.getWeights(equity);
            return weights.w1 === 1.0 && weights.w2 === 0.0 &&
              weights.w3 === 0.0;
          },
        ),
        { numRuns: 500 },
      );
    });

    it("should have Phase 3 weight = 0 below $25,000", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 24999, noNaN: true }),
          (equity) => {
            const weights = engine.getWeights(equity);
            return weights.w3 === 0.0;
          },
        ),
        { numRuns: 500 },
      );
    });

    it("should have Phase 3 weight > 0 above $25,000", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 25001, max: 1000000, noNaN: true }),
          (equity) => {
            const weights = engine.getWeights(equity);
            return weights.w3 > 0;
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
