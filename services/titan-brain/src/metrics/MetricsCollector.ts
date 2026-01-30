/**
 * MetricsCollector - Prometheus metrics collection for monitoring
 *
 * Implements comprehensive metrics collection for HTTP requests, database operations,
 * health checks, and custom business metrics with Prometheus format.
 *
 * Requirements: 4.2.1, 4.2.2, 4.2.3, 4.2.4, 4.2.5
 */

/* eslint-disable functional/immutable-data, functional/no-let -- MetricsCollector is stateful by design */

import { EventEmitter } from 'events';
import { Logger } from '../logging/Logger.js';

/**
 * Metric types supported by Prometheus
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary',
}

/**
 * Metric definition
 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  help: string;
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
 * Histogram bucket configuration
 */
export interface HistogramBuckets {
  buckets: number[];
  values: Map<number, number>;
  sum: number;
  count: number;
}

/**
 * HTTP request metrics
 */
export interface HttpMetrics {
  requestsTotal: number;
  requestDuration: HistogramBuckets;
  requestsInFlight: number;
  responseSize: HistogramBuckets;
}

/**
 * Database metrics
 */
export interface DatabaseMetrics {
  connectionsActive: number;
  connectionsIdle: number;
  connectionsWaiting: number;
  queryDuration: HistogramBuckets;
  queriesTotal: number;
  queryErrors: number;
}

/**
 * Health check metrics
 */
export interface HealthMetrics {
  healthCheckStatus: number; // 1 for healthy, 0 for unhealthy
  healthCheckDuration: HistogramBuckets;
  componentStatus: Map<string, number>;
}

/**
 * Business metrics
 */
export interface BusinessMetrics {
  signalsProcessed: number;
  ordersExecuted: number;
  errorsTotal: number;
  customCounters: Map<string, number>;
  customGauges: Map<string, number>;
}

/**
 * Prometheus metrics collector
 */
export class MetricsCollector extends EventEmitter {
  private logger: Logger;
  private metrics: Map<string, MetricDefinition> = new Map();
  private values: Map<string, MetricValue[]> = new Map();
  private httpMetrics: HttpMetrics;
  private databaseMetrics: DatabaseMetrics;
  private healthMetrics: HealthMetrics;
  private businessMetrics: BusinessMetrics;
  private startTime: number;

  constructor(logger?: Logger) {
    super();
    this.logger = logger ?? Logger.getInstance('metrics-collector');
    this.startTime = Date.now();

    // Initialize metric structures
    this.httpMetrics = this.initializeHttpMetrics();
    this.databaseMetrics = this.initializeDatabaseMetrics();
    this.healthMetrics = this.initializeHealthMetrics();
    this.businessMetrics = this.initializeBusinessMetrics();

    // Register default metrics
    this.registerDefaultMetrics();

    this.logger.info('Metrics collector initialized');
  }

  /**
   * Initialize HTTP metrics
   */
  private initializeHttpMetrics(): HttpMetrics {
    return {
      requestsTotal: 0,
      requestDuration: this.createHistogramBuckets([
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
      ]),
      requestsInFlight: 0,
      responseSize: this.createHistogramBuckets([100, 1000, 10000, 100000, 1000000]),
    };
  }

  /**
   * Initialize database metrics
   */
  private initializeDatabaseMetrics(): DatabaseMetrics {
    return {
      connectionsActive: 0,
      connectionsIdle: 0,
      connectionsWaiting: 0,
      queryDuration: this.createHistogramBuckets([
        0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
      ]),
      queriesTotal: 0,
      queryErrors: 0,
    };
  }

  /**
   * Initialize health metrics
   */
  private initializeHealthMetrics(): HealthMetrics {
    return {
      healthCheckStatus: 0,
      healthCheckDuration: this.createHistogramBuckets([0.1, 0.25, 0.5, 1, 2.5, 5]),
      componentStatus: new Map(),
    };
  }

  /**
   * Initialize business metrics
   */
  private initializeBusinessMetrics(): BusinessMetrics {
    return {
      signalsProcessed: 0,
      ordersExecuted: 0,
      errorsTotal: 0,
      customCounters: new Map(),
      customGauges: new Map(),
    };
  }

  /**
   * Create histogram buckets
   */
  private createHistogramBuckets(buckets: number[]): HistogramBuckets {
    const values = new Map<number, number>();

    buckets.forEach((bucket) => values.set(bucket, 0));

    values.set(Infinity, 0); // +Inf bucket

    return {
      buckets,
      values,
      sum: 0,
      count: 0,
    };
  }

  /**
   * Register default Prometheus metrics
   */
  private registerDefaultMetrics(): void {
    // HTTP metrics
    this.registerMetric({
      name: 'http_requests_total',
      type: MetricType.COUNTER,
      help: 'Total number of HTTP requests',
      labels: ['method', 'route', 'status_code'],
    });

    this.registerMetric({
      name: 'http_request_duration_seconds',
      type: MetricType.HISTOGRAM,
      help: 'HTTP request duration in seconds',
      labels: ['method', 'route'],
    });

    this.registerMetric({
      name: 'http_requests_in_flight',
      type: MetricType.GAUGE,
      help: 'Current number of HTTP requests being processed',
    });

    this.registerMetric({
      name: 'http_response_size_bytes',
      type: MetricType.HISTOGRAM,
      help: 'HTTP response size in bytes',
      labels: ['method', 'route'],
    });

    // Database metrics
    this.registerMetric({
      name: 'database_connections_active',
      type: MetricType.GAUGE,
      help: 'Number of active database connections',
    });

    this.registerMetric({
      name: 'database_connections_idle',
      type: MetricType.GAUGE,
      help: 'Number of idle database connections',
    });

    this.registerMetric({
      name: 'database_connections_waiting',
      type: MetricType.GAUGE,
      help: 'Number of clients waiting for database connections',
    });

    this.registerMetric({
      name: 'database_query_duration_seconds',
      type: MetricType.HISTOGRAM,
      help: 'Database query duration in seconds',
      labels: ['operation'],
    });

    this.registerMetric({
      name: 'database_queries_total',
      type: MetricType.COUNTER,
      help: 'Total number of database queries',
      labels: ['operation', 'status'],
    });

    // Health check metrics
    this.registerMetric({
      name: 'health_check_status',
      type: MetricType.GAUGE,
      help: 'Health check status (1 = healthy, 0 = unhealthy)',
    });

    this.registerMetric({
      name: 'health_check_duration_seconds',
      type: MetricType.HISTOGRAM,
      help: 'Health check duration in seconds',
    });

    this.registerMetric({
      name: 'component_health_status',
      type: MetricType.GAUGE,
      help: 'Component health status (1 = healthy, 0 = unhealthy)',
      labels: ['component'],
    });

    // Business metrics
    this.registerMetric({
      name: 'signals_processed_total',
      type: MetricType.COUNTER,
      help: 'Total number of signals processed',
      labels: ['type', 'status'],
    });

    this.registerMetric({
      name: 'orders_executed_total',
      type: MetricType.COUNTER,
      help: 'Total number of orders executed',
      labels: ['side', 'status'],
    });

    this.registerMetric({
      name: 'errors_total',
      type: MetricType.COUNTER,
      help: 'Total number of errors',
      labels: ['type', 'component'],
    });

    // System metrics
    this.registerMetric({
      name: 'process_start_time_seconds',
      type: MetricType.GAUGE,
      help: 'Start time of the process since unix epoch in seconds',
    });

    this.registerMetric({
      name: 'process_uptime_seconds',
      type: MetricType.GAUGE,
      help: 'Process uptime in seconds',
    });
  }

  /**
   * Register a new metric
   */
  registerMetric(definition: MetricDefinition): void {
    this.metrics.set(definition.name, definition);

    this.values.set(definition.name, []);

    this.logger.debug('Registered metric', undefined, {
      name: definition.name,
      type: definition.type,
      labels: definition.labels,
    });
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    responseSize: number,
  ): void {
    // Increment total requests

    this.httpMetrics.requestsTotal++;
    this.incrementCounter('http_requests_total', {
      method,
      route,
      status_code: statusCode.toString(),
    });

    // Record request duration
    this.recordHistogram(this.httpMetrics.requestDuration, duration);
    this.recordHistogramMetric('http_request_duration_seconds', duration, {
      method,
      route,
    });

    // Record response size
    this.recordHistogram(this.httpMetrics.responseSize, responseSize);
    this.recordHistogramMetric('http_response_size_bytes', responseSize, {
      method,
      route,
    });

    this.emit('http:request', {
      method,
      route,
      statusCode,
      duration,
      responseSize,
    });
  }

  /**
   * Record HTTP request start (increment in-flight counter)
   */
  recordHttpRequestStart(): void {
    this.httpMetrics.requestsInFlight++;
    this.setGauge('http_requests_in_flight', this.httpMetrics.requestsInFlight);
  }

  /**
   * Record HTTP request end (decrement in-flight counter)
   */
  recordHttpRequestEnd(): void {
    this.httpMetrics.requestsInFlight = Math.max(0, this.httpMetrics.requestsInFlight - 1);
    this.setGauge('http_requests_in_flight', this.httpMetrics.requestsInFlight);
  }

  /**
   * Record database connection metrics
   */
  recordDatabaseConnections(active: number, idle: number, waiting: number): void {
    this.databaseMetrics.connectionsActive = active;

    this.databaseMetrics.connectionsIdle = idle;

    this.databaseMetrics.connectionsWaiting = waiting;

    this.setGauge('database_connections_active', active);
    this.setGauge('database_connections_idle', idle);
    this.setGauge('database_connections_waiting', waiting);

    this.emit('database:connections', { active, idle, waiting });
  }

  /**
   * Record database query metrics
   */
  recordDatabaseQuery(operation: string, duration: number, success: boolean): void {
    this.databaseMetrics.queriesTotal++;
    if (!success) {
      this.databaseMetrics.queryErrors++;
    }

    this.recordHistogram(this.databaseMetrics.queryDuration, duration);
    this.recordHistogramMetric('database_query_duration_seconds', duration, {
      operation,
    });
    this.incrementCounter('database_queries_total', {
      operation,
      status: success ? 'success' : 'error',
    });

    this.emit('database:query', { operation, duration, success });
  }

  /**
   * Record health check metrics
   */
  recordHealthCheck(healthy: boolean, duration: number): void {
    this.healthMetrics.healthCheckStatus = healthy ? 1 : 0;
    this.recordHistogram(this.healthMetrics.healthCheckDuration, duration);

    this.setGauge('health_check_status', this.healthMetrics.healthCheckStatus);
    this.recordHistogramMetric('health_check_duration_seconds', duration);

    this.emit('health:check', { healthy, duration });
  }

  /**
   * Record component health status
   */
  recordComponentHealth(component: string, healthy: boolean): void {
    const status = healthy ? 1 : 0;

    this.healthMetrics.componentStatus.set(component, status);
    this.setGauge('component_health_status', status, { component });

    this.emit('health:component', { component, healthy });
  }

  /**
   * Record business metrics
   */
  recordSignalProcessed(type: string, success: boolean): void {
    this.businessMetrics.signalsProcessed++;
    this.incrementCounter('signals_processed_total', {
      type,
      status: success ? 'success' : 'error',
    });

    this.emit('business:signal', { type, success });
  }

  /**
   * Record order execution
   */
  recordOrderExecuted(side: string, success: boolean): void {
    this.businessMetrics.ordersExecuted++;
    this.incrementCounter('orders_executed_total', {
      side,
      status: success ? 'success' : 'error',
    });

    this.emit('business:order', { side, success });
  }

  /**
   * Record error
   */
  recordError(type: string, component: string): void {
    this.businessMetrics.errorsTotal++;
    this.incrementCounter('errors_total', { type, component });

    this.emit('error:recorded', { type, component });
  }

  /**
   * Increment a counter metric
   */
  private incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const values = this.values.get(name) || [];
    const existingIndex = values.findIndex((v) => this.labelsMatch(v.labels, labels));

    if (existingIndex >= 0) {
      values[existingIndex].value += value;
    } else {
      values.push({ value, labels, timestamp: Date.now() });
    }

    this.values.set(name, values);
  }

  /**
   * Set a gauge metric
   */
  private setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const values = this.values.get(name) || [];
    const existingIndex = values.findIndex((v) => this.labelsMatch(v.labels, labels));

    if (existingIndex >= 0) {
      values[existingIndex].value = value;

      values[existingIndex].timestamp = Date.now();
    } else {
      values.push({ value, labels, timestamp: Date.now() });
    }

    this.values.set(name, values);
  }

  /**
   * Record histogram metric
   */
  private recordHistogramMetric(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    // This is a simplified histogram recording - in a real implementation,
    // you'd want to maintain separate bucket counts per label combination
    const values = this.values.get(name) || [];

    values.push({ value, labels, timestamp: Date.now() });

    this.values.set(name, values);
  }

  /**
   * Record value in histogram buckets
   */
  private recordHistogram(histogram: HistogramBuckets, value: number): void {
    histogram.sum += value;

    histogram.count++;

    // Increment bucket counters
    for (const bucket of histogram.buckets) {
      if (value <= bucket) {
        histogram.values.set(bucket, (histogram.values.get(bucket) || 0) + 1);
      }
    }
    // Always increment +Inf bucket

    histogram.values.set(Infinity, (histogram.values.get(Infinity) || 0) + 1);
  }

  /**
   * Check if labels match
   */
  private labelsMatch(labels1?: Record<string, string>, labels2?: Record<string, string>): boolean {
    if (!labels1 && !labels2) return true;
    if (!labels1 || !labels2) return false;

    const keys1 = Object.keys(labels1).sort();
    const keys2 = Object.keys(labels2).sort();

    if (keys1.length !== keys2.length) return false;

    return keys1.every((key, index) => key === keys2[index] && labels1[key] === labels2[key]);
  }

  /**
   * Get all metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    let output = '';

    // Add process metrics
    this.setGauge('process_start_time_seconds', this.startTime / 1000);
    this.setGauge('process_uptime_seconds', (Date.now() - this.startTime) / 1000);

    // Generate metrics output
    for (const [name, definition] of this.metrics) {
      const values = this.values.get(name) || [];

      // Always add help and type comments, even if no values
      output += `# HELP ${name} ${definition.help}\n`;
      output += `# TYPE ${name} ${definition.type}\n`;

      // Add metric values if they exist
      if (values.length > 0) {
        for (const value of values) {
          const labelsStr = this.formatLabels(value.labels);
          output += `${name}${labelsStr} ${value.value}\n`;
        }
      }

      output += '\n';
    }

    return output;
  }

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    const labelPairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${value.replace(/"/g, '\\"')}"`)
      .join(',');

    return `{${labelPairs}}`;
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    totalMetrics: number;
    httpRequests: number;
    databaseQueries: number;
    errors: number;
    uptime: number;
  } {
    return {
      totalMetrics: this.metrics.size,
      httpRequests: this.httpMetrics.requestsTotal,
      databaseQueries: this.databaseMetrics.queriesTotal,
      errors: this.businessMetrics.errorsTotal,
      uptime: (Date.now() - this.startTime) / 1000,
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.values.clear();

    this.httpMetrics = this.initializeHttpMetrics();

    this.databaseMetrics = this.initializeDatabaseMetrics();

    this.healthMetrics = this.initializeHealthMetrics();

    this.businessMetrics = this.initializeBusinessMetrics();

    this.startTime = Date.now(); // Reset start time for accurate uptime calculation

    this.logger.info('Metrics collector reset');
  }
}
