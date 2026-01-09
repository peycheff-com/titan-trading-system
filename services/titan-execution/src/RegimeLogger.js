/**
 * RegimeLogger.js
 * 
 * Periodic Regime Snapshot Logger
 * 
 * Features:
 * - Logs regime vector snapshots every 5 minutes
 * - Runs as background task independent of trade execution
 * - Persists to database for historical regime analysis
 * - Supports multiple symbols
 * 
 * Requirements: 97.6
 */

import { EventEmitter } from 'events';

export class RegimeLogger extends EventEmitter {
  constructor(databaseManager, config = {}) {
    super();
    
    if (!databaseManager) {
      throw new Error('DatabaseManager is required');
    }
    
    this.db = databaseManager;
    this.config = {
      snapshotInterval: config.snapshotInterval || 5 * 60 * 1000, // 5 minutes in ms
      enabled: config.enabled !== undefined ? config.enabled : true,
      ...config
    };
    
    this.intervalId = null;
    this.isRunning = false;
    this.latestRegimeVectors = new Map(); // symbol -> RegimeVector
  }

  /**
   * Start periodic regime snapshot logging
   */
  start() {
    if (this.isRunning) {
      console.warn('[RegimeLogger] Already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[RegimeLogger] Disabled by configuration');
      return;
    }

    this.isRunning = true;
    
    // Run immediately on start
    this._logSnapshots().catch(err => {
      console.error('[RegimeLogger] Initial snapshot failed:', err);
    });

    // Set up periodic logging
    this.intervalId = setInterval(() => {
      this._logSnapshots().catch(err => {
        console.error('[RegimeLogger] Periodic snapshot failed:', err);
      });
    }, this.config.snapshotInterval);

    console.log(`[RegimeLogger] Started with ${this.config.snapshotInterval / 1000}s interval`);
    this.emit('started');
  }

  /**
   * Stop periodic regime snapshot logging
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('[RegimeLogger] Stopped');
    this.emit('stopped');
  }

  /**
   * Update regime vector for a symbol
   * Called by webhook handler when new regime data arrives
   */
  updateRegimeVector(symbol, regimeVector) {
    if (!symbol || !regimeVector) {
      console.warn('[RegimeLogger] Invalid regime vector update');
      return;
    }

    this.latestRegimeVectors.set(symbol, {
      ...regimeVector,
      updated_at: new Date()
    });

    this.emit('regime_updated', { symbol, regimeVector });
  }

  /**
   * Log snapshots for all tracked symbols
   * @private
   */
  async _logSnapshots() {
    if (this.latestRegimeVectors.size === 0) {
      console.log('[RegimeLogger] No regime vectors to log');
      return;
    }

    const timestamp = new Date();
    const snapshots = [];

    for (const [symbol, regimeVector] of this.latestRegimeVectors.entries()) {
      const snapshotData = {
        timestamp,
        symbol,
        regime_state: regimeVector.regime_state,
        trend_state: regimeVector.trend_state,
        vol_state: regimeVector.vol_state,
        market_structure_score: regimeVector.market_structure_score,
        model_recommendation: regimeVector.model_recommendation
      };

      snapshots.push(snapshotData);

      // Insert to database (fire-and-forget)
      this.db.insertRegimeSnapshot(snapshotData).catch(err => {
        console.error(`[RegimeLogger] Failed to insert snapshot for ${symbol}:`, err);
      });
    }

    console.log(`[RegimeLogger] Logged ${snapshots.length} regime snapshots`);
    this.emit('snapshots_logged', { count: snapshots.length, timestamp });
  }

  /**
   * Get current regime vector for a symbol
   */
  getRegimeVector(symbol) {
    return this.latestRegimeVectors.get(symbol);
  }

  /**
   * Get all tracked symbols
   */
  getTrackedSymbols() {
    return Array.from(this.latestRegimeVectors.keys());
  }

  /**
   * Clear regime vector for a symbol
   */
  clearRegimeVector(symbol) {
    const deleted = this.latestRegimeVectors.delete(symbol);
    if (deleted) {
      console.log(`[RegimeLogger] Cleared regime vector for ${symbol}`);
      this.emit('regime_cleared', { symbol });
    }
    return deleted;
  }

  /**
   * Clear all regime vectors
   */
  clearAll() {
    const count = this.latestRegimeVectors.size;
    this.latestRegimeVectors.clear();
    console.log(`[RegimeLogger] Cleared ${count} regime vectors`);
    this.emit('all_cleared', { count });
  }

  /**
   * Get status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      snapshotInterval: this.config.snapshotInterval,
      trackedSymbols: this.getTrackedSymbols(),
      symbolCount: this.latestRegimeVectors.size
    };
  }
}

export default RegimeLogger;
