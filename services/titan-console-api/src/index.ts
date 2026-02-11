import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { getNatsClient } from '@titan/shared';

dotenv.config();

const fastify = Fastify({ logger: true });

async function main() {
  try {
    await fastify.register(cors, {
      origin: '*', // Lockdown in production
    });

    const nats = getNatsClient();
    await nats.connect({
      name: 'titan-console-api',
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    });
    console.log(`[titan-console-api] Connected to NATS.`);

    // Health check
    fastify.get('/health', async () => {
      return { status: 'ok' };
    });

    // Register plugins
    await fastify.register(import('./plugins/auth.js'));

    // Register routes
    await fastify.register(import('./routes/ops.js'));
    await fastify.register(import('./routes/credentials.js'));

    const port = Number(process.env.PORT) || 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`[titan-console-api] Listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
