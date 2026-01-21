/**
 * PrometheusMetrics - Prometheus metrics exporter for Titan Phase 1 Scavenger
 *
 * Implements trap detection metrics, signal generation rate,
 * IPC communication metrics, and performance monitoring.
 *
 * Requirements: 6.5
 */

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Histogram bucket configuration for latency metrics
 */
const LATENCY_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];

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
 * PrometheusMetrics class for collecting and exporting metrics
 */
export class PrometheusMetrics {
  private readonly prefix: string;
  private readonly counters: Map<string, Map<string, number>> = new Map();
  private readonly gauges: Map<string, Map<string, number>> = new Map();
  private readonly histograms: Map<string, Map<string, HistogramData>> = new Map();
  private readonly definitions: Map<string, MetricDefinition> = new Map();

  constructor(prefix: string = 'titan_scavenger') {
    this.prefix = prefix;
    this.initializeMetrics();
  }

  /**
   * Initialize all metric definitions
   */
  private initializeMetrics(): void {
    // Trap detection metrics
    this.defineCounter('traps_detected_total', 'Total number of traps detected', [
      'trap_type',
      'symbol',
    ]);

    this.defineCounter('signals_generated_total', 'Total number of signals generated', [
      'symbol',
      'direction',
      'result',
    ]);

    // IPC communication metrics
    this.defineCounter('ipc_messages_total', 'Total IPC messages sent/received', [
      'direction',
      'result',
    ]);

    this.defineHistogram('ipc_latency_ms', 'IPC message latency in milliseconds', ['message_type']);

    // Binance WebSocket metrics
    this.defineCounter('binance_ticks_total', 'Total Binance ticks received', ['symbol']);

    this.defineGauge(
      'binance_connection_status',
      'Binance WebSocket connection status (1=connected, 0=disconnected)',
      [],
    );

    // Trap engine metrics
    this.defineGauge('active_traps_count', 'Number of currently active traps', ['trap_type']);

    this.defineHistogram(
      'trap_calculation_duration_ms',
      'Time taken to calculate trap levels in milliseconds',
      ['calculation_type'],
    );

    // Performance metrics
    this.defineGauge('tick_processing_rate', 'Rate of tick processing per second', []);

    this.defineCounter('validation_results_total', 'Total validation results', [
      'symbol',
      'result',
    ]);

    // Health metrics
    this.defineGauge('health_status', 'Component health status (1=healthy, 0=unhealthy)', [
      'component',
    ]);

    // Configuration metrics
    this.defineGauge('config_reload_timestamp', 'Timestamp of last configuration reload', []);

    this.defineCounter('config_reload_total', 'Total configuration reloads', ['result']);
  }

  /**
   * Define a counter metric
   */
  private defineCounter(name: string, help: string, labels: string[]): void {
    const fullName = `${this.prefix}_${name}`;
    this.definitions.set(fullName, {
      name: fullName,
      help,
      type: 'counter',
      labels,
    });
    this.counters.set(fullName, new Map());
  }

  /**
   * Define a gauge metric
   */
  private defineGauge(name: string, help: string, labels: string[]): void {
    const fullName = `${this.prefix}_${name}`;
    this.definitions.set(fullName, {
      name: fullName,
      help,
      type: 'gauge',
      labels,
    });
    this.gauges.set(fullName, new Map());
  }

  /**
   * Define a histogram metric
   */
  private defineHistogram(name: string, help: string, labels: string[]): void {
    const fullName = `${this.prefix}_${name}`;
    this.definitions.set(fullName, {
      name: fullName,
      help,
      type: 'histogram',
      labels,
    });
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
   * Record trap detection
   */
  recordTrapDetection(trapType: string, symbol: string): void {
    this.incrementCounter('traps_detected_total', {
      trap_type: trapType,
      symbol,
    });
  }

  /**
   * Record signal generation
   */
  recordSignalGeneration(symbol: string, direction: string, result: string): void {
    this.incrementCounter('signals_generated_total', {
      symbol,
      direction,
      result,
    });
  }

  /**
   * Record IPC message
   */
  recordIPCMessage(direction: 'sent' | 'received', result: 'success' | 'failed'): void {
    this.incrementCounter('ipc_messages_total', { direction, result });
  }

  /**
   * Record IPC latency
   */
  recordIPCLatency(messageType: string, latencyMs: number): void {
    this.observeHistogram('ipc_latency_ms', latencyMs, {
      message_type: messageType,
    });
  }

  /**
   * Record Binance tick
   */
  recordBinanceTick(symbol: string): void {
    this.incrementCounter('binance_ticks_total', { symbol });
  }

  /**
   * Update Binance connection status
   */
  updateBinanceConnectionStatus(connected: boolean): void {
    this.setGauge('binance_connection_status', connected ? 1 : 0);
  }

  /**
   * Update active traps count
   */
  updateActiveTrapsCount(trapType: string, count: number): void {
    this.setGauge('active_traps_count', count, { trap_type: trapType });
  }

  /**
   * Record trap calculation duration
   */
  recordTrapCalculationDuration(calculationType: string, durationMs: number): void {
    this.observeHistogram('trap_calculation_duration_ms', durationMs, {
      calculation_type: calculationType,
    });
  }

  /**
   * Update tick processing rate
   */
  updateTickProcessingRate(rate: number): void {
    this.setGauge('tick_processing_rate', rate);
  }

  /**
   * Record validation result
   */
  recordValidationResult(symbol: string, result: string): void {
    this.incrementCounter('validation_results_total', { symbol, result });
  }

  /**
   * Update component health status
   */
  updateHealthStatus(component: string, healthy: boolean): void {
    this.setGauge('health_status', healthy ? 1 : 0, { component });
  }

  /**
   * Record configuration reload
   */
  recordConfigReload(result: 'success' | 'failed'): void {
    this.incrementCounter('config_reload_total', { result });
    if (result === 'success') {
      this.setGauge('config_reload_timestamp', Date.now());
    }
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
