/**
 * PrometheusMetrics - Prometheus metrics exporter for Titan Brain
 *
 * Wraps prom-client to provide standard application metrics
 * and specific business metrics for the trading system.
 *
 * Requirements: 7.7
 */

import { PhaseId } from '../types/index.js';
import client from 'prom-client';

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Metric definition
 */
export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labels?: string[];
}

export interface HistogramData {
  buckets: Record<string, number>;
  sum: number;
  count: number;
}

export type MetricValue = number | HistogramData;

/**
 * PrometheusMetrics class for collecting and exporting metrics
 */
export class PrometheusMetrics {
  private readonly prefix: string;
  private readonly registry: client.Registry;

  // Metric instances
  private counters: Map<string, client.Counter> = new Map();
  private gauges: Map<string, client.Gauge> = new Map();
  private histograms: Map<string, client.Histogram> = new Map();

  // Internal state tracking for getters
  private latencyStats: Map<string, { sum: number; count: number }> = new Map();
  private decisionStats: Map<string, { approved: number; total: number }> = new Map();
  private cacheStats: Map<string, { hits: number; total: number }> = new Map();

  constructor(prefix: string = 'titan_brain_') {
    this.prefix = prefix;
    this.registry = new client.Registry();

    // Enable default metrics (CPU, Memory, Event Loop, etc.)
    client.collectDefaultMetrics({
      register: this.registry,
      prefix: this.prefix,
    });

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
      [5, 10, 25, 50, 75, 100, 150, 200, 500, 1000],
    );

    // Decision approval rate counter
    this.defineCounter('decisions_total', 'Total number of decisions made', [
      'phase_id',
      'approved',
    ]);

    // Database query time histogram
    this.defineHistogram(
      'database_query_duration_ms',
      'Database query duration in milliseconds',
      ['operation', 'table'],
      [1, 5, 10, 50, 100, 500, 1000, 5000],
    );

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

    // --- Truth Layer Metrics (Phase 6) ---
    // Confidence score gauge
    this.defineGauge(
      'truth_confidence_score',
      'Confidence score of the Single Source of Truth (0-100)',
      [],
    );

    // Drift events counter
    this.defineCounter('truth_drift_events_total', 'Total number of detected state drift events', [
      'source',
    ]);
  }

  /**
   * Define a counter metric
   */
  private defineCounter(name: string, help: string, labelNames: string[]): void {
    // prom-client handles prefixing better if needed, but we keep manual control or use registry prefix
    // We already passed prefix to collectDefaultMetrics.
    // However, for custom metrics, we often want specific names.
    // Let's rely on the registry prefix mechanism if possible, OR prefix manually.
    // PRO TIP: Registry prefix applies to everything.
    // Let's NOT duplicate the prefix if we manually add it.
    // Actually, simple way: Don't put prefix in name, let registry handle it if we set it.
    // But safely, let's just make valid names.

    // Check if simple name or full name is better. The codebase uses "titan_brain_" prefix in constructor.
    // We will use that.

    const counter = new client.Counter({
      name: `${this.prefix}${name}`,
      help,
      labelNames,
      registers: [this.registry],
    });
    // eslint-disable-next-line functional/immutable-data
    this.counters.set(name, counter);
  }

  /**
   * Define a gauge metric
   */
  private defineGauge(name: string, help: string, labelNames: string[]): void {
    const gauge = new client.Gauge({
      name: `${this.prefix}${name}`,
      help,
      labelNames,
      registers: [this.registry],
    });
    // eslint-disable-next-line functional/immutable-data
    this.gauges.set(name, gauge);
  }

  /**
   * Define a histogram metric
   */
  private defineHistogram(
    name: string,
    help: string,
    labelNames: string[],
    buckets?: number[],
  ): void {
    const histogram = new client.Histogram({
      name: `${this.prefix}${name}`,
      help,
      labelNames,
      buckets: buckets || [0.1, 5, 15, 50, 100, 500],
      registers: [this.registry],
    });
    // eslint-disable-next-line functional/immutable-data
    this.histograms.set(name, histogram);
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const counter = this.counters.get(name);
    if (counter) {
      if (labels) {
        counter.labels(labels).inc(value);
      } else {
        counter.inc(value);
      }
    }
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const gauge = this.gauges.get(name);
    if (gauge) {
      if (labels) {
        gauge.labels(labels).set(value);
      } else {
        gauge.set(value);
      }
    }
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const histogram = this.histograms.get(name);
    if (histogram) {
      if (labels) {
        histogram.labels(labels).observe(value);
      } else {
        histogram.observe(value);
      }
    }
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

    // Update internal stats
    const latStats = this.latencyStats.get(phaseId) || { sum: 0, count: 0 };
    // eslint-disable-next-line functional/immutable-data
    latStats.sum += latencyMs;
    // eslint-disable-next-line functional/immutable-data
    latStats.count++;
    // eslint-disable-next-line functional/immutable-data
    this.latencyStats.set(phaseId, latStats);

    const decStats = this.decisionStats.get(phaseId) || { approved: 0, total: 0 };
    // eslint-disable-next-line functional/immutable-data
    decStats.total++;
    // eslint-disable-next-line functional/immutable-data
    if (approved) decStats.approved++;
    // eslint-disable-next-line functional/immutable-data
    this.decisionStats.set(phaseId, decStats);
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

    // Update internal stats
    const cStats = this.cacheStats.get(cacheName) || { hits: 0, total: 0 };
    // eslint-disable-next-line functional/immutable-data
    cStats.total++;
    // eslint-disable-next-line functional/immutable-data
    if (hit) cStats.hits++;
    // eslint-disable-next-line functional/immutable-data
    this.cacheStats.set(cacheName, cStats);
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

  /**
   * Update Truth Confidence Score
   */
  updateTruthConfidence(score: number): void {
    this.setGauge('truth_confidence_score', score);
  }

  /**
   * Record Truth Drift Event
   */
  recordDriftEvent(source: string): void {
    this.incrementCounter('truth_drift_events_total', { source });
  }

  // ============ Export Methods ============

  /**
   * Export metrics in Prometheus text format
   */
  async export(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics as JSON object
   * (Simplified approximation for compatibility)
   */
  async toJSON(): Promise<unknown[]> {
    return this.registry.getMetricsAsJSON();
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.registry.clear();
    // Re-initialize default metrics and custom definitions
    client.collectDefaultMetrics({
      register: this.registry,
      prefix: this.prefix,
    });
    this.initializeMetrics();
    // eslint-disable-next-line functional/immutable-data
    this.latencyStats.clear();
    // eslint-disable-next-line functional/immutable-data
    this.decisionStats.clear();
    // eslint-disable-next-line functional/immutable-data
    this.cacheStats.clear();
  }

  // ============ Getter Methods (for logic/tests) ============

  /**
   * Get average signal latency for a phase
   */
  getAverageSignalLatency(phaseId: string): number {
    const stats = this.latencyStats.get(phaseId);
    if (!stats || stats.count === 0) return 0;
    return stats.sum / stats.count;
  }

  /**
   * Get approval rate for a phase
   */
  getApprovalRate(phaseId: string): number {
    const stats = this.decisionStats.get(phaseId);
    if (!stats || stats.total === 0) return 0;
    return stats.approved / stats.total;
  }

  /**
   * Get cache hit rate
   */
  getCacheHitRate(cacheName: string): number {
    const stats = this.cacheStats.get(cacheName);
    if (!stats || stats.total === 0) return 0;
    return stats.hits / stats.total;
  }
}

/**
 * Singleton instance for global metrics collection
 */
// eslint-disable-next-line functional/no-let
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
