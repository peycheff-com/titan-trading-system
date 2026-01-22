import {
    DefconLevel,
    GovernanceEngine,
} from "../../src/engine/GovernanceEngine";
import { Logger } from "../../src/logging/Logger";

// Mock Logger
jest.mock("../../src/logging/Logger", () => {
    return {
        Logger: {
            getInstance: jest.fn().mockReturnValue({
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            }),
        },
    };
});

describe("Canary/Rollback Logic (GovernanceEngine)", () => {
    let governance: GovernanceEngine;

    beforeEach(() => {
        governance = new GovernanceEngine();
    });

    it("should start in NORMAL state", () => {
        expect(governance.getDefconLevel()).toBe(DefconLevel.NORMAL);
    });

    it("should degrading to CAUTION on high latency (Soft Canary)", () => {
        // Latency > 300ms but < 1000ms triggers CAUTION
        governance.updateHealth({
            latency_ms: 400,
            error_rate_5m: 0.0,
            drawdown_pct: 1.0,
        });

        expect(governance.getDefconLevel()).toBe(DefconLevel.CAUTION);
    });

    it("should rollback to DEFENSIVE on severe latency (Hard Canary failure)", () => {
        // Latency > 1000ms triggers DEFENSIVE
        governance.updateHealth({
            latency_ms: 1200,
            error_rate_5m: 0.0,
            drawdown_pct: 1.0,
        });

        expect(governance.getDefconLevel()).toBe(DefconLevel.DEFENSIVE);
    });

    it("should rollback to DEFENSIVE on high error rate", () => {
        // Error rate > 5% triggers DEFENSIVE
        governance.updateHealth({
            latency_ms: 50,
            error_rate_5m: 0.06,
            drawdown_pct: 1.0,
        });

        expect(governance.getDefconLevel()).toBe(DefconLevel.DEFENSIVE);
    });

    it("should recover to NORMAL when health improves", () => {
        // First degrade
        governance.updateHealth({
            latency_ms: 1200,
            error_rate_5m: 0.0,
            drawdown_pct: 1.0,
        });
        expect(governance.getDefconLevel()).toBe(DefconLevel.DEFENSIVE);

        // Then recover
        governance.updateHealth({
            latency_ms: 50,
            error_rate_5m: 0.0,
            drawdown_pct: 1.0,
        });
        expect(governance.getDefconLevel()).toBe(DefconLevel.NORMAL);
    });

    it("should trigger EMERGENCY on extreme conditions", () => {
        governance.updateHealth({
            latency_ms: 50,
            error_rate_5m: 0.25, // 25% error rate
            drawdown_pct: 1.0,
        });
        expect(governance.getDefconLevel()).toBe(DefconLevel.EMERGENCY);
    });
});
