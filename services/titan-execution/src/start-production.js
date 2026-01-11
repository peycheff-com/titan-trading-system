#!/usr/bin/env node

/**
 * Start Production Server
 * 
 * Simple entry point to launch the production-ready web UI and trading system.
 */

import { ProductionServer } from './ProductionServerV2.js';

const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
};

const server = new ProductionServer({
  port: parseInt(process.env.PORT) || 3000,
  logger,
});

// Handle shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await server.stop();
  process.exit(0);
});

// Start server
server.start().catch(err => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
