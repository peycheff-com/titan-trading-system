/**
 * DatabaseManager - Reliable database connection pooling with health monitoring
 *
 * Provides robust database connectivity with connection pooling, health monitoring,
 * automatic reconnection, and comprehensive error handling for Railway deployment.
 *
 * Requirements: 3.1.1, 3.1.2, 3.1.3, 3.1.4, 3.1.5
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { EventEmitter } from 'events';

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | object;

  // Connection pool settings
  min: number;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  acquireTimeoutMillis: number;

  // Health check settings
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
}

/**
 * Database connection metrics
 */
export interface DatabaseMetrics {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageQueryTime: number;
  connectionErrors: number;
  lastHealthCheck: number;
  isHealthy: boolean;
}

/**
 * Query execution result with timing
 */
export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  duration: number;
  command: string;
}

/**
 * Database connection pool manager with health monitoring
 */
export class DatabaseManager extends EventEmitter {
  private pool: Pool | null = null;
  private config: DatabaseConfig;
  private metrics: DatabaseMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private isShuttingDown: boolean = false;
  private queryHistory: number[] = []; // Query times for average calculation

  constructor(config: DatabaseConfig) {
    super();
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize metrics object
   */
  private initializeMetrics(): DatabaseMetrics {
    return {
      totalConnections: 0,
      idleConnections: 0,
      waitingClients: 0,
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageQueryTime: 0,
      connectionErrors: 0,
      lastHealthCheck: 0,
      isHealthy: false,
    };
  }

  /**
   * Create database configuration from environment variables
   */
  static createConfigFromEnv(): DatabaseConfig {
    // Parse Railway DATABASE_URL if available
    const databaseUrl = process.env.DATABASE_URL;
    let parsedConfig: Partial<DatabaseConfig> = {};

    if (databaseUrl) {
      try {
        const url = new URL(databaseUrl);
        parsedConfig = {
          host: url.hostname,
          port: parseInt(url.port) || 5432,
          database: url.pathname.slice(1), // Remove leading slash
          user: url.username,
          password: url.password,
          ssl: url.searchParams.get('sslmode') !== 'disable',
        };
      } catch (error) {
        console.warn('Failed to parse DATABASE_URL, falling back to individual env vars');
      }
    }

    return {
      host: parsedConfig.host || process.env.DB_HOST || 'localhost',
      port: parsedConfig.port || parseInt(process.env.DB_PORT || '5432'),
      database: parsedConfig.database || process.env.DB_NAME || 'titan_brain',
      user: parsedConfig.user || process.env.DB_USER || 'postgres',
      password: parsedConfig.password || process.env.DB_PASSWORD || '',
      ssl: parsedConfig.ssl !== undefined ? parsedConfig.ssl : process.env.DB_SSL === 'true',

      // Connection pool settings
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
      acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '5000'),

      // Health check settings
      healthCheckIntervalMs: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '30000'),
      healthCheckTimeoutMs: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT || '5000'),
      maxReconnectAttempts: parseInt(process.env.DB_MAX_RECONNECT_ATTEMPTS || '5'),
      reconnectDelayMs: parseInt(process.env.DB_RECONNECT_DELAY || '5000'),
    };
  }

  /**
   * Initialize database connection pool
   */
  async initialize(): Promise<void> {
    if (this.pool) {
      throw new Error('DatabaseManager already initialized');
    }

    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl,
      min: this.config.min,
      max: this.config.max,
      idleTimeoutMillis: this.config.idleTimeoutMillis,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis,
    };

    this.pool = new Pool(poolConfig);

    // Set up pool event listeners
    this.setupPoolEventListeners();

    // Test initial connection
    await this.testConnection();

    // Start health check monitoring
    this.startHealthCheckMonitoring();

    this.emit('initialized');
  }

  /**
   * Set up pool event listeners for monitoring
   */
  private setupPoolEventListeners(): void {
    if (!this.pool) return;

    this.pool.on('connect', (client) => {
      this.metrics.totalConnections++;
      this.emit('connection:established', { totalConnections: this.metrics.totalConnections });
    });

    this.pool.on('acquire', (client) => {
      this.updatePoolMetrics();
    });

    this.pool.on('release', (client) => {
      this.updatePoolMetrics();
    });

    this.pool.on('remove', (client) => {
      this.metrics.totalConnections--;
      this.emit('connection:removed', { totalConnections: this.metrics.totalConnections });
    });

    this.pool.on('error', (error, client) => {
      this.metrics.connectionErrors++;
      this.metrics.isHealthy = false;
      this.emit('connection:error', {
        error: error.message,
        connectionErrors: this.metrics.connectionErrors,
      });

      // Attempt reconnection if not shutting down
      if (!this.isShuttingDown) {
        this.attemptReconnection();
      }
    });
  }

  /**
   * Update pool metrics from current pool state
   */
  private updatePoolMetrics(): void {
    if (!this.pool) return;

    this.metrics.totalConnections = this.pool.totalCount;
    this.metrics.idleConnections = this.pool.idleCount;
    this.metrics.waitingClients = this.pool.waitingCount;
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    if (!this.pool) {
      throw new Error('Pool not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      this.metrics.isHealthy = true;
      this.reconnectAttempts = 0; // Reset on successful connection
    } finally {
      client.release();
    }
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheckMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    if (this.isShuttingDown) return;

    const startTime = Date.now();

    try {
      await Promise.race([
        this.testConnection(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Health check timeout')),
            this.config.healthCheckTimeoutMs,
          ),
        ),
      ]);

      this.metrics.lastHealthCheck = Date.now();
      this.metrics.isHealthy = true;
      this.emit('health:check:success', { duration: Date.now() - startTime });
    } catch (error) {
      this.metrics.lastHealthCheck = Date.now();
      this.metrics.isHealthy = false;
      this.emit('health:check:failure', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      });

      // Attempt reconnection on health check failure
      this.attemptReconnection();
    }
  }

  /**
   * Attempt database reconnection with exponential backoff
   */
  private async attemptReconnection(): Promise<void> {
    if (this.isShuttingDown || this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);

    this.emit('reconnection:attempt', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
      delay,
    });

    setTimeout(async () => {
      try {
        await this.testConnection();
        this.emit('reconnection:success', { attempts: this.reconnectAttempts });
        this.reconnectAttempts = 0;
      } catch (error) {
        this.emit('reconnection:failure', {
          attempt: this.reconnectAttempts,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Continue attempting if we haven't reached max attempts
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.attemptReconnection();
        } else {
          this.emit('reconnection:exhausted', { maxAttempts: this.config.maxReconnectAttempts });
        }
      }
    }, delay);
  }

  /**
   * Execute a query with timing and error handling
   */
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('DatabaseManager not initialized');
    }

    if (!this.metrics.isHealthy) {
      throw new Error('Database is not healthy');
    }

    const startTime = Date.now();
    this.metrics.totalQueries++;

    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - startTime;

      // Update metrics
      this.metrics.successfulQueries++;
      this.updateQueryTimeMetrics(duration);

      this.emit('query:success', {
        command: result.command,
        rowCount: result.rowCount,
        duration,
      });

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        duration,
        command: result.command || 'UNKNOWN',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.failedQueries++;

      this.emit('query:failure', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
        query: text.substring(0, 100), // Log first 100 chars for debugging
      });

      throw error;
    }
  }

  /**
   * Execute a query with a specific client (for transactions)
   */
  async queryWithClient<T = any>(
    client: PoolClient,
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    this.metrics.totalQueries++;

    try {
      const result = await client.query(text, params);
      const duration = Date.now() - startTime;

      // Update metrics
      this.metrics.successfulQueries++;
      this.updateQueryTimeMetrics(duration);

      this.emit('query:success', {
        command: result.command,
        rowCount: result.rowCount,
        duration,
      });

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        duration,
        command: result.command || 'UNKNOWN',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.failedQueries++;

      this.emit('query:failure', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
        query: text.substring(0, 100),
      });

      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('DatabaseManager not initialized');
    }

    if (!this.metrics.isHealthy) {
      throw new Error('Database is not healthy');
    }

    return await this.pool.connect();
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');

      this.emit('transaction:success');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.emit('transaction:rollback', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update query time metrics
   */
  private updateQueryTimeMetrics(duration: number): void {
    this.queryHistory.push(duration);

    // Keep only last 100 queries for average calculation
    if (this.queryHistory.length > 100) {
      this.queryHistory.shift();
    }

    // Calculate average query time
    this.metrics.averageQueryTime =
      this.queryHistory.reduce((sum, time) => sum + time, 0) / this.queryHistory.length;
  }

  /**
   * Get current database metrics
   */
  getMetrics(): DatabaseMetrics {
    this.updatePoolMetrics();
    return { ...this.metrics };
  }

  /**
   * Check if database is healthy
   */
  isHealthy(): boolean {
    return this.metrics.isHealthy && this.pool !== null;
  }

  /**
   * Get connection pool status
   */
  getPoolStatus(): {
    totalConnections: number;
    idleConnections: number;
    waitingClients: number;
    isHealthy: boolean;
  } {
    this.updatePoolMetrics();
    return {
      totalConnections: this.metrics.totalConnections,
      idleConnections: this.metrics.idleConnections,
      waitingClients: this.metrics.waitingClients,
      isHealthy: this.metrics.isHealthy,
    };
  }

  /**
   * Gracefully shutdown the database manager
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Stop health check monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Close connection pool
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }

    this.emit('shutdown');
  }
}
