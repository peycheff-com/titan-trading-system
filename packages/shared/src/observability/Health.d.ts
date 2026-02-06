/**
 * Standardized Health Check System
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export interface HealthCheckResult {
    status: HealthStatus;
    message?: string;
    latency?: number;
    details?: Record<string, any>;
    timestamp: string;
}
export interface ComponentHealth {
    name: string;
    check: () => Promise<HealthCheckResult>;
    critical: boolean;
}
export declare class HealthMonitor {
    private components;
    registerComponent(component: ComponentHealth): void;
    checkHealth(): Promise<{
        status: HealthStatus;
        uptime: number;
        components: Record<string, HealthCheckResult>;
    }>;
}
//# sourceMappingURL=Health.d.ts.map