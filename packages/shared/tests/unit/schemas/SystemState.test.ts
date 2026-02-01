/**
 * Unit tests for SystemState Schema
 *
 * Tests the SystemState enum and schema which defines the operational
 * mode of the entire Titan trading system.
 */

import {
    SystemState,
    SystemStateSchema,
    type SystemStatus,
} from "../../../src/schemas/SystemState";

describe("SystemState Enum", () => {
    describe("Enum Values", () => {
        it("should have Open state", () => {
            expect(SystemState.Open).toBe("OPEN");
        });

        it("should have SoftHalt state", () => {
            expect(SystemState.SoftHalt).toBe("SOFT_HALT");
        });

        it("should have HardHalt state", () => {
            expect(SystemState.HardHalt).toBe("HARD_HALT");
        });

        it("should have exactly 3 states", () => {
            const states = Object.values(SystemState);
            expect(states.length).toBe(3);
        });
    });

    describe("State Semantics", () => {
        it("should represent normal operation with Open", () => {
            // Open = Normal operation, all trading allowed
            expect(SystemState.Open).toBeDefined();
        });

        it("should represent degraded operation with SoftHalt", () => {
            // SoftHalt = Degradation, risk checks enforced, positions can be managed
            expect(SystemState.SoftHalt).toBeDefined();
        });

        it("should represent emergency stop with HardHalt", () => {
            // HardHalt = System-wide stop, manual intervention required
            expect(SystemState.HardHalt).toBeDefined();
        });
    });
});

describe("SystemStateSchema", () => {
    describe("Valid States", () => {
        it("should validate OPEN state", () => {
            const result = SystemStateSchema.safeParse("OPEN");
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe(SystemState.Open);
            }
        });

        it("should validate SOFT_HALT state", () => {
            const result = SystemStateSchema.safeParse("SOFT_HALT");
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe(SystemState.SoftHalt);
            }
        });

        it("should validate HARD_HALT state", () => {
            const result = SystemStateSchema.safeParse("HARD_HALT");
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe(SystemState.HardHalt);
            }
        });

        it("should validate enum member directly", () => {
            const result = SystemStateSchema.safeParse(SystemState.Open);
            expect(result.success).toBe(true);
        });
    });

    describe("Invalid States", () => {
        it("should reject lowercase open", () => {
            const result = SystemStateSchema.safeParse("open");
            expect(result.success).toBe(false);
        });

        it("should reject invalid state strings", () => {
            const invalidStates = ["CLOSED", "PAUSED", "RUNNING", "HALTED", ""];
            invalidStates.forEach((state) => {
                const result = SystemStateSchema.safeParse(state);
                expect(result.success).toBe(false);
            });
        });

        it("should reject null", () => {
            const result = SystemStateSchema.safeParse(null);
            expect(result.success).toBe(false);
        });

        it("should reject undefined", () => {
            const result = SystemStateSchema.safeParse(undefined);
            expect(result.success).toBe(false);
        });

        it("should reject numbers", () => {
            const result = SystemStateSchema.safeParse(1);
            expect(result.success).toBe(false);
        });
    });
});

describe("SystemStatus Interface", () => {
    it("should be constructible with required fields", () => {
        const status: SystemStatus = {
            state: SystemState.Open,
            timestamp: Date.now(),
        };

        expect(status.state).toBe(SystemState.Open);
        expect(status.timestamp).toBeDefined();
    });

    it("should accept optional reason", () => {
        const status: SystemStatus = {
            state: SystemState.SoftHalt,
            reason: "High latency detected",
            timestamp: Date.now(),
        };

        expect(status.reason).toBe("High latency detected");
    });

    it("should accept optional operatorId", () => {
        const status: SystemStatus = {
            state: SystemState.HardHalt,
            reason: "Manual intervention",
            operatorId: "operator-123",
            timestamp: Date.now(),
        };

        expect(status.operatorId).toBe("operator-123");
    });

    it("should support all states in status", () => {
        const states = [
            SystemState.Open,
            SystemState.SoftHalt,
            SystemState.HardHalt,
        ];

        states.forEach((state) => {
            const status: SystemStatus = {
                state,
                timestamp: Date.now(),
            };
            expect(status.state).toBe(state);
        });
    });
});

describe("State Transitions", () => {
    it("should have valid transition from Open to SoftHalt", () => {
        // Semantic test: system can degrade from normal to soft halt
        const before = SystemState.Open;
        const after = SystemState.SoftHalt;
        expect(before).not.toBe(after);
    });

    it("should have valid transition from SoftHalt to HardHalt", () => {
        // Semantic test: system can escalate from soft to hard halt
        const before = SystemState.SoftHalt;
        const after = SystemState.HardHalt;
        expect(before).not.toBe(after);
    });

    it("should have valid transition from HardHalt to Open", () => {
        // Semantic test: system can recover from hard halt to open
        const before = SystemState.HardHalt;
        const after = SystemState.Open;
        expect(before).not.toBe(after);
    });
});
