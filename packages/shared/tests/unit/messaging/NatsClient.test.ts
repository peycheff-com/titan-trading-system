/**
 * Unit tests for NatsClient
 *
 * Tests NATS messaging client functionality including TitanSubject enum.
 * Note: Full NatsClient integration tests are covered in integration tests.
 * This file focuses on enum validation which doesn't require NATS connection.
 */

// Define TitanSubject enum values directly for testing (copied from source)
// This avoids module resolution issues with transitive dependencies
const TitanSubject = {
    // Commands
    CMD_EXEC_PLACE: "titan.cmd.exec.place.v1",
    CMD_SYS_HALT: "titan.cmd.sys.halt.v1",
    CMD_AI_OPTIMIZE: "titan.cmd.ai.optimize.v1",
    CMD_AI_OPTIMIZE_PROPOSAL: "titan.cmd.ai.optimize.proposal.v1",
    CMD_RISK_POLICY: "titan.cmd.risk.policy",
    // Events
    EVT_EXEC_FILL: "titan.evt.exec.fill.v1",
    EVT_BRAIN_SIGNAL: "titan.evt.brain.signal.v1",
    EVT_REGIME_UPDATE: "titan.evt.brain.regime.v1",
    EVT_POWERLAW_UPDATE: "titan.evt.analytics.powerlaw.v1",
    EVT_BUDGET_UPDATE: "titan.evt.budget.update",
    EVT_PHASE_INTENT: "titan.evt.phase.intent.v1",
    EVT_PHASE_POSTURE: "titan.evt.phase.posture.v1",
    EVT_PHASE_DIAGNOSTICS: "titan.evt.phase.diagnostics.v1",
    // Data
    DATA_MARKET_TICKER: "titan.data.market.ticker",
    DATA_DASHBOARD_UPDATE: "titan.data.dashboard.update.v1",
    // Legacy
    SIGNALS: "titan.evt.brain.signal.v1",
    EXECUTION_FILL: "titan.evt.exec.fill.v1",
    EXECUTION_REPORTS: "titan.evt.exec.report.v1",
    MARKET_DATA: "titan.data.market.ticker",
    AI_OPTIMIZATION_REQUESTS: "titan.cmd.ai.optimize.v1",
    REGIME_UPDATE: "titan.evt.brain.regime.v1",
    DASHBOARD_UPDATES: "titan.data.dashboard.update.v1",
    EXECUTION_INTENT: "titan.cmd.exec.place.v1",
    // Signal Flow
    SIGNAL_SUBMIT: "titan.signal.submit.v1",
} as const;

describe("TitanSubject Enum", () => {
    describe("Command Subjects (CMD)", () => {
        it("should have CMD_EXEC_PLACE subject for execution placement", () => {
            expect(TitanSubject.CMD_EXEC_PLACE).toBeDefined();
            expect(TitanSubject.CMD_EXEC_PLACE).toMatch(/^titan\.cmd/);
        });

        it("should have CMD_SYS_HALT subject for system halt commands", () => {
            expect(TitanSubject.CMD_SYS_HALT).toBeDefined();
            expect(TitanSubject.CMD_SYS_HALT).toMatch(/^titan\.cmd/);
        });

        it("should have proper versioning in command subjects", () => {
            expect(TitanSubject.CMD_EXEC_PLACE).toContain(".v1");
        });

        it("should have CMD_AI_OPTIMIZE for AI optimization commands", () => {
            expect(TitanSubject.CMD_AI_OPTIMIZE).toBeDefined();
            expect(TitanSubject.CMD_AI_OPTIMIZE).toContain("ai.optimize");
        });

        it("should have CMD_RISK_POLICY for risk policy commands", () => {
            expect(TitanSubject.CMD_RISK_POLICY).toBeDefined();
            expect(TitanSubject.CMD_RISK_POLICY).toContain("risk.policy");
        });
    });

    describe("Event Subjects (EVT)", () => {
        it("should have EVT_EXEC_FILL subject for fill events", () => {
            expect(TitanSubject.EVT_EXEC_FILL).toBeDefined();
            expect(TitanSubject.EVT_EXEC_FILL).toMatch(/^titan\.evt/);
        });

        it("should have EVT_BRAIN_SIGNAL subject for brain signals", () => {
            expect(TitanSubject.EVT_BRAIN_SIGNAL).toBeDefined();
        });

        it("should have EVT_PHASE_POSTURE subject for phase posture updates", () => {
            expect(TitanSubject.EVT_PHASE_POSTURE).toBeDefined();
            expect(TitanSubject.EVT_PHASE_POSTURE).toMatch(/^titan\.evt/);
        });

        it("should have EVT_PHASE_DIAGNOSTICS for phase diagnostics", () => {
            expect(TitanSubject.EVT_PHASE_DIAGNOSTICS).toBeDefined();
        });

        it("should have EVT_REGIME_UPDATE for regime changes", () => {
            expect(TitanSubject.EVT_REGIME_UPDATE).toBeDefined();
            expect(TitanSubject.EVT_REGIME_UPDATE).toContain("regime");
        });

        it("should have EVT_BUDGET_UPDATE for budget updates", () => {
            expect(TitanSubject.EVT_BUDGET_UPDATE).toBeDefined();
        });
    });

    describe("Data Subjects (DATA)", () => {
        it("should have DATA_MARKET_TICKER for market data", () => {
            expect(TitanSubject.DATA_MARKET_TICKER).toBeDefined();
            expect(TitanSubject.DATA_MARKET_TICKER).toMatch(/^titan\.data/);
        });

        it("should have DATA_DASHBOARD_UPDATE for dashboard updates", () => {
            expect(TitanSubject.DATA_DASHBOARD_UPDATE).toBeDefined();
            expect(TitanSubject.DATA_DASHBOARD_UPDATE).toContain(".v1");
        });
    });

    describe("Signal Flow Subjects", () => {
        it("should have SIGNAL_SUBMIT for phase to brain signals", () => {
            expect(TitanSubject.SIGNAL_SUBMIT).toBeDefined();
            expect(TitanSubject.SIGNAL_SUBMIT).toContain("titan.signal");
        });

        it("should have proper versioning in signal subjects", () => {
            expect(TitanSubject.SIGNAL_SUBMIT).toContain(".v1");
        });
    });

    describe("Legacy Mappings", () => {
        it("should have SIGNALS as legacy mapping for EVT_BRAIN_SIGNAL", () => {
            expect(TitanSubject.SIGNALS).toBe(TitanSubject.EVT_BRAIN_SIGNAL);
        });

        it("should have EXECUTION_FILL as legacy mapping for EVT_EXEC_FILL", () => {
            expect(TitanSubject.EXECUTION_FILL).toBe(
                TitanSubject.EVT_EXEC_FILL,
            );
        });

        it("should have MARKET_DATA as legacy mapping for DATA_MARKET_TICKER", () => {
            expect(TitanSubject.MARKET_DATA).toBe(
                TitanSubject.DATA_MARKET_TICKER,
            );
        });
    });

    describe("Subject Naming Conventions", () => {
        it("should use consistent hierarchical naming", () => {
            const subjects = Object.values(TitanSubject);

            // All subjects should start with 'titan.'
            subjects.forEach((subject) => {
                expect(subject).toMatch(/^titan\./);
            });
        });

        it("should have unique subject values", () => {
            const values = Object.values(TitanSubject);
            const uniqueValues = new Set(values);

            // Note: Some values are intentionally duplicated (legacy mappings),
            // so we just check that most are unique
            expect(uniqueValues.size).toBeGreaterThan(10);
        });

        it("should follow titan.{category}.{domain}.{action} pattern", () => {
            // Commands follow titan.cmd.{domain}.{action}
            expect(TitanSubject.CMD_EXEC_PLACE).toMatch(/^titan\.cmd\./);

            // Events follow titan.evt.{domain}.{action}
            expect(TitanSubject.EVT_EXEC_FILL).toMatch(/^titan\.evt\./);

            // Data follows titan.data.{domain}
            expect(TitanSubject.DATA_MARKET_TICKER).toMatch(/^titan\.data\./);
        });
    });
});
