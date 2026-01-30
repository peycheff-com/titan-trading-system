/**
 * Guardrails Unit Tests
 * Tests safety validation for config optimization proposals
 */
import { Guardrails, PARAMETER_BOUNDS } from "../../src/ai/Guardrails.js";

describe("Guardrails", () => {
    let guardrails: Guardrails;

    beforeEach(() => {
        guardrails = new Guardrails();
    });

    describe("validateProposal", () => {
        it("should accept valid proposal", () => {
            const proposal = {
                targetKey: "traps.oi_wipeout.stop_loss",
                currentValue: 0.02,
                suggestedValue: 0.03,
                reasoning: "Increase stop loss for volatile conditions",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 2,
                    confidenceScore: 0.8,
                },
            };
            const result = guardrails.validateProposal(proposal);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it("should reject proposal without targetKey", () => {
            const proposal = {
                targetKey: "",
                currentValue: 0.02,
                suggestedValue: 0.03,
                reasoning: "Some reasoning",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 2,
                    confidenceScore: 0.8,
                },
            };
            const result = guardrails.validateProposal(proposal);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                "Missing required field: targetKey",
            );
        });

        it("should reject proposal without suggestedValue", () => {
            const proposal = {
                targetKey: "traps.oi_wipeout.stop_loss",
                currentValue: 0.02,
                suggestedValue: undefined as unknown as number,
                reasoning: "Some reasoning",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 2,
                    confidenceScore: 0.8,
                },
            };
            const result = guardrails.validateProposal(proposal);
            expect(result.valid).toBe(false);
        });

        it("should reject proposal without reasoning", () => {
            const proposal = {
                targetKey: "traps.oi_wipeout.stop_loss",
                currentValue: 0.02,
                suggestedValue: 0.03,
                reasoning: "",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 2,
                    confidenceScore: 0.8,
                },
            };
            const result = guardrails.validateProposal(proposal);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                "Missing required field: reasoning",
            );
        });

        it("should reject proposal without expectedImpact", () => {
            const proposal = {
                targetKey: "traps.oi_wipeout.stop_loss",
                currentValue: 0.02,
                suggestedValue: 0.03,
                reasoning: "Some reasoning",
                expectedImpact: undefined as unknown as {
                    pnlImprovement: number;
                    riskChange: number;
                    confidenceScore: number;
                },
            };
            const result = guardrails.validateProposal(proposal);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                "Missing required field: expectedImpact",
            );
        });

        it("should reject invalid targetKey", () => {
            const proposal = {
                targetKey: "invalid.key.path",
                currentValue: 0.02,
                suggestedValue: 0.03,
                reasoning: "Some reasoning",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 2,
                    confidenceScore: 0.8,
                },
            };
            const result = guardrails.validateProposal(proposal);
            expect(result.valid).toBe(false);
            expect(
                result.errors.some((e) =>
                    e.includes("does not exist in config schema")
                ),
            ).toBe(true);
        });

        it("should reject value exceeding bounds", () => {
            const proposal = {
                targetKey: "traps.oi_wipeout.max_leverage",
                currentValue: 10,
                suggestedValue: 50, // Max is 20
                reasoning: "Some reasoning",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 2,
                    confidenceScore: 0.8,
                },
            };
            const result = guardrails.validateProposal(proposal);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("exceeds bounds")))
                .toBe(true);
        });

        it("should add warning for high risk change", () => {
            const proposal = {
                targetKey: "traps.oi_wipeout.stop_loss",
                currentValue: 0.02,
                suggestedValue: 0.03,
                reasoning: "Some reasoning",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 15,
                    confidenceScore: 0.8,
                },
            };
            const result = guardrails.validateProposal(proposal);
            expect(result.warnings.some((w) => w.includes("High risk change")))
                .toBe(true);
        });

        it("should add warning for low confidence score", () => {
            const proposal = {
                targetKey: "traps.oi_wipeout.stop_loss",
                currentValue: 0.02,
                suggestedValue: 0.03,
                reasoning: "Some reasoning",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 2,
                    confidenceScore: 0.3,
                },
            };
            const result = guardrails.validateProposal(proposal);
            expect(
                result.warnings.some((w) => w.includes("Low confidence score")),
            ).toBe(true);
        });
    });

    describe("checkBounds", () => {
        it("should accept value within bounds", () => {
            expect(guardrails.checkBounds("traps.oi_wipeout.stop_loss", 0.02))
                .toBe(true);
        });

        it("should accept value at minimum bound", () => {
            expect(guardrails.checkBounds("traps.oi_wipeout.stop_loss", 0.001))
                .toBe(true);
        });

        it("should accept value at maximum bound", () => {
            expect(guardrails.checkBounds("traps.oi_wipeout.stop_loss", 0.05))
                .toBe(true);
        });

        it("should reject value below minimum", () => {
            expect(guardrails.checkBounds("traps.oi_wipeout.stop_loss", 0.0001))
                .toBe(false);
        });

        it("should reject value above maximum", () => {
            expect(guardrails.checkBounds("traps.oi_wipeout.stop_loss", 0.1))
                .toBe(false);
        });

        it("should accept boolean values", () => {
            expect(guardrails.checkBounds("traps.oi_wipeout.enabled", true))
                .toBe(true);
        });

        it("should accept valid slippage_model enum", () => {
            expect(
                guardrails.checkBounds(
                    "execution.slippage_model",
                    "conservative",
                ),
            ).toBe(true);
        });

        it("should reject invalid slippage_model enum", () => {
            expect(
                guardrails.checkBounds("execution.slippage_model", "invalid"),
            ).toBe(false);
        });

        it("should reject non-numeric value for numeric parameter", () => {
            expect(
                guardrails.checkBounds(
                    "traps.oi_wipeout.stop_loss",
                    "not a number",
                ),
            ).toBe(false);
        });
    });

    describe("validateSchema", () => {
        it("should accept valid config key", () => {
            const result = guardrails.validateSchema({
                targetKey: "traps.oi_wipeout.stop_loss",
                currentValue: 0.02,
                suggestedValue: 0.03,
                reasoning: "test",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 2,
                    confidenceScore: 0.8,
                },
            });
            expect(result).toBe(true);
        });

        it("should reject invalid config key", () => {
            const result = guardrails.validateSchema({
                targetKey: "invalid.config.key",
                currentValue: 0.02,
                suggestedValue: 0.03,
                reasoning: "test",
                expectedImpact: {
                    pnlImprovement: 5,
                    riskChange: 2,
                    confidenceScore: 0.8,
                },
            });
            expect(result).toBe(false);
        });
    });

    describe("getBounds", () => {
        it("should return bounds for known parameter", () => {
            expect(guardrails.getBounds("stop_loss")).toEqual({
                min: 0.001,
                max: 0.05,
            });
        });

        it("should return undefined for unknown parameter", () => {
            expect(guardrails.getBounds("unknown_param")).toBeUndefined();
        });
    });

    describe("isValidKey", () => {
        it("should return true for valid key", () => {
            expect(guardrails.isValidKey("traps.oi_wipeout.stop_loss")).toBe(
                true,
            );
        });

        it("should return false for invalid key", () => {
            expect(guardrails.isValidKey("invalid.key")).toBe(false);
        });
    });

    describe("getValidKeys", () => {
        it("should return array of valid keys", () => {
            const keys = guardrails.getValidKeys();
            expect(Array.isArray(keys)).toBe(true);
            expect(keys.length).toBeGreaterThan(0);
            expect(keys).toContain("traps.oi_wipeout.stop_loss");
        });
    });

    describe("PARAMETER_BOUNDS", () => {
        it("should have bounds for all risk parameters", () => {
            expect(PARAMETER_BOUNDS.max_leverage).toBeDefined();
            expect(PARAMETER_BOUNDS.stop_loss).toBeDefined();
            expect(PARAMETER_BOUNDS.risk_per_trade).toBeDefined();
        });

        it("should enforce max_leverage <= 20", () => {
            expect(PARAMETER_BOUNDS.max_leverage.max).toBeLessThanOrEqual(20);
        });

        it("should enforce stop_loss <= 0.05", () => {
            expect(PARAMETER_BOUNDS.stop_loss.max).toBeLessThanOrEqual(0.05);
        });
    });
});
