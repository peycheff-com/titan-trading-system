/**
 * Power Law NATS Subject Catalog
 *
 * Centralized catalog of all NATS subjects used by the Power Law system.
 * This is the source of truth for subject naming, ensuring consistency
 * between producers (canonical-powerlaw-service, brain) and consumers
 * (execution-rs, console, phase-services).
 *
 * @audit EvidencePack 2026-01-31: Identified `titan.signal.*` deviation from
 *        standard `titan.cmd/evt/data.*` convention. This catalog documents
 *        current state and provides migration path.
 */

/**
 * Standard subject prefix convention:
 * - titan.cmd.* = Commands (requests)
 * - titan.evt.* = Events (notifications)
 * - titan.data.* = Data streams
 */

export const POWER_LAW_SUBJECTS = {
    // ============ METRICS (From canonical-powerlaw-service) ============

    /**
     * Power Law metrics stream base subject
     * Format: titan.data.powerlaw.metrics.v1.{venue}.{symbol}
     *
     * @current Uses `titan.signal.powerlaw.metrics.v1.*` (legacy)
     * @target  `titan.data.powerlaw.metrics.v1.*`
     */
    METRICS_V1_BASE: "titan.signal.powerlaw.metrics.v1",

    /**
     * Get metrics subject for a specific venue/symbol
     */
    metricsV1: (venue: string, symbol: string): string =>
        `titan.signal.powerlaw.metrics.v1.${venue}.${symbol}`,

    /**
     * Wildcard subscription for all metrics
     */
    METRICS_V1_ALL: "titan.signal.powerlaw.metrics.v1.>",

    // ============ CONSTRAINTS (From titan-brain) ============

    /**
     * Execution constraints stream base subject
     * Format: titan.data.execution.constraints.v1.{venue}.{account}.{symbol}
     *
     * @current Uses `titan.signal.execution.constraints.v1.*` (legacy)
     * @target  `titan.data.execution.constraints.v1.*`
     */
    CONSTRAINTS_V1_BASE: "titan.signal.execution.constraints.v1",

    /**
     * Get constraints subject for a specific venue/account/symbol
     */
    constraintsV1: (venue: string, account: string, symbol: string): string =>
        `titan.signal.execution.constraints.v1.${venue}.${account}.${symbol}`,

    /**
     * Wildcard subscription for all constraints
     */
    CONSTRAINTS_V1_ALL: "titan.signal.execution.constraints.v1.>",

    // ============ EVENTS (From titan-brain) ============

    /**
     * Power Law impact events (regime changes, vetoes)
     * Published when constraints significantly change
     */
    IMPACT_V1: "titan.evt.powerlaw.impact.v1",

    // ============ LEGACY (Phase 1 Scavenger) ============

    /**
     * @deprecated Legacy subject used by titan-phase1-scavenger
     * Should migrate to METRICS_V1_ALL
     */
    LEGACY_SCAVENGER_METRICS: "powerlaw.metrics.>",
} as const;

/**
 * Subject naming convention validator
 */
export function isStandardSubject(subject: string): boolean {
    return (
        subject.startsWith("titan.cmd.") ||
        subject.startsWith("titan.evt.") ||
        subject.startsWith("titan.data.")
    );
}

/**
 * Subject migration map (current → target)
 * For use during gradual migration
 */
export const SUBJECT_MIGRATION_MAP = {
    "titan.signal.powerlaw.metrics.v1": "titan.data.powerlaw.metrics.v1",
    "titan.signal.execution.constraints.v1":
        "titan.data.execution.constraints.v1",
    "powerlaw.metrics.>": "titan.data.powerlaw.metrics.v1.>",
} as const;
