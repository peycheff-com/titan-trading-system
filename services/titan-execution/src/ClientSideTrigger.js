/**
 * Client-Side Triggering
 * 
 * Monitors WebSocket price feed and triggers trades locally when conditions are met,
 * bypassing TradingView webhook latency (target: <20ms vs 100-3000ms).
 * 
 * Requirements: 72.1-72.8
 * 
 * @module ClientSideTrigger
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {number} Default timeout for trigger condition (bar_close + 5s) */
const DEFAULT_TRIGGER_TIMEOUT_MS = 5000;

/** @constant {number} Reconnection delay in milliseconds */
const RECONNECT_DELAY_MS = 1000;

/** @constant {number} Maximum reconnection attempts */
const MAX_RECONNECT_ATTEMPTS = 5;

/** @constant {number} Ping interval in milliseconds */
const PING_INTERVAL_MS = 30000;

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TriggerIntent
 * @property {string} signal_id - Unique signal identifier
 * @property {string} symbol - Trading symbol
 * @property {number} trigger_price - Price level to trigger at
 * @property {string} trigger_condition - Condition expression (e.g., "price > 50100")
 * @property {number} direction - Trade direction (1=long, -1=short)
 * @property {number} bar_close_time - Expected bar close timestamp
 * @property {number} prepared_at - Timestamp when intent was prepared
 * @property {Object} payload - Full PREPARE payload
 * @property {NodeJS.Timeout} timeout_timer - Timeout timer reference
 * @property {boolean} triggered - Whether trigger has fired
 */

/**
 * @typedef {Object} TriggerResult
 * @property {boolean} success - Whether trigger was successful
 * @property {string} signal_id - Signal identifier
 * @property {number} trigger_price - Price that triggered
 * @property {number} latency_ms - Latency from PREPARE to trigger
 * @property {string} [reason] - Reason for failure
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
 * Evaluate trigger condition
 * Requirements: 72.3 - Execute when live_price satisfies trigger_condition locally
 * 
 * @param {string} condition - Condition expression (e.g., "price > 50100")
 * @param {number} price - Current price
 * @returns {boolean} True if condition is met
 */
function evaluateTriggerCondition(condition, price) {
  try {
    // Parse condition: "price > 50100", "price < 49500", "price >= 50100", "price <= 49500"
    const match = condition.match(/price\s*([><=]+)\s*([\d.]+)/);
    if (!match) {
      return false;
    }
    
    const operator = match[1];
    const targetPrice = parseFloat(match[2]);
    
    switch (operator) {
      case '>':
        return price > targetPrice;
      case '<':
        return price < targetPrice;
      case '>=':
        return price >= targetPrice;
      case '<=':
        return price <= targetPrice;
      case '==':
      case '===':
        return Math.abs(price - targetPrice) < 0.0001; // Epsilon comparison
      default:
        return false;
    }
  } catch (error) {
    return false;
  }
}

//─────────────────────────────────────────────────────────────────────────────
// CLIENT-SIDE TRIGGER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Client-Side Trigger
 * 
 * Monitors WebSocket price feed and triggers trades locally when conditions are met.
 * 
 * Events emitted:
 * - 'trigger:fired' - Trigger condition met, execution initiated
 * - 'trigger:timeout' - Trigger condition not met within timeout
 * - 'trigger:aborted' - Trigger aborted by ABORT signal
 * - 'trigger:duplicate' - CONFIRM received after client-side trigger (idempotency)
 * - 'connected' - WebSocket connection established
 * - 'disconnected' - WebSocket connection lost
 * - 'error' - Error occurred
 */
export class ClientSideTrigger extends EventEmitter {
  /**
   * Create a new ClientSideTrigger instance
   * @param {Object} options - Configuration options
   * @param {string} options.wsUrl - WebSocket URL for trade stream
   * @param {boolean} [options.enabled=true] - Whether client-side triggering is enabled
   * @param {number} [options.triggerTimeoutMs] - Timeout for trigger condition
   * @param {Function} [options.onTrigger] - Callback when trigger fires
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    /** @type {string} WebSocket URL */
    this.wsUrl = options.wsUrl || '';
    
    /** @type {boolean} Whether client-side triggering is enabled */
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    
    /** @type {number} Trigger timeout in milliseconds */
    this.triggerTimeoutMs = options.triggerTimeoutMs || DEFAULT_TRIGGER_TIMEOUT_MS;
    
    /** @type {Function|null} Callback when trigger fires */
    this.onTrigger = options.onTrigger || null;
    
    /** @type {Map<string, TriggerIntent>} signal_id → TriggerIntent */
    this.activeIntents = new Map();
    
    /** @type {Map<string, string>} symbol → stream subscription */
    this.symbolSubscriptions = new Map();
    
    /** @type {WebSocket|null} WebSocket connection */
    this.ws = null;
    
    /** @type {boolean} Whether we're connected */
    this.connected = false;
    
    /** @type {number} Current reconnection attempt count */
    this.reconnectAttempts = 0;
    
    /** @type {NodeJS.Timeout|null} Reconnection timer */
    this._reconnectTimer = null;
    
    /** @type {NodeJS.Timeout|null} Ping timer */
    this._pingTimer = null;
    
    /** @type {boolean} Whether we're intentionally closing */
    this._closing = false;
    
    /** @type {Set<string>} Set of triggered signal IDs (for idempotency) */
    this.triggeredSignals = new Set();
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
  }

  /**
   * Connect to WebSocket trade stream
   * Requirements: 72.2 - Subscribe to WebSocket trade stream for symbol
   * 
   * @returns {Promise<void>} Resolves when connected
   */
  async connect() {
    if (!this.wsUrl) {
      throw new Error('WebSocket URL is required');
    }
    
    if (!this.enabled) {
      this.logger.info({}, 'Client-side triggering disabled, skipping WebSocket connection');
      return;
    }
    
    this._closing = false;
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.on('open', () => {
          this.logger.info({ url: this.wsUrl }, 'Trade stream WebSocket connected');
          this.connected = true;
          this.reconnectAttempts = 0;
          this._startPingInterval();
          
          // Resubscribe to symbols if any
          this._resubscribeAll();
          
          this.emit('connected');
          resolve();
        });
        
        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });
        
        this.ws.on('close', (code, reason) => {
          this._handleDisconnect(code, reason?.toString());
        });
        
        this.ws.on('error', (error) => {
          this.logger.error({ error: error.message }, 'Trade stream WebSocket error');
          this.emit('error', error);
          
          // Only reject if we haven't connected yet
          if (!this.connected && this.reconnectAttempts === 0) {
            reject(error);
          }
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket trade stream
   */
  disconnect() {
    this._closing = true;
    this._clearTimers();
    
    // Clear all active intents
    for (const [signal_id, intent] of this.activeIntents) {
      if (intent.timeout_timer) {
        clearTimeout(intent.timeout_timer);
      }
    }
    this.activeIntents.clear();
    
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        // Ignore close errors
      }
      this.ws = null;
    }
    
    this.connected = false;
    this.logger.info({}, 'Trade stream WebSocket disconnected intentionally');
  }

  /**
   * Prepare a trigger intent from PREPARE payload
   * Requirements: 72.1 - Parse trigger_price and trigger_condition from PREPARE payload
   * 
   * @param {Object} payload - PREPARE payload
   * @returns {TriggerIntent} Prepared intent
   */
  prepareTrigger(payload) {
    if (!this.enabled) {
      this.logger.info({ signal_id: payload.signal_id }, 'Client-side triggering disabled, skipping preparation');
      return null;
    }
    
    const { signal_id, symbol, trigger_price, trigger_condition, direction, timestamp } = payload;
    
    if (!trigger_price || !trigger_condition) {
      this.logger.warn({ signal_id }, 'Missing trigger_price or trigger_condition in PREPARE payload');
      return null;
    }
    
    // Calculate bar close time (timestamp + timeframe duration)
    const bar_close_time = new Date(timestamp).getTime() + this._getTimeframeDuration(payload.timeframe);
    
    const intent = {
      signal_id,
      symbol,
      trigger_price,
      trigger_condition,
      direction,
      bar_close_time,
      prepared_at: Date.now(),
      payload,
      timeout_timer: null,
      triggered: false,
    };
    
    // Set timeout: bar_close + 5s
    // Requirements: 72.7 - Auto-abort if trigger not met within bar_close + 5s
    const timeout_ms = (bar_close_time - Date.now()) + this.triggerTimeoutMs;
    intent.timeout_timer = setTimeout(() => {
      this._handleTimeout(signal_id);
    }, Math.max(timeout_ms, 0));
    
    // Store intent
    this.activeIntents.set(signal_id, intent);
    
    // Subscribe to symbol if not already subscribed
    this._subscribeToSymbol(symbol);
    
    this.logger.info({ 
      signal_id, 
      symbol, 
      trigger_condition,
      timeout_ms,
    }, 'Trigger intent prepared');
    
    return intent;
  }

  /**
   * Handle CONFIRM webhook (check for duplicate)
   * Requirements: 72.5 - Ignore CONFIRM as duplicate if client-side trigger already fired
   * 
   * @param {string} signal_id - Signal identifier
   * @returns {{is_duplicate: boolean, reason?: string}} Result
   */
  handleConfirm(signal_id) {
    if (!this.enabled) {
      return { is_duplicate: false };
    }
    
    // Check if we already triggered this signal
    if (this.triggeredSignals.has(signal_id)) {
      this.logger.info({ signal_id }, 'CONFIRM received after client-side trigger - ignoring as duplicate');
      this.emit('trigger:duplicate', { signal_id });
      return { is_duplicate: true, reason: 'CLIENT_SIDE_TRIGGER_ALREADY_FIRED' };
    }
    
    // Remove intent if it exists (normal CONFIRM flow)
    const intent = this.activeIntents.get(signal_id);
    if (intent) {
      if (intent.timeout_timer) {
        clearTimeout(intent.timeout_timer);
      }
      this.activeIntents.delete(signal_id);
    }
    
    return { is_duplicate: false };
  }

  /**
   * Handle ABORT webhook
   * Requirements: 72.6 - Log warning if ABORT arrives after client-side trigger
   * 
   * @param {string} signal_id - Signal identifier
   * @returns {{already_triggered: boolean}} Result
   */
  handleAbort(signal_id) {
    if (!this.enabled) {
      return { already_triggered: false };
    }
    
    // Check if we already triggered this signal
    if (this.triggeredSignals.has(signal_id)) {
      this.logger.warn({ signal_id }, 'LATE_ABORT_AFTER_EXECUTION - ABORT received after client-side trigger');
      return { already_triggered: true };
    }
    
    // Remove intent
    const intent = this.activeIntents.get(signal_id);
    if (intent) {
      if (intent.timeout_timer) {
        clearTimeout(intent.timeout_timer);
      }
      this.activeIntents.delete(signal_id);
      
      this.logger.info({ signal_id }, 'Trigger intent aborted');
      this.emit('trigger:aborted', { signal_id });
    }
    
    return { already_triggered: false };
  }

  /**
   * Handle incoming WebSocket message
   * Requirements: 72.3 - Execute immediately when live_price satisfies trigger_condition
   * 
   * @param {Buffer|string} data - Raw message data
   * @private
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle different message formats (Binance-style trade stream)
      let symbol, price;
      
      if (message.e === 'trade') {
        // Individual trade
        symbol = message.s;
        price = parseFloat(message.p);
      } else if (message.stream && message.data) {
        // Combined stream format
        const streamData = message.data;
        if (streamData.e === 'trade') {
          symbol = streamData.s;
          price = parseFloat(streamData.p);
        }
      } else if (message.symbol && message.price) {
        // Generic format
        symbol = message.symbol;
        price = parseFloat(message.price);
      }
      
      if (!symbol || !price) {
        return;
      }
      
      // Check all active intents for this symbol
      for (const [signal_id, intent] of this.activeIntents) {
        if (intent.symbol === symbol && !intent.triggered) {
          // Evaluate trigger condition
          if (evaluateTriggerCondition(intent.trigger_condition, price)) {
            this._fireTrigger(signal_id, price);
          }
        }
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to parse trade stream message');
    }
  }

  /**
   * Fire a trigger
   * Requirements: 72.4 - Log "CLIENT_SIDE_TRIGGER" with latency_ms (target: < 20ms)
   * 
   * @param {string} signal_id - Signal identifier
   * @param {number} trigger_price - Price that triggered
   * @private
   */
  _fireTrigger(signal_id, trigger_price) {
    const intent = this.activeIntents.get(signal_id);
    if (!intent || intent.triggered) {
      return;
    }
    
    // Mark as triggered
    intent.triggered = true;
    this.triggeredSignals.add(signal_id);
    
    // Clear timeout
    if (intent.timeout_timer) {
      clearTimeout(intent.timeout_timer);
    }
    
    // Calculate latency
    const latency_ms = Date.now() - intent.prepared_at;
    
    // Log trigger
    this.logger.info({
      signal_id,
      symbol: intent.symbol,
      trigger_price,
      trigger_condition: intent.trigger_condition,
      latency_ms,
    }, 'CLIENT_SIDE_TRIGGER - Condition met, executing locally');
    
    // Emit event
    const result = {
      success: true,
      signal_id,
      trigger_price,
      latency_ms,
      payload: intent.payload,
    };
    
    this.emit('trigger:fired', result);
    
    // Call callback if provided
    if (this.onTrigger) {
      this.onTrigger(result);
    }
    
    // Remove intent after a delay (keep for idempotency check)
    setTimeout(() => {
      this.activeIntents.delete(signal_id);
      
      // Clean up triggered signals after 5 minutes
      setTimeout(() => {
        this.triggeredSignals.delete(signal_id);
      }, 300000);
    }, 1000);
  }

  /**
   * Handle trigger timeout
   * Requirements: 72.7 - Auto-abort if trigger not met within bar_close + 5s
   * 
   * @param {string} signal_id - Signal identifier
   * @private
   */
  _handleTimeout(signal_id) {
    const intent = this.activeIntents.get(signal_id);
    if (!intent || intent.triggered) {
      return;
    }
    
    this.logger.warn({
      signal_id,
      symbol: intent.symbol,
      trigger_condition: intent.trigger_condition,
    }, 'TRIGGER_TIMEOUT - Condition not met within timeout');
    
    // Remove intent
    this.activeIntents.delete(signal_id);
    
    // Emit event
    this.emit('trigger:timeout', {
      signal_id,
      reason: 'TRIGGER_TIMEOUT',
    });
  }

  /**
   * Handle WebSocket disconnection
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   * @private
   */
  _handleDisconnect(code, reason) {
    this._clearTimers();
    this.connected = false;
    
    this.logger.warn({ code, reason }, 'Trade stream WebSocket disconnected');
    this.emit('disconnected', { code, reason });
    
    // Attempt reconnection if not intentionally closing
    if (!this._closing) {
      this._scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.logger.error({ attempts: this.reconnectAttempts }, 'Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    this.logger.info({ attempt: this.reconnectAttempts, delay }, 'Scheduling reconnection');
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
    
    this._reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.logger.error({ error: error.message }, 'Reconnection failed');
        this._scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Subscribe to symbol trade stream
   * @param {string} symbol - Trading symbol
   * @private
   */
  _subscribeToSymbol(symbol) {
    if (this.symbolSubscriptions.has(symbol)) {
      return; // Already subscribed
    }
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Binance-style subscription
    const stream = `${symbol.toLowerCase()}@trade`;
    
    const subscribeMsg = {
      method: 'SUBSCRIBE',
      params: [stream],
      id: Date.now(),
    };
    
    this.ws.send(JSON.stringify(subscribeMsg));
    this.symbolSubscriptions.set(symbol, stream);
    
    this.logger.info({ symbol, stream }, 'Subscribed to trade stream');
  }

  /**
   * Resubscribe to all symbols after reconnection
   * @private
   */
  _resubscribeAll() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const streams = [...this.symbolSubscriptions.values()];
    if (streams.length === 0) {
      return;
    }
    
    const subscribeMsg = {
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now(),
    };
    
    this.ws.send(JSON.stringify(subscribeMsg));
    this.logger.info({ count: streams.length }, 'Resubscribed to trade streams');
  }

  /**
   * Start ping interval to keep connection alive
   * @private
   */
  _startPingInterval() {
    this._pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, PING_INTERVAL_MS);
  }

  /**
   * Clear all timers
   * @private
   */
  _clearTimers() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  /**
   * Get timeframe duration in milliseconds
   * @param {string} timeframe - Timeframe string (e.g., "15", "1h", "4h")
   * @returns {number} Duration in milliseconds
   * @private
   */
  _getTimeframeDuration(timeframe) {
    if (!timeframe) {
      return 60000; // Default 1 minute
    }
    
    const match = timeframe.match(/^(\d+)([mhd])?$/);
    if (!match) {
      return 60000;
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2] || 'm'; // Default to minutes
    
    switch (unit) {
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 60000;
    }
  }

  /**
   * Get status information
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      enabled: this.enabled,
      connected: this.connected,
      active_intents: this.activeIntents.size,
      triggered_signals: this.triggeredSignals.size,
      subscribed_symbols: this.symbolSubscriptions.size,
      reconnect_attempts: this.reconnectAttempts,
    };
  }

  /**
   * Get active intents
   * @returns {Map<string, TriggerIntent>} Active intents
   */
  getActiveIntents() {
    return this.activeIntents;
  }

  /**
   * Enable client-side triggering
   * Requirements: 72.8 - Input toggle to disable client-side triggering
   */
  enable() {
    if (!this.enabled) {
      this.enabled = true;
      this.logger.info({}, 'Client-side triggering enabled');
      
      // Connect if not already connected
      if (!this.connected && this.wsUrl) {
        this.connect().catch(error => {
          this.logger.error({ error: error.message }, 'Failed to connect after enabling');
        });
      }
    }
  }

  /**
   * Disable client-side triggering
   * Requirements: 72.8 - Input toggle to disable client-side triggering
   * Fallback to standard PREPARE/CONFIRM flow
   */
  disable() {
    if (this.enabled) {
      this.enabled = false;
      this.logger.info({}, 'Client-side triggering disabled - falling back to standard PREPARE/CONFIRM flow');
      
      // Disconnect WebSocket
      this.disconnect();
    }
  }
}

export default ClientSideTrigger;
