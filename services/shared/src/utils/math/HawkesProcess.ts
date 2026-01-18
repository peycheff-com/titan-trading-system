/**
 * HawkesProcess.ts
 *
 * Implements a univariate Hawkes Process (self-exciting point process) to model
 * the arrival rate of events (e.g., trades, orders).
 *
 * Intensity function:
 * λ(t) = μ + Σ α * exp(-β * (t - t_i))
 *
 * Where:
 * - μ (mu): Baseline intensity (background rate)
 * - α (alpha): Excitation parameter (how much intensity jumps per event)
 * - β (beta): Decay parameter (how fast the excitement fades)
 * - t_i: Timestamps of past events
 */
export class HawkesProcess {
    private mu: number;
    private alpha: number;
    private beta: number;
    private history: number[] = [];
    private lastIntensity: number = 0;
    private lastUpdateTime: number = 0;

    /**
     * @param mu Baseline intensity (events per second)
     * @param alpha Excitation jump size
     * @param beta Decay rate (higher = faster decay)
     */
    constructor(mu: number = 1.0, alpha: number = 0.5, beta: number = 1.0) {
        if (alpha >= beta) {
            console.warn(
                `HawkesProcess: Alpha (${alpha}) >= Beta (${beta}). Process may be unstable (explosive).`,
            );
        }
        this.mu = mu;
        this.alpha = alpha;
        this.beta = beta;
    }

    /**
     * Adds a new event at the current time (or specified timestamp)
     * and returns the NEW intensity immediately after the event.
     *
     * @param timestamp Optional timestamp in seconds. Defaults to Date.now() / 1000.
     */
    public addEvent(timestamp?: number): number {
        const t = timestamp || Date.now() / 1000;

        // Calculate intensity JUST BEFORE this event (decayed from last event)
        const intensityPre = this.getIntensity(t);

        // Intensity jumps by alpha
        this.lastIntensity = intensityPre + this.alpha;
        this.lastUpdateTime = t;
        this.history.push(t);

        // Prune history to keep calculation efficient (events older than 10/beta typically have negligible impact)
        this.pruneHistory(t);

        return this.lastIntensity;
    }

    /**
     * Calculates the current intensity at time t without adding an event.
     */
    public getIntensity(t: number = Date.now() / 1000): number {
        if (this.lastUpdateTime === 0) return this.mu;

        const dt = t - this.lastUpdateTime;
        if (dt < 0) return this.lastIntensity; // Should not happen if time moves forward

        // Recursive formula: λ(t) = μ + (λ(t_last) - μ) * exp(-β * dt)
        // Actually, strictly speaking, the recursive form tracks the "excited" part.
        // Let E(t) be the excited component.
        // E(t) = E(t_last) * exp(-β * dt)
        // If t_last was an event time, E(t_last) includes the +alpha jump.

        // We store 'lastIntensity' which is λ(t_last) right after the jump.
        // So: λ(t) = μ + (lastIntensity - μ) * exp(-β * dt)

        const decay = Math.exp(-this.beta * dt);
        return this.mu + (this.lastIntensity - this.mu) * decay;
    }

    /**
     * Returns the branching ratio (n = alpha / beta).
     * n < 1: Sub-critical (stationary)
     * n = 1: Critical
     * n > 1: Super-critical (explosive)
     */
    public getBranchingRatio(): number {
        return this.alpha / this.beta;
    }

    private pruneHistory(now: number) {
        // Drop events where exp(-beta * (now - t)) is very small (< 0.001)
        // -beta * (now - t) < ln(0.001) ≈ -6.9
        // now - t > 6.9 / beta
        const threshold = 7.0 / this.beta;
        const cutoff = now - threshold;

        // Remove old events (though we don't strictly use history for the recursive calculation,
        // keeping it might be useful for other metrics, but let's keep it clean)
        // Ideally we don't even need 'history' array for the O(1) recursive update,
        // but we keep it if we ever need to re-calibrate.
        // For this O(1) implementation, strict pruning isn't critical for performance,
        // but 'history' array growing forever IS a memory leak.

        while (this.history.length > 0 && this.history[0] < cutoff) {
            this.history.shift();
        }
    }

    public reset(): void {
        this.history = [];
        this.lastIntensity = 0;
        this.lastUpdateTime = 0;
    }
}
