/**
 * Global Risk State Enum
 * Defines the operational risk posture of the system.
 */
export var RiskState;
(function (RiskState) {
    /** Standard limits apply. Normal trading. */
    RiskState["NORMAL"] = "Normal";
    /** Reduced leverage, tighter validation. */
    RiskState["CAUTIOUS"] = "Cautious";
    /** Reduce-only mode. New positions rejected. */
    RiskState["DEFENSIVE"] = "Defensive";
    /** Full halt. Cancel all open orders. */
    RiskState["EMERGENCY"] = "Emergency";
})(RiskState || (RiskState = {}));
//# sourceMappingURL=RiskState.js.map