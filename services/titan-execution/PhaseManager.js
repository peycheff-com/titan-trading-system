/**
 * Phase Manager
 * 
 * Manages phase-based execution strategy for the Speedrun Protocol.
 * Determines operating phase based on real-time equity and validates signals
 * against phase-specific configurations.
 * 
 * Requirements: 84.1-84.6, 93.1-93.5
 * 
 * @module PhaseManager
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {number} Phase 1 equity threshold */
const PHASE_1_MAX_EQUITY = 1000;

/** @constant {number} Phase 2 minimum equity */
const PHASE_2_MIN_EQUITY = 1000;

/** @constant {number} Starting equity */
const STARTING_EQUITY = 200;

/** @constant {number} Target equity */
const TARGET_EQUITY = 5000;

/** @constant {number} Default polling interval in milliseconds */
const DEFAULT_POLLING_INTERVAL = 60000; // 60 seconds

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PhaseConfig
 * @property {string} label - Phase label (e.g., "KICKSTARTER")
 * @property {number[]} equityRange - [min, max] equity range for this phase
 * @property {number} riskMult - Risk multiplier (5.0 for Phase 1, 2.5 for Phase 2)
 * @property {number} riskPct - Risk percentage (0.10 for Phase 1, 0.05 for Phase 2)
 * @property {number} maxLeverage - Maximum leverage allowed
 * @property {string[]} signalFilter - Allowed signal types (e.g., ["SCALP"])
 * @property {string} executionMode - Execution mode ("MAKER" or "TAKER")
 * @property {boolean} allowPyramiding - Whether pyramiding is allowed
 * @property {number} [maxPyramidLayers] - Maximum pyramid layers (Phase 2 only)
 */

/**
 * @typedef {Object} PhaseTransition
 * @property {number} oldPhase - Previous phase number
 * @property {number} newPhase - New phase number
 * @property {number} equityAtTransition - Equity at time of transition
 * @property {string} timestamp - ISO timestamp of transition
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

//─────────────────────────────────────────────────────────────────────────────
// PHASE MANAGER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Phase Manager class
 * 
 * Manages phase-based execution strategy for the Speedrun Protocol.
 * Determines operating phase based on real-time equity from broker API.
 * 
 * Events emitted:
 * - 'phase:transition' - When phase changes
 * - 'phase:regression' - When phase regresses (equity drops below threshold)
 * - 'signal:rejected' - When signal is rejected due to phase mismatch
 */
export class PhaseManager extends EventEmitter {
  /**
   * Create a new PhaseManager instance
   * @param {Object} options - Configuration options
   * @param {Object} options.brokerGateway - BrokerGateway instance for equity queries
   * @param {Logger} [options.logger] - Logger instance
   * @param {number} [options.pollingInterval] - Equity polling interval in milliseconds
   */
  constructor(options = {}) {
    super();
    
    if (!options.brokerGateway) {
      throw new Error('brokerGateway is required');
    }
    
    /** @type {Object} BrokerGateway instance */
    this.brokerGateway = options.brokerGateway;
    
    /** @type {number|null} Current phase */
    this.currentPhase = null;
    
    /** @type {number|null} Last known equity */
    this.lastKnownEquity = null;
    
    /** @type {PhaseTransition[]} Phase transition history */
    this.transitionHistory = [];
    
    /** @type {number} Polling interval in milliseconds */
    this.pollingInterval = options.pollingInterval || DEFAULT_POLLING_INTERVAL;
    
    /** @type {NodeJS.Timeout|null} Polling timer */
    this.pollingTimer = null;
    
    /** @type {boolean} Whether polling is active */
    this.isPolling = false;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
    /**
     * Phase configurations
     * Requirements: 84.2 - Phase 1 (KICKSTARTER): $200-$1,000, 10% risk, 30x leverage, MAKER
     * Requirements: 84.3 - Phase 2 (TREND RIDER): $1,000-$5,000, 5% risk, 15x leverage, TAKER
     * Phase 3 (TARGET REACHED): $5,000+, conservative risk, capital preservation
     * @type {Object.<number, PhaseConfig>}
     */
    this.phaseConfig = {
      1: {
        label: 'KICKSTARTER',
        equityRange: [STARTING_EQUITY, PHASE_1_MAX_EQUITY],
        riskMult: 5.0,
        riskPct: 0.10,
        maxLeverage: 30,
        signalFilter: ['SCALP'],
        executionMode: 'MAKER',
        allowPyramiding: false,
      },
      2: {
        label: 'TREND RIDER',
        equityRange: [PHASE_2_MIN_EQUITY, TARGET_EQUITY],
        riskMult: 2.5,
        riskPct: 0.05,
        maxLeverage: 15,
        signalFilter: ['DAY', 'SWING'],
        executionMode: 'TAKER',
        allowPyramiding: true,
        maxPyramidLayers: 4,
      },
      3: {
        label: 'TARGET_REACHED',
        equityRange: [TARGET_EQUITY, Infinity],
        riskMult: 1.0,
        riskPct: 0.02,
        maxLeverage: 5,
        signalFilter: ['SWING'],
        executionMode: 'TAKER',
        allowPyramiding: false,
      },
    };
    
    // Setup graceful shutdown handlers
    this._setupShutdownHandlers();
  }

  //─────────────────────────────────────────────────────────────────────────────
  // PHASE DETERMINATION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Determine current phase based on live equity from broker API
   * Requirements: 84.1 - Use Real-Time Net Liquidating Value (Equity) as source of truth
   * Requirements: 84.2 - Phase 1 when equity between $200 and $1,000
   * Requirements: 84.3 - Phase 2 when equity between $1,000 and $5,000
   * Phase 3 when equity exceeds $5,000
   * 
   * @returns {Promise<number>} Current phase number (1, 2, or 3)
   */
  async determinePhase() {
    try {
      // Get live equity from broker
      const equity = await this._getEquityFromBroker();
      this.lastKnownEquity = equity;
      
      // Determine phase based on equity
      let newPhase;
      if (equity >= TARGET_EQUITY) {
        newPhase = 3;
      } else if (equity >= PHASE_2_MIN_EQUITY) {
        newPhase = 2;
      } else {
        newPhase = 1;
      }
      
      // Check for phase transition
      if (this.currentPhase !== null && this.currentPhase !== newPhase) {
        this._handlePhaseTransition(this.currentPhase, newPhase, equity);
      }
      
      this.currentPhase = newPhase;
      
      this.logger.info({
        phase: newPhase,
        phase_label: this.phaseConfig[newPhase].label,
        equity,
      }, 'Phase determined');
      
      return newPhase;
      
    } catch (error) {
      this.logger.error({
        error: error.message,
      }, 'Failed to determine phase');
      
      // Return last known phase or default to Phase 1
      return this.currentPhase || 1;
    }
  }

  /**
   * Get equity from broker API
   * Requirements: 84.1 - Use Real-Time Net Liquidating Value (Equity) as source of truth
   * @returns {Promise<number>} Current equity (Net Liquidating Value)
   * @private
   */
  async _getEquityFromBroker() {
    try {
      // Query broker account endpoint for actual Net Liquidating Value (NLV)
      // NLV = Cash + Unrealized PnL + Realized PnL
      const account = await this.brokerGateway.getAccount();
      
      if (account && typeof account.equity === 'number') {
        this.logger.info({
          equity: account.equity,
          cash: account.cash,
          margin_used: account.margin_used,
        }, 'Retrieved equity from broker account endpoint');
        
        return account.equity;
      }
      
      // Fallback: calculate from positions (for mock/testing)
      this.logger.warn({}, 'Broker account endpoint unavailable, falling back to position-based calculation');
      
      const positions = await this.brokerGateway.getPositions();
      let totalEquity = STARTING_EQUITY; // Base equity
      
      for (const position of positions) {
        // Add unrealized PnL to equity
        if (position.unrealized_pnl) {
          totalEquity += position.unrealized_pnl;
        }
      }
      
      return totalEquity;
      
    } catch (error) {
      this.logger.error({
        error: error.message,
      }, 'Failed to get equity from broker');
      
      // Return last known equity or starting equity
      return this.lastKnownEquity || STARTING_EQUITY;
    }
  }

  /**
   * Handle phase transition
   * Requirements: 84.4 - Log phase transitions with old_phase, new_phase, equity_at_transition, timestamp
   * @param {number} oldPhase - Previous phase
   * @param {number} newPhase - New phase
   * @param {number} equity - Equity at transition
   * @private
   */
  _handlePhaseTransition(oldPhase, newPhase, equity) {
    // Speedrun Protocol: Phase transitions should be monotonic (1→2→3 only)
    // Phase regression indicates equity dropped below threshold (critical event)
    if (newPhase < oldPhase) {
      this.logger.error({
        old_phase: oldPhase,
        old_phase_label: this.phaseConfig[oldPhase].label,
        new_phase: newPhase,
        new_phase_label: this.phaseConfig[newPhase].label,
        equity,
      }, 'CRITICAL: Phase regression detected - equity dropped below threshold');
      
      // Emit critical alert for operator intervention
      this.emit('phase:regression', {
        oldPhase,
        newPhase,
        equity,
        timestamp: new Date().toISOString(),
      });
    }
    
    const transition = {
      oldPhase,
      newPhase,
      equityAtTransition: equity,
      timestamp: new Date().toISOString(),
    };
    
    this.transitionHistory.push(transition);
    
    this.logger.warn({
      old_phase: oldPhase,
      old_phase_label: this.phaseConfig[oldPhase].label,
      new_phase: newPhase,
      new_phase_label: this.phaseConfig[newPhase].label,
      equity_at_transition: equity,
      timestamp: transition.timestamp,
    }, 'Phase transition occurred');
    
    this.emit('phase:transition', transition);
  }

  //─────────────────────────────────────────────────────────────────────────────
  // SIGNAL VALIDATION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Validate signal against current phase configuration
   * Requirements: 84.6 - Reject signal types that don't match current phase
   * Requirements: 93.3 - Reject signals that don't match current phase (e.g., reject SCALP if in Phase 2)
   * 
   * @param {string} signalType - Signal type (e.g., "SCALP", "DAY", "SWING")
   * @param {number} phase - Phase to validate against (defaults to current phase)
   * @returns {boolean} True if signal is valid for the phase
   */
  validateSignal(signalType, phase = null) {
    const targetPhase = phase !== null ? phase : this.currentPhase;
    
    if (targetPhase === null) {
      this.logger.warn({
        signal_type: signalType,
      }, 'Cannot validate signal: phase not determined yet');
      return false;
    }
    
    const config = this.phaseConfig[targetPhase];
    const isValid = config.signalFilter.includes(signalType);
    
    if (!isValid) {
      this.logger.warn({
        signal_type: signalType,
        current_phase: targetPhase,
        phase_label: config.label,
        allowed_signals: config.signalFilter,
      }, 'Signal rejected: type not allowed in current phase');
      
      this.emit('signal:rejected', {
        signal_type: signalType,
        phase: targetPhase,
        phase_label: config.label,
        allowed_signals: config.signalFilter,
        timestamp: new Date().toISOString(),
      });
    }
    
    return isValid;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION ACCESS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get phase configuration
   * Requirements: 84.2-84.3 - Return phase-specific parameters
   * 
   * @param {number} [phase] - Phase number (defaults to current phase)
   * @returns {PhaseConfig|null} Phase configuration or null if phase not determined
   */
  getPhaseConfig(phase = null) {
    const targetPhase = phase !== null ? phase : this.currentPhase;
    
    if (targetPhase === null) {
      this.logger.warn({}, 'Cannot get phase config: phase not determined yet');
      return null;
    }
    
    return this.phaseConfig[targetPhase];
  }

  /**
   * Get current phase number
   * @returns {number|null} Current phase or null if not determined
   */
  getCurrentPhase() {
    return this.currentPhase;
  }

  /**
   * Get last known equity
   * @returns {number|null} Last known equity or null
   */
  getLastKnownEquity() {
    return this.lastKnownEquity;
  }

  /**
   * Get phase transition history
   * @returns {PhaseTransition[]} Array of phase transitions
   */
  getTransitionHistory() {
    return [...this.transitionHistory];
  }

  //─────────────────────────────────────────────────────────────────────────────
  // POLLING METHODS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Start automatic equity polling
   * @param {number} [interval] - Polling interval in milliseconds (overrides constructor value)
   */
  startPolling(interval = null) {
    if (this.isPolling) {
      this.logger.warn({}, 'Polling already active');
      return;
    }
    
    if (interval) {
      this.pollingInterval = interval;
    }
    
    this.isPolling = true;
    
    // Initial determination
    this.determinePhase().catch(err => {
      this.logger.error({ error: err.message }, 'Initial phase determination failed');
    });
    
    // Set up recurring polling
    this.pollingTimer = setInterval(() => {
      this.determinePhase().catch(err => {
        this.logger.error({ error: err.message }, 'Phase determination failed during polling');
      });
    }, this.pollingInterval);
    
    this.logger.info({
      polling_interval_ms: this.pollingInterval,
    }, 'Phase polling started');
  }

  /**
   * Stop automatic equity polling
   */
  stopPolling() {
    if (!this.isPolling) {
      return;
    }
    
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    this.isPolling = false;
    this.logger.info({}, 'Phase polling stopped');
  }

  /**
   * Check if polling is active
   * @returns {boolean} True if polling is active
   */
  isPollingActive() {
    return this.isPolling;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // UTILITY METHODS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Reset phase manager state (for testing)
   */
  reset() {
    this.stopPolling();
    this._removeShutdownHandlers();
    this.currentPhase = null;
    this.lastKnownEquity = null;
    this.transitionHistory = [];
    this.logger.info({}, 'PhaseManager reset');
  }

  /**
   * Destroy the phase manager and clean up resources
   * Call this for graceful shutdown
   */
  destroy() {
    this.stopPolling();
    this._removeShutdownHandlers();
    this.removeAllListeners();
    this.logger.info({}, 'PhaseManager destroyed');
  }

  /**
   * Set equity manually (for testing)
   * @param {number} equity - Equity to set
   */
  setEquity(equity) {
    this.lastKnownEquity = equity;
    const newPhase = equity < PHASE_1_MAX_EQUITY ? 1 : 2;
    
    if (this.currentPhase !== null && this.currentPhase !== newPhase) {
      this._handlePhaseTransition(this.currentPhase, newPhase, equity);
    }
    
    this.currentPhase = newPhase;
    this.logger.info({
      phase: newPhase,
      equity,
    }, 'Equity set manually');
  }

  /**
   * Get phase label
   * @param {number} [phase] - Phase number (defaults to current phase)
   * @returns {string|null} Phase label or null
   */
  getPhaseLabel(phase = null) {
    const config = this.getPhaseConfig(phase);
    return config ? config.label : null;
  }

  /**
   * Check if pyramiding is allowed in current phase
   * @returns {boolean} True if pyramiding is allowed
   */
  isPyramidingAllowed() {
    const config = this.getPhaseConfig();
    return config ? config.allowPyramiding : false;
  }

  /**
   * Get execution mode for current phase
   * @returns {string|null} Execution mode ("MAKER" or "TAKER") or null
   */
  getExecutionMode() {
    const config = this.getPhaseConfig();
    return config ? config.executionMode : null;
  }

  /**
   * Get risk parameters for current phase
   * @returns {Object|null} Risk parameters or null
   */
  getRiskParameters() {
    const config = this.getPhaseConfig();
    if (!config) return null;
    
    return {
      riskMult: config.riskMult,
      riskPct: config.riskPct,
      maxLeverage: config.maxLeverage,
    };
  }

  //─────────────────────────────────────────────────────────────────────────────
  // SHUTDOWN HANDLERS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Setup graceful shutdown handlers
   * @private
   */
  _setupShutdownHandlers() {
    // Store handler reference for cleanup
    this._shutdownHandler = () => {
      this.logger.info({}, 'Shutdown signal received, stopping phase polling');
      this.stopPolling();
    };
    
    // Only add handlers if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      process.on('SIGTERM', this._shutdownHandler);
      process.on('SIGINT', this._shutdownHandler);
    }
  }

  /**
   * Remove shutdown handlers (for cleanup)
   * @private
   */
  _removeShutdownHandlers() {
    if (this._shutdownHandler) {
      process.removeListener('SIGTERM', this._shutdownHandler);
      process.removeListener('SIGINT', this._shutdownHandler);
      this._shutdownHandler = null;
    }
  }
}

export default PhaseManager;
