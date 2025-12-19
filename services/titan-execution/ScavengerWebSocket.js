/**
 * Scavenger WebSocket Server
 * 
 * Real-time updates for Phase 1 (Scavenger) activity:
 * - trap_map_updated: Active tripwires with proximity
 * - sensor_status_updated: Binance/Bybit connection health
 * - trap_sprung: Trap activation events
 * 
 * Features:
 * - Message batching for high-frequency trap updates
 * - Payload compression for large trap maps
 * 
 * Requirements: 10.1-10.5, 3.1-3.5 (WebSocket optimization)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { WebSocketOptimizer } from './utils/WebSocketOptimizer.js';

// Message type constants
const MESSAGE_TYPES = {
  PING: 'ping',
  PONG: 'pong',
  REQUEST_STATE: 'request_state',
  INITIAL_STATE: 'initial_state',
  TRAP_MAP_UPDATED: 'trap_map_updated',
  SENSOR_STATUS_UPDATED: 'sensor_status_updated',
  TRAP_SPRUNG: 'trap_sprung'
};

// Default sensor status values
const DEFAULT_SENSOR_STATUS = {
  binanceHealth: 'UNKNOWN',
  binanceTickRate: 0,
  bybitStatus: 'UNKNOWN',
  bybitPing: 0,
  slippage: 0
};

// Optimization config (Requirements: 3.1-3.5)
const OPTIMIZATION_CONFIG = {
  BATCH_INTERVAL_MS: 100, // Batch trap updates every 100ms
  MAX_BATCH_SIZE: 50, // Max messages per batch
  COMPRESSION_THRESHOLD: 4096, // Compress trap maps > 4KB
};

export class ScavengerWebSocket {
  /**
   * @param {Object} options
   * @param {import('http').Server} options.server - HTTP server instance
   * @param {string} options.path - WebSocket endpoint path
   * @param {Object} options.logger - Logger instance (pino-compatible)
   * @param {Function} [options.stateProvider] - Async function returning initial state
   * @param {number} [options.maxConnections=100] - Maximum concurrent connections
   * @param {number} [options.batchIntervalMs] - Batch interval in ms
   * @param {number} [options.compressionThreshold] - Min bytes for compression
   */
  constructor({ server, path, logger, stateProvider = null, maxConnections = 100, batchIntervalMs, compressionThreshold }) {
    this.logger = logger;
    this.path = path;
    this.clients = new Set();
    this.stateProvider = stateProvider;
    this.maxConnections = maxConnections;
    
    // Initialize optimizer (Requirements: 3.1-3.5)
    this._optimizer = new WebSocketOptimizer({
      batchIntervalMs: batchIntervalMs || OPTIMIZATION_CONFIG.BATCH_INTERVAL_MS,
      maxBatchSize: OPTIMIZATION_CONFIG.MAX_BATCH_SIZE,
      compressionThreshold: compressionThreshold || OPTIMIZATION_CONFIG.COMPRESSION_THRESHOLD,
      enableDeltaUpdates: false, // Trap maps change frequently, delta not useful
      logger,
    });
    
    // Initialize WebSocket server with noServer mode to avoid Fastify intercepting
    this.wss = new WebSocketServer({
      noServer: true,
      clientTracking: true,
    });
    
    // Handle upgrade event manually for our path
    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
      
      if (pathname === this.path) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
      // Don't destroy socket for other paths - let other handlers process them
    });
    
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
    
    this.logger.info({ path }, 'Scavenger WebSocket server initialized');
  }
  
  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    // Check connection limit
    if (this.clients.size >= this.maxConnections) {
      this.logger.warn('Max connections reached, rejecting new connection');
      ws.close(1008, 'Max connections reached');
      return;
    }
    
    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    this.logger.info({ clientId }, 'Scavenger WebSocket client connected');
    
    this.clients.add(ws);
    
    // Send initial state snapshot with error handling
    this.sendInitialState(ws).catch(error => {
      this.logger.error({ error: error.message, clientId }, 'Failed to send initial state on connection');
    });
    
    // Handle client messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to parse WebSocket message');
      }
    });
    
    // Handle client disconnect
    ws.on('close', () => {
      this.clients.delete(ws);
      this.logger.info({ clientId }, 'Scavenger WebSocket client disconnected');
    });
    
    // Handle errors
    ws.on('error', (error) => {
      this.logger.error({ error: error.message, clientId }, 'Scavenger WebSocket error');
      this.clients.delete(ws);
    });
  }
  
  /**
   * Handle incoming message from client
   */
  handleMessage(ws, message) {
    const { type } = message;
    
    switch (type) {
      case MESSAGE_TYPES.PING:
        ws.send(JSON.stringify({ type: MESSAGE_TYPES.PONG, timestamp: Date.now() }));
        break;
        
      case MESSAGE_TYPES.REQUEST_STATE:
        this.sendInitialState(ws).catch(error => {
          this.logger.error({ error: error.message }, 'Failed to send state on request');
        });
        break;
        
      default:
        this.logger.warn({ type }, 'Unknown message type from Scavenger WebSocket client');
    }
  }
  
  /**
   * Send initial state snapshot to client
   * Requirements: 10.5
   */
  async sendInitialState(ws) {
    if (!this.stateProvider) {
      this.logger.warn('No state provider configured for Scavenger WebSocket');
      return;
    }
    
    try {
      const state = await this.stateProvider();
      
      ws.send(JSON.stringify({
        type: MESSAGE_TYPES.INITIAL_STATE,
        timestamp: Date.now(),
        data: state,
      }));
      
      this.logger.debug('Sent initial state to Scavenger WebSocket client');
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to send initial state');
    }
  }
  
  /**
   * Set state provider function
   * @param {Function} provider - Async function that returns current state
   */
  setStateProvider(provider) {
    this.stateProvider = provider;
  }
  
  /**
   * Broadcast trap map update
   * Requirements: 10.2
   */
  pushTrapMapUpdate(tripwires) {
    if (!Array.isArray(tripwires)) {
      this.logger.error('pushTrapMapUpdate: tripwires must be an array');
      return;
    }
    
    this.broadcast({
      type: MESSAGE_TYPES.TRAP_MAP_UPDATED,
      timestamp: Date.now(),
      data: {
        tripwires: tripwires.map(trap => ({
          symbol: trap.symbol,
          currentPrice: trap.currentPrice,
          triggerPrice: trap.triggerPrice,
          trapType: trap.trapType,
          direction: trap.direction,
          confidence: trap.confidence,
          leadTime: trap.leadTime || 0,
          proximity: Math.abs(trap.currentPrice - trap.triggerPrice) / trap.triggerPrice,
        })),
        count: tripwires.length,
      },
    });
  }
  
  /**
   * Broadcast sensor status update
   * Requirements: 10.3
   */
  pushSensorStatusUpdate(status) {
    this.broadcast({
      type: MESSAGE_TYPES.SENSOR_STATUS_UPDATED,
      timestamp: Date.now(),
      data: {
        binanceHealth: status.binanceHealth || DEFAULT_SENSOR_STATUS.binanceHealth,
        binanceTickRate: status.binanceTickRate || DEFAULT_SENSOR_STATUS.binanceTickRate,
        bybitStatus: status.bybitStatus || DEFAULT_SENSOR_STATUS.bybitStatus,
        bybitPing: status.bybitPing || DEFAULT_SENSOR_STATUS.bybitPing,
        slippage: status.slippage || DEFAULT_SENSOR_STATUS.slippage,
      },
    });
  }
  
  /**
   * Broadcast trap sprung event
   * Requirements: 10.4
   */
  pushTrapSprung(trap) {
    this.broadcast({
      type: MESSAGE_TYPES.TRAP_SPRUNG,
      timestamp: Date.now(),
      data: {
        symbol: trap.symbol,
        trapType: trap.trapType,
        triggerPrice: trap.triggerPrice,
        actualPrice: trap.actualPrice || trap.triggerPrice,
        direction: trap.direction,
        confidence: trap.confidence,
        message: `${trap.symbol} ${trap.trapType} @ ${trap.actualPrice || trap.triggerPrice}`,
      },
    });
  }
  
  /**
   * Broadcast message to all connected clients
   * Requirements: 3.1-3.5 - Batch updates when possible, compress large payloads
   * @param {Object} message - Message to broadcast
   * @param {Object} [options] - Broadcast options
   * @param {boolean} [options.immediate=false] - Skip batching
   * @param {boolean} [options.compress=true] - Enable compression
   */
  broadcast(message, options = {}) {
    if (this.clients.size === 0) {
      return; // Early return if no clients
    }
    
    const { immediate = false, compress = true } = options;
    
    // Use batching for trap map updates (Requirements: 3.1-3.5)
    if (!immediate && message.type === MESSAGE_TYPES.TRAP_MAP_UPDATED) {
      this._optimizer.queueMessage(this.path, message, (batchedMessage) => {
        this._sendToAllClients(batchedMessage, compress);
      });
      return;
    }
    
    // Send immediately for critical updates (trap_sprung, sensor_status)
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
    
    const payloadStr = JSON.stringify(payload);
    const results = { success: 0, failed: 0 };
    
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payloadStr);
          results.success++;
        } catch (error) {
          results.failed++;
          this.logger.error({ error: error.message }, 'Failed to send message to Scavenger WebSocket client');
        }
      }
    }
    
    if (results.success > 0) {
      this.logger.debug(
        { type: message.type, clients: results.success },
        'Broadcast message to Scavenger WebSocket clients'
      );
    }
    
    if (results.failed > 0) {
      this.logger.warn({ failCount: results.failed }, 'Failed to send to some Scavenger WebSocket clients');
    }
  }
  
  /**
   * Get number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }
  
  /**
   * Get optimizer statistics
   * Requirements: 3.1-3.5
   * @returns {Object} Optimizer stats
   */
  getStats() {
    return {
      clients: this.clients.size,
      maxConnections: this.maxConnections,
      optimizer: this._optimizer.getStats(),
    };
  }
  
  /**
   * Close all connections and shut down server
   */
  close() {
    // Flush any pending batches before closing (Requirements: 3.1-3.5)
    if (this._optimizer) {
      this._optimizer.flushAll((message) => {
        // Sync send for cleanup - don't use async compression
        const payloadStr = JSON.stringify(message);
        for (const client of this.clients) {
          if (client.readyState === WebSocket.OPEN) {
            try {
              client.send(payloadStr);
            } catch (error) {
              // Ignore errors during shutdown
            }
          }
        }
      });
      this._optimizer.close();
    }
    
    this.clients.forEach((client) => {
      try {
        client.close();
      } catch (error) {
        this.logger.error({ error: error.message }, 'Error closing Scavenger WebSocket client');
      }
    });
    
    this.clients.clear();
    
    if (this.wss) {
      this.wss.close();
      this.logger.info('Scavenger WebSocket server closed');
    }
  }
}
