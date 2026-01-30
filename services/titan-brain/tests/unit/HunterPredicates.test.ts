/**
 * HunterPredicates Unit Tests
 *
 * Tests for Phase 2 (Discretionary/Structural) signal validation
 */

import { HunterPredicates } from "../../src/engine/HunterPredicates.js";
import { IntentSignal } from "../../src/types/index.js";

describe("HunterPredicates", () => {
    let predicates: HunterPredicates;

    beforeEach(() => {
        predicates = new HunterPredicates();
    });

    describe("validate", () => {
        // Helper to create base signal matching IntentSignal interface
        const createSignal = (
            overrides: Partial<IntentSignal> = {},
            metadata: Record<string, unknown> = {},
        ): IntentSignal => ({
            signalId: "test-signal-1",
            timestamp: Date.now(),
            symbol: "BTCUSDT",
            side: "BUY",
            phaseId: "phase2",
            requestedSize: 1000,
            metadata,
            ...overrides,
        });

        describe("non-phase2 signals", () => {
            it("should pass signals from other phases without validation", () => {
                const signal = createSignal({ phaseId: "phase1" });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
                expect(result.reason).toBeUndefined();
            });

            it("should pass phase3 signals", () => {
                const signal = createSignal({ phaseId: "phase3" });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });
        });

        describe("metadata validation", () => {
            it("should reject phase2 signals without metadata", () => {
                const signal = createSignal({});
                // Remove metadata entirely
                signal.metadata = undefined;
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("HUNTER_VETO");
                expect(result.reason).toContain("Missing metadata");
            });
        });

        describe("liquidation cluster validation", () => {
            it("should pass when cluster intensity meets threshold", () => {
                const signal = createSignal({}, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 75,
                    context_score: 85,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });

            it("should pass when cluster intensity equals threshold (50)", () => {
                const signal = createSignal({}, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 50,
                    context_score: 80,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });

            it("should reject when cluster intensity is below threshold", () => {
                const signal = createSignal({}, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 30,
                    context_score: 90,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("CLUSTER_VETO");
                expect(result.reason).toContain("30 < 50");
            });

            it("should reject when cluster intensity is 0", () => {
                const signal = createSignal({}, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 0,
                    context_score: 90,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("CLUSTER_VETO");
            });

            it("should handle missing cluster_intensity as 0", () => {
                const signal = createSignal({}, {
                    has_liquidation_cluster: true,
                    context_score: 90,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("CLUSTER_VETO");
            });

            it("should skip cluster check when has_liquidation_cluster is false", () => {
                const signal = createSignal({}, {
                    has_liquidation_cluster: false,
                    cluster_intensity: 10, // Would fail if checked
                    context_score: 85,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });
        });

        describe("structure break validation", () => {
            it("should pass BUY signal with BMS_LONG structure break", () => {
                const signal = createSignal({ side: "BUY" }, {
                    structure_break: "BMS_LONG",
                    context_score: 80,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });

            it("should pass SELL signal with BMS_SHORT structure break", () => {
                const signal = createSignal({ side: "SELL" }, {
                    structure_break: "BMS_SHORT",
                    context_score: 80,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });

            it("should reject BUY signal with BMS_SHORT structure break (mismatch)", () => {
                const signal = createSignal({ side: "BUY" }, {
                    structure_break: "BMS_SHORT",
                    context_score: 90,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("STRUCTURE_VETO");
                expect(result.reason).toContain("Direction mismatch");
                expect(result.reason).toContain("Side=BUY");
                expect(result.reason).toContain("Break=BMS_SHORT");
            });

            it("should reject SELL signal with BMS_LONG structure break (mismatch)", () => {
                const signal = createSignal({ side: "SELL" }, {
                    structure_break: "BMS_LONG",
                    context_score: 90,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("STRUCTURE_VETO");
                expect(result.reason).toContain("Direction mismatch");
            });

            it("should skip structure check when structure_break is NONE", () => {
                const signal = createSignal({ side: "BUY" }, {
                    structure_break: "NONE",
                    context_score: 80,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });

            it("should skip structure check when structure_break is undefined", () => {
                const signal = createSignal({ side: "BUY" }, {
                    context_score: 80,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });
        });

        describe("context score validation", () => {
            it("should pass when context_score meets threshold (70)", () => {
                const signal = createSignal({}, {
                    context_score: 70,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });

            it("should pass when context_score exceeds threshold", () => {
                const signal = createSignal({}, {
                    context_score: 95,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });

            it("should reject when context_score is below threshold", () => {
                const signal = createSignal({}, {
                    context_score: 65,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("QUALITY_VETO");
                expect(result.reason).toContain("65 < 70");
            });

            it("should reject when context_score is missing", () => {
                const signal = createSignal({}, {
                    has_liquidation_cluster: false,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("HUNTER_VETO");
                expect(result.reason).toContain("Missing context_score");
            });

            it("should reject when context_score is 0", () => {
                const signal = createSignal({}, {
                    context_score: 0,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("QUALITY_VETO");
            });
        });

        describe("combined validations", () => {
            it("should validate all conditions for a complete valid signal", () => {
                const signal = createSignal({ side: "BUY" }, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 80,
                    structure_break: "BMS_LONG",
                    context_score: 90,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });

            it("should fail fast on first validation failure (cluster)", () => {
                const signal = createSignal({ side: "BUY" }, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 20, // Will fail
                    structure_break: "BMS_SHORT", // Would also fail
                    context_score: 50, // Would also fail
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("CLUSTER_VETO");
            });

            it("should validate structure after cluster passes", () => {
                const signal = createSignal({ side: "BUY" }, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 60, // Pass
                    structure_break: "BMS_SHORT", // Fail
                    context_score: 80,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("STRUCTURE_VETO");
            });

            it("should validate context after structure passes", () => {
                const signal = createSignal({ side: "BUY" }, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 60, // Pass
                    structure_break: "BMS_LONG", // Pass
                    context_score: 50, // Fail
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain("QUALITY_VETO");
            });
        });

        describe("edge cases", () => {
            it("should handle boundary cluster intensity (49 fails, 50 passes)", () => {
                const signalFail = createSignal({}, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 49,
                    context_score: 80,
                });
                expect(predicates.validate(signalFail).valid).toBe(false);

                const signalPass = createSignal({}, {
                    has_liquidation_cluster: true,
                    cluster_intensity: 50,
                    context_score: 80,
                });
                expect(predicates.validate(signalPass).valid).toBe(true);
            });

            it("should handle boundary context score (69 fails, 70 passes)", () => {
                const signalFail = createSignal({}, {
                    context_score: 69,
                });
                expect(predicates.validate(signalFail).valid).toBe(false);

                const signalPass = createSignal({}, {
                    context_score: 70,
                });
                expect(predicates.validate(signalPass).valid).toBe(true);
            });

            it("should handle extra metadata properties", () => {
                const signal = createSignal({}, {
                    context_score: 80,
                    extra_field: "test",
                    another_field: 123,
                });
                const result = predicates.validate(signal);
                expect(result.valid).toBe(true);
            });
        });
    });
});
