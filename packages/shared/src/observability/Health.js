/**
 * Standardized Health Check System
 */
export class HealthMonitor {
    components = [];
    registerComponent(component) {
        this.components.push(component);
    }
    async checkHealth() {
        const results = {};
        let overallStatus = 'healthy';
        await Promise.all(this.components.map(async (comp) => {
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
                }
                else if (result.status === 'unhealthy' && overallStatus !== 'unhealthy') {
                    overallStatus = 'degraded';
                }
                else if (comp.critical && result.status === 'degraded' && overallStatus === 'healthy') {
                    overallStatus = 'degraded';
                }
            }
            catch (err) {
                results[comp.name] = {
                    status: 'unhealthy',
                    message: err.message || String(err),
                    timestamp: new Date().toISOString(),
                };
                if (comp.critical)
                    overallStatus = 'unhealthy';
                else if (overallStatus !== 'unhealthy') {
                    overallStatus = 'degraded';
                }
            }
        }));
        return {
            status: overallStatus,
            uptime: process.uptime(),
            components: results,
        };
    }
}
//# sourceMappingURL=Health.js.map