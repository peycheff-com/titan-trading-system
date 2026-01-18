import { OrderFlowImbalanceCalculator } from "../../src/calculators/OrderFlowImbalanceCalculator";
describe("OrderFlowImbalanceCalculator", () => {
    let calculator;
    beforeEach(() => {
        calculator = new OrderFlowImbalanceCalculator(10);
    });
    test("should initialize with 0 OFI", () => {
        const ofi = calculator.update(100, 10, 101, 10);
        expect(ofi).toBe(0);
        expect(calculator.getSmoothedOFI()).toBe(0);
    });
    test("should detect buying pressure (Bid Price Increase)", () => {
        // T0
        calculator.update(100, 10, 101, 10);
        // T1: Bid improves to 100.5 (New aggressive buy)
        const ofi = calculator.update(100.5, 5, 101, 10);
        // OFI += BidSize (5)
        expect(ofi).toBe(5);
        expect(calculator.getSmoothedOFI()).toBeGreaterThan(0);
    });
    test("should detect selling pressure (Ask Price Decrease)", () => {
        // T0
        calculator.update(100, 10, 101, 10);
        // T1: Ask drops to 100.5 (Aggressive sell)
        const ofi = calculator.update(100, 10, 100.5, 5);
        // Ask Contribution = AskSize (5). OFI = 0 - 5 = -5.
        expect(ofi).toBe(-5);
    });
    test("should handle size changes at same level (Bid Addition)", () => {
        // T0
        calculator.update(100, 10, 101, 10);
        // T1: Bid size increases to 15 (Passive buy added)
        const ofi = calculator.update(100, 15, 101, 10);
        // OFI = NewSize - OldSize = 15 - 10 = 5.
        expect(ofi).toBe(5);
    });
});
//# sourceMappingURL=OrderFlowImbalanceCalculator.test.js.map