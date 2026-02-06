import { z } from 'zod';
/**
 * Global System Health State
 * Defines the operational mode of the entire Titan system.
 */
export var SystemState;
(function (SystemState) {
    /** Normal operation. All trading allowed. */
    SystemState["Open"] = "OPEN";
    /**
     * Soft Halt / Degradation.
     * New risk checks strictly enforced or blocked.
     * Existing positions can be managed/closed.
     * Used for: High Latency, Data Gaps, Minor Drift.
     */
    SystemState["SoftHalt"] = "SOFT_HALT";
    /**
     * Emergency Hard Halt.
     * SYSTEM WIDE STOP.
     * Execution Engine rejects ALL new signals.
     * Manual intervention required to unlock.
     * Used for: Solvency Violation, Insolvency Risk, Security Breach.
     */
    SystemState["HardHalt"] = "HARD_HALT";
})(SystemState || (SystemState = {}));
export const SystemStateSchema = z.nativeEnum(SystemState);
//# sourceMappingURL=SystemState.js.map