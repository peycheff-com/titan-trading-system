/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * Standardized Health Check System
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: HealthStatus;
  message?: string;
  latency?: number; // ms
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface ComponentHealth {
  name: string;
  check: () => Promise<HealthCheckResult>;
  critical: boolean; // If true, component failure marks the whole service unhealthy
}

export class HealthMonitor {
  private components: ComponentHealth[] = [];

  public registerComponent(component: ComponentHealth): void {
    this.components.push(component);
  }

  public async checkHealth(): Promise<{
    status: HealthStatus;
    uptime: number;
    components: Record<string, HealthCheckResult>;
  }> {
    const results: Record<string, HealthCheckResult> = {};
    let overallStatus: HealthStatus = 'healthy';

    await Promise.all(
      this.components.map(async (comp) => {
        try {
          const start = Date.now();
          const result = await comp.check();
          const latency = Date.now() - start;

          results[comp.name] = {
            ...result,
            latency,
          };

          if (comp.critical && result.status === 'unhealthy') {
            overallStatus = 'unhealthy';
          } else if (result.status === 'unhealthy' && overallStatus !== 'unhealthy') {
            overallStatus = 'degraded';
          } else if (comp.critical && result.status === 'degraded' && overallStatus === 'healthy') {
            overallStatus = 'degraded';
          }
        } catch (err: unknown) {
          results[comp.name] = {
            status: 'unhealthy',
            message: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          };
          if (comp.critical) overallStatus = 'unhealthy';
          else if (overallStatus !== 'unhealthy') {
            overallStatus = 'degraded';
          }
        }
      }),
    );

    return {
      status: overallStatus,
      uptime: process.uptime(),
      components: results,
    };
  }
}
