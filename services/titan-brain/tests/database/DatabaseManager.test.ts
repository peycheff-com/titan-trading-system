/**
 * Unit tests for DatabaseManager
 */

import { DatabaseManager, DatabaseConfig } from '../../src/database/DatabaseManager';

// Mock pg module
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
  totalCount: 5,
  idleCount: 3,
  waitingCount: 0
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPool)
}));

describe('DatabaseManager', () => {

  const testConfig: DatabaseConfig = {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'test_user',
    password: 'test_password',
    ssl: false,
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    acquireTimeoutMillis: 5000,
    healthCheckIntervalMs: 30000,
    healthCheckTimeoutMs: 5000,
    maxReconnectAttempts: 5,
    reconnectDelayMs: 5000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock implementations
    mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockClient.release.mockResolvedValue(undefined);
    mockPool.connect.mockResolvedValue(mockClient);
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT' });
    mockPool.end.mockResolvedValue(undefined);
  });

  describe('createConfigFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create config from DATABASE_URL', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host:5433/dbname?sslmode=require';
      
      const config = DatabaseManager.createConfigFromEnv();
      
      expect(config.host).toBe('host');
      expect(config.port).toBe(5433);
      expect(config.database).toBe('dbname');
      expect(config.user).toBe('user');
      expect(config.password).toBe('pass');
      expect(config.ssl).toBe(true);
    });

    it('should create config from individual environment variables', () => {
      process.env.DB_HOST = 'test-host';
      process.env.DB_PORT = '5433';
      process.env.DB_NAME = 'test-db';
      process.env.DB_USER = 'test-user';
      process.env.DB_PASSWORD = 'test-pass';
      process.env.DB_SSL = 'true';
      
      const config = DatabaseManager.createConfigFromEnv();
      
      expect(config.host).toBe('test-host');
      expect(config.port).toBe(5433);
      expect(config.database).toBe('test-db');
      expect(config.user).toBe('test-user');
      expect(config.password).toBe('test-pass');
      expect(config.ssl).toBe(true);
    });

    it('should use default values when environment variables are missing', () => {
      const config = DatabaseManager.createConfigFromEnv();
      
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.database).toBe('titan_brain');
      expect(config.user).toBe('postgres');
      expect(config.min).toBe(2);
      expect(config.max).toBe(10);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully with valid configuration', async () => {
      const databaseManager = new DatabaseManager(testConfig);
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      
      await databaseManager.initialize();
      
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockClient.release).toHaveBeenCalled();
      
      await databaseManager.shutdown();
    });

    it('should throw error if already initialized', async () => {
      const databaseManager = new DatabaseManager(testConfig);
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      
      await databaseManager.initialize();
      
      await expect(databaseManager.initialize()).rejects.toThrow('DatabaseManager already initialized');
      
      await databaseManager.shutdown();
    });

    it('should handle connection test failure', async () => {
      const databaseManager = new DatabaseManager(testConfig);
      mockClient.query.mockRejectedValue(new Error('Connection failed'));
      
      await expect(databaseManager.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('query', () => {
    let databaseManager: DatabaseManager;
    
    beforeEach(async () => {
      databaseManager = new DatabaseManager(testConfig);
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      await databaseManager.initialize();
    });

    afterEach(async () => {
      if (databaseManager) {
        await databaseManager.shutdown();
      }
    });

    it('should execute query successfully', async () => {
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        command: 'SELECT'
      };
      mockPool.query.mockResolvedValue(mockResult);
      
      const result = await databaseManager.query('SELECT * FROM test');
      
      expect(result.rows).toEqual(mockResult.rows);
      expect(result.rowCount).toBe(1);
      expect(result.command).toBe('SELECT');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle query parameters', async () => {
      const mockResult = {
        rows: [{ id: 1 }],
        rowCount: 1,
        command: 'SELECT'
      };
      mockPool.query.mockResolvedValue(mockResult);
      
      await databaseManager.query('SELECT * FROM test WHERE id = $1', [1]);
      
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
    });

    it('should throw error when database is not healthy', async () => {
      // Simulate unhealthy database by directly setting the metrics
      const metrics = databaseManager.getMetrics();
      (databaseManager as any).metrics.isHealthy = false;
      
      await expect(databaseManager.query('SELECT 1')).rejects.toThrow('Database is not healthy');
    });

    it('should handle query errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Query failed'));
      
      await expect(databaseManager.query('SELECT * FROM test')).rejects.toThrow('Query failed');
      
      const metrics = databaseManager.getMetrics();
      expect(metrics.failedQueries).toBe(1);
    });
  });

  describe('transaction', () => {
    let databaseManager: DatabaseManager;
    
    beforeEach(async () => {
      databaseManager = new DatabaseManager(testConfig);
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      await databaseManager.initialize();
    });

    afterEach(async () => {
      if (databaseManager) {
        await databaseManager.shutdown();
      }
    });

    it('should execute transaction successfully', async () => {
      const callback = jest.fn().mockResolvedValue('success');
      
      const result = await databaseManager.transaction(callback);
      
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toBe('success');
    });

    it('should rollback transaction on error', async () => {
      const callback = jest.fn().mockRejectedValue(new Error('Transaction failed'));
      
      await expect(databaseManager.transaction(callback)).rejects.toThrow('Transaction failed');
      
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('health monitoring', () => {
    let databaseManager: DatabaseManager;
    
    beforeEach(async () => {
      databaseManager = new DatabaseManager(testConfig);
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      await databaseManager.initialize();
    });

    afterEach(async () => {
      if (databaseManager) {
        await databaseManager.shutdown();
      }
    });

    it('should report healthy status when database is working', () => {
      expect(databaseManager.isHealthy()).toBe(true);
    });

    it('should provide connection pool status', () => {
      const status = databaseManager.getPoolStatus();
      
      expect(status.totalConnections).toBe(5);
      expect(status.idleConnections).toBe(3);
      expect(status.waitingClients).toBe(0);
    });

    it('should provide database metrics', () => {
      const metrics = databaseManager.getMetrics();
      
      expect(metrics.totalConnections).toBe(5);
      expect(metrics.idleConnections).toBe(3);
      expect(metrics.waitingClients).toBe(0);
      expect(metrics.isHealthy).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      const databaseManager = new DatabaseManager(testConfig);
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      await databaseManager.initialize();
      
      await databaseManager.shutdown();
      
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle shutdown when not initialized', async () => {
      const databaseManager = new DatabaseManager(testConfig);
      await expect(databaseManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('event emission', () => {
    it('should emit initialized event', async () => {
      const databaseManager = new DatabaseManager(testConfig);
      const initSpy = jest.fn();
      databaseManager.on('initialized', initSpy);
      
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      await databaseManager.initialize();
      
      expect(initSpy).toHaveBeenCalled();
      
      await databaseManager.shutdown();
    });

    it('should emit query success event', async () => {
      const databaseManager = new DatabaseManager(testConfig);
      const querySpy = jest.fn();
      databaseManager.on('query:success', querySpy);
      
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      await databaseManager.initialize();
      
      const mockResult = {
        rows: [{ id: 1 }],
        rowCount: 1,
        command: 'SELECT'
      };
      mockPool.query.mockResolvedValue(mockResult);
      
      await databaseManager.query('SELECT * FROM test');
      
      expect(querySpy).toHaveBeenCalledWith(expect.objectContaining({
        command: 'SELECT',
        rowCount: 1,
        duration: expect.any(Number)
      }));
      
      await databaseManager.shutdown();
    });

    it('should emit query failure event', async () => {
      const databaseManager = new DatabaseManager(testConfig);
      const queryFailSpy = jest.fn();
      databaseManager.on('query:failure', queryFailSpy);
      
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      await databaseManager.initialize();
      
      mockPool.query.mockRejectedValue(new Error('Query failed'));
      
      await expect(databaseManager.query('SELECT * FROM test')).rejects.toThrow();
      
      expect(queryFailSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Query failed',
        duration: expect.any(Number),
        query: 'SELECT * FROM test'
      }));
      
      await databaseManager.shutdown();
    });
  });
});