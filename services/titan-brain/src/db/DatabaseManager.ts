/**
 * Database Manager for Titan Brain
 * Handles PostgreSQL connection pooling, query execution, and transactions
 * 
 * Requirements: 9.1, 9.2, 9.3
 */

import { Pool, PoolConfig, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseConfig } from '../types/index.js';

/**
 * Query cache entry
 */
interface QueryCacheEntry {
  result: QueryResult<any>;
  timestamp: number;
  ttl: number;
}

/**
 * Connection pool statistics
 */
interface PoolStatistics {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  activeQueries: number;
  averageQueryTime: number;
  slowQueries: number;
  cacheHitRate: number;
}

/**
 * Database error with additional context
 */
export class DatabaseError extends Error {
  public readonly code: string;
  public readonly query?: string;
  public readonly originalError: Error;

  constructor(message: string, code: string, originalError: Error, query?: string) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.query = query;
    this.originalError = originalError;
  }
}

/**
 * Query metrics for monitoring
 */
export interface QueryMetrics {
  totalQueries: number;
  failedQueries: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

export class DatabaseManager {
  private pool: Pool | null = null;
  private config: DatabaseConfig;
  private metrics: QueryMetrics = {
    totalQueries: 0,
    failedQueries: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
  };
  private connectionRetries = 0;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;
  
  // Performance optimization features
  private queryCache = new Map<string, QueryCacheEntry>();
  private slowQueryThreshold = 1000; // 1 second
  private slowQueries: Array<{ query: string; duration: number; timestamp: number }> = [];
  private preparedStatements = new Map<string, string>();
  private connectionPoolStats = {
    totalQueries: 0,
    cacheHits: 0,
    slowQueries: 0
  };

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize the database connection pool
   */
  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      max: this.config.maxConnections || 20,
      min: Math.max(2, Math.floor((this.config.maxConnections || 20) / 4)), // 25% of max as minimum
      idleTimeoutMillis: this.config.idleTimeout || 30000,
      connectionTimeoutMillis: 10000,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      // Performance optimizations
      statement_timeout: 30000, // 30 seconds
      query_timeout: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });

    // Test connection with retry logic
    await this.testConnection();
  }

  /**
   * Test database connection with retry logic
   */
  private async testConnection(): Promise<void> {
    while (this.connectionRetries < this.maxRetries) {
      try {
        const client = await this.pool!.connect();
        client.release();
        this.connectionRetries = 0;
        return;
      } catch (error) {
        this.connectionRetries++;
        if (this.connectionRetries >= this.maxRetries) {
          throw new DatabaseError(
            `Failed to connect to database after ${this.maxRetries} attempts`,
            'CONNECTION_FAILED',
            error as Error
          );
        }
        await this.delay(this.retryDelayMs * this.connectionRetries);
      }
    }
  }

  /**
   * Close the database connection pool
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  /**
   * Execute a query with metrics tracking and caching
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
    options: { cache?: boolean; cacheTtl?: number } = {}
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', new Error('Pool is null'));
    }

    const startTime = Date.now();
    this.metrics.totalQueries++;
    this.connectionPoolStats.totalQueries++;

    // Check cache if enabled
    if (options.cache) {
      const cacheKey = this.generateCacheKey(text, params);
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        this.connectionPoolStats.cacheHits++;
        return cached;
      }
    }

    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - startTime;
      
      this.updateMetrics(duration);
      
      // Track slow queries
      if (duration > this.slowQueryThreshold) {
        this.trackSlowQuery(text, duration);
      }
      
      // Cache result if enabled
      if (options.cache) {
        const cacheKey = this.generateCacheKey(text, params);
        this.cacheResult(cacheKey, result, options.cacheTtl || 300000); // 5 minutes default
      }
      
      return result;
    } catch (error) {
      this.metrics.failedQueries++;
      throw new DatabaseError(
        `Query failed: ${(error as Error).message}`,
        'QUERY_FAILED',
        error as Error,
        text
      );
    }
  }
  
  /**
   * Execute a prepared statement
   */
  async queryPrepared<T extends QueryResultRow = QueryResultRow>(
    name: string,
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', new Error('Pool is null'));
    }

    const client = await this.pool.connect();
    
    try {
      // Prepare statement if not already prepared
      if (!this.preparedStatements.has(name)) {
        await client.query(`PREPARE ${name} AS ${text}`);
        this.preparedStatements.set(name, text);
      }
      
      const startTime = Date.now();
      const result = await client.query<T>(`EXECUTE ${name}`, params);
      const duration = Date.now() - startTime;
      
      this.updateMetrics(duration);
      
      if (duration > this.slowQueryThreshold) {
        this.trackSlowQuery(`PREPARED: ${name}`, duration);
      }
      
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a query and return the first row or null
   */
  async queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] || null;
  }

  /**
   * Execute a query and return all rows
   */
  async queryAll<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<T[]> {
    const result = await this.query<T>(text, params);
    return result.rows;
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', new Error('Pool is null'));
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new DatabaseError(
        `Transaction failed: ${(error as Error).message}`,
        'TRANSACTION_FAILED',
        error as Error
      );
    } finally {
      client.release();
    }
  }

  /**
   * Execute an INSERT and return the inserted row
   */
  async insert<T extends QueryResultRow = QueryResultRow>(
    table: string,
    data: Record<string, unknown>,
    returning: string = '*'
  ): Promise<T> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING ${returning}
    `;
    
    const result = await this.query<T>(query, values);
    return result.rows[0];
  }

  /**
   * Execute an UPDATE and return affected rows count
   */
  async update(
    table: string,
    data: Record<string, unknown>,
    where: string,
    whereParams: unknown[]
  ): Promise<number> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
    
    // Adjust where clause parameter indices
    const adjustedWhere = where.replace(/\$(\d+)/g, (_, num) => 
      `$${parseInt(num) + columns.length}`
    );
    
    const query = `
      UPDATE ${table}
      SET ${setClause}
      WHERE ${adjustedWhere}
    `;
    
    const result = await this.query(query, [...values, ...whereParams]);
    return result.rowCount || 0;
  }

  /**
   * Get the connection pool
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', new Error('Pool is null'));
    }
    return this.pool;
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this.pool !== null;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get query metrics
   */
  getMetrics(): QueryMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset query metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalQueries: 0,
      failedQueries: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
    };
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): PoolStatistics {
    if (!this.pool) {
      return {
        totalConnections: 0,
        idleConnections: 0,
        waitingClients: 0,
        activeQueries: 0,
        averageQueryTime: 0,
        slowQueries: this.slowQueries.length,
        cacheHitRate: 0
      };
    }
    
    const cacheHitRate = this.connectionPoolStats.totalQueries > 0 
      ? (this.connectionPoolStats.cacheHits / this.connectionPoolStats.totalQueries) * 100 
      : 0;
    
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingClients: this.pool.waitingCount,
      activeQueries: this.pool.totalCount - this.pool.idleCount,
      averageQueryTime: this.metrics.avgDurationMs,
      slowQueries: this.slowQueries.length,
      cacheHitRate
    };
  }
  
  /**
   * Generate cache key for query
   */
  private generateCacheKey(text: string, params?: unknown[]): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${text}:${paramStr}`;
  }
  
  /**
   * Get result from cache
   */
  private getFromCache<T extends QueryResultRow>(key: string): QueryResult<T> | null {
    const entry = this.queryCache.get(key);
    if (!entry) {
      return null;
    }
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.queryCache.delete(key);
      return null;
    }
    
    return entry.result as QueryResult<T>;
  }
  
  /**
   * Cache query result
   */
  private cacheResult<T extends QueryResultRow>(key: string, result: QueryResult<T>, ttl: number): void {
    // Limit cache size
    if (this.queryCache.size > 1000) {
      const oldestKey = this.queryCache.keys().next().value;
      this.queryCache.delete(oldestKey);
    }
    
    this.queryCache.set(key, {
      result,
      timestamp: Date.now(),
      ttl
    });
  }
  
  /**
   * Track slow query
   */
  private trackSlowQuery(query: string, duration: number): void {
    this.connectionPoolStats.slowQueries++;
    
    this.slowQueries.push({
      query: query.substring(0, 200), // Truncate long queries
      duration,
      timestamp: Date.now()
    });
    
    // Keep only last 100 slow queries
    if (this.slowQueries.length > 100) {
      this.slowQueries = this.slowQueries.slice(-100);
    }
    
    console.warn(`🐌 Slow query detected (${duration}ms): ${query.substring(0, 100)}...`);
  }
  
  /**
   * Get slow queries
   */
  getSlowQueries(): Array<{ query: string; duration: number; timestamp: number }> {
    return [...this.slowQueries];
  }
  
  /**
   * Clear query cache
   */
  clearCache(): void {
    this.queryCache.clear();
    console.log('🧹 Query cache cleared');
  }
  
  /**
   * Optimize database performance
   */
  async optimizeDatabase(): Promise<void> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', new Error('Pool is null'));
    }
    
    try {
      // Run ANALYZE to update table statistics
      await this.pool.query('ANALYZE');
      
      // Run VACUUM to reclaim space (non-blocking)
      await this.pool.query('VACUUM (ANALYZE)');
      
      console.log('✅ Database optimization completed');
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
      throw new DatabaseError(
        'Database optimization failed',
        'OPTIMIZATION_FAILED',
        error as Error
      );
    }
  }
  
  /**
   * Create database indexes for performance
   */
  async createPerformanceIndexes(): Promise<void> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED', new Error('Pool is null'));
    }
    
    const indexes = [
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_decisions_timestamp ON brain_decisions(timestamp)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_decisions_phase_id ON brain_decisions(phase_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_performance_phase_timestamp ON phase_performance(phase_id, timestamp)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_snapshots_timestamp ON risk_snapshots(timestamp)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_allocation_vectors_timestamp ON allocation_vectors(timestamp)'
    ];
    
    for (const indexQuery of indexes) {
      try {
        await this.pool.query(indexQuery);
        console.log(`✅ Created index: ${indexQuery.split(' ')[5]}`);
      } catch (error) {
        // Index might already exist, log but don't fail
        console.warn(`⚠️ Index creation warning: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Update query metrics
   */
  private updateMetrics(durationMs: number): void {
    this.metrics.totalDurationMs += durationMs;
    this.metrics.avgDurationMs = this.metrics.totalDurationMs / this.metrics.totalQueries;
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
