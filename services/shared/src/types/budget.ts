/**
 * Budget Types for Titan Allocator
 * Defines the contract for Risk Budgets issued by Brain to Phases.
 */

export enum BudgetState {
    ACTIVE = "ACTIVE", // Normal operation
    THROTTLED = "THROTTLED", // Reduced limits due to uncertainty/lag/slippage
    HALTED = "HALTED", // No new risk allowed
    CLOSE_ONLY = "CLOSE_ONLY", // Only reducing risk allowed
}

/**
 * A Risk Budget issued to a specific Phase (1, 2, or 3)
 * Use strictly typed fields to ensure deterministic serialization.
 */
export interface PhaseBudget {
    /** The phase ID this budget is for (e.g., "phase1", "phase2") */
    phaseId: string;

    /** Unique ID for this budget issuance (for traceability) */
    budgetId: string;

    /** Timestamp when this budget was issued */
    timestamp: number;

    /** Timestamp when this budget expires (Phases MUST stop if current > expiry) */
    expiresAt: number;

    /** Current Operational State */
    state: BudgetState;

    /** Maximum Total Notional (USD) allowed for this phase */
    maxNotional: number;

    /** Maximum Leverage (Notional / Equity) allowed for this phase specific positions */
    maxLeverage: number;

    /** Maximum Drawdown (USD) allowed in the current window (usually 24h) */
    maxDrawdown: number;

    /** Maximum number of orders per minute (Rate Limit) */
    maxOrderRate: number;

    /** Reason for the current budget parameters (Explainability) */
    reason: string;
}

/**
 * Execution Quality Report
 * Feedback from Execution Engine to Brain to inform Budget decisions.
 */
export interface ExecutionQualityReport {
    timestamp: number;

    /** Average Slippage in Basis Points (last window) */
    avgSlippageBps: number;

    /** Fill Rate (Fills / Orders) (0.0 to 1.0) */
    fillRate: number;

    /** Reject Rate (Rejects / Orders) (0.0 to 1.0) */
    rejectRate: number;

    /** Average End-to-End Latency in ms */
    latencyMs: number;
}
