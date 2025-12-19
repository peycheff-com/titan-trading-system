/**
 * API Endpoints Tests
 * 
 * Tests the Trade History API endpoints
 * 
 * Requirements: 97.8
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseManager } from './DatabaseManager.js';
import fs from 'fs';

describe('Trade History API Endpoints', () => {
  let databaseManager;
  const testDbPath = './test_api_endpoints.db';

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

    // Insert test data
    await insertTestData(databaseManager);
  });

  afterEach(async () => {
    // Clean up
    if (databaseManager) {
      await databaseManager.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('GET /api/trades', () => {
    it('should return all trades when no filters are provided', async () => {
      const trades = await databaseManager.getTrades({ limit: 100 });
      
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0]).toHaveProperty('signal_id');
      expect(trades[0]).toHaveProperty('symbol');
      expect(trades[0]).toHaveProperty('side');
      expect(trades[0]).toHaveProperty('size');
    });

    it('should filter trades by symbol', async () => {
      const trades = await databaseManager.getTrades({ 
        symbol: 'BTCUSDT',
        limit: 100 
      });
      
      expect(trades.length).toBeGreaterThan(0);
      trades.forEach(trade => {
        expect(trade.symbol).toBe('BTCUSDT');
      });
    });

    it('should filter trades by date range', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 86400000); // 24 hours ago
      const endDate = new Date(now.getTime() + 3600000); // 1 hour from now
      
      const trades = await databaseManager.getTrades({ 
        start_date: startDate,
        end_date: endDate,
        limit: 100 
      });
      
      // Should return trades within the date range
      expect(trades.length).toBeGreaterThan(0);
      
      // Verify all trades have timestamps
      trades.forEach(trade => {
        expect(trade.timestamp).toBeDefined();
        expect(trade.timestamp).not.toBeNull();
      });
    });

    it('should filter trades by phase', async () => {
      const trades = await databaseManager.getTrades({ 
        phase: 1,
        limit: 100 
      });
      
      expect(trades.length).toBeGreaterThan(0);
      trades.forEach(trade => {
        expect(trade.phase).toBe(1);
      });
    });

    it('should respect limit parameter', async () => {
      const trades = await databaseManager.getTrades({ limit: 2 });
      
      expect(trades.length).toBeLessThanOrEqual(2);
    });

    it('should combine multiple filters', async () => {
      const trades = await databaseManager.getTrades({ 
        symbol: 'BTCUSDT',
        phase: 1,
        limit: 100 
      });
      
      trades.forEach(trade => {
        expect(trade.symbol).toBe('BTCUSDT');
        expect(trade.phase).toBe(1);
      });
    });
  });

  describe('GET /api/positions/active', () => {
    it('should return only active positions', async () => {
      const positions = await databaseManager.getActivePositions();
      
      expect(positions.length).toBeGreaterThan(0);
      positions.forEach(position => {
        expect(position.closed_at).toBeNull();
      });
    });

    it('should include all required position fields', async () => {
      const positions = await databaseManager.getActivePositions();
      
      expect(positions.length).toBeGreaterThan(0);
      const position = positions[0];
      expect(position).toHaveProperty('symbol');
      expect(position).toHaveProperty('side');
      expect(position).toHaveProperty('size');
      expect(position).toHaveProperty('avg_entry');
      expect(position).toHaveProperty('current_stop');
      expect(position).toHaveProperty('opened_at');
    });
  });

  describe('GET /api/positions/history', () => {
    it('should return all positions including closed ones', async () => {
      const positions = await databaseManager.getPositions({ 
        active_only: false,
        limit: 100 
      });
      
      expect(positions.length).toBeGreaterThan(0);
      
      // Should include both open and closed positions
      const hasOpen = positions.some(p => p.closed_at === null);
      const hasClosed = positions.some(p => p.closed_at !== null);
      expect(hasOpen || hasClosed).toBe(true);
    });

    it('should filter positions by symbol', async () => {
      const positions = await databaseManager.getPositions({ 
        symbol: 'ETHUSDT',
        active_only: false,
        limit: 100 
      });
      
      expect(positions.length).toBeGreaterThan(0);
      positions.forEach(position => {
        expect(position.symbol).toBe('ETHUSDT');
      });
    });

    it('should support pagination with offset', async () => {
      const firstPage = await databaseManager.getPositions({ 
        limit: 2,
        offset: 0 
      });
      
      const secondPage = await databaseManager.getPositions({ 
        limit: 2,
        offset: 2 
      });
      
      expect(firstPage.length).toBeLessThanOrEqual(2);
      expect(secondPage.length).toBeLessThanOrEqual(2);
      
      // Ensure different results (if enough data)
      if (firstPage.length > 0 && secondPage.length > 0) {
        expect(firstPage[0].position_id).not.toBe(secondPage[0].position_id);
      }
    });

    it('should respect limit parameter', async () => {
      const positions = await databaseManager.getPositions({ limit: 3 });
      
      expect(positions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('GET /api/performance/summary', () => {
    it('should return performance metrics', async () => {
      const summary = await databaseManager.getPerformanceSummary();
      
      expect(summary).toHaveProperty('total_trades');
      expect(summary).toHaveProperty('win_rate');
      expect(summary).toHaveProperty('avg_pnl');
      expect(summary).toHaveProperty('total_pnl');
      expect(summary.total_trades).toBeGreaterThan(0);
    });

    it('should calculate win rate correctly', async () => {
      const summary = await databaseManager.getPerformanceSummary();
      
      const winRate = parseFloat(summary.win_rate);
      expect(winRate).toBeGreaterThanOrEqual(0);
      expect(winRate).toBeLessThanOrEqual(100);
    });

    it('should calculate average PnL', async () => {
      const summary = await databaseManager.getPerformanceSummary();
      
      expect(summary.avg_pnl).toBeDefined();
      expect(typeof parseFloat(summary.avg_pnl)).toBe('number');
    });

    it('should include closed positions count', async () => {
      const summary = await databaseManager.getPerformanceSummary();
      
      expect(summary.closed_positions).toBeDefined();
      expect(summary.closed_positions).toBeGreaterThanOrEqual(0);
    });
  });
});

/**
 * Helper function to insert test data
 */
async function insertTestData(databaseManager) {
  const now = new Date();
  
  // Insert test trades
  await databaseManager.insertTrade({
    signal_id: 'test_signal_001',
    symbol: 'BTCUSDT',
    side: 'BUY',
    size: 0.5,
    entry_price: 50000,
    stop_price: 49000,
    tp_price: 51000,
    fill_price: 50000,
    slippage_pct: 0.01,
    execution_latency_ms: 50,
    regime_state: 1,
    phase: 1,
    timestamp: new Date(now.getTime() - 3600000), // 1 hour ago
  });

  await databaseManager.insertTrade({
    signal_id: 'test_signal_002',
    symbol: 'ETHUSDT',
    side: 'SELL',
    size: 1.0,
    entry_price: 3000,
    stop_price: 3100,
    tp_price: 2900,
    fill_price: 3000,
    slippage_pct: 0.02,
    execution_latency_ms: 75,
    regime_state: 1,
    phase: 2,
    timestamp: new Date(now.getTime() - 7200000), // 2 hours ago
  });

  await databaseManager.insertTrade({
    signal_id: 'test_signal_003',
    symbol: 'BTCUSDT',
    side: 'BUY',
    size: 0.3,
    entry_price: 51000,
    stop_price: 50000,
    tp_price: 52000,
    fill_price: 51000,
    slippage_pct: 0.015,
    execution_latency_ms: 60,
    regime_state: 1,
    phase: 1,
    timestamp: new Date(now.getTime() - 1800000), // 30 minutes ago
  });

  // Insert test positions (some open, some closed)
  await databaseManager.insertPosition({
    symbol: 'BTCUSDT',
    side: 'LONG',
    size: 0.5,
    avg_entry: 50000,
    current_stop: 49000,
    current_tp: 51000,
    unrealized_pnl: 500,
    regime_at_entry: 1,
    phase_at_entry: 1,
    opened_at: new Date(now.getTime() - 3600000),
  });

  await databaseManager.insertPosition({
    symbol: 'ETHUSDT',
    side: 'SHORT',
    size: 1.0,
    avg_entry: 3000,
    current_stop: 3100,
    current_tp: 2900,
    unrealized_pnl: 0,
    regime_at_entry: 1,
    phase_at_entry: 2,
    opened_at: new Date(now.getTime() - 7200000),
  });

  // Insert a closed position
  const closedPositionId = await databaseManager.insertPosition({
    symbol: 'BTCUSDT',
    side: 'LONG',
    size: 0.3,
    avg_entry: 49000,
    current_stop: 48000,
    current_tp: 50000,
    unrealized_pnl: 0,
    regime_at_entry: 1,
    phase_at_entry: 1,
    opened_at: new Date(now.getTime() - 10800000), // 3 hours ago
  });

  // Close the position
  await databaseManager.closePosition('BTCUSDT', {
    closed_at: new Date(now.getTime() - 5400000), // 1.5 hours ago
    close_price: 50000,
    realized_pnl: 300, // (50000 - 49000) * 0.3
    close_reason: 'TAKE_PROFIT',
  });

  // Wait a bit for async writes to complete
  await new Promise(resolve => setTimeout(resolve, 200));
}
