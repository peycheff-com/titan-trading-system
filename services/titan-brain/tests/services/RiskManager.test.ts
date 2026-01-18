import { RiskManager } from "../../src/services/RiskManager";
import { ConfigManager } from "../../src/config/ConfigManager";
import { BrainConfig } from "../../src/config/BrainConfig";

// Mock ConfigManager
const mockConfig: BrainConfig = {
    nodeEnv: "test",
    risk: {
        maxLeverage: 10,
        fatTailBuffer: 0.3, // 30% reduction
        tailIndexThreshold: 2.5,
        maxImpactBps: 20,
    },
} as any; // Cast to avoid mocking entire config

const configManagerMock = {
    getConfig: jest.fn().mockReturnValue(mockConfig),
} as unknown as ConfigManager;

describe("RiskManager", () => {
    let riskManager: RiskManager;

    beforeEach(() => {
        riskManager = new RiskManager(configManagerMock);
    });

    it("should initialize with safe state", () => {
        const state = riskManager.getCurrentState();
        expect(state.tailIndex).toBe(3.0);
        expect(state.volatilityRegime).toBe("NORMAL");
    });

    describe("getSafeLeverage", () => {
        it("should return base leverage when conditions represent thin tails", () => {
            riskManager.updateRiskState({ tailIndex: 3.6 });
            // Base 5, Max 10. 3.6 > 3.5 -> Safe
            expect(riskManager.getSafeLeverage(5)).toBe(5);
        });

        it("should cap at maxLeverage from config", () => {
            riskManager.updateRiskState({ tailIndex: 3.6 });
            // Base 12, Max 10
            expect(riskManager.getSafeLeverage(12)).toBe(10);
        });

        it("should penalize leverage when in Fat Tail zone (alpha < 2.5)", () => {
            riskManager.updateRiskState({ tailIndex: 2.4 });
            // Base 10. Buffer 0.3.
            // Result = 10 * (1 - 0.3) = 7
            expect(riskManager.getSafeLeverage(10)).toBe(7);
        });

        it("should strictly cap leverage when tails are dangerous (alpha < 2.0)", () => {
            riskManager.updateRiskState({ tailIndex: 1.8 });
            // Dangerous! Max is 2x.
            // Base 10 -> Cap at 2.
            expect(riskManager.getSafeLeverage(10)).toBe(2);
        });
    });

    describe("getPositionSizeMultiplier", () => {
        it("should return 1.0 for NORMAL regime", () => {
            riskManager.updateRiskState({ volatilityRegime: "NORMAL" });
            expect(riskManager.getPositionSizeMultiplier()).toBe(1.0);
        });

        it("should halve size for HIGH regime", () => {
            riskManager.updateRiskState({ volatilityRegime: "HIGH" });
            expect(riskManager.getPositionSizeMultiplier()).toBe(0.5);
        });

        it("should quarter size for EXTREME regime", () => {
            riskManager.updateRiskState({ volatilityRegime: "EXTREME" });
            expect(riskManager.getPositionSizeMultiplier()).toBe(0.25);
        });

        it("should apply additional penalty for very low alpha", () => {
            riskManager.updateRiskState({
                volatilityRegime: "HIGH", // 0.5
                tailIndex: 2.1, // < 2.2 -> additional 0.5 penalty
            });
            // 0.5 * 0.5 = 0.25
            expect(riskManager.getPositionSizeMultiplier()).toBe(0.25);
        });
    });

    describe("isImpactAllowed", () => {
        it("should allow impact below max", () => {
            // maxImpactBps is 20 in mock
            expect(riskManager.isImpactAllowed(10)).toBe(true);
        });

        it("should reject impact above max", () => {
            expect(riskManager.isImpactAllowed(21)).toBe(false);
        });
    });
});
