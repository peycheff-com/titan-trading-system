/**
 * @deprecated This file is deprecated. Use `titan_subjects.ts` instead.
 * Kept for backward compatibility during the P0 refactor.
 */
export declare const POWER_LAW_SUBJECTS: {
    readonly METRICS_V1_BASE: "titan.signal.powerlaw.metrics.v1";
    readonly metricsV1: (venue: string, symbol: string) => string;
    readonly METRICS_V1_ALL: "titan.signal.powerlaw.metrics.v1.>";
    readonly CONSTRAINTS_V1_BASE: "titan.signal.execution.constraints.v1";
    readonly constraintsV1: (venue: string, account: string, symbol: string) => string;
    readonly CONSTRAINTS_V1_ALL: "titan.signal.execution.constraints.v1.>";
    readonly IMPACT_V1: "titan.evt.powerlaw.impact.v1";
    readonly LEGACY_SCAVENGER_METRICS: "powerlaw.metrics.>";
};
export declare function isStandardSubject(subject: string): boolean;
export declare const SUBJECT_MIGRATION_MAP: {
    readonly "titan.signal.powerlaw.metrics.v1": "titan.data.powerlaw.metrics.v1";
    readonly "titan.signal.execution.constraints.v1": "titan.data.execution.constraints.v1";
    readonly "powerlaw.metrics.>": "titan.data.powerlaw.metrics.v1.>";
};
//# sourceMappingURL=powerlaw_subjects.d.ts.map