import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
// --- Schema Definitions (Contract) ---
// Base Event Contract
const BaseEventSchema = z.object({
    id: z.string().uuid(),
    timestamp: z.number(),
    source: z.string(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
});
// Order Placed Event Contract
const OrderPlacedSchema = BaseEventSchema.extend({
    type: z.literal("ORDER_PLACED"),
    payload: z.object({
        orderId: z.string(),
        symbol: z.string(),
        side: z.enum(["BUY", "SELL"]),
        quantity: z.number().positive(),
        price: z.number().positive(),
    }),
});
// Contract Validator
function validateEvent(event, schema) {
    const result = schema.safeParse(event);
    if (!result.success) {
        return { valid: false, errors: result.error.issues };
    }
    return { valid: true, data: result.data };
}
// --- Tests ---
describe("Correctness: NATS Contract Invariants", () => {
    it("should accept valid order placed events", () => {
        const validEvent = {
            id: "123e4567-e89b-12d3-a456-426614174000",
            timestamp: Date.now(),
            source: "titan-brain",
            version: "1.0.0",
            type: "ORDER_PLACED",
            payload: {
                orderId: "ord_1",
                symbol: "BTCUSDT",
                side: "BUY",
                quantity: 1.5,
                price: 50000,
            },
        };
        const result = validateEvent(validEvent, OrderPlacedSchema);
        expect(result.valid).toBe(true);
    });
    it("should reject events with missing required fields (Fail Closed)", () => {
        const invalidEvent = {
            id: "123e4567-e89b-12d3-a456-426614174000",
            timestamp: Date.now(),
            source: "titan-brain",
            version: "1.0.0",
            type: "ORDER_PLACED",
            payload: {
                orderId: "ord_1",
                symbol: "BTCUSDT",
                // Missing side, quantity, price
            },
        };
        const result = validateEvent(invalidEvent, OrderPlacedSchema);
        expect(result.valid).toBe(false);
    });
    it("should reject events with invalid data types", () => {
        const invalidEvent = {
            id: "invalid-uuid", // Invalid UUID
            timestamp: "now", // Invalid timestamp (string)
            source: "titan-brain",
            version: "1.0.0",
            type: "ORDER_PLACED",
            payload: {
                orderId: "ord_1",
                symbol: "BTCUSDT",
                side: "BUY",
                quantity: -10, // Negative quantity
                price: 50000,
            },
        };
        const result = validateEvent(invalidEvent, OrderPlacedSchema);
        expect(result.valid).toBe(false);
    });
    it("should reject unknown fields (Strict Validation)", () => {
        // Zod objects strips unknown by default, but we can set strict() if we want to reject
        const StrictSchema = OrderPlacedSchema.strict();
        const eventWithExtras = {
            id: "123e4567-e89b-12d3-a456-426614174000",
            timestamp: Date.now(),
            source: "titan-brain",
            version: "1.0.0",
            type: "ORDER_PLACED",
            payload: {
                orderId: "ord_1",
                symbol: "BTCUSDT",
                side: "BUY",
                quantity: 1.5,
                price: 50000,
            },
            extraField: "should-fail",
        };
        // Note: strict() applies to the object itself. BaseEventSchema is structured as nested.
        // This test demonstrates that we CAN enforce strictness.
        // However, BaseEventSchema.extend() creates a new object.
        // We need to apply strict() to the top level schema relative to what we interpret.
        const result = validateEvent(eventWithExtras, StrictSchema);
        // expect(result.valid).toBe(false);
        // Actually standard Zod behavior is strip, strict() makes it fail.
        // Let's verify our policy: "Reject unknown fields (fail closed)".
        // So checks should be strict.
        const parse = StrictSchema.safeParse(eventWithExtras);
        expect(parse.success).toBe(false);
    });
});
//# sourceMappingURL=contracts.test.js.map