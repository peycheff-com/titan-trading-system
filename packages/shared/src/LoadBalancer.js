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
// Simple color logging utility
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};
/**
 * Session management for sticky sessions
 */
class SessionManager {
    sessionTimeout;
    sessions = new Map();
    constructor(sessionTimeout) {
        this.sessionTimeout = sessionTimeout;
    }
    /**
     * Get server for session
     */
    getServerForSession(sessionId) {
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
    setServerForSession(sessionId, serverId) {
        // eslint-disable-next-line functional/immutable-data
        this.sessions.set(sessionId, {
            serverId,
            lastAccess: Date.now(),
        });
    }
    /**
     * Clean up expired sessions
     */
    cleanup() {
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
    getActiveSessionsCount() {
        return this.sessions.size;
    }
}
/**
 * Health checker for backend servers
 */
class HealthChecker extends EventEmitter {
    servers;
    config;
    healthStatus = new Map();
    checkTimer = null;
    constructor(servers, config) {
        super();
        this.servers = servers;
        this.config = config;
    }
    /**
     * Start health checking
     */
    start() {
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
        console.log(colors.green(`🏥 Health checker started (${this.config.healthCheckInterval}ms interval)`));
    }
    /**
     * Stop health checking
     */
    stop() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            // eslint-disable-next-line functional/immutable-data
            this.checkTimer = null;
        }
    }
    /**
     * Check all servers health
     */
    async checkAllServers() {
        const promises = Array.from(this.servers.values()).map((server) => this.checkServerHealth(server));
        await Promise.allSettled(promises);
    }
    /**
     * Check individual server health
     */
    async checkServerHealth(server) {
        const startTime = Date.now();
        // eslint-disable-next-line functional/no-let
        let isHealthy = false;
        // eslint-disable-next-line functional/no-let
        let responseTime = 0;
        try {
            const healthCheckUrl = `${server.protocol}://${server.host}:${server.port}${server.healthCheckPath || "/health"}`;
            await this.makeHealthCheckRequest(healthCheckUrl);
            responseTime = Date.now() - startTime;
            isHealthy = responseTime < this.config.healthCheckTimeout;
        }
        catch (error) {
            responseTime = Date.now() - startTime;
            isHealthy = false;
        }
        // Update health status
        const currentHealth = this.healthStatus.get(server.id);
        const consecutiveFailures = isHealthy
            ? 0
            : (currentHealth?.consecutiveFailures || 0) + 1;
        const health = {
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
    makeHealthCheckRequest(url) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const client = urlObj.protocol === "https:" ? https : http;
            const req = client.request({
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                method: "GET",
                timeout: this.config.healthCheckTimeout,
            }, (res) => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                }
                else {
                    reject(new Error(`Health check failed with status ${res.statusCode}`));
                }
            });
            req.on("error", reject);
            req.on("timeout", () => reject(new Error("Health check timeout")));
            req.end();
        });
    }
    /**
     * Get server health status
     */
    getServerHealth(serverId) {
        return this.healthStatus.get(serverId) || null;
    }
    /**
     * Get all healthy servers
     */
    getHealthyServers() {
        return Array.from(this.healthStatus.entries())
            .filter(([, health]) => health.isHealthy)
            .map(([serverId]) => serverId);
    }
    /**
     * Update server connection count
     */
    updateConnectionCount(serverId, delta) {
        const health = this.healthStatus.get(serverId);
        if (health) {
            // eslint-disable-next-line functional/immutable-data
            health.currentConnections = Math.max(0, health.currentConnections + delta);
        }
    }
}
/**
 * Load Balancer
 */
export class LoadBalancer extends EventEmitter {
    config;
    servers = new Map();
    healthChecker;
    sessionManager;
    roundRobinIndex = 0;
    metrics;
    metricsTimer = null;
    sessionCleanupTimer = null;
    constructor(config) {
        super();
        this.config = config;
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
        console.log(colors.blue(`🔄 Load Balancer initialized with ${config.algorithm} algorithm`));
    }
    /**
     * Add backend server
     */
    addServer(server) {
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
        console.log(colors.green(`➕ Added server ${server.id} (${server.host}:${server.port})`));
    }
    /**
     * Remove backend server
     */
    removeServer(serverId) {
        // eslint-disable-next-line functional/immutable-data
        this.servers.delete(serverId);
        // eslint-disable-next-line functional/immutable-data
        delete this.metrics.serverMetrics[serverId];
        console.log(colors.yellow(`➖ Removed server ${serverId}`));
    }
    /**
     * Start load balancer
     */
    start() {
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
    stop() {
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
    selectServer(routingInfo) {
        const healthyServers = this.healthChecker
            .getHealthyServers()
            .map((id) => this.servers.get(id))
            .filter((server) => server !== undefined);
        if (healthyServers.length === 0) {
            console.warn(colors.red("⚠️ No healthy servers available"));
            return null;
        }
        // Check for sticky session
        if (this.config.enableStickySessions) {
            const sessionId = this.extractSessionId(routingInfo);
            if (sessionId) {
                const stickyServerId = this.sessionManager.getServerForSession(sessionId);
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
        let selectedServer = null;
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
    selectRoundRobin(servers) {
        const server = servers[this.roundRobinIndex % servers.length];
        // eslint-disable-next-line functional/immutable-data
        this.roundRobinIndex = (this.roundRobinIndex + 1) % servers.length;
        return server;
    }
    /**
     * Weighted round robin selection
     */
    selectWeightedRoundRobin(servers) {
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
    selectLeastConnections(servers) {
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
    selectLeastResponseTime(servers) {
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
    selectIpHash(servers, routingInfo) {
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
    selectResourceBased(servers) {
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
    simpleHash(str) {
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
    extractSessionId(routingInfo) {
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
    recordRequest(serverId, responseTime, success) {
        // eslint-disable-next-line functional/immutable-data
        this.metrics.totalRequests++;
        if (success) {
            // eslint-disable-next-line functional/immutable-data
            this.metrics.successfulRequests++;
        }
        else {
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
    updateConnectionCount(serverId, delta) {
        this.healthChecker.updateConnectionCount(serverId, delta);
        // eslint-disable-next-line functional/immutable-data
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections + delta);
        const serverMetrics = this.metrics.serverMetrics[serverId];
        if (serverMetrics) {
            // eslint-disable-next-line functional/immutable-data
            serverMetrics.connections = Math.max(0, serverMetrics.connections + delta);
        }
    }
    /**
     * Start metrics collection
     */
    startMetricsCollection() {
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
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Get server list
     */
    getServers() {
        return Array.from(this.servers.values());
    }
    /**
     * Get healthy servers
     */
    getHealthyServers() {
        const healthyIds = this.healthChecker.getHealthyServers();
        return healthyIds
            .map((id) => this.servers.get(id))
            .filter((server) => server !== undefined);
    }
    /**
     * Get server health status
     */
    getServerHealth(serverId) {
        return this.healthChecker.getServerHealth(serverId);
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        // eslint-disable-next-line functional/immutable-data
        this.config = { ...this.config, ...config };
        console.log(colors.blue("⚙️ Load balancer configuration updated"));
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
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
export const DEFAULT_LOAD_BALANCER_CONFIG = {
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
//# sourceMappingURL=LoadBalancer.js.map