/**
 * Production Server
 * 
 * Fastify server with:
 * - Real Multi-Exchange Support (Bybit, Binance)
 * - Feedback Loop: Broadcasts fills to Titan Brain
 * - Webhook receiver for Phases (Scavenger/Hunter)
 * - WebSocket for real-time updates
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { fetch } from 'undici';

// External Adapters
import { BybitAdapter } from './adapters/BybitAdapter.js';
import { BinanceAdapter } from './adapters/BinanceAdapter.js';
import { MockAdapter } from './adapters/MockAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

//─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION MANAGER
//─────────────────────────────────────────────────────────────────────────────

const CONFIG_FILE = join(__dirname, '../.config.json');

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
}

//─────────────────────────────────────────────────────────────────────────────
// PRODUCTION SERVER
//─────────────────────────────────────────────────────────────────────────────

export class ProductionServer {
  constructor(options = {}) {
    this.port = process.env.PORT || options.port || 3000;
    this.logger = options.logger || console;
    this.configManager = new ConfigManager();
    this.adapter = null; // Current active adapter
    this.exchangeName = null;
    this.autoExecutionEnabled = false;
    this.wsClients = new Set();
    
    // Brain URL for feedback loop
    this.brainUrl = process.env.TITAN_BRAIN_URL || 'http://localhost:3100'; // Default internal URL: 3100
    
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
    this.fastify.register(fastifyCors, { origin: true });
    
    // Enable WebSocket
    this.fastify.register(fastifyWebsocket);
    
    // Serve static files
    this.fastify.register(fastifyStatic, {
      root: join(__dirname, '../public'),
      prefix: '/',
    });
    
    // WebSocket endpoint
    this.fastify.get('/ws', { websocket: true }, (connection, req) => {
      this.wsClients.add(connection);
      connection.socket.on('close', () => this.wsClients.delete(connection));
    });
    
    // API: Get configuration
    this.fastify.get('/api/config', async (request, reply) => {
      const config = this.configManager.get();
      if (!config) return { configured: false };
      return {
        configured: true,
        exchange: config.exchange || 'bybit',
        api_key_suffix: config.api_key ? config.api_key.slice(-4) : '****',
        network: config.network,
      };
    });
    
    // API: Save configuration
    this.fastify.post('/api/config', async (request, reply) => {
      const { exchange = 'bybit', api_key, api_secret, network } = request.body;
      
      if (!api_key || !api_secret) {
        return reply.code(400).send({ success: false, error: 'API key and secret required' });
      }



// ... (in _setupRoutes or similar where constructor is used)

      // Initialize appropriate adapter
      let adapter;
      try {
        if (exchange === 'binance') {
          adapter = new BinanceAdapter(api_key, api_secret, network === 'testnet');
        } else if (exchange === 'mock') {
            adapter = new MockAdapter();
        } else {
          adapter = new BybitAdapter({ apiKey: api_key, apiSecret: api_secret, testnet: network === 'testnet' });
        }

        // Test Connection
        let testResult;
        if (adapter.testConnection) {
            testResult = await adapter.testConnection();
        } else {
             // Fallback
             try {
                 await adapter.getAccount();
                 testResult = { success: true };
             } catch (e) {
                 testResult = { success: false, error: e.message };
             }
        }

        if (!testResult.success) {
           return reply.code(400).send({ success: false, error: testResult.error });
        }

      } catch (err) {
        return reply.code(400).send({ success: false, error: err.message });
      }
      
      // Save configuration
      await this.configManager.save({ exchange, api_key, api_secret, network });
      
      // Update active adapter
      this.adapter = adapter;
      this.exchangeName = exchange;
      
      this.logger.info(`${exchange} API configured and connected`);
      this._broadcast({ type: 'config_updated', connected: true, exchange });
      
      return { success: true, message: 'Configuration saved and connected' };
    });

    // API: Get Status
    this.fastify.get('/api/status', async (request, reply) => {
      const status = {
        broker_connected: this.adapter !== null,
        exchange: this.exchangeName,
        auto_execution_enabled: this.autoExecutionEnabled,
        stats: this.stats,
        positions: [],
        account: null,
      };

      if (this.adapter) {
        try {
          const acc = await this.adapter.getAccount();
          status.account = acc.success !== false ? acc : null; // Handle adapter wrapper

          const pos = await this.adapter.getPositions();
          status.positions = Array.isArray(pos) ? pos : (pos.positions || []); 
        } catch (err) {
          this.logger.error('Failed to fetch status:', err.message);
        }
      }
      return status;
    });

    // API: Auto-Exec Controls
    this.fastify.post('/api/auto-exec/enable', async (request, reply) => {
      if (!this.adapter) return reply.code(400).send({ success: false, error: 'Exchange not configured' });
      this.autoExecutionEnabled = true;
      this.logger.info('Auto-execution enabled');
      this._broadcast({ type: 'auto_exec_enabled' });
      return { success: true };
    });

    this.fastify.post('/api/auto-exec/disable', async (request, reply) => {
      this.autoExecutionEnabled = false;
      this.logger.warn('Auto-execution disabled');
      this._broadcast({ type: 'auto_exec_disabled' });
      return { success: true };
    });

    // API: Emergency Flatten
    this.fastify.post('/api/emergency-flatten', async (request, reply) => {
      if (!this.adapter) return reply.code(400).send({ success: false, error: 'Exchange not configured' });
      try {
        const result = this.adapter.closeAllPositions ? await this.adapter.closeAllPositions() : { success: false, error: 'Not supported' };
        this.logger.warn('Emergency flatten executed');
        this._broadcast({ type: 'emergency_flatten', ...result });
        return { success: true, ...result };
      } catch (err) {
        return reply.code(500).send({ success: false, error: err.message });
      }
    });

    // WEBHOOK: Trade Signals
    this.fastify.post('/webhook', async (request, reply) => {
      const payload = request.body;
      const { phaseId } = payload; // CRITICAL: Extract PhaseId

      this.logger.info('Webhook received:', payload);
      this._broadcast({ type: 'webhook', ...payload });

      if (!this.autoExecutionEnabled) {
          return { success: false, reason: 'auto_execution_disabled' };
      }
      if (!this.adapter) {
          return { success: false, reason: 'broker_not_configured' };
      }

      try {
          return await this._processWebhook(payload);
      } catch (err) {
          this.logger.error('Webhook processing failed:', err.message);
          return reply.code(500).send({ success: false, error: err.message });
      }
    });
  }

  /**
   * Process webhook and Execute Order
   */
  async _processWebhook(payload) {
    const { type, symbol, side, size, limit_price, stop_loss, take_profits, phaseId } = payload;
    let orderResult;

    if (type === 'BUY_SETUP' || type === 'SELL_SETUP') {
      const order = {
        symbol,
        side: type === 'BUY_SETUP' ? 'BUY' : 'SELL',
        size,
        limit_price,
        stop_loss,
        take_profits,
        order_type: 'LIMIT',
        post_only: true, // Safety
        phaseId // Pass context if needed by adapter (rarely)
      };

      // Execute on Adapter
      orderResult = await this.adapter.sendOrder(order);
      
      // Update local stats
      if (orderResult && (orderResult.success !== false)) { 
          this.stats.trade_count++;
          this.logger.info('Order Sent:', orderResult);
          
          this._broadcast({ 
              type: 'position_opened', 
              symbol, 
              side: order.side, 
              order_id: orderResult.broker_order_id || orderResult.orderId 
          });

          // BROADCAST TO BRAIN (Feedback Loop)
          await this._broadcastFillToBrain({
              type: 'EXECUTION_REPORT',
              phaseId,
              symbol,
              side: order.side,
              price: orderResult.fill_price || limit_price, // Estimate if fill not immediate
              qty: size,
              timestamp: Date.now()
          });
      }

    } else if (type === 'CLOSE') {
       // Close logic
       if (this.adapter.closePosition) {
           orderResult = await this.adapter.closePosition(symbol);
           if (orderResult && orderResult.success) {
               this._broadcast({ type: 'position_closed', symbol });
           }
       }
    }
    
    return { success: true, result: orderResult };
  }

  /**
   * FEEDBACK LOOP: Report execution back to Titan Brain
   */
  async _broadcastFillToBrain(fillData) {
      if (!fillData.phaseId) {
          this.logger.warn('Skipping Brain report: No phaseId');
          return; 
      }

      try {
          // Use service discovery or env var
          // Ideally Brain exposes a service discovery endpoint, but hardcode/env is fine for now
          // We default to 'http://localhost:3100' based on typical Titan Brain port (Brain package.json usually says PORT=3100 or 3000, let's verify if requested)
          // Wait, earlier the file had 'http://localhost:3000'. Brain package.json said "start":"node dist/index.js".
          // Titan Brain typically runs on 3100 to avoid conflict with Execution on 3000?
          // Let's stick to process.env.TITAN_BRAIN_URL and default to http://localhost:3100 if standard.
          // Viewing Brain package.json (Step 172) showed scripts but not port.
          // viewing deploy-to-railway.sh might hint ports. 
          // Titan Console is 3001, Execution 3000. Brain often 3100.
          
          const url = `${this.brainUrl}/webhook/execution-report`;
          this.logger.info(`Broadcasting fill to Brain: ${url}`, fillData);
          
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const signature = crypto
              .createHmac('sha256', process.env.HMAC_SECRET || 'mysecret')
              .update(JSON.stringify(fillData))
              .digest('hex');

          await fetch(url, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'x-signature': signature,
                  'x-timestamp': timestamp,
                  'x-source': 'titan-execution' 
              },
              body: JSON.stringify(fillData)
          });
      } catch (err) {
          this.logger.error('Failed to broadcast fill to Brain:', err.message);
      }
  }

  _broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of this.wsClients) {
      if (client.readyState === 1) client.send(data);
    }
  }
  
  async start() {
    console.log('[DEBUG] PRODUCTION_SERVER_STARTING - VERSION: 2026-DEBUG-V1');
    console.log('[DEBUG] TRADING_MODE:', process.env.TRADING_MODE);
    console.log('[DEBUG] EXCHANGE_ID:', process.env.EXCHANGE_ID);
    
    await this.configManager.load();
    let config = this.configManager.get() || {};
    
    // ENV VAR OVERRIDES (Priority 1)
    // Checks standard Railway/Titan env vars to force correct configuration
    if (process.env.TRADING_MODE === 'LIVE' || process.env.EXCHANGE_ID) {
        this.logger.info('Apply Environment Variable Overrides for Production');
        config = {
            ...config,
            exchange: (process.env.EXCHANGE_ID || config.exchange || 'bybit').toLowerCase(),
            network: process.env.EXCHANGE_ENV || config.network || 'mainnet',
            api_key: process.env.BYBIT_API_KEY || config.api_key,
            api_secret: process.env.BYBIT_API_SECRET || config.api_secret
        };
    }

    if (config && (config.api_key || process.env.TRADING_MODE === 'LIVE')) {
        const { exchange = 'bybit', api_key, api_secret, network } = config;
        this.exchangeName = exchange;
        
        try {
            if (exchange === 'binance') {
                this.adapter = new BinanceAdapter(api_key, api_secret, network === 'testnet');
            } else if (exchange === 'mock' && process.env.TRADING_MODE !== 'LIVE') {
                this.adapter = new MockAdapter();
            } else {
                // Default to Bybit
                this.adapter = new BybitAdapter({ apiKey: api_key, apiSecret: api_secret, testnet: network === 'testnet' });
            }
            this.logger.info(`${exchange} adapter initialized from config (Network: ${network})`);
        } catch (e) {
            this.logger.error('Failed to init adapter from config:', e.message);
        }
    }
    
    await this.fastify.listen({ port: this.port, host: '0.0.0.0' });
    this.logger.info(`Production server running on port ${this.port}`);
  }
  
  async stop() {
    await this.fastify.close();
  }
}

export default ProductionServer;
