/* eslint-disable functional/no-let */
/* eslint-disable functional/immutable-data */
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index.js';

describe('Health Check', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NATS_URL = 'nats://localhost:4222';
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  test('GET /health returns 200 OK', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
