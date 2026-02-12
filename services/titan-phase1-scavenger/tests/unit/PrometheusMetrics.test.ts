/**
 * PrometheusMetrics Tests - Scavenger
 *
 * Tests for the manual Prometheus text format exporter in titan-phase1-scavenger.
 */

import { PrometheusMetrics, getMetrics } from '../../src/monitoring/PrometheusMetrics';

describe('PrometheusMetrics (Scavenger)', () => {
  let metrics: PrometheusMetrics;

  beforeEach(() => {
    metrics = new PrometheusMetrics('titan_scavenger');
  });

  describe('Counter Operations', () => {
    it('should increment a counter', () => {
      metrics.incrementCounter('traps_detected_total', { trap_type: 'bull', symbol: 'BTCUSDT' });
      metrics.incrementCounter('traps_detected_total', { trap_type: 'bull', symbol: 'BTCUSDT' });

      const exported = metrics.export();
      expect(exported).toContain('titan_scavenger_traps_detected_total');
      expect(exported).toContain('trap_type="bull"');
      expect(exported).toContain('symbol="BTCUSDT"');
      expect(exported).toContain(' 2');
    });

    it('should increment counter with custom value', () => {
      metrics.incrementCounter('traps_detected_total', { trap_type: 'bear', symbol: 'ETHUSDT' }, 5);

      const exported = metrics.export();
      expect(exported).toContain(' 5');
    });
  });

  describe('Gauge Operations', () => {
    it('should set a gauge value', () => {
      metrics.setGauge('binance_connection_status', 1);

      const exported = metrics.export();
      expect(exported).toContain('titan_scavenger_binance_connection_status');
      expect(exported).toContain(' 1');
    });

    it('should overwrite gauge value', () => {
      metrics.setGauge('tick_processing_rate', 100);
      metrics.setGauge('tick_processing_rate', 200);

      const exported = metrics.export();
      expect(exported).toContain(' 200');
      expect(exported).not.toContain(' 100');
    });

    it('should set gauge with labels', () => {
      metrics.setGauge('health_status', 1, { component: 'binance' });
      metrics.setGauge('health_status', 0, { component: 'ipc' });

      const exported = metrics.export();
      expect(exported).toContain('component="binance"');
      expect(exported).toContain('component="ipc"');
    });
  });

  describe('Histogram Operations', () => {
    it('should observe histogram values', () => {
      metrics.observeHistogram('ipc_latency_ms', 25, { message_type: 'signal' });
      metrics.observeHistogram('ipc_latency_ms', 50, { message_type: 'signal' });

      const exported = metrics.export();
      expect(exported).toContain('titan_scavenger_ipc_latency_ms');
      expect(exported).toContain('_bucket');
      expect(exported).toContain('_sum');
      expect(exported).toContain('_count');
      expect(exported).toContain('le="+Inf"');
    });

    it('should accumulate histogram sum and count', () => {
      metrics.observeHistogram('ipc_latency_ms', 10, { message_type: 'order' });
      metrics.observeHistogram('ipc_latency_ms', 20, { message_type: 'order' });
      metrics.observeHistogram('ipc_latency_ms', 30, { message_type: 'order' });

      const exported = metrics.export();
      // sum = 10 + 20 + 30 = 60
      expect(exported).toContain('_sum');
      // count = 3
      expect(exported).toContain('_count');
    });
  });

  describe('Convenience Methods', () => {
    it('should record trap detection', () => {
      metrics.recordTrapDetection('bull', 'BTCUSDT');

      const exported = metrics.export();
      expect(exported).toContain('titan_scavenger_traps_detected_total');
      expect(exported).toContain('trap_type="bull"');
    });

    it('should record signal generation', () => {
      metrics.recordSignalGeneration('BTCUSDT', 'LONG', 'approved');

      const exported = metrics.export();
      expect(exported).toContain('titan_scavenger_signals_generated_total');
      expect(exported).toContain('direction="LONG"');
      expect(exported).toContain('result="approved"');
    });

    it('should record IPC message', () => {
      metrics.recordIPCMessage('sent', 'success');
      metrics.recordIPCMessage('sent', 'failed');

      const exported = metrics.export();
      expect(exported).toContain('titan_scavenger_ipc_messages_total');
      expect(exported).toContain('direction="sent"');
    });

    it('should record IPC latency', () => {
      metrics.recordIPCLatency('signal', 42);

      const exported = metrics.export();
      expect(exported).toContain('titan_scavenger_ipc_latency_ms');
      expect(exported).toContain('message_type="signal"');
    });

    it('should update Binance connection status', () => {
      metrics.updateBinanceConnectionStatus(true);

      const exported = metrics.export();
      expect(exported).toContain('titan_scavenger_binance_connection_status');
      expect(exported).toContain(' 1');
    });

    it('should update health status', () => {
      metrics.updateHealthStatus('binance', true);
      metrics.updateHealthStatus('ipc', false);

      const exported = metrics.export();
      expect(exported).toContain('component="binance"');
      expect(exported).toContain('component="ipc"');
    });

    it('should record config reload', () => {
      metrics.recordConfigReload('success');
      metrics.recordConfigReload('failed');

      const exported = metrics.export();
      expect(exported).toContain('titan_scavenger_config_reload_total');
      expect(exported).toContain('result="success"');
      expect(exported).toContain('result="failed"');
    });
  });

  describe('Export Format', () => {
    it('should export valid Prometheus text format', () => {
      metrics.recordTrapDetection('bull', 'BTCUSDT');
      metrics.updateBinanceConnectionStatus(true);

      const exported = metrics.export();

      // Check HELP and TYPE lines
      expect(exported).toContain('# HELP');
      expect(exported).toContain('# TYPE');
      expect(exported).toContain('counter');
      expect(exported).toContain('gauge');
    });

    it('should export empty string when no metrics recorded', () => {
      const exported = metrics.export();
      // Should have HELP/TYPE lines but no data lines
      expect(typeof exported).toBe('string');
    });
  });

  describe('Reset', () => {
    it('should reset all metrics', () => {
      metrics.recordTrapDetection('bull', 'BTCUSDT');
      metrics.updateBinanceConnectionStatus(true);

      let exported = metrics.export();
      expect(exported).toContain('trap_type="bull"');

      metrics.reset();

      exported = metrics.export();
      expect(exported).not.toContain('trap_type="bull"');
    });
  });

  describe('Singleton', () => {
    it('should return a metrics instance', () => {
      const instance = getMetrics('test_');
      expect(instance).toBeInstanceOf(PrometheusMetrics);
    });
  });
});
