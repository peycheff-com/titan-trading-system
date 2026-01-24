/**
 * Health Server for Titan Phase 3 - Sentinel
 *
 * Exposes health check endpoint on port 8084 for monitoring and orchestration.
 *
 * Requirements: System Integration 11.2, 22.3
 * - GET /health - Returns health status with connection info (503 if NATS/Exchanges down)
 * - GET /status - Returns detailed mode and actions
 */

import http from 'http';
// import { NatsClient } from '@titan/shared'; // Assuming shared NATS client wrapper available or similar

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  uptime: number;
  dependencies: {
    nats: 'connected' | 'disconnected' | 'reconnecting';
    binance: 'connected' | 'disconnected';
    bybit: 'connected' | 'disconnected';
  };
  metrics: {
    regime: string;
    budget: number;
  };
  timestamp: string;
}

export interface DetailedStatus {
  mode: 'NORMAL' | 'CAUTIOUS' | 'DEFENSIVE' | 'EMERGENCY';
  reasons: string[];
  actions: string[];
  unsafe_actions: string[];
}

export interface HealthServerConfig {
  port: number;
  getStatus: () => HealthStatus;
  getDetailedStatus: () => DetailedStatus;
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
    } else if (req.method === 'GET' && url === '/status') {
      this.handleStatusCheck(res);
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
   * Handle status check endpoint
   * GET /status
   */
  private handleStatusCheck(res: http.ServerResponse): void {
    try {
      const status = this.config.getDetailedStatus();
      res.writeHead(200);
      res.end(JSON.stringify(status, null, 2));
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal Error' }));
    }
  }
}
