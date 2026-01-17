/**
 * PrometheusMetrics - Prometheus metrics exporter for Titan Brain
 *
 * Implements signal processing latency, decision approval rate,
 * database query time, and cache hit rate metrics.
 *
 * Requirements: 7.7
 */

import { PhaseId } from '../types/index.js';

/**
 * Histogram bucket configuration for latency metrics
 */
const LATENCY_BUCKETS = [5, 10, 25, 50, 75, 100, 150, 200, 500, 1000];

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Histogram data structure
 */
export interface HistogramData {
  buckets: Map<number, number>;
  sum: number;
  count: number;
}

/**
 * Metric definition
 */
export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labels?: string[];
}

/**
 * Metric value with labels
 */
export interface MetricValue {
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

/**
 * PrometheusMetrics class for collecting and exporting metrics
 */
export class PrometheusMetrics {
  private readonly prefix: string;
  private readonly counters: Map<string, Map<string, number>> = new Map();
  private readonly gauges: Map<string, Map<string, number>> = new Map();
  private readonly histograms: Map<string, Map<string, HistogramData>> = new Map();
  private readonly definitions: Map<string, MetricDefinition> = new Map();

  constructor(prefix: string = 'titan_brain') {
    this.prefix = prefix;
    this.initializeMetrics();
  }

  /**
   * Initialize all metric definitions
   */
  private initializeMetrics(): void {
    // Signal processing latency histogram
    this.defineHistogram(
      'signal_processing_latency_ms',
      'Signal processing latency in milliseconds',
      ['phase_id', 'approved'],
    );

    // Decision approval rate counter
    this.defineCounter('decisions_total', 'Total number of decisions made', [
      'phase_id',
      'approved',
    ]);

    // Database query time histogram
    this.defineHistogram('database_query_duration_ms', 'Database query duration in milliseconds', [
      'operation',
      'table',
    ]);

    // Cache hit rate counters
    this.defineCounter('cache_requests_total', 'Total cache requests', ['cache_name', 'result']);

    // Current equity gauge
    this.defineGauge('current_equity', 'Current equity value', []);

    // Allocation weights gauge
    this.defineGauge('allocation_weight', 'Current allocation weight per phase', ['phase_id']);

    // Circuit breaker status gauge
    this.defineGauge(
      'circuit_breaker_active',
      'Circuit breaker active status (1=active, 0=inactive)',
      [],
    );

    // Open positions gauge
    this.defineGauge('open_positions_count', 'Number of open positions', ['phase_id']);

    // Signal queue size gauge
    this.defineGauge('signal_queue_size', 'Current signal queue size', []);

    // High watermark gauge
    this.defineGauge('high_watermark', 'Current high watermark value', []);

    // Daily drawdown gauge
    this.defineGauge('daily_drawdown_percent', 'Current daily drawdown percentage', []);

    // Leverage gauge
    this.defineGauge('current_leverage', 'Current combined leverage', []);

    // Performance modifier gauge
    this.defineGauge('performance_modifier', 'Performance modifier per phase', ['phase_id']);

    // Sharpe ratio gauge
    this.defineGauge('sharpe_ratio', 'Rolling Sharpe ratio per phase', ['phase_id']);

    // Sweep operations counter
    this.defineCounter('sweep_operations_total', 'Total sweep operations', ['status']);

    // Notification counter
    this.defineCounter('notifications_sent_total', 'Total notifications sent', ['channel', 'type']);
  }

  /**
   * Define a counter metric
   */
  private defineCounter(name: string, help: string, labels: string[]): void {
    const fullName = `${this.prefix}_${name}`;
    this.definitions.set(fullName, { name: fullName, help, type: 'counter', labels });
    this.counters.set(fullName, new Map());
  }

  /**
   * Define a gauge metric
   */
  private defineGauge(name: string, help: string, labels: string[]): void {
    const fullName = `${this.prefix}_${name}`;
    this.definitions.set(fullName, { name: fullName, help, type: 'gauge', labels });
    this.gauges.set(fullName, new Map());
  }

  /**
   * Define a histogram metric
   */
  private defineHistogram(name: string, help: string, labels: string[]): void {
    const fullName = `${this.prefix}_${name}`;
    this.definitions.set(fullName, { name: fullName, help, type: 'histogram', labels });
    this.histograms.set(fullName, new Map());
  }

  /**
   * Generate label key from label values
   */
  private getLabelKey(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const fullName = `${this.prefix}_${name}`;
    const counter = this.counters.get(fullName);
    if (!counter) return;

    const key = this.getLabelKey(labels);
    const current = counter.get(key) || 0;
    counter.set(key, current + value);
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const fullName = `${this.prefix}_${name}`;
    const gauge = this.gauges.get(fullName);
    if (!gauge) return;

    const key = this.getLabelKey(labels);
    gauge.set(key, value);
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const fullName = `${this.prefix}_${name}`;
    const histogram = this.histograms.get(fullName);
    if (!histogram) return;

    const key = this.getLabelKey(labels);
    let data = histogram.get(key);

    if (!data) {
      data = {
        buckets: new Map(LATENCY_BUCKETS.map((b) => [b, 0])),
        sum: 0,
        count: 0,
      };
      histogram.set(key, data);
    }

    // Update buckets
    for (const bucket of LATENCY_BUCKETS) {
      if (value <= bucket) {
        data.buckets.set(bucket, (data.buckets.get(bucket) || 0) + 1);
      }
    }

    data.sum += value;
    data.count += 1;
  }

  // ============ Convenience Methods ============

  /**
   * Record signal processing latency
   * Requirement 7.7: Signal processing latency metrics
   */
  recordSignalLatency(phaseId: PhaseId, latencyMs: number, approved: boolean): void {
    this.observeHistogram('signal_processing_latency_ms', latencyMs, {
      phase_id: phaseId,
      approved: String(approved),
    });
    this.incrementCounter('decisions_total', {
      phase_id: phaseId,
      approved: String(approved),
    });
  }

  /**
   * Record database query time
   * Requirement 7.7: Database query time metrics
   */
  recordDatabaseQuery(operation: string, table: string, durationMs: number): void {
    this.observeHistogram('database_query_duration_ms', durationMs, {
      operation,
      table,
    });
  }

  /**
   * Record cache access
   * Requirement 7.7: Cache hit rate metrics
   */
  recordCacheAccess(cacheName: string, hit: boolean): void {
    this.incrementCounter('cache_requests_total', {
      cache_name: cacheName,
      result: hit ? 'hit' : 'miss',
    });
  }

  /**
   * Update equity gauge
   */
  updateEquity(equity: number): void {
    this.setGauge('current_equity', equity);
  }

  /**
   * Update allocation weights
   */
  updateAllocation(w1: number, w2: number, w3: number): void {
    this.setGauge('allocation_weight', w1, { phase_id: 'phase1' });
    this.setGauge('allocation_weight', w2, { phase_id: 'phase2' });
    this.setGauge('allocation_weight', w3, { phase_id: 'phase3' });
  }

  /**
   * Update circuit breaker status
   */
  updateCircuitBreakerStatus(active: boolean): void {
    this.setGauge('circuit_breaker_active', active ? 1 : 0);
  }

  /**
   * Update signal queue size
   */
  updateSignalQueueSize(size: number): void {
    this.setGauge('signal_queue_size', size);
  }

  /**
   * Update high watermark
   */
  updateHighWatermark(value: number): void {
    this.setGauge('high_watermark', value);
  }

  /**
   * Update daily drawdown
   */
  updateDailyDrawdown(percent: number): void {
    this.setGauge('daily_drawdown_percent', percent);
  }

  /**
   * Update leverage
   */
  updateLeverage(leverage: number): void {
    this.setGauge('current_leverage', leverage);
  }

  /**
   * Update performance metrics for a phase
   */
  updatePhasePerformance(phaseId: PhaseId, sharpeRatio: number, modifier: number): void {
    this.setGauge('sharpe_ratio', sharpeRatio, { phase_id: phaseId });
    this.setGauge('performance_modifier', modifier, { phase_id: phaseId });
  }

  /**
   * Record sweep operation
   */
  recordSweepOperation(success: boolean): void {
    this.incrementCounter('sweep_operations_total', {
      status: success ? 'success' : 'failure',
    });
  }

  /**
   * Record notification sent
   */
  recordNotification(channel: string, type: string): void {
    this.incrementCounter('notifications_sent_total', { channel, type });
  }

  // ============ Export Methods ============

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labelKey: string): string {
    if (!labelKey) return '';
    return `{${labelKey}}`;
  }

  /**
   * Export metrics in Prometheus text format
   */
  export(): string {
    const lines: string[] = [];

    // Export counters
    for (const [name, values] of this.counters) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} counter`);
      }
      for (const [labelKey, value] of values) {
        lines.push(`${name}${this.formatLabels(labelKey)} ${value}`);
      }
    }

    // Export gauges
    for (const [name, values] of this.gauges) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} gauge`);
      }
      for (const [labelKey, value] of values) {
        lines.push(`${name}${this.formatLabels(labelKey)} ${value}`);
      }
    }

    // Export histograms
    for (const [name, values] of this.histograms) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} histogram`);
      }
      for (const [labelKey, data] of values) {
        const baseLabels = labelKey ? `${labelKey},` : '';

        // Export buckets
        for (const [bucket, count] of data.buckets) {
          lines.push(`${name}_bucket{${baseLabels}le="${bucket}"} ${count}`);
        }
        lines.push(`${name}_bucket{${baseLabels}le="+Inf"} ${data.count}`);

        // Export sum and count
        const sumLabels = labelKey ? `{${labelKey}}` : '';
        lines.push(`${name}_sum${sumLabels} ${data.sum}`);
        lines.push(`${name}_count${sumLabels} ${data.count}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get metrics as JSON object
   */
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Counters
    for (const [name, values] of this.counters) {
      const shortName = name.replace(`${this.prefix}_`, '');
      result[shortName] = Object.fromEntries(values);
    }

    // Gauges
    for (const [name, values] of this.gauges) {
      const shortName = name.replace(`${this.prefix}_`, '');
      result[shortName] = Object.fromEntries(values);
    }

    // Histograms (simplified)
    for (const [name, values] of this.histograms) {
      const shortName = name.replace(`${this.prefix}_`, '');
      const histData: Record<string, { sum: number; count: number; avg: number }> = {};
      for (const [labelKey, data] of values) {
        histData[labelKey || 'default'] = {
          sum: data.sum,
          count: data.count,
          avg: data.count > 0 ? data.sum / data.count : 0,
        };
      }
      result[shortName] = histData;
    }

    return result;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.clear();
    }
    for (const gauge of this.gauges.values()) {
      gauge.clear();
    }
    for (const histogram of this.histograms.values()) {
      histogram.clear();
    }
  }

  /**
   * Get cache hit rate for a specific cache
   */
  getCacheHitRate(cacheName: string): number {
    const fullName = `${this.prefix}_cache_requests_total`;
    const counter = this.counters.get(fullName);
    if (!counter) return 0;

    const hitKey = this.getLabelKey({ cache_name: cacheName, result: 'hit' });
    const missKey = this.getLabelKey({ cache_name: cacheName, result: 'miss' });

    const hits = counter.get(hitKey) || 0;
    const misses = counter.get(missKey) || 0;
    const total = hits + misses;

    return total > 0 ? hits / total : 0;
  }

  /**
   * Get average latency for signal processing
   */
  getAverageSignalLatency(phaseId?: PhaseId): number {
    const fullName = `${this.prefix}_signal_processing_latency_ms`;
    const histogram = this.histograms.get(fullName);
    if (!histogram) return 0;

    let totalSum = 0;
    let totalCount = 0;

    for (const [labelKey, data] of histogram) {
      if (phaseId && !labelKey.includes(`phase_id="${phaseId}"`)) continue;
      totalSum += data.sum;
      totalCount += data.count;
    }

    return totalCount > 0 ? totalSum / totalCount : 0;
  }

  /**
   * Get decision approval rate
   */
  getApprovalRate(phaseId?: PhaseId): number {
    const fullName = `${this.prefix}_decisions_total`;
    const counter = this.counters.get(fullName);
    if (!counter) return 0;

    let approved = 0;
    let total = 0;

    for (const [labelKey, value] of counter) {
      if (phaseId && !labelKey.includes(`phase_id="${phaseId}"`)) continue;

      if (labelKey.includes('approved="true"')) {
        approved += value;
      }
      total += value;
    }

    return total > 0 ? approved / total : 0;
  }
}

/**
 * Singleton instance for global metrics collection
 */
let metricsInstance: PrometheusMetrics | null = null;

/**
 * Get or create the global metrics instance
 */
export function getMetrics(prefix?: string): PrometheusMetrics {
  if (!metricsInstance) {
    metricsInstance = new PrometheusMetrics(prefix);
  }
  return metricsInstance;
}

/**
 * Reset the global metrics instance (for testing)
 */
export function resetMetrics(): void {
  if (metricsInstance) {
    metricsInstance.reset();
  }
  metricsInstance = null;
}
