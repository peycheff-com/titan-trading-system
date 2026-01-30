/**
 * FastPathClient Unit Tests
 *
 * Tests for enhanced IPC client with automatic reconnection and error handling
 */

import { ConnectionState, FastPathClient, IntentSignal } from "@titan/shared";
import * as net from "net";
import { EventEmitter } from "events";

// Mock net module
jest.mock("net");
const mockNet = net as jest.Mocked<typeof net>;

// Mock socket
class MockSocket extends EventEmitter {
  write = jest.fn().mockReturnValue(true);
  end = jest.fn();
  destroy = jest.fn();
}

describe("FastPathClient", () => {
  let client: FastPathClient;
  let mockSocket: MockSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket = new MockSocket();
    jest.spyOn(mockSocket, "removeAllListeners");
    mockNet.connect.mockReturnValue(mockSocket as any);

    client = new FastPathClient({
      socketPath: "/tmp/test-ipc.sock",
      hmacSecret: "test-secret",
      maxReconnectAttempts: 3,
      baseReconnectDelay: 100,
      connectionTimeout: 1000,
      messageTimeout: 500,
    });
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
  });

  describe("Connection Management", () => {
    it("should connect successfully", async () => {
      const connectPromise = client.connect();

      // Simulate successful connection
      setTimeout(() => mockSocket.emit("connect"), 10);

      await expect(connectPromise).resolves.toBeUndefined();
      expect(client.getConnectionState()).toBe(ConnectionState.CONNECTED);
    });

    it("should handle connection timeout", async () => {
      // Create a separate client with very short timeout for this test
      const timeoutClient = new FastPathClient({
        socketPath: "/tmp/test-ipc.sock",
        hmacSecret: "test-secret",
        maxReconnectAttempts: 0, // Setting to 0 means immediate maxReconnectAttemptsReached
        connectionTimeout: 50, // Very short timeout
        messageTimeout: 500,
      });

      // Register error listener to prevent 'unhandled error' warning
      timeoutClient.on("error", () => {
        /* expected */
      });

      const timeoutMockSocket = new MockSocket();
      mockNet.connect.mockReturnValue(
        timeoutMockSocket as unknown as net.Socket,
      );

      // Don't emit 'connect' - let it timeout
      const connectPromise = timeoutClient.connect();

      await expect(connectPromise).rejects.toThrow("IPC connection timeout");
      expect(timeoutClient.getConnectionState()).toBe(ConnectionState.FAILED);

      // Cleanup
      await timeoutClient.disconnect();
    }, 1000);

    it("should handle connection errors", async () => {
      // Create a separate client for this test
      // Note: maxReconnectAttempts: 0 doesn't work due to || defaulting in FastPathClient
      // So we use a very short baseReconnectDelay and just clean up via disconnect()
      const errorClient = new FastPathClient({
        socketPath: "/tmp/test-ipc.sock",
        hmacSecret: "test-secret",
        maxReconnectAttempts: 1,
        baseReconnectDelay: 10,
        connectionTimeout: 1000,
        messageTimeout: 500,
      });

      // Register error listener to prevent 'unhandled error' warning
      errorClient.on("error", () => {
        /* expected */
      });

      const errorMockSocket = new MockSocket();
      mockNet.connect.mockReturnValue(errorMockSocket as unknown as net.Socket);

      const connectPromise = errorClient.connect();

      // Emit error after handlers are set up
      setImmediate(() => {
        errorMockSocket.emit("error", new Error("Connection refused"));
      });

      // Verify the promise rejects with the error
      await expect(connectPromise).rejects.toThrow("Connection refused");

      // Cleanup immediately - this stops any scheduled reconnection timers
      await errorClient.disconnect();

      // After disconnect, state should be DISCONNECTED
      expect(errorClient.getConnectionState()).toBe(
        ConnectionState.DISCONNECTED,
      );
    });

    it("should attempt automatic reconnection on connection loss", async () => {
      // Create client with very short reconnect delay
      const reconnectClient = new FastPathClient({
        socketPath: "/tmp/test-ipc.sock",
        hmacSecret: "test-secret",
        maxReconnectAttempts: 1,
        baseReconnectDelay: 10, // Very short delay
        connectionTimeout: 1000,
        messageTimeout: 500,
      });

      // Register error listener to prevent 'unhandled error' warning
      reconnectClient.on("error", () => {
        /* expected during reconnection */
      });

      const reconnectMockSocket = new MockSocket();
      mockNet.connect.mockReturnValue(
        reconnectMockSocket as unknown as net.Socket,
      );

      let reconnectingEventFired = false;
      let reconnectAttemptNumber = 0;

      reconnectClient.on("reconnecting", (attempt: number) => {
        reconnectingEventFired = true;
        reconnectAttemptNumber = attempt;
      });

      // First connect
      const connectPromise = reconnectClient.connect();
      setImmediate(() => reconnectMockSocket.emit("connect"));
      await connectPromise;

      expect(reconnectClient.getConnectionState()).toBe(
        ConnectionState.CONNECTED,
      );

      // Simulate connection loss
      reconnectMockSocket.emit("close");

      // Wait for reconnection event to fire (short delay + some buffer)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify reconnection was attempted
      expect(reconnectingEventFired).toBe(true);
      expect(reconnectAttemptNumber).toBe(1);

      // Cleanup - this will cancel any pending reconnection timers
      await reconnectClient.disconnect();
    });

    it("should stop reconnecting after max attempts", async () => {
      // Create client with minimal retries and very short delays
      const maxAttemptsClient = new FastPathClient({
        socketPath: "/tmp/test-ipc.sock",
        hmacSecret: "test-secret",
        maxReconnectAttempts: 2,
        baseReconnectDelay: 10, // Very short delay
        connectionTimeout: 50,
        messageTimeout: 500,
      });

      // Register error listener to prevent 'unhandled error' warning
      maxAttemptsClient.on("error", () => {
        /* expected during reconnection attempts */
      });

      let maxReconnectReached = false;
      maxAttemptsClient.on("maxReconnectAttemptsReached", () => {
        maxReconnectReached = true;
      });

      // Create mock socket that always fails
      mockNet.connect.mockImplementation(() => {
        const socket = new MockSocket();
        // Emit error after a brief delay to simulate connection failure
        setImmediate(() =>
          socket.emit("error", new Error("Connection failed"))
        );
        return socket as unknown as net.Socket;
      });

      // Start connection - will fail and trigger reconnection attempts
      const connectPromise = maxAttemptsClient.connect();

      // Wait for initial failure
      await expect(connectPromise).rejects.toThrow("Connection failed");

      // Wait for all reconnection attempts to exhaust (2 attempts * ~10ms delay + buffer)
      // Each attempt: 10ms base delay * 2^(attempt-1) + some processing time
      // Attempt 1: 10ms, Attempt 2: 20ms = 30ms total + buffer
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify max attempts reached
      expect(maxReconnectReached).toBe(true);
      expect(maxAttemptsClient.getConnectionState()).toBe(
        ConnectionState.FAILED,
      );

      // Cleanup
      await maxAttemptsClient.disconnect();
    }, 2000);

    it("should disconnect gracefully", async () => {
      // Connect first
      const connectPromise = client.connect();
      setTimeout(() => mockSocket.emit("connect"), 10);
      await connectPromise;

      // Disconnect
      const disconnectPromise = client.disconnect();
      setTimeout(() => mockSocket.emit("close"), 10);

      await disconnectPromise;
      expect(client.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
      expect(mockSocket.end).toHaveBeenCalled();
    });
  });

  describe("Message Handling", () => {
    beforeEach(async () => {
      // Connect before each test
      const connectPromise = client.connect();
      setTimeout(() => mockSocket.emit("connect"), 10);
      await connectPromise;
    });

    it("should send PREPARE signal successfully", async () => {
      const signal: IntentSignal = {
        signal_id: "test-signal-1",
        source: "scavenger",
        symbol: "BTCUSDT",
        direction: "LONG",
        entry_zone: { min: 50000, max: 50100 },
        stop_loss: 49000,
        take_profits: [51000, 52000],
        confidence: 95,
        leverage: 20,
        timestamp: Date.now(),
      };

      const sendPromise = client.sendPrepare(signal);

      // Simulate response
      setTimeout(() => {
        const calls = mockSocket.write.mock.calls;
        const lastCall = calls[calls.length - 1];
        const message = JSON.parse(lastCall[0]);

        const response = {
          correlationId: message.correlationId,
          prepared: true,
          signal_id: signal.signal_id,
          position_size: 0.1,
        };

        mockSocket.emit("data", Buffer.from(JSON.stringify(response) + "\n"));
      }, 10);

      const result = await sendPromise;
      expect(result.prepared).toBe(true);
      expect(result.signal_id).toBe(signal.signal_id);
    });

    it("should send CONFIRM signal successfully", async () => {
      const sendPromise = client.sendConfirm("test-signal-1");

      // Simulate response
      setTimeout(() => {
        const calls = mockSocket.write.mock.calls;
        const lastCall = calls[calls.length - 1];
        const message = JSON.parse(lastCall[0]);

        const response = {
          correlationId: message.correlationId,
          executed: true,
          fill_price: 50050,
        };

        mockSocket.emit("data", Buffer.from(JSON.stringify(response) + "\n"));
      }, 10);

      const result = await sendPromise;
      expect(result.executed).toBe(true);
      expect(result.fill_price).toBe(50050);
    });

    it("should send ABORT signal successfully", async () => {
      const sendPromise = client.sendAbort("test-signal-1");

      // Simulate response
      setTimeout(() => {
        const calls = mockSocket.write.mock.calls;
        const lastCall = calls[calls.length - 1];
        const message = JSON.parse(lastCall[0]);

        const response = {
          correlationId: message.correlationId,
          aborted: true,
        };

        mockSocket.emit("data", Buffer.from(JSON.stringify(response) + "\n"));
      }, 10);

      const result = await sendPromise;
      expect(result.aborted).toBe(true);
    });

    it("should handle message timeout", async () => {
      const sendPromise = client.sendPrepare({
        signal_id: "test-signal-timeout",
        source: "scavenger",
        symbol: "BTCUSDT",
        direction: "LONG",
        entry_zone: { min: 50000, max: 50100 },
        stop_loss: 49000,
        take_profits: [51000],
        confidence: 95,
        leverage: 20,
        timestamp: Date.now(),
      });

      // Don't send response to simulate timeout
      // The promise will reject after messageTimeout (500ms in test config)
      await expect(sendPromise).rejects.toThrow("IPC_TIMEOUT");
    }, 1000); // Increase test timeout

    it("should handle multiple concurrent messages", async () => {
      const signal1: IntentSignal = {
        signal_id: "signal-1",
        source: "scavenger",
        symbol: "BTCUSDT",
        direction: "LONG",
        entry_zone: { min: 50000, max: 50100 },
        stop_loss: 49000,
        take_profits: [51000],
        confidence: 95,
        leverage: 20,
        timestamp: Date.now(),
      };

      const signal2: IntentSignal = {
        signal_id: "signal-2",
        source: "scavenger",
        symbol: "ETHUSDT",
        direction: "SHORT",
        entry_zone: { min: 3000, max: 3010 },
        stop_loss: 3100,
        take_profits: [2900],
        confidence: 90,
        leverage: 15,
        timestamp: Date.now(),
      };

      const promise1 = client.sendPrepare(signal1);
      const promise2 = client.sendPrepare(signal2);

      // Simulate responses for both messages
      setTimeout(() => {
        const calls = mockSocket.write.mock.calls;

        // Response for first message
        const message1 = JSON.parse(calls[0][0]);
        const response1 = {
          correlationId: message1.correlationId,
          prepared: true,
          signal_id: signal1.signal_id,
        };
        mockSocket.emit("data", Buffer.from(JSON.stringify(response1) + "\n"));

        // Response for second message
        const message2 = JSON.parse(calls[1][0]);
        const response2 = {
          correlationId: message2.correlationId,
          prepared: true,
          signal_id: signal2.signal_id,
        };
        mockSocket.emit("data", Buffer.from(JSON.stringify(response2) + "\n"));
      }, 10);

      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1.signal_id).toBe(signal1.signal_id);
      expect(result2.signal_id).toBe(signal2.signal_id);
    });
  });

  describe("HMAC Signature", () => {
    it("should generate consistent signatures", () => {
      const signal = {
        signal_id: "test",
        signal_type: "PREPARE",
        timestamp: 1234567890,
      };

      // Access private method through any cast for testing
      const signature1 = (client as any).sign(signal);
      const signature2 = (client as any).sign(signal);

      expect(signature1).toBe(signature2);
      expect(signature1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex string
    });

    it("should normalize objects for consistent signing", () => {
      const signal1 = { b: 2, a: 1, c: undefined };
      const signal2 = { a: 1, b: 2 };

      const signature1 = (client as any).sign(signal1);
      const signature2 = (client as any).sign(signal2);

      expect(signature1).toBe(signature2); // Should be same after normalization
    });
  });

  describe("Metrics and Status", () => {
    beforeEach(async () => {
      // Connect before each test
      const connectPromise = client.connect();
      setTimeout(() => mockSocket.emit("connect"), 10);
      await connectPromise;
    });

    it("should track message metrics", async () => {
      const signal: IntentSignal = {
        signal_id: "metrics-test",
        source: "scavenger",
        symbol: "BTCUSDT",
        direction: "LONG",
        entry_zone: { min: 50000, max: 50100 },
        stop_loss: 49000,
        take_profits: [51000],
        confidence: 95,
        leverage: 20,
        timestamp: Date.now(),
      };

      const sendPromise = client.sendPrepare(signal);

      // Simulate response
      setTimeout(() => {
        const calls = mockSocket.write.mock.calls;
        const message = JSON.parse(calls[0][0]);
        const response = {
          correlationId: message.correlationId,
          prepared: true,
          timestamp: message.timestamp,
        };
        mockSocket.emit("data", Buffer.from(JSON.stringify(response) + "\n"));
      }, 10);

      await sendPromise;

      const metrics = client.getMetrics();
      expect(metrics.messagesSent).toBe(1);
      expect(metrics.messagesReceived).toBe(1);
      expect(metrics.messagesFailed).toBe(0);
    });

    it("should return comprehensive status", () => {
      const status = client.getStatus();

      expect(status.connectionState).toBe(ConnectionState.CONNECTED);
      expect(status.socketPath).toBe("/tmp/test-ipc.sock");
      expect(status.pendingMessages).toBe(0);
      expect(status.metrics).toBeDefined();
    });

    it("should reset metrics", () => {
      client.resetMetrics();

      const metrics = client.getMetrics();
      expect(metrics.messagesSent).toBe(0);
      expect(metrics.messagesReceived).toBe(0);
      expect(metrics.totalLatencyMs).toBe(0);
    });
  });

  describe("Ping Functionality", () => {
    beforeEach(async () => {
      // Connect before each test
      const connectPromise = client.connect();
      setTimeout(() => mockSocket.emit("connect"), 10);
      await connectPromise;
    });

    it("should ping successfully", async () => {
      const pingPromise = client.ping();

      // Simulate ping response
      setTimeout(() => {
        const calls = mockSocket.write.mock.calls;
        const message = JSON.parse(calls[0][0]);
        const response = {
          correlationId: message.correlationId,
          pong: true,
        };
        mockSocket.emit("data", Buffer.from(JSON.stringify(response) + "\n"));
      }, 10);

      const result = await pingPromise;
      expect(result.success).toBe(true);
      expect(result.latency).toBeGreaterThan(0);
    });

    it("should handle ping failure when not connected", async () => {
      await client.disconnect();

      const result = await client.ping();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Not connected");
    });
  });

  describe("Force Reconnection", () => {
    it("should force reconnection successfully", async () => {
      // Initial connection
      const connectPromise = client.connect();
      setTimeout(() => mockSocket.emit("connect"), 10);
      await connectPromise;

      expect(client.getConnectionState()).toBe(ConnectionState.CONNECTED);

      // Force reconnection
      const reconnectPromise = client.forceReconnect();

      // Simulate disconnect and reconnect
      setTimeout(() => {
        mockSocket.emit("close");
        // Create new mock socket for reconnection
        const newMockSocket = new MockSocket();
        mockNet.connect.mockReturnValue(newMockSocket as any);
        setTimeout(() => newMockSocket.emit("connect"), 10);
      }, 10);

      await reconnectPromise;
      expect(client.getConnectionState()).toBe(ConnectionState.CONNECTED);
    });
  });
});
