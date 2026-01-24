/**
 * Fast Path IPC Integration Test
 *
 * Tests the integration between TitanTrap and FastPathClient
 * Requirements: 2.5, 5.1 (Fast Path IPC Integration)
 */

import { TitanTrap } from "../../src/engine/TitanTrap";

import { EventEmitter } from "../../src/events/EventEmitter";

// Mock dependencies
const mockBinanceClient = {
  subscribeAggTrades: jest.fn(),
  onTrade: jest.fn(),
  close: jest.fn(),
};

const mockBybitClient = {
  getEquity: jest.fn().mockResolvedValue(1000),
  fetchTopSymbols: jest.fn().mockResolvedValue(["BTCUSDT", "ETHUSDT"]),
  fetchOHLCV: jest.fn().mockResolvedValue([]),
  getCurrentPrice: jest.fn().mockResolvedValue(50000),
  close: jest.fn(),
  subscribeTicker: jest.fn(),
};

const mockLogger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockConfig = {
  getConfig: jest.fn().mockReturnValue({
    updateInterval: 60000,
    topSymbolsCount: 2,
    minTradesIn100ms: 50,
    extremeVelocityThreshold: 0.005,
    moderateVelocityThreshold: 0.001,
    aggressiveLimitMarkup: 0.002,
    stopLossPercent: 0.01,
    targetPercent: 0.03,
  }),
};

const mockTripwireCalculators = {
  calcLiquidationCluster: jest.fn(),
  calcDailyLevel: jest.fn(),
  calcBollingerBreakout: jest.fn(),
};

const mockVelocityCalculator = {
  recordPrice: jest.fn(),
  calcVelocity: jest.fn().mockReturnValue(0.002),
  getLastPrice: jest.fn().mockReturnValue(50000),
};

const mockPositionSizeCalculator = {
  calcPositionSize: jest.fn().mockReturnValue(0.1),
};

describe("Fast Path IPC Integration", () => {
  let titanTrap: TitanTrap;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    eventEmitter = new EventEmitter();

    const mockSignalClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({
        connected: false,
        connectionState: "disconnected",
        metrics: {
          messagessSent: 0,
          messagesReceived: 0,
          messagesFailed: 0,
        },
        status: {
          socketPath: "/tmp/titan-signal.sock",
          maxReconnectAttempts: 5,
        },
      }),
      forceReconnect: jest.fn().mockResolvedValue(undefined),
    };

    titanTrap = new TitanTrap({
      binanceClient: mockBinanceClient as any,
      bybitClient: mockBybitClient as any,
      logger: mockLogger as any,
      config: mockConfig as any,
      eventEmitter,
      tripwireCalculators: mockTripwireCalculators as any,
      velocityCalculator: mockVelocityCalculator as any,
      positionSizeCalculator: mockPositionSizeCalculator as any,
      signalClient: mockSignalClient as any,
    });
  });

  afterEach(async () => {
    await titanTrap.stop();
  });

  it("should initialize FastPathClient with correct configuration", () => {
    const ipcStatus = titanTrap.getIPCStatus();

    expect(ipcStatus).toBeDefined();
    expect(ipcStatus.connected).toBe(false); // Not connected initially
    expect(ipcStatus.connectionState).toBe("disconnected");
    expect(ipcStatus.metrics).toBeDefined();
    expect(ipcStatus.status).toBeDefined();
  });

  it("should handle IPC connection failure gracefully", async () => {
    // Start should not throw even if IPC connection fails
    // Mock signalClient.connect to reject
    (titanTrap as any).signalClient.connect.mockRejectedValue(
      new Error("Connection failed"),
    );

    await expect(titanTrap.start()).resolves.not.toThrow();

    // Should have logged warning
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to connect to Signal Service"),
    );
  });

  it("should provide IPC status and metrics", () => {
    const status = titanTrap.getIPCStatus();

    expect(status.connected).toBe(false);
    expect(status.connectionState).toBe("disconnected");
    expect(status.metrics).toHaveProperty("messagessSent");
    expect(status.metrics).toHaveProperty("messagesReceived");
    expect(status.metrics).toHaveProperty("messagesFailed");
    expect(status.status).toHaveProperty("socketPath");
    expect(status.status).toHaveProperty("maxReconnectAttempts");
  });

  it("should handle force reconnection", async () => {
    // Force reconnection should handle failure gracefully
    await expect(titanTrap.forceIPCReconnect()).resolves.not.toThrow();
  });
});
