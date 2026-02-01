/**
 * Unit tests for ExecutionReportSchema
 *
 * Tests the Zod schema for execution reports (fills, rejects, cancels)
 * which aligns with both Brain and Rust execution engine events.
 */

import {
    type ExecutionReport,
    ExecutionReportSchema,
} from "../../../src/schemas/ExecutionReportSchema";

describe("ExecutionReportSchema", () => {
    const createValidReport = (
        overrides: Partial<ExecutionReport> = {},
    ): Record<string, unknown> => ({
        symbol: "BTCUSDT",
        side: "BUY",
        price: 40000,
        qty: 0.5,
        status: "FILLED",
        ...overrides,
    });

    describe("Valid Reports", () => {
        it("should validate a minimal valid report", () => {
            const report = createValidReport();
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.symbol).toBe("BTCUSDT");
                expect(result.data.side).toBe("BUY");
                expect(result.data.price).toBe(40000);
                expect(result.data.qty).toBe(0.5);
                expect(result.data.status).toBe("FILLED");
            }
        });

        it("should validate a complete report with all fields", () => {
            const report = createValidReport({
                type: "EXECUTION_REPORT",
                phaseId: "phase-123",
                signalId: "signal-456",
                orderId: "order-789",
                fillId: "fill-001",
                executionId: "exec-001",
                timestamp: Date.now(),
                fee: 0.01,
                feeCurrency: "USDT",
                reason: "Market order filled",
            });

            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(true);
        });
    });

    describe("Side Normalization", () => {
        it("should normalize lowercase buy to BUY", () => {
            const report = createValidReport({ side: "buy" as "BUY" | "SELL" });
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.side).toBe("BUY");
            }
        });

        it("should normalize lowercase sell to SELL", () => {
            const report = createValidReport({
                side: "sell" as "BUY" | "SELL",
            });
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.side).toBe("SELL");
            }
        });

        it("should accept uppercase SELL", () => {
            const report = createValidReport({ side: "SELL" });
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.side).toBe("SELL");
            }
        });

        it("should reject invalid side", () => {
            const report = { ...createValidReport(), side: "LONG" };
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(false);
        });
    });

    describe("Numeric Coercion", () => {
        it("should coerce string price to number", () => {
            const report = { ...createValidReport(), price: "40000.50" };
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.price).toBe(40000.5);
                expect(typeof result.data.price).toBe("number");
            }
        });

        it("should coerce string qty to number", () => {
            const report = { ...createValidReport(), qty: "1.5" };
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.qty).toBe(1.5);
                expect(typeof result.data.qty).toBe("number");
            }
        });

        it("should coerce string timestamp to number", () => {
            const now = Date.now();
            const report = { ...createValidReport(), timestamp: String(now) };
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.timestamp).toBe(now);
                expect(typeof result.data.timestamp).toBe("number");
            }
        });

        it("should handle NaN price by setting to 0", () => {
            const report = { ...createValidReport(), price: "not-a-number" };
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.price).toBe(0);
            }
        });

        it("should handle NaN qty by setting to 0", () => {
            const report = { ...createValidReport(), qty: "invalid" };
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.qty).toBe(0);
            }
        });
    });

    describe("Default Values", () => {
        it("should default type to EXECUTION_REPORT", () => {
            const report = createValidReport();
            delete (report as Record<string, unknown>).type;
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.type).toBe("EXECUTION_REPORT");
            }
        });

        it("should default timestamp to current time", () => {
            const before = Date.now();
            const report = createValidReport();
            delete (report as Record<string, unknown>).timestamp;
            const result = ExecutionReportSchema.safeParse(report);
            const after = Date.now();

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.timestamp).toBeGreaterThanOrEqual(before);
                expect(result.data.timestamp).toBeLessThanOrEqual(after);
            }
        });
    });

    describe("ID Normalization", () => {
        it("should use executionId as fillId fallback", () => {
            const report = { ...createValidReport(), executionId: "exec-123" };
            delete (report as Record<string, unknown>).fillId;
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.fillId).toBe("exec-123");
            }
        });

        it("should prefer fillId over executionId", () => {
            const report = {
                ...createValidReport(),
                fillId: "fill-456",
                executionId: "exec-123",
            };
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.fillId).toBe("fill-456");
            }
        });
    });

    describe("Status Values", () => {
        it("should accept FILLED status", () => {
            const report = createValidReport({ status: "FILLED" });
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(true);
        });

        it("should accept PARTIALLY_FILLED status", () => {
            const report = createValidReport({ status: "PARTIALLY_FILLED" });
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(true);
        });

        it("should accept CANCELED status", () => {
            const report = createValidReport({ status: "CANCELED" });
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(true);
        });

        it("should accept REJECTED status", () => {
            const report = createValidReport({ status: "REJECTED" });
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(true);
        });

        it("should accept NEW status", () => {
            const report = createValidReport({ status: "NEW" });
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(true);
        });
    });

    describe("Required Fields", () => {
        it("should reject missing symbol", () => {
            const report = createValidReport();
            delete (report as Record<string, unknown>).symbol;
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(false);
        });

        it("should reject missing side", () => {
            const report = createValidReport();
            delete (report as Record<string, unknown>).side;
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(false);
        });

        it("should reject missing price", () => {
            const report = createValidReport();
            delete (report as Record<string, unknown>).price;
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(false);
        });

        it("should reject missing qty", () => {
            const report = createValidReport();
            delete (report as Record<string, unknown>).qty;
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(false);
        });

        it("should reject missing status", () => {
            const report = createValidReport();
            delete (report as Record<string, unknown>).status;
            const result = ExecutionReportSchema.safeParse(report);
            expect(result.success).toBe(false);
        });
    });

    describe("Optional Fields", () => {
        it("should allow optional fee fields", () => {
            const report = createValidReport({
                fee: 0.005,
                feeCurrency: "BTC",
            });
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.fee).toBe(0.005);
                expect(result.data.feeCurrency).toBe("BTC");
            }
        });

        it("should allow optional reason", () => {
            const report = createValidReport({
                reason: "Insufficient liquidity",
            });
            const result = ExecutionReportSchema.safeParse(report);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.reason).toBe("Insufficient liquidity");
            }
        });
    });
});
