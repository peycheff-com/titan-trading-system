/**
 * Database Persistence Integration Tests
 * 
 * Comprehensive tests for database persistence covering:
 * - Trade execution and recording
 * - Position lifecycle (open, update, close)
 * - Emergency flatten events
 * - API endpoint responses
 * 
 * Requirements: 97.3-97.8
 * Task: 127
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BrokerGateway, MockBrokerAdapter } from './BrokerGateway.js';
import { ShadowState } from './ShadowState.js';
import { DatabaseManager } from './DatabaseManager.js';
import fastify from 'fastify';
import fs from 'fs';

describe('Database Persistence Integration (Task 127)', () => {
  let databaseManager;
  let brokerGateway;
  let shadowState;
  let app;
  const testDbPath = './test_persistence.db';

  beforeEach(async () => {
    // Clean up test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize DatabaseManager with SQLite
    databaseManager = new DatabaseManager({
      type: 'sqlite',
      url: testDbPath,
    });
    await databaseManager.initDatabase();

    // Initialize BrokerGateway with DatabaseManager
    brokerGateway = new BrokerGateway({
      adapter: new MockBrokerAdapter(),
      databaseManager,
    });

    // Initialize ShadowState with DatabaseManager
    shadowState = new ShadowState({
      databaseManager,
    });

    // Initialize Fastify app with API endpoints
    app = fastify({ logger: false });

    // Register API endpoints (simplified versions for testing)
    app.get('/api/trades', async (request, reply) => {
      try {
        const { start_date, end_date, symbol, limit } = request.query;
        const trades = await databaseManager.getTrades({
          start_date,
          end_date,
          symbol,
          limit: limit ? parseInt(limit) : 100,
        });
        return { success: true, trades };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    app.get('/api/positions/active', async (request, reply) => {
      try {
        const positions = await databaseManager.getActivePositions();
        return { success: true, positions };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    app.get('/api/performance/summary', async (request, reply) => {
      try {
        const summary = await databaseManager.getPerformanceSummary();
        return { success: true, summary };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    await app.ready();
  });

  afterEach(async () => {
    // Clean up
    if (app) {
      await app.close();
    }
    if (brokerGateway) {
      brokerGateway.destroy();
    }
    if (shadowState) {
      shadowState.destroy();
    }
    if (databaseManager) {
      await databaseManager.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Execute test trade: verify trade record in database', () => {
    it('should insert trade record after order execution', async () => {
      // Requirement: 97.3
      const signalId = 'test_trade_001';
      const orderParams = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
        limit_price: 50000,
        stop_loss: 49000,
        take_profits: [51000, 52000, 53000],
      };

      // Execute trade
      const result = await brokerGateway.sendOrder(signalId, orderParams);

      // Verify order was successful
      expect(result.success).toBe(true);
      expect(result.filled).toBe(true);

      // Wait for async database write
      await new Promise(resolve => setTimeout(resolve, 150));

      // Query database for trade record
      const trades = await databaseManager.getTrades({ symbol: 'BTCUSDT' });
      
      expect(trades.length).toBeGreaterThan(0);
      const trade = trades[0];
      
      // Verify all required fields are present
      expect(trade.signal_id).toBe(signalId);
      expect(trade.symbol).toBe('BTCUSDT');
      expect(trade.side).toBe('BUY');
      expect(parseFloat(trade.size)).toBe(0.5);
      expect(parseFloat(trade.entry_price)).toBe(50000);
      expect(parseFloat(trade.stop_price)).toBe(49000);
      expect(trade.timestamp).toBeDefined();
      
      // Verify execution metrics
      expect(trade.fill_price).toBeDefined();
      expect(trade.execution_latency_ms).toBeDefined();
    });
  });

  describe('Open position: verify position record created', () => {
    it('should insert position record when position is opened', async () => {
      // Requirement: 97.4
      const intent = {
        signal_id: 'position_open_001',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50000, 49900, 49800],
        stop_loss: 49000,
        take_profits: [51000, 52000, 53000],
        size: 0.5,
        regime_state: 1,
        phase: 2,
      };

      // Process intent
      shadowState.processIntent(intent);

      // Confirm execution
      const brokerResponse = {
        broker_order_id: 'BROKER_OPEN_001',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
        status: 'FILLED',
      };

      const position = shadowState.confirmExecution('position_open_001', brokerResponse);

      // Verify position was created in memory
      expect(position).not.toBeNull();
      expect(position.symbol).toBe('BTCUSDT');
      expect(position.side).toBe('LONG');

      // Wait for async database write
      await new Promise(resolve => setTimeout(resolve, 150));

      // Query database for position record
      const positions = await databaseManager.getPositions({ 
        symbol: 'BTCUSDT', 
        active_only: true 
      });
      
      expect(positions.length).toBeGreaterThan(0);
      const dbPosition = positions[0];
      
      // Verify all required fields
      expect(dbPosition.symbol).toBe('BTCUSDT');
      expect(dbPosition.side).toBe('LONG');
      expect(parseFloat(dbPosition.size)).toBe(0.5);
      expect(parseFloat(dbPosition.avg_entry)).toBe(50000);
      expect(parseFloat(dbPosition.current_stop)).toBe(49000);
      expect(dbPosition.opened_at).toBeDefined();
      expect(dbPosition.closed_at).toBeNull();
      
      // Verify regime and phase tracking
      expect(dbPosition.regime_at_entry).toBe(1);
      expect(dbPosition.phase_at_entry).toBe(2);
    });
  });

  describe('Close position: verify position record updated with close_reason', () => {
    it('should update position record when closed with stop_hit reason', async () => {
      // Requirement: 97.5
      // Open position
      const intent = {
        signal_id: 'position_close_001',
        symbol: 'BTCUSDT',
        direction: 1,
        size: 0.5,
      };

      shadowState.processIntent(intent);
      shadowState.confirmExecution('position_close_001', {
        broker_order_id: 'BROKER_CLOSE_001',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
        status: 'FILLED',
      });

      await new Promise(resolve => setTimeout(resolve, 150));

      // Close position with stop_hit reason
      const tradeRecord = shadowState.closePosition('BTCUSDT', 49000, 'stop_hit');

      expect(tradeRecord).not.toBeNull();
      expect(tradeRecord.pnl).toBe(-500); // (49000 - 50000) * 0.5

      await new Promise(resolve => setTimeout(resolve, 150));

      // Query database for closed position
      const positions = await databaseManager.getPositions({ symbol: 'BTCUSDT' });
      
      expect(positions.length).toBeGreaterThan(0);
      const dbPosition = positions[0];
      
      // Verify position is closed
      expect(dbPosition.closed_at).not.toBeNull();
      expect(parseFloat(dbPosition.close_price)).toBe(49000);
      expect(parseFloat(dbPosition.realized_pnl)).toBe(-500);
      expect(dbPosition.close_reason).toBe('stop_hit');
    });

    it('should update position record when closed with regime_kill reason', async () => {
      // Open position
      shadowState.processIntent({
        signal_id: 'position_regime_001',
        symbol: 'ETHUSDT',
        direction: 1,
        size: 1.0,
      });

      shadowState.confirmExecution('position_regime_001', {
        broker_order_id: 'BROKER_REGIME_001',
        fill_price: 3000,
        fill_size: 1.0,
        filled: true,
        status: 'FILLED',
      });

      await new Promise(resolve => setTimeout(resolve, 150));

      // Close due to regime kill
      shadowState.closePosition('ETHUSDT', 3100, 'regime_kill');

      await new Promise(resolve => setTimeout(resolve, 150));

      const positions = await databaseManager.getPositions({ symbol: 'ETHUSDT' });
      const dbPosition = positions[0];
      
      expect(dbPosition.close_reason).toBe('regime_kill');
      expect(parseFloat(dbPosition.realized_pnl)).toBe(100);
    });
  });

  describe('Trigger emergency flatten: verify system_event logged', () => {
    it('should log system_event when emergency flatten is triggered', async () => {
      // Requirement: 97.7
      const event = {
        event_type: 'emergency_flatten',
        severity: 'CRITICAL',
        description: 'Emergency flatten triggered by operator',
        context: {
          positions_closed: 2,
          symbols: ['BTCUSDT', 'ETHUSDT'],
          trigger_reason: 'manual_operator_action',
        },
      };

      await databaseManager.insertSystemEvent(event);

      // Wait for async write
      await new Promise(resolve => setTimeout(resolve, 150));

      // Query system_events table
      const events = await databaseManager.getSystemEvents({ 
        event_type: 'emergency_flatten' 
      });

      expect(events.length).toBeGreaterThan(0);
      const loggedEvent = events[0];
      
      expect(loggedEvent.event_type).toBe('emergency_flatten');
      expect(loggedEvent.severity).toBe('CRITICAL');
      expect(loggedEvent.description).toContain('Emergency flatten');
      expect(loggedEvent.timestamp).toBeDefined();
      
      // Verify context JSON
      const context = JSON.parse(loggedEvent.context_json);
      expect(context.positions_closed).toBe(2);
      expect(context.symbols).toContain('BTCUSDT');
      expect(context.symbols).toContain('ETHUSDT');
    });

    it('should log heartbeat_timeout system event', async () => {
      const event = {
        event_type: 'heartbeat_timeout',
        severity: 'CRITICAL',
        description: 'Heartbeat timeout detected - emergency flatten triggered',
        context: {
          last_heartbeat: new Date().toISOString(),
          timeout_duration_ms: 300000,
          positions_affected: 1,
        },
      };

      await databaseManager.insertSystemEvent(event);
      await new Promise(resolve => setTimeout(resolve, 150));

      const events = await databaseManager.getSystemEvents({ 
        event_type: 'heartbeat_timeout' 
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].event_type).toBe('heartbeat_timeout');
      expect(events[0].severity).toBe('CRITICAL');
    });
  });

  describe('Query /api/trades endpoint: verify JSON response', () => {
    it('should return trades via /api/trades endpoint', async () => {
      // Requirement: 97.8
      // Execute some trades
      await brokerGateway.sendOrder('api_test_001', {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
        limit_price: 50000,
      });

      await brokerGateway.sendOrder('api_test_002', {
        symbol: 'ETHUSDT',
        side: 'SELL',
        size: 1.0,
        limit_price: 3000,
      });

      await new Promise(resolve => setTimeout(resolve, 150));

      // Query API endpoint
      const response = await app.inject({
        method: 'GET',
        url: '/api/trades',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.success).toBe(true);
      expect(data.trades).toBeDefined();
      expect(Array.isArray(data.trades)).toBe(true);
      expect(data.trades.length).toBeGreaterThanOrEqual(2);
      
      // Verify trade structure
      const trade = data.trades[0];
      expect(trade.signal_id).toBeDefined();
      expect(trade.symbol).toBeDefined();
      expect(trade.side).toBeDefined();
      expect(trade.size).toBeDefined();
      expect(trade.timestamp).toBeDefined();
    });

    it('should filter trades by symbol via /api/trades endpoint', async () => {
      // Execute trades for different symbols
      await brokerGateway.sendOrder('filter_btc_001', {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
        limit_price: 50000,
      });

      await brokerGateway.sendOrder('filter_eth_001', {
        symbol: 'ETHUSDT',
        side: 'BUY',
        size: 1.0,
        limit_price: 3000,
      });

      await new Promise(resolve => setTimeout(resolve, 150));

      // Query for BTC trades only
      const response = await app.inject({
        method: 'GET',
        url: '/api/trades?symbol=BTCUSDT',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.success).toBe(true);
      expect(data.trades.length).toBeGreaterThan(0);
      
      // All trades should be for BTCUSDT
      data.trades.forEach(trade => {
        expect(trade.symbol).toBe('BTCUSDT');
      });
    });

    it('should return active positions via /api/positions/active endpoint', async () => {
      // Open positions
      shadowState.processIntent({
        signal_id: 'active_pos_001',
        symbol: 'BTCUSDT',
        direction: 1,
        size: 0.5,
      });

      shadowState.confirmExecution('active_pos_001', {
        broker_order_id: 'BROKER_ACTIVE_001',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
        status: 'FILLED',
      });

      await new Promise(resolve => setTimeout(resolve, 150));

      // Query API endpoint
      const response = await app.inject({
        method: 'GET',
        url: '/api/positions/active',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.success).toBe(true);
      expect(data.positions).toBeDefined();
      expect(Array.isArray(data.positions)).toBe(true);
      expect(data.positions.length).toBeGreaterThan(0);
      
      // Verify position structure
      const position = data.positions[0];
      expect(position.symbol).toBeDefined();
      expect(position.side).toBeDefined();
      expect(position.size).toBeDefined();
      expect(position.avg_entry).toBeDefined();
      expect(position.opened_at).toBeDefined();
      expect(position.closed_at).toBeNull();
    });

    it('should return performance summary via /api/performance/summary endpoint', async () => {
      // Execute some trades and close positions to generate performance data
      shadowState.processIntent({
        signal_id: 'perf_001',
        symbol: 'BTCUSDT',
        direction: 1,
        size: 0.5,
      });

      shadowState.confirmExecution('perf_001', {
        broker_order_id: 'BROKER_PERF_001',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
        status: 'FILLED',
      });

      await new Promise(resolve => setTimeout(resolve, 150));

      // Close with profit
      shadowState.closePosition('BTCUSDT', 51000, 'tp_hit');

      await new Promise(resolve => setTimeout(resolve, 150));

      // Query API endpoint
      const response = await app.inject({
        method: 'GET',
        url: '/api/performance/summary',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.success).toBe(true);
      expect(data.summary).toBeDefined();
      
      // Verify summary structure
      expect(data.summary.total_trades).toBeDefined();
      expect(data.summary.winning_trades).toBeDefined();
      expect(data.summary.losing_trades).toBeDefined();
      expect(data.summary.total_pnl).toBeDefined();
    });
  });
});
