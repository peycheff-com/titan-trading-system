/**
 * Load Balancer for Titan Trading System
 *
 * Provides intelligent load balancing for WebSocket and REST API endpoints
 * with health checking, failover, and automatic scaling capabilities.
 *
 * Requirements: 10.1 - Horizontal scaling with load balancing
 */

import { EventEmitter } from "eventemitter3";
import http from "http";
import https from "https";
import { URL } from "url";
import * as os from "os";

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
};

/**
 * Backend server configuration
 */
export interface BackendServer {
  id: string;
  host: string;
  port: number;
  protocol: "http" | "https" | "ws" | "wss";
  weight: number; // Load balancing weight (1-100)
  maxConnections: number;
  healthCheckPath?: string;
  tags: string[]; // Service tags for routing
}

/**
 * Server health status
 */
export interface ServerHealth {
  serverId: string;
  isHealthy: boolean;
  responseTime: number;
  lastCheck: number;
  consecutiveFailures: number;
  currentConnections: number;
  cpuUsage?: number;
  memoryUsage?: number;
}

/**
 * Load balancing algorithms
 */
export type LoadBalancingAlgorithm =
  | "round_robin"
  | "weighted_round_robin"
  | "least_connections"
  | "least_response_time"
  | "ip_hash"
  | "resource_based";

/**
 * Load balancer configuration
 */
export interface LoadBalancerConfig {
  algorithm: LoadBalancingAlgorithm;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  maxFailures: number;
  retryInterval: number;
  connectionTimeout: number;
  enableStickySessions: boolean;
  sessionTimeout: number;
  enableMetrics: boolean;
  autoScaling: {
    enabled: boolean;
    minServers: number;
    maxServers: number;
    scaleUpThreshold: number; // CPU/Memory percentage
    scaleDownThreshold: number;
    cooldownPeriod: number; // milliseconds
  };
}

/**
 * Request routing information
 */
export interface RoutingInfo {
  clientId: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
}

/**
 * Load balancing metrics
 */
export interface LoadBalancingMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  activeConnections: number;
  serverMetrics: Record<
    string,
    {
      requests: number;
      responseTime: number;
      connections: number;
      healthScore: number;
    }
  >;
}

/**
 * Session management for sticky sessions
 */
class SessionManager {
  private sessions = new Map<
    string,
    { serverId: string; lastAccess: number }
  >();

  constructor(private sessionTimeout: number) {}

  /**
   * Get server for session
   */
  getServerForSession(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (session && Date.now() - session.lastAccess < this.sessionTimeout) {
      // eslint-disable-next-line functional/immutable-data
      session.lastAccess = Date.now();
      return session.serverId;
    }

    // Clean up expired session
    if (session) {
      // eslint-disable-next-line functional/immutable-data
      this.sessions.delete(sessionId);
    }

    return null;
  }

  /**
   * Set server for session
   */
  setServerForSession(sessionId: string, serverId: string): void {
    // eslint-disable-next-line functional/immutable-data
    this.sessions.set(sessionId, {
      serverId,
      lastAccess: Date.now(),
    });
  }

  /**
   * Clean up expired sessions
   */
  cleanup(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccess > this.sessionTimeout) {
        // eslint-disable-next-line functional/immutable-data
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return this.sessions.size;
  }
}

/**
 * Health checker for backend servers
 */
class HealthChecker extends EventEmitter {
  private healthStatus = new Map<string, ServerHealth>();
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(
    private servers: Map<string, BackendServer>,
    private config: LoadBalancerConfig,
  ) {
    super();
  }

  /**
   * Start health checking
   */
  start(): void {
    if (this.checkTimer) {
      return;
    }

    // Initial health check
    this.checkAllServers();

    // Schedule periodic health checks
    // eslint-disable-next-line functional/immutable-data
    this.checkTimer = setInterval(() => {
      this.checkAllServers();
    }, this.config.healthCheckInterval);

    console.log(
      colors.green(
        `🏥 Health checker started (${this.config.healthCheckInterval}ms interval)`,
      ),
    );
  }

  /**
   * Stop health checking
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      // eslint-disable-next-line functional/immutable-data
      this.checkTimer = null;
    }
  }

  /**
   * Check all servers health
   */
  private async checkAllServers(): Promise<void> {
    const promises = Array.from(this.servers.values()).map((server) =>
      this.checkServerHealth(server)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Check individual server health
   */
  private async checkServerHealth(server: BackendServer): Promise<void> {
    const startTime = Date.now();
    // eslint-disable-next-line functional/no-let
    let isHealthy = false;
    // eslint-disable-next-line functional/no-let
    let responseTime = 0;

    try {
      const healthCheckUrl =
        `${server.protocol}://${server.host}:${server.port}${
          server.healthCheckPath || "/health"
        }`;

      await this.makeHealthCheckRequest(healthCheckUrl);

      responseTime = Date.now() - startTime;
      isHealthy = responseTime < this.config.healthCheckTimeout;
    } catch (error) {
      responseTime = Date.now() - startTime;
      isHealthy = false;
    }

    // Update health status
    const currentHealth = this.healthStatus.get(server.id);
    const consecutiveFailures = isHealthy
      ? 0
      : (currentHealth?.consecutiveFailures || 0) + 1;

    const health: ServerHealth = {
      serverId: server.id,
      isHealthy: isHealthy && consecutiveFailures < this.config.maxFailures,
      responseTime,
      lastCheck: Date.now(),
      consecutiveFailures,
      currentConnections: currentHealth?.currentConnections || 0,
    };

    // Check if health status changed
    const wasHealthy = currentHealth?.isHealthy || false;
    if (health.isHealthy !== wasHealthy) {
      const status = health.isHealthy ? "healthy" : "unhealthy";
      console.log(colors.cyan(`🏥 Server ${server.id} is now ${status}`));
      this.emit("healthChange", {
        serverId: server.id,
        isHealthy: health.isHealthy,
      });
    }

    // eslint-disable-next-line functional/immutable-data
    this.healthStatus.set(server.id, health);
  }

  /**
   * Make health check HTTP request
   */
  private makeHealthCheckRequest(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === "https:" ? https : http;

      const req = client.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname,
          method: "GET",
          timeout: this.config.healthCheckTimeout,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(
              new Error(`Health check failed with status ${res.statusCode}`),
            );
          }
        },
      );

      req.on("error", reject);
      req.on("timeout", () => reject(new Error("Health check timeout")));
      req.end();
    });
  }

  /**
   * Get server health status
   */
  getServerHealth(serverId: string): ServerHealth | null {
    return this.healthStatus.get(serverId) || null;
  }

  /**
   * Get all healthy servers
   */
  getHealthyServers(): string[] {
    return Array.from(this.healthStatus.entries())
      .filter(([, health]) => health.isHealthy)
      .map(([serverId]) => serverId);
  }

  /**
   * Update server connection count
   */
  updateConnectionCount(serverId: string, delta: number): void {
    const health = this.healthStatus.get(serverId);
    if (health) {
      // eslint-disable-next-line functional/immutable-data
      health.currentConnections = Math.max(
        0,
        health.currentConnections + delta,
      );
    }
  }
}

/**
 * Load Balancer
 */
export class LoadBalancer extends EventEmitter {
  private servers = new Map<string, BackendServer>();
  private healthChecker: HealthChecker;
  private sessionManager: SessionManager;
  private roundRobinIndex = 0;
  private metrics: LoadBalancingMetrics;
  private metricsTimer: NodeJS.Timeout | null = null;
  private sessionCleanupTimer: NodeJS.Timeout | null = null;

  constructor(private config: LoadBalancerConfig) {
    super();

    this.healthChecker = new HealthChecker(this.servers, config);
    this.sessionManager = new SessionManager(config.sessionTimeout);

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsPerSecond: 0,
      activeConnections: 0,
      serverMetrics: {},
    };

    // Set up health checker events
    this.healthChecker.on("healthChange", (event) => {
      this.emit("serverHealthChange", event);
    });

    console.log(
      colors.blue(
        `🔄 Load Balancer initialized with ${config.algorithm} algorithm`,
      ),
    );
  }

  /**
   * Add backend server
   */
  addServer(server: BackendServer): void {
    // eslint-disable-next-line functional/immutable-data
    this.servers.set(server.id, server);

    // Initialize server metrics
    // eslint-disable-next-line functional/immutable-data
    this.metrics.serverMetrics[server.id] = {
      requests: 0,
      responseTime: 0,
      connections: 0,
      healthScore: 100,
    };

    console.log(
      colors.green(
        `➕ Added server ${server.id} (${server.host}:${server.port})`,
      ),
    );
  }

  /**
   * Remove backend server
   */
  removeServer(serverId: string): void {
    // eslint-disable-next-line functional/immutable-data
    this.servers.delete(serverId);
    // eslint-disable-next-line functional/immutable-data
    delete this.metrics.serverMetrics[serverId];

    console.log(colors.yellow(`➖ Removed server ${serverId}`));
  }

  /**
   * Start load balancer
   */
  start(): void {
    this.healthChecker.start();

    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }

    // Start session cleanup
    // eslint-disable-next-line functional/immutable-data
    this.sessionCleanupTimer = setInterval(() => {
      this.sessionManager.cleanup();
    }, 60000); // Every minute

    console.log(colors.green("🚀 Load Balancer started"));
  }

  /**
   * Stop load balancer
   */
  stop(): void {
    this.healthChecker.stop();

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      // eslint-disable-next-line functional/immutable-data
      this.metricsTimer = null;
    }

    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
      // eslint-disable-next-line functional/immutable-data
      this.sessionCleanupTimer = null;
    }

    console.log(colors.yellow("🛑 Load Balancer stopped"));
  }

  /**
   * Select server for request
   */
  selectServer(routingInfo: RoutingInfo): BackendServer | null {
    const healthyServers = this.healthChecker
      .getHealthyServers()
      .map((id) => this.servers.get(id))
      .filter((server) => server !== undefined) as BackendServer[];

    if (healthyServers.length === 0) {
      console.warn(colors.red("⚠️ No healthy servers available"));
      return null;
    }

    // Check for sticky session
    if (this.config.enableStickySessions) {
      const sessionId = this.extractSessionId(routingInfo);
      if (sessionId) {
        const stickyServerId = this.sessionManager.getServerForSession(
          sessionId,
        );
        if (stickyServerId) {
          const stickyServer = this.servers.get(stickyServerId);
          if (stickyServer && healthyServers.includes(stickyServer)) {
            return stickyServer;
          }
        }
      }
    }

    // Apply load balancing algorithm
    // eslint-disable-next-line functional/no-let
    let selectedServer: BackendServer | null = null;

    switch (this.config.algorithm) {
      case "round_robin":
        selectedServer = this.selectRoundRobin(healthyServers);
        break;
      case "weighted_round_robin":
        selectedServer = this.selectWeightedRoundRobin(healthyServers);
        break;
      case "least_connections":
        selectedServer = this.selectLeastConnections(healthyServers);
        break;
      case "least_response_time":
        selectedServer = this.selectLeastResponseTime(healthyServers);
        break;
      case "ip_hash":
        selectedServer = this.selectIpHash(healthyServers, routingInfo);
        break;
      case "resource_based":
        selectedServer = this.selectResourceBased(healthyServers);
        break;
      default:
        selectedServer = healthyServers[0];
    }

    // Set sticky session if enabled
    if (selectedServer && this.config.enableStickySessions) {
      const sessionId = this.extractSessionId(routingInfo);
      if (sessionId) {
        this.sessionManager.setServerForSession(sessionId, selectedServer.id);
      }
    }

    return selectedServer;
  }

  /**
   * Round robin selection
   */
  private selectRoundRobin(servers: BackendServer[]): BackendServer {
    const server = servers[this.roundRobinIndex % servers.length];
    // eslint-disable-next-line functional/immutable-data
    this.roundRobinIndex = (this.roundRobinIndex + 1) % servers.length;
    return server;
  }

  /**
   * Weighted round robin selection
   */
  private selectWeightedRoundRobin(servers: BackendServer[]): BackendServer {
    const totalWeight = servers.reduce((sum, server) => sum + server.weight, 0);
    // eslint-disable-next-line functional/no-let
    let randomWeight = Math.random() * totalWeight;

    for (const server of servers) {
      randomWeight -= server.weight;
      if (randomWeight <= 0) {
        return server;
      }
    }

    return servers[0]; // Fallback
  }

  /**
   * Least connections selection
   */
  private selectLeastConnections(servers: BackendServer[]): BackendServer {
    return servers.reduce((best, server) => {
      const serverHealth = this.healthChecker.getServerHealth(server.id);
      const bestHealth = this.healthChecker.getServerHealth(best.id);

      const serverConnections = serverHealth?.currentConnections || 0;
      const bestConnections = bestHealth?.currentConnections || 0;

      return serverConnections < bestConnections ? server : best;
    });
  }

  /**
   * Least response time selection
   */
  private selectLeastResponseTime(servers: BackendServer[]): BackendServer {
    return servers.reduce((best, server) => {
      const serverHealth = this.healthChecker.getServerHealth(server.id);
      const bestHealth = this.healthChecker.getServerHealth(best.id);

      const serverResponseTime = serverHealth?.responseTime || Infinity;
      const bestResponseTime = bestHealth?.responseTime || Infinity;

      return serverResponseTime < bestResponseTime ? server : best;
    });
  }

  /**
   * IP hash selection (for session affinity)
   */
  private selectIpHash(
    servers: BackendServer[],
    routingInfo: RoutingInfo,
  ): BackendServer {
    const clientIp = routingInfo.headers["x-forwarded-for"] ||
      routingInfo.headers["x-real-ip"] ||
      routingInfo.clientId;
    const hash = this.simpleHash(clientIp);
    const index = hash % servers.length;
    return servers[index];
  }

  /**
   * Resource-based selection (CPU/Memory aware)
   */
  private selectResourceBased(servers: BackendServer[]): BackendServer {
    return servers.reduce((best, server) => {
      const serverHealth = this.healthChecker.getServerHealth(server.id);
      const bestHealth = this.healthChecker.getServerHealth(best.id);

      // Calculate resource score (lower is better)
      const serverScore = (serverHealth?.cpuUsage || 50) +
        (serverHealth?.memoryUsage || 50);
      const bestScore = (bestHealth?.cpuUsage || 50) +
        (bestHealth?.memoryUsage || 50);

      return serverScore < bestScore ? server : best;
    });
  }

  /**
   * Simple hash function for IP hashing
   */
  private simpleHash(str: string): number {
    // eslint-disable-next-line functional/no-let
    let hash = 0;
    // eslint-disable-next-line functional/no-let
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Extract session ID from request
   */
  private extractSessionId(routingInfo: RoutingInfo): string | null {
    // Try to extract from cookie
    const cookies = routingInfo.headers.cookie;
    if (cookies) {
      const sessionMatch = cookies.match(/sessionId=([^;]+)/);
      if (sessionMatch) {
        return sessionMatch[1];
      }
    }

    // Try to extract from header
    const sessionHeader = routingInfo.headers["x-session-id"];
    if (sessionHeader) {
      return sessionHeader;
    }

    // Fallback to client ID
    return routingInfo.clientId;
  }

  /**
   * Record request metrics
   */
  recordRequest(
    serverId: string,
    responseTime: number,
    success: boolean,
  ): void {
    // eslint-disable-next-line functional/immutable-data
    this.metrics.totalRequests++;

    if (success) {
      // eslint-disable-next-line functional/immutable-data
      this.metrics.successfulRequests++;
    } else {
      // eslint-disable-next-line functional/immutable-data
      this.metrics.failedRequests++;
    }

    // Update server metrics
    const serverMetrics = this.metrics.serverMetrics[serverId];
    if (serverMetrics) {
      // eslint-disable-next-line functional/immutable-data
      serverMetrics.requests++;
      // eslint-disable-next-line functional/immutable-data
      serverMetrics.responseTime = (serverMetrics.responseTime + responseTime) /
        2; // Moving average
    }

    // Update global average response time
    // eslint-disable-next-line functional/immutable-data
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime + responseTime) / 2;
  }

  /**
   * Update connection count
   */
  updateConnectionCount(serverId: string, delta: number): void {
    this.healthChecker.updateConnectionCount(serverId, delta);
    // eslint-disable-next-line functional/immutable-data
    this.metrics.activeConnections = Math.max(
      0,
      this.metrics.activeConnections + delta,
    );

    const serverMetrics = this.metrics.serverMetrics[serverId];
    if (serverMetrics) {
      // eslint-disable-next-line functional/immutable-data
      serverMetrics.connections = Math.max(
        0,
        serverMetrics.connections + delta,
      );
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    // eslint-disable-next-line functional/immutable-data
    this.metricsTimer = setInterval(() => {
      // Calculate requests per second
      const now = Date.now();
      // eslint-disable-next-line functional/immutable-data
      this.metrics.requestsPerSecond = this.metrics.totalRequests; // Simplified calculation

      // Reset counters for next interval
      // eslint-disable-next-line functional/immutable-data
      this.metrics.totalRequests = 0;
      // eslint-disable-next-line functional/immutable-data
      this.metrics.successfulRequests = 0;
      // eslint-disable-next-line functional/immutable-data
      this.metrics.failedRequests = 0;

      this.emit("metrics", this.metrics);
    }, 60000); // Every minute
  }

  /**
   * Get current metrics
   */
  getMetrics(): LoadBalancingMetrics {
    return { ...this.metrics };
  }

  /**
   * Get server list
   */
  getServers(): BackendServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get healthy servers
   */
  getHealthyServers(): BackendServer[] {
    const healthyIds = this.healthChecker.getHealthyServers();
    return healthyIds
      .map((id) => this.servers.get(id))
      .filter((server) => server !== undefined) as BackendServer[];
  }

  /**
   * Get server health status
   */
  getServerHealth(serverId: string): ServerHealth | null {
    return this.healthChecker.getServerHealth(serverId);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LoadBalancerConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };
    console.log(colors.blue("⚙️ Load balancer configuration updated"));
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log(colors.blue("🛑 Shutting down Load Balancer..."));
    this.stop();
    // eslint-disable-next-line functional/immutable-data
    this.servers.clear();
    this.removeAllListeners();
  }
}

/**
 * Default load balancer configuration
 */
export const DEFAULT_LOAD_BALANCER_CONFIG: LoadBalancerConfig = {
  algorithm: "least_connections",
  healthCheckInterval: 30000, // 30 seconds
  healthCheckTimeout: 5000, // 5 seconds
  maxFailures: 3,
  retryInterval: 60000, // 1 minute
  connectionTimeout: 10000, // 10 seconds
  enableStickySessions: false,
  sessionTimeout: 1800000, // 30 minutes
  enableMetrics: true,
  autoScaling: {
    enabled: false,
    minServers: 2,
    maxServers: 10,
    scaleUpThreshold: 80, // 80% CPU/Memory
    scaleDownThreshold: 30, // 30% CPU/Memory
    cooldownPeriod: 300000, // 5 minutes
  },
};
