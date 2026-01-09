/**
 * Signal Router
 * 
 * Routes signals from different phases (Scavenger, Hunter, Sentinel) to appropriate handlers.
 * Implements phase filtering to reject signals from inactive phases.
 * 
 * Requirements: System Integration 2.1-2.6, 7.4-7.5
 * 
 * @module SignalRouter
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Phase to source mapping */
const PHASE_SOURCE_MAP = {
  scavenger: 1,  // Phase 1: Scavenger ($200-$5K)
  hunter: 2,     // Phase 2: Hunter ($5K-$50K)
  sentinel: 3,   // Phase 3: Sentinel ($50K+)
};

/** @constant {Set<string>} Valid signal sources */
const VALID_SOURCES = new Set(['scavenger', 'hunter', 'sentinel']);

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} IntentSignal
 * @property {string} signal_id - Unique signal identifier
 * @property {string} source - Signal source ('scavenger', 'hunter', 'sentinel')
 * @property {number} timestamp - Unix timestamp
 * @property {string} symbol - Trading symbol
 * @property {'LONG'|'SHORT'} direction - Trade direction
 * @property {'MARKET'|'LIMIT'|'IOC'} order_type - Order type
 * @property {number} [entry_price] - Entry price (for LIMIT orders)
 * @property {number} stop_loss - Stop loss price
 * @property {number[]} take_profit - Take profit prices
 * @property {number} leverage - Leverage multiplier
 * @property {number} confidence - Confidence score (0-100)
 * @property {Object} metadata - Phase-specific metadata
 */

/**
 * @typedef {Object} RouteResult
 * @property {boolean} accepted - Whether signal was accepted
 * @property {string} [reason] - Rejection reason if not accepted
 * @property {Object} [result] - Handler result if accepted
 */

/**
 * @typedef {Object} Logger
 * @property {Function} info - Info level logging
 * @property {Function} warn - Warning level logging
 * @property {Function} error - Error level logging
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
  };
}

/**
 * Validate intent signal has required fields
 * @param {Object} signal - Intent signal to validate
 * @throws {Error} If validation fails
 */
function validateIntentSignal(signal) {
  if (!signal) {
    throw new Error('Intent signal is required');
  }
  if (!signal.signal_id || typeof signal.signal_id !== 'string') {
    throw new Error('signal_id is required and must be a string');
  }
  if (!signal.source || typeof signal.source !== 'string') {
    throw new Error('source is required and must be a string');
  }
  if (!VALID_SOURCES.has(signal.source)) {
    throw new Error(`Invalid source: ${signal.source}. Must be one of: ${Array.from(VALID_SOURCES).join(', ')}`);
  }
  if (!signal.symbol || typeof signal.symbol !== 'string') {
    throw new Error('symbol is required and must be a string');
  }
  if (!signal.direction || !['LONG', 'SHORT'].includes(signal.direction)) {
    throw new Error('direction must be LONG or SHORT');
  }
}

//─────────────────────────────────────────────────────────────────────────────
// SIGNAL ROUTER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Signal Router class
 * 
 * Routes signals from different phases to appropriate handlers.
 * Implements phase filtering to reject signals from inactive phases.
 * 
 * Events emitted:
 * - 'signal:routed' - When signal is successfully routed
 * - 'signal:rejected' - When signal is rejected (phase mismatch, unknown source, etc.)
 * - 'signal:error' - When handler throws an error
 */
export class SignalRouter extends EventEmitter {
  /**
   * Create a new SignalRouter instance
   * @param {Object} options - Configuration options
   * @param {Object} options.phaseManager - PhaseManager instance
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    if (!options.phaseManager) {
      throw new Error('phaseManager is required');
    }
    
    /** @type {Object} PhaseManager instance */
    this.phaseManager = options.phaseManager;
    
    /** @type {Map<string, Function>} Signal handlers by source */
    this.handlers = new Map();
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // HANDLER REGISTRATION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Register a handler for a signal source
   * @param {string} source - Signal source ('scavenger', 'hunter', 'sentinel')
   * @param {Function} handler - Handler function (async)
   * @throws {Error} If source is invalid
   */
  registerHandler(source, handler) {
    if (!VALID_SOURCES.has(source)) {
      throw new Error(`Invalid source: ${source}. Must be one of: ${Array.from(VALID_SOURCES).join(', ')}`);
    }
    if (typeof handler !== 'function') {
      throw new Error('handler must be a function');
    }
    
    this.handlers.set(source, handler);
    this.logger.info({ source }, 'Handler registered');
  }

  /**
   * Unregister a handler for a signal source
   * @param {string} source - Signal source
   */
  unregisterHandler(source) {
    this.handlers.delete(source);
    this.logger.info({ source }, 'Handler unregistered');
  }

  /**
   * Check if a handler is registered for a source
   * @param {string} source - Signal source
   * @returns {boolean} True if handler is registered
   */
  hasHandler(source) {
    return this.handlers.has(source);
  }

  //─────────────────────────────────────────────────────────────────────────────
  // SIGNAL ROUTING
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Route an incoming signal to the appropriate handler
   * Requirements: System Integration 2.1-2.6, 7.4-7.5
   * 
   * @param {IntentSignal} intentSignal - Intent signal to route
   * @returns {Promise<RouteResult>} Route result
   */
  async route(intentSignal) {
    try {
      // Validate signal structure
      validateIntentSignal(intentSignal);
      
      const { signal_id, source, symbol } = intentSignal;
      
      // Phase filter: reject signals from inactive phases
      // Requirements: System Integration 7.4-7.5
      const currentPhase = this.phaseManager.getCurrentPhase();
      const signalPhase = PHASE_SOURCE_MAP[source];
      
      if (currentPhase === null) {
        const reason = 'Phase not determined yet';
        this.logger.warn({ signal_id, source, symbol }, reason);
        
        this.emit('signal:rejected', {
          signal_id,
          source,
          symbol,
          reason,
          timestamp: new Date().toISOString(),
        });
        
        return {
          accepted: false,
          reason,
        };
      }
      
      if (!this.isPhaseActive(source, currentPhase)) {
        const reason = `PHASE_MISMATCH: ${source} signal received but current phase is ${currentPhase}`;
        this.logger.warn({
          signal_id,
          source,
          symbol,
          current_phase: currentPhase,
          signal_phase: signalPhase,
        }, reason);
        
        this.emit('signal:rejected', {
          signal_id,
          source,
          symbol,
          reason,
          current_phase: currentPhase,
          signal_phase: signalPhase,
          timestamp: new Date().toISOString(),
        });
        
        return {
          accepted: false,
          reason,
        };
      }
      
      // Check if handler is registered
      const handler = this.handlers.get(source);
      if (!handler) {
        const reason = `UNKNOWN_SOURCE: No handler registered for source: ${source}`;
        this.logger.error({ signal_id, source, symbol }, reason);
        
        this.emit('signal:rejected', {
          signal_id,
          source,
          symbol,
          reason,
          timestamp: new Date().toISOString(),
        });
        
        return {
          accepted: false,
          reason,
        };
      }
      
      // Route to handler
      this.logger.info({
        signal_id,
        source,
        symbol,
        current_phase: currentPhase,
      }, 'Routing signal to handler');
      
      const result = await handler(intentSignal);
      
      this.emit('signal:routed', {
        signal_id,
        source,
        symbol,
        result,
        timestamp: new Date().toISOString(),
      });
      
      return {
        accepted: true,
        result,
      };
      
    } catch (error) {
      this.logger.error({
        signal_id: intentSignal?.signal_id,
        source: intentSignal?.source,
        error: error.message,
        stack: error.stack,
      }, 'Error routing signal');
      
      this.emit('signal:error', {
        signal_id: intentSignal?.signal_id,
        source: intentSignal?.source,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      
      return {
        accepted: false,
        reason: `ERROR: ${error.message}`,
      };
    }
  }

  /**
   * Check if a signal source is active for the current phase
   * Requirements: System Integration 7.4-7.5
   * 
   * @param {string} source - Signal source
   * @param {number} currentPhase - Current phase number
   * @returns {boolean} True if source is active for current phase
   */
  isPhaseActive(source, currentPhase) {
    const signalPhase = PHASE_SOURCE_MAP[source];
    return signalPhase === currentPhase;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // UTILITY METHODS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get all registered sources
   * @returns {string[]} Array of registered sources
   */
  getRegisteredSources() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get phase for a source
   * @param {string} source - Signal source
   * @returns {number|null} Phase number or null if invalid source
   */
  getPhaseForSource(source) {
    return PHASE_SOURCE_MAP[source] || null;
  }

  /**
   * Reset router state (for testing)
   */
  reset() {
    this.handlers.clear();
    this.removeAllListeners();
    this.logger.info({}, 'SignalRouter reset');
  }

  /**
   * Destroy the router and clean up resources
   */
  destroy() {
    this.handlers.clear();
    this.removeAllListeners();
    this.logger.info({}, 'SignalRouter destroyed');
  }
}

export default SignalRouter;
