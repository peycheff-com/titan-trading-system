/**
 * ConfigRegistry Tests - Tighten-only enforcement and receipts
 *
 * Uses real CONFIG_CATALOG keys for integration testing.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ConfigRegistry } from "../../services/config/ConfigRegistry.js";

describe("ConfigRegistry", () => {
    let registry: ConfigRegistry;

    beforeEach(() => {
        registry = new ConfigRegistry("test-hmac-secret");
    });

    describe("tighten-only enforcement", () => {
        it("should allow reducing maxPositionNotional (tighten_only)", async () => {
            const effectiveBefore = registry.getEffective(
                "risk.maxPositionNotional",
            );
            expect(effectiveBefore!.value).toBe(50000);

            const result = await registry.createOverride(
                "risk.maxPositionNotional",
                25000,
                "test-operator",
                "Reducing position size for safety",
            );

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();

            const effectiveAfter = registry.getEffective(
                "risk.maxPositionNotional",
            );
            expect(effectiveAfter!.value).toBe(25000);
        });

        it("should reject increasing maxPositionNotional (tighten_only)", async () => {
            const effectiveBefore = registry.getEffective(
                "risk.maxPositionNotional",
            );
            expect(effectiveBefore!.value).toBe(50000);

            const result = await registry.createOverride(
                "risk.maxPositionNotional",
                200000,
                "test-operator",
                "Trying to increase position size",
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("Tighten-only");

            const effectiveAfter = registry.getEffective(
                "risk.maxPositionNotional",
            );
            expect(effectiveAfter!.value).toBe(50000);
        });

        it("should allow tightening maxDailyLoss (lower_is_riskier: increase allowed)", async () => {
            // maxDailyLoss default is -1000. lower_is_riskier → increasing (less negative) is tightening.
            const result = await registry.createOverride(
                "risk.maxDailyLoss",
                -500,
                "test-operator",
                "Tightening daily loss limit",
            );

            expect(result.success).toBe(true);
            expect(result.receipt?.action).toBe("override");
        });

        it("should reject loosening maxDailyLoss (lower_is_riskier: decrease blocked)", async () => {
            // Going from -1000 to -2000 is loosening (more negative = riskier)
            const result = await registry.createOverride(
                "risk.maxDailyLoss",
                -2000,
                "test-operator",
                "Trying to loosen loss limit",
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("Tighten-only");
        });

        it("should allow reducing maxDailyDrawdown (tighten_only)", async () => {
            const result = await registry.createOverride(
                "breaker.maxDailyDrawdown",
                0.03,
                "test-operator",
                "Reducing drawdown threshold for safety",
            );

            expect(result.success).toBe(true);
        });

        it("should reject increasing maxDailyDrawdown (tighten_only)", async () => {
            const result = await registry.createOverride(
                "breaker.maxDailyDrawdown",
                0.5,
                "test-operator",
                "Trying to increase drawdown threshold",
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("Tighten-only");
        });
    });

    describe("raise-only enforcement", () => {
        it("should allow raising reserveLimit (raise_only)", async () => {
            const result = await registry.createOverride(
                "capital.reserveLimit",
                500,
                "test-operator",
                "Increasing reserve for safety",
            );

            expect(result.success).toBe(true);
        });

        it("should reject lowering reserveLimit (raise_only)", async () => {
            const result = await registry.createOverride(
                "capital.reserveLimit",
                50,
                "test-operator",
                "Trying to decrease reserve",
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("Raise-only");
        });
    });

    describe("tunable configs", () => {
        it("should allow any change to tunable configs", async () => {
            const result = await registry.createOverride(
                "trading.heartbeatTimeoutMs",
                600000,
                "test-operator",
                "Increasing timeout",
            );

            expect(result.success).toBe(true);

            const result2 = await registry.createOverride(
                "trading.heartbeatTimeoutMs",
                60000,
                "test-operator",
                "Decreasing timeout",
            );

            expect(result2.success).toBe(true);
        });
    });

    describe("receipts", () => {
        it("should generate receipt for successful override", async () => {
            const result = await registry.createOverride(
                "risk.maxPositionNotional",
                25000,
                "test-operator",
                "Reducing for safety",
            );

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.id).toBeDefined();
            expect(result.receipt?.key).toBe("risk.maxPositionNotional");
            expect(result.receipt?.previousValue).toBe(50000);
            expect(result.receipt?.newValue).toBe(25000);
            expect(result.receipt?.operatorId).toBe("test-operator");
            expect(result.receipt?.reason).toBe("Reducing for safety");
            expect(result.receipt?.action).toBe("override");
            expect(result.receipt?.signature).toBeDefined();
        });

        it("should generate receipt for rollback", async () => {
            await registry.createOverride(
                "risk.maxPositionNotional",
                25000,
                "test-operator",
                "Reducing for safety",
            );

            const result = await registry.rollbackOverride(
                "risk.maxPositionNotional",
                "test-operator",
            );

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.action).toBe("rollback");
            expect(result.receipt?.previousValue).toBe(25000);
            expect(result.receipt?.newValue).toBe(50000);
        });

        it("should retrieve receipts with limit", () => {
            const receipts = registry.getReceipts(10);
            expect(Array.isArray(receipts)).toBe(true);
        });

        it("should include signature in receipts", async () => {
            const result = await registry.createOverride(
                "risk.maxPositionNotional",
                25000,
                "test-operator",
                "Test override",
            );

            expect(result.receipt?.signature).toBeDefined();
            expect(result.receipt?.signature).toMatch(/^[a-f0-9]{64}$/);
        });
    });

    describe("active overrides", () => {
        it("should track active overrides", async () => {
            const beforeOverrides = registry.getActiveOverrides();
            const beforeCount = beforeOverrides.length;

            await registry.createOverride(
                "risk.maxPositionNotional",
                25000,
                "test-operator",
                "Test override",
            );

            const afterOverrides = registry.getActiveOverrides();
            expect(afterOverrides.length).toBe(beforeCount + 1);
        });

        it("should remove override from active after rollback", async () => {
            await registry.createOverride(
                "risk.maxPositionNotional",
                25000,
                "test-operator",
                "Test override",
            );

            const beforeRollback = registry.getActiveOverrides();
            const overrideExists = beforeRollback.some(
                (o) => o.key === "risk.maxPositionNotional" && o.active,
            );
            expect(overrideExists).toBe(true);

            await registry.rollbackOverride(
                "risk.maxPositionNotional",
                "test-operator",
            );

            const afterRollback = registry.getActiveOverrides();
            const stillExists = afterRollback.some(
                (o) => o.key === "risk.maxPositionNotional" && o.active,
            );
            expect(stillExists).toBe(false);
        });
    });

    describe("new catalog items", () => {
        it("should have all new trading/risk items in catalog", () => {
            const newKeys = [
                "capital.initialEquity",
                "capital.reserveLimit",
                "risk.maxRiskPct",
                "risk.maxPositionSizePct",
                "risk.maxTotalLeverage",
                "breaker.maxWeeklyDrawdown",
                "breaker.minEquity",
                "breaker.consecutiveLossLimit",
                "breaker.emergencyStopLoss",
                "safety.zscoreThreshold",
                "safety.drawdownVelocityThreshold",
                "trading.minTradeIntervalMs",
                "trading.maxTradesPerHour",
                "trading.maxTradesPerDay",
                "market.fundingGreedThreshold",
                "market.fundingFearThreshold",
                "execution.maxSpreadPct",
                "execution.maxSlippagePct",
                "execution.useMockBroker",
                "execution.minStructureThreshold",
            ];

            for (const key of newKeys) {
                const effective = registry.getEffective(key);
                expect(effective, `${key} should exist in catalog`).toBeDefined();
                expect(effective!.value).toBeDefined();
            }
        });

        it("should enforce tighten-only on risk.maxRiskPct", async () => {
            const eff = registry.getEffective("risk.maxRiskPct");
            expect(eff!.value).toBe(0.03);

            // Tighten (reduce) — should pass
            const tighten = await registry.createOverride(
                "risk.maxRiskPct",
                0.01,
                "test-op",
                "Reducing risk",
            );
            expect(tighten.success).toBe(true);

            // Loosen (increase) — should fail
            const loosen = await registry.createOverride(
                "risk.maxRiskPct",
                0.1,
                "test-op",
                "Increasing risk",
            );
            expect(loosen.success).toBe(false);
            expect(loosen.error).toContain("Tighten-only");
        });

        it("should enforce raise-only on trading.minTradeIntervalMs", async () => {
            const eff = registry.getEffective("trading.minTradeIntervalMs");
            expect(eff!.value).toBe(30000);

            // Raise — should pass
            const raise = await registry.createOverride(
                "trading.minTradeIntervalMs",
                60000,
                "test-op",
                "Increasing interval",
            );
            expect(raise.success).toBe(true);

            // Lower — should fail
            const lower = await registry.createOverride(
                "trading.minTradeIntervalMs",
                5000,
                "test-op",
                "Decreasing interval",
            );
            expect(lower.success).toBe(false);
            expect(lower.error).toContain("Raise-only");
        });
    });

    describe("presets", () => {
        it("should list available presets", () => {
            const presets = registry.getPresets();
            expect(presets.length).toBe(3);
            expect(presets.map((p) => p.name)).toEqual([
                "conservative",
                "balanced",
                "aggressive",
            ]);
        });

        it("should apply a preset profile", async () => {
            const result = await registry.applyPreset(
                "conservative",
                "test-operator",
            );
            expect(result.success).toBeDefined();
            expect(result.results.length).toBeGreaterThan(0);
        });

        it("should reject unknown preset", async () => {
            const result = await registry.applyPreset(
                "nonexistent",
                "test-operator",
            );
            expect(result.success).toBe(false);
            expect(result.error).toContain("Unknown preset");
        });
    });
});
