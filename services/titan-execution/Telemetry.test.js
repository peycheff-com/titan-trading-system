/**
 * Telemetry Module Tests
 * 
 * Tests for telemetry emission and trade utilization metrics.
 * Requirements: 25.1-25.6, 58.1-58.7
 */

import { jest } from '@jest/globals';
import { Telemetry } from './Telemetry.js';

// Mock logger factory
const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('Telemetry', () => {
  let telemetry;
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    telemetry = new Telemetry({ logger: mockLogger });
  });

  afterEach(() => {
    telemetry.reset();
  });

  describe('Pipeline Latency (Requirement 25.1)', () => {
    it('should record pipeline latency', () => {
      telemetry.recordPipelineLatency(50);
      telemetry.recordPipelineLatency(100);
      telemetry.recordPipelineLatency(25);

      const stats = telemetry.getPipelineLatencyStats();
      expect(stats.count).toBe(3);
      expect(stats.mean).toBeCloseTo(58.33, 1);
      expect(stats.min).toBe(25);
      expect(stats.max).toBe(100);
    });

    it('should emit metric event on pipeline latency', () => {
      const metricHandler = jest.fn();
      telemetry.on('metric', metricHandler);

      telemetry.recordPipelineLatency(50);

      expect(metricHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'pipeline.latency_ms',
          value: 50,
        })
      );
    });
  });


  describe('Market Structure Score (Requirement 25.2)', () => {
    it('should record market structure scores in histogram', () => {
      telemetry.recordMarketStructureScore(75);
      telemetry.recordMarketStructureScore(85);
      telemetry.recordMarketStructureScore(60);

      const histogram = telemetry.getMarketStructureHistogram();
      expect(histogram.count).toBe(3);
      expect(histogram.mean).toBeCloseTo(73.33, 1);
    });

    it('should emit metric event on market structure score', () => {
      const metricHandler = jest.fn();
      telemetry.on('metric', metricHandler);

      telemetry.recordMarketStructureScore(80);

      expect(metricHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'market_structure_score',
          value: 80,
        })
      );
    });
  });

  describe('Execution Metrics (Requirement 25.4)', () => {
    it('should record execution metrics', () => {
      telemetry.recordExecution({
        signal_id: 'test_1',
        latency_ms: 50,
        slippage_pct: 0.05,
        fill_rate: 1.0,
      });

      const latencyStats = telemetry.getExecutionLatencyStats();
      const slippageStats = telemetry.getSlippageStats();

      expect(latencyStats.count).toBe(1);
      expect(latencyStats.mean).toBe(50);
      expect(slippageStats.count).toBe(1);
    });

    it('should emit metric event on execution', () => {
      const metricHandler = jest.fn();
      telemetry.on('metric', metricHandler);

      telemetry.recordExecution({
        signal_id: 'test_1',
        latency_ms: 50,
        slippage_pct: 0.05,
        fill_rate: 1.0,
      });

      expect(metricHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'execution',
          signal_id: 'test_1',
          latency_ms: 50,
          slippage_pct: 0.05,
          fill_rate: 1.0,
        })
      );
    });
  });

  describe('Feature Drift (Requirement 25.5)', () => {
    it('should calculate feature drift Z-Score', () => {
      telemetry.setFeatureBaseline('delta', 100, 20);

      // Record values that drift from baseline
      for (let i = 0; i < 10; i++) {
        telemetry.recordFeatureValue('delta', 150); // 2.5 stddev above mean
      }

      const drifts = telemetry.getFeatureDriftZScores();
      expect(drifts.delta.zscore).toBeCloseTo(2.5, 1);
    });

    it('should return null for features without baseline', () => {
      const result = telemetry.recordFeatureValue('unknown_feature', 100);
      expect(result).toBeNull();
    });

    it('should emit metric event on feature drift', () => {
      const metricHandler = jest.fn();
      telemetry.on('metric', metricHandler);

      telemetry.setFeatureBaseline('hurst', 0.5, 0.1);
      telemetry.recordFeatureValue('hurst', 0.6);

      expect(metricHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'feature_drift.zscore',
          feature_name: 'hurst',
        })
      );
    });
  });


  describe('Trade Utilization Metrics (Requirements 58.1-58.7)', () => {
    describe('Per-regime trade counts (Requirement 58.1)', () => {
      it('should track risk_on_trades', () => {
        telemetry.recordSignalExecuted({ signal_id: 'test_1', regime_state: 1 });
        telemetry.recordSignalExecuted({ signal_id: 'test_2', regime_state: 1 });

        const utilization = telemetry.getTradeUtilization();
        expect(utilization.risk_on_trades).toBe(2);
      });

      it('should track neutral_trades', () => {
        telemetry.recordSignalExecuted({ signal_id: 'test_1', regime_state: 0 });

        const utilization = telemetry.getTradeUtilization();
        expect(utilization.neutral_trades).toBe(1);
      });

      it('should track risk_off_blocked', () => {
        telemetry.recordSignalBlocked({ signal_id: 'test_1', veto_reason: 'vol_veto' });
        telemetry.recordSignalBlocked({ signal_id: 'test_2', veto_reason: 'entropy_veto' });

        const utilization = telemetry.getTradeUtilization();
        expect(utilization.risk_off_blocked).toBe(2);
      });
    });

    describe('Time in market (Requirement 58.2)', () => {
      it('should compute time_in_market_pct correctly', () => {
        // 100 bars total, 25 with position
        for (let i = 0; i < 100; i++) {
          telemetry.recordBar(i < 25);
        }

        const pct = telemetry.getTimeInMarketPct();
        expect(pct).toBe(0.25);
      });

      it('should return 0 when no bars recorded', () => {
        expect(telemetry.getTimeInMarketPct()).toBe(0);
      });
    });

    describe('Signal pass rate (Requirement 58.3)', () => {
      it('should compute signal_pass_rate correctly', () => {
        // Generate 10 signals, execute 3
        for (let i = 0; i < 10; i++) {
          telemetry.recordSignalGenerated({ signal_id: `sig_${i}`, regime_state: 1 });
        }
        for (let i = 0; i < 3; i++) {
          telemetry.recordSignalExecuted({ signal_id: `sig_${i}`, regime_state: 1 });
        }

        const rate = telemetry.getSignalPassRate();
        expect(rate).toBe(0.3);
      });

      it('should return 0 when no signals generated', () => {
        expect(telemetry.getSignalPassRate()).toBe(0);
      });
    });

    describe('Low time in market warning (Requirement 58.5)', () => {
      it('should warn when time_in_market_pct < 5%', () => {
        // Record 200 bars with only 5 having position (2.5%)
        for (let i = 0; i < 200; i++) {
          telemetry.recordBar(i < 5);
        }

        const alerts = telemetry.checkOverFilteringAlerts();
        expect(alerts.warnings.length).toBeGreaterThan(0);
        expect(alerts.warnings[0].type).toBe('LOW_TIME_IN_MARKET');
        expect(mockLogger.warn).toHaveBeenCalled();
      });

      it('should not warn when time_in_market_pct >= 5%', () => {
        // Record 100 bars with 10 having position (10%)
        for (let i = 0; i < 100; i++) {
          telemetry.recordBar(i < 10);
        }

        const alerts = telemetry.checkOverFilteringAlerts();
        const lowTimeWarning = alerts.warnings.find(w => w.type === 'LOW_TIME_IN_MARKET');
        expect(lowTimeWarning).toBeUndefined();
      });
    });


    describe('Veto breakdown tracking (Requirement 58.6)', () => {
      it('should track breakdown by veto reason', () => {
        telemetry.recordSignalBlocked({ signal_id: 'test_1', veto_reason: 'entropy_veto' });
        telemetry.recordSignalBlocked({ signal_id: 'test_2', veto_reason: 'entropy_veto' });
        telemetry.recordSignalBlocked({ signal_id: 'test_3', veto_reason: 'vol_veto' });
        telemetry.recordSignalBlocked({ signal_id: 'test_4', veto_reason: 'session_veto' });

        const utilization = telemetry.getTradeUtilization();
        expect(utilization.veto_breakdown.entropy_veto).toBe(2);
        expect(utilization.veto_breakdown.vol_veto).toBe(1);
        expect(utilization.veto_breakdown.session_veto).toBe(1);
      });
    });

    describe('Veto recommendation (Requirement 58.7)', () => {
      it('should identify top veto reason', () => {
        telemetry.recordSignalBlocked({ signal_id: 'test_1', veto_reason: 'entropy_veto' });
        telemetry.recordSignalBlocked({ signal_id: 'test_2', veto_reason: 'entropy_veto' });
        telemetry.recordSignalBlocked({ signal_id: 'test_3', veto_reason: 'entropy_veto' });
        telemetry.recordSignalBlocked({ signal_id: 'test_4', veto_reason: 'vol_veto' });

        const recommendation = telemetry.getVetoRecommendation();
        expect(recommendation.top_veto).toBe('entropy_veto');
        expect(recommendation.top_veto_count).toBe(3);
        expect(recommendation.top_veto_pct).toBe(75);
        expect(recommendation.recommendation).toContain('entropy');
      });

      it('should provide appropriate recommendation for each veto type', () => {
        const vetoTypes = [
          'entropy_veto',
          'vol_veto',
          'econ_veto',
          'session_veto',
          'correlation_veto',
          'l2_rejection',
          'spread_exceeded',
          'obi_rejection',
        ];

        for (const vetoType of vetoTypes) {
          telemetry.reset();
          telemetry.recordSignalBlocked({ signal_id: 'test', veto_reason: vetoType });

          const recommendation = telemetry.getVetoRecommendation();
          expect(recommendation.top_veto).toBe(vetoType);
          expect(recommendation.recommendation.length).toBeGreaterThan(0);
        }
      });

      it('should return no recommendation when no vetoes', () => {
        const recommendation = telemetry.getVetoRecommendation();
        expect(recommendation.top_veto).toBeNull();
        expect(recommendation.recommendation).toContain('No vetoes');
      });
    });
  });

  describe('Structured Logging (Requirement 25.6)', () => {
    it('should log signals with structured JSON format', () => {
      telemetry.logSignal({
        signal_id: 'titan_BTCUSDT_12345_15',
        symbol: 'BTCUSDT',
        timeframe: '15',
        regime_vector: { trend_state: 1, vol_state: 1 },
        market_structure: { score: 85 },
        decision: 'EXECUTE',
        payload: { entry: 50000 },
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'signal',
          signal_id: 'titan_BTCUSDT_12345_15',
          symbol: 'BTCUSDT',
          active_tf: '15',
          decision: 'EXECUTE',
        }),
        expect.any(String)
      );
    });
  });


  describe('Status and Reset', () => {
    it('should return comprehensive status', () => {
      telemetry.recordPipelineLatency(50);
      telemetry.recordMarketStructureScore(80);
      telemetry.recordExecution({
        signal_id: 'test_1',
        latency_ms: 25,
        slippage_pct: 0.01,
        fill_rate: 1.0,
      });
      telemetry.recordSignalGenerated({ signal_id: 'test_1', regime_state: 1 });
      telemetry.recordSignalExecuted({ signal_id: 'test_1', regime_state: 1 });

      const status = telemetry.getStatus();

      expect(status.pipeline.latency.count).toBe(1);
      expect(status.market_structure.histogram.count).toBe(1);
      expect(status.execution.latency.count).toBe(1);
      expect(status.trade_utilization.signals_generated).toBe(1);
      expect(status.trade_utilization.signals_executed).toBe(1);
      expect(status.timestamp).toBeDefined();
    });

    it('should reset all counters', () => {
      telemetry.recordPipelineLatency(50);
      telemetry.recordMarketStructureScore(80);
      telemetry.recordSignalGenerated({ signal_id: 'test_1', regime_state: 1 });
      telemetry.recordSignalBlocked({ signal_id: 'test_2', veto_reason: 'vol_veto' });

      telemetry.reset();

      const status = telemetry.getStatus();
      expect(status.pipeline.latency.count).toBe(0);
      expect(status.market_structure.histogram.count).toBe(0);
      expect(status.trade_utilization.signals_generated).toBe(0);
      expect(status.trade_utilization.veto_breakdown.vol_veto).toBe(0);
    });
  });

  describe('Daily Statistics', () => {
    it('should track daily statistics', () => {
      telemetry.recordSignalGenerated({ signal_id: 'test_1', regime_state: 1 });
      telemetry.recordSignalExecuted({ signal_id: 'test_1', regime_state: 1 });
      telemetry.recordBar(true);
      telemetry.recordBar(false);

      const dailyStats = telemetry.getDailyStats(1);
      expect(dailyStats.length).toBe(1);
      expect(dailyStats[0].signals_generated).toBe(1);
      expect(dailyStats[0].signals_executed).toBe(1);
      expect(dailyStats[0].bars_total).toBe(2);
      expect(dailyStats[0].bars_with_position).toBe(1);
    });
  });

  describe('Histogram', () => {
    it('should correctly bucket values', () => {
      // Test with market structure histogram (buckets: 0, 10, 20, ..., 100)
      telemetry.recordMarketStructureScore(5);   // bucket 0-10
      telemetry.recordMarketStructureScore(15);  // bucket 10-20
      telemetry.recordMarketStructureScore(95);  // bucket 90-100
      telemetry.recordMarketStructureScore(105); // bucket > 100

      const histogram = telemetry.getMarketStructureHistogram();
      expect(histogram.count).toBe(4);
      expect(histogram.min).toBe(5);
      expect(histogram.max).toBe(105);
    });
  });
});
