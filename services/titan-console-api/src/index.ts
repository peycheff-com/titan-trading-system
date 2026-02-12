import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { getNatsClient, Logger } from '@titan/shared';

dotenv.config();

const log = Logger.getInstance('titan-console-api');

export async function buildApp() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Auth'],
  });

  const natsUrl = process.env.NATS_URL;
  if (!natsUrl) {
    throw new Error('FATAL: NATS_URL environment variable is required.');
  }

  const nats = getNatsClient();
  await nats.connect({
    name: 'titan-console-api',
    servers: [natsUrl],
  });
  log.info(`Connected to NATS at ${natsUrl}`);

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok' };
  });

  // Register plugins
  await fastify.register(import('./plugins/auth.js'));

  // Register routes
  await fastify.register(import('./routes/auth.js'));
  await fastify.register(import('./routes/ops.js'));
  await fastify.register(import('./routes/credentials.js'));

  return fastify;
}
