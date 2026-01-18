import { HawkesProcess } from "../../../src/utils/math/HawkesProcess";

describe("HawkesProcess", () => {
    let hawkes: HawkesProcess;

    beforeEach(() => {
        // mu=1.0, alpha=0.5, beta=1.0
        hawkes = new HawkesProcess(1.0, 0.5, 1.0);
    });

    it("should initialize with base intensity", () => {
        const intensity = hawkes.getIntensity(Date.now() / 1000);
        expect(intensity).toBeCloseTo(1.0);
    });

    it("should jump by alpha on new event", () => {
        const now = 1000;
        const intensity = hawkes.addEvent(now);
        // Intensity AFTER event = mu + (last_val - mu)*decay + alpha
        // Here last_val=mu (initial), so decay term is 0.
        // intensity = mu + alpha = 1.0 + 0.5 = 1.5
        expect(intensity).toBeCloseTo(1.5);
    });

    it("should decay over time", () => {
        const now = 1000;
        hawkes.addEvent(now); // Intensity jumps to 1.5

        // Check intensity 1 second later
        // decay = exp(-beta * dt) = exp(-1.0 * 1.0) = ~0.3678
        // intensity = mu + (1.5 - 1.0) * decay = 1.0 + 0.5 * 0.3678 = 1.1839
        const futureTime = now + 1.0;
        const decayedIntensity = hawkes.getIntensity(futureTime);

        expect(decayedIntensity).toBeLessThan(1.5);
        expect(decayedIntensity).toBeGreaterThan(1.0);
        expect(decayedIntensity).toBeCloseTo(1.0 + 0.5 * Math.exp(-1.0));
    });

    it("should accumulate intensity with rapid events", () => {
        const now = 1000;
        hawkes.addEvent(now); // 1.5
        const intensity2 = hawkes.addEvent(now); // Immediate second event

        // Intensity should be 1.5 + 0.5 = 2.0 (since no time passed for decay)
        expect(intensity2).toBeCloseTo(2.0);
    });

    it("should warn if alpha >= beta (unstable)", () => {
        const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
        new HawkesProcess(1.0, 1.0, 0.5); // alpha > beta
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining("Process may be unstable"),
        );
        consoleSpy.mockRestore();
    });

    it("should prune history correctly", () => {
        // This is a test for internal state, might need to access private or infer from memory
        // For now just ensuring it runs without error over many events
        const start = 1000;
        for (let i = 0; i < 100; i++) {
            hawkes.addEvent(start + i);
        }
        expect(hawkes.getIntensity(start + 101)).toBeGreaterThan(1.0);
    });
});
