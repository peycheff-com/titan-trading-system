/**
 * ServiceDiscovery Unit Tests
 *
 * Tests for service registration, health checking, and discovery
 */

import {
    ServiceDiscovery,
    ServiceDiscoveryConfig,
    ServiceEndpoint,
} from "../../src/services/ServiceDiscovery.js";

// Mock ServiceClient
jest.mock("../../src/services/ServiceClient.js", () => ({
    ServiceClient: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockResolvedValue({}),
    })),
}));

const createMockLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
});

const createDefaultConfig = (): ServiceDiscoveryConfig => ({
    healthCheckInterval: 30000,
    healthCheckTimeout: 5000,
    maxConsecutiveFailures: 3,
    enableHealthChecking: false, // Disable auto-checking for tests
    enableFailover: true,
});

const createServiceEndpoint = (
    overrides: Partial<ServiceEndpoint> = {},
): ServiceEndpoint => ({
    name: "phase1",
    url: "http://localhost:3001",
    healthPath: "/health",
    priority: 1,
    required: false,
    ...overrides,
});

describe("ServiceDiscovery", () => {
    let discovery: ServiceDiscovery;
    let mockLogger: ReturnType<typeof createMockLogger>;
    let config: ServiceDiscoveryConfig;

    beforeEach(() => {
        jest.useFakeTimers();
        mockLogger = createMockLogger();
        config = createDefaultConfig();
        discovery = new ServiceDiscovery(config, mockLogger as any);
    });

    afterEach(() => {
        jest.useRealTimers();
        discovery.shutdown();
    });

    describe("registerService", () => {
        it("should register a service endpoint", () => {
            const endpoint = createServiceEndpoint();

            discovery.registerService(endpoint);

            const status = discovery.getServiceStatus("phase1");
            expect(status).not.toBeNull();
            expect(status?.name).toBe("phase1");
            expect(status?.url).toBe("http://localhost:3001");
        });

        it("should initialize service status as unhealthy", () => {
            const endpoint = createServiceEndpoint();

            discovery.registerService(endpoint);

            const status = discovery.getServiceStatus("phase1");
            expect(status?.healthy).toBe(false);
            expect(status?.consecutiveFailures).toBe(0);
        });

        it("should create a service client", () => {
            const endpoint = createServiceEndpoint();

            discovery.registerService(endpoint);

            const client = discovery.getServiceClient("phase1");
            expect(client).not.toBeNull();
        });

        it("should log service registration", () => {
            const endpoint = createServiceEndpoint();

            discovery.registerService(endpoint);

            expect(mockLogger.info).toHaveBeenCalledWith(
                "Service registered",
                undefined,
                expect.objectContaining({
                    service: "phase1",
                    url: "http://localhost:3001",
                }),
            );
        });
    });

    describe("getServiceEndpoint", () => {
        it("should return endpoint for registered service", () => {
            const endpoint = createServiceEndpoint();
            discovery.registerService(endpoint);

            const result = discovery.getServiceEndpoint("phase1");

            expect(result).toEqual(endpoint);
        });

        it("should return null for unknown service", () => {
            expect(discovery.getServiceEndpoint("unknown")).toBeNull();
        });
    });

    describe("getServiceClient", () => {
        it("should return null for unknown service", () => {
            expect(discovery.getServiceClient("unknown")).toBeNull();
        });
    });

    describe("getAllServiceStatuses", () => {
        it("should return empty array when no services registered", () => {
            expect(discovery.getAllServiceStatuses()).toEqual([]);
        });

        it("should return all registered service statuses", () => {
            discovery.registerService(
                createServiceEndpoint({ name: "phase1" }),
            );
            discovery.registerService(
                createServiceEndpoint({ name: "phase2" }),
            );
            discovery.registerService(
                createServiceEndpoint({ name: "phase3" }),
            );

            const statuses = discovery.getAllServiceStatuses();

            expect(statuses).toHaveLength(3);
            expect(statuses.map((s) => s.name)).toContain("phase1");
            expect(statuses.map((s) => s.name)).toContain("phase2");
            expect(statuses.map((s) => s.name)).toContain("phase3");
        });
    });

    describe("getHealthyServices", () => {
        it("should return empty array when all unhealthy", () => {
            discovery.registerService(
                createServiceEndpoint({ name: "phase1" }),
            );
            discovery.registerService(
                createServiceEndpoint({ name: "phase2" }),
            );

            expect(discovery.getHealthyServices()).toEqual([]);
        });
    });

    describe("getUnhealthyRequiredServices", () => {
        it("should return unhealthy required services", () => {
            discovery.registerService(
                createServiceEndpoint({ name: "shared", required: true }),
            );
            discovery.registerService(
                createServiceEndpoint({ name: "phase1", required: false }),
            );

            const unhealthy = discovery.getUnhealthyRequiredServices();

            expect(unhealthy).toHaveLength(1);
            expect(unhealthy[0].name).toBe("shared");
        });

        it("should return empty array when no required services", () => {
            discovery.registerService(
                createServiceEndpoint({ name: "phase1", required: false }),
            );

            expect(discovery.getUnhealthyRequiredServices()).toEqual([]);
        });
    });

    describe("startHealthChecking", () => {
        it("should not start when disabled in config", () => {
            config.enableHealthChecking = false;
            discovery = new ServiceDiscovery(config, mockLogger as any);

            discovery.startHealthChecking();

            expect(mockLogger.info).not.toHaveBeenCalledWith(
                "Health checking started",
                expect.anything(),
                expect.anything(),
            );
        });

        it("should start when enabled", () => {
            config.enableHealthChecking = true;
            discovery = new ServiceDiscovery(config, mockLogger as any);
            discovery.registerService(createServiceEndpoint());

            discovery.startHealthChecking();

            expect(mockLogger.info).toHaveBeenCalledWith(
                "Health checking started",
                undefined,
                expect.objectContaining({
                    interval: 30000,
                }),
            );
        });
    });

    describe("stopHealthChecking", () => {
        it("should stop health checking", () => {
            config.enableHealthChecking = true;
            discovery = new ServiceDiscovery(config, mockLogger as any);
            discovery.registerService(createServiceEndpoint());
            discovery.startHealthChecking();

            discovery.stopHealthChecking();

            expect(mockLogger.info).toHaveBeenCalledWith(
                "Health checking stopped",
            );
        });
    });

    describe("getHealthStatus", () => {
        it("should return overall health status", () => {
            discovery.registerService(
                createServiceEndpoint({ name: "phase1", required: false }),
            );

            const health = discovery.getHealthStatus();

            expect(health).toEqual({
                healthy: true, // No required services unhealthy
                totalServices: 1,
                healthyServices: 0, // All start unhealthy
                requiredServicesHealthy: true,
                services: expect.any(Array),
            });
        });

        it("should report unhealthy when required services are down", () => {
            discovery.registerService(
                createServiceEndpoint({ name: "shared", required: true }),
            );

            const health = discovery.getHealthStatus();

            expect(health.healthy).toBe(false);
            expect(health.requiredServicesHealthy).toBe(false);
        });
    });

    describe("shutdown", () => {
        it("should clear all services and stop health checking", () => {
            discovery.registerService(
                createServiceEndpoint({ name: "phase1" }),
            );
            discovery.registerService(
                createServiceEndpoint({ name: "phase2" }),
            );

            discovery.shutdown();

            expect(discovery.getAllServiceStatuses()).toEqual([]);
            expect(mockLogger.info).toHaveBeenCalledWith(
                "Service discovery shutdown complete",
            );
        });
    });

    describe("compatibility aliases", () => {
        it("getAllServices should alias getAllServiceStatuses", () => {
            discovery.registerService(createServiceEndpoint());

            const fromAlias = discovery.getAllServices();
            const fromOriginal = discovery.getAllServiceStatuses();

            expect(fromAlias).toEqual(fromOriginal);
        });

        it("getService should alias getServiceStatus", () => {
            discovery.registerService(
                createServiceEndpoint({ name: "phase1" }),
            );

            const fromAlias = discovery.getService("phase1");
            const fromOriginal = discovery.getServiceStatus("phase1");

            expect(fromAlias).toEqual(fromOriginal);
        });
    });
});
