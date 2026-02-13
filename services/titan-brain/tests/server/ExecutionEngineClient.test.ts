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
  Logger: {
    getInstance: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
    })),
  },
  TitanSubject: {
    CMD_EXEC_PLACE: "titan.cmd.execution.place.v1",
    CMD_RISK_POLICY: "titan.cmd.risk.policy.v1",
    POSITION_QUERY: "titan.query.positions.v1",
    EQUITY_QUERY: "titan.query.equity.v1",
    BALANCE_QUERY: "titan.query.balance.v1",
    DLQ: "titan.dlq.v1",
  },
  TITAN_SUBJECTS: {
    CMD: {
      EXECUTION: {
        PLACE: (venue: string, account: string, symbol: string) =>
          `titan.cmd.execution.place.v1.${venue}.${account}.${symbol}`,
        PREFIX: "titan.cmd.execution.place.v1",
        ALL: "titan.cmd.execution.place.v1.>",
      },
      RISK: {
        POLICY: "titan.cmd.risk.policy.v1",
        FLATTEN: "titan.cmd.risk.flatten",
        CONTROL: "titan.cmd.risk.control.v1",
      },
      SYS: {
        HALT: "titan.cmd.sys.halt.v1",
      },
    },
    DLQ: {
      EXECUTION: "titan.dlq.execution.core",
      BRAIN: "titan.dlq.brain.processing",
    },
    SYS: {
      RPC: {
        GET_POSITIONS: (venue: string) =>
          `titan.rpc.execution.get_positions.v1.${venue}`,
        GET_BALANCES: (venue: string) =>
          `titan.rpc.execution.get_balances.v1.${venue}`,
      },
    },
    LEGACY: {
      DLQ_EXECUTION_V0: "titan.execution.dlq",
    },
  },
  validateIntentPayload: jest.fn(() => ({ valid: true, errors: [] })),
  getCanonicalRiskPolicy: jest.fn(() => ({ hash: "test-policy-hash" })),
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

      expect(subject).toBe("titan.cmd.execution.place.v1.auto.main.BTCUSDT");
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

      expect(subject).toBe("titan.cmd.execution.place.v1.auto.main.ETHUSDT");
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
      expect(subject).toContain("titan.cmd.execution.place");
    });
  });

  describe("closeAllPositions", () => {
    it("should publish flatten command to the correct subject", async () => {
      await client.closeAllPositions();

      // The implementation uses publish (not publishEnvelope) for flatten commands
      expect(mockPublish).toHaveBeenCalledTimes(1);
      const [subject, payload] = mockPublish.mock.calls[0];

      expect(subject).toBe("titan.cmd.risk.flatten");
      expect(payload.command).toBe("FLATTEN_ALL");
      expect(payload.source).toBe("brain");
      expect(payload.timestamp).toEqual(expect.any(Number));
      expect(payload.reason).toBe("BRAIN_CIRCUIT_BREAKER");
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
