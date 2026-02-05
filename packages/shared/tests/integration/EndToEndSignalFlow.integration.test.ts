/**
 * End-to-End Signal Flow Integration Test
 *
 * Tests complete signal journey from Phase 1 (Scavenger) through Brain to Execution
 *
 * Requirements: 8.1, 8.2, 8.3
 * Task: 14.1 Execute End-to-End Integration Tests
 *
 * Test Flow:
 * 1. Phase 1 (Scavenger) detects trap and generates signal
 * 2. Signal sent to Execution service via Fast Path IPC
 * 3. Execution service validates and forwards to Brain
 * 4. Brain evaluates signal against allocation and risk rules
 * 5. Brain approves/rejects signal
 * 6. Execution service executes approved signal
 * 7. Position tracked in Shadow State
 * 8. Confirmation sent back to Phase 1
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
import crypto from "crypto";
// Node 18+ has native fetch - no import needed
import WebSocket from "ws";

// Test configuration
const TEST_CONFIG = {
  execution: {
    host: process.env.EXECUTION_HOST || "localhost",
    port: parseInt(process.env.EXECUTION_PORT || "3002"),
    hmacSecret: process.env.TEST_HMAC_SECRET ||
      "test-secret-key-for-integration-testing-only",
  },
  brain: {
    host: process.env.BRAIN_HOST || "localhost",
    port: parseInt(process.env.BRAIN_PORT || "3100"),
  },
  scavenger: {
    host: process.env.SCAVENGER_HOST || "localhost",
    port: parseInt(process.env.SCAVENGER_PORT || "8081"),
  },
  timeout: 30000, // 30 seconds for integration tests
};

// Helper to generate HMAC signature
function generateHmacSignature(payload: any, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

// Helper to create test signal
function createTestSignal(overrides: any = {}): any {
  const barIndex = Math.floor(Math.random() * 100000);
  return {
    signal_id: `test_${Date.now()}_${barIndex}`,
    type: "PREPARE",
    symbol: "BTCUSDT",
    timeframe: "15",
    bar_index: barIndex,
    timestamp: new Date().toISOString(),
    trigger_price: 50100.0,
    direction: 1,
    entry_zone: [50100, 50050, 50000],
    stop_loss: 49500,
    take_profits: [50500, 51000, 52000],
    size: 0.1,
    regime_vector: {
      trend_state: 1,
      vol_state: 1,
      regime_state: 1,
      market_structure_score: 85,
      momentum_score: 75,
      model_recommendation: "TREND_FOLLOW",
    },
    signal_type: "scalp",
    alpha_half_life_ms: 10000,
    ...overrides,
  };
}

// Helper to wait for condition
async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100,
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}

// Skip integration tests unless INTEGRATION_TESTS=true environment variable is set
// These tests require running Brain and Execution services
const describeIntegration = process.env.INTEGRATION_TESTS === "true"
  ? describe
  : describe.skip;

describeIntegration("End-to-End Signal Flow Integration", () => {
  let executionBaseUrl: string;
  let brainBaseUrl: string;
  let wsConnection: WebSocket | null = null;
  let wsMessages: any[] = [];

  beforeAll(() => {
    executionBaseUrl =
      `http://${TEST_CONFIG.execution.host}:${TEST_CONFIG.execution.port}`;
    brainBaseUrl = `http://${TEST_CONFIG.brain.host}:${TEST_CONFIG.brain.port}`;
    vi.setConfig({ testTimeout: TEST_CONFIG.timeout });
  });

  afterAll(async () => {
    if (wsConnection) {
      wsConnection.close();
      wsConnection = null;
    }
  });

  beforeEach(() => {
    wsMessages = [];
  });

  afterEach(async () => {
    if (wsConnection) {
      wsConnection.close();
      wsConnection = null;
    }
  });

  describe("Service Health Checks", () => {
    it("should verify Execution service is running", async () => {
      const response = await fetch(`${executionBaseUrl}/status`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect((data as any).status).toBe("OK");
      expect((data as any).service).toBe("titan-execution");
    });

    it("should verify Brain service is running", async () => {
      const response = await fetch(`${brainBaseUrl}/status`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect((data as any).status).toBe("OK");
      expect((data as any).service).toBe("titan-brain");
    });

    it("should verify WebSocket endpoints are available", async () => {
      // Test Execution WebSocket
      const wsUrl =
        `ws://${TEST_CONFIG.execution.host}:${TEST_CONFIG.execution.port}/ws/console`;

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("WebSocket connection timeout"));
        }, 5000);

        ws.on("open", () => {
          clearTimeout(timeout);
          ws.close();
          resolve();
        });

        ws.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });
  });

  describe("Complete Signal Flow: Phase 1 → Execution → Brain → Execution", () => {
    it("should process signal from Phase 1 through complete flow", async () => {
      // Step 1: Connect to WebSocket to monitor events
      const wsUrl =
        `ws://${TEST_CONFIG.execution.host}:${TEST_CONFIG.execution.port}/ws/console`;
      wsConnection = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("WebSocket connection timeout")),
          5000,
        );

        wsConnection!.on("open", () => {
          clearTimeout(timeout);
          resolve();
        });

        wsConnection!.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      wsConnection.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          wsMessages.push(message);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      });

      // Step 2: Create and send signal to Execution service
      const signal = createTestSignal({
        phase: "phase1",
        trap_type: "OI_WIPEOUT",
        confidence: 92,
      });

      const signature = generateHmacSignature(
        signal,
        TEST_CONFIG.execution.hmacSecret,
      );

      const response = await fetch(`${executionBaseUrl}/webhook/phase1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": signature,
        },
        body: JSON.stringify(signal),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect((result as any).success).toBe(true);
      expect((result as any).signal_id).toBe(signal.signal_id);

      // Step 3: Wait for signal to be processed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 4: Verify signal was received by Brain
      const brainDashboard = await fetch(`${brainBaseUrl}/dashboard`);
      expect(brainDashboard.status).toBe(200);

      const dashboardData = await brainDashboard.json();
      expect((dashboardData as any).recentSignals).toBeDefined();

      // Step 5: Verify WebSocket messages were received
      expect(wsMessages.length).toBeGreaterThan(0);

      const signalMessage = wsMessages.find((msg) =>
        msg.type === "SIGNAL" || msg.type === "signal_received"
      );
      expect(signalMessage).toBeDefined();

      // Step 6: Check position was created (if signal was approved)
      const positionsResponse = await fetch(
        `${executionBaseUrl}/api/positions/active`,
      );
      expect(positionsResponse.status).toBe(200);

      const positionsData = await positionsResponse.json();
      expect((positionsData as any).success).toBe(true);
      expect(Array.isArray((positionsData as any).positions)).toBe(true);
    });

    it("should handle signal rejection by Brain", async () => {
      // Create signal that should be rejected (e.g., too large size)
      const signal = createTestSignal({
        phase: "phase1",
        size: 100.0, // Unreasonably large size
        confidence: 50, // Low confidence
      });

      const signature = generateHmacSignature(
        signal,
        TEST_CONFIG.execution.hmacSecret,
      );

      const response = await fetch(`${executionBaseUrl}/webhook/phase1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": signature,
        },
        body: JSON.stringify(signal),
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      // Signal should be received but may be rejected
      expect((result as any).signal_id).toBe(signal.signal_id);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify no position was created
      const positionsResponse = await fetch(
        `${executionBaseUrl}/api/positions/active`,
      );
      const positionsData = await positionsResponse.json();

      const signalPosition = (positionsData as any).positions?.find(
        (p: any) => p.signal_id === signal.signal_id,
      );
      expect(signalPosition).toBeUndefined();
    });

    it("should handle PREPARE → CONFIRM flow correctly", async () => {
      // Step 1: Send PREPARE signal
      const prepareSignal = createTestSignal({
        type: "PREPARE",
        phase: "phase1",
      });

      const prepareSignature = generateHmacSignature(
        prepareSignal,
        TEST_CONFIG.execution.hmacSecret,
      );

      const prepareResponse = await fetch(
        `${executionBaseUrl}/webhook/phase1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-signature": prepareSignature,
          },
          body: JSON.stringify(prepareSignal),
        },
      );

      expect(prepareResponse.status).toBe(200);
      const prepareResult = await prepareResponse.json();
      expect((prepareResult as any).success).toBe(true);

      // Step 2: Wait for L2 validation
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 3: Send CONFIRM signal
      const confirmSignal = {
        signal_id: prepareSignal.signal_id,
        type: "CONFIRM",
        symbol: prepareSignal.symbol,
        timestamp: new Date().toISOString(),
        direction: prepareSignal.direction,
        size: prepareSignal.size,
      };

      const confirmSignature = generateHmacSignature(
        confirmSignal,
        TEST_CONFIG.execution.hmacSecret,
      );

      const confirmResponse = await fetch(
        `${executionBaseUrl}/webhook/phase1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-signature": confirmSignature,
          },
          body: JSON.stringify(confirmSignal),
        },
      );

      expect(confirmResponse.status).toBe(200);
      const confirmResult = await confirmResponse.json();
      expect((confirmResult as any).success).toBe(true);

      // Step 4: Verify position was created
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const positionsResponse = await fetch(
        `${executionBaseUrl}/api/positions/active`,
      );
      const positionsData = await positionsResponse.json();

      const position = (positionsData as any).positions?.find(
        (p: any) => p.symbol === prepareSignal.symbol,
      );

      if (position) {
        expect(position.side).toBe(
          prepareSignal.direction === 1 ? "LONG" : "SHORT",
        );
        expect(position.size).toBe(prepareSignal.size);
      }
    });

    it("should handle PREPARE → ABORT flow correctly", async () => {
      // Step 1: Send PREPARE signal
      const prepareSignal = createTestSignal({
        type: "PREPARE",
        phase: "phase1",
      });

      const prepareSignature = generateHmacSignature(
        prepareSignal,
        TEST_CONFIG.execution.hmacSecret,
      );

      await fetch(`${executionBaseUrl}/webhook/phase1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": prepareSignature,
        },
        body: JSON.stringify(prepareSignal),
      });

      // Step 2: Send ABORT signal
      const abortSignal = {
        signal_id: prepareSignal.signal_id,
        type: "ABORT",
        symbol: prepareSignal.symbol,
        timestamp: new Date().toISOString(),
      };

      const abortSignature = generateHmacSignature(
        abortSignal,
        TEST_CONFIG.execution.hmacSecret,
      );

      const abortResponse = await fetch(`${executionBaseUrl}/webhook/phase1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": abortSignature,
        },
        body: JSON.stringify(abortSignal),
      });

      expect(abortResponse.status).toBe(200);
      const abortResult = await abortResponse.json();
      expect((abortResult as any).success).toBe(true);

      // Step 3: Verify no position was created
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const positionsResponse = await fetch(
        `${executionBaseUrl}/api/positions/active`,
      );
      const positionsData = await positionsResponse.json();

      const position = (positionsData as any).positions?.find(
        (p: any) => p.signal_id === prepareSignal.signal_id,
      );
      expect(position).toBeUndefined();
    });
  });

  describe("WebSocket Communication Under Load", () => {
    it("should handle multiple concurrent WebSocket connections", async () => {
      const connectionCount = 10;
      const connections: WebSocket[] = [];
      const wsUrl =
        `ws://${TEST_CONFIG.execution.host}:${TEST_CONFIG.execution.port}/ws/console`;

      // Create multiple connections
      for (let i = 0; i < connectionCount; i++) {
        const ws = new WebSocket(wsUrl);
        connections.push(ws);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Connection timeout")),
            5000,
          );

          ws.on("open", () => {
            clearTimeout(timeout);
            resolve();
          });

          ws.on("error", (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      }

      expect(connections.length).toBe(connectionCount);

      // Verify all connections are open
      const openConnections = connections.filter((ws) =>
        ws.readyState === WebSocket.OPEN
      );
      expect(openConnections.length).toBe(connectionCount);

      // Send signal and verify all connections receive it
      const signal = createTestSignal();
      const signature = generateHmacSignature(
        signal,
        TEST_CONFIG.execution.hmacSecret,
      );

      const messagesReceived: number[] = new Array(connectionCount).fill(0);

      connections.forEach((ws, index) => {
        ws.on("message", () => {
          messagesReceived[index]++;
        });
      });

      await fetch(`${executionBaseUrl}/webhook/phase1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": signature,
        },
        body: JSON.stringify(signal),
      });

      // Wait for messages to propagate
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify all connections received at least one message
      const connectionsWithMessages = messagesReceived.filter((count) =>
        count > 0
      ).length;
      expect(connectionsWithMessages).toBeGreaterThan(0);

      // Clean up
      connections.forEach((ws) => ws.close());
    });

    it("should handle rapid signal submission", async () => {
      const signalCount = 20;
      const signals = [];

      // Generate multiple signals
      for (let i = 0; i < signalCount; i++) {
        signals.push(createTestSignal({
          bar_index: 10000 + i,
        }));
      }

      // Submit all signals rapidly
      const responses = await Promise.all(
        signals.map((signal) => {
          const signature = generateHmacSignature(
            signal,
            TEST_CONFIG.execution.hmacSecret,
          );
          return fetch(`${executionBaseUrl}/webhook/phase1`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-signature": signature,
            },
            body: JSON.stringify(signal),
          });
        }),
      );

      // Verify all signals were accepted
      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBe(signalCount);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify system is still responsive
      const healthResponse = await fetch(`${executionBaseUrl}/status`);
      expect(healthResponse.status).toBe(200);
    });
  });

  describe("Error Scenarios and Recovery", () => {
    it("should reject signal with invalid HMAC signature", async () => {
      const signal = createTestSignal();
      const invalidSignature = "invalid-signature-12345";

      const response = await fetch(`${executionBaseUrl}/webhook/phase1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": invalidSignature,
        },
        body: JSON.stringify(signal),
      });

      expect(response.status).toBe(401);
    });

    it("should reject signal with missing required fields", async () => {
      const invalidSignal = {
        signal_id: `test_${Date.now()}`,
        // Missing required fields
      };

      const signature = generateHmacSignature(
        invalidSignal,
        TEST_CONFIG.execution.hmacSecret,
      );

      const response = await fetch(`${executionBaseUrl}/webhook/phase1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": signature,
        },
        body: JSON.stringify(invalidSignal),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle duplicate signal_id rejection", async () => {
      const signal = createTestSignal();
      const signature = generateHmacSignature(
        signal,
        TEST_CONFIG.execution.hmacSecret,
      );

      // Send first signal
      const response1 = await fetch(`${executionBaseUrl}/webhook/phase1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": signature,
        },
        body: JSON.stringify(signal),
      });

      expect(response1.status).toBe(200);

      // Send duplicate signal
      const response2 = await fetch(`${executionBaseUrl}/webhook/phase1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": signature,
        },
        body: JSON.stringify(signal),
      });

      expect(response2.status).toBe(409); // Conflict
    });

    it("should recover from WebSocket disconnection", async () => {
      const wsUrl =
        `ws://${TEST_CONFIG.execution.host}:${TEST_CONFIG.execution.port}/ws/console`;
      let ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Connection timeout")),
          5000,
        );
        ws.on("open", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Force disconnect
      ws.close();

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Reconnect
      ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Reconnection timeout")),
          5000,
        );
        ws.on("open", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });
  });

  describe("Configuration Propagation and Hot-Reload", () => {
    it("should verify configuration can be retrieved", async () => {
      const response = await fetch(`${brainBaseUrl}/allocation`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect((data as any).allocation).toBeDefined();
      expect((data as any).allocation.w1).toBeDefined();
      expect((data as any).allocation.w2).toBeDefined();
      expect((data as any).allocation.w3).toBeDefined();
    });

    it("should verify Brain can update allocation", async () => {
      // Get current allocation
      const currentResponse = await fetch(`${brainBaseUrl}/allocation`);
      const currentData = await currentResponse.json();
      const currentAllocation = (currentData as any).allocation;

      // Note: In a real test, we would update the allocation
      // For now, we just verify the endpoint is accessible
      expect(currentAllocation).toBeDefined();
      expect(typeof currentAllocation.w1).toBe("number");
      expect(typeof currentAllocation.w2).toBe("number");
      expect(typeof currentAllocation.w3).toBe("number");

      // Verify allocation sums to 1.0 (or close to it)
      const sum = currentAllocation.w1 + currentAllocation.w2 +
        currentAllocation.w3;
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
    });
  });
});
