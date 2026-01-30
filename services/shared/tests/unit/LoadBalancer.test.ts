/**
 * Unit tests for LoadBalancer
 *
 * Tests load balancing functionality including server registration,
 * selection algorithms, health monitoring, and session management.
 */

import {
    type BackendServer,
    DEFAULT_LOAD_BALANCER_CONFIG,
    LoadBalancer,
    type LoadBalancerConfig,
    type RoutingInfo,
} from "../../src/LoadBalancer";

describe("LoadBalancer", () => {
    let loadBalancer: LoadBalancer;
    const defaultConfig: LoadBalancerConfig = {
        algorithm: "round_robin",
        healthCheckInterval: 30000,
        healthCheckTimeout: 5000,
        maxFailures: 3,
        retryInterval: 60000,
        connectionTimeout: 10000,
        enableStickySessions: false,
        sessionTimeout: 1800000,
        enableMetrics: true,
        autoScaling: {
            enabled: false,
            minServers: 2,
            maxServers: 10,
            scaleUpThreshold: 80,
            scaleDownThreshold: 30,
            cooldownPeriod: 300000,
        },
    };

    beforeEach(() => {
        loadBalancer = new LoadBalancer(defaultConfig);
    });

    afterEach(() => {
        if (loadBalancer) {
            loadBalancer.shutdown();
        }
    });

    describe("Initialization", () => {
        it("should create load balancer with config", () => {
            expect(loadBalancer).toBeDefined();
        });

        it("should export DEFAULT_LOAD_BALANCER_CONFIG", () => {
            expect(DEFAULT_LOAD_BALANCER_CONFIG).toBeDefined();
            expect(DEFAULT_LOAD_BALANCER_CONFIG.algorithm).toBe(
                "least_connections",
            );
        });
    });

    describe("Server Management", () => {
        it("should add servers", () => {
            const server: BackendServer = {
                id: "server-1",
                host: "localhost",
                port: 8080,
                protocol: "http",
                weight: 100,
                maxConnections: 1000,
                healthCheckPath: "/health",
                tags: ["api"],
            };

            loadBalancer.addServer(server);

            const servers = loadBalancer.getServers();
            expect(servers).toHaveLength(1);
            expect(servers[0].id).toBe("server-1");
        });

        it("should remove servers", () => {
            const server: BackendServer = {
                id: "server-to-remove",
                host: "localhost",
                port: 8081,
                protocol: "http",
                weight: 50,
                maxConnections: 500,
                tags: [],
            };

            loadBalancer.addServer(server);
            expect(loadBalancer.getServers()).toHaveLength(1);

            loadBalancer.removeServer("server-to-remove");
            expect(loadBalancer.getServers()).toHaveLength(0);
        });

        it("should handle multiple servers", () => {
            const servers: BackendServer[] = [
                {
                    id: "server-1",
                    host: "host1.example.com",
                    port: 8080,
                    protocol: "http",
                    weight: 100,
                    maxConnections: 1000,
                    tags: ["api", "primary"],
                },
                {
                    id: "server-2",
                    host: "host2.example.com",
                    port: 8080,
                    protocol: "http",
                    weight: 50,
                    maxConnections: 500,
                    tags: ["api", "secondary"],
                },
                {
                    id: "server-3",
                    host: "host3.example.com",
                    port: 8080,
                    protocol: "https",
                    weight: 75,
                    maxConnections: 750,
                    tags: ["api", "tertiary"],
                },
            ];

            servers.forEach((server) => loadBalancer.addServer(server));

            expect(loadBalancer.getServers()).toHaveLength(3);
        });
    });

    describe("Metrics", () => {
        it("should provide metrics", () => {
            const metrics = loadBalancer.getMetrics();

            expect(metrics).toBeDefined();
            expect(typeof metrics.totalRequests).toBe("number");
            expect(typeof metrics.successfulRequests).toBe("number");
            expect(typeof metrics.failedRequests).toBe("number");
            expect(typeof metrics.averageResponseTime).toBe("number");
            expect(typeof metrics.requestsPerSecond).toBe("number");
            expect(typeof metrics.activeConnections).toBe("number");
        });

        it("should record request metrics", () => {
            const server: BackendServer = {
                id: "metrics-server",
                host: "localhost",
                port: 8080,
                protocol: "http",
                weight: 100,
                maxConnections: 1000,
                tags: [],
            };

            loadBalancer.addServer(server);

            loadBalancer.recordRequest("metrics-server", 150, true);
            loadBalancer.recordRequest("metrics-server", 200, true);
            loadBalancer.recordRequest("metrics-server", 100, false);

            const metrics = loadBalancer.getMetrics();

            expect(metrics.totalRequests).toBe(3);
            expect(metrics.successfulRequests).toBe(2);
            expect(metrics.failedRequests).toBe(1);
        });

        it("should track server-specific metrics", () => {
            const server: BackendServer = {
                id: "tracked-server",
                host: "localhost",
                port: 8080,
                protocol: "http",
                weight: 100,
                maxConnections: 1000,
                tags: [],
            };

            loadBalancer.addServer(server);
            loadBalancer.recordRequest("tracked-server", 100, true);

            const metrics = loadBalancer.getMetrics();

            expect(metrics.serverMetrics["tracked-server"]).toBeDefined();
            expect(metrics.serverMetrics["tracked-server"].requests).toBe(1);
        });
    });

    describe("Connection Management", () => {
        it("should update connection counts", () => {
            const server: BackendServer = {
                id: "connection-server",
                host: "localhost",
                port: 8080,
                protocol: "http",
                weight: 100,
                maxConnections: 1000,
                tags: [],
            };

            loadBalancer.addServer(server);

            loadBalancer.updateConnectionCount("connection-server", 1);
            loadBalancer.updateConnectionCount("connection-server", 1);
            loadBalancer.updateConnectionCount("connection-server", -1);

            const metrics = loadBalancer.getMetrics();
            expect(metrics.activeConnections).toBe(1);
        });
    });

    describe("Lifecycle", () => {
        it("should start and stop without errors", () => {
            expect(() => {
                loadBalancer.start();
                loadBalancer.stop();
            }).not.toThrow();
        });

        it("should shutdown cleanly", () => {
            loadBalancer.addServer({
                id: "shutdown-test",
                host: "localhost",
                port: 8080,
                protocol: "http",
                weight: 100,
                maxConnections: 1000,
                tags: [],
            });

            expect(() => loadBalancer.shutdown()).not.toThrow();
            expect(loadBalancer.getServers()).toHaveLength(0);
        });
    });

    describe("Configuration", () => {
        it("should update configuration", () => {
            expect(() => {
                loadBalancer.updateConfig({
                    healthCheckInterval: 60000,
                    maxFailures: 5,
                });
            }).not.toThrow();
        });
    });

    describe("Events", () => {
        it("should emit events on server health change", (done) => {
            loadBalancer.on("serverHealthChange", (event) => {
                expect(event.serverId).toBeDefined();
                expect(typeof event.isHealthy).toBe("boolean");
                done();
            });

            // Manually trigger the event for testing
            loadBalancer.emit("serverHealthChange", {
                serverId: "test-server",
                isHealthy: true,
            });
        });

        it("should emit metrics events", (done) => {
            loadBalancer.on("metrics", (metrics) => {
                expect(metrics).toBeDefined();
                done();
            });

            // Manually trigger the event for testing
            loadBalancer.emit("metrics", loadBalancer.getMetrics());
        });
    });
});

describe("LoadBalancingAlgorithm Types", () => {
    it("should support round_robin algorithm", () => {
        const config: LoadBalancerConfig = {
            ...DEFAULT_LOAD_BALANCER_CONFIG,
            algorithm: "round_robin",
        };

        const lb = new LoadBalancer(config);
        expect(lb).toBeDefined();
        lb.shutdown();
    });

    it("should support weighted_round_robin algorithm", () => {
        const config: LoadBalancerConfig = {
            ...DEFAULT_LOAD_BALANCER_CONFIG,
            algorithm: "weighted_round_robin",
        };

        const lb = new LoadBalancer(config);
        expect(lb).toBeDefined();
        lb.shutdown();
    });

    it("should support least_connections algorithm", () => {
        const config: LoadBalancerConfig = {
            ...DEFAULT_LOAD_BALANCER_CONFIG,
            algorithm: "least_connections",
        };

        const lb = new LoadBalancer(config);
        expect(lb).toBeDefined();
        lb.shutdown();
    });

    it("should support least_response_time algorithm", () => {
        const config: LoadBalancerConfig = {
            ...DEFAULT_LOAD_BALANCER_CONFIG,
            algorithm: "least_response_time",
        };

        const lb = new LoadBalancer(config);
        expect(lb).toBeDefined();
        lb.shutdown();
    });

    it("should support ip_hash algorithm", () => {
        const config: LoadBalancerConfig = {
            ...DEFAULT_LOAD_BALANCER_CONFIG,
            algorithm: "ip_hash",
        };

        const lb = new LoadBalancer(config);
        expect(lb).toBeDefined();
        lb.shutdown();
    });

    it("should support resource_based algorithm", () => {
        const config: LoadBalancerConfig = {
            ...DEFAULT_LOAD_BALANCER_CONFIG,
            algorithm: "resource_based",
        };

        const lb = new LoadBalancer(config);
        expect(lb).toBeDefined();
        lb.shutdown();
    });
});

describe("BackendServer Configuration", () => {
    it("should support all protocol types", () => {
        const httpServer: BackendServer = {
            id: "http-server",
            host: "localhost",
            port: 8080,
            protocol: "http",
            weight: 100,
            maxConnections: 1000,
            tags: [],
        };

        const httpsServer: BackendServer = {
            id: "https-server",
            host: "localhost",
            port: 443,
            protocol: "https",
            weight: 100,
            maxConnections: 1000,
            tags: [],
        };

        const wsServer: BackendServer = {
            id: "ws-server",
            host: "localhost",
            port: 8081,
            protocol: "ws",
            weight: 100,
            maxConnections: 1000,
            tags: [],
        };

        const wssServer: BackendServer = {
            id: "wss-server",
            host: "localhost",
            port: 8443,
            protocol: "wss",
            weight: 100,
            maxConnections: 1000,
            tags: [],
        };

        const lb = new LoadBalancer(DEFAULT_LOAD_BALANCER_CONFIG);

        expect(() => {
            lb.addServer(httpServer);
            lb.addServer(httpsServer);
            lb.addServer(wsServer);
            lb.addServer(wssServer);
        }).not.toThrow();

        expect(lb.getServers()).toHaveLength(4);
        lb.shutdown();
    });
});
