/**
 * MetricsCollector Tests
 * 
 * Comprehensive unit tests for the MetricsCollector class
 */

import { MetricsCollector, MetricType } from '../../src/metrics/MetricsCollector';
import { Logger } from '../../src/logging/Logger';

// Mock Logger
jest.mock('../../src/logging/Logger');
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as any;

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;
  
  beforeEach(() => {
    jest.clearAllMocks();
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
    
    metricsCollector = new MetricsCollector(mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with default metrics', () => {
      expect(metricsCollector).toBeDefined();
      
      const summary = metricsCollector.getMetricsSummary();
      expect(summary.totalMetrics).toBeGreaterThan(0);
      expect(summary.httpRequests).toBe(0);
      expect(summary.databaseQueries).toBe(0);
      expect(summary.errors).toBe(0);
    });

    it('should initialize without logger', () => {
      const collector = new MetricsCollector();
      expect(collector).toBeDefined();
    });
  });

  describe('metric registration', () => {
    it('should register custom metrics', () => {
      metricsCollector.registerMetric({
        name: 'custom_counter',
        type: MetricType.COUNTER,
        help: 'A custom counter metric',
        labels: ['type', 'status']
      });

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('# HELP custom_counter A custom counter metric');
      expect(prometheus).toContain('# TYPE custom_counter counter');
    });
  });

  describe('HTTP metrics', () => {
    it('should record HTTP request metrics', () => {
      metricsCollector.recordHttpRequest('GET', '/api/test', 200, 0.150, 1024);

      const summary = metricsCollector.getMetricsSummary();
      expect(summary.httpRequests).toBe(1);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('http_requests_total{method="GET",route="/api/test",status_code="200"} 1');
    });

    it('should track in-flight requests', () => {
      metricsCollector.recordHttpRequestStart();
      metricsCollector.recordHttpRequestStart();

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('http_requests_in_flight 2');

      metricsCollector.recordHttpRequestEnd();
      const prometheus2 = metricsCollector.getPrometheusMetrics();
      expect(prometheus2).toContain('http_requests_in_flight 1');
    });

    it('should not allow negative in-flight requests', () => {
      metricsCollector.recordHttpRequestEnd();
      metricsCollector.recordHttpRequestEnd();

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('http_requests_in_flight 0');
    });

    it('should emit HTTP request events', (done) => {
      metricsCollector.on('http:request', (data) => {
        expect(data.method).toBe('POST');
        expect(data.route).toBe('/api/users');
        expect(data.statusCode).toBe(201);
        expect(data.duration).toBe(0.250);
        expect(data.responseSize).toBe(512);
        done();
      });

      metricsCollector.recordHttpRequest('POST', '/api/users', 201, 0.250, 512);
    });
  });

  describe('database metrics', () => {
    it('should record database connection metrics', () => {
      metricsCollector.recordDatabaseConnections(5, 3, 2);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('database_connections_active 5');
      expect(prometheus).toContain('database_connections_idle 3');
      expect(prometheus).toContain('database_connections_waiting 2');
    });

    it('should record database query metrics', () => {
      metricsCollector.recordDatabaseQuery('SELECT', 0.025, true);
      metricsCollector.recordDatabaseQuery('INSERT', 0.050, false);

      const summary = metricsCollector.getMetricsSummary();
      expect(summary.databaseQueries).toBe(2);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('database_queries_total{operation="SELECT",status="success"} 1');
      expect(prometheus).toContain('database_queries_total{operation="INSERT",status="error"} 1');
    });

    it('should emit database events', (done) => {
      let eventCount = 0;
      
      metricsCollector.on('database:connections', (data) => {
        expect(data.active).toBe(10);
        expect(data.idle).toBe(5);
        expect(data.waiting).toBe(0);
        eventCount++;
        if (eventCount === 2) done();
      });

      metricsCollector.on('database:query', (data) => {
        expect(data.operation).toBe('UPDATE');
        expect(data.duration).toBe(0.075);
        expect(data.success).toBe(true);
        eventCount++;
        if (eventCount === 2) done();
      });

      metricsCollector.recordDatabaseConnections(10, 5, 0);
      metricsCollector.recordDatabaseQuery('UPDATE', 0.075, true);
    });
  });

  describe('health check metrics', () => {
    it('should record health check metrics', () => {
      metricsCollector.recordHealthCheck(true, 0.100);
      metricsCollector.recordHealthCheck(false, 0.200);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('health_check_status 0'); // Last value (false)
    });

    it('should record component health status', () => {
      metricsCollector.recordComponentHealth('database', true);
      metricsCollector.recordComponentHealth('redis', false);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('component_health_status{component="database"} 1');
      expect(prometheus).toContain('component_health_status{component="redis"} 0');
    });

    it('should emit health check events', (done) => {
      let eventCount = 0;
      
      metricsCollector.on('health:check', (data) => {
        expect(data.healthy).toBe(true);
        expect(data.duration).toBe(0.050);
        eventCount++;
        if (eventCount === 2) done();
      });

      metricsCollector.on('health:component', (data) => {
        expect(data.component).toBe('cache');
        expect(data.healthy).toBe(false);
        eventCount++;
        if (eventCount === 2) done();
      });

      metricsCollector.recordHealthCheck(true, 0.050);
      metricsCollector.recordComponentHealth('cache', false);
    });
  });

  describe('business metrics', () => {
    it('should record signal processing metrics', () => {
      metricsCollector.recordSignalProcessed('BUY', true);
      metricsCollector.recordSignalProcessed('SELL', false);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('signals_processed_total{type="BUY",status="success"} 1');
      expect(prometheus).toContain('signals_processed_total{type="SELL",status="error"} 1');
    });

    it('should record order execution metrics', () => {
      metricsCollector.recordOrderExecuted('BUY', true);
      metricsCollector.recordOrderExecuted('SELL', true);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('orders_executed_total{side="BUY",status="success"} 1');
      expect(prometheus).toContain('orders_executed_total{side="SELL",status="success"} 1');
    });

    it('should record error metrics', () => {
      metricsCollector.recordError('validation_error', 'api');
      metricsCollector.recordError('timeout_error', 'database');

      const summary = metricsCollector.getMetricsSummary();
      expect(summary.errors).toBe(2);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('errors_total{type="validation_error",component="api"} 1');
      expect(prometheus).toContain('errors_total{type="timeout_error",component="database"} 1');
    });

    it('should emit business events', (done) => {
      let eventCount = 0;
      
      metricsCollector.on('business:signal', (data) => {
        expect(data.type).toBe('LONG');
        expect(data.success).toBe(true);
        eventCount++;
        if (eventCount === 3) done();
      });

      metricsCollector.on('business:order', (data) => {
        expect(data.side).toBe('BUY');
        expect(data.success).toBe(false);
        eventCount++;
        if (eventCount === 3) done();
      });

      metricsCollector.on('error:recorded', (data) => {
        expect(data.type).toBe('network_error');
        expect(data.component).toBe('client');
        eventCount++;
        if (eventCount === 3) done();
      });

      metricsCollector.recordSignalProcessed('LONG', true);
      metricsCollector.recordOrderExecuted('BUY', false);
      metricsCollector.recordError('network_error', 'client');
    });
  });

  describe('Prometheus output', () => {
    it('should generate valid Prometheus format', () => {
      metricsCollector.recordHttpRequest('GET', '/test', 200, 0.100, 500);
      metricsCollector.recordDatabaseQuery('SELECT', 0.050, true);
      metricsCollector.recordHealthCheck(true, 0.025);

      const prometheus = metricsCollector.getPrometheusMetrics();
      
      // Check for required Prometheus format elements
      expect(prometheus).toContain('# HELP');
      expect(prometheus).toContain('# TYPE');
      expect(prometheus).toMatch(/\w+ \d+(\.\d+)?/); // Metric name and value
      
      // Check for process metrics
      expect(prometheus).toContain('process_start_time_seconds');
      expect(prometheus).toContain('process_uptime_seconds');
    });

    it('should handle labels with special characters', () => {
      metricsCollector.recordHttpRequest('GET', '/api/test"quote', 200, 0.100, 500);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('route="/api/test\\"quote"');
    });

    it('should handle empty labels', () => {
      metricsCollector.recordHealthCheck(true, 0.100);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('health_check_status 1');
      expect(prometheus).not.toContain('health_check_status{} 1');
    });
  });

  describe('metrics summary', () => {
    it('should provide accurate summary', async () => {
      metricsCollector.recordHttpRequest('GET', '/test', 200, 0.100, 500);
      metricsCollector.recordHttpRequest('POST', '/test', 201, 0.150, 600);
      metricsCollector.recordDatabaseQuery('SELECT', 0.050, true);
      metricsCollector.recordError('test_error', 'test_component');

      // Add small delay to ensure uptime > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      const summary = metricsCollector.getMetricsSummary();
      
      expect(summary.httpRequests).toBe(2);
      expect(summary.databaseQueries).toBe(1);
      expect(summary.errors).toBe(1);
      expect(summary.uptime).toBeGreaterThanOrEqual(0);
      expect(summary.totalMetrics).toBeGreaterThan(0);
    });
  });

  describe('reset functionality', () => {
    it('should reset all metrics', () => {
      metricsCollector.recordHttpRequest('GET', '/test', 200, 0.100, 500);
      metricsCollector.recordDatabaseQuery('SELECT', 0.050, true);
      metricsCollector.recordError('test_error', 'test_component');

      let summary = metricsCollector.getMetricsSummary();
      expect(summary.httpRequests).toBe(1);
      expect(summary.databaseQueries).toBe(1);
      expect(summary.errors).toBe(1);

      metricsCollector.reset();

      summary = metricsCollector.getMetricsSummary();
      expect(summary.httpRequests).toBe(0);
      expect(summary.databaseQueries).toBe(0);
      expect(summary.errors).toBe(0);
    });
  });

  describe('histogram functionality', () => {
    it('should record histogram values correctly', () => {
      // Record various durations to test histogram buckets
      metricsCollector.recordHttpRequest('GET', '/fast', 200, 0.001, 100);    // 1ms
      metricsCollector.recordHttpRequest('GET', '/medium', 200, 0.050, 500);  // 50ms
      metricsCollector.recordHttpRequest('GET', '/slow', 200, 1.500, 1000);   // 1.5s

      const prometheus = metricsCollector.getPrometheusMetrics();
      
      // Should contain histogram metrics
      expect(prometheus).toContain('http_request_duration_seconds');
      expect(prometheus).toContain('http_response_size_bytes');
    });
  });

  describe('label matching', () => {
    it('should correctly match labels for counter updates', () => {
      metricsCollector.recordHttpRequest('GET', '/test', 200, 0.100, 500);
      metricsCollector.recordHttpRequest('GET', '/test', 200, 0.150, 600);
      metricsCollector.recordHttpRequest('GET', '/test', 404, 0.050, 100);

      const prometheus = metricsCollector.getPrometheusMetrics();
      expect(prometheus).toContain('http_requests_total{method="GET",route="/test",status_code="200"} 2');
      expect(prometheus).toContain('http_requests_total{method="GET",route="/test",status_code="404"} 1');
    });
  });
});