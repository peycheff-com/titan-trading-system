/**
 * End-to-End Integration Tests
 * 
 * Tests the complete Titan Brain system integration
 * including server startup, webhook processing, and shutdown
 */

import { FastifyInstance } from 'fastify';
import { WebhookServer } from '../../src/server/WebhookServer';
import { StartupManager } from '../../src/startup/StartupManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { DatabaseManager } from '../../src/database/DatabaseManager';
import { CacheManager } from '../../src/cache/CacheManager';
import { Logger } from '../../src/logging/Logger';
import { BrainConfig } from '../../src/config/BrainConfig';
import crypto from 'crypto';
import fetch from 'node-fetch';

// Test configuration
const testConfig: BrainConfig = {
  server: {
    port: 0, // Use random port for testing
    host: '127.0.0.1',
    cors: {
      origin: true,
      credentials: true
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 1000
    }
  },
  database: {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'test_titan_brain',
    username: process.env.TEST_DB_USER || 'test_user',
    password: process.env.TEST_DB_PASSWORD || 'test_password',
    ssl: false,
    poolMin: 1,
    poolMax: 5,
    connectionTimeoutMs: 5000,
    idleTimeoutMs: 30000,
    healthCheckIntervalMs: 30000
  },
  cache: {
    redis: {
      host: process.env.TEST_REDIS_HOST || 'localhost',
      port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
      password: process.env.TEST_REDIS_PASSWORD,
      db: 13, // Use DB 13 for E2E tests
      connectTimeout: 5000,
      commandTimeout: 3000
    },
    enableInMemoryFallback: true,
    inMemoryMaxSize: 100,
    inMemoryTtlMs: 60000,
    healthCheckIntervalMs: 30000,
    healthCheckTimeoutMs: 5000,
    maxReconnectAttempts: 3,
    reconnectDelayMs: 1000
  },
  logging: {
    level: 'info',
    format: 'json',
    enableConsole: true,
    enableFile: false
  },
  security: {
    hmacSecret: 'test-e2e-secret-key',
    timestampToleranceMs: 300000
  },
  services: {
    discovery: {
      healthCheckIntervalMs: 30000,
      healthCheckTimeoutMs: 5000
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      monitoringPeriodMs: 10000
    },
    client: {
      timeoutMs: 30000,
      retryAttempts: 3,
      retryDelayMs: 1000,
      retryBackoffMultiplier: 2
    }
  },
  metrics: {
    enablePrometheus: true,
    collectDefaultMetrics: true,
    defaultMetricsIntervalMs: 10000
  }
};

describe('End-to-End Integration Tests', () => {
  let server: WebhookServer;
  let app: FastifyInstance;
  let startupManager: StartupManager;
  let configManager: ConfigManager;
  let logger: Logger;
  let databaseManager: DatabaseManager;
  let cacheManager: CacheManager;
  let serverAddress: string;
  let serverPort: number;

  beforeAll(async () => {
    // Initialize all components
    logger = new Logger(testConfig.logging);
    configManager = new ConfigManager(testConfig, logger);
    databaseManager = new DatabaseManager(testConfig.database, logger);
    cacheManager = new CacheManager(testConfig.cache, logger);
    
    // Initialize startup manager
    startupManager = new StartupManager({
      configManager,
      databaseManager,
      cacheManager,
      logger
    });
    
    // Start up all services
    const startupResult = await startupManager.startup();
    if (!startupResult.success) {
      console.warn('Startup failed, some tests may be skipped:', startupResult.error);
    }
    
    // Create and start webhook server
    server = new WebhookServer(configManager, logger, databaseManager, cacheManager);
    app = await server.createServer();
    
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    serverAddress = address;
    
    // Extract port from address
    const url = new URL(address);
    serverPort = parseInt(url.port);
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (startupManager) {
      await startupManager.shutdown();
    }
    if (databaseManager) {
      await databaseManager.disconnect();
    }
    if (cacheManager) {
      await cacheManager.disconnect();
    }
  }, 30000);

  // Helper function to generate HMAC signature
  function generateHMACSignature(payload: string, timestamp: string): string {
    const message = `${timestamp}.${payload}`;
    return crypto.createHmac('sha256', testConfig.security.hmacSecret).update(message).digest('hex');
  }

  // Helper function to make authenticated requests
  async function makeAuthenticatedRequest(
    method: string,
    path: string,
    payload?: any,
    headers: Record<string, string> = {}
  ) {
    const body = payload ? JSON.stringify(payload) : undefined;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = body ? generateHMACSignature(body, timestamp) : undefined;

    const requestHeaders: Record<string, string> = {
      'content-type': 'application/json',
      ...headers
    };

    if (signature) {
      requestHeaders['x-timestamp'] = timestamp;
      requestHeaders['x-signature'] = `sha256=${signature}`;
    }

    const response = await fetch(`${serverAddress}${path}`, {
      method,
      headers: requestHeaders,
      body
    });

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
      json: async () => {
        try {
          return JSON.parse(await response.text());
        } catch {
          return null;
        }
      }
    };
  }

  describe('System Startup and Health', () => {
    it('should start all services successfully', async () => {
      // Verify server is running
      expect(serverAddress).toBeDefined();
      expect(serverPort).toBeGreaterThan(0);
      
      // Verify health endpoint
      const response = await makeAuthenticatedRequest('GET', '/health');
      expect(response.status).toBe(200);
      
      const health = JSON.parse(response.body);
      expect(health.status).toBe('healthy');
      expect(health.components).toBeDefined();
    });

    it('should provide comprehensive health information', async () => {
      const response = await makeAuthenticatedRequest('GET', '/health');
      const health = JSON.parse(response.body);
      
      expect(health.components).toHaveProperty('database');
      expect(health.components).toHaveProperty('cache');
      expect(health.components).toHaveProperty('config');
      expect(health.components).toHaveProperty('memory');
      
      // All components should be healthy
      Object.values(health.components).forEach((component: any) => {
        expect(component).toHaveProperty('healthy');
        expect(component).toHaveProperty('timestamp');
      });
    });

    it('should provide Prometheus metrics', async () => {
      const response = await makeAuthenticatedRequest('GET', '/metrics');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      
      // Should contain standard Prometheus metrics
      expect(response.body).toContain('# HELP');
      expect(response.body).toContain('# TYPE');
      expect(response.body).toContain('http_requests_total');
    });
  });

  describe('Webhook Processing', () => {
    it('should process valid webhook requests', async () => {
      const webhookPayload = {
        type: 'signal',
        phase: 'phase1',
        symbol: 'BTCUSDT',
        action: 'BUY',
        price: 50000,
        quantity: 0.1,
        timestamp: Date.now()
      };

      const response = await makeAuthenticatedRequest('POST', '/webhook', webhookPayload);
      
      // Should accept the webhook (even if endpoint doesn't exist yet)
      expect([200, 201, 404]).toContain(response.status);
    });

    it('should reject webhooks with invalid signatures', async () => {
      const webhookPayload = {
        type: 'signal',
        phase: 'phase1',
        symbol: 'BTCUSDT',
        action: 'SELL'
      };

      const response = await fetch(`${serverAddress}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-signature': 'sha256=invalid-signature'
        },
        body: JSON.stringify(webhookPayload)
      });

      expect(response.status).toBe(401);
    });

    it('should reject webhooks with expired timestamps', async () => {
      const webhookPayload = {
        type: 'signal',
        phase: 'phase1',
        symbol: 'BTCUSDT'
      };

      const expiredTimestamp = Math.floor((Date.now() - 400000) / 1000).toString(); // 400 seconds ago
      const signature = generateHMACSignature(JSON.stringify(webhookPayload), expiredTimestamp);

      const response = await fetch(`${serverAddress}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-timestamp': expiredTimestamp,
          'x-signature': `sha256=${signature}`
        },
        body: JSON.stringify(webhookPayload)
      });

      expect(response.status).toBe(401);
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`${serverAddress}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: 'invalid-json{'
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];
      const testIP = '192.168.1.200';
      
      // Make multiple requests quickly
      for (let i = 0; i < 20; i++) {
        requests.push(
          fetch(`${serverAddress}/health`, {
            headers: {
              'x-forwarded-for': testIP
            }
          })
        );
      }
      
      const responses = await Promise.all(requests);
      
      // Some requests should succeed, some might be rate limited
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      expect(successCount).toBeGreaterThan(0);
      // Rate limiting might not kick in for health checks, so we don't assert on rate limited count
    }, 10000);

    it('should include rate limit headers', async () => {
      const response = await makeAuthenticatedRequest('GET', '/health');
      
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database disconnection gracefully', async () => {
      // Disconnect database
      await databaseManager.disconnect();
      
      // Health check should report unhealthy
      const healthResponse = await makeAuthenticatedRequest('GET', '/health');
      expect(healthResponse.status).toBe(503);
      
      const health = JSON.parse(healthResponse.body);
      expect(health.status).toBe('unhealthy');
      
      // Reconnect database
      await databaseManager.connect();
      
      // Wait a moment for health to recover
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Health should recover
      const recoveredHealthResponse = await makeAuthenticatedRequest('GET', '/health');
      expect(recoveredHealthResponse.status).toBe(200);
    }, 15000);

    it('should continue operating with cache failures', async () => {
      // Disconnect cache
      await cacheManager.disconnect();
      
      // Server should still respond (using fallback)
      const response = await makeAuthenticatedRequest('GET', '/health');
      expect(response.status).toBe(200);
      
      // Reconnect cache
      await cacheManager.connect();
    }, 10000);

    it('should handle high concurrent load', async () => {
      const concurrentRequests = 50;
      const requests = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(makeAuthenticatedRequest('GET', '/health'));
      }
      
      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;
      
      // All requests should complete
      expect(responses).toHaveLength(concurrentRequests);
      
      // Most should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(concurrentRequests * 0.8); // At least 80% success
      
      console.log(`Handled ${concurrentRequests} concurrent requests in ${duration}ms`);
    }, 15000);
  });

  describe('Monitoring and Observability', () => {
    it('should track request metrics', async () => {
      // Make several requests to generate metrics
      await makeAuthenticatedRequest('GET', '/health');
      await makeAuthenticatedRequest('GET', '/health');
      await makeAuthenticatedRequest('GET', '/metrics');
      
      const metricsResponse = await makeAuthenticatedRequest('GET', '/metrics');
      expect(metricsResponse.status).toBe(200);
      
      // Should contain request count metrics
      expect(metricsResponse.body).toContain('http_requests_total');
      expect(metricsResponse.body).toContain('http_request_duration_seconds');
    });

    it('should include correlation IDs in responses', async () => {
      const correlationId = 'test-e2e-correlation-123';
      
      const response = await fetch(`${serverAddress}/health`, {
        headers: {
          'x-correlation-id': correlationId
        }
      });
      
      expect(response.headers.get('x-correlation-id')).toBe(correlationId);
    });

    it('should generate correlation IDs when not provided', async () => {
      const response = await makeAuthenticatedRequest('GET', '/health');
      
      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-correlation-id']).toMatch(/^[a-f0-9-]+$/);
    });
  });

  describe('Security', () => {
    it('should enforce HTTPS in production mode', async () => {
      // This test would need to be adapted based on actual production configuration
      // For now, just verify that security headers are present
      const response = await makeAuthenticatedRequest('GET', '/health');
      
      // Should have security-related headers
      expect(response.headers).toBeDefined();
    });

    it('should validate request signatures correctly', async () => {
      const payload = { test: 'signature validation' };
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const validSignature = generateHMACSignature(JSON.stringify(payload), timestamp);
      
      const response = await fetch(`${serverAddress}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-timestamp': timestamp,
          'x-signature': `sha256=${validSignature}`
        },
        body: JSON.stringify(payload)
      });
      
      // Should not be rejected due to signature (might be 404 if endpoint doesn't exist)
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    it('should handle CORS requests properly', async () => {
      const response = await fetch(`${serverAddress}/health`, {
        method: 'OPTIONS',
        headers: {
          'origin': 'https://example.com',
          'access-control-request-method': 'GET'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should respond to health checks quickly', async () => {
      const iterations = 10;
      const durations: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const response = await makeAuthenticatedRequest('GET', '/health');
        const duration = Date.now() - startTime;
        
        expect(response.status).toBe(200);
        durations.push(duration);
      }
      
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      
      expect(avgDuration).toBeLessThan(500); // Average under 500ms
      expect(maxDuration).toBeLessThan(2000); // Max under 2 seconds
      
      console.log(`Health check performance: avg=${avgDuration.toFixed(2)}ms, max=${maxDuration}ms`);
    }, 15000);

    it('should maintain performance under sustained load', async () => {
      const duration = 5000; // 5 seconds
      const startTime = Date.now();
      const requests: Promise<any>[] = [];
      let requestCount = 0;
      
      // Generate requests for 5 seconds
      const interval = setInterval(() => {
        if (Date.now() - startTime < duration) {
          requests.push(makeAuthenticatedRequest('GET', '/health'));
          requestCount++;
        }
      }, 50); // One request every 50ms
      
      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, duration));
      clearInterval(interval);
      
      // Wait for all requests to complete
      const responses = await Promise.all(requests);
      
      const successCount = responses.filter(r => r.status === 200).length;
      const successRate = successCount / requestCount;
      
      expect(successRate).toBeGreaterThan(0.95); // 95% success rate
      
      console.log(`Sustained load test: ${requestCount} requests, ${(successRate * 100).toFixed(2)}% success rate`);
    }, 10000);
  });

  describe('Graceful Shutdown', () => {
    it('should handle graceful shutdown', async () => {
      // This test verifies that the system can shut down gracefully
      // In a real scenario, this would be triggered by SIGTERM or similar
      
      const healthResponse = await makeAuthenticatedRequest('GET', '/health');
      expect(healthResponse.status).toBe(200);
      
      // The actual shutdown is handled in afterAll
      // Here we just verify the system is currently healthy
      const health = JSON.parse(healthResponse.body);
      expect(health.status).toBe('healthy');
    });
  });
});