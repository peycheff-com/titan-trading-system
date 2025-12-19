/**
 * RegimeLogger.test.js
 * 
 * Tests for Periodic Regime Snapshot Logger
 */

import { RegimeLogger } from './RegimeLogger.js';
import { DatabaseManager } from './DatabaseManager.js';
import { jest } from '@jest/globals';
import fs from 'fs';

describe('RegimeLogger', () => {
  let regimeLogger;
  let dbManager;
  const testDbPath = './test_regime_logger.db';

  beforeEach(async () => {
    // Clean up test database if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create database manager
    dbManager = new DatabaseManager({
      type: 'sqlite',
      url: testDbPath
    });
    await dbManager.initDatabase();

    // Create regime logger with short interval for testing
    regimeLogger = new RegimeLogger(dbManager, {
      snapshotInterval: 100, // 100ms for testing
      enabled: true
    });
  });

  afterEach(async () => {
    if (regimeLogger) {
      regimeLogger.stop();
    }
    if (dbManager) {
      await dbManager.close();
    }
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Initialization', () => {
    test('should require DatabaseManager', () => {
      expect(() => new RegimeLogger(null)).toThrow('DatabaseManager is required');
    });

    test('should initialize with default config', () => {
      const logger = new RegimeLogger(dbManager);
      expect(logger.config.snapshotInterval).toBe(5 * 60 * 1000); // 5 minutes
      expect(logger.config.enabled).toBe(true);
      expect(logger.isRunning).toBe(false);
    });

    test('should initialize with custom config', () => {
      const logger = new RegimeLogger(dbManager, {
        snapshotInterval: 10000,
        enabled: false
      });
      expect(logger.config.snapshotInterval).toBe(10000);
      expect(logger.config.enabled).toBe(false);
    });
  });

  describe('Start/Stop', () => {
    test('should start periodic logging', () => {
      regimeLogger.start();
      expect(regimeLogger.isRunning).toBe(true);
      expect(regimeLogger.intervalId).toBeTruthy();
    });

    test('should emit started event', (done) => {
      regimeLogger.on('started', () => {
        expect(regimeLogger.isRunning).toBe(true);
        done();
      });
      regimeLogger.start();
    });

    test('should not start if already running', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      regimeLogger.start();
      regimeLogger.start(); // Try to start again
      
      expect(consoleSpy).toHaveBeenCalledWith('[RegimeLogger] Already running');
      consoleSpy.mockRestore();
    });

    test('should not start if disabled', () => {
      const logger = new RegimeLogger(dbManager, { enabled: false });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.start();
      
      expect(logger.isRunning).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('[RegimeLogger] Disabled by configuration');
      consoleSpy.mockRestore();
    });

    test('should stop periodic logging', () => {
      regimeLogger.start();
      regimeLogger.stop();
      
      expect(regimeLogger.isRunning).toBe(false);
      expect(regimeLogger.intervalId).toBeNull();
    });

    test('should emit stopped event', (done) => {
      regimeLogger.on('stopped', () => {
        expect(regimeLogger.isRunning).toBe(false);
        done();
      });
      
      regimeLogger.start();
      regimeLogger.stop();
    });

    test('should handle stop when not running', () => {
      expect(() => regimeLogger.stop()).not.toThrow();
    });
  });

  describe('Regime Vector Updates', () => {
    test('should update regime vector for symbol', () => {
      const regimeVector = {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      };

      regimeLogger.updateRegimeVector('BTCUSDT', regimeVector);

      const stored = regimeLogger.getRegimeVector('BTCUSDT');
      expect(stored.regime_state).toBe(1);
      expect(stored.trend_state).toBe(1);
      expect(stored.market_structure_score).toBe(85.5);
      expect(stored.updated_at).toBeInstanceOf(Date);
    });

    test('should emit regime_updated event', (done) => {
      const regimeVector = {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      };

      regimeLogger.on('regime_updated', ({ symbol, regimeVector: rv }) => {
        expect(symbol).toBe('BTCUSDT');
        expect(rv.regime_state).toBe(1);
        done();
      });

      regimeLogger.updateRegimeVector('BTCUSDT', regimeVector);
    });

    test('should handle invalid regime vector update', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      regimeLogger.updateRegimeVector(null, null);
      regimeLogger.updateRegimeVector('BTCUSDT', null);
      
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    test('should track multiple symbols', () => {
      regimeLogger.updateRegimeVector('BTCUSDT', {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      });

      regimeLogger.updateRegimeVector('ETHUSDT', {
        regime_state: 0,
        trend_state: 0,
        vol_state: 1,
        market_structure_score: 60.0,
        model_recommendation: 'NO_TRADE'
      });

      expect(regimeLogger.getTrackedSymbols()).toEqual(['BTCUSDT', 'ETHUSDT']);
    });
  });

  describe('Snapshot Logging', () => {
    test('should log snapshots to database', async () => {
      regimeLogger.updateRegimeVector('BTCUSDT', {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      });

      // Manually trigger snapshot
      await regimeLogger._logSnapshots();

      // Verify database insertion
      const snapshots = await dbManager.db('regime_snapshots')
        .where({ symbol: 'BTCUSDT' });
      
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].regime_state).toBe(1);
      expect(snapshots[0].trend_state).toBe(1);
      expect(parseFloat(snapshots[0].market_structure_score)).toBe(85.5);
      expect(snapshots[0].model_recommendation).toBe('TREND_FOLLOW');
    });

    test('should log multiple symbol snapshots', async () => {
      regimeLogger.updateRegimeVector('BTCUSDT', {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      });

      regimeLogger.updateRegimeVector('ETHUSDT', {
        regime_state: 0,
        trend_state: 0,
        vol_state: 1,
        market_structure_score: 60.0,
        model_recommendation: 'NO_TRADE'
      });

      await regimeLogger._logSnapshots();
      
      // Wait a bit for async database operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const snapshots = await dbManager.db('regime_snapshots').select('*');
      expect(snapshots).toHaveLength(2);
      
      const btcSnapshot = snapshots.find(s => s.symbol === 'BTCUSDT');
      const ethSnapshot = snapshots.find(s => s.symbol === 'ETHUSDT');
      
      expect(btcSnapshot).toBeTruthy();
      expect(ethSnapshot).toBeTruthy();
    });

    test('should emit snapshots_logged event', async () => {
      const eventPromise = new Promise(resolve => {
        regimeLogger.on('snapshots_logged', resolve);
      });

      regimeLogger.updateRegimeVector('BTCUSDT', {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      });

      await regimeLogger._logSnapshots();

      const event = await eventPromise;
      expect(event.count).toBe(1);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    test('should handle empty regime vectors', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await regimeLogger._logSnapshots();
      
      expect(consoleSpy).toHaveBeenCalledWith('[RegimeLogger] No regime vectors to log');
      consoleSpy.mockRestore();
    });

    test('should handle database insertion errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Close database to force error
      await dbManager.close();

      regimeLogger.updateRegimeVector('BTCUSDT', {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      });

      await regimeLogger._logSnapshots();

      // Wait for async error handling
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should log error but not throw
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Periodic Execution', () => {
    test('should log snapshots periodically', (done) => {
      let snapshotCount = 0;

      regimeLogger.on('snapshots_logged', () => {
        snapshotCount++;
        if (snapshotCount >= 2) {
          regimeLogger.stop();
          done();
        }
      });

      regimeLogger.updateRegimeVector('BTCUSDT', {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      });

      regimeLogger.start();
    }, 5000); // 5 second timeout - reduced for faster test execution

    test('should run immediately on start', (done) => {
      regimeLogger.on('snapshots_logged', () => {
        regimeLogger.stop();
        done();
      });

      regimeLogger.updateRegimeVector('BTCUSDT', {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      });

      regimeLogger.start();
    });
  });

  describe('Regime Vector Management', () => {
    test('should get regime vector for symbol', () => {
      const regimeVector = {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      };

      regimeLogger.updateRegimeVector('BTCUSDT', regimeVector);

      const retrieved = regimeLogger.getRegimeVector('BTCUSDT');
      expect(retrieved.regime_state).toBe(1);
    });

    test('should return undefined for unknown symbol', () => {
      const retrieved = regimeLogger.getRegimeVector('UNKNOWN');
      expect(retrieved).toBeUndefined();
    });

    test('should get tracked symbols', () => {
      regimeLogger.updateRegimeVector('BTCUSDT', { regime_state: 1 });
      regimeLogger.updateRegimeVector('ETHUSDT', { regime_state: 0 });

      const symbols = regimeLogger.getTrackedSymbols();
      expect(symbols).toContain('BTCUSDT');
      expect(symbols).toContain('ETHUSDT');
      expect(symbols).toHaveLength(2);
    });

    test('should clear regime vector for symbol', () => {
      regimeLogger.updateRegimeVector('BTCUSDT', { regime_state: 1 });
      
      const deleted = regimeLogger.clearRegimeVector('BTCUSDT');
      
      expect(deleted).toBe(true);
      expect(regimeLogger.getRegimeVector('BTCUSDT')).toBeUndefined();
    });

    test('should emit regime_cleared event', (done) => {
      regimeLogger.on('regime_cleared', ({ symbol }) => {
        expect(symbol).toBe('BTCUSDT');
        done();
      });

      regimeLogger.updateRegimeVector('BTCUSDT', { regime_state: 1 });
      regimeLogger.clearRegimeVector('BTCUSDT');
    });

    test('should return false when clearing non-existent symbol', () => {
      const deleted = regimeLogger.clearRegimeVector('UNKNOWN');
      expect(deleted).toBe(false);
    });

    test('should clear all regime vectors', () => {
      regimeLogger.updateRegimeVector('BTCUSDT', { regime_state: 1 });
      regimeLogger.updateRegimeVector('ETHUSDT', { regime_state: 0 });

      regimeLogger.clearAll();

      expect(regimeLogger.getTrackedSymbols()).toHaveLength(0);
    });

    test('should emit all_cleared event', (done) => {
      regimeLogger.on('all_cleared', ({ count }) => {
        expect(count).toBe(2);
        done();
      });

      regimeLogger.updateRegimeVector('BTCUSDT', { regime_state: 1 });
      regimeLogger.updateRegimeVector('ETHUSDT', { regime_state: 0 });
      regimeLogger.clearAll();
    });
  });

  describe('Status', () => {
    test('should get status when stopped', () => {
      const status = regimeLogger.getStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.enabled).toBe(true);
      expect(status.snapshotInterval).toBe(100);
      expect(status.trackedSymbols).toEqual([]);
      expect(status.symbolCount).toBe(0);
    });

    test('should get status when running', () => {
      regimeLogger.updateRegimeVector('BTCUSDT', { regime_state: 1 });
      regimeLogger.start();

      const status = regimeLogger.getStatus();
      
      expect(status.isRunning).toBe(true);
      expect(status.trackedSymbols).toContain('BTCUSDT');
      expect(status.symbolCount).toBe(1);
    });
  });

  describe('Integration', () => {
    test('should integrate with DatabaseManager retry logic', async () => {
      // Insert regime vector
      regimeLogger.updateRegimeVector('BTCUSDT', {
        regime_state: 1,
        trend_state: 1,
        vol_state: 1,
        market_structure_score: 85.5,
        model_recommendation: 'TREND_FOLLOW'
      });

      // Log snapshot
      await regimeLogger._logSnapshots();

      // Verify in database
      const snapshots = await dbManager.db('regime_snapshots')
        .where({ symbol: 'BTCUSDT' });
      
      expect(snapshots).toHaveLength(1);
    });

    test('should handle concurrent updates', () => {
      // Simulate concurrent updates from multiple webhooks
      regimeLogger.updateRegimeVector('BTCUSDT', { regime_state: 1 });
      regimeLogger.updateRegimeVector('ETHUSDT', { regime_state: 0 });
      regimeLogger.updateRegimeVector('BTCUSDT', { regime_state: -1 }); // Update

      const btcVector = regimeLogger.getRegimeVector('BTCUSDT');
      expect(btcVector.regime_state).toBe(-1); // Latest update
    });
  });
});
