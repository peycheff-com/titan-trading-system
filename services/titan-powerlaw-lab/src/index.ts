import { PowerLawService } from './service.js';
import { Logger } from '@titan/shared';

const logger = Logger.getInstance('powerlaw:index');

async function main() {
  logger.info(`[PowerLaw] Starting with NATS_USER=${process.env.NATS_USER ? 'SET' : 'UNSET'}`);
  const service = new PowerLawService();
  await service.start();
}

main().catch(console.error);
