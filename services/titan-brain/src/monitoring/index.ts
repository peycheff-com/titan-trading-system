/**
 * Titan Brain Monitoring - Barrel Export
 *
 * Exports Prometheus metrics and structured logging components.
 */

export {
  PrometheusMetrics,
  getMetrics,
  resetMetrics,
  type MetricType,
  type HistogramData,
  type MetricDefinition,
  type MetricValue,
} from './PrometheusMetrics.js';

export {
  StructuredLogger,
  getLogger,
  resetLogger,
  createRequestLogger,
  type LogLevel,
  type LogEntry,
  type LoggerConfig,
  type LogHandler,
} from './StructuredLogger.js';
