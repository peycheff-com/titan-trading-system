/**
 * DatabaseManager.js
 * 
 * SQL Database Layer for Trade Audit Trail and Crash Recovery
 * 
 * Features:
 * - PostgreSQL for production (connection pooling)
 * - SQLite for development/testing
 * - Auto-migration: creates tables if not exist
 * - Fire-and-forget writes with retry queue
 * - Crash recovery: restore Shadow State from database
 * 
 * Requirements: 97.1-97.2
 */

import knex from 'knex';
import { EventEmitter } from 'events';

export class DatabaseManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      type: config.type || process.env.DATABASE_TYPE || 'sqlite',
      url: config.url || process.env.DATABASE_URL,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000, // ms
      // Performance optimization settings
      enableWAL: config.enableWAL !== false, // Enable WAL mode by default
      cacheSize: config.cacheSize || 2000, // 2MB cache
      busyTimeout: config.busyTimeout || 30000, // 30 seconds
      enableQueryOptimization: config.enableQueryOptimization !== false,
      ...config
    };
    
    this.db = null;
    this.retryQueue = [];
    this.isInitialized = false;
    
    // Performance tracking
    this.performanceMetrics = {
      totalQueries: 0,
      slowQueries: 0,
      averageQueryTime: 0,
      cacheHits: 0,
      totalQueryTime: 0
    };
    
    this.queryCache = new Map();
    this.slowQueryThreshold = 1000; // 1 second
  }

  /**
   * Initialize database connection and run migrations
   */
  async initDatabase() {
    try {
      // Create Knex instance based on database type
      if (this.config.type === 'postgres') {
        this.db = knex({
          client: 'pg',
          connection: this.config.url || {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'titan_execution'
          },
          pool: {
            min: 2,
            max: 20, // Increased pool size
            acquireTimeoutMillis: 60000,
            createTimeoutMillis: 30000,
            destroyTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            reapIntervalMillis: 1000,
            createRetryIntervalMillis: 200,
            propagateCreateError: false
          },
          acquireConnectionTimeout: 60000,
          migrations: {
            directory: './migrations',
            tableName: 'knex_migrations',
            extension: 'js',
            loadExtensions: ['.js']
          }
        });
      } else {
        // SQLite for development/testing
        this.db = knex({
          client: 'sqlite3',
          connection: {
            filename: this.config.url || './titan_execution.db'
          },
          useNullAsDefault: true,
          pool: {
            min: 1,
            max: 5,
            acquireTimeoutMillis: 60000,
            createTimeoutMillis: 30000,
            destroyTimeoutMillis: 5000,
            idleTimeoutMillis: 30000
          },
          migrations: {
            directory: './migrations',
            tableName: 'knex_migrations',
            extension: 'js',
            loadExtensions: ['.js']
          }
        });
        
        // Apply SQLite performance optimizations
        await this.optimizeSQLite();
      }

      // Run Knex migrations
      await this.runMigrations();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      console.log(`[DatabaseManager] Initialized ${this.config.type} database`);
      
      return true;
    } catch (error) {
      console.error('[DatabaseManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Run Knex migrations
   * Requirements: 97.1-97.2
   */
  async runMigrations() {
    try {
      const [batchNo, log] = await this.db.migrate.latest();
      
      if (log.length === 0) {
        console.log('[DatabaseManager] Database is already up to date');
      } else {
        console.log(`[DatabaseManager] Ran ${log.length} migrations:`);
        log.forEach(migration => {
          console.log(`  - ${migration}`);
        });
      }
      
      return { batchNo, migrations: log };
    } catch (error) {
      console.error('[DatabaseManager] Migration failed:', error);
      throw error;
    }
  }

  /**
   * Rollback last migration batch
   */
  async rollbackMigrations() {
    try {
      const [batchNo, log] = await this.db.migrate.rollback();
      
      if (log.length === 0) {
        console.log('[DatabaseManager] No migrations to rollback');
      } else {
        console.log(`[DatabaseManager] Rolled back ${log.length} migrations:`);
        log.forEach(migration => {
          console.log(`  - ${migration}`);
        });
      }
      
      return { batchNo, migrations: log };
    } catch (error) {
      console.error('[DatabaseManager] Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus() {
    try {
      const [completed, pending] = await Promise.all([
        this.db.migrate.list(),
        this.db.migrate.list()
      ]);
      
      return {
        completed: completed[0],
        pending: completed[1]
      };
    } catch (error) {
      console.error('[DatabaseManager] Failed to get migration status:', error);
      throw error;
    }
  }

  /**
   * Insert trade record (fire-and-forget with retry)
   */
  async insertTrade(tradeData) {
    const operation = async () => {
      return await this.db('trades').insert({
        signal_id: tradeData.signal_id,
        symbol: tradeData.symbol,
        side: tradeData.side,
        size: tradeData.size,
        entry_price: tradeData.entry_price,
        stop_price: tradeData.stop_price,
        tp_price: tradeData.tp_price,
        fill_price: tradeData.fill_price,
        slippage_pct: tradeData.slippage_pct,
        execution_latency_ms: tradeData.execution_latency_ms,
        regime_state: tradeData.regime_state,
        phase: tradeData.phase,
        timestamp: tradeData.timestamp || new Date()
      });
    };

    return this._executeWithRetry(operation, 'insertTrade', tradeData);
  }

  /**
   * Insert position record
   */
  async insertPosition(positionData) {
    const operation = async () => {
      return await this.db('positions').insert({
        symbol: positionData.symbol,
        side: positionData.side,
        size: positionData.size,
        avg_entry: positionData.avg_entry,
        current_stop: positionData.current_stop,
        current_tp: positionData.current_tp,
        unrealized_pnl: positionData.unrealized_pnl,
        regime_at_entry: positionData.regime_at_entry,
        phase_at_entry: positionData.phase_at_entry,
        opened_at: positionData.opened_at || new Date()
      });
    };

    return this._executeWithRetry(operation, 'insertPosition', positionData);
  }

  /**
   * Update position record
   */
  async updatePosition(symbol, updates) {
    const operation = async () => {
      return await this.db('positions')
        .where({ symbol, closed_at: null })
        .update({
          ...updates,
          updated_at: new Date()
        });
    };

    return this._executeWithRetry(operation, 'updatePosition', { symbol, updates });
  }

  /**
   * Close position record
   */
  async closePosition(symbol, closeData) {
    const operation = async () => {
      return await this.db('positions')
        .where({ symbol, closed_at: null })
        .update({
          closed_at: closeData.closed_at || new Date(),
          close_price: closeData.close_price,
          realized_pnl: closeData.realized_pnl,
          close_reason: closeData.close_reason
        });
    };

    return this._executeWithRetry(operation, 'closePosition', { symbol, closeData });
  }

  /**
   * Insert regime snapshot
   */
  async insertRegimeSnapshot(snapshotData) {
    const operation = async () => {
      return await this.db('regime_snapshots').insert({
        timestamp: snapshotData.timestamp || new Date(),
        symbol: snapshotData.symbol,
        regime_state: snapshotData.regime_state,
        trend_state: snapshotData.trend_state,
        vol_state: snapshotData.vol_state,
        market_structure_score: snapshotData.market_structure_score,
        model_recommendation: snapshotData.model_recommendation
      });
    };

    return this._executeWithRetry(operation, 'insertRegimeSnapshot', snapshotData);
  }

  /**
   * Insert system event
   */
  async insertSystemEvent(eventData) {
    const operation = async () => {
      return await this.db('system_events').insert({
        event_type: eventData.event_type,
        severity: eventData.severity,
        description: eventData.description,
        context_json: JSON.stringify(eventData.context || {}),
        timestamp: eventData.timestamp || new Date()
      });
    };

    return this._executeWithRetry(operation, 'insertSystemEvent', eventData);
  }

  /**
   * Get active positions (for crash recovery)
   */
  async getActivePositions() {
    try {
      return await this.db('positions')
        .where({ closed_at: null })
        .select('*');
    } catch (error) {
      console.error('[DatabaseManager] Failed to get active positions:', error);
      throw error;
    }
  }

  /**
   * Get trade history
   * Requirements: 97.8 - Support filtering by start_date, end_date, symbol, phase
   */
  async getTrades(filters = {}) {
    try {
      let query = this.db('trades');

      if (filters.start_date) {
        query = query.where('timestamp', '>=', filters.start_date);
      }
      if (filters.end_date) {
        query = query.where('timestamp', '<=', filters.end_date);
      }
      if (filters.symbol) {
        query = query.where('symbol', filters.symbol);
      }
      if (filters.phase !== undefined) {
        query = query.where('phase', filters.phase);
      }

      return await query
        .orderBy('timestamp', 'desc')
        .limit(filters.limit || 100);
    } catch (error) {
      console.error('[DatabaseManager] Failed to get trades:', error);
      throw error;
    }
  }

  /**
   * Get position history
   * Requirements: 97.8 - Support pagination with offset
   */
  async getPositions(filters = {}) {
    try {
      let query = this.db('positions');

      if (filters.active_only) {
        query = query.where({ closed_at: null });
      }
      if (filters.symbol) {
        query = query.where('symbol', filters.symbol);
      }

      const limit = filters.limit || 100;
      const offset = filters.offset || 0;

      return await query
        .orderBy('opened_at', 'desc')
        .limit(limit)
        .offset(offset);
    } catch (error) {
      console.error('[DatabaseManager] Failed to get positions:', error);
      throw error;
    }
  }

  /**
   * Get system events with optional filtering
   * Requirements: 97.7
   */
  async getSystemEvents(filters = {}) {
    try {
      let query = this.db('system_events');

      if (filters.event_type) {
        query = query.where('event_type', filters.event_type);
      }

      if (filters.severity) {
        query = query.where('severity', filters.severity);
      }

      if (filters.start_date) {
        query = query.where('timestamp', '>=', filters.start_date);
      }

      if (filters.end_date) {
        query = query.where('timestamp', '<=', filters.end_date);
      }

      const limit = filters.limit || 100;
      query = query.orderBy('timestamp', 'desc').limit(limit);

      return await query;
    } catch (error) {
      console.error('[DatabaseManager] Failed to get system events:', error);
      throw error;
    }
  }

  /**
   * Get performance summary
   */
  async getPerformanceSummary() {
    try {
      const trades = await this.db('trades').select('*');
      const positions = await this.db('positions')
        .whereNotNull('closed_at')
        .select('*');

      const totalTrades = trades.length;
      const closedPositions = positions.length;
      const winningTrades = positions.filter(p => p.realized_pnl > 0).length;
      const losingTrades = positions.filter(p => p.realized_pnl < 0).length;
      const totalPnl = positions.reduce((sum, p) => sum + (parseFloat(p.realized_pnl) || 0), 0);
      const avgPnl = closedPositions > 0 ? totalPnl / closedPositions : 0;
      const winRate = closedPositions > 0 ? (winningTrades / closedPositions) * 100 : 0;

      return {
        total_trades: totalTrades,
        closed_positions: closedPositions,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        win_rate: winRate.toFixed(2),
        total_pnl: totalPnl.toFixed(2),
        avg_pnl: avgPnl.toFixed(2)
      };
    } catch (error) {
      console.error('[DatabaseManager] Failed to get performance summary:', error);
      throw error;
    }
  }

  /**
   * Execute operation with retry logic (fire-and-forget pattern)
   */
  async _executeWithRetry(operation, operationName, data) {
    try {
      await operation();
      return { success: true };
    } catch (error) {
      console.error(`[DatabaseManager] ${operationName} failed:`, error.message);
      
      // Add to retry queue
      this.retryQueue.push({
        operation,
        operationName,
        data,
        attempts: 0,
        maxAttempts: this.config.retryAttempts
      });

      // Process retry queue asynchronously (fire-and-forget)
      this._processRetryQueue().catch(err => {
        console.error('[DatabaseManager] Retry queue processing failed:', err);
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Process retry queue with exponential backoff
   */
  async _processRetryQueue() {
    if (this.retryQueue.length === 0) return;

    const item = this.retryQueue[0];
    
    if (item.attempts >= item.maxAttempts) {
      console.error(`[DatabaseManager] ${item.operationName} failed after ${item.maxAttempts} attempts, dropping`);
      this.retryQueue.shift();
      this.emit('retry_failed', item);
      return;
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = this.config.retryDelay * Math.pow(2, item.attempts);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await item.operation();
      console.log(`[DatabaseManager] ${item.operationName} succeeded on retry ${item.attempts + 1}`);
      this.retryQueue.shift();
      this.emit('retry_success', item);
    } catch (error) {
      console.error(`[DatabaseManager] ${item.operationName} retry ${item.attempts + 1} failed:`, error.message);
      item.attempts++;
      
      // Continue processing queue
      this._processRetryQueue().catch(err => {
        console.error('[DatabaseManager] Retry queue processing failed:', err);
      });
    }
  }

  /**
   * Check if database is connected
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Optimize SQLite performance settings
   */
  async optimizeSQLite() {
    if (this.config.type !== 'sqlite') return;
    
    try {
      // Enable WAL mode for better concurrency
      if (this.config.enableWAL) {
        await this.db.raw('PRAGMA journal_mode = WAL');
      }
      
      // Set cache size (negative value = KB, positive = pages)
      await this.db.raw(`PRAGMA cache_size = -${this.config.cacheSize}`);
      
      // Set busy timeout
      await this.db.raw(`PRAGMA busy_timeout = ${this.config.busyTimeout}`);
      
      // Enable foreign keys
      await this.db.raw('PRAGMA foreign_keys = ON');
      
      // Optimize for speed over safety (use with caution in production)
      await this.db.raw('PRAGMA synchronous = NORMAL');
      await this.db.raw('PRAGMA temp_store = MEMORY');
      
      // Enable query planner optimizations
      if (this.config.enableQueryOptimization) {
        await this.db.raw('PRAGMA optimize');
      }
      
      console.log('[DatabaseManager] SQLite performance optimizations applied');
    } catch (error) {
      console.error('[DatabaseManager] SQLite optimization failed:', error);
    }
  }
  
  /**
   * Create performance indexes
   */
  async createPerformanceIndexes() {
    try {
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)',
        'CREATE INDEX IF NOT EXISTS idx_trades_phase ON trades(phase)',
        'CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol)',
        'CREATE INDEX IF NOT EXISTS idx_positions_opened_at ON positions(opened_at)',
        'CREATE INDEX IF NOT EXISTS idx_positions_closed_at ON positions(closed_at)',
        'CREATE INDEX IF NOT EXISTS idx_system_events_timestamp ON system_events(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type)'
      ];
      
      for (const indexQuery of indexes) {
        await this.db.raw(indexQuery);
      }
      
      console.log('[DatabaseManager] Performance indexes created');
    } catch (error) {
      console.error('[DatabaseManager] Index creation failed:', error);
    }
  }
  
  /**
   * Get database performance statistics
   */
  async getPerformanceStats() {
    const stats = {
      ...this.performanceMetrics,
      cacheHitRate: this.performanceMetrics.totalQueries > 0 
        ? (this.performanceMetrics.cacheHits / this.performanceMetrics.totalQueries) * 100 
        : 0
    };
    
    if (this.config.type === 'sqlite') {
      try {
        // Get SQLite-specific stats
        const pragmaStats = await Promise.all([
          this.db.raw('PRAGMA cache_size'),
          this.db.raw('PRAGMA page_count'),
          this.db.raw('PRAGMA freelist_count'),
          this.db.raw('PRAGMA journal_mode')
        ]);
        
        stats.sqlite = {
          cacheSize: pragmaStats[0][0]?.cache_size,
          pageCount: pragmaStats[1][0]?.page_count,
          freelistCount: pragmaStats[2][0]?.freelist_count,
          journalMode: pragmaStats[3][0]?.journal_mode
        };
      } catch (error) {
        console.error('[DatabaseManager] Failed to get SQLite stats:', error);
      }
    }
    
    return stats;
  }
  
  /**
   * Execute query with performance tracking
   */
  async _executeWithPerformanceTracking(operation, operationName, data) {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      // Update performance metrics
      this.performanceMetrics.totalQueries++;
      this.performanceMetrics.totalQueryTime += duration;
      this.performanceMetrics.averageQueryTime = 
        this.performanceMetrics.totalQueryTime / this.performanceMetrics.totalQueries;
      
      // Track slow queries
      if (duration > this.slowQueryThreshold) {
        this.performanceMetrics.slowQueries++;
        console.warn(`[DatabaseManager] Slow query detected: ${operationName} took ${duration}ms`);
      }
      
      return { success: true, result, duration };
    } catch (error) {
      console.error(`[DatabaseManager] ${operationName} failed:`, error.message);
      
      // Add to retry queue
      this.retryQueue.push({
        operation,
        operationName,
        data,
        attempts: 0,
        maxAttempts: this.config.retryAttempts
      });

      // Process retry queue asynchronously
      this._processRetryQueue().catch(err => {
        console.error('[DatabaseManager] Retry queue processing failed:', err);
      });

      return { success: false, error: error.message };
    }
  }
  
  /**
   * Vacuum database to reclaim space and optimize
   */
  async vacuumDatabase() {
    if (this.config.type === 'sqlite') {
      try {
        await this.db.raw('VACUUM');
        console.log('[DatabaseManager] Database vacuum completed');
      } catch (error) {
        console.error('[DatabaseManager] Database vacuum failed:', error);
      }
    }
  }
  
  /**
   * Analyze database for query optimization
   */
  async analyzeDatabase() {
    try {
      if (this.config.type === 'sqlite') {
        await this.db.raw('ANALYZE');
      } else {
        await this.db.raw('ANALYZE');
      }
      console.log('[DatabaseManager] Database analysis completed');
    } catch (error) {
      console.error('[DatabaseManager] Database analysis failed:', error);
    }
  }
  
  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      await this.db.destroy();
      this.isInitialized = false;
      console.log('[DatabaseManager] Database connection closed');
    }
  }
}

export default DatabaseManager;
