/**
 * MLIntegration Unit Tests
 * 
 * Tests for ML Integration Module
 * Requirements: 48.1-48.6
 */

import { jest } from '@jest/globals';
import { MLIntegration } from './MLIntegration.js';

// Mock logger
const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

// Mock fetch function
const createMockFetch = (response, shouldFail = false) => {
  return jest.fn(() => {
    if (shouldFail) {
      return Promise.reject(new Error('Network error'));
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    });
  });
};

describe('MLIntegration', () => {
  let mlIntegration;
  let mockLogger;
  let mockFetch;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockFetch = createMockFetch({
      signal: 1,
      confidence: 0.8,
      model_id: 'test-model',
      timestamp: new Date().toISOString(),
    });

    mlIntegration = new MLIntegration({
      mlServiceUrl: 'http://localhost:8080/ml',
      apiKey: 'test-api-key',
      logger: mockLogger,
      pollIntervalMs: 1000,
      accuracyWindow: 30,
      minAccuracy: 0.5,
      confidenceBoost: 0.2,
      confidencePenalty: 0.3,
      requestTimeoutMs: 5000,
      retryAttempts: 2,
      retryDelayMs: 100,
      fetchFn: mockFetch,
    });
  });

  afterEach(() => {
    if (mlIntegration) {
      mlIntegration.stop();
      mlIntegration.destroy();
    }
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Constructor', () => {
    test('should initialize with default values', () => {
      const ml = new MLIntegration({});
      expect(ml.pollIntervalMs).toBe(60000);
      expect(ml.accuracyWindow).toBe(30);
      expect(ml.minAccuracy).toBe(0.5);
      expect(ml.confidenceBoost).toBe(0.2);
      expect(ml.confidencePenalty).toBe(0.3);
      ml.destroy();
    });

    test('should accept custom configuration', () => {
      expect(mlIntegration.mlServiceUrl).toBe('http://localhost:8080/ml');
      expect(mlIntegration.pollIntervalMs).toBe(1000);
      expect(mlIntegration.accuracyWindow).toBe(30);
      expect(mlIntegration.minAccuracy).toBe(0.5);
    });
  });

  describe('Start/Stop', () => {
    test('should start polling', () => {
      mlIntegration.start(['BTCUSDT']);
      expect(mlIntegration.isPolling()).toBe(true);
    });

    test('should stop polling', () => {
      mlIntegration.start(['BTCUSDT']);
      mlIntegration.stop();
      expect(mlIntegration.isPolling()).toBe(false);
    });

    test('should warn if ML service URL not configured', () => {
      const ml = new MLIntegration({ logger: mockLogger });
      ml.start(['BTCUSDT']);
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(ml.isEnabled()).toBe(false);
      ml.destroy();
    });

    test('should throw error if destroyed', () => {
      mlIntegration.destroy();
      expect(() => mlIntegration.start(['BTCUSDT'])).toThrow('MLIntegration has been destroyed');
    });
  });

  describe('ML Signal Integration - Requirement 48.2', () => {
    test('should return null if ML is disabled', () => {
      mlIntegration.disable();
      const signal = mlIntegration.getMLSignal('BTCUSDT');
      expect(signal).toBeNull();
    });

    test('should return null if no prediction available', () => {
      const signal = mlIntegration.getMLSignal('BTCUSDT');
      expect(signal).toBeNull();
    });

    test('should return prediction if available', () => {
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      const signal = mlIntegration.getMLSignal('BTCUSDT');
      expect(signal).not.toBeNull();
      expect(signal.signal).toBe(1);
      expect(signal.confidence).toBe(0.8);
    });
  });

  describe('Confidence Adjustment - Requirements 48.3, 48.4', () => {
    beforeEach(() => {
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
    });

    test('should increase confidence by 20% on agreement (Requirement 48.4)', () => {
      const result = mlIntegration.adjustConfidence(1, 0.7, 'BTCUSDT');
      
      expect(result.integration_status).toBe('AGREEMENT');
      expect(result.adjusted_confidence).toBeCloseTo(0.84, 2); // 0.7 * 1.2 = 0.84
      expect(result.adjustment).toBe(0.2);
    });

    test('should reduce confidence by 30% on conflict (Requirement 48.3)', () => {
      const result = mlIntegration.adjustConfidence(-1, 0.7, 'BTCUSDT');
      
      expect(result.integration_status).toBe('CONFLICT');
      expect(result.adjusted_confidence).toBeCloseTo(0.49, 2); // 0.7 * 0.7 = 0.49
      expect(result.adjustment).toBe(-0.3);
    });

    test('should not adjust confidence when ML signal is HOLD', () => {
      mlIntegration.setPrediction('BTCUSDT', 0, 0.8);
      const result = mlIntegration.adjustConfidence(1, 0.7, 'BTCUSDT');
      
      expect(result.integration_status).toBe('NEUTRAL');
      expect(result.adjusted_confidence).toBe(0.7);
      expect(result.adjustment).toBe(0);
    });

    test('should not adjust confidence when regime signal is 0', () => {
      const result = mlIntegration.adjustConfidence(0, 0.7, 'BTCUSDT');
      
      expect(result.integration_status).toBe('NEUTRAL');
      expect(result.adjusted_confidence).toBe(0.7);
    });

    test('should cap adjusted confidence at 1.0', () => {
      const result = mlIntegration.adjustConfidence(1, 0.95, 'BTCUSDT');
      
      expect(result.adjusted_confidence).toBeLessThanOrEqual(1.0);
    });

    test('should not go below 0', () => {
      mlIntegration.setPrediction('BTCUSDT', -1, 0.8);
      const result = mlIntegration.adjustConfidence(1, 0.1, 'BTCUSDT');
      
      expect(result.adjusted_confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ML Unavailable - Requirement 48.5', () => {
    test('should return regime-only confidence when ML is disabled', () => {
      mlIntegration.disable();
      const result = mlIntegration.adjustConfidence(1, 0.7, 'BTCUSDT');
      
      expect(result.integration_status).toBe('ML_UNAVAILABLE');
      expect(result.adjusted_confidence).toBe(0.7);
      expect(result.ml_signal).toBeNull();
    });

    test('should return regime-only confidence when service unavailable', () => {
      // Service is not available by default (no successful fetch)
      const result = mlIntegration.adjustConfidence(1, 0.7, 'BTCUSDT');
      
      expect(result.integration_status).toBe('ML_UNAVAILABLE');
      expect(result.adjusted_confidence).toBe(0.7);
    });

    test('should return regime-only confidence when no prediction for symbol', () => {
      mlIntegration.setPrediction('ETHUSDT', 1, 0.8); // Different symbol
      const result = mlIntegration.adjustConfidence(1, 0.7, 'BTCUSDT');
      
      expect(result.integration_status).toBe('NO_PREDICTION');
      expect(result.adjusted_confidence).toBe(0.7);
    });
  });

  describe('Accuracy Tracking - Requirement 48.6', () => {
    test('should track prediction outcomes', () => {
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      mlIntegration.recordOutcome('signal_1', 'BTCUSDT', 1, 1); // ML correct
      
      const history = mlIntegration.getOutcomeHistory();
      expect(history.length).toBe(1);
      expect(history[0].ml_correct).toBe(true);
    });

    test('should calculate accuracy correctly', () => {
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      
      // Record 3 correct, 1 incorrect
      mlIntegration.recordOutcome('signal_1', 'BTCUSDT', 1, 1); // correct
      mlIntegration.recordOutcome('signal_2', 'BTCUSDT', 1, 1); // correct
      mlIntegration.recordOutcome('signal_3', 'BTCUSDT', 1, 1); // correct
      mlIntegration.recordOutcome('signal_4', 'BTCUSDT', 1, -1); // incorrect
      
      expect(mlIntegration.getAccuracy()).toBe(0.75);
    });

    test('should disable ML when accuracy drops below 50%', () => {
      const disabledHandler = jest.fn();
      mlIntegration.on('disabled', disabledHandler);
      
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      
      // Record 30 outcomes with < 50% accuracy
      for (let i = 0; i < 30; i++) {
        const outcome = i < 10 ? 1 : -1; // Only 10 correct out of 30
        mlIntegration.recordOutcome(`signal_${i}`, 'BTCUSDT', 1, outcome);
      }
      
      expect(mlIntegration.isEnabled()).toBe(false);
      expect(disabledHandler).toHaveBeenCalled();
    });

    test('should not disable ML before accuracy window is full', () => {
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      
      // Record only 10 outcomes (less than window of 30)
      for (let i = 0; i < 10; i++) {
        mlIntegration.recordOutcome(`signal_${i}`, 'BTCUSDT', 1, -1); // All incorrect
      }
      
      // Should still be enabled because window not full
      expect(mlIntegration.isEnabled()).toBe(true);
    });

    test('should trim outcome history to window size', () => {
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      
      // Record more than window size
      for (let i = 0; i < 40; i++) {
        mlIntegration.recordOutcome(`signal_${i}`, 'BTCUSDT', 1, 1);
      }
      
      const history = mlIntegration.getOutcomeHistory();
      expect(history.length).toBe(30); // Should be capped at window size
    });
  });

  describe('Manual Controls', () => {
    test('should enable ML integration', () => {
      mlIntegration.disable();
      expect(mlIntegration.isEnabled()).toBe(false);
      
      mlIntegration.enable();
      expect(mlIntegration.isEnabled()).toBe(true);
    });

    test('should enable and clear history', () => {
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      mlIntegration.recordOutcome('signal_1', 'BTCUSDT', 1, -1);
      
      mlIntegration.enable(true);
      
      expect(mlIntegration.isEnabled()).toBe(true);
      expect(mlIntegration.getOutcomeHistory().length).toBe(0);
      expect(mlIntegration.getAccuracy()).toBe(1.0);
    });

    test('should disable ML integration', () => {
      mlIntegration.disable();
      expect(mlIntegration.isEnabled()).toBe(false);
    });

    test('should set symbols', () => {
      mlIntegration.setSymbols(['BTCUSDT', 'ETHUSDT']);
      const status = mlIntegration.getStatus();
      expect(status.symbols).toEqual(['BTCUSDT', 'ETHUSDT']);
    });

    test('should manually set prediction', () => {
      mlIntegration.setPrediction('BTCUSDT', -1, 0.9);
      
      const signal = mlIntegration.getMLSignal('BTCUSDT');
      expect(signal.signal).toBe(-1);
      expect(signal.confidence).toBe(0.9);
    });

    test('should reject invalid signal values', () => {
      expect(() => mlIntegration.setPrediction('BTCUSDT', 2, 0.5)).toThrow('Invalid ML signal');
    });

    test('should reject invalid confidence values', () => {
      expect(() => mlIntegration.setPrediction('BTCUSDT', 1, 1.5)).toThrow('Invalid confidence');
    });
  });

  describe('Status', () => {
    test('should return full status', () => {
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      mlIntegration.recordOutcome('signal_1', 'BTCUSDT', 1, 1);
      
      const status = mlIntegration.getStatus();
      
      expect(status.enabled).toBe(true);
      expect(status.service_available).toBe(true);
      expect(status.accuracy).toBe(1.0);
      expect(status.predictions_count).toBe(1);
      expect(status.correct_predictions).toBe(1);
      expect(status.min_accuracy_threshold).toBe(0.5);
    });

    test('should check if service is available', () => {
      expect(mlIntegration.isServiceAvailable()).toBe(false);
      
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      expect(mlIntegration.isServiceAvailable()).toBe(true);
    });
  });

  describe('Events', () => {
    test('should emit prediction event', () => {
      const handler = jest.fn();
      mlIntegration.on('prediction', handler);
      
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'BTCUSDT',
        signal: 1,
        confidence: 0.8,
      }));
    });

    test('should emit accuracy_update event', () => {
      const handler = jest.fn();
      mlIntegration.on('accuracy_update', handler);
      
      mlIntegration.setPrediction('BTCUSDT', 1, 0.8);
      mlIntegration.recordOutcome('signal_1', 'BTCUSDT', 1, 1);
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        accuracy: 1.0,
        predictions_count: 1,
        correct_count: 1,
      }));
    });

    test('should emit enabled event', () => {
      const handler = jest.fn();
      mlIntegration.on('enabled', handler);
      
      mlIntegration.disable();
      mlIntegration.enable();
      
      expect(handler).toHaveBeenCalled();
    });

    test('should emit disabled event', () => {
      const handler = jest.fn();
      mlIntegration.on('disabled', handler);
      
      mlIntegration.disable();
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        reason: 'MANUAL',
      }));
    });
  });

  describe('Fetch Predictions', () => {
    test('should handle fetch errors gracefully', async () => {
      const errorFetch = createMockFetch({}, true);
      const ml = new MLIntegration({
        mlServiceUrl: 'http://localhost:8080/ml',
        logger: mockLogger,
        fetchFn: errorFetch,
        retryAttempts: 0,
        pollIntervalMs: 100,
      });
      
      const errorHandler = jest.fn();
      ml.on('error', errorHandler);
      
      ml.start(['BTCUSDT']);
      
      // Wait for poll
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(errorHandler).toHaveBeenCalled();
      expect(ml.isServiceAvailable()).toBe(false);
      
      ml.destroy();
    });

    test('should validate prediction response', async () => {
      const invalidFetch = createMockFetch({
        signal: 5, // Invalid signal
        confidence: 0.8,
      });
      
      const ml = new MLIntegration({
        mlServiceUrl: 'http://localhost:8080/ml',
        logger: mockLogger,
        fetchFn: invalidFetch,
        retryAttempts: 0,
        pollIntervalMs: 100,
      });
      
      const errorHandler = jest.fn();
      ml.on('error', errorHandler);
      
      ml.start(['BTCUSDT']);
      
      // Wait for poll
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(errorHandler).toHaveBeenCalled();
      
      ml.destroy();
    });
  });
});
