import http from 'http';
import { NightlyOptimize } from './cron/NightlyOptimize.js';
import { NatsAdapter } from './messaging/NatsAdapter.js';

const logger = console;

import { configManager } from './config/ConfigManager.js';

// ... imports

async function main() {
  logger.log('🚀 Starting Titan AI Quant Service...');

  // Initialize Nightly Optimizer
  const optimizer = new NightlyOptimize();
  optimizer.start();

  logger.log('✅ Nightly Optimizer scheduled');

  // Start HTTP Server for Health Checks FIRST (before NATS)
  const port = configManager.getPort();
  const host = '0.0.0.0';

  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'healthy',
          service: 'titan-ai-quant',
        }),
      );
      return;
    }

    if (url.pathname === '/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          service: 'titan-ai-quant',
          status: 'running',
          optimizer: {
            running: optimizer.isRunning(),
            nextRun: optimizer.getNextRun(),
          },
          uptime: process.uptime(),
        }),
      );
      return;
    }

    if (url.pathname === '/trigger' && req.method === 'POST') {
      try {
        logger.log('⚠️ Manual optimization trigger received');
        // Run asynchronously
        optimizer
          .runNow()
          .then(() => {
            logger.log('✅ Manual optimization completed');
          })
          .catch((err) => {
            logger.error('❌ Manual optimization failed:', err);
          });

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Optimization triggered' }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(error) }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, host, () => {
    logger.log(`🌍 Server listening on http://${host}:${port}`);
  });

  // Initialize NATS Adapter AFTER server is running (non-blocking)
  try {
    const natsAdapter = new NatsAdapter(optimizer);
    await natsAdapter.init();
    logger.log('✅ NATS Adapter connected');

    // Initialize Real-Time Optimizer
    const { RealTimeOptimizer } = await import('./ai/RealTimeOptimizer.js');
    const realTimeOptimizer = new RealTimeOptimizer();
    realTimeOptimizer.setNatsAdapter(natsAdapter);
    realTimeOptimizer.start();
    logger.log('✅ Real-Time Optimizer started');
  } catch (error) {
    logger.warn('⚠️ NATS connection failed, running without event bus:', error);
    // Continue running without NATS - optimizer can still work via HTTP triggers
  }

  // Graceful Shutdown
  const shutdown = () => {
    logger.log('🛑 Shutting down...');
    optimizer.stop();
    server.close(() => {
      logger.log('✅ Server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('❌ Fatal Error:', err);
  process.exit(1);
});
