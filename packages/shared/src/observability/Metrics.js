/**
 * Standardized Metrics Collector
 *
 * Provides a unified interface for recording metrics (counters, gauges, histograms).
 * Currently in-memory, but designed to easily swap in Prometheus or OTel SDKs.
 */
export class MetricsCollector {
    static instance;
    metrics = [];
    // Simple aggregation map for gauges
    gauges = new Map();
    constructor() { }
    static getInstance() {
        if (!MetricsCollector.instance) {
            MetricsCollector.instance = new MetricsCollector();
        }
        return MetricsCollector.instance;
    }
    /**
     * Record a counter increment (monotonic).
     */
    increment(name, value = 1, tags = {}) {
        this.record({ name, value, tags, timestamp: Date.now() });
    }
    /**
     * Record a gauge value (point in time).
     */
    gauge(name, value, tags = {}) {
        const key = this.getGaugeKey(name, tags);
        this.gauges.set(key, value);
        this.record({ name, value, tags, timestamp: Date.now() });
    }
    /**
     * Record a histogram/timer value (distribution).
     */
    histogram(name, value, tags = {}) {
        this.record({ name, value, tags, timestamp: Date.now() });
    }
    record(metric) {
        // In a real production setup, this would push to a TSDB or OTel collector.
        // For now, we keep a small buffer or just log/emit.
        // To prevent memory leaks in this in-memory implementation, we'll limit the buffer.
        if (this.metrics.length > 1000) {
            this.metrics.shift();
        }
        this.metrics.push(metric);
    }
    getGaugeKey(name, tags) {
        const tagStr = Object.entries(tags)
            .sort()
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        return `${name}{${tagStr}}`;
    }
    /**
     * Get current values (snapshot).
     */
    getSnapshot() {
        return {
            metrics: [...this.metrics],
            gauges: Object.fromEntries(this.gauges),
        };
    }
    /**
     * Clear in-memory metrics (useful for tests or periodic flushes).
     */
    clear() {
        this.metrics = [];
        this.gauges.clear();
    }
}
export const metrics = MetricsCollector.getInstance();
//# sourceMappingURL=Metrics.js.map