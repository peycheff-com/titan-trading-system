import { buildApp } from './index.js';
import { Logger } from '@titan/shared';

const logger = Logger.getInstance('console-api:server');

async function main() {
  const app = await buildApp();
  const port = Number(process.env.PORT) || 3000;
  try {
    await app.listen({ port, host: '0.0.0.0' });
    logger.info(`[titan-console-api] Listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
