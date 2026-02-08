/**
 * SSE Reconnection Tests
 *
 * Tests the Server-Sent Events intent stream endpoint
 * with Last-Event-ID reconnection support.
 *
 * Uses a real Fastify HTTP server + fetch with AbortController
 * since SSE is a long-lived stream that inject() can't handle.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { OperatorController } from '../../../src/server/controllers/OperatorController.js';
import { OperatorIntentService } from '../../../src/services/OperatorIntentService.js';
import { OperatorStateProjection } from '../../../src/services/OperatorStateProjection.js';
import { calculateIntentSignature, type IntentReceipt } from '@titan/shared';
import crypto from 'crypto';

const OPS_SECRET = 'test-ops-secret-32chars!!!!!!!!';

const stubAuthMiddleware = {
  verifyToken: async () => { /* pass-through */ },
} as any;

function createStubBrain() {
  let armed = false;
  return {
    getStateManager: () => ({
      isArmed: () => armed,
      setArmed: (v: boolean) => { armed = v; },
      getMode: () => 'paper',
      setMode: () => {},
      isHalted: () => false,
      setHalted: () => {},
      getPositions: () => [],
      invalidateDashboardCache: () => {},
    }),
    getCircuitBreakerStatus: () => ({ active: false }),
    closeAllPositions: async () => {},
  } as any;
}

function makeIntentPayload(type: string = 'ARM') {
  const id = crypto.randomUUID();
  const base = {
    id,
    idempotency_key: `idem-${id}`,
    version: 1,
    type,
    params: {},
    operator_id: 'operator-1',
    reason: 'SSE test',
    submitted_at: new Date().toISOString(),
    ttl_seconds: 30,
  };

  const signature = calculateIntentSignature(
    { id: base.id, type: base.type, params: base.params, operator_id: base.operator_id },
    OPS_SECRET,
  );

  return { ...base, signature };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse SSE text into structured events.
 */
function parseSSE(text: string): Array<{ id?: string; event?: string; data?: string }> {
  const events: Array<{ id?: string; event?: string; data?: string }> = [];
  const rawEvents = text.split('\n\n').filter((e) => e.trim());

  for (const raw of rawEvents) {
    const ev: { id?: string; event?: string; data?: string } = {};
    for (const line of raw.split('\n')) {
      if (line.startsWith('id: ')) ev.id = line.slice(4);
      else if (line.startsWith('event: ')) ev.event = line.slice(7);
      else if (line.startsWith('data: ')) ev.data = line.slice(6);
    }
    if (ev.event || ev.data || ev.id) events.push(ev);
  }
  return events;
}

/**
 * Fetch SSE stream with timeout, collecting initial events.
 */
async function fetchSSE(
  url: string,
  headers?: Record<string, string>,
  collectMs = 500,
): Promise<{ status: number; headers: Headers; body: string }> {
  const ac = new AbortController();
  const resp = await fetch(url, {
    signal: ac.signal,
    headers: { ...headers, Accept: 'text/event-stream' },
  });

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let body = '';

  // Collect events for a short window then abort
  const timeout = setTimeout(() => ac.abort(), collectMs);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
  } catch {
    // Expected: AbortError when timeout fires
  } finally {
    clearTimeout(timeout);
  }

  return { status: resp.status, headers: resp.headers, body };
}

describe('SSE Reconnection', () => {
  let app: FastifyInstance;
  let intentService: OperatorIntentService;
  let baseUrl: string;

  beforeAll(async () => {
    const brain = createStubBrain();

    intentService = new OperatorIntentService({
      opsSecret: OPS_SECRET,
      executors: {
        ARM: async (): Promise<IntentReceipt> => {
          brain.getStateManager().setArmed(true);
          return { effect: 'armed', prior_state: { armed: false }, new_state: { armed: true } };
        },
        DISARM: async (): Promise<IntentReceipt> => {
          brain.getStateManager().setArmed(false);
          return { effect: 'disarmed', prior_state: { armed: true }, new_state: { armed: false } };
        },
      },
      verifiers: {},
      getStateHash: () => 'test-hash-123',
    });

    const stateProjection = new OperatorStateProjection(brain, intentService);

    const controller = new OperatorController(
      intentService,
      stateProjection,
      stubAuthMiddleware,
    );

    app = Fastify();
    controller.registerRoutes(app);
    // Listen on random port
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    // Seed some intents for reconnection tests
    const arm = makeIntentPayload('ARM');
    await app.inject({ method: 'POST', url: '/operator/intents', payload: arm });
    await sleep(200);

    const disarm = makeIntentPayload('DISARM');
    await app.inject({ method: 'POST', url: '/operator/intents', payload: disarm });
    await sleep(200);
  });

  afterAll(async () => {
    intentService.shutdown();
    await app.close();
  });

  // =========================================================================
  // Basic SSE stream
  // =========================================================================

  describe('GET /operator/intents/stream', () => {
    it('should return text/event-stream content type', async () => {
      const { headers } = await fetchSSE(`${baseUrl}/operator/intents/stream`);
      expect(headers.get('content-type')).toBe('text/event-stream');
      expect(headers.get('cache-control')).toBe('no-cache');
    });

    it('should include a connected event with event ID', async () => {
      const { body } = await fetchSSE(`${baseUrl}/operator/intents/stream`);
      const events = parseSSE(body);
      const connected = events.find((e) => e.event === 'connected');

      expect(connected).toBeDefined();
      expect(connected!.id).toBeDefined();

      const data = JSON.parse(connected!.data!);
      expect(data.timestamp).toBeDefined();
      expect(data.reconnected).toBe(false);
    });

    it('should include monotonically increasing event IDs', async () => {
      const { body } = await fetchSSE(`${baseUrl}/operator/intents/stream`);
      const events = parseSSE(body);
      const ids = events.filter((e) => e.id).map((e) => parseInt(e.id!, 10));

      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]);
      }
    });
  });

  // =========================================================================
  // Last-Event-ID reconnection
  // =========================================================================

  describe('Last-Event-ID reconnection', () => {
    it('should mark reconnected=true when Last-Event-ID is provided', async () => {
      const { body } = await fetchSSE(
        `${baseUrl}/operator/intents/stream`,
        { 'Last-Event-ID': '1' },
      );

      const events = parseSSE(body);
      const connected = events.find((e) => e.event === 'connected');
      expect(connected).toBeDefined();

      const data = JSON.parse(connected!.data!);
      expect(data.reconnected).toBe(true);
    });

    it('should send intent_catchup events when reconnecting', async () => {
      const { body } = await fetchSSE(
        `${baseUrl}/operator/intents/stream`,
        { 'Last-Event-ID': '0' },
      );

      const events = parseSSE(body);
      const catchupEvents = events.filter((e) => e.event === 'intent_catchup');

      // Should have at least one catchup event (seeded intents)
      expect(catchupEvents.length).toBeGreaterThan(0);

      for (const ev of catchupEvents) {
        const data = JSON.parse(ev.data!);
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('type');
        expect(data).toHaveProperty('status');
      }
    });

    it('should include event IDs on catchup events', async () => {
      const { body } = await fetchSSE(
        `${baseUrl}/operator/intents/stream`,
        { 'Last-Event-ID': '0' },
      );

      const events = parseSSE(body);
      const catchupEvents = events.filter((e) => e.event === 'intent_catchup');

      for (const ev of catchupEvents) {
        expect(ev.id).toBeDefined();
        expect(parseInt(ev.id!, 10)).toBeGreaterThan(0);
      }
    });

    it('should not send catchup events on fresh connection', async () => {
      const { body } = await fetchSSE(`${baseUrl}/operator/intents/stream`);

      const events = parseSSE(body);
      const catchupEvents = events.filter((e) => e.event === 'intent_catchup');
      expect(catchupEvents.length).toBe(0);
    });

    it('should handle non-numeric Last-Event-ID gracefully', async () => {
      const { status, body } = await fetchSSE(
        `${baseUrl}/operator/intents/stream`,
        { 'Last-Event-ID': 'not-a-number' },
      );

      expect(status).toBe(200);
      const events = parseSSE(body);
      const connected = events.find((e) => e.event === 'connected');
      expect(connected).toBeDefined();

      // No catchup for invalid ID
      const catchupEvents = events.filter((e) => e.event === 'intent_catchup');
      expect(catchupEvents.length).toBe(0);
    });
  });
});
