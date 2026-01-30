/**
 * Unit tests for RiskPolicy Schema
 *
 * Tests the RiskPolicySchemaV1 Zod schema which defines risk constraints
 * for both Rust execution engine (solvency) and Brain (strategy) veto logic.
 */

import {
    DefaultRiskPolicyV1,
    RiskPolicySchemaV1,
    type RiskPolicyV1,
} from "../../../src/schemas/RiskPolicy";

describe("RiskPolicySchemaV1", () => {
    describe("Valid Policies", () => {
        it("should validate the default policy", () => {
            const result = RiskPolicySchemaV1.safeParse(DefaultRiskPolicyV1);
            expect(result.success).toBe(true);
        });

        it("should validate a complete valid policy", () => {
            const policy: RiskPolicyV1 = {
                maxAccountLeverage: 5.0,
                maxPositionNotional: 25000.0,
                maxDailyLoss: -500.0,
                maxOpenOrdersPerSymbol: 3,
                symbolWhitelist: ["BTC/USDT", "ETH/USDT"],
                maxSlippageBps: 50,
                maxStalenessMs: 2000,
                maxCorrelation: 0.5,
                correlationPenalty: 0.3,
                minConfidenceScore: 0.8,
                minStopDistanceMultiplier: 2.0,
                version: 1,
                lastUpdated: Date.now(),
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(true);
        });

        it("should allow empty symbol whitelist", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                symbolWhitelist: [],
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(true);
        });

        it("should allow zero values for most fields", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxAccountLeverage: 0,
                maxPositionNotional: 0,
                maxOpenOrdersPerSymbol: 0,
                maxSlippageBps: 0,
                maxStalenessMs: 0,
                minStopDistanceMultiplier: 0,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(true);
        });
    });

    describe("Solvency Constraints Validation", () => {
        it("should reject negative leverage", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxAccountLeverage: -1,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject leverage over 100", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxAccountLeverage: 150,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject negative position notional", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxPositionNotional: -1000,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject positive daily loss (must be negative)", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxDailyLoss: 100, // Should be negative
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should accept zero as daily loss", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxDailyLoss: 0,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(true);
        });

        it("should reject non-integer maxOpenOrdersPerSymbol", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxOpenOrdersPerSymbol: 2.5,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject negative slippage", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxSlippageBps: -10,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject negative staleness", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxStalenessMs: -100,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });
    });

    describe("Strategy Constraints Validation", () => {
        it("should reject correlation below -1", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxCorrelation: -1.5,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject correlation above 1", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                maxCorrelation: 1.5,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should accept edge correlation values (-1, 0, 1)", () => {
            const values = [-1, 0, 1];
            values.forEach((val) => {
                const policy = {
                    ...DefaultRiskPolicyV1,
                    maxCorrelation: val,
                };
                const result = RiskPolicySchemaV1.safeParse(policy);
                expect(result.success).toBe(true);
            });
        });

        it("should reject correlationPenalty below 0", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                correlationPenalty: -0.5,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject correlationPenalty above 1", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                correlationPenalty: 1.5,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject minConfidenceScore below 0", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                minConfidenceScore: -0.1,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject minConfidenceScore above 1", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                minConfidenceScore: 1.1,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject negative minStopDistanceMultiplier", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                minStopDistanceMultiplier: -0.5,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });
    });

    describe("Metadata Validation", () => {
        it("should require version to be 1", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                version: 2,
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should accept any timestamp", () => {
            const policy = {
                ...DefaultRiskPolicyV1,
                lastUpdated: Date.now(),
            };

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(true);
        });
    });

    describe("Required Fields", () => {
        it("should reject missing maxAccountLeverage", () => {
            const policy = { ...DefaultRiskPolicyV1 } as Partial<RiskPolicyV1>;
            delete policy.maxAccountLeverage;

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });

        it("should reject missing symbolWhitelist", () => {
            const policy = { ...DefaultRiskPolicyV1 } as Partial<RiskPolicyV1>;
            delete policy.symbolWhitelist;

            const result = RiskPolicySchemaV1.safeParse(policy);
            expect(result.success).toBe(false);
        });
    });

    describe("Default Policy Constants", () => {
        it("should have reasonable default leverage", () => {
            expect(DefaultRiskPolicyV1.maxAccountLeverage).toBeLessThanOrEqual(
                20,
            );
        });

        it("should have negative daily loss limit", () => {
            expect(DefaultRiskPolicyV1.maxDailyLoss).toBeLessThan(0);
        });

        it("should include major crypto pairs in whitelist", () => {
            expect(DefaultRiskPolicyV1.symbolWhitelist).toContain("BTC/USDT");
            expect(DefaultRiskPolicyV1.symbolWhitelist).toContain("ETH/USDT");
        });
    });
});
