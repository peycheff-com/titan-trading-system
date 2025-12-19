/**
 * ML Integration Module
 * 
 * Integrates external ML model predictions with regime signals.
 * Polls external ML service for predictions and adjusts confidence
 * based on agreement/conflict with regime signals.
 * 
 * Requirements: 48.1-48.6
 * 
 * @module MLIntegration
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  DEFAULT_POLL_INTERVAL_MS: 60000,      // 1 minute (per bar)
  DEFAULT_ACCURACY_WINDOW: 30,           // Track last 30 predictions
  DEFAULT_MIN_ACCURACY: 0.5,             // 50% minimum accuracy
  DEFAULT_CONFIDENCE_BOOST: 0.2,         // 20% confidence boost on agreement
  DEFAULT_CONFIDENCE_PENALTY: 0.3,       // 30% confidence penalty on conflict
  DEFAULT_REQUEST_TIMEOUT_MS: 5000,      // 5 second timeout
  DEFAULT_RETRY_ATTEMPTS: 2,             // Retry failed requests twice
  DEFAULT_RETRY_DELAY_MS: 1000,          // 1 second between retries
};

/** @constant {Object} ML Signal values */
const ML_SIGNAL = {
  BUY: 1,
  HOLD: 0,
  SELL: -1,
};

/** @constant {Set<number>} Valid ML signal values */
const VALID_ML_SIGNALS = new Set([ML_SIGNAL.BUY, ML_SIGNAL.HOLD, ML_SIGNAL.SELL]);

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} MLPrediction
 * @property {string} symbol - Trading symbol
 * @property {number} signal - ML signal: -1 (sell), 0 (hold), +1 (buy)
 * @property {number} confidence - Model confidence (0-1)
 * @property {string} model_id - Model identifier
 * @property {string} timestamp - ISO timestamp of prediction
 */

/**
 * @typedef {Object} PredictionOutcome
 * @property {string} signal_id - Signal ID
 * @property {number} ml_signal - ML prediction signal
 * @property {number} regime_signal - Regime signal
 * @property {number} actual_outcome - Actual trade outcome: 1 (win), -1 (loss), 0 (neutral)
 * @property {boolean} ml_correct - Whether ML prediction was correct
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} MLStatus
 * @property {boolean} enabled - Whether ML integration is enabled
 * @property {boolean} service_available - Whether ML service is reachable
 * @property {number} accuracy - Current accuracy (0-1)
 * @property {number} predictions_count - Total predictions tracked
 * @property {number} correct_predictions - Number of correct predictions
 * @property {string} last_prediction_time - ISO timestamp of last prediction
 * @property {string} last_error - Last error message if any
 */

/**
 * @typedef {Object} Logger
 * @property {Function} info - Info level logging
 * @property {Function} warn - Warning level logging
 * @property {Function} error - Error level logging
 * @property {Function} [debug] - Debug level logging
 */

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a default logger with consistent interface
 * @returns {Logger} Default logger
 */
function createDefaultLogger() {
  return {
    info: (data, message) => console.log(`[INFO] ${message}`, data),
    warn: (data, message) => console.warn(`[WARN] ${message}`, data),
    error: (data, message) => console.error(`[ERROR] ${message}`, data),
    debug: (data, message) => console.debug(`[DEBUG] ${message}`, data),
  };
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate ML prediction response
 * @param {Object} response - Response from ML service
 * @returns {boolean} True if valid
 */
function isValidPrediction(response) {
  if (!response || typeof response !== 'object') return false;
  if (!VALID_ML_SIGNALS.has(response.signal)) return false;
  if (typeof response.confidence !== 'number' || response.confidence < 0 || response.confidence > 1) return false;
  return true;
}

//─────────────────────────────────────────────────────────────────────────────
// ML INTEGRATION CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * MLIntegration class - External ML model prediction integration
 * 
 * Key responsibilities:
 * 1. Poll external ML service for predictions (Requirement 48.1)
 * 2. Integrate ml_signal with regime signal (Requirement 48.2)
 * 3. Adjust confidence based on agreement/conflict (Requirement 48.3, 48.4)
 * 4. Continue with regime-only signals if ML unavailable (Requirement 48.5)
 * 5. Disable ML integration if accuracy < 50% (Requirement 48.6)
 * 
 * @extends EventEmitter
 * @fires MLIntegration#prediction - When a new prediction is received
 * @fires MLIntegration#accuracy_update - When accuracy is recalculated
 * @fires MLIntegration#disabled - When ML is disabled due to low accuracy
 * @fires MLIntegration#enabled - When ML is re-enabled
 * @fires MLIntegration#error - When an error occurs
 */
export class MLIntegration extends EventEmitter {
  /**
   * Create a new MLIntegration instance
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.mlServiceUrl - URL of the external ML service
   * @param {string} [options.apiKey] - API key for ML service authentication
   * @param {Logger} [options.logger] - Logger object
   * @param {number} [options.pollIntervalMs] - Polling interval in milliseconds
   * @param {number} [options.accuracyWindow] - Number of predictions to track for accuracy
   * @param {number} [options.minAccuracy] - Minimum accuracy threshold (0-1)
   * @param {number} [options.confidenceBoost] - Confidence boost on agreement (0-1)
   * @param {number} [options.confidencePenalty] - Confidence penalty on conflict (0-1)
   * @param {number} [options.requestTimeoutMs] - Request timeout in milliseconds
   * @param {number} [options.retryAttempts] - Number of retry attempts
   * @param {number} [options.retryDelayMs] - Delay between retries in milliseconds
   * @param {Function} [options.fetchFn] - Custom fetch function (for testing)
   */
  constructor(options = {}) {
    super();
    
    /** @type {string} ML service URL */
    this.mlServiceUrl = options.mlServiceUrl || '';
    
    /** @type {string} API key for authentication */
    this.apiKey = options.apiKey || '';
    
    /** @type {number} Polling interval in milliseconds */
    this.pollIntervalMs = options.pollIntervalMs || CONFIG.DEFAULT_POLL_INTERVAL_MS;
    
    /** @type {number} Number of predictions to track for accuracy */
    this.accuracyWindow = options.accuracyWindow || CONFIG.DEFAULT_ACCURACY_WINDOW;
    
    /** @type {number} Minimum accuracy threshold (Requirement 48.6: 50%) */
    this.minAccuracy = options.minAccuracy || CONFIG.DEFAULT_MIN_ACCURACY;
    
    /** @type {number} Confidence boost on agreement (Requirement 48.4: 20%) */
    this.confidenceBoost = options.confidenceBoost || CONFIG.DEFAULT_CONFIDENCE_BOOST;
    
    /** @type {number} Confidence penalty on conflict (Requirement 48.3: 30%) */
    this.confidencePenalty = options.confidencePenalty || CONFIG.DEFAULT_CONFIDENCE_PENALTY;
    
    /** @type {number} Request timeout in milliseconds */
    this.requestTimeoutMs = options.requestTimeoutMs || CONFIG.DEFAULT_REQUEST_TIMEOUT_MS;
    
    /** @type {number} Number of retry attempts */
    this.retryAttempts = options.retryAttempts ?? CONFIG.DEFAULT_RETRY_ATTEMPTS;
    
    /** @type {number} Delay between retries in milliseconds */
    this.retryDelayMs = options.retryDelayMs || CONFIG.DEFAULT_RETRY_DELAY_MS;
    
    /** @type {Function} Fetch function (injectable for testing) */
    this._fetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    
    // Create logger with consistent interface
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
    /** @type {boolean} Whether ML integration is enabled */
    this._enabled = true;
    
    /** @type {boolean} Whether ML service is available */
    this._serviceAvailable = false;
    
    /** @type {PredictionOutcome[]} Rolling window of prediction outcomes */
    this._predictionOutcomes = [];
    
    /** @type {Map<string, MLPrediction>} Latest predictions by symbol */
    this._latestPredictions = new Map();
    
    /** @type {NodeJS.Timeout|null} Polling timer */
    this._pollTimer = null;
    
    /** @type {boolean} Whether polling is active */
    this._isPolling = false;
    
    /** @type {string} Last error message */
    this._lastError = '';
    
    /** @type {string} Last prediction timestamp */
    this._lastPredictionTime = '';
    
    /** @type {number} Current accuracy */
    this._currentAccuracy = 1.0; // Start optimistic
    
    /** @type {boolean} Whether instance has been destroyed */
    this._destroyed = false;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // LIFECYCLE METHODS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Start polling for ML predictions
   * Requirement 48.1: Poll external ML service for predictions every bar
   * 
   * @param {string[]} [symbols] - Symbols to poll predictions for
   */
  start(symbols = []) {
    if (this._destroyed) {
      throw new Error('MLIntegration has been destroyed');
    }
    
    if (this._isPolling) {
      this.logger.warn?.({}, 'MLIntegration polling already running');
      return;
    }
    
    if (!this.mlServiceUrl) {
      this.logger.warn?.({}, 'ML service URL not configured, ML integration disabled');
      this._enabled = false;
      return;
    }
    
    this._isPolling = true;
    this._symbols = symbols;
    
    this.logger.info?.({
      ml_service_url: this.mlServiceUrl,
      poll_interval_ms: this.pollIntervalMs,
      accuracy_window: this.accuracyWindow,
      min_accuracy: this.minAccuracy,
      symbols: symbols,
    }, 'MLIntegration polling started');
    
    // Start periodic polling
    this._pollTimer = setInterval(() => {
      this._pollPredictions();
    }, this.pollIntervalMs);
    
    // Initial poll
    this._pollPredictions();
  }

  /**
   * Stop polling for ML predictions
   */
  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._isPolling = false;
    this.logger.info?.({}, 'MLIntegration polling stopped');
  }

  /**
   * Destroy the instance and clean up resources
   */
  destroy() {
    this.stop();
    this._destroyed = true;
    this._latestPredictions.clear();
    this._predictionOutcomes = [];
    this.removeAllListeners();
  }

  //─────────────────────────────────────────────────────────────────────────────
  // POLLING METHODS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Poll ML service for predictions
   * @private
   */
  async _pollPredictions() {
    if (!this._enabled || this._destroyed) {
      return;
    }
    
    for (const symbol of this._symbols || []) {
      try {
        const prediction = await this._fetchPrediction(symbol);
        if (prediction) {
          this._latestPredictions.set(symbol, prediction);
          this._lastPredictionTime = prediction.timestamp;
          this._serviceAvailable = true;
          
          this.logger.debug?.({
            symbol,
            signal: prediction.signal,
            confidence: prediction.confidence,
          }, 'ML prediction received');
          
          this.emit('prediction', { ...prediction });
        }
      } catch (error) {
        this._handlePollError(symbol, error);
      }
    }
  }

  /**
   * Fetch prediction from ML service with retry logic
   * 
   * @param {string} symbol - Trading symbol
   * @returns {Promise<MLPrediction|null>} Prediction or null if failed
   * @private
   */
  async _fetchPrediction(symbol) {
    if (!this._fetch) {
      this.logger.warn?.({}, 'Fetch function not available');
      return null;
    }
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        
        const url = `${this.mlServiceUrl}/predict/${symbol}`;
        const headers = {
          'Content-Type': 'application/json',
        };
        
        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        
        const response = await this._fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!isValidPrediction(data)) {
          throw new Error('Invalid prediction response format');
        }
        
        return {
          symbol,
          signal: data.signal,
          confidence: data.confidence,
          model_id: data.model_id || 'unknown',
          timestamp: data.timestamp || new Date().toISOString(),
        };
      } catch (error) {
        lastError = error;
        
        if (attempt < this.retryAttempts) {
          await sleep(this.retryDelayMs);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Handle polling error
   * 
   * @param {string} symbol - Symbol that failed
   * @param {Error} error - Error that occurred
   * @private
   */
  _handlePollError(symbol, error) {
    this._lastError = error.message;
    this._serviceAvailable = false;
    
    this.logger.warn?.({
      symbol,
      error: error.message,
    }, 'Failed to fetch ML prediction');
    
    this.emit('error', {
      symbol,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  //─────────────────────────────────────────────────────────────────────────────
  // SIGNAL INTEGRATION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get ML signal for a symbol
   * Requirement 48.2: Integrate as ml_signal: -1 (sell), 0 (hold), +1 (buy)
   * 
   * @param {string} symbol - Trading symbol
   * @returns {MLPrediction|null} Latest prediction or null if unavailable
   */
  getMLSignal(symbol) {
    if (!this._enabled) {
      return null;
    }
    
    const prediction = this._latestPredictions.get(symbol);
    return prediction ? { ...prediction } : null;
  }

  /**
   * Adjust confidence based on ML signal agreement/conflict with regime signal
   * Requirements 48.3, 48.4: Reduce confidence by 30% on conflict, increase by 20% on agreement
   * 
   * @param {number} regimeSignal - Regime signal: -1 (sell), 0 (hold), +1 (buy)
   * @param {number} baseConfidence - Base confidence from regime (0-1)
   * @param {string} symbol - Trading symbol
   * @returns {Object} Adjusted confidence and integration details
   */
  adjustConfidence(regimeSignal, baseConfidence, symbol) {
    // Requirement 48.5: Continue with regime-only signals if ML unavailable
    if (!this._enabled || !this._serviceAvailable) {
      return {
        adjusted_confidence: baseConfidence,
        ml_signal: null,
        integration_status: 'ML_UNAVAILABLE',
        adjustment: 0,
      };
    }
    
    const prediction = this._latestPredictions.get(symbol);
    
    if (!prediction) {
      return {
        adjusted_confidence: baseConfidence,
        ml_signal: null,
        integration_status: 'NO_PREDICTION',
        adjustment: 0,
      };
    }
    
    const mlSignal = prediction.signal;
    let adjustedConfidence = baseConfidence;
    let integrationStatus = 'NEUTRAL';
    let adjustment = 0;
    
    // Check for agreement or conflict
    if (mlSignal !== ML_SIGNAL.HOLD && regimeSignal !== 0) {
      if (mlSignal === regimeSignal) {
        // Requirement 48.4: Increase confidence by 20% on agreement
        adjustment = this.confidenceBoost;
        adjustedConfidence = Math.min(1.0, baseConfidence * (1 + adjustment));
        integrationStatus = 'AGREEMENT';
        
        this.logger.debug?.({
          symbol,
          regime_signal: regimeSignal,
          ml_signal: mlSignal,
          base_confidence: baseConfidence,
          adjusted_confidence: adjustedConfidence,
        }, 'ML signal confirms regime signal - confidence boosted');
      } else if (mlSignal === -regimeSignal) {
        // Requirement 48.3: Reduce confidence by 30% on conflict
        adjustment = -this.confidencePenalty;
        adjustedConfidence = Math.max(0, baseConfidence * (1 + adjustment));
        integrationStatus = 'CONFLICT';
        
        this.logger.debug?.({
          symbol,
          regime_signal: regimeSignal,
          ml_signal: mlSignal,
          base_confidence: baseConfidence,
          adjusted_confidence: adjustedConfidence,
        }, 'ML signal conflicts with regime signal - confidence reduced');
      }
    }
    
    return {
      adjusted_confidence: adjustedConfidence,
      ml_signal: mlSignal,
      ml_confidence: prediction.confidence,
      integration_status: integrationStatus,
      adjustment,
    };
  }

  //─────────────────────────────────────────────────────────────────────────────
  // ACCURACY TRACKING
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Record the outcome of a prediction for accuracy tracking
   * Requirement 48.6: Track accuracy over 30 trades
   * 
   * @param {string} signalId - Signal ID
   * @param {string} symbol - Trading symbol
   * @param {number} regimeSignal - Regime signal at time of trade
   * @param {number} actualOutcome - Actual outcome: 1 (win), -1 (loss), 0 (neutral)
   */
  recordOutcome(signalId, symbol, regimeSignal, actualOutcome) {
    const prediction = this._latestPredictions.get(symbol);
    
    if (!prediction) {
      return;
    }
    
    const mlSignal = prediction.signal;
    
    // Determine if ML was correct
    // ML is correct if:
    // - ML said BUY and outcome was positive
    // - ML said SELL and outcome was negative
    // - ML said HOLD and outcome was neutral
    let mlCorrect = false;
    if (mlSignal === ML_SIGNAL.BUY && actualOutcome > 0) mlCorrect = true;
    if (mlSignal === ML_SIGNAL.SELL && actualOutcome < 0) mlCorrect = true;
    if (mlSignal === ML_SIGNAL.HOLD && actualOutcome === 0) mlCorrect = true;
    
    const outcome = {
      signal_id: signalId,
      symbol,
      ml_signal: mlSignal,
      regime_signal: regimeSignal,
      actual_outcome: actualOutcome,
      ml_correct: mlCorrect,
      timestamp: new Date().toISOString(),
    };
    
    this._predictionOutcomes.push(outcome);
    
    // Trim to window size
    while (this._predictionOutcomes.length > this.accuracyWindow) {
      this._predictionOutcomes.shift();
    }
    
    // Recalculate accuracy
    this._updateAccuracy();
    
    this.logger.info?.({
      signal_id: signalId,
      symbol,
      ml_signal: mlSignal,
      actual_outcome: actualOutcome,
      ml_correct: mlCorrect,
      current_accuracy: this._currentAccuracy,
    }, 'ML prediction outcome recorded');
  }

  /**
   * Update accuracy calculation and check threshold
   * Requirement 48.6: Disable ML integration if accuracy < 50%
   * @private
   */
  _updateAccuracy() {
    if (this._predictionOutcomes.length === 0) {
      this._currentAccuracy = 1.0;
      return;
    }
    
    const correctCount = this._predictionOutcomes.filter(o => o.ml_correct).length;
    this._currentAccuracy = correctCount / this._predictionOutcomes.length;
    
    this.emit('accuracy_update', {
      accuracy: this._currentAccuracy,
      predictions_count: this._predictionOutcomes.length,
      correct_count: correctCount,
      timestamp: new Date().toISOString(),
    });
    
    // Requirement 48.6: Disable if accuracy drops below 50%
    if (this._enabled && this._currentAccuracy < this.minAccuracy && 
        this._predictionOutcomes.length >= this.accuracyWindow) {
      this._disableDueToLowAccuracy();
    }
  }

  /**
   * Disable ML integration due to low accuracy
   * Requirement 48.6: Disable ML integration and alert operator
   * @private
   */
  _disableDueToLowAccuracy() {
    this._enabled = false;
    
    const diagnostics = {
      accuracy: this._currentAccuracy,
      min_accuracy: this.minAccuracy,
      predictions_count: this._predictionOutcomes.length,
      correct_count: this._predictionOutcomes.filter(o => o.ml_correct).length,
      recent_outcomes: this._predictionOutcomes.slice(-10).map(o => ({
        ml_signal: o.ml_signal,
        actual_outcome: o.actual_outcome,
        ml_correct: o.ml_correct,
      })),
      timestamp: new Date().toISOString(),
    };
    
    this.logger.error?.(diagnostics, 'ML_DISABLED - Accuracy dropped below threshold');
    
    this.emit('disabled', diagnostics);
  }

  //─────────────────────────────────────────────────────────────────────────────
  // MANUAL CONTROLS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Manually enable ML integration
   * 
   * @param {boolean} [clearHistory=false] - Whether to clear prediction history
   */
  enable(clearHistory = false) {
    if (clearHistory) {
      this._predictionOutcomes = [];
      this._currentAccuracy = 1.0;
    }
    
    this._enabled = true;
    
    this.logger.info?.({
      cleared_history: clearHistory,
    }, 'ML integration manually enabled');
    
    this.emit('enabled', {
      cleared_history: clearHistory,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Manually disable ML integration
   */
  disable() {
    this._enabled = false;
    
    this.logger.info?.({}, 'ML integration manually disabled');
    
    this.emit('disabled', {
      reason: 'MANUAL',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Set symbols to poll predictions for
   * 
   * @param {string[]} symbols - Array of symbols
   */
  setSymbols(symbols) {
    this._symbols = symbols;
    this.logger.info?.({ symbols }, 'ML symbols updated');
  }

  /**
   * Manually set a prediction (for testing or external integration)
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} signal - ML signal: -1, 0, or 1
   * @param {number} [confidence=0.5] - Confidence (0-1)
   */
  setPrediction(symbol, signal, confidence = 0.5) {
    if (!VALID_ML_SIGNALS.has(signal)) {
      throw new Error(`Invalid ML signal: ${signal}. Must be -1, 0, or 1`);
    }
    
    if (confidence < 0 || confidence > 1) {
      throw new Error(`Invalid confidence: ${confidence}. Must be between 0 and 1`);
    }
    
    const prediction = {
      symbol,
      signal,
      confidence,
      model_id: 'manual',
      timestamp: new Date().toISOString(),
    };
    
    this._latestPredictions.set(symbol, prediction);
    this._lastPredictionTime = prediction.timestamp;
    this._serviceAvailable = true;
    
    this.emit('prediction', { ...prediction });
  }

  //─────────────────────────────────────────────────────────────────────────────
  // STATUS METHODS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if ML integration is enabled
   * 
   * @returns {boolean} True if enabled
   */
  isEnabled() {
    return this._enabled;
  }

  /**
   * Check if ML service is available
   * 
   * @returns {boolean} True if service is reachable
   */
  isServiceAvailable() {
    return this._serviceAvailable;
  }

  /**
   * Get current accuracy
   * 
   * @returns {number} Current accuracy (0-1)
   */
  getAccuracy() {
    return this._currentAccuracy;
  }

  /**
   * Get full status
   * 
   * @returns {MLStatus} Current status
   */
  getStatus() {
    const correctCount = this._predictionOutcomes.filter(o => o.ml_correct).length;
    
    return {
      enabled: this._enabled,
      service_available: this._serviceAvailable,
      accuracy: this._currentAccuracy,
      predictions_count: this._predictionOutcomes.length,
      correct_predictions: correctCount,
      last_prediction_time: this._lastPredictionTime,
      last_error: this._lastError,
      is_polling: this._isPolling,
      symbols: this._symbols || [],
      min_accuracy_threshold: this.minAccuracy,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get prediction outcomes history
   * 
   * @param {number} [count] - Number of recent outcomes to return
   * @returns {PredictionOutcome[]} Prediction outcomes
   */
  getOutcomeHistory(count) {
    const outcomes = count 
      ? this._predictionOutcomes.slice(-count)
      : [...this._predictionOutcomes];
    return outcomes.map(o => ({ ...o }));
  }

  /**
   * Check if polling is active
   * 
   * @returns {boolean} True if polling
   */
  isPolling() {
    return this._isPolling;
  }
}

export default MLIntegration;
