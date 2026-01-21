import { ExecutionEngineClient } from "../../src/server/ExecutionEngineClient";
import { IntentSignal } from "../../src/types";
const mockPublish = jest.fn().mockResolvedValue(undefined);
const mockPublishEnvelope = jest.fn().mockResolvedValue(undefined);
const mockIsConnected = jest.fn().mockReturnValue(true);
jest.mock("@titan/shared", () => ({
  getNatsClient: jest.fn(() => ({
    publish: mockPublish,
    publishEnvelope: mockPublishEnvelope,
    isConnected: mockIsConnected,
  })),
  TitanSubject: {
    CMD_EXEC_PLACE: "titan.cmd.exec.place.v1",
  },
  validateIntentPayload: jest.fn(() => ({ valid: true, errors: [] })),
}));

describe("ExecutionEngineClient NATS payloads", () => {
  beforeEach(() => {
    mockPublish.mockClear();
    mockPublishEnvelope.mockClear();
  });

  it("includes required fields on forwardSignal", async () => {
    const client = new ExecutionEngineClient({});

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

  it("includes t_signal and required fields on emergency publish", async () => {
    const client = new ExecutionEngineClient({});

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
