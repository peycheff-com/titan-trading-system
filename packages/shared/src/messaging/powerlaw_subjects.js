/**
 * @deprecated This file is deprecated. Use `titan_subjects.ts` instead.
 * Kept for backward compatibility during the P0 refactor.
 */
import { TITAN_SUBJECTS } from './titan_subjects.js';
export const POWER_LAW_SUBJECTS = {
    METRICS_V1_BASE: TITAN_SUBJECTS.LEGACY.SIGNAL_POWERLAW_METRICS_V1,
    metricsV1: (venue, symbol) => `${TITAN_SUBJECTS.LEGACY.SIGNAL_POWERLAW_METRICS_V1}.${venue}.${symbol}`,
    METRICS_V1_ALL: `${TITAN_SUBJECTS.LEGACY.SIGNAL_POWERLAW_METRICS_V1}.>`,
    CONSTRAINTS_V1_BASE: TITAN_SUBJECTS.LEGACY.SIGNAL_EXECUTION_CONSTRAINTS_V1,
    constraintsV1: (venue, account, symbol) => `${TITAN_SUBJECTS.LEGACY.SIGNAL_EXECUTION_CONSTRAINTS_V1}.${venue}.${account}.${symbol}`,
    CONSTRAINTS_V1_ALL: `${TITAN_SUBJECTS.LEGACY.SIGNAL_EXECUTION_CONSTRAINTS_V1}.>`,
    IMPACT_V1: TITAN_SUBJECTS.EVT.POWERLAW.IMPACT,
    LEGACY_SCAVENGER_METRICS: TITAN_SUBJECTS.LEGACY.SCAVENGER_METRICS_WILDCARD,
};
export function isStandardSubject(subject) {
    return (subject.startsWith('titan.cmd.') ||
        subject.startsWith('titan.evt.') ||
        subject.startsWith('titan.data.') ||
        subject.startsWith('titan.sys.'));
}
export const SUBJECT_MIGRATION_MAP = {
    [TITAN_SUBJECTS.LEGACY.SIGNAL_POWERLAW_METRICS_V1]: 'titan.data.powerlaw.metrics.v1',
    [TITAN_SUBJECTS.LEGACY.SIGNAL_EXECUTION_CONSTRAINTS_V1]: 'titan.data.execution.constraints.v1',
    [TITAN_SUBJECTS.LEGACY.SCAVENGER_METRICS_WILDCARD]: 'titan.data.powerlaw.metrics.v1.>',
};
//# sourceMappingURL=powerlaw_subjects.js.map