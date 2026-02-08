import { FastifyInstance } from "fastify";
import { WebhookServer } from "../../src/server/WebhookServer";
import { HMACValidator } from "../../src/security/HMACValidator";
import { TitanBrain } from "../../src/engine/TitanBrain";

// Mock dependencies
jest.mock("mnemonist/lru-cache", () => {
  return class LRUCache {
    constructor() {}
    set() {}
    get() {}
    clear() {}
  };
}, { virtual: true });

jest.mock("../../src/services/canary/CanaryMonitor", () => ({
  CanaryMonitor: jest.fn().mockImplementation(() => ({
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
  })),
}));

describe("WebhookServer HMAC validation", () => {
  let server: WebhookServer;
  let app: FastifyInstance;
  const hmacSecret = "test-secret";

  beforeAll(async () => {
    const brain = {
      getDatabaseManager: () => ({
        isHealthy: jest.fn().mockReturnValue(true),
        getMetrics: jest.fn().mockReturnValue({
          totalConnections: 0,
          idleConnections: 0,
          successfulQueries: 0,
          failedQueries: 0,
          connectionErrors: 0,
          lastHealthCheck: Date.now(),
        }),
      }),
      getStateManager: () => ({
        isArmed: () => false,
        setArmed: jest.fn(),
        getMode: () => 'paper',
        setMode: jest.fn(),
        isHalted: () => false,
        setHalted: jest.fn(),
        getPositions: () => [],
        invalidateDashboardCache: jest.fn(),
      }),
      getEquity: jest.fn().mockReturnValue(0),
      getCircuitBreakerStatus: jest.fn().mockReturnValue({ active: false }),
      closeAllPositions: jest.fn().mockResolvedValue(undefined),
      processSignal: jest.fn().mockResolvedValue({
        approved: true,
        reason: "ok",
      }),
    } as unknown as TitanBrain;

    server = new WebhookServer(
      {
        host: "127.0.0.1",
        port: 0,
        skipListen: true,
        corsOrigins: ["*"],
        hmac: {
          enabled: true,
          secret: hmacSecret,
          headerName: "x-signature",
          algorithm: "sha256",
        },
        logLevel: "error",
      },
      brain,
    );

    await server.start();
    app = server.getServer()!;
  });

  afterAll(async () => {
    await server.stop();
  });

  it("accepts a valid HMAC signature (raw body + timestamp)", async () => {
    const validator = new HMACValidator({
      secret: hmacSecret,
      algorithm: "sha256",
      headerName: "x-signature",
      timestampHeaderName: "x-timestamp",
      timestampTolerance: 300,
      requireTimestamp: true,
    });

    const body = {
      signal_id: "sig-1",
      symbol: "BTCUSDT",
      direction: "LONG",
      size: 1,
      timestamp: Date.now(),
    };
    const payload = JSON.stringify(body);
    const headers = validator.createHeaders(payload, true);

    const res = await app.inject({
      method: "POST",
      url: "/webhook/phase3",
      payload,
      headers: {
        ...headers,
        "content-type": "application/json",
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects a modified body with the original signature", async () => {
    const validator = new HMACValidator({
      secret: hmacSecret,
      algorithm: "sha256",
      headerName: "x-signature",
      timestampHeaderName: "x-timestamp",
      timestampTolerance: 300,
      requireTimestamp: true,
    });

    const originalBody = {
      signal_id: "sig-2",
      symbol: "BTCUSDT",
      direction: "LONG",
      size: 1,
      timestamp: Date.now(),
    };
    const originalPayload = JSON.stringify(originalBody);
    const headers = validator.createHeaders(originalPayload, true);

    const tamperedPayload = JSON.stringify({
      ...originalBody,
      size: 2,
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhook/phase3",
      payload: tamperedPayload,
      headers: {
        ...headers,
        "content-type": "application/json",
      },
    });

    expect(res.statusCode).toBe(401);
  });
});
