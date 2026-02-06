/**
 * Phase Service Types
 * Defines the standard message structures for Phase engines (Scavenger, Hunter, Sentinel).
 */
export type PhaseStatus = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'STARTING';
export interface PhasePosture {
    phase: string;
    status: PhaseStatus;
    regime: string;
    metrics: Record<string, unknown>;
    timestamp: number;
}
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
export interface PhaseDiagnostics {
    phase: string;
    health: HealthStatus;
    alerts: string[];
    system: {
        memory: {
            rss: number;
            heapTotal: number;
            heapUsed: number;
            external: number;
            arrayBuffers?: number;
        };
        uptime: number;
        cpu?: number;
    };
    timestamp: number;
}
//# sourceMappingURL=Phase.d.ts.map