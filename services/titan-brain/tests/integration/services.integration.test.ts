/**
 * Integration tests for service communication
 */

import { ServiceClient } from "../../src/services/ServiceClient";
import {
  CircuitBreaker,
  CircuitBreakerDefaults,
} from "../../src/services/CircuitBreaker";
import { ServiceDiscovery } from "../../src/services/ServiceDiscovery";

// Mock node-fetch for integration tests
jest.mock("node-fetch");
import nodeFetch from "node-fetch";
const mockFetch = nodeFetch as jest.MockedFunction<typeof nodeFetch>;

describe("Service Communication Integration Tests", () => {
  let serviceClient: ServiceClient;
  let circuitBreaker: CircuitBreaker;
  let serviceDiscovery: ServiceDiscovery;

  beforeEach(() => {
    jest.clearAllMocks();

    circuitBreaker = new CircuitBreaker(
      "test-service",
      CircuitBreakerDefaults.IMPORTANT,
    );
    serviceClient = new ServiceClient("test-service", "http://localhost:3000", {
      timeout: 5000,
      retries: 3,
      circuitBreaker,
    });

    serviceDiscovery = new ServiceDiscovery();
  });

  describe("ServiceClient with CircuitBreaker integration", () => {
    it("should make successful request through circuit breaker", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ success: true }),
        text: jest.fn().mockResolvedValue('{"success":true}'),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await serviceClient.get("/test");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/test",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("should handle circuit breaker opening on failures", async () => {
      // Mock multiple failures to open circuit breaker
      mockFetch.mockRejectedValue(new Error("Network error"));

      const config = CircuitBreakerDefaults.IMPORTANT;

      // Execute failures up to threshold
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await serviceClient.get("/test");
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should now be open
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("OPEN");

      // Next request should fail immediately without network call
      const initialCallCount = mockFetch.mock.calls.length;

      await expect(serviceClient.get("/test")).rejects.toThrow(
        "Circuit breaker is OPEN",
      );

      // Should not have made additional network call
      expect(mockFetch.mock.calls.length).toBe(initialCallCount);
    });

    it("should retry failed requests with exponential backoff", async () => {
      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ success: true }),
          text: jest.fn().mockResolvedValue('{"success":true}'),
        } as any);

      const startTime = Date.now();
      const result = await serviceClient.get("/test");
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Should have taken some time due to retries with backoff
      expect(duration).toBeGreaterThan(100); // At least some delay
    });
  });

  describe("ServiceDiscovery integration", () => {
    it("should register and discover services", () => {
      const services = {
        "phase1-service": "http://localhost:3001",
        "phase2-service": "http://localhost:3002",
      };

      serviceDiscovery.registerServices(services);

      expect(serviceDiscovery.getServiceUrl("phase1-service")).toBe(
        "http://localhost:3001",
      );
      expect(serviceDiscovery.getServiceUrl("phase2-service")).toBe(
        "http://localhost:3002",
      );
      expect(serviceDiscovery.getServiceUrl("unknown-service")).toBeNull();
    });

    it("should handle service health monitoring", async () => {
      const services = {
        "healthy-service": "http://localhost:3001",
        "unhealthy-service": "http://localhost:3002",
      };

      serviceDiscovery.registerServices(services);

      // Mock health check responses
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("3001")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ status: "healthy" }),
          } as any);
        } else {
          return Promise.reject(new Error("Service unavailable"));
        }
      });

      await serviceDiscovery.checkServiceHealth("healthy-service");
      await serviceDiscovery.checkServiceHealth("unhealthy-service");

      const healthyStatus = serviceDiscovery.getServiceStatus(
        "healthy-service",
      );
      const unhealthyStatus = serviceDiscovery.getServiceStatus(
        "unhealthy-service",
      );

      expect(healthyStatus.healthy).toBe(true);
      expect(unhealthyStatus.healthy).toBe(false);
    });
  });

  describe("End-to-end service communication", () => {
    it("should handle complete request lifecycle with all components", async () => {
      // Register service
      serviceDiscovery.registerServices({
        "test-service": "http://localhost:3000",
      });

      // Create client for discovered service
      const serviceUrl = serviceDiscovery.getServiceUrl("test-service");
      const client = new ServiceClient("test-service", serviceUrl!, {
        timeout: 5000,
        retries: 2,
        circuitBreaker: new CircuitBreaker(
          "test-service",
          CircuitBreakerDefaults.IMPORTANT,
        ),
      });

      // Mock successful response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: "test" }),
        text: jest.fn().mockResolvedValue('{"data":"test"}'),
      } as any);

      // Make request
      const result = await client.post("/api/test", { input: "data" });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "test" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/test",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ input: "data" }),
        }),
      );
    });

    it("should handle service discovery with health checks", async () => {
      const services = {
        "primary-service": "http://localhost:3001",
        "backup-service": "http://localhost:3002",
      };

      serviceDiscovery.registerServices(services);

      // Mock primary service as unhealthy, backup as healthy
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("3001")) {
          return Promise.reject(new Error("Primary service down"));
        } else if (url.includes("3002")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ status: "healthy" }),
          } as any);
        }
        return Promise.reject(new Error("Unknown service"));
      });

      // Check health of both services
      await serviceDiscovery.checkServiceHealth("primary-service");
      await serviceDiscovery.checkServiceHealth("backup-service");

      const primaryStatus = serviceDiscovery.getServiceStatus(
        "primary-service",
      );
      const backupStatus = serviceDiscovery.getServiceStatus("backup-service");

      expect(primaryStatus.healthy).toBe(false);
      expect(backupStatus.healthy).toBe(true);

      // Should be able to get healthy services
      const healthyServices = serviceDiscovery.getHealthyServices();
      expect(healthyServices).toContain("backup-service");
      expect(healthyServices).not.toContain("primary-service");
    });
  });

  describe("Error handling and resilience", () => {
    it("should handle network timeouts gracefully", async () => {
      const timeoutClient = new ServiceClient(
        "timeout-service",
        "http://localhost:3000",
        {
          timeout: 100, // Very short timeout
          retries: 1,
          circuitBreaker: new CircuitBreaker(
            "timeout-service",
            CircuitBreakerDefaults.IMPORTANT,
          ),
        },
      );

      // Mock a slow response
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => setTimeout(resolve, 200))
      );

      await expect(timeoutClient.get("/slow")).rejects.toThrow();
    });

    it("should handle malformed responses", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error("Invalid JSON")),
        text: jest.fn().mockResolvedValue("invalid json response"),
      } as any);

      const result = await serviceClient.get("/malformed");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid JSON");
    });

    it("should handle HTTP error status codes", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: jest.fn().mockResolvedValue({ error: "Server error" }),
        text: jest.fn().mockResolvedValue('{"error":"Server error"}'),
      } as any);

      const result = await serviceClient.get("/error");

      expect(result.success).toBe(false);
      expect(result.status).toBe(500);
      expect(result.error).toContain("500");
    });
  });
});
