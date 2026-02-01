import {
    DEFAULT_FEE_SCHEDULE,
    FeeScheduleSchema,
    getCanonicalFeeSchedule,
} from "../../../src/schemas/FeeSchedule";

describe("FeeSchedule Schema", () => {
    it("should validate the default fee schedule", () => {
        const result = FeeScheduleSchema.safeParse(DEFAULT_FEE_SCHEDULE);
        expect(result.success).toBe(true);
    });

    it("should reject invalid fee schedules", () => {
        const invalidSchedule = {
            version: "1.0.0",
            lastUpdated: "invalid-date", // Should be number
            exchanges: {},
        };
        const result = FeeScheduleSchema.safeParse(invalidSchedule);
        expect(result.success).toBe(false);
    });

    it("should validate exchange config structure", () => {
        const schedule = getCanonicalFeeSchedule();
        const binance = schedule.exchanges["binance"];
        expect(binance).toBeDefined();
        expect(binance.defaultMakerFeeBps).toBe(2.0);
        expect(binance.defaultTakerFeeBps).toBe(4.0);
    });

    it("should validate nested tiers", () => {
        const schedule = getCanonicalFeeSchedule();
        const bybit = schedule.exchanges["bybit"];
        expect(bybit.tiers).toBeDefined();
        expect(bybit.tiers!.length).toBeGreaterThan(0);
        expect(bybit.tiers![0].tierName).toBe("VIP0");
    });
});
