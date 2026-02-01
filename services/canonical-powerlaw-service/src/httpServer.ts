/**
 * HTTP Server for health/status/metrics endpoints
 */

import express, { type Application, type Request, type Response } from 'express';
import { CanonicalPowerLawService } from './CanonicalPowerLawService.js';
import { getPowerLawMetrics } from './metrics.js';

export function createHttpServer(service: CanonicalPowerLawService, port: number): Application {
  const app = express();
  const promMetrics = getPowerLawMetrics();

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    const health = service.getHealth();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // Liveness probe
  app.get('/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'alive' });
  });

  // Readiness probe
  app.get('/ready', (_req: Request, res: Response) => {
    const health = service.getHealth();
    const ready = health.status !== 'unhealthy';
    res.status(ready ? 200 : 503).json({ ready, ...health });
  });

  // Status endpoint
  app.get('/status', (_req: Request, res: Response) => {
    const symbols = service.getSymbols();
    res.json({
      service: 'canonical-powerlaw-service',
      version: '1.0.0',
      uptime: process.uptime(),
      symbols: symbols.length,
      symbolList: symbols,
    });
  });

  // Get metrics for a symbol
  app.get('/metrics/:symbol', (req: Request, res: Response) => {
    const { symbol } = req.params;
    const metrics = service.getMetrics(symbol);

    if (!metrics) {
      res.status(404).json({ error: `No metrics for symbol: ${symbol}` });
      return;
    }

    res.json(metrics);
  });

  // Prometheus metrics endpoint
  app.get('/metrics', async (_req: Request, res: Response) => {
    // Update symbol metrics gauges
    const symbols = service.getSymbols();
    promMetrics.updateActiveSymbols(symbols.length);

    for (const symbol of symbols) {
      const m = service.getMetrics(symbol);
      if (m) {
        // Map schema status to metrics status type
        const healthStatus = (m.health.status === 'unknown' ? 'stale' : m.health.status) as
          | 'ok'
          | 'stale'
          | 'low_sample'
          | 'fit_failed';

        promMetrics.updateSymbolMetrics(
          m.venue,
          m.symbol,
          m.tail.alpha ?? 0,
          0, // ES95 would be computed from tail params, not stored in metrics schema
          healthStatus,
          m.vol_cluster?.state ?? 'stable',
          m.window.n,
        );
      }
    }

    // Export Prometheus format
    try {
      const metrics = await promMetrics.export();
      res.set('Content-Type', promMetrics.contentType);
      res.send(metrics);
    } catch (err) {
      res.status(500).json({ error: 'Failed to export metrics' });
    }
  });

  app.listen(port, () => {
    console.log(`[CanonicalPowerLaw] HTTP server listening on port ${port}`);
  });

  return app;
}
