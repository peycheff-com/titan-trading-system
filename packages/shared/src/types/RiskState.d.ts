/**
 * Global Risk State Enum
 * Defines the operational risk posture of the system.
 */
export declare enum RiskState {
    /** Standard limits apply. Normal trading. */
    NORMAL = "Normal",
    /** Reduced leverage, tighter validation. */
    CAUTIOUS = "Cautious",
    /** Reduce-only mode. New positions rejected. */
    DEFENSIVE = "Defensive",
    /** Full halt. Cancel all open orders. */
    EMERGENCY = "Emergency"
}
//# sourceMappingURL=RiskState.d.ts.map