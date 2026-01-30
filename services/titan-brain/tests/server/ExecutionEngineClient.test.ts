/**
 * ExecutionEngineClient Unit Tests
 *
 * Tests for NATS-based communication with Execution Engine
 */

import { ExecutionEngineClient } from "../../src/server/ExecutionEngineClient";
import { IntentSignal } from "../../src/types";

const mockPublish = jest.fn().mockResolvedValue(undefined);
const mockPublishEnvelope = jest.fn().mockResolvedValue(undefined);
const mockIsConnected = jest.fn().mockReturnValue(true);
const mockRequest = jest.fn().mockResolvedValue({ data: {} });

jest.mock("@titan/shared", () => ({
  getNatsClient: jest.fn(() => ({
    publish: mockPublish,
    publishEnvelope: mockPublishEnvelope,
    isConnected: mockIsConnected,
    request: mockRequest,
  })),
  TitanSubject: {
    CMD_EXEC_PLACE: "titan.cmd.exec.place.v1",
    CMD_RISK_POLICY: "titan.cmd.risk.policy.v1",
    POSITION_QUERY: "titan.query.positions.v1",
    EQUITY_QUERY: "titan.query.equity.v1",
    BALANCE_QUERY: "titan.query.balance.v1",
    DLQ: "titan.dlq.v1",
  },
  validateIntentPayload: jest.fn(() => ({ valid: true, errors: [] })),
}));

describe("ExecutionEngineClient", () => {
  let client: ExecutionEngineClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected.mockReturnValue(true);
    client = new ExecutionEngineClient({});
  });

  describe("constructor", () => {
    it("should create client with default config", () => {
      expect(client).toBeDefined();
    });

    it("should create client with custom config", () => {
      const customClient = new ExecutionEngineClient({
        timeout: 200,
      });
      expect(customClient).toBeDefined();
    });
  });

  describe("isConnected", () => {
    it("should return true when NATS is connected", () => {
      mockIsConnected.mockReturnValue(true);
      const connected = client.isConnected();
      expect(connected).toBe(true);
    });

    it("should return false when NATS is disconnected", () => {
      mockIsConnected.mockReturnValue(false);
      const connected = client.isConnected();
      expect(connected).toBe(false);
    });
  });

  describe("forwardSignal", () => {
    it("should include required fields on forwardSignal", async () => {
      const signal: IntentSignal = {
        signalId: "sig-1",
        phaseId: "phase1",
        symbol: "BTCUSDT",
        side: "BUY",
        requestedSize: 1000,
        timestamp: 1700000000000,
        entryPrice: 42000,
        stopLossPrice: 41000,
      };

      (signal as { takeProfits?: number[] }).takeProfits = [43000, 44000];

      await client.forwardSignal(signal, 1234);

      expect(mockPublishEnvelope).toHaveBeenCalledTimes(1);
      const [subject, payload] = mockPublishEnvelope.mock.calls[0];

      expect(subject).toBe("titan.cmd.exec.place.v1.auto.main.BTCUSDT");
      expect(payload.t_signal).toBe(signal.timestamp);
      expect(payload.type).toBe("BUY_SETUP");
      expect(payload.direction).toBe(1);
      expect(payload.status).toBe("VALIDATED");
      expect(payload.entry_zone).toEqual([signal.entryPrice]);
      expect(payload.stop_loss).toBe(signal.stopLossPrice);
      expect(payload.take_profits).toEqual([43000, 44000]);
    });

    it("should handle SELL signals correctly", async () => {
      const signal: IntentSignal = {
        signalId: "sig-2",
        phaseId: "phase1",
        symbol: "ETHUSDT",
        side: "SELL",
        requestedSize: 500,
        timestamp: 1700000000000,
        entryPrice: 2000,
        stopLossPrice: 2100,
      };

      await client.forwardSignal(signal, 500);

      expect(mockPublishEnvelope).toHaveBeenCalledTimes(1);
      const [subject, payload] = mockPublishEnvelope.mock.calls[0];

      expect(subject).toBe("titan.cmd.exec.place.v1.auto.main.ETHUSDT");
      expect(payload.direction).toBe(-1);
      expect(payload.type).toBe("SELL_SETUP");
    });

    it("should handle phase2 signal source mapping", async () => {
      const signal: IntentSignal = {
        signalId: "sig-3",
        phaseId: "phase2",
        symbol: "BTCUSDT",
        side: "BUY",
        requestedSize: 1000,
        timestamp: 1700000000000,
        entryPrice: 42000,
        stopLossPrice: 41000,
      };

      await client.forwardSignal(signal, 1000);

      expect(mockPublishEnvelope).toHaveBeenCalled();
      const [subject] = mockPublishEnvelope.mock.calls[0];
      expect(subject).toContain("titan.cmd.exec.place");
    });
  });

  describe("closeAllPositions", () => {
    it("should include t_signal and required fields on emergency publish", async () => {
      await client.closeAllPositions();

      expect(mockPublishEnvelope).toHaveBeenCalledTimes(1);
      const [subject, payload] = mockPublishEnvelope.mock.calls[0];

      expect(subject).toBe("titan.cmd.exec.place.v1.auto.main.ALL");
      expect(payload.t_signal).toEqual(expect.any(Number));
      expect(payload.type).toBe("CLOSE");
      expect(payload.direction).toBe(0);
      expect(payload.entry_zone).toEqual([]);
      expect(payload.stop_loss).toBe(0);
      expect(payload.take_profits).toEqual([]);
    });
  });

  describe("publishRiskPolicy", () => {
    it("should publish risk policy updates", async () => {
      const policy = {
        maxPositionSize: 10000,
        maxDrawdown: 0.1,
        leverageCap: 10,
      };

      await client.publishRiskPolicy(policy);

      expect(mockPublishEnvelope).toHaveBeenCalled();
    });
  });

  describe("healthCheck", () => {
    it("should return true when connected", async () => {
      mockIsConnected.mockReturnValue(true);
      const result = await client.healthCheck();
      expect(result).toBe(true);
    });

    it("should return false when disconnected", async () => {
      mockIsConnected.mockReturnValue(false);
      const result = await client.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe("fill confirmation handling", () => {
    it("should register fill confirmation callback", () => {
      const callback = jest.fn();
      expect(() => client.onFillConfirmation(callback)).not.toThrow();
    });

    it("should invoke callback on handleFillConfirmation", () => {
      const callback = jest.fn();
      client.onFillConfirmation(callback);

      const fill = {
        orderId: "order-123",
        symbol: "BTCUSDT",
        side: "BUY",
        filledQty: 100,
        filledPrice: 42000,
        timestamp: Date.now(),
      };

      client.handleFillConfirmation(fill as any);

      expect(callback).toHaveBeenCalledWith(fill);
    });
  });

  describe("mapPhaseIdToSource", () => {
    it("should map phase1 correctly", () => {
      const source = (client as any).mapPhaseIdToSource("phase1");
      expect(typeof source).toBe("string");
      expect(source.length).toBeGreaterThan(0);
    });

    it("should map phase2 correctly", () => {
      const source = (client as any).mapPhaseIdToSource("phase2");
      expect(typeof source).toBe("string");
    });

    it("should map phase3 correctly", () => {
      const source = (client as any).mapPhaseIdToSource("phase3");
      expect(typeof source).toBe("string");
    });
  });
});
