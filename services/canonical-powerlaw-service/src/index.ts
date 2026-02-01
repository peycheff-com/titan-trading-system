/**
 * Canonical Power Law Service - Entry Point
 */

import { CanonicalPowerLawService } from './CanonicalPowerLawService.js';
import { createHttpServer } from './httpServer.js';
import { loadConfig } from './config/index.js';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Canonical Power Law Service');
  console.log('  Single Source of Truth for Tail Risk Metrics');
  console.log('='.repeat(60));

  const config = loadConfig();
  const service = new CanonicalPowerLawService(config);

  // Start HTTP server
  createHttpServer(service, config.httpPort);

  // Start the service
  await service.start();

  // Keep process alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
