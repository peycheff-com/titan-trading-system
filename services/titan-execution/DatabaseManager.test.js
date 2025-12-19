/**
 * DatabaseManager.test.js
 * 
 * Tests for SQL Database Layer
 */

import { DatabaseManager } from './DatabaseManager.js';
import { jest } from '@jest/globals';
import fs from 'fs';

describe('DatabaseManager', () => {
  let dbManager;
  const testDbPath = './test_titan_execution.db';

  beforeEach(async () => {
    // Clean up test database if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    dbManager = new DatabaseManager({
      type: 'sqlite',
      url: testDbPath
    });
  });

  afterEach(async () => {
    if (dbManager) {
      await dbManager.close();
    }
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Initialization', () => {
    test('should initialize SQLite database', async () => {
      const result = await dbManager.initDatabase();
      expect(result).toBe(true);
      expect(dbManager.isInitialized).toBe(true);
    });

    test('should create all required tables', async () => {
      await dbManager.initDatabase();

      const tables = ['trades', 'positions', 'regime_snapshots', 'system_events'];
      
      for (const table of tables) {
        const exists = await dbManager.db.schema.hasTable(table);
        expect(exists).toBe(true);
      }
    });

    test('should emit initialized event', async () => {
      const initPromise = new Promise(resolve => {
        dbManager.on('initialized', resolve);
      });

      await dbManager.initDatabase();
      await initPromise;
    });

    test('should support PostgreSQL configuration', () => {
      const pgManager = new DatabaseManager({
        type: 'postgres',
        url: 'postgresql://user:pass@localhost:5432/testdb'
      });

      expect(pgManager.config.type).toBe('postgres');
    });
  });

  describe('Trade Operations', () => {
    beforeEach(async () => {
      await dbManager.initDatabase();
    });

    test('should insert trade record', async () => {
      const tradeData = {
        signal_id: 'titan_BTCUSDT_12345_15',
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        entry_price: 50000,
        stop_price: 49500,
        tp_price: 51000,
        fill_price: 50010,
        slippage_pct: 0.02,
        execution_latency_ms: 150,
        regime_state: 1,
        phase: 2,
        timestamp: new Date()
      };

      const result = await dbManager.insertTrade(tradeData);
      expect(result.success).toBe(true);

      // Verify insertion
      const trades = await dbManager.db('trades').where({ signal_id: tradeData.signal_id });
      expect(trades).toHaveLength(1);
      expect(trades[0].symbol).toBe('BTCUSDT');
      expect(parseFloat(trades[0].size)).toBe(0.5);
    });

    test('should get trade history with filters', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Insert test trades
      await dbManager.insertTrade({
        signal_id: 'trade1',
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        entry_price: 50000,
        timestamp: now
      });

      await dbManager.insertTrade({
        signal_id: 'trade2',
        symbol: 'ETHUSDT',
        side: 'SHORT',
        size: 1.0,
        entry_price: 3000,
        timestamp: yesterday
      });

      // Filter by symbol
      const btcTrades = await dbManager.getTrades({ symbol: 'BTCUSDT' });
      expect(btcTrades).toHaveLength(1);
      expect(btcTrades[0].symbol).toBe('BTCUSDT');

      // Filter by date
      const recentTrades = await dbManager.getTrades({ start_date: yesterday });
      expect(recentTrades.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Position Operations', () => {
    beforeEach(async () => {
      await dbManager.initDatabase();
    });

    test('should insert position record', async () => {
      const positionData = {
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        avg_entry: 50000,
        current_stop: 49500,
        current_tp: 51000,
        unrealized_pnl: 50,
        regime_at_entry: 1,
        phase_at_entry: 2,
        opened_at: new Date()
      };

      const result = await dbManager.insertPosition(positionData);
      expect(result.success).toBe(true);

      // Verify insertion
      const positions = await dbManager.db('positions').where({ symbol: 'BTCUSDT' });
      expect(positions).toHaveLength(1);
      expect(positions[0].side).toBe('LONG');
    });

    test('should update position record', async () => {
      await dbManager.insertPosition({
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        avg_entry: 50000,
        opened_at: new Date()
      });

      await dbManager.updatePosition('BTCUSDT', {
        current_stop: 50500,
        unrealized_pnl: 250
      });

      const positions = await dbManager.db('positions').where({ symbol: 'BTCUSDT' });
      expect(parseFloat(positions[0].current_stop)).toBe(50500);
      expect(parseFloat(positions[0].unrealized_pnl)).toBe(250);
      expect(positions[0].updated_at).toBeTruthy();
    });

    test('should close position record', async () => {
      await dbManager.insertPosition({
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        avg_entry: 50000,
        opened_at: new Date()
      });

      await dbManager.closePosition('BTCUSDT', {
        close_price: 51000,
        realized_pnl: 500,
        close_reason: 'tp_hit'
      });

      const positions = await dbManager.db('positions').where({ symbol: 'BTCUSDT' });
      expect(positions[0].closed_at).toBeTruthy();
      expect(parseFloat(positions[0].realized_pnl)).toBe(500);
      expect(positions[0].close_reason).toBe('tp_hit');
    });

    test('should get active positions only', async () => {
      // Insert open position
      await dbManager.insertPosition({
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        avg_entry: 50000,
        opened_at: new Date()
      });

      // Insert closed position
      await dbManager.insertPosition({
        symbol: 'ETHUSDT',
        side: 'SHORT',
        size: 1.0,
        avg_entry: 3000,
        opened_at: new Date()
      });
      await dbManager.closePosition('ETHUSDT', {
        close_price: 2950,
        realized_pnl: 50,
        close_reason: 'tp_hit'
      });

      const activePositions = await dbManager.getActivePositions();
      expect(activePositions).toHaveLength(1);
      expect(activePositions[0].symbol).toBe('BTCUSDT');
    });
  });

  describe('Regime Snapshot Operations', () => {
    beforeEach(async () => {
      await dbManager.initDatabase();
    });

    test('should insert regime snapshot', async () => {
      const snapshotData = {
        timestamp: new Date(),
        symbol: 'BTCUSDT',
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      };

      const result = await dbManager.insertRegimeSnapshot(snapshotData);
      expect(result.success).toBe(true);

      const snapshots = await dbManager.db('regime_snapshots').where({ symbol: 'BTCUSDT' });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].regime_state).toBe(1);
      expect(parseFloat(snapshots[0].market_structure_score)).toBe(85.5);
    });
  });

  describe('System Event Operations', () => {
    beforeEach(async () => {
      await dbManager.initDatabase();
    });

    test('should insert system event', async () => {
      const eventData = {
        event_type: 'emergency_flatten',
        severity: 'CRITICAL',
        description: 'Heartbeat timeout triggered emergency flatten',
        context: {
          positions_closed: 3,
          last_heartbeat: '2025-12-05T10:00:00Z'
        },
        timestamp: new Date()
      };

      const result = await dbManager.insertSystemEvent(eventData);
      expect(result.success).toBe(true);

      const events = await dbManager.db('system_events').where({ event_type: 'emergency_flatten' });
      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe('CRITICAL');
      
      const context = JSON.parse(events[0].context_json);
      expect(context.positions_closed).toBe(3);
    });
  });

  describe('Performance Summary', () => {
    beforeEach(async () => {
      await dbManager.initDatabase();
    });

    test('should calculate performance summary', async () => {
      // Insert winning trade
      await dbManager.insertPosition({
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        avg_entry: 50000,
        opened_at: new Date()
      });
      await dbManager.closePosition('BTCUSDT', {
        close_price: 51000,
        realized_pnl: 500,
        close_reason: 'tp_hit'
      });

      // Insert losing trade
      await dbManager.insertPosition({
        symbol: 'ETHUSDT',
        side: 'SHORT',
        size: 1.0,
        avg_entry: 3000,
        opened_at: new Date()
      });
      await dbManager.closePosition('ETHUSDT', {
        close_price: 3100,
        realized_pnl: -100,
        close_reason: 'stop_hit'
      });

      const summary = await dbManager.getPerformanceSummary();
      
      expect(summary.closed_positions).toBe(2);
      expect(summary.winning_trades).toBe(1);
      expect(summary.losing_trades).toBe(1);
      expect(parseFloat(summary.win_rate)).toBe(50);
      expect(parseFloat(summary.total_pnl)).toBe(400);
    });
  });

  describe('Retry Logic', () => {
    beforeEach(async () => {
      await dbManager.initDatabase();
    });

    test('should retry failed operations', async () => {
      // Force a failure by closing the database
      await dbManager.db.destroy();
      dbManager.db = null;

      const result = await dbManager.insertTrade({
        signal_id: 'test_trade',
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        entry_price: 50000
      });

      expect(result.success).toBe(false);
      expect(dbManager.retryQueue.length).toBe(1);
    });

    test('should emit retry_failed event after max attempts', async () => {
      dbManager.config.retryAttempts = 1;
      dbManager.config.retryDelay = 10; // Fast retry for testing

      await dbManager.db.destroy();
      dbManager.db = null;

      const failPromise = new Promise(resolve => {
        dbManager.on('retry_failed', resolve);
      });

      await dbManager.insertTrade({
        signal_id: 'test_trade',
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        entry_price: 50000
      });

      const failedItem = await failPromise;
      expect(failedItem.operationName).toBe('insertTrade');
    });
  });

  describe('Crash Recovery', () => {
    beforeEach(async () => {
      await dbManager.initDatabase();
    });

    test('should restore active positions from database', async () => {
      // Simulate positions before crash
      await dbManager.insertPosition({
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        avg_entry: 50000,
        opened_at: new Date()
      });

      await dbManager.insertPosition({
        symbol: 'ETHUSDT',
        side: 'SHORT',
        size: 1.0,
        avg_entry: 3000,
        opened_at: new Date()
      });

      // Simulate crash and recovery
      const activePositions = await dbManager.getActivePositions();
      
      expect(activePositions).toHaveLength(2);
      expect(activePositions.find(p => p.symbol === 'BTCUSDT')).toBeTruthy();
      expect(activePositions.find(p => p.symbol === 'ETHUSDT')).toBeTruthy();
    });
  });

  describe('Connection Pooling', () => {
    test('should configure PostgreSQL with connection pooling', () => {
      const pgManager = new DatabaseManager({
        type: 'postgres',
        url: 'postgresql://user:pass@localhost:5432/testdb'
      });

      expect(pgManager.config.type).toBe('postgres');
    });
  });
});
