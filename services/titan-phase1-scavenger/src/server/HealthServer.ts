/**
 * Health Server for Titan Phase 1 - Scavenger
 *
 * Exposes health check endpoint on port 8081 for monitoring and orchestration.
 *
 * Requirements: System Integration 11.2, 22.3
 * - GET /health - Returns health status with connection info
 */

import http from 'http';
import { getMetrics } from '../monitoring/PrometheusMetrics.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  uptime: number;
  connections: {
    binance: 'connected' | 'disconnected' | 'reconnecting';
    executionService: 'connected' | 'disconnected' | 'unknown';
  };
  metrics: {
    activeTraps: number;
    tickRate: number;
    lastTrapSprung: number | null;
  };
  timestamp: string;
}

export interface HealthServerConfig {
  port: number;
  getStatus: () => HealthStatus;
}

export class HealthServer {
  private server: http.Server | null = null;
  private config: HealthServerConfig;
  private startTime: number;

  constructor(config: HealthServerConfig) {
    this.config = config;
    this.startTime = Date.now();
  }

  /**
   * Start the health server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line functional/immutable-data
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.warn(`⚠️ Health server port ${this.config.port} already in use`);
          resolve(); // Don't fail startup if port is in use
        } else {
          reject(error);
        }
      });

      this.server.listen(this.config.port, () => {
        console.log(`✅ Health server listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the health server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('✅ Health server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route requests
    const url = req.url || '/';

    if (req.method === 'GET' && (url === '/health' || url === '/')) {
      this.handleHealthCheck(res);
    } else if (req.method === 'GET' && url === '/health/live') {
      this.handleLivenessCheck(res);
    } else if (req.method === 'GET' && url === '/health/ready') {
      this.handleReadinessCheck(res);
    } else if (req.method === 'GET' && url === '/metrics') {
      this.handleMetrics(res);
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Handle health check endpoint
   * GET /health
   */
  private handleHealthCheck(res: http.ServerResponse): void {
    try {
      const status = this.config.getStatus();
      const httpStatus =
        status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503;

      res.writeHead(httpStatus);
      res.end(JSON.stringify(status, null, 2));
    } catch (error) {
      res.writeHead(500);
      res.end(
        JSON.stringify({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  /**
   * Handle liveness check endpoint
   * GET /health/live
   */
  private handleLivenessCheck(res: http.ServerResponse): void {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        status: 'alive',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  /**
   * Handle readiness check endpoint
   * GET /health/ready
   */
  private handleReadinessCheck(res: http.ServerResponse): void {
    try {
      const status = this.config.getStatus();
      const isReady = status.connections.binance === 'connected';

      res.writeHead(isReady ? 200 : 503);
      res.end(
        JSON.stringify({
          ready: isReady,
          connections: status.connections,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error) {
      res.writeHead(503);
      res.end(
        JSON.stringify({
          ready: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  /**
   * Handle metrics endpoint
   * GET /metrics
   */
  private handleMetrics(res: http.ServerResponse): void {
    try {
      const metrics = getMetrics();
      const metricsText = metrics.export();

      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.writeHead(200);
      res.end(metricsText);
    } catch (error) {
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }
}
