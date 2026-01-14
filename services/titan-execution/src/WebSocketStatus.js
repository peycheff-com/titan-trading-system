/**
 * WebSocket Status Channel
 * 
 * Provides real-time order status updates via WebSocket /ws/status endpoint.
 * Pushes fill_percent, fill_price, slippage_pct and other order status updates.
 * 
 * Requirements: 23.4 - Push status update via WebSocket /ws/status channel
 * 
 * @module WebSocketStatus
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  HEARTBEAT_INTERVAL_MS: 30000,
  CLIENT_TIMEOUT_MS: 60000,
  MAX_CLIENTS: 100,
  PATH: '/ws/status',
};

/** @constant {Set<string>} Valid status update types */
const STATUS_TYPES = new Set([
  'ORDER_SUBMITTED',
  'ORDER_PENDING',
  'ORDER_FILLED',
  'ORDER_PARTIALLY_FILLED',
  'ORDER_CANCELED',
  'ORDER_REJECTED',
  'ORDER_EXPIRED',
  'POSITION_OPENED',
  'POSITION_CLOSED',
  'POSITION_UPDATED',
  'EMERGENCY_FLATTEN',
  'HEARTBEAT',
]);

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} StatusUpdate
 * @property {string} type - Status update type
 * @property {string} signal_id - Signal ID
 * @property {string} [broker_order_id] - Broker order ID
 * @property {string} [symbol] - Trading symbol
 * @property {'BUY'|'SELL'} [side] - Order side
 * @property {number} [fill_percent] - Fill percentage (0-100)
 * @property {number} [fill_price] - Actual fill price
 * @property {number} [fill_size] - Filled size
 * @property {number} [requested_size] - Originally requested size
 * @property {number} [slippage_pct] - Slippage percentage
 * @property {number} [expected_price] - Expected price
 * @property {string} [status] - Order status
 * @property {string} [error] - Error message if applicable
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} ClientInfo
 * @property {string} id - Client ID
 * @property {WebSocket} ws - WebSocket connection
 * @property {number} connectedAt - Connection timestamp
 * @property {number} lastPing - Last ping timestamp
 * @property {boolean} isAlive - Whether client is alive
 * @property {Set<string>} subscriptions - Subscribed symbols
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
  return `client_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Calculate slippage percentage
 * @param {number} expectedPrice - Expected price
 * @param {number} fillPrice - Actual fill price
 * @param {'BUY'|'SELL'} side - Order side
 * @returns {number} Slippage percentage (positive = unfavorable)
 */
function calculateSlippage(expectedPrice, fillPrice, side) {
  if (!expectedPrice || !fillPrice || expectedPrice === 0) {
    return 0;
  }
  
  const diff = fillPrice - expectedPrice;
  
  // Handle case where prices are equal
  if (diff === 0) {
    return 0;
  }
  
  const slippage = (diff / expectedPrice) * 100;
  
  // For BUY orders, positive slippage is unfavorable (paid more)
  // For SELL orders, negative slippage is unfavorable (received less)
  return side === 'BUY' ? slippage : -slippage;
}

/**
 * Calculate fill percentage
 * @param {number} filledSize - Filled size
 * @param {number} requestedSize - Requested size
 * @returns {number} Fill percentage (0-100)
 */
function calculateFillPercent(filledSize, requestedSize) {
  if (!requestedSize || requestedSize === 0) {
    return 0;
  }
  return Math.min(100, (filledSize / requestedSize) * 100);
}

//─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET STATUS CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * WebSocket Status Channel
 * 
 * Provides real-time order status updates via WebSocket.
 * 
 * Events emitted:
 * - 'client:connected' - When a client connects
 * - 'client:disconnected' - When a client disconnects
 * - 'client:subscribed' - When a client subscribes to a symbol
 * - 'client:unsubscribed' - When a client unsubscribes from a symbol
 * - 'status:broadcast' - When a status update is broadcast
 */
export class WebSocketStatus extends EventEmitter {
  /**
   * Create a new WebSocketStatus instance
   * @param {Object} options - Configuration options
   * @param {number} [options.port] - WebSocket server port (if standalone)
   * @param {Object} [options.server] - HTTP server to attach to
   * @param {string} [options.path='/ws/status'] - WebSocket path
   * @param {number} [options.heartbeatIntervalMs] - Heartbeat interval
   * @param {number} [options.clientTimeoutMs] - Client timeout
   * @param {number} [options.maxClients] - Maximum concurrent clients
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
    
    /** @type {Map<string, ClientInfo>} Connected clients */
    this._clients = new Map();
    
    /** @type {WebSocketServer|null} WebSocket server */
    this._wss = null;
    
    /** @type {NodeJS.Timeout|null} Heartbeat interval */
    this._heartbeatInterval = null;
    
    /** @type {number} Total messages broadcast */
    this._messageCount = 0;
    
    /** @type {number} Total clients connected (lifetime) */
    this._totalConnections = 0;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
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
    this.logger.info({ path: this.path }, 'WebSocket status channel initialized (attached to server)');
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
    this.logger.info({ port, path: this.path }, 'WebSocket status channel initialized (standalone)');
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
      this.logger.error({ error: error.message }, 'WebSocket server error');
    });
    
    // Start heartbeat interval
    this._startHeartbeat();
  }

  /**
   * Handle external WebSocket connection (e.g. from Fastify)
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} req - HTTP request
   */
  handleExternalConnection(ws, req) {
    this._handleConnection(ws, req);
  }

  /**
   * Handle new client connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} req - HTTP request
   * @private
   */
  _handleConnection(ws, req) {
    // Check max clients
    if (this._clients.size >= this.maxClients) {
      this.logger.warn({ current_clients: this._clients.size }, 'Max clients reached, rejecting connection');
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
      subscriptions: new Set(),
      ip: clientIp,
    };
    
    this._clients.set(clientId, clientInfo);
    this._totalConnections++;
    
    this.logger.info({ 
      client_id: clientId, 
      client_ip: clientIp,
      total_clients: this._clients.size,
      ws_ready_state: ws.readyState,
    }, 'Client connected to status channel');
    
    // Setup client event handlers first
    ws.on('message', (data) => {
      this._handleMessage(clientId, data);
    });
    
    // Send welcome message directly - ws should be OPEN at this point
    try {
      ws.send(JSON.stringify({
        type: 'CONNECTED',
        client_id: clientId,
        message: 'Connected to Titan status channel',
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      this.logger.warn({ client_id: clientId, error: error.message }, 'Failed to send welcome message');
    }
    
    ws.on('close', () => {
      this._handleDisconnect(clientId);
    });
    
    ws.on('error', (error) => {
      this.logger.warn({ client_id: clientId, error: error.message }, 'Client WebSocket error');
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
      
      switch (message.type) {
        case 'SUBSCRIBE':
          this._handleSubscribe(clientId, message.symbols || []);
          break;
          
        case 'UNSUBSCRIBE':
          this._handleUnsubscribe(clientId, message.symbols || []);
          break;
          
        case 'PING':
          this._sendToClient(clientId, { type: 'PONG', timestamp: new Date().toISOString() });
          break;
          
        default:
          this.logger.warn({ client_id: clientId, type: message.type }, 'Unknown message type');
      }
    } catch (error) {
      this.logger.warn({ client_id: clientId, error: error.message }, 'Failed to parse client message');
    }
  }

  /**
   * Handle client subscription
   * @param {string} clientId - Client ID
   * @param {string[]} symbols - Symbols to subscribe to
   * @private
   */
  _handleSubscribe(clientId, symbols) {
    const client = this._clients.get(clientId);
    if (!client) return;
    
    for (const symbol of symbols) {
      client.subscriptions.add(symbol.toUpperCase());
    }
    
    this.logger.info({ 
      client_id: clientId, 
      symbols, 
      total_subscriptions: client.subscriptions.size,
    }, 'Client subscribed to symbols');
    
    this._sendToClient(clientId, {
      type: 'SUBSCRIBED',
      symbols: Array.from(client.subscriptions),
      timestamp: new Date().toISOString(),
    });
    
    this.emit('client:subscribed', { client_id: clientId, symbols });
  }

  /**
   * Handle client unsubscription
   * @param {string} clientId - Client ID
   * @param {string[]} symbols - Symbols to unsubscribe from
   * @private
   */
  _handleUnsubscribe(clientId, symbols) {
    const client = this._clients.get(clientId);
    if (!client) return;
    
    for (const symbol of symbols) {
      client.subscriptions.delete(symbol.toUpperCase());
    }
    
    this.logger.info({ 
      client_id: clientId, 
      symbols, 
      remaining_subscriptions: client.subscriptions.size,
    }, 'Client unsubscribed from symbols');
    
    this._sendToClient(clientId, {
      type: 'UNSUBSCRIBED',
      symbols,
      remaining: Array.from(client.subscriptions),
      timestamp: new Date().toISOString(),
    });
    
    this.emit('client:unsubscribed', { client_id: clientId, symbols });
  }

  /**
   * Handle client disconnect
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
    }, 'Client disconnected from status channel');
    
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
        this.logger.warn({ client_id: clientId }, 'Client unresponsive, terminating connection');
        client.ws.terminate();
        this._clients.delete(clientId);
        this.emit('client:disconnected', { client_id: clientId, reason: 'timeout' });
        continue;
      }
      
      // Check for timeout
      if (now - client.lastPing > this.clientTimeoutMs) {
        this.logger.warn({ client_id: clientId }, 'Client timed out, terminating connection');
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
    // WebSocket.OPEN = 1
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;
    
    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      this.logger.warn({ client_id: clientId, error: error.message }, 'Failed to send message to client');
    }
  }

  /**
   * Broadcast status update to all connected clients
   * Requirements: 23.4 - Push status update via WebSocket /ws/status channel
   * 
   * @param {StatusUpdate} update - Status update to broadcast
   */
  broadcast(update) {
    if (!update || typeof update !== 'object') {
      this.logger.warn({ update }, 'Invalid status update');
      return;
    }
    
    // Ensure timestamp
    const message = {
      ...update,
      channel: this.path,
      timestamp: update.timestamp || new Date().toISOString(),
    };
    
    const messageStr = JSON.stringify(message);
    const symbol = update.symbol?.toUpperCase();
    let sentCount = 0;
    
    for (const [clientId, client] of this._clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      
      // Check if client is subscribed to this symbol (or has no subscriptions = all)
      if (symbol && client.subscriptions.size > 0 && !client.subscriptions.has(symbol)) {
        continue;
      }
      
      try {
        client.ws.send(messageStr);
        sentCount++;
      } catch (error) {
        this.logger.warn({ client_id: clientId, error: error.message }, 'Failed to broadcast to client');
      }
    }
    
    this._messageCount++;
    
    this.logger.info({
      type: update.type,
      signal_id: update.signal_id,
      symbol: update.symbol,
      clients_sent: sentCount,
    }, 'Status update broadcast');
    
    this.emit('status:broadcast', { update, clients_sent: sentCount });
  }

  /**
   * Push order fill status update
   * Requirements: 23.4 - Include fill_percent, fill_price, slippage_pct
   * 
   * @param {Object} params - Fill parameters
   * @param {string} params.signal_id - Signal ID
   * @param {string} params.broker_order_id - Broker order ID
   * @param {string} params.symbol - Trading symbol
   * @param {'BUY'|'SELL'} params.side - Order side
   * @param {number} params.fill_price - Actual fill price
   * @param {number} params.fill_size - Filled size
   * @param {number} params.requested_size - Originally requested size
   * @param {number} [params.expected_price] - Expected price for slippage calculation
   * @param {string} [params.status='FILLED'] - Order status
   */
  pushOrderFill(params) {
    const {
      signal_id,
      broker_order_id,
      symbol,
      side,
      fill_price,
      fill_size,
      requested_size,
      expected_price,
      status = 'FILLED',
    } = params;
    
    const fill_percent = calculateFillPercent(fill_size, requested_size);
    const slippage_pct = calculateSlippage(expected_price || fill_price, fill_price, side);
    
    const update = {
      type: fill_percent >= 100 ? 'ORDER_FILLED' : 'ORDER_PARTIALLY_FILLED',
      signal_id,
      broker_order_id,
      symbol,
      side,
      fill_percent,
      fill_price,
      fill_size,
      requested_size,
      slippage_pct,
      expected_price,
      status,
    };
    
    this.broadcast(update);
  }

  /**
   * Push order rejection status update
   * 
   * @param {Object} params - Rejection parameters
   * @param {string} params.signal_id - Signal ID
   * @param {string} params.symbol - Trading symbol
   * @param {string} params.reason - Rejection reason
   * @param {string} [params.recommendation] - Recommended action
   */
  pushOrderRejection(params) {
    const { signal_id, symbol, reason, recommendation } = params;
    
    this.broadcast({
      type: 'ORDER_REJECTED',
      signal_id,
      symbol,
      reason,
      recommendation,
      status: 'REJECTED',
    });
  }

  /**
   * Push order cancellation status update
   * 
   * @param {Object} params - Cancellation parameters
   * @param {string} params.signal_id - Signal ID
   * @param {string} params.broker_order_id - Broker order ID
   * @param {string} params.symbol - Trading symbol
   * @param {string} [params.reason] - Cancellation reason
   */
  pushOrderCancellation(params) {
    const { signal_id, broker_order_id, symbol, reason } = params;
    
    this.broadcast({
      type: 'ORDER_CANCELED',
      signal_id,
      broker_order_id,
      symbol,
      reason,
      status: 'CANCELED',
    });
  }

  /**
   * Push position update
   * 
   * @param {Object} params - Position parameters
   * @param {string} params.symbol - Trading symbol
   * @param {'LONG'|'SHORT'} params.side - Position side
   * @param {number} params.size - Position size
   * @param {number} params.entry_price - Entry price
   * @param {number} [params.unrealized_pnl] - Unrealized PnL
   * @param {'OPENED'|'CLOSED'|'UPDATED'} [params.action='UPDATED'] - Position action
   */
  pushPositionUpdate(params) {
    const { symbol, side, size, entry_price, unrealized_pnl, action = 'UPDATED' } = params;
    
    this.broadcast({
      type: `POSITION_${action}`,
      symbol,
      side,
      size,
      entry_price,
      unrealized_pnl,
    });
  }

  /**
   * Push emergency flatten notification
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
      status: 'FLATTENED',
    });
  }

  //─────────────────────────────────────────────────────────────────────────────
  // STATUS AND CLEANUP
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get status channel statistics
   * @returns {Object} Status statistics
   */
  getStatus() {
    return {
      path: this.path,
      connected_clients: this._clients.size,
      total_connections: this._totalConnections,
      messages_broadcast: this._messageCount,
      max_clients: this.maxClients,
      heartbeat_interval_ms: this.heartbeatIntervalMs,
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
      subscriptions: Array.from(client.subscriptions),
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
    
    this.logger.info({ client_id: clientId }, 'Client forcefully disconnected');
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
    this.logger.info({}, 'WebSocket status channel closed');
  }
}

// Export helper functions for testing
export { calculateSlippage, calculateFillPercent, generateClientId };

export default WebSocketStatus;
