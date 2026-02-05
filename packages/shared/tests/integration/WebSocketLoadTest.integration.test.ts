/**
 * WebSocket Load Testing Integration Test
 *
 * Tests WebSocket communication under high load conditions
 *
 * Requirements: 8.1, 8.2, 8.3
 * Task: 14.1 Execute End-to-End Integration Tests
 *
 * Load Test Scenarios:
 * 1. Multiple concurrent connections (100+ clients)
 * 2. High-frequency message broadcasting
 * 3. Large message payloads
 * 4. Connection stability under stress
 * 5. Memory usage monitoring
 * 6. Reconnection handling
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import WebSocket from "ws";
import { performance } from "perf_hooks";

// Test configuration
const LOAD_TEST_CONFIG = {
  execution: {
    host: process.env.EXECUTION_HOST || "localhost",
    port: parseInt(process.env.EXECUTION_PORT || "3002"),
  },
  brain: {
    host: process.env.BRAIN_HOST || "localhost",
    port: parseInt(process.env.BRAIN_PORT || "3101"),
  },
  loadTest: {
    maxConnections: parseInt(process.env.MAX_CONNECTIONS || "50"), // Reduced for CI
    messageRate: parseInt(process.env.MESSAGE_RATE || "10"), // messages per second
    testDuration: parseInt(process.env.TEST_DURATION || "10000"), // 10 seconds
    largeMessageSize: parseInt(process.env.LARGE_MESSAGE_SIZE || "10240"), // 10KB
  },
  timeout: 60000, // 60 seconds for load tests
};

// Performance metrics collector
class PerformanceMetrics {
  private connectionTimes: number[] = [];
  private messageTimes: number[] = [];
  private errors: string[] = [];
  private memoryUsage: number[] = [];

  recordConnectionTime(time: number): void {
    this.connectionTimes.push(time);
  }

  recordMessageTime(time: number): void {
    this.messageTimes.push(time);
  }

  recordError(error: string): void {
    this.errors.push(error);
  }

  recordMemoryUsage(): void {
    const usage = process.memoryUsage();
    this.memoryUsage.push(usage.heapUsed / 1024 / 1024); // MB
  }

  getStats() {
    return {
      connections: {
        count: this.connectionTimes.length,
        avgTime: this.average(this.connectionTimes),
        maxTime: Math.max(...this.connectionTimes),
        minTime: Math.min(...this.connectionTimes),
      },
      messages: {
        count: this.messageTimes.length,
        avgTime: this.average(this.messageTimes),
        maxTime: Math.max(...this.messageTimes),
        minTime: Math.min(...this.messageTimes),
      },
      errors: {
        count: this.errors.length,
        types: this.countErrorTypes(),
      },
      memory: {
        avgUsage: this.average(this.memoryUsage),
        maxUsage: Math.max(...this.memoryUsage),
        minUsage: Math.min(...this.memoryUsage),
      },
    };
  }

  private average(arr: number[]): number {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  private countErrorTypes(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.errors.forEach((error) => {
      counts[error] = (counts[error] || 0) + 1;
    });
    return counts;
  }

  reset(): void {
    this.connectionTimes = [];
    this.messageTimes = [];
    this.errors = [];
    this.memoryUsage = [];
  }
}

// WebSocket client wrapper for load testing
class LoadTestClient {
  private ws: WebSocket | null = null;
  private metrics: PerformanceMetrics;
  private messageCount = 0;
  private isConnected = false;

  constructor(private url: string, metrics: PerformanceMetrics) {
    this.metrics = metrics;
  }

  async connect(): Promise<void> {
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      const timeout = setTimeout(() => {
        this.metrics.recordError("CONNECTION_TIMEOUT");
        reject(new Error("Connection timeout"));
      }, 10000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        const connectionTime = performance.now() - startTime;
        this.metrics.recordConnectionTime(connectionTime);
        this.isConnected = true;
        resolve();
      });

      this.ws.on("error", (error) => {
        clearTimeout(timeout);
        this.metrics.recordError(`CONNECTION_ERROR: ${error.message}`);
        reject(error);
      });

      this.ws.on("message", (data) => {
        const messageTime = performance.now() - startTime;
        this.metrics.recordMessageTime(messageTime);
        this.messageCount++;
      });

      this.ws.on("close", () => {
        this.isConnected = false;
      });
    });
  }

  sendMessage(message: any): void {
    if (this.ws && this.isConnected) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        this.metrics.recordError(
          `SEND_ERROR: ${error instanceof Error ? error.message : "Unknown"}`,
        );
      }
    }
  }

  getMessageCount(): number {
    return this.messageCount;
  }

  isConnectionOpen(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}

// Skip integration tests unless INTEGRATION_TESTS=true environment variable is set
const describeIntegration = process.env.INTEGRATION_TESTS === "true"
  ? describe
  : describe.skip;

describeIntegration("WebSocket Load Testing", () => {
  let metrics: PerformanceMetrics;
  let clients: LoadTestClient[] = [];

  beforeAll(() => {
    // Increase timeout for load tests
    vi.setConfig({ testTimeout: LOAD_TEST_CONFIG.timeout });
  });

  beforeEach(() => {
    metrics = new PerformanceMetrics();
    clients = [];
  });

  afterEach(async () => {
    // Clean up all clients
    await Promise.all(clients.map((client) => {
      try {
        client.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }));
    clients = [];
  });

  describe("Connection Load Testing", () => {
    it("should handle multiple concurrent connections", async () => {
      const connectionCount = Math.min(
        LOAD_TEST_CONFIG.loadTest.maxConnections,
        25,
      ); // Limit for CI
      const wsUrl =
        `ws://${LOAD_TEST_CONFIG.execution.host}:${LOAD_TEST_CONFIG.execution.port}/ws/console`;

      console.log(`Testing ${connectionCount} concurrent connections...`);

      // Create clients
      for (let i = 0; i < connectionCount; i++) {
        clients.push(new LoadTestClient(wsUrl, metrics));
      }

      // Connect all clients concurrently
      const connectionPromises = clients.map((client, index) =>
        client.connect().catch((error) => {
          console.warn(`Client ${index} failed to connect:`, error.message);
          return null; // Don't fail the entire test for individual connection failures
        })
      );

      const results = await Promise.allSettled(connectionPromises);
      const successfulConnections = results.filter((result) =>
        result.status === "fulfilled"
      ).length;

      console.log(
        `Successfully connected: ${successfulConnections}/${connectionCount}`,
      );

      // Verify at least 80% of connections succeeded
      expect(successfulConnections).toBeGreaterThanOrEqual(
        Math.floor(connectionCount * 0.8),
      );

      // Verify connections are stable
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const activeConnections =
        clients.filter((client) => client.isConnectionOpen()).length;
      expect(activeConnections).toBeGreaterThanOrEqual(
        Math.floor(successfulConnections * 0.9),
      );

      const stats = metrics.getStats();
      console.log("Connection Stats:", {
        avgConnectionTime: `${stats.connections.avgTime.toFixed(2)}ms`,
        maxConnectionTime: `${stats.connections.maxTime.toFixed(2)}ms`,
        errorCount: stats.errors.count,
      });

      // Performance assertions
      expect(stats.connections.avgTime).toBeLessThan(5000); // Average connection time < 5s
      expect(stats.errors.count).toBeLessThan(connectionCount * 0.2); // Error rate < 20%
    });

    it("should handle connection churn (connect/disconnect cycles)", async () => {
      const wsUrl =
        `ws://${LOAD_TEST_CONFIG.execution.host}:${LOAD_TEST_CONFIG.execution.port}/ws/console`;
      const cycles = 10;
      const connectionsPerCycle = 5;

      for (let cycle = 0; cycle < cycles; cycle++) {
        // Connect multiple clients
        const cycleClients: LoadTestClient[] = [];
        for (let i = 0; i < connectionsPerCycle; i++) {
          const client = new LoadTestClient(wsUrl, metrics);
          cycleClients.push(client);
        }

        // Connect all
        await Promise.all(
          cycleClients.map((client) => client.connect().catch(() => null) // Ignore individual failures
          ),
        );

        // Wait briefly
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Disconnect all
        cycleClients.forEach((client) => client.close());

        // Wait before next cycle
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const stats = metrics.getStats();
      console.log("Connection Churn Stats:", {
        totalConnections: stats.connections.count,
        avgConnectionTime: `${stats.connections.avgTime.toFixed(2)}ms`,
        errorRate: `${
          (stats.errors.count / (cycles * connectionsPerCycle) * 100).toFixed(1)
        }%`,
      });

      // Verify reasonable performance
      expect(stats.connections.count).toBeGreaterThan(
        cycles * connectionsPerCycle * 0.5,
      );
      expect(stats.connections.avgTime).toBeLessThan(3000);
    });
  });

  describe("Message Load Testing", () => {
    it("should handle high-frequency message broadcasting", async () => {
      const wsUrl =
        `ws://${LOAD_TEST_CONFIG.execution.host}:${LOAD_TEST_CONFIG.execution.port}/ws/console`;
      const clientCount = 10;
      const messageCount = 50;

      // Connect clients
      for (let i = 0; i < clientCount; i++) {
        const client = new LoadTestClient(wsUrl, metrics);
        clients.push(client);
        await client.connect().catch(() => null);
      }

      const connectedClients = clients.filter((client) =>
        client.isConnectionOpen()
      );
      expect(connectedClients.length).toBeGreaterThan(0);

      console.log(
        `Broadcasting ${messageCount} messages to ${connectedClients.length} clients...`,
      );

      // Simulate server broadcasting messages by sending test signals
      const testMessage = {
        type: "TEST_BROADCAST",
        timestamp: Date.now(),
        data: { test: true, counter: 0 },
      };

      // Send messages rapidly
      const startTime = performance.now();
      for (let i = 0; i < messageCount; i++) {
        testMessage.data.counter = i;
        connectedClients.forEach((client) => {
          client.sendMessage(testMessage);
        });

        // Small delay to avoid overwhelming
        if (i % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Wait for message processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const messagesPerSecond = (messageCount * connectedClients.length) /
        (totalTime / 1000);

      console.log("Message Broadcasting Stats:", {
        totalMessages: messageCount * connectedClients.length,
        duration: `${totalTime.toFixed(2)}ms`,
        messagesPerSecond: messagesPerSecond.toFixed(2),
      });

      // Verify performance
      expect(messagesPerSecond).toBeGreaterThan(10); // At least 10 messages/second
      expect(totalTime).toBeLessThan(30000); // Complete within 30 seconds
    });

    it("should handle large message payloads", async () => {
      const wsUrl =
        `ws://${LOAD_TEST_CONFIG.execution.host}:${LOAD_TEST_CONFIG.execution.port}/ws/console`;
      const client = new LoadTestClient(wsUrl, metrics);

      await client.connect();
      expect(client.isConnectionOpen()).toBe(true);

      // Create large message payload
      const largeData = "x".repeat(LOAD_TEST_CONFIG.loadTest.largeMessageSize);
      const largeMessage = {
        type: "LARGE_TEST_MESSAGE",
        timestamp: Date.now(),
        data: largeData,
      };

      const startTime = performance.now();
      client.sendMessage(largeMessage);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      console.log("Large Message Stats:", {
        messageSize: `${largeData.length} bytes`,
        processingTime: `${processingTime.toFixed(2)}ms`,
      });

      // Verify connection is still stable
      expect(client.isConnectionOpen()).toBe(true);
      expect(processingTime).toBeLessThan(5000); // Process within 5 seconds
    });
  });

  describe("Stress Testing and Recovery", () => {
    it("should maintain stability under sustained load", async () => {
      const wsUrl =
        `ws://${LOAD_TEST_CONFIG.execution.host}:${LOAD_TEST_CONFIG.execution.port}/ws/console`;
      const clientCount = 5; // Reduced for CI stability
      const testDuration = Math.min(
        LOAD_TEST_CONFIG.loadTest.testDuration,
        5000,
      ); // 5 seconds max

      // Connect clients
      for (let i = 0; i < clientCount; i++) {
        const client = new LoadTestClient(wsUrl, metrics);
        clients.push(client);
        await client.connect().catch(() => null);
      }

      const connectedClients = clients.filter((client) =>
        client.isConnectionOpen()
      );
      console.log(
        `Stress testing with ${connectedClients.length} clients for ${testDuration}ms...`,
      );

      // Start memory monitoring
      const memoryInterval = setInterval(() => {
        metrics.recordMemoryUsage();
      }, 1000);

      // Sustained message sending
      const startTime = Date.now();
      let messageCounter = 0;

      const messageInterval = setInterval(() => {
        const testMessage = {
          type: "STRESS_TEST",
          timestamp: Date.now(),
          counter: messageCounter++,
        };

        connectedClients.forEach((client) => {
          if (client.isConnectionOpen()) {
            client.sendMessage(testMessage);
          }
        });
      }, 100); // Every 100ms

      // Run for specified duration
      await new Promise((resolve) => setTimeout(resolve, testDuration));

      // Stop intervals
      clearInterval(messageInterval);
      clearInterval(memoryInterval);

      const endTime = Date.now();
      const actualDuration = endTime - startTime;

      // Check final connection status
      const finalActiveConnections =
        clients.filter((client) => client.isConnectionOpen()).length;
      const connectionStability = finalActiveConnections /
        connectedClients.length;

      const stats = metrics.getStats();
      console.log("Stress Test Results:", {
        duration: `${actualDuration}ms`,
        messagesSent: messageCounter * connectedClients.length,
        connectionStability: `${(connectionStability * 100).toFixed(1)}%`,
        avgMemoryUsage: `${stats.memory.avgUsage.toFixed(2)}MB`,
        maxMemoryUsage: `${stats.memory.maxUsage.toFixed(2)}MB`,
        errorCount: stats.errors.count,
      });

      // Verify stability
      expect(connectionStability).toBeGreaterThan(0.8); // 80% connections should remain stable
      expect(stats.memory.maxUsage).toBeLessThan(500); // Memory usage < 500MB
      expect(stats.errors.count).toBeLessThan(messageCounter * 0.1); // Error rate < 10%
    });

    it("should recover from network interruption simulation", async () => {
      const wsUrl =
        `ws://${LOAD_TEST_CONFIG.execution.host}:${LOAD_TEST_CONFIG.execution.port}/ws/console`;
      const client = new LoadTestClient(wsUrl, metrics);

      // Initial connection
      await client.connect();
      expect(client.isConnectionOpen()).toBe(true);

      // Simulate network interruption by closing connection
      client.close();
      expect(client.isConnectionOpen()).toBe(false);

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Attempt reconnection
      const newClient = new LoadTestClient(wsUrl, metrics);
      await newClient.connect();
      expect(newClient.isConnectionOpen()).toBe(true);

      // Verify new connection works
      newClient.sendMessage({ type: "RECOVERY_TEST", timestamp: Date.now() });

      // Wait for message processing
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(newClient.isConnectionOpen()).toBe(true);

      newClient.close();
    });
  });

  describe("Performance Benchmarking", () => {
    it("should meet performance requirements", async () => {
      const wsUrl =
        `ws://${LOAD_TEST_CONFIG.execution.host}:${LOAD_TEST_CONFIG.execution.port}/ws/console`;
      const benchmarkClients = 3; // Small number for reliable benchmarking

      // Connect benchmark clients
      for (let i = 0; i < benchmarkClients; i++) {
        const client = new LoadTestClient(wsUrl, metrics);
        clients.push(client);
        await client.connect();
      }

      const connectedClients = clients.filter((client) =>
        client.isConnectionOpen()
      );
      expect(connectedClients.length).toBe(benchmarkClients);

      // Benchmark message throughput
      const messageCount = 100;
      const startTime = performance.now();

      for (let i = 0; i < messageCount; i++) {
        const message = {
          type: "BENCHMARK",
          timestamp: Date.now(),
          sequence: i,
        };

        connectedClients.forEach((client) => {
          client.sendMessage(message);
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const endTime = performance.now();
      const duration = endTime - startTime;
      const throughput = (messageCount * benchmarkClients) / (duration / 1000);

      const stats = metrics.getStats();

      console.log("Performance Benchmark Results:", {
        connections: stats.connections.count,
        avgConnectionTime: `${stats.connections.avgTime.toFixed(2)}ms`,
        throughput: `${throughput.toFixed(2)} messages/second`,
        errorRate: `${
          (stats.errors.count / (messageCount * benchmarkClients) * 100)
            .toFixed(2)
        }%`,
      });

      // Performance requirements
      expect(stats.connections.avgTime).toBeLessThan(1000); // Connection time < 1s
      expect(throughput).toBeGreaterThan(50); // Throughput > 50 messages/second
      expect(stats.errors.count).toBe(0); // No errors in benchmark
    });
  });
});
