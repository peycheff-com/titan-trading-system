import { describe, expect, it } from "@jest/globals";

// Simulation of Reconciliation Logic
class ReconciliationEngine {
    private confidence = 1.0;
    private driftThreshold = 0.05; // 5% drift tolerance

    reconcile(brainState: number, exchangeState: number) {
        const drift = Math.abs(brainState - exchangeState) /
            Math.abs(brainState || 1); // Avoid div/0

        if (drift > this.driftThreshold) {
            this.decayConfidence(drift);
            return { action: "VETO", drift, confidence: this.confidence };
        }

        this.recoverConfidence();
        return { action: "CONFIRM", drift, confidence: this.confidence };
    }

    private decayConfidence(drift: number) {
        // Decay proportional to drift, min 0
        this.confidence = Math.max(0, this.confidence - (drift * 2));
    }

    private recoverConfidence() {
        // Slower recovery
        this.confidence = Math.min(1.0, this.confidence + 0.01);
    }

    getSystemStatus() {
        if (this.confidence < 0.5) return "HALT";
        if (this.confidence < 0.8) return "DEGRADED";
        return "HEALTHY";
    }
}

describe("Correctness: Reconciliation Invariants", () => {
    it("should maintain established confidence when drift is zero", () => {
        const engine = new ReconciliationEngine();
        const result = engine.reconcile(100, 100);

        expect(result.action).toBe("CONFIRM");
        expect(result.drift).toBe(0);
        expect(result.confidence).toBe(1.0);
        expect(engine.getSystemStatus()).toBe("HEALTHY");
    });

    it("should trigger VETO and decay confidence on significant drift", () => {
        const engine = new ReconciliationEngine();
        // Brain thinks 100, Exchange has 90 (10% drift)
        const result = engine.reconcile(100, 90);

        expect(result.action).toBe("VETO");
        expect(result.drift).toBeCloseTo(0.1);
        // Confidence should drop: 1.0 - (0.1 * 2) = 0.8
        expect(result.confidence).toBeCloseTo(0.8);
    });

    it("should halt system if drift persists/compounds", () => {
        const engine = new ReconciliationEngine();

        // Series of bad reconciliations
        engine.reconcile(100, 80); // 20% drift -> conf 0.6
        engine.reconcile(100, 70); // 30% drift -> conf 0.6 - 0.6 = 0

        const status = engine.getSystemStatus();
        expect(status).toBe("HALT");
    });

    it("should recover confidence slowly after clean reconciliation", () => {
        const engine = new ReconciliationEngine();

        // Induce some damage
        engine.reconcile(100, 90); // Conf 0.8

        // Clean run
        engine.reconcile(100, 100); // +0.01 -> 0.81

        expect(engine.reconcile(100, 100).confidence).toBeCloseTo(0.82);
    });
});
