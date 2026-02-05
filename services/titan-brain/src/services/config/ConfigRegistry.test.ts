/**
 * ConfigRegistry Tests - Tighten-only enforcement and receipts
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ConfigRegistry } from "../../services/config/ConfigRegistry.js";

describe("ConfigRegistry", () => {
    let registry: ConfigRegistry;

    beforeEach(() => {
        registry = new ConfigRegistry("test-hmac-secret");
    });

    describe("tighten-only enforcement", () => {
        it("should allow reducing max_position_size (tighten_only)", async () => {
            // Get the current value
            const effectiveBefore = registry.getEffective(
                "risk.max_position_size",
            );
            expect(effectiveBefore!.value).toBe(100000);

            // Try to reduce it (should succeed - tightening)
            const result = await registry.createOverride(
                "risk.max_position_size",
                50000,
                "test-operator",
                "Reducing position size for safety",
            );

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();

            const effectiveAfter = registry.getEffective(
                "risk.max_position_size",
            );
            expect(effectiveAfter!.value).toBe(50000);
        });

        it("should reject increasing max_position_size (tighten_only)", async () => {
            // Get the current value
            const effectiveBefore = registry.getEffective(
                "risk.max_position_size",
            );
            expect(effectiveBefore!.value).toBe(100000);

            // Try to increase it (should fail - loosening not allowed)
            const result = await registry.createOverride(
                "risk.max_position_size",
                200000,
                "test-operator",
                "Trying to increase position size",
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("tighten-only");

            // Value should remain unchanged
            const effectiveAfter = registry.getEffective(
                "risk.max_position_size",
            );
            expect(effectiveAfter!.value).toBe(100000);
        });

        it("should allow reducing daily_loss_limit (tighten_only)", async () => {
            const result = await registry.createOverride(
                "risk.daily_loss_limit",
                5000,
                "test-operator",
                "Reducing daily loss limit",
            );

            expect(result.success).toBe(true);
            expect(result.receipt?.action).toBe("override");
        });

        it("should reject increasing daily_loss_limit (tighten_only)", async () => {
            const result = await registry.createOverride(
                "risk.daily_loss_limit",
                20000,
                "test-operator",
                "Trying to increase loss limit",
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("tighten-only");
        });

        it("should allow reducing drawdown_pause_threshold (tighten_only)", async () => {
            const result = await registry.createOverride(
                "risk.drawdown_pause_threshold",
                10,
                "test-operator",
                "Reducing drawdown threshold for safety",
            );

            expect(result.success).toBe(true);
        });

        it("should reject increasing drawdown_pause_threshold (tighten_only)", async () => {
            const result = await registry.createOverride(
                "risk.drawdown_pause_threshold",
                30,
                "test-operator",
                "Trying to increase drawdown threshold",
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("tighten-only");
        });
    });

    describe("raise-only enforcement", () => {
        it("should allow raising min_equity_reserve (raise_only)", async () => {
            const result = await registry.createOverride(
                "capital.min_equity_reserve",
                20000,
                "test-operator",
                "Increasing reserve for safety",
            );

            expect(result.success).toBe(true);
        });

        it("should reject lowering min_equity_reserve (raise_only)", async () => {
            const result = await registry.createOverride(
                "capital.min_equity_reserve",
                5000,
                "test-operator",
                "Trying to decrease reserve",
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("raise-only");
        });
    });

    describe("tunable configs", () => {
        it("should allow any change to tunable configs", async () => {
            const result = await registry.createOverride(
                "nats.connection_timeout",
                10000,
                "test-operator",
                "Increasing timeout",
            );

            expect(result.success).toBe(true);

            const result2 = await registry.createOverride(
                "nats.connection_timeout",
                2000,
                "test-operator",
                "Decreasing timeout",
            );

            expect(result2.success).toBe(true);
        });
    });

    describe("immutable configs", () => {
        it("should reject changes to immutable configs", async () => {
            const result = await registry.createOverride(
                "system.env",
                "staging",
                "test-operator",
                "Trying to change environment",
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("immutable");
        });
    });

    describe("receipts", () => {
        it("should generate receipt for successful override", async () => {
            const result = await registry.createOverride(
                "risk.max_position_size",
                50000,
                "test-operator",
                "Reducing for safety",
            );

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.id).toBeDefined();
            expect(result.receipt?.key).toBe("risk.max_position_size");
            expect(result.receipt?.previousValue).toBe(100000);
            expect(result.receipt?.newValue).toBe(50000);
            expect(result.receipt?.operatorId).toBe("test-operator");
            expect(result.receipt?.reason).toBe("Reducing for safety");
            expect(result.receipt?.action).toBe("override");
            expect(result.receipt?.signature).toBeDefined();
        });

        it("should generate receipt for rollback", async () => {
            // First create an override
            await registry.createOverride(
                "risk.max_position_size",
                50000,
                "test-operator",
                "Reducing for safety",
            );

            // Then rollback
            const result = await registry.rollbackOverride(
                "risk.max_position_size",
                "test-operator",
            );

            expect(result.success).toBe(true);
            expect(result.receipt).toBeDefined();
            expect(result.receipt?.action).toBe("rollback");
            expect(result.receipt?.previousValue).toBe(50000);
            expect(result.receipt?.newValue).toBe(100000);
        });

        it("should retrieve receipts with limit", () => {
            const receipts = registry.getReceipts(10);
            expect(Array.isArray(receipts)).toBe(true);
        });

        it("should include signature in receipts", async () => {
            const result = await registry.createOverride(
                "risk.max_position_size",
                50000,
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
                "risk.max_position_size",
                50000,
                "test-operator",
                "Test override",
            );

            const afterOverrides = registry.getActiveOverrides();
            expect(afterOverrides.length).toBe(beforeCount + 1);
        });

        it("should remove override from active after rollback", async () => {
            await registry.createOverride(
                "risk.max_position_size",
                50000,
                "test-operator",
                "Test override",
            );

            const beforeRollback = registry.getActiveOverrides();
            const overrideExists = beforeRollback.some(
                (o) => o.key === "risk.max_position_size" && o.active,
            );
            expect(overrideExists).toBe(true);

            await registry.rollbackOverride(
                "risk.max_position_size",
                "test-operator",
            );

            const afterRollback = registry.getActiveOverrides();
            const stillExists = afterRollback.some(
                (o) => o.key === "risk.max_position_size" && o.active,
            );
            expect(stillExists).toBe(false);
        });
    });
});
