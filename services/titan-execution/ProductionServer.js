/**
 * Production Server
 * 
 * Fastify server with:
 * - Web UI for API configuration
 * - Real Bybit API integration
 * - Webhook receiver for TradingView
 * - WebSocket for real-time updates
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

//─────────────────────────────────────────────────────────────────────────────
// BYBIT ADAPTER (Real Implementation)
//─────────────────────────────────────────────────────────────────────────────

class BybitAdapter {
  constructor(apiKey, apiSecret, network = 'testnet') {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = network === 'mainnet' 
      ? 'https://api.bybit.com'
      : 'https://api-testnet.bybit.com';
    this.recvWindow = 5000;
  }
  
  /**
   * Generate signature for Bybit API
   */
  _generateSignature(timestamp, params) {
    const paramStr = timestamp + this.apiKey + this.recvWindow + params;
    return crypto.createHmac('sha256', this.apiSecret).update(paramStr).digest('hex');
  }
  
  /**
   * Make authenticated request to Bybit
   */
  async _request(method, endpoint, params = {}) {
    const timestamp = Date.now().toString();
    const queryString = new URLSearchParams(params).toString();
    const signature = this._generateSignature(timestamp, queryString);
    
    const url = `${this.baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;
    
    const headers = {
      'X-BAPI-API-KEY': this.apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': this.recvWindow.toString(),
      'Content-Type': 'application/json',
    };
    
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(params) : undefined,
    });
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(data.retMsg || 'Bybit API error');
    }
    
    return data.result;
  }
  
  /**
   * Test connection
   */
  async testConnection() {
    try {
      const result = await this._request('GET', '/v5/user/query-api');
      return {
        success: true,
        message: 'Connected to Bybit',
        user_id: result.uid,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  /**
   * Get account balance
   */
  async getAccount() {
    const result = await this._request('GET', '/v5/account/wallet-balance', {
      accountType: 'UNIFIED',
    });
    
    const account = result.list[0];
    const equity = parseFloat(account.totalEquity);
    const availableBalance = parseFloat(account.totalAvailableBalance);
    
    return {
      equity,
      available_balance: availableBalance,
      unrealized_pnl: parseFloat(account.totalPerpUPL || 0),
    };
  }
  
  /**
   * Get open positions
   */
  async getPositions() {
    const result = await this._request('GET', '/v5/position/list', {
      category: 'linear',
      settleCoin: 'USDT',
    });
    
    return result.list
      .filter(pos => parseFloat(pos.size) > 0)
      .map(pos => ({
        symbol: pos.symbol,
        side: pos.side === 'Buy' ? 'LONG' : 'SHORT',
        size: parseFloat(pos.size),
        entry_price: parseFloat(pos.avgPrice),
        unrealized_pnl: parseFloat(pos.unrealisedPnl),
        leverage: parseFloat(pos.leverage),
      }));
  }
  
  /**
   * Send order
   */
  async sendOrder(order) {
    const params = {
      category: 'linear',
      symbol: order.symbol,
      side: order.side === 'BUY' ? 'Buy' : 'Sell',
      orderType: order.order_type === 'MARKET' ? 'Market' : 'Limit',
      qty: order.size.toString(),
      timeInForce: order.post_only ? 'PostOnly' : 'GTC',
    };
    
    if (order.limit_price) {
      params.price = order.limit_price.toString();
    }
    
    if (order.stop_loss) {
      params.stopLoss = order.stop_loss.toString();
    }
    
    if (order.take_profits && order.take_profits.length > 0) {
      params.takeProfit = order.take_profits[0].toString();
    }
    
    const result = await this._request('POST', '/v5/order/create', params);
    
    return {
      broker_order_id: result.orderId,
      status: 'NEW',
    };
  }
  
  /**
   * Close all positions
   */
  async closeAllPositions() {
    const positions = await this.getPositions();
    
    for (const pos of positions) {
      await this.sendOrder({
        symbol: pos.symbol,
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
        size: pos.size,
        order_type: 'MARKET',
        reduce_only: true,
      });
    }
    
    return {
      success: true,
      closed_count: positions.length,
    };
  }
}

//─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION MANAGER
//─────────────────────────────────────────────────────────────────────────────

const CONFIG_FILE = join(__dirname, '.config.json');

class ConfigManager {
  constructor() {
    this.config = null;
  }
  
  async load() {
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      this.config = JSON.parse(data);
      return this.config;
    } catch (err) {
      return null;
    }
  }
  
  async save(config) {
    this.config = config;
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
  
  get() {
    return this.config;
  }
  
  isConfigured() {
    return this.config && this.config.api_key && this.config.api_secret;
  }
}

//─────────────────────────────────────────────────────────────────────────────
// PRODUCTION SERVER
//─────────────────────────────────────────────────────────────────────────────

export class ProductionServer {
  constructor(options = {}) {
    this.port = process.env.PORT || options.port || 3000;
    this.logger = options.logger || console;
    this.configManager = new ConfigManager();
    this.bybitAdapter = null;
    this.autoExecutionEnabled = false;
    this.wsClients = new Set();
    
    // Stats
    this.stats = {
      trade_count: 0,
      win_count: 0,
      total_pnl: 0,
    };
    
    // Create Fastify instance
    this.fastify = Fastify({
      logger: false,
    });
    
    this._setupRoutes();
  }
  
  /**
   * Setup routes
   */
  _setupRoutes() {
    // Enable CORS
    this.fastify.register(fastifyCors, {
      origin: true,
    });
    
    // Enable WebSocket
    this.fastify.register(fastifyWebsocket);
    
    // Serve static files
    this.fastify.register(fastifyStatic, {
      root: join(__dirname, 'public'),
      prefix: '/',
    });
    
    // WebSocket endpoint
    this.fastify.get('/ws', { websocket: true }, (connection, req) => {
      this.wsClients.add(connection);
      
      connection.socket.on('close', () => {
        this.wsClients.delete(connection);
      });
    });
    
    // API: Get configuration status
    this.fastify.get('/api/config', async (request, reply) => {
      const config = this.configManager.get();
      
      if (!config) {
        return { configured: false };
      }
      
      return {
        configured: true,
        api_key_suffix: config.api_key.slice(-4),
        network: config.network,
      };
    });
    
    // API: Save configuration
    this.fastify.post('/api/config', async (request, reply) => {
      const { api_key, api_secret, network } = request.body;
      
      if (!api_key || !api_secret) {
        return reply.code(400).send({ success: false, error: 'API key and secret required' });
      }
      
      // Test connection first
      const adapter = new BybitAdapter(api_key, api_secret, network);
      const testResult = await adapter.testConnection();
      
      if (!testResult.success) {
        return reply.code(400).send({ success: false, error: testResult.error });
      }
      
      // Save configuration
      await this.configManager.save({ api_key, api_secret, network });
      
      // Initialize adapter
      this.bybitAdapter = adapter;
      
      this.logger.info('Bybit API configured and connected');
      this._broadcast({ type: 'config_updated', connected: true });
      
      return { success: true, message: 'Configuration saved and connected' };
    });
    
    // API: Test connection
    this.fastify.post('/api/test-connection', async (request, reply) => {
      const { api_key, api_secret, network } = request.body;
      
      if (!api_key || !api_secret) {
        return reply.code(400).send({ success: false, error: 'API key and secret required' });
      }
      
      const adapter = new BybitAdapter(api_key, api_secret, network);
      const result = await adapter.testConnection();
      
      return result;
    });
    
    // API: Get status
    this.fastify.get('/api/status', async (request, reply) => {
      const status = {
        broker_connected: this.bybitAdapter !== null,
        auto_execution_enabled: this.autoExecutionEnabled,
        stats: {
          trade_count: this.stats.trade_count,
          win_rate: this.stats.trade_count > 0 ? this.stats.win_count / this.stats.trade_count : 0,
          total_pnl: this.stats.total_pnl,
        },
        positions: [],
        account: null,
      };
      
      if (this.bybitAdapter) {
        try {
          status.account = await this.bybitAdapter.getAccount();
          status.positions = await this.bybitAdapter.getPositions();
        } catch (err) {
          this.logger.error('Failed to fetch status from Bybit:', err.message);
        }
      }
      
      return status;
    });
    
    // API: Enable auto-execution
    this.fastify.post('/api/auto-exec/enable', async (request, reply) => {
      if (!this.bybitAdapter) {
        return reply.code(400).send({ success: false, error: 'Bybit not configured' });
      }
      
      this.autoExecutionEnabled = true;
      this.logger.info('Auto-execution enabled');
      this._broadcast({ type: 'auto_exec_enabled' });
      
      return { success: true };
    });
    
    // API: Disable auto-execution
    this.fastify.post('/api/auto-exec/disable', async (request, reply) => {
      this.autoExecutionEnabled = false;
      this.logger.warn('Auto-execution disabled');
      this._broadcast({ type: 'auto_exec_disabled' });
      
      return { success: true };
    });
    
    // API: Emergency flatten
    this.fastify.post('/api/emergency-flatten', async (request, reply) => {
      if (!this.bybitAdapter) {
        return reply.code(400).send({ success: false, error: 'Bybit not configured' });
      }
      
      try {
        const result = await this.bybitAdapter.closeAllPositions();
        this.logger.warn('Emergency flatten executed');
        this._broadcast({ type: 'emergency_flatten', ...result });
        
        return { success: true, ...result };
      } catch (err) {
        this.logger.error('Emergency flatten failed:', err.message);
        return reply.code(500).send({ success: false, error: err.message });
      }
    });
    
    // Webhook endpoint for TradingView
    this.fastify.post('/webhook', async (request, reply) => {
      const payload = request.body;
      
      this.logger.info('Webhook received:', payload);
      this._broadcast({ type: 'webhook', ...payload });
      
      if (!this.autoExecutionEnabled) {
        this.logger.warn('Auto-execution disabled, ignoring webhook');
        return { success: false, reason: 'auto_execution_disabled' };
      }
      
      if (!this.bybitAdapter) {
        this.logger.error('Bybit not configured, cannot execute');
        return { success: false, reason: 'broker_not_configured' };
      }
      
      // Process webhook
      try {
        await this._processWebhook(payload);
        return { success: true };
      } catch (err) {
        this.logger.error('Webhook processing failed:', err.message);
        return reply.code(500).send({ success: false, error: err.message });
      }
    });
  }
  
  /**
   * Process webhook from TradingView
   */
  async _processWebhook(payload) {
    const { type, symbol, side, size, limit_price, stop_loss, take_profits } = payload;
    
    if (type === 'BUY_SETUP' || type === 'SELL_SETUP') {
      // Send order to Bybit
      const order = {
        symbol,
        side: type === 'BUY_SETUP' ? 'BUY' : 'SELL',
        size,
        limit_price,
        stop_loss,
        take_profits,
        order_type: 'LIMIT',
        post_only: true,
      };
      
      const result = await this.bybitAdapter.sendOrder(order);
      
      this.logger.info('Order sent to Bybit:', result);
      this._broadcast({ 
        type: 'position_opened', 
        symbol, 
        side: order.side,
        order_id: result.broker_order_id,
      });
      
      this.stats.trade_count++;
      
    } else if (type === 'CLOSE') {
      // Close position
      const positions = await this.bybitAdapter.getPositions();
      const position = positions.find(p => p.symbol === symbol);
      
      if (position) {
        await this.bybitAdapter.sendOrder({
          symbol,
          side: position.side === 'LONG' ? 'SELL' : 'BUY',
          size: position.size,
          order_type: 'MARKET',
          reduce_only: true,
        });
        
        const pnl = position.unrealized_pnl;
        if (pnl > 0) this.stats.win_count++;
        this.stats.total_pnl += pnl;
        
        this.logger.info('Position closed:', { symbol, pnl });
        this._broadcast({ type: 'position_closed', symbol, pnl });
      }
    }
  }
  
  /**
   * Broadcast message to all WebSocket clients
   */
  _broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of this.wsClients) {
      try {
        client.socket.send(data);
      } catch (err) {
        this.logger.error('Failed to send WebSocket message:', err.message);
      }
    }
  }
  
  /**
   * Start server
   */
  async start() {
    // Load configuration
    await this.configManager.load();
    
    // Initialize Bybit adapter if configured
    const config = this.configManager.get();
    if (config && config.api_key && config.api_secret) {
      this.bybitAdapter = new BybitAdapter(config.api_key, config.api_secret, config.network);
      this.logger.info('Bybit adapter initialized from saved config');
    }
    
    // Start server
    await this.fastify.listen({ port: this.port, host: '0.0.0.0' });
    
    this.logger.info(`Production server running on http://localhost:${this.port}`);
    this.logger.info(`Open http://localhost:${this.port} in your browser to configure`);
  }
  
  /**
   * Stop server
   */
  async stop() {
    await this.fastify.close();
    this.logger.info('Production server stopped');
  }
}

export default ProductionServer;
