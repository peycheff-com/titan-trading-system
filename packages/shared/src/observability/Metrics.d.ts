/**
 * Standardized Metrics Collector
 *
 * Provides a unified interface for recording metrics (counters, gauges, histograms).
 * Currently in-memory, but designed to easily swap in Prometheus or OTel SDKs.
 */
export interface MetricTag {
    [key: string]: string | number;
}
export interface MetricValue {
    name: string;
    value: number;
    tags: MetricTag;
    timestamp: number;
}
export declare class MetricsCollector {
    private static instance;
    private metrics;
    private gauges;
    private constructor();
    static getInstance(): MetricsCollector;
    /**
     * Record a counter increment (monotonic).
     */
    increment(name: string, value?: number, tags?: MetricTag): void;
    /**
     * Record a gauge value (point in time).
     */
    gauge(name: string, value: number, tags?: MetricTag): void;
    /**
     * Record a histogram/timer value (distribution).
     */
    histogram(name: string, value: number, tags?: MetricTag): void;
    private record;
    private getGaugeKey;
    /**
     * Get current values (snapshot).
     */
    getSnapshot(): {
        metrics: MetricValue[];
        gauges: Record<string, number>;
    };
    /**
     * Clear in-memory metrics (useful for tests or periodic flushes).
     */
    clear(): void;
}
export declare const metrics: MetricsCollector;
//# sourceMappingURL=Metrics.d.ts.map