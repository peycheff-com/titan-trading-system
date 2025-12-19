/**
 * Pyramid Manager
 * 
 * Manages geometric pyramiding on winning positions for Phase 2.
 * Triggers additional entries when price moves favorably and auto-trails
 * stop loss after 2nd layer.
 * 
 * Requirements: 87.1-87.6
 * 
 * @module PyramidManager
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  MAX_PYRAMID_LAYERS: 4,
  PYRAMID_TRIGGER_PCT: 0.02,  // 2% price movement
  AUTO_TRAIL_AFTER_LAYER: 2,
};

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PyramidState
 * @property {string} symbol - Trading symbol
 * @property {'LONG'|'SHORT'} side - Position direction
 * @property {number} layerCount - Current number of layers
 * @property {number[]} entryPrices - Entry price for each layer
 * @property {number[]} layerSizes - Size of each layer
 * @property {number} lastEntryPrice - Price of most recent entry
 * @property {number} avgEntryPrice - Average entry price across all layers
 * @property {number} totalSize - Total position size
 * @property {number} currentStopLoss - Current stop loss price
 * @property {boolean} autoTrailEnabled - Whether auto-trail is active
 * @property {string} createdAt - ISO timestamp
 * @property {string} lastUpdatedAt - ISO timestamp
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
 * Calculate average entry price
 * @param {number[]} entryPrices - Entry prices
 * @param {number[]} layerSizes - Layer sizes
 * @returns {number} Average entry price
 */
function calculateAvgEntryPrice(entryPrices, layerSizes) {
  if (entryPrices.length === 0 || layerSizes.length === 0) {
    return 0;
  }
  
  let totalValue = 0;
  let totalSize = 0;
  
  for (let i = 0; i < entryPrices.length; i++) {
    totalValue += entryPrices[i] * layerSizes[i];
    totalSize += layerSizes[i];
  }
  
  return totalSize > 0 ? totalValue / totalSize : 0;
}

//─────────────────────────────────────────────────────────────────────────────
// PYRAMID MANAGER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Pyramid Manager class
 * 
 * Manages geometric pyramiding on winning positions for Phase 2.
 * 
 * Events emitted:
 * - 'pyramid:opportunity' - When pyramid opportunity is detected
 * - 'pyramid:added' - When pyramid layer is added
 * - 'pyramid:trail_updated' - When stop loss is auto-trailed
 * - 'pyramid:max_layers' - When max layers reached
 */
export class PyramidManager extends EventEmitter {
  /**
   * Create a new PyramidManager instance
   * @param {Object} options - Configuration options
   * @param {Object} options.shadowState - ShadowState instance
   * @param {Object} options.brokerGateway - BrokerGateway instance
   * @param {Logger} [options.logger] - Logger instance
   * @param {number} [options.maxPyramidLayers] - Maximum pyramid layers (default: 4)
   * @param {number} [options.pyramidTriggerPct] - Trigger percentage (default: 0.02 = 2%)
   * @param {number} [options.autoTrailAfterLayer] - Layer after which to auto-trail (default: 2)
   */
  constructor(options = {}) {
    super();
    
    if (!options.shadowState) {
      throw new Error('shadowState is required');
    }
    if (!options.brokerGateway) {
      throw new Error('brokerGateway is required');
    }
    
    /** @type {Object} ShadowState instance */
    this.shadowState = options.shadowState;
    
    /** @type {Object} BrokerGateway instance */
    this.brokerGateway = options.brokerGateway;
    
    /** @type {number} Maximum pyramid layers */
    this.maxPyramidLayers = options.maxPyramidLayers || CONFIG.MAX_PYRAMID_LAYERS;
    
    /** @type {number} Pyramid trigger percentage */
    this.pyramidTriggerPct = options.pyramidTriggerPct || CONFIG.PYRAMID_TRIGGER_PCT;
    
    /** @type {number} Layer after which to auto-trail */
    this.autoTrailAfterLayer = options.autoTrailAfterLayer || CONFIG.AUTO_TRAIL_AFTER_LAYER;
    
    /** @type {Map<string, PyramidState>} symbol → PyramidState */
    this.pyramidStates = new Map();
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // PYRAMID OPPORTUNITY DETECTION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if pyramid opportunity exists for a symbol
   * Requirements: 87.2 - Trigger pyramid when close > last_entry * 1.02 AND regime == Risk-On
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} currentPrice - Current market price
   * @param {number} regimeState - Regime state (1=Risk-On, 0=Neutral, -1=Risk-Off)
   * @returns {boolean} True if pyramid opportunity exists
   */
  checkPyramidOpportunity(symbol, currentPrice, regimeState) {
    // Requirements: 87.1 - Only enable when allow_pyramiding is true (Phase 2 only)
    // This is checked by the caller (PhaseManager)
    
    // Requirements: 87.2 - Require regime == Risk-On
    if (regimeState !== 1) {
      return false;
    }
    
    // Get position from Shadow State
    const position = this.shadowState.getPosition(symbol);
    if (!position) {
      return false;
    }
    
    // Get or create pyramid state
    let pyramidState = this.pyramidStates.get(symbol);
    if (!pyramidState) {
      // Initialize pyramid state from existing position
      pyramidState = this._initializePyramidState(position);
      this.pyramidStates.set(symbol, pyramidState);
    }
    
    // Requirements: 87.3 - Limit to maximum 4 layers
    if (pyramidState.layerCount >= this.maxPyramidLayers) {
      this.logger.warn({
        symbol,
        layer_count: pyramidState.layerCount,
        max_layers: this.maxPyramidLayers,
      }, 'Maximum pyramid layers reached');
      
      this.emit('pyramid:max_layers', {
        symbol,
        layer_count: pyramidState.layerCount,
        max_layers: this.maxPyramidLayers,
        timestamp: new Date().toISOString(),
      });
      
      return false;
    }
    
    // Requirements: 87.2 - Check if price > last_entry * 1.02
    const lastEntryPrice = pyramidState.lastEntryPrice;
    const triggerPrice = pyramidState.side === 'LONG' 
      ? lastEntryPrice * (1 + this.pyramidTriggerPct)
      : lastEntryPrice * (1 - this.pyramidTriggerPct);
    
    const opportunityExists = pyramidState.side === 'LONG'
      ? currentPrice > triggerPrice
      : currentPrice < triggerPrice;
    
    if (opportunityExists) {
      this.logger.info({
        symbol,
        side: pyramidState.side,
        current_price: currentPrice,
        last_entry_price: lastEntryPrice,
        trigger_price: triggerPrice,
        layer_count: pyramidState.layerCount,
      }, 'Pyramid opportunity detected');
      
      this.emit('pyramid:opportunity', {
        symbol,
        side: pyramidState.side,
        current_price: currentPrice,
        last_entry_price: lastEntryPrice,
        trigger_price: triggerPrice,
        layer_count: pyramidState.layerCount,
        timestamp: new Date().toISOString(),
      });
    }
    
    return opportunityExists;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // PYRAMID LAYER MANAGEMENT
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Add a pyramid layer to an existing position
   * Requirements: 87.4 - Auto-trail stop loss to avg_entry_price after 2nd layer
   * Requirements: 87.5 - Log layer_number, entry_price, avg_entry_price, total_size, new_stop_loss
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} size - Size of new layer
   * @param {number} price - Entry price for new layer
   * @returns {Promise<Object>} Result with updated pyramid state
   */
  async addPyramidLayer(symbol, size, price) {
    // Validate inputs
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('symbol is required and must be a string');
    }
    if (typeof size !== 'number' || size <= 0 || !Number.isFinite(size)) {
      throw new Error('size must be a positive finite number');
    }
    if (typeof price !== 'number' || price <= 0 || !Number.isFinite(price)) {
      throw new Error('price must be a positive finite number');
    }
    
    // Get pyramid state
    const pyramidState = this.pyramidStates.get(symbol);
    if (!pyramidState) {
      throw new Error(`No pyramid state found for symbol: ${symbol}`);
    }
    
    // Check max layers
    if (pyramidState.layerCount >= this.maxPyramidLayers) {
      throw new Error(`Max pyramid layers (${this.maxPyramidLayers}) already reached for ${symbol}`);
    }
    
    // Update pyramid state
    pyramidState.layerCount += 1;
    pyramidState.entryPrices.push(price);
    pyramidState.layerSizes.push(size);
    pyramidState.lastEntryPrice = price;
    pyramidState.totalSize += size;
    pyramidState.avgEntryPrice = calculateAvgEntryPrice(
      pyramidState.entryPrices,
      pyramidState.layerSizes
    );
    pyramidState.lastUpdatedAt = new Date().toISOString();
    
    // Requirements: 87.4 - Auto-trail stop loss to avg_entry_price after 2nd layer
    let newStopLoss = pyramidState.currentStopLoss;
    const oldStopLoss = pyramidState.currentStopLoss;
    if (pyramidState.layerCount >= this.autoTrailAfterLayer && !pyramidState.autoTrailEnabled) {
      newStopLoss = pyramidState.avgEntryPrice;
      pyramidState.currentStopLoss = newStopLoss;
      pyramidState.autoTrailEnabled = true;
      
      // Update broker stop loss
      await this._updateBrokerStopLoss(symbol, newStopLoss);
      
      this.logger.info({
        symbol,
        layer_number: pyramidState.layerCount,
        avg_entry_price: pyramidState.avgEntryPrice,
        old_stop_loss: oldStopLoss,
        new_stop_loss: newStopLoss,
      }, 'Auto-trail activated');
      
      this.emit('pyramid:trail_updated', {
        symbol,
        layer_number: pyramidState.layerCount,
        avg_entry_price: pyramidState.avgEntryPrice,
        new_stop_loss: newStopLoss,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Requirements: 87.5 - Log all pyramid details
    this.logger.info({
      symbol,
      layer_number: pyramidState.layerCount,
      entry_price: price,
      avg_entry_price: pyramidState.avgEntryPrice,
      total_size: pyramidState.totalSize,
      new_stop_loss: newStopLoss,
      auto_trail_enabled: pyramidState.autoTrailEnabled,
    }, 'Pyramid layer added');
    
    this.emit('pyramid:added', {
      symbol,
      layer_number: pyramidState.layerCount,
      entry_price: price,
      layer_size: size,
      avg_entry_price: pyramidState.avgEntryPrice,
      total_size: pyramidState.totalSize,
      new_stop_loss: newStopLoss,
      auto_trail_enabled: pyramidState.autoTrailEnabled,
      timestamp: new Date().toISOString(),
    });
    
    return {
      success: true,
      pyramid_state: this._clonePyramidState(pyramidState),
    };
  }

  //─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Initialize pyramid state from existing position
   * @param {Object} position - Position from Shadow State
   * @returns {PyramidState} Initialized pyramid state
   * @private
   */
  _initializePyramidState(position) {
    return {
      symbol: position.symbol,
      side: position.side,
      layerCount: 1,
      entryPrices: [position.entry_price],
      layerSizes: [position.size],
      lastEntryPrice: position.entry_price,
      avgEntryPrice: position.entry_price,
      totalSize: position.size,
      currentStopLoss: position.stop_loss,
      autoTrailEnabled: false,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  /**
   * Clone pyramid state (deep copy for arrays)
   * @param {PyramidState} state - State to clone
   * @returns {PyramidState} Cloned state
   * @private
   */
  _clonePyramidState(state) {
    return {
      ...state,
      entryPrices: [...state.entryPrices],
      layerSizes: [...state.layerSizes],
    };
  }

  /**
   * Update broker stop loss via BrokerGateway
   * @param {string} symbol - Trading symbol
   * @param {number} newStopLoss - New stop loss price
   * @returns {Promise<void>}
   * @private
   */
  async _updateBrokerStopLoss(symbol, newStopLoss) {
    try {
      // In a real implementation, this would call broker API to update stop loss
      // For now, we'll log the action
      this.logger.info({
        symbol,
        new_stop_loss: newStopLoss,
      }, 'Updating broker stop loss');
      
      // Try to call broker adapter's updateStopLoss if it exists
      const adapter = this.brokerGateway.getAdapter();
      if (adapter && typeof adapter.updateStopLoss === 'function') {
        await adapter.updateStopLoss({
          symbol,
          new_stop_loss: newStopLoss,
        });
      }
      
      // Emit event for server handling
      this.emit('stop_loss:update_required', {
        symbol,
        new_stop_loss: newStopLoss,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      this.logger.error({
        symbol,
        new_stop_loss: newStopLoss,
        error: error.message,
      }, 'Failed to update broker stop loss');
      throw error;
    }
  }

  //─────────────────────────────────────────────────────────────────────────────
  // STATE QUERIES
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get pyramid state for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {PyramidState|undefined} Pyramid state (copy) or undefined
   */
  getPyramidState(symbol) {
    const state = this.pyramidStates.get(symbol);
    return state ? this._clonePyramidState(state) : undefined;
  }

  /**
   * Get all pyramid states
   * @returns {Map<string, PyramidState>} Map of pyramid states (copies)
   */
  getAllPyramidStates() {
    const copy = new Map();
    for (const [symbol, state] of this.pyramidStates) {
      copy.set(symbol, this._clonePyramidState(state));
    }
    return copy;
  }

  /**
   * Check if symbol has pyramid state
   * @param {string} symbol - Trading symbol
   * @returns {boolean} True if pyramid state exists
   */
  hasPyramidState(symbol) {
    return this.pyramidStates.has(symbol);
  }

  /**
   * Get layer count for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {number} Layer count or 0 if no pyramid state
   */
  getLayerCount(symbol) {
    const state = this.pyramidStates.get(symbol);
    return state ? state.layerCount : 0;
  }

  /**
   * Check if auto-trail is enabled for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {boolean} True if auto-trail is enabled
   */
  isAutoTrailEnabled(symbol) {
    const state = this.pyramidStates.get(symbol);
    return state ? state.autoTrailEnabled : false;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Close all pyramid layers for a symbol
   * Requirements: 87.6 - Close all pyramid layers when regime changes to Risk-Off
   * 
   * @param {string} symbol - Trading symbol
   * @param {string} reason - Reason for closing (e.g., 'REGIME_KILL')
   * @returns {Promise<Object>} Result with closed layers info
   */
  async closeAllLayers(symbol, reason = 'MANUAL_CLOSE') {
    const pyramidState = this.pyramidStates.get(symbol);
    if (!pyramidState) {
      this.logger.warn({
        symbol,
        reason,
      }, 'No pyramid state found for symbol');
      return {
        success: false,
        reason: 'NO_PYRAMID_STATE',
      };
    }
    
    this.logger.warn({
      symbol,
      layers: pyramidState.layerCount,
      total_size: pyramidState.totalSize,
      reason,
    }, 'Closing all pyramid layers');
    
    try {
      // Close position via broker gateway
      // In production, this would call broker API to close the entire position
      this.emit('pyramid:close_all', {
        symbol,
        layers: pyramidState.layerCount,
        total_size: pyramidState.totalSize,
        reason,
        timestamp: new Date().toISOString(),
      });
      
      // Remove pyramid state
      this.pyramidStates.delete(symbol);
      
      this.logger.info({
        symbol,
        layers_closed: pyramidState.layerCount,
        reason,
      }, 'All pyramid layers closed');
      
      return {
        success: true,
        layers_closed: pyramidState.layerCount,
        total_size: pyramidState.totalSize,
        reason,
      };
      
    } catch (error) {
      this.logger.error({
        symbol,
        error: error.message,
        reason,
      }, 'Failed to close pyramid layers');
      
      return {
        success: false,
        error: error.message,
        reason,
      };
    }
  }

  /**
   * Remove pyramid state for a symbol (when position is closed)
   * Requirements: 87.6 - Close all pyramid layers when regime changes to Risk-Off
   * 
   * @param {string} symbol - Trading symbol
   * @returns {boolean} True if state was removed
   */
  removePyramidState(symbol) {
    const existed = this.pyramidStates.has(symbol);
    if (existed) {
      this.pyramidStates.delete(symbol);
      this.logger.info({
        symbol,
      }, 'Pyramid state removed');
    }
    return existed;
  }

  /**
   * Clear all pyramid states
   */
  clearAllPyramidStates() {
    const count = this.pyramidStates.size;
    this.pyramidStates.clear();
    this.logger.info({
      cleared_count: count,
    }, 'All pyramid states cleared');
  }

  /**
   * Reset pyramid manager (for testing)
   */
  reset() {
    this.clearAllPyramidStates();
    this.logger.info({}, 'PyramidManager reset');
  }
}

export default PyramidManager;
