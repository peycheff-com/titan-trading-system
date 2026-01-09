/**
 * Console WebSocket Handler
 * 
 * Provides real-time state updates to Command Console clients via WebSocket /ws/console endpoint.
 * Broadcasts equity, positions, phase, regime, and other operational state.
 * 
 * Features:
 * - Message batching for high-frequency updates
 * - Payload compression for large messages
 * - Delta updates to minimize bandwidth
 * 
 * Requirements: 89.6, 95.3-95.6, 3.1-3.5 (WebSocket optimization)
 * 
 * @module ConsoleWebSocket
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { WebSocketOptimizer } from './utils/WebSocketOptimizer.js';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  HEARTBEAT_INTERVAL_MS: 30000,
  CLIENT_TIMEOUT_MS: 60000,
  MAX_CLIENTS: parseInt(process.env.MAX_CONSOLE_CLIENTS || '50'), // Increased limit to prevent 1013 errors
  PATH: '/ws/console',
  STATE_BROADCAST_INTERVAL_MS: 1000, // Broadcast state every 1 second
  // Optimization settings (Requirements: 3.1-3.5)
  BATCH_INTERVAL_MS: 50, // Batch updates every 50ms
  MAX_BATCH_SIZE: 20, // Max messages per batch
  COMPRESSION_THRESHOLD: 2048, // Compress payloads > 2KB
  ENABLE_DELTA_UPDATES: true, // Send only changed fields
};

/** @constant {Set<string>} Valid state update types */
const STATE_TYPES = new Set([
  'STATE_UPDATE',
  'EQUITY_UPDATE',
  'POSITION_UPDATE',
  'PHASE_CHANGE',
  'REGIME_CHANGE',
  'MASTER_ARM_CHANGE',
  'EMERGENCY_FLATTEN',
  'CONFIG_CHANGE',
  'HEARTBEAT',
  'CONNECTED',
]);

/**
 * Validate state update type
 * @param {string} type - Update type to validate
 * @returns {boolean} True if valid
 */
function isValidStateType(type) {
  return STATE_TYPES.has(type);
}

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} StateUpdate
 * @property {string} type - Update type
 * @property {number} [equity] - Current equity
 * @property {number} [daily_pnl] - Daily PnL
 * @property {number} [daily_pnl_pct] - Daily PnL percentage
 * @property {number} [active_positions] - Number of active positions
 * @property {number} [phase] - Current phase (1 or 2)
 * @property {string} [phase_label] - Phase label (e.g., "PHASE 1: KICKSTARTER")
 * @property {Object} [regime] - Regime state
 * @property {boolean} [master_arm] - Master arm state
 * @property {Object[]} [positions] - Array of positions
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} ClientInfo
 * @property {string} id - Client ID
 * @property {WebSocket} ws - WebSocket connection
 * @property {number} connectedAt - Connection timestamp
 * @property {number} lastPing - Last ping timestamp
 * @property {boolean} isAlive - Whether client is alive
 * @property {string} ip - Client IP address
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
 * Generate a unique client ID
 * @returns {string} Client ID
 */
function generateClientId() {
  return `console_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

//─────────────────────────────────────────────────────────────────────────────
// CONSOLE WEBSOCKET CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Console WebSocket Handler
 * 
 * Provides real-time state updates to Command Console clients.
 * 
 * Requirements:
 * - 89.6: Establish WebSocket connection to microservice for real-time updates
 * - 95.3: Use WebSocket for real-time state synchronization
 * - 95.4: Extend backend with Console-specific endpoints
 * - 95.5: Push updates to all connected Console clients via WebSocket
 * - 95.6: Continue normal operation when Console disconnects (monitoring only)
 * 
 * Events emitted:
 * - 'client:connected' - When a console client connects
 * - 'client:disconnected' - When a console client disconnects
 * - 'state:broadcast' - When state is broadcast to clients
 */
export class ConsoleWebSocket extends EventEmitter {
  /**
   * Create a new ConsoleWebSocket instance
   * @param {Object} options - Configuration options
   * @param {number} [options.port] - WebSocket server port (if standalone)
   * @param {Object} [options.server] - HTTP server to attach to
   * @param {string} [options.path='/ws/console'] - WebSocket path
   * @param {number} [options.heartbeatIntervalMs] - Heartbeat interval
   * @param {number} [options.clientTimeoutMs] - Client timeout
   * @param {number} [options.maxClients] - Maximum concurrent clients
   * @param {number} [options.stateBroadcastIntervalMs] - State broadcast interval
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    /** @type {string} WebSocket path */
    this.path = options.path || CONFIG.PATH;
    
    /** @type {number} Heartbeat interval in milliseconds */
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || CONFIG.HEARTBEAT_INTERVAL_MS;
    
    /** @type {number} Client timeout in milliseconds */
    this.clientTimeoutMs = options.clientTimeoutMs || CONFIG.CLIENT_TIMEOUT_MS;
    
    /** @type {number} Maximum concurrent clients */
    this.maxClients = options.maxClients || CONFIG.MAX_CLIENTS;
    
    /** @type {number} State broadcast interval in milliseconds */
    this.stateBroadcastIntervalMs = options.stateBroadcastIntervalMs || CONFIG.STATE_BROADCAST_INTERVAL_MS;
    
    /** @type {Map<string, ClientInfo>} Connected clients */
    this._clients = new Map();
    
    /** @type {WebSocketServer|null} WebSocket server */
    this._wss = null;
    
    /** @type {NodeJS.Timeout|null} Heartbeat interval */
    this._heartbeatInterval = null;
    
    /** @type {NodeJS.Timeout|null} State broadcast interval */
    this._stateBroadcastInterval = null;
    
    /** @type {number} Total messages broadcast */
    this._messageCount = 0;
    
    /** @type {number} Total clients connected (lifetime) */
    this._totalConnections = 0;
    
    /** @type {number} Total connections rejected (lifetime) */
    this._rejectedConnections = 0;
    
    /** @type {Object|null} Last known state */
    this._lastState = null;
    
    /** @type {Function|null} State provider function */
    this._stateProvider = null;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
    // Initialize WebSocket optimizer (Requirements: 3.1-3.5)
    this._optimizer = new WebSocketOptimizer({
      batchIntervalMs: options.batchIntervalMs || CONFIG.BATCH_INTERVAL_MS,
      maxBatchSize: options.maxBatchSize || CONFIG.MAX_BATCH_SIZE,
      compressionThreshold: options.compressionThreshold || CONFIG.COMPRESSION_THRESHOLD,
      enableDeltaUpdates: options.enableDeltaUpdates ?? CONFIG.ENABLE_DELTA_UPDATES,
      logger: this.logger,
    });
    
    // Initialize WebSocket server
    if (options.server) {
      this._initWithServer(options.server);
    } else if (options.port) {
      this._initStandalone(options.port);
    }
  }

  //─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Initialize WebSocket server attached to HTTP server
   * Requirements: 95.4 - Extend backend with Console-specific endpoints
   * @param {Object} server - HTTP server
   * @private
   */
  _initWithServer(server) {
    // Use noServer mode and manually handle upgrade to avoid Fastify intercepting
    this._wss = new WebSocketServer({ 
      noServer: true,
      clientTracking: true,
    });
    
    // Handle upgrade event manually for our path
    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
      
      if (pathname === this.path) {
        this._wss.handleUpgrade(request, socket, head, (ws) => {
          this._wss.emit('connection', ws, request);
        });
      }
      // Don't destroy socket for other paths - let other handlers process them
    });
    
    this._setupServer();
    this.logger.info({ path: this.path }, 'Console WebSocket handler initialized (attached to server)');
  }

  /**
   * Initialize standalone WebSocket server
   * @param {number} port - Port number
   * @private
   */
  _initStandalone(port) {
    this._wss = new WebSocketServer({ 
      port,
    });
    
    this._setupServer();
    this.logger.info({ port, path: this.path }, 'Console WebSocket handler initialized (standalone)');
  }

  /**
   * Setup WebSocket server event handlers
   * @private
   */
  _setupServer() {
    if (!this._wss) return;
    
    this._wss.on('connection', (ws, req) => {
      this._handleConnection(ws, req);
    });
    
    this._wss.on('error', (error) => {
      this.logger.error({ error: error.message }, 'Console WebSocket server error');
    });
    
    // Start heartbeat interval
    this._startHeartbeat();
    
    // Start state broadcast interval
    this._startStateBroadcast();
  }

  /**
   * Handle new client connection
   * Requirements: 89.6 - Establish WebSocket connection for real-time updates
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} req - HTTP request
   * @private
   */
  _handleConnection(ws, req) {
    // Check max clients
    if (this._clients.size >= this.maxClients) {
      this._rejectedConnections++;
      this.logger.warn({ 
        current_clients: this._clients.size, 
        total_rejected: this._rejectedConnections 
      }, 'Max console clients reached, rejecting connection');
      ws.close(1013, 'Max clients reached');
      return;
    }
    
    const clientId = generateClientId();
    const clientIp = req.socket.remoteAddress || 'unknown';
    
    /** @type {ClientInfo} */
    const clientInfo = {
      id: clientId,
      ws,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      isAlive: true,
      ip: clientIp,
    };
    
    this._clients.set(clientId, clientInfo);
    this._totalConnections++;
    
    this.logger.info({ 
      client_id: clientId, 
      client_ip: clientIp,
      total_clients: this._clients.size,
    }, 'Console client connected');
    
    // Setup client event handlers
    ws.on('message', (data) => {
      this._handleMessage(clientId, data);
    });
    
    // Send welcome message with current state
    try {
      ws.send(JSON.stringify({
        type: 'CONNECTED',
        client_id: clientId,
        message: 'Connected to Titan Command Console',
        state: this._lastState,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      this.logger.warn({ client_id: clientId, error: error.message }, 'Failed to send welcome message');
    }
    
    ws.on('close', () => {
      this._handleDisconnect(clientId);
    });
    
    ws.on('error', (error) => {
      this.logger.warn({ client_id: clientId, error: error.message }, 'Console client WebSocket error');
    });
    
    ws.on('pong', () => {
      const client = this._clients.get(clientId);
      if (client) {
        client.isAlive = true;
        client.lastPing = Date.now();
      }
    });
    
    this.emit('client:connected', { client_id: clientId, ip: clientIp });
  }

  /**
   * Handle client message
   * @param {string} clientId - Client ID
   * @param {Buffer|string} data - Message data
   * @private
   */
  _handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      
      this.logger.info({ client_id: clientId, type: message.type }, 'Console client message received');
      
      switch (message.type) {
        case 'PING':
          this._sendToClient(clientId, { 
            type: 'PONG', 
            timestamp: new Date().toISOString() 
          });
          break;
          
        case 'REQUEST_STATE':
          // Send current state immediately
          if (this._lastState) {
            this._sendToClient(clientId, {
              type: 'STATE_UPDATE',
              ...this._lastState,
              timestamp: new Date().toISOString(),
            });
          }
          break;
          
        default:
          this.logger.warn({ client_id: clientId, type: message.type }, 'Unknown message type from console client');
      }
    } catch (error) {
      this.logger.warn({ client_id: clientId, error: error.message }, 'Failed to parse console client message');
    }
  }

  /**
   * Handle client disconnect
   * Requirements: 95.6 - Continue normal operation when Console disconnects
   * @param {string} clientId - Client ID
   * @private
   */
  _handleDisconnect(clientId) {
    const client = this._clients.get(clientId);
    if (!client) return;
    
    this._clients.delete(clientId);
    
    this.logger.info({ 
      client_id: clientId, 
      connected_duration_ms: Date.now() - client.connectedAt,
      remaining_clients: this._clients.size,
    }, 'Console client disconnected');
    
    this.emit('client:disconnected', { client_id: clientId });
  }

  //─────────────────────────────────────────────────────────────────────────────
  // HEARTBEAT
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Start heartbeat interval
   * @private
   */
  _startHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
    }
    
    this._heartbeatInterval = setInterval(() => {
      this._checkClients();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Check client health and remove dead connections
   * @private
   */
  _checkClients() {
    const now = Date.now();
    
    for (const [clientId, client] of this._clients) {
      if (!client.isAlive) {
        // Client didn't respond to last ping
        this.logger.warn({ client_id: clientId }, 'Console client unresponsive, terminating connection');
        client.ws.terminate();
        this._clients.delete(clientId);
        this.emit('client:disconnected', { client_id: clientId, reason: 'timeout' });
        continue;
      }
      
      // Check for timeout
      if (now - client.lastPing > this.clientTimeoutMs) {
        this.logger.warn({ client_id: clientId }, 'Console client timed out, terminating connection');
        client.ws.terminate();
        this._clients.delete(clientId);
        this.emit('client:disconnected', { client_id: clientId, reason: 'timeout' });
        continue;
      }
      
      // Send ping
      client.isAlive = false;
      client.ws.ping();
    }
  }

  //─────────────────────────────────────────────────────────────────────────────
  // STATE BROADCASTING
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Start state broadcast interval
   * Requirements: 95.5 - Push updates to all connected Console clients
   * @private
   */
  _startStateBroadcast() {
    if (this._stateBroadcastInterval) {
      clearInterval(this._stateBroadcastInterval);
    }
    
    this._stateBroadcastInterval = setInterval(() => {
      this._broadcastState();
    }, this.stateBroadcastIntervalMs);
  }

  /**
   * Broadcast current state to all connected clients
   * Requirements: 95.5 - Push real-time updates: equity, positions, phase, regime
   * Requirements: 3.1-3.5 - Use delta updates to minimize bandwidth
   * @private
   */
  async _broadcastState() {
    // Skip if no clients connected (Requirements: 95.6 - monitoring only)
    if (this._clients.size === 0) {
      return;
    }
    
    // Get current state from provider
    if (!this._stateProvider) {
      return;
    }
    
    try {
      const state = await this._stateProvider();
      if (!state) {
        return;
      }
      
      // Store last state
      this._lastState = state;
      
      // Generate delta update if enabled (Requirements: 3.1-3.5)
      const deltaUpdate = this._optimizer.generateDelta('state', state);
      
      // Skip if no changes
      if (!deltaUpdate) {
        return;
      }
      
      // Broadcast to all clients (delta or full update)
      this.broadcast({
        type: 'STATE_UPDATE',
        ...deltaUpdate,
      });
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to get state for broadcast');
    }
  }

  /**
   * Set the state provider function
   * Requirements: 95.5 - Push updates: equity, positions, phase, regime
   * 
   * @param {Function} provider - Async function that returns current state
   * @example
   * consoleWs.setStateProvider(async () => ({
   *   equity: 1234.56,
   *   daily_pnl: 45.67,
   *   daily_pnl_pct: 3.84,
   *   active_positions: 2,
   *   phase: 1,
   *   phase_label: 'PHASE 1: KICKSTARTER',
   *   regime: { state: 1, label: 'Risk-On' },
   *   master_arm: true,
   *   positions: [...]
   * }));
   */
  setStateProvider(provider) {
    if (typeof provider !== 'function') {
      throw new TypeError('State provider must be a function');
    }
    this._stateProvider = provider;
    this.logger.info({}, 'State provider configured');
  }

  //─────────────────────────────────────────────────────────────────────────────
  // MESSAGE SENDING
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Send message to a specific client
   * @param {string} clientId - Client ID
   * @param {Object} message - Message to send
   * @private
   */
  _sendToClient(clientId, message) {
    const client = this._clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;
    
    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      this.logger.warn({ client_id: clientId, error: error.message }, 'Failed to send message to console client');
    }
  }

  /**
   * Broadcast update to all connected console clients
   * Requirements: 95.5 - Push updates to all connected Console clients via WebSocket
   * Requirements: 3.1-3.5 - Batch updates when possible, compress large payloads
   * 
   * @param {StateUpdate} update - State update to broadcast
   * @param {Object} [options] - Broadcast options
   * @param {boolean} [options.immediate=false] - Skip batching, send immediately
   * @param {boolean} [options.compress=true] - Enable compression for large payloads
   * @param {boolean} [options.delta=true] - Enable delta updates
   */
  broadcast(update, options = {}) {
    if (!update || typeof update !== 'object') {
      this.logger.warn({ update }, 'Invalid state update');
      return;
    }
    
    // Validate update type
    if (update.type && !isValidStateType(update.type)) {
      this.logger.warn({ type: update.type }, 'Invalid state update type');
      return;
    }
    
    // Skip if no clients (Requirements: 95.6 - monitoring only, not required)
    if (this._clients.size === 0) {
      return;
    }
    
    // Ensure timestamp
    const message = {
      ...update,
      channel: this.path,
      timestamp: update.timestamp || new Date().toISOString(),
    };
    
    const { immediate = false, compress = true, delta = true } = options;
    
    // Use batching for non-immediate updates (Requirements: 3.1-3.5)
    if (!immediate && update.type === 'STATE_UPDATE') {
      this._optimizer.queueMessage(this.path, message, (batchedMessage) => {
        this._sendToAllClients(batchedMessage, compress);
      });
      return;
    }
    
    // Send immediately for critical updates
    this._sendToAllClients(message, compress);
  }

  /**
   * Send message to all connected clients with optional compression
   * Requirements: 3.1-3.5 - Compress large payloads
   * @param {Object} message - Message to send
   * @param {boolean} compress - Whether to compress large payloads
   * @private
   */
  async _sendToAllClients(message, compress = true) {
    let payload = message;
    
    // Compress if enabled and payload is large (Requirements: 3.1-3.5)
    if (compress) {
      payload = await this._optimizer.compressIfNeeded(message);
    }
    
    const messageStr = JSON.stringify(payload);
    let sentCount = 0;
    
    for (const [clientId, client] of this._clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      
      try {
        client.ws.send(messageStr);
        sentCount++;
      } catch (error) {
        this.logger.warn({ client_id: clientId, error: error.message }, 'Failed to broadcast to console client');
      }
    }
    
    this._messageCount++;
    
    this.emit('state:broadcast', { update: message, clients_sent: sentCount });
  }

  /**
   * Push equity update
   * Requirements: 95.5 - Push real-time updates: equity
   * 
   * @param {Object} params - Equity parameters
   * @param {number} params.equity - Current equity
   * @param {number} [params.daily_pnl] - Daily PnL
   * @param {number} [params.daily_pnl_pct] - Daily PnL percentage
   */
  pushEquityUpdate(params) {
    const { equity, daily_pnl, daily_pnl_pct } = params;
    
    this.broadcast({
      type: 'EQUITY_UPDATE',
      equity,
      daily_pnl,
      daily_pnl_pct,
    });
  }

  /**
   * Push position update
   * Requirements: 95.5 - Push real-time updates: positions
   * 
   * @param {Object} params - Position parameters
   * @param {number} params.active_positions - Number of active positions
   * @param {Object[]} [params.positions] - Array of position details
   */
  pushPositionUpdate(params) {
    const { active_positions, positions } = params;
    
    this.broadcast({
      type: 'POSITION_UPDATE',
      active_positions,
      positions,
    });
  }

  /**
   * Push phase change notification
   * Requirements: 95.5 - Push real-time updates: phase
   * 
   * @param {Object} params - Phase parameters
   * @param {number} params.phase - New phase (1 or 2)
   * @param {string} params.phase_label - Phase label
   * @param {number} params.equity - Equity at transition
   */
  pushPhaseChange(params) {
    const { phase, phase_label, equity } = params;
    
    this.broadcast({
      type: 'PHASE_CHANGE',
      phase,
      phase_label,
      equity,
    });
  }

  /**
   * Push regime change notification
   * Requirements: 95.5 - Push real-time updates: regime
   * 
   * @param {Object} params - Regime parameters
   * @param {Object} params.regime - Regime state object
   */
  pushRegimeChange(params) {
    const { regime } = params;
    
    this.broadcast({
      type: 'REGIME_CHANGE',
      regime,
    });
  }

  /**
   * Push master arm state change
   * Requirements: 89.4-89.5 - Master Arm control
   * 
   * @param {Object} params - Master arm parameters
   * @param {boolean} params.master_arm - Master arm state
   * @param {string} [params.changed_by] - Who changed it
   */
  pushMasterArmChange(params) {
    const { master_arm, changed_by } = params;
    
    this.broadcast({
      type: 'MASTER_ARM_CHANGE',
      master_arm,
      changed_by,
    });
  }

  /**
   * Push emergency flatten notification
   * Requirements: 91.1-91.6 - Panic Controls
   * 
   * @param {Object} params - Flatten parameters
   * @param {number} params.closed_count - Number of positions closed
   * @param {string} params.reason - Reason for flatten
   */
  pushEmergencyFlatten(params) {
    const { closed_count, reason } = params;
    
    this.broadcast({
      type: 'EMERGENCY_FLATTEN',
      closed_count,
      reason,
    });
  }

  /**
   * Push configuration change notification
   * Requirements: 90.4 - Broadcast config changes to all Console clients
   * 
   * @param {Object} params - Config change parameters
   * @param {Object[]} params.updates - Array of config updates
   * @param {string} [params.operator_id] - Who made the change
   */
  pushConfigChange(params) {
    const { updates, operator_id } = params;
    
    this.broadcast({
      type: 'CONFIG_CHANGE',
      updates,
      operator_id,
    });
  }

  //─────────────────────────────────────────────────────────────────────────────
  // STATUS AND CLEANUP
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get console WebSocket statistics
   * @returns {Object} Status statistics
   */
  getStatus() {
    return {
      path: this.path,
      connected_clients: this._clients.size,
      total_connections: this._totalConnections,
      rejected_connections: this._rejectedConnections,
      messages_broadcast: this._messageCount,
      max_clients: this.maxClients,
      heartbeat_interval_ms: this.heartbeatIntervalMs,
      state_broadcast_interval_ms: this.stateBroadcastIntervalMs,
      has_state_provider: !!this._stateProvider,
      // Optimizer stats (Requirements: 3.1-3.5)
      optimizer: this._optimizer.getStats(),
    };
  }

  /**
   * Get connected clients info
   * @returns {Object[]} Array of client info
   */
  getConnectedClients() {
    return Array.from(this._clients.values()).map(client => ({
      id: client.id,
      connected_at: new Date(client.connectedAt).toISOString(),
      last_ping: new Date(client.lastPing).toISOString(),
      ip: client.ip,
    }));
  }

  /**
   * Disconnect a specific client
   * @param {string} clientId - Client ID to disconnect
   * @returns {boolean} True if client was disconnected
   */
  disconnectClient(clientId) {
    const client = this._clients.get(clientId);
    if (!client) return false;
    
    client.ws.close(1000, 'Disconnected by server');
    this._clients.delete(clientId);
    
    this.logger.info({ client_id: clientId }, 'Console client forcefully disconnected');
    this.emit('client:disconnected', { client_id: clientId, reason: 'forced' });
    
    return true;
  }

  /**
   * Close the WebSocket server and clean up resources
   */
  close() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    
    if (this._stateBroadcastInterval) {
      clearInterval(this._stateBroadcastInterval);
      this._stateBroadcastInterval = null;
    }
    
    // Flush any pending batches before closing (Requirements: 3.1-3.5)
    if (this._optimizer) {
      this._optimizer.flushAll((message) => {
        this._sendToAllClients(message, false);
      });
      this._optimizer.close();
    }
    
    // Close all client connections
    for (const [clientId, client] of this._clients) {
      client.ws.close(1001, 'Server shutting down');
    }
    this._clients.clear();
    
    // Close WebSocket server
    if (this._wss) {
      this._wss.close();
      this._wss = null;
    }
    
    this.removeAllListeners();
    this.logger.info({}, 'Console WebSocket handler closed');
  }
}

// Export helper functions for testing
export { generateClientId, isValidStateType };

export default ConsoleWebSocket;
