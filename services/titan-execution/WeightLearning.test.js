/**
 * WeightLearning Unit Tests
 * 
 * Tests for Regime-Conditional Weight Learning module.
 * Requirements: 43.1-43.8
 */

import { jest } from '@jest/globals';
import { WeightLearning, VOL_STATE, META_RULE, CONFIG } from './WeightLearning.js';

describe('WeightLearning', () => {
  let weightLearning;
  let mockLogger;
  
  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    
    weightLearning = new WeightLearning({
      logger: mockLogger,
      baseWeights: {
        trend_weight: 0.30,
        momentum_weight: 0.25,
        vol_weight: 0.15,
        macro_weight: 0.10,
        mean_revert_weight: 0.20,
      },
      sampleSizeThreshold: 10, // Lower for testing
    });
  });
  
  afterEach(() => {
    if (weightLearning) {
      weightLearning.destroy();
    }
  });

  describe('constructor', () => {
    it('should initialize with default base weights', () => {
      const wl = new WeightLearning({});
      const weights = wl.getBaseWeights();
      
      expect(weights.trend_weight).toBe(0.30);
      expect(weights.momentum_weight).toBe(0.25);
      expect(weights.vol_weight).toBe(0.15);
      expect(weights.macro_weight).toBe(0.10);
      expect(weights.mean_revert_weight).toBe(0.20);
      
      wl.destroy();
    });
    
    it('should accept custom base weights', () => {
      const customWeights = {
        trend_weight: 0.40,
        momentum_weight: 0.20,
        vol_weight: 0.10,
        macro_weight: 0.15,
        mean_revert_weight: 0.15,
      };
      
      const wl = new WeightLearning({ baseWeights: customWeights });
      const weights = wl.getBaseWeights();
      
      expect(weights).toEqual(customWeights);
      
      wl.destroy();
    });
  });


  describe('getAdjustedWeights', () => {
    // Requirement 43.2: vol_state == Low → increase trend_weight by 30%
    it('should increase trend_weight by 30% when vol_state is Low', () => {
      const weights = weightLearning.getAdjustedWeights(VOL_STATE.LOW);
      
      expect(weights.trend_weight).toBeCloseTo(0.30 * 1.3, 4);
      expect(weights.momentum_weight).toBe(0.25);
      expect(weights.vol_weight).toBe(0.15);
      expect(weights.macro_weight).toBe(0.10);
      expect(weights.mean_revert_weight).toBe(0.20);
      expect(weights.applied_meta_rule).toBe(META_RULE.LOW_VOL_TREND_BOOST);
      expect(weights.vol_state).toBe(VOL_STATE.LOW);
    });
    
    // Requirement 43.3: vol_state == High → increase mean_revert_weight by 30%
    it('should increase mean_revert_weight by 30% when vol_state is High', () => {
      const weights = weightLearning.getAdjustedWeights(VOL_STATE.HIGH);
      
      expect(weights.trend_weight).toBe(0.30);
      expect(weights.momentum_weight).toBe(0.25);
      expect(weights.vol_weight).toBe(0.15);
      expect(weights.macro_weight).toBe(0.10);
      expect(weights.mean_revert_weight).toBeCloseTo(0.20 * 1.3, 4);
      expect(weights.applied_meta_rule).toBe(META_RULE.HIGH_VOL_MEAN_REVERT_BOOST);
      expect(weights.vol_state).toBe(VOL_STATE.HIGH);
    });
    
    // Requirement 43.4: vol_state == Normal → use base weights
    it('should use base weights when vol_state is Normal', () => {
      const weights = weightLearning.getAdjustedWeights(VOL_STATE.NORMAL);
      
      expect(weights.trend_weight).toBe(0.30);
      expect(weights.momentum_weight).toBe(0.25);
      expect(weights.vol_weight).toBe(0.15);
      expect(weights.macro_weight).toBe(0.10);
      expect(weights.mean_revert_weight).toBe(0.20);
      expect(weights.applied_meta_rule).toBe(META_RULE.NORMAL_VOL_BASE_WEIGHTS);
      expect(weights.vol_state).toBe(VOL_STATE.NORMAL);
    });
    
    it('should cap weights at 1.0', () => {
      const wl = new WeightLearning({
        baseWeights: {
          trend_weight: 0.90,
          momentum_weight: 0.25,
          vol_weight: 0.15,
          macro_weight: 0.10,
          mean_revert_weight: 0.90,
        },
      });
      
      const lowVolWeights = wl.getAdjustedWeights(VOL_STATE.LOW);
      expect(lowVolWeights.trend_weight).toBe(1.0);
      
      const highVolWeights = wl.getAdjustedWeights(VOL_STATE.HIGH);
      expect(highVolWeights.mean_revert_weight).toBe(1.0);
      
      wl.destroy();
    });
    
    it('should handle invalid vol_state gracefully', () => {
      const weights = weightLearning.getAdjustedWeights(99);
      
      expect(weights.applied_meta_rule).toBe(META_RULE.NORMAL_VOL_BASE_WEIGHTS);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
    
    // Requirement 43.7: Log weight adjustments
    it('should log weight adjustments', () => {
      weightLearning.getAdjustedWeights(VOL_STATE.LOW);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          vol_state: VOL_STATE.LOW,
          applied_meta_rule: META_RULE.LOW_VOL_TREND_BOOST,
        }),
        'Weight adjustment applied'
      );
    });
    
    it('should emit weights_adjusted event', () => {
      const listener = jest.fn();
      weightLearning.on('weights_adjusted', listener);
      
      weightLearning.getAdjustedWeights(VOL_STATE.HIGH);
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          vol_state: VOL_STATE.HIGH,
          applied_meta_rule: META_RULE.HIGH_VOL_MEAN_REVERT_BOOST,
        })
      );
    });
  });


  describe('recordTradeOutcome', () => {
    // Requirement 43.1: Track feature importance from trade outcomes
    it('should record trade outcomes', () => {
      weightLearning.recordTradeOutcome({
        signal_id: 'test_1',
        vol_state: VOL_STATE.LOW,
        trend_score: 80,
        momentum_score: 70,
        vol_score: 50,
        macro_score: 60,
        model_recommendation: 'TREND_FOLLOW',
        pnl: 100,
      });
      
      const outcomes = weightLearning.getTradeOutcomes();
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].signal_id).toBe('test_1');
      expect(outcomes[0].is_winner).toBe(true);
    });
    
    it('should group outcomes by meta-rule', () => {
      weightLearning.recordTradeOutcome({
        signal_id: 'low_vol_1',
        vol_state: VOL_STATE.LOW,
        trend_score: 80,
        pnl: 100,
      });
      
      weightLearning.recordTradeOutcome({
        signal_id: 'high_vol_1',
        vol_state: VOL_STATE.HIGH,
        trend_score: 30,
        pnl: -50,
      });
      
      const lowVolOutcomes = weightLearning.getOutcomesByRule(META_RULE.LOW_VOL_TREND_BOOST);
      const highVolOutcomes = weightLearning.getOutcomesByRule(META_RULE.HIGH_VOL_MEAN_REVERT_BOOST);
      
      expect(lowVolOutcomes).toHaveLength(1);
      expect(highVolOutcomes).toHaveLength(1);
    });
    
    it('should emit trade_recorded event', () => {
      const listener = jest.fn();
      weightLearning.on('trade_recorded', listener);
      
      weightLearning.recordTradeOutcome({
        signal_id: 'test_1',
        vol_state: VOL_STATE.NORMAL,
        pnl: 50,
      });
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          total_trades: 1,
        })
      );
    });
    
    it('should throw if instance is destroyed', () => {
      weightLearning.destroy();
      
      expect(() => {
        weightLearning.recordTradeOutcome({
          signal_id: 'test',
          vol_state: VOL_STATE.NORMAL,
          pnl: 0,
        });
      }).toThrow('WeightLearning has been destroyed');
    });
  });

  describe('calculateFeatureImportance', () => {
    it('should return zero correlations with insufficient data', () => {
      const importance = weightLearning.calculateFeatureImportance();
      
      expect(importance.trend_correlation).toBe(0);
      expect(importance.momentum_correlation).toBe(0);
      expect(importance.sample_size).toBe(0);
    });
    
    it('should calculate correlations with sufficient data', () => {
      // Add trades where high trend_score correlates with wins
      for (let i = 0; i < 10; i++) {
        weightLearning.recordTradeOutcome({
          signal_id: `test_${i}`,
          vol_state: VOL_STATE.NORMAL,
          trend_score: i < 5 ? 30 : 80,
          momentum_score: 50,
          vol_score: 50,
          macro_score: 50,
          pnl: i < 5 ? -50 : 100,
        });
      }
      
      const importance = weightLearning.calculateFeatureImportance();
      
      expect(importance.sample_size).toBe(10);
      expect(importance.trend_correlation).toBeGreaterThan(0);
    });
  });


  describe('pushWeightsToPine', () => {
    // Requirement 43.8: Push updated weights to Pine via webhook
    it('should push weights to Pine webhook', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      
      const wl = new WeightLearning({
        pineWebhookUrl: 'http://localhost:3000/weights',
        fetchFn: mockFetch,
        logger: mockLogger,
      });
      
      const weights = wl.getAdjustedWeights(VOL_STATE.LOW);
      const result = await wl.pushWeightsToPine(weights);
      
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/weights',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      
      wl.destroy();
    });
    
    it('should return false if webhook URL not configured', async () => {
      const result = await weightLearning.pushWeightsToPine({
        trend_weight: 0.30,
        applied_meta_rule: META_RULE.NORMAL_VOL_BASE_WEIGHTS,
        vol_state: VOL_STATE.NORMAL,
      });
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
    
    it('should handle webhook errors gracefully', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      const wl = new WeightLearning({
        pineWebhookUrl: 'http://localhost:3000/weights',
        fetchFn: mockFetch,
        logger: mockLogger,
      });
      
      const weights = wl.getAdjustedWeights(VOL_STATE.NORMAL);
      const result = await wl.pushWeightsToPine(weights);
      
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
      
      wl.destroy();
    });
    
    it('should emit weights_pushed event on success', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const listener = jest.fn();
      
      const wl = new WeightLearning({
        pineWebhookUrl: 'http://localhost:3000/weights',
        fetchFn: mockFetch,
        logger: mockLogger,
      });
      wl.on('weights_pushed', listener);
      
      const weights = wl.getAdjustedWeights(VOL_STATE.HIGH);
      await wl.pushWeightsToPine(weights);
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          applied_meta_rule: META_RULE.HIGH_VOL_MEAN_REVERT_BOOST,
        })
      );
      
      wl.destroy();
    });
  });

  describe('deviation alert', () => {
    // Requirement 43.6: Alert operator if meta-rule performance deviates
    it('should emit deviation_alert when performance deviates', async () => {
      // Create instance with lower threshold for testing
      const wl = new WeightLearning({
        logger: mockLogger,
        sampleSizeThreshold: 10,
        correlationWindow: 15,
        deviationThreshold: 0.2, // Lower threshold for easier triggering
      });
      
      const listener = jest.fn();
      wl.on('deviation_alert', listener);
      
      // Add trades that show strong deviation - low vol trades losing when trend is high
      // This creates negative correlation between trend_score and wins (opposite of expected)
      for (let i = 0; i < 15; i++) {
        wl.recordTradeOutcome({
          signal_id: `test_${i}`,
          vol_state: VOL_STATE.LOW,
          trend_score: i < 8 ? 90 : 20, // High trend = loss, low trend = win
          momentum_score: 70,
          vol_score: 50,
          macro_score: 60,
          pnl: i < 8 ? -100 : 100, // First 8 lose, last 7 win
        });
      }
      
      // Wait for async validation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if deviation was detected
      expect(wl.hasDeviationAlert()).toBe(true);
      
      wl.destroy();
    });
    
    it('should clear deviation alert', () => {
      weightLearning._hasDeviationAlert = true;
      
      weightLearning.clearDeviationAlert();
      
      expect(weightLearning.hasDeviationAlert()).toBe(false);
    });
  });


  describe('getStatus', () => {
    it('should return complete status', () => {
      weightLearning.getAdjustedWeights(VOL_STATE.LOW);
      
      const status = weightLearning.getStatus();
      
      expect(status.base_weights).toBeDefined();
      expect(status.current_weights).toBeDefined();
      expect(status.total_trades).toBe(0);
      expect(status.feature_importance).toBeDefined();
      expect(status.meta_rule_performance).toBeDefined();
      expect(status.has_deviation_alert).toBe(false);
      expect(status.timestamp).toBeDefined();
    });
    
    it('should track meta-rule performance', () => {
      // Add some trades
      weightLearning.recordTradeOutcome({
        signal_id: 'test_1',
        vol_state: VOL_STATE.LOW,
        trend_score: 80,
        pnl: 100,
      });
      
      weightLearning.recordTradeOutcome({
        signal_id: 'test_2',
        vol_state: VOL_STATE.LOW,
        trend_score: 70,
        pnl: -50,
      });
      
      const status = weightLearning.getStatus();
      const lowVolPerf = status.meta_rule_performance[META_RULE.LOW_VOL_TREND_BOOST];
      
      expect(lowVolPerf.sample_size).toBe(2);
      expect(lowVolPerf.win_rate).toBe(0.5);
    });
  });

  describe('configuration methods', () => {
    it('should update base weights', () => {
      weightLearning.setBaseWeights({
        trend_weight: 0.40,
        momentum_weight: 0.30,
      });
      
      const weights = weightLearning.getBaseWeights();
      expect(weights.trend_weight).toBe(0.40);
      expect(weights.momentum_weight).toBe(0.30);
      // Others should remain unchanged
      expect(weights.vol_weight).toBe(0.15);
    });
    
    it('should update Pine webhook URL', () => {
      weightLearning.setPineWebhookUrl('http://new-url.com/weights');
      
      expect(weightLearning.pineWebhookUrl).toBe('http://new-url.com/weights');
    });
    
    it('should reset all trade history', () => {
      weightLearning.recordTradeOutcome({
        signal_id: 'test_1',
        vol_state: VOL_STATE.NORMAL,
        pnl: 100,
      });
      
      weightLearning.getAdjustedWeights(VOL_STATE.LOW);
      
      weightLearning.reset();
      
      expect(weightLearning.getTradeOutcomes()).toHaveLength(0);
      expect(weightLearning.getCurrentWeights()).toBeNull();
      expect(weightLearning.hasDeviationAlert()).toBe(false);
    });
  });

  describe('VOL_STATE constants', () => {
    it('should have correct values', () => {
      expect(VOL_STATE.LOW).toBe(0);
      expect(VOL_STATE.NORMAL).toBe(1);
      expect(VOL_STATE.HIGH).toBe(2);
    });
  });

  describe('META_RULE constants', () => {
    it('should have correct values', () => {
      expect(META_RULE.LOW_VOL_TREND_BOOST).toBe('LOW_VOL_TREND_BOOST');
      expect(META_RULE.HIGH_VOL_MEAN_REVERT_BOOST).toBe('HIGH_VOL_MEAN_REVERT_BOOST');
      expect(META_RULE.NORMAL_VOL_BASE_WEIGHTS).toBe('NORMAL_VOL_BASE_WEIGHTS');
    });
  });
});
