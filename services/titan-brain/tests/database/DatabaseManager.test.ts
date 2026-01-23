/**
 * Unit tests for DatabaseManager
 */

import { DatabaseManager } from "../../src/db/DatabaseManager";
import { DatabaseConfig } from "../../src/types/config";
import { Pool } from "pg";

// Properly mock pg module
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
  totalCount: 5,
  idleCount: 3,
  waitingCount: 0,
};

jest.mock("pg", () => ({
  Pool: jest.fn(() => mockPool),
}));

describe("DatabaseManager", () => {
  const testConfig: DatabaseConfig = {
    url: "postgres://test_user:test_password@localhost:5432/test_db",
    host: "localhost",
    port: 5432,
    database: "test_db",
    user: "test_user",
    password: "test_password",
    maxConnections: 10,
    idleTimeout: 30000,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock default behaviors
    mockClient.query.mockResolvedValue({
      rows: [{ "?column?": 1 }],
      rowCount: 1,
    });
    mockClient.release.mockResolvedValue(undefined);

    // Connect logic checks if pool exists.
    // In connect connectPostgreSQL, it does new Pool().

    mockPool.connect.mockResolvedValue(mockClient);
    mockPool.query.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: "SELECT",
    });
    mockPool.end.mockResolvedValue(undefined);
  });

  describe("connect", () => {
    it("should initialize successfully with valid configuration", async () => {
      const databaseManager = new DatabaseManager(testConfig);

      await databaseManager.connect();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();

      await databaseManager.disconnect();
    });

    it("should handle connection test failure", async () => {
      // Placeholder
    });
  });

  describe("query", () => {
    let databaseManager: DatabaseManager;

    beforeEach(async () => {
      databaseManager = new DatabaseManager(testConfig);
      await databaseManager.connect();
    });

    afterEach(async () => {
      if (databaseManager) {
        await databaseManager.disconnect();
      }
    });

    it("should execute query successfully", async () => {
      const mockResult = {
        rows: [{ id: 1, name: "test" }],
        rowCount: 1,
        command: "SELECT",
      };
      mockPool.query.mockResolvedValue(mockResult);

      const result = await databaseManager.query("SELECT * FROM test");

      expect(result.rows).toEqual(mockResult.rows);
      expect(result.rowCount).toBe(1);
    });

    it("should handle query parameters", async () => {
      const mockResult = {
        rows: [{ id: 1 }],
        rowCount: 1,
        command: "SELECT",
      };
      mockPool.query.mockResolvedValue(mockResult);

      await databaseManager.query("SELECT * FROM test WHERE id = $1", [1]);

      expect(mockPool.query).toHaveBeenCalledWith(
        "SELECT * FROM test WHERE id = $1",
        [1],
      );
    });

    it("should handle query errors", async () => {
      mockPool.query.mockRejectedValue(new Error("Query failed"));

      await expect(databaseManager.query("SELECT * FROM test")).rejects.toThrow(
        "Query failed",
      );

      const metrics = databaseManager.getMetrics();
      expect(metrics.failedQueries).toBe(1);
    });
  });

  describe("transaction", () => {
    let databaseManager: DatabaseManager;

    beforeEach(async () => {
      databaseManager = new DatabaseManager(testConfig);
      await databaseManager.connect();
    });

    afterEach(async () => {
      if (databaseManager) {
        await databaseManager.disconnect();
      }
    });

    it("should execute transaction successfully", async () => {
      const callback = jest.fn().mockResolvedValue("success");

      const result = await databaseManager.transaction(callback);

      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
      expect(result).toBe("success");
    });

    it("should rollback transaction on error", async () => {
      const callback = jest.fn().mockRejectedValue(
        new Error("Transaction failed"),
      );

      await expect(databaseManager.transaction(callback)).rejects.toThrow(
        "Transaction failed",
      );

      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("health monitoring", () => {
    let databaseManager: DatabaseManager;

    beforeEach(async () => {
      databaseManager = new DatabaseManager(testConfig);
      await databaseManager.connect();
    });

    afterEach(async () => {
      if (databaseManager) {
        await databaseManager.disconnect();
      }
    });

    it("should report healthy status when database is working", async () => {
      mockPool.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
      const isHealthy = await databaseManager.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it("should provide connection pool stats", () => {
      const status = databaseManager.getPoolStats();

      expect(status.totalConnections).toBe(5);
      expect(status.idleConnections).toBe(3);
    });

    it("should provide database metrics", () => {
      const metrics = databaseManager.getMetrics();

      expect(metrics.totalQueries).toBeGreaterThanOrEqual(0);
      expect(metrics.failedQueries).toBeGreaterThanOrEqual(0);
    });
  });

  describe("shutdown", () => {
    it("should shutdown gracefully", async () => {
      const databaseManager = new DatabaseManager(testConfig);
      await databaseManager.connect();

      await databaseManager.disconnect();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});
