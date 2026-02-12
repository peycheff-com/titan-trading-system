import { buildApp } from './index.js';

async function main() {
  const app = await buildApp();
  const port = Number(process.env.PORT) || 3001;
  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`[titan-console-api] Listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
