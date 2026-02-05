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

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: MetricValue[] = [];
  // Simple aggregation map for gauges
  private gauges: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Record a counter increment (monotonic).
   */
  public increment(name: string, value: number = 1, tags: MetricTag = {}): void {
    this.record({ name, value, tags, timestamp: Date.now() });
  }

  /**
   * Record a gauge value (point in time).
   */
  public gauge(name: string, value: number, tags: MetricTag = {}): void {
    const key = this.getGaugeKey(name, tags);
    this.gauges.set(key, value);
    this.record({ name, value, tags, timestamp: Date.now() });
  }

  /**
   * Record a histogram/timer value (distribution).
   */
  public histogram(name: string, value: number, tags: MetricTag = {}): void {
    this.record({ name, value, tags, timestamp: Date.now() });
  }

  private record(metric: MetricValue): void {
    // In a real production setup, this would push to a TSDB or OTel collector.
    // For now, we keep a small buffer or just log/emit.
    // To prevent memory leaks in this in-memory implementation, we'll limit the buffer.
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }
    this.metrics.push(metric);
  }

  private getGaugeKey(name: string, tags: MetricTag): string {
    const tagStr = Object.entries(tags)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${tagStr}}`;
  }

  /**
   * Get current values (snapshot).
   */
  public getSnapshot(): {
    metrics: MetricValue[];
    gauges: Record<string, number>;
  } {
    return {
      metrics: [...this.metrics],
      gauges: Object.fromEntries(this.gauges),
    };
  }

  /**
   * Clear in-memory metrics (useful for tests or periodic flushes).
   */
  public clear(): void {
    this.metrics = [];
    this.gauges.clear();
  }
}

export const metrics = MetricsCollector.getInstance();
