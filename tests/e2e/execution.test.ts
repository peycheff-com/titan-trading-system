
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { connect, StringCodec, NatsConnection } from 'nats';
import { randomUUID } from 'crypto';

/**
 * G3: E2E Execution Correctness
 * Requires: docker compose up (Brain, Execution, NATS, DBs)
 */
describe('E2E: Execution Loop', () => {
  let nc: NatsConnection;
  const sc = StringCodec();

  beforeAll(async () => {
    // Connect to NATS (Assumes infrastructure is running)
    try {
        nc = await connect({ servers: 'nats://localhost:4222', reconnect: false });
    } catch (e) {
        console.warn("Skipping E2E test - NATS not available");
        // We mark test as skipped if infra is down, to avoid CI failure on unit test stage
    }
  });

  afterAll(async () => {
    if (nc) await nc.close();
  });

  it('should process an intent and return a fill', async () => {
    if (!nc) {
        console.warn("NATS not connected, skipping test");
        return;
    }

    const signalId = randomUUID();
    const intent = {
      signal_id: signalId,
      symbol: 'BTC/USDT',
      intent_type: 'Market',
      size: 0.1,
      direction: 1, // Buy
      timestamp: Date.now(),
    };

    // Promise that resolves when fill is received
    const fillPromise = new Promise<any>(async (resolve, reject) => {
        const sub = nc.subscribe('titan.execution.fill.*');
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for fill'));
            sub.unsubscribe();
        }, 5000);

        for await (const m of sub) {
            const data = JSON.parse(sc.decode(m.data));
            if (data.signal_id === signalId) {
                clearTimeout(timeout);
                resolve(data);
                break;
            }
        }
    });

    // Publish Intent
    nc.publish('titan.execution.intent', sc.encode(JSON.stringify(intent)));

    // Await Fill
    const fill = await fillPromise;

    // Assertions
    expect(fill).toBeDefined();
    expect(fill.signal_id).toBe(signalId);
    expect(fill.status).toBe('FILLED');
    expect(fill.filled_size).toBe(0.1);
  }, 10000);
});
