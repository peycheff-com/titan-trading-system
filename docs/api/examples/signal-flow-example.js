#!/usr/bin/env node

/**
 * Complete Signal Flow Example
 * 
 * Demonstrates the complete signal flow through the Titan Trading System:
 * 1. Signal generation from Phase 1 (Scavenger)
 * 2. Brain approval/veto process
 * 3. Execution via Execution service
 * 4. Position tracking in Shadow State
 * 5. Real-time updates via WebSocket
 * 
 * Usage: node signal-flow-example.js
 */

const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');

// Constants
const CONSTANTS = {
  DEFAULT_LEVERAGE: 15,
  MAX_LEVERAGE: 100,
  MIN_POSITION_SIZE: 1,
  MAX_POSITION_SIZE: 100000,
  SIGNAL_CLEANUP_INTERVAL: 300000, // 5 minutes
  WEBSOCKET_RECONNECT_DELAY: 1000,
  MAX_WEBSOCKET_RECONNECT_ATTEMPTS: 5,
  REQUEST_TIMEOUT: 30000,
  DEMO_MONITORING_DURATION: 10000,
  
  SIGNAL_STATES: {
    PREPARING: 'PREPARING',
    PREPARED: 'PREPARED',
    CONFIRMED: 'CONFIRMED',
    ABORTED: 'ABORTED',
    FAILED: 'FAILED'
  },
  
  ACTION_EMOJIS: {
    PREPARE: '🚀',
    CONFIRM: '✅',
    ABORT: '🚫',
    CLOSE: '🔒'
  }
};

// Configuration with validation
class ConfigManager {
  static load() {
    const config = {
      BRAIN_URL: process.env.BRAIN_URL || 'http://localhost:3100',
      EXECUTION_URL: process.env.EXECUTION_URL || 'http://localhost:3002',
      WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
      CONSOLE_WS_URL: process.env.CONSOLE_WS_URL || 'ws://localhost:3002/ws/console',
      DEMO_MODE: process.env.DEMO_MODE === 'true',
      TIMEOUT_MS: parseInt(process.env.TIMEOUT_MS || '30000'),
    };

    // Validate required configuration
    if (!config.WEBHOOK_SECRET && !config.DEMO_MODE) {
      console.warn('⚠️  WEBHOOK_SECRET not set - signatures will be skipped');
    }

    return config;
  }
}

const CONFIG = ConfigManager.load();

/**
 * Titan Signal Flow Demonstration Class
 * 
 * Demonstrates the complete signal flow through the Titan Trading System including:
 * - Signal generation and validation
 * - Brain approval/veto process  
 * - Execution via Execution service
 * - Position tracking in Shadow State
 * - Real-time updates via WebSocket
 * 
 * @class TitanSignalFlowDemo
 * @example
 * const demo = new TitanSignalFlowDemo();
 * await demo.runDemo();
 */
class TitanSignalFlowDemo {
  constructor() {
    this.activeSignals = new Map(); // Track multiple signals
    this.ws = null;
    this.messageHandlers = new Map();
    this.wsReconnectAttempts = 0;
    this.wsMaxReconnectAttempts = CONSTANTS.MAX_WEBSOCKET_RECONNECT_ATTEMPTS;
    this.wsReconnectDelay = CONSTANTS.WEBSOCKET_RECONNECT_DELAY;
    this.cleanupInterval = null;
    this.setupMessageHandlers();
    this.startCleanupInterval();
  }

  /**
   * Start periodic cleanup of old signals
   */
  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSignals();
    }, CONSTANTS.SIGNAL_CLEANUP_INTERVAL);
  }

  /**
   * Stop cleanup interval and close connections
   */
  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    
    this.activeSignals.clear();
  }

  /**
   * Generate unique signal ID
   */
  generateSignalId(phase, symbol) {
    if (!phase || !symbol) {
      throw new Error('Phase and symbol are required for signal ID generation');
    }
    
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${phase}_${symbol}_${timestamp}_${random}`;
  }

  /**
   * Validate signal parameters
   */
  validateSignalParams(symbol, direction, size, leverage) {
    const errors = [];
    
    if (!symbol || typeof symbol !== 'string' || symbol.length === 0) {
      errors.push('Symbol must be a non-empty string');
    }
    
    if (!['LONG', 'SHORT', 'BUY', 'SELL'].includes(direction)) {
      errors.push('Direction must be LONG, SHORT, BUY, or SELL');
    }
    
    if (!size || typeof size !== 'number' || size < CONSTANTS.MIN_POSITION_SIZE || size > CONSTANTS.MAX_POSITION_SIZE) {
      errors.push(`Size must be a number between ${CONSTANTS.MIN_POSITION_SIZE} and ${CONSTANTS.MAX_POSITION_SIZE}`);
    }
    
    if (leverage && (typeof leverage !== 'number' || leverage < 1 || leverage > CONSTANTS.MAX_LEVERAGE)) {
      errors.push(`Leverage must be a number between 1 and ${CONSTANTS.MAX_LEVERAGE}`);
    }
    
    return errors;
  }

  /**
   * Validate price parameters
   */
  validatePriceParams(entryPrice, stopLoss, takeProfit) {
    const errors = [];
    
    if (!entryPrice || typeof entryPrice !== 'number' || entryPrice <= 0) {
      errors.push('Entry price must be a positive number');
    }
    
    if (stopLoss && (typeof stopLoss !== 'number' || stopLoss <= 0)) {
      errors.push('Stop loss must be a positive number');
    }
    
    if (takeProfit && (typeof takeProfit !== 'number' || takeProfit <= 0)) {
      errors.push('Take profit must be a positive number');
    }
    
    // Validate price relationships for LONG positions
    if (entryPrice && stopLoss && takeProfit) {
      if (stopLoss >= entryPrice) {
        errors.push('Stop loss should be below entry price for LONG positions');
      }
      if (takeProfit <= entryPrice) {
        errors.push('Take profit should be above entry price for LONG positions');
      }
    }
    
    return errors;
  }

  /**
   * Generate HMAC signature for webhook
   */
  generateSignature(body) {
    if (!CONFIG.WEBHOOK_SECRET) return null;
    
    return crypto
      .createHmac('sha256', CONFIG.WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');
  }

  /**
   * Setup WebSocket message handlers
   */
  setupMessageHandlers() {
    this.messageHandlers.set('EQUITY_UPDATE', (data) => {
      console.log(`💰 Equity Update: $${data.equity.toFixed(2)} (${data.daily_pnl >= 0 ? '+' : ''}${data.daily_pnl.toFixed(2)})`);
    });

    this.messageHandlers.set('POSITION_UPDATE', (data) => {
      const { action, symbol, position } = data;
      console.log(`📊 Position ${action}: ${symbol} ${position.side} ${position.size} @ $${position.entry_price}`);
      
      if (position.unrealized_pnl !== undefined) {
        const pnlColor = position.unrealized_pnl >= 0 ? '🟢' : '🔴';
        console.log(`   ${pnlColor} Unrealized P&L: $${position.unrealized_pnl.toFixed(2)} (${position.unrealized_pnl_pct.toFixed(2)}%)`);
      }
    });

    this.messageHandlers.set('SIGNAL_NOTIFICATION', (data) => {
      const statusEmoji = {
        'PENDING': '⏳',
        'FILLED': '✅',
        'REJECTED': '❌',
        'CANCELLED': '🚫',
        'ERROR': '💥'
      };
      
      console.log(`${statusEmoji[data.status] || '📡'} Signal ${data.status}: ${data.signal_id}`);
      console.log(`   ${data.symbol} ${data.direction} ${data.size} @ $${data.entry_price || 'Market'}`);
      console.log(`   Phase: ${data.phase}, Processing: ${data.processing_time_ms}ms`);
    });

    this.messageHandlers.set('MASTER_ARM_CHANGE', (data) => {
      const armEmoji = data.master_arm ? '🟢' : '🔴';
      console.log(`${armEmoji} Master Arm ${data.master_arm ? 'ENABLED' : 'DISABLED'} by ${data.changed_by}`);
      if (data.reason) console.log(`   Reason: ${data.reason}`);
    });

    this.messageHandlers.set('CIRCUIT_BREAKER_UPDATE', (data) => {
      if (data.active) {
        console.log(`🚨 Circuit Breaker ACTIVATED: ${data.reason}`);
        console.log(`   Type: ${data.type}, Drawdown: ${data.daily_drawdown.toFixed(2)}%`);
      } else {
        console.log(`🟢 Circuit Breaker RESET`);
      }
    });
  }

  /**
   * Connect to Console WebSocket for real-time updates
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to Console WebSocket...');
      
      this.wsReconnectAttempts = 0;
      this.wsMaxReconnectAttempts = 5;
      this.wsReconnectDelay = 1000;
      
      this.establishWebSocketConnection(resolve, reject);
    });
  }

  /**
   * Establish WebSocket connection with reconnection logic
   */
  establishWebSocketConnection(resolve, reject) {
    this.ws = new WebSocket(CONFIG.CONSOLE_WS_URL);
    
    this.ws.on('open', () => {
      console.log('✅ WebSocket connected');
      this.wsReconnectAttempts = 0;
      this.wsReconnectDelay = 1000;
      if (resolve) {
        resolve();
        resolve = null; // Prevent multiple calls
      }
    });
    
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('❌ WebSocket message parse error:', error.message);
      }
    });
    
    this.ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket disconnected (code: ${code}, reason: ${reason || 'unknown'})`);
      this.scheduleWebSocketReconnect(resolve, reject);
    });
    
    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      if (reject && this.wsReconnectAttempts === 0) {
        reject(error);
        reject = null;
      }
    });
  }

  /**
   * Handle WebSocket message with error boundaries
   */
  handleWebSocketMessage(message) {
    try {
      const handler = this.messageHandlers.get(message.type);
      
      if (handler) {
        handler(message.data);
      } else {
        // Log unknown message types in demo mode
        if (CONFIG.DEMO_MODE) {
          console.log(`📨 ${message.type}:`, JSON.stringify(message.data, null, 2));
        }
      }
    } catch (error) {
      console.error(`❌ Error handling WebSocket message type ${message.type}:`, error.message);
    }
  }

  /**
   * Schedule WebSocket reconnection with exponential backoff
   */
  scheduleWebSocketReconnect(resolve, reject) {
    if (this.wsReconnectAttempts < this.wsMaxReconnectAttempts) {
      this.wsReconnectAttempts++;
      
      console.log(`🔄 Reconnecting WebSocket (attempt ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts}) in ${this.wsReconnectDelay}ms...`);
      
      setTimeout(() => {
        this.establishWebSocketConnection(resolve, reject);
      }, this.wsReconnectDelay);
      
      // Exponential backoff with jitter
      this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2 + Math.random() * 1000, 30000);
    } else {
      console.error('❌ WebSocket reconnection failed after maximum attempts');
      if (reject) {
        reject(new Error('WebSocket reconnection failed'));
      }
    }
  }

  /**
   * Check system health before starting
   */
  async checkSystemHealth() {
    console.log('🏥 Checking system health...');
    
    const healthChecks = [
      { name: 'Brain', url: `${CONFIG.BRAIN_URL}/health`, critical: true },
      { name: 'Execution', url: `${CONFIG.EXECUTION_URL}/health`, critical: true },
      { name: 'Master Arm', url: `${CONFIG.EXECUTION_URL}/api/console/master-arm`, critical: false }
    ];

    let allHealthy = true;
    
    for (const check of healthChecks) {
      try {
        const response = await this.makeRequestWithRetry(check.url, { timeout: 5000 });
        
        if (check.name === 'Master Arm') {
          console.log(`🎛️  Master Arm: ${response.data.status}`);
          if (!response.data.master_arm) {
            console.log('⚠️  Warning: Master Arm is DISABLED - signals will be processed but not executed');
          }
        } else {
          console.log(`✅ ${check.name}: ${response.data.status} (uptime: ${response.data.uptime || 'unknown'})`);
        }
      } catch (error) {
        const severity = check.critical ? '❌' : '⚠️';
        console.log(`${severity} ${check.name}: ${this.categorizeError(error)}`);
        
        if (check.critical) {
          allHealthy = false;
        }
      }
    }
    
    return allHealthy;
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeRequestWithRetry(url, options = {}, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await axios.get(url, { timeout: CONFIG.TIMEOUT_MS, ...options });
      } catch (error) {
        if (attempt === maxRetries) throw error;
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`   Retry ${attempt}/${maxRetries} in ${delay}ms...`);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Categorize errors for better user feedback
   */
  categorizeError(error) {
    if (error.code === 'ECONNREFUSED') {
      return 'Service not running or unreachable';
    } else if (error.code === 'ETIMEDOUT') {
      return 'Request timeout - service may be overloaded';
    } else if (error.response?.status === 503) {
      return 'Service temporarily unavailable';
    } else if (error.response?.status >= 500) {
      return 'Internal server error';
    } else if (error.response?.status >= 400) {
      return `Client error: ${error.response.status}`;
    } else {
      return error.message || 'Unknown error';
    }
  }

  /**
   * Get current dashboard data
   */
  async getDashboardData() {
    try {
      const response = await axios.get(`${CONFIG.BRAIN_URL}/dashboard`);
      const data = response.data;
      
      console.log('\n📊 Current Dashboard Data:');
      console.log(`   NAV: $${data.nav.toFixed(2)}`);
      console.log(`   Allocation: P1=${(data.allocation.w1 * 100).toFixed(0)}% P2=${(data.allocation.w2 * 100).toFixed(0)}% P3=${(data.allocation.w3 * 100).toFixed(0)}%`);
      console.log(`   Leverage: ${data.riskMetrics.globalLeverage.toFixed(1)}x`);
      console.log(`   Circuit Breaker: ${data.circuitBreaker.active ? '🔴 ACTIVE' : '🟢 Inactive'}`);
      
      return data;
    } catch (error) {
      console.error('❌ Failed to get dashboard data:', error.message);
      return null;
    }
  }

  /**
   * Send PREPARE signal
   */
  async sendPrepareSignal(symbol, direction, size, leverage = CONSTANTS.DEFAULT_LEVERAGE) {
    // Validate input parameters
    const validationErrors = this.validateSignalParams(symbol, direction, size, leverage);
    if (validationErrors.length > 0) {
      console.error('❌ Signal validation failed:', validationErrors.join(', '));
      return null;
    }
    
    const signalId = this.generateSignalId('phase1', symbol);
    
    const signal = {
      type: 'PREPARE',
      signal_id: signalId,
      symbol,
      direction,
      size,
      leverage,
      timestamp: Date.now()
    };

    // Track signal state
    this.activeSignals.set(signalId, {
      ...signal,
      status: 'PREPARING',
      createdAt: Date.now()
    });
    
    const headers = this.buildRequestHeaders();
    const signature = this.generateSignature(signal);
    if (signature) {
      headers['x-signature'] = signature;
    }
    
    console.log(`\n🚀 Sending PREPARE signal: ${signalId}`);
    console.log(`   ${symbol} ${direction} ${size} USD @ ${leverage}x leverage`);
    
    try {
      const response = await this.makeRequestWithRetry(
        `${CONFIG.EXECUTION_URL}/webhook`,
        { 
          method: 'POST',
          data: signal,
          headers 
        }
      );
      
      // Update signal state
      this.activeSignals.set(signalId, {
        ...this.activeSignals.get(signalId),
        status: 'PREPARED',
        response: response.data
      });
      
      console.log(`✅ PREPARE signal accepted: ${response.data.message}`);
      return { signalId, ...response.data };
    } catch (error) {
      // Update signal state on error
      this.activeSignals.set(signalId, {
        ...this.activeSignals.get(signalId),
        status: 'FAILED',
        error: error.message
      });
      
      console.error('❌ PREPARE signal failed:', this.categorizeError(error));
      return null;
    }
  }

  /**
   * Build standard request headers
   */
  buildRequestHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-source': 'titan_dashboard',
      'User-Agent': 'TitanSignalFlowDemo/1.0.0'
    };
  }

  /**
   * Send CONFIRM signal
   */
  async sendConfirmSignal(signalId, entryPrice, stopLoss, takeProfit) {
    if (!signalId || !this.activeSignals.has(signalId)) {
      console.error('❌ Invalid or inactive signal ID for confirmation');
      return null;
    }

    const activeSignal = this.activeSignals.get(signalId);
    if (activeSignal.status !== 'PREPARED') {
      console.error(`❌ Signal ${signalId} is not in PREPARED state (current: ${activeSignal.status})`);
      return null;
    }
    
    const signal = {
      type: 'CONFIRM',
      signal_id: this.signalId,
      entry_price: entryPrice,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      timestamp: Date.now()
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'x-source': 'titan_dashboard'
    };
    
    const signature = this.generateSignature(signal);
    if (signature) {
      headers['x-signature'] = signature;
    }
    
    console.log(`\n✅ Sending CONFIRM signal: ${this.signalId}`);
    console.log(`   Entry: $${entryPrice}, SL: $${stopLoss}, TP: $${takeProfit}`);
    
    try {
      const response = await axios.post(
        `${CONFIG.EXECUTION_URL}/webhook`,
        signal,
        { headers }
      );
      
      console.log(`✅ CONFIRM signal processed: ${response.data.message}`);
      return response.data;
    } catch (error) {
      console.error('❌ CONFIRM signal failed:', error.response?.data?.error || error.message);
      return null;
    }
  }

  /**
   * Send signal directly to Brain (alternative flow)
   */
  async sendSignalToBrain(phaseId, symbol, side, requestedSize, leverage = 15) {
    const signalId = this.generateSignalId(phaseId, symbol);
    
    const signal = {
      signalId,
      phaseId,
      symbol,
      side,
      requestedSize,
      timestamp: Date.now(),
      leverage
    };
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    const signature = this.generateSignature(signal);
    if (signature) {
      headers['x-signature'] = signature;
    }
    
    console.log(`\n🧠 Sending signal directly to Brain: ${signalId}`);
    console.log(`   Phase: ${phaseId}, ${symbol} ${side} $${requestedSize}`);
    
    try {
      const response = await axios.post(
        `${CONFIG.BRAIN_URL}/signal`,
        signal,
        { headers }
      );
      
      const decision = response.data;
      
      if (decision.approved) {
        console.log(`✅ Brain APPROVED: $${decision.authorizedSize} (${decision.reason})`);
        console.log(`   Processing time: ${decision.processingTime}ms`);
      } else {
        console.log(`❌ Brain VETOED: ${decision.reason}`);
        console.log(`   Processing time: ${decision.processingTime}ms`);
      }
      
      return decision;
    } catch (error) {
      console.error('❌ Brain signal failed:', error.response?.data?.error || error.message);
      return null;
    }
  }

  /**
   * Monitor positions
   */
  async monitorPositions() {
    try {
      const response = await axios.get(`${CONFIG.EXECUTION_URL}/positions`);
      const positions = response.data.positions;
      
      console.log(`\n📊 Current Positions (${response.data.count}):`);
      
      if (response.data.count === 0) {
        console.log('   No open positions');
        return;
      }
      
      for (const [symbol, position] of Object.entries(positions)) {
        const pnlColor = position.unrealized_pnl >= 0 ? '🟢' : '🔴';
        console.log(`   ${symbol}: ${position.side} ${position.size} @ $${position.entry_price}`);
        console.log(`     ${pnlColor} P&L: $${position.unrealized_pnl.toFixed(2)} (${position.unrealized_pnl_pct.toFixed(2)}%)`);
        
        if (position.stop_loss) {
          console.log(`     🛑 Stop Loss: $${position.stop_loss}`);
        }
        if (position.take_profit) {
          console.log(`     🎯 Take Profit: $${position.take_profit}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to get positions:', error.message);
    }
  }

  /**
   * Send ABORT signal
   */
  async sendAbortSignal(signalId, reason = 'Manual abort') {
    if (!signalId || !this.activeSignals.has(signalId)) {
      console.error('❌ Invalid or inactive signal ID for abort');
      return null;
    }
    
    const signal = {
      type: 'ABORT',
      signal_id: signalId,
      reason,
      timestamp: Date.now()
    };
    
    const headers = this.buildRequestHeaders();
    const signature = this.generateSignature(signal);
    if (signature) {
      headers['x-signature'] = signature;
    }
    
    console.log(`\n🚫 Sending ABORT signal: ${signalId}`);
    console.log(`   Reason: ${reason}`);
    
    try {
      const response = await this.makeRequestWithRetry(
        `${CONFIG.EXECUTION_URL}/webhook`,
        { 
          method: 'POST',
          data: signal,
          headers 
        }
      );
      
      // Update signal state
      this.activeSignals.set(signalId, {
        ...this.activeSignals.get(signalId),
        status: 'ABORTED',
        response: response.data
      });
      
      console.log(`✅ ABORT signal processed: ${response.data.message}`);
      return { signalId, ...response.data };
    } catch (error) {
      console.error('❌ ABORT signal failed:', this.categorizeError(error));
      return null;
    }
  }

  /**
   * Get active signal IDs
   */
  getActiveSignalIds() {
    return Array.from(this.activeSignals.keys());
  }

  /**
   * Get signal status
   */
  getSignalStatus(signalId) {
    return this.activeSignals.get(signalId)?.status || 'UNKNOWN';
  }

  /**
   * Clean up old signals
   */
  cleanupOldSignals(maxAgeMs = 300000) {
    const now = Date.now();
    for (const [signalId, signal] of this.activeSignals.entries()) {
      if (now - signal.createdAt > maxAgeMs) {
        this.activeSignals.delete(signalId);
      }
    }
  }

  /**
   * Run complete signal flow demonstration
   */
  async runDemo() {
    console.log('🚀 Starting Titan Signal Flow Demonstration\n');
    
    // 1. Check system health
    const healthy = await this.checkSystemHealth();
    if (!healthy) {
      console.log('❌ System not healthy - aborting demo');
      return;
    }
    
    // 2. Connect to WebSocket for real-time updates
    try {
      await this.connectWebSocket();
    } catch (error) {
      console.log('⚠️  WebSocket connection failed - continuing without real-time updates');
    }
    
    // 3. Get initial dashboard data
    await this.getDashboardData();
    
    // 4. Monitor initial positions
    await this.monitorPositions();
    
    // Wait a moment for any initial WebSocket messages
    await this.sleep(2000);
    
    console.log('\n' + '='.repeat(60));
    console.log('DEMONSTRATION: Complete Signal Flow');
    console.log('='.repeat(60));
    
    // 5. Send PREPARE signal
    const prepareResult = await this.sendPrepareSignal('BTCUSDT', 'LONG', 100, 15);
    if (!prepareResult) return;
    
    await this.sleep(1000);
    
    // 6. Send CONFIRM signal
    const confirmResult = await this.sendConfirmSignal(prepareResult.signalId, 43250.50, 42800.00, 44000.00);
    if (!confirmResult) return;
    
    await this.sleep(2000);
    
    // 7. Monitor positions after execution
    await this.monitorPositions();
    
    await this.sleep(2000);
    
    console.log('\n' + '='.repeat(60));
    console.log('DEMONSTRATION: Direct Brain Communication');
    console.log('='.repeat(60));
    
    // 8. Demonstrate direct Brain communication
    await this.sendSignalToBrain('phase1', 'ETHUSDT', 'BUY', 200, 10);
    
    await this.sleep(1000);
    
    // 9. Get updated dashboard data
    await this.getDashboardData();
    
    console.log('\n' + '='.repeat(60));
    console.log('DEMONSTRATION: Signal Abortion');
    console.log('='.repeat(60));
    
    // 10. Demonstrate signal abortion
    const abortTestResult = await this.sendPrepareSignal('SOLUSDT', 'SHORT', 150, 12);
    if (abortTestResult) {
      await this.sleep(1000);
      await this.sendAbortSignal(abortTestResult.signalId, 'Market conditions changed');
    }
    
    console.log('\n✅ Signal flow demonstration completed!');
    console.log('\n📊 Final system state:');
    await this.getDashboardData();
    await this.monitorPositions();
    
    // Keep WebSocket open for a bit to see any final updates
    if (this.ws) {
      console.log('\n⏳ Monitoring for 10 more seconds...');
      await this.sleep(10000);
      this.ws.close();
    }
  }

  /**
   * Utility function to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the demonstration
async function main() {
  demo = new TitanSignalFlowDemo();
  
  try {
    await demo.runDemo();
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    process.exit(1);
  }
  
  console.log('\n👋 Demo completed - goodbye!');
  process.exit(0);
}

// Handle graceful shutdown
let demo = null;

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  if (demo) {
    demo.cleanup();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down gracefully...');
  if (demo) {
    demo.cleanup();
  }
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = TitanSignalFlowDemo;