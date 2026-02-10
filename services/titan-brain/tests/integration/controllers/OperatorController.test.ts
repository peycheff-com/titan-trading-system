/**
 * OperatorController Integration Tests
 *
 * Tests the full HTTP lifecycle: submit intent → query intents → check state.
 * Uses Fastify's inject() for HTTP-level testing without a real server.
 *
 * Uses real timers (not fake) since Fastify inject() needs actual async resolution.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { OperatorController } from '../../../src/server/controllers/OperatorController.js';
import { OperatorIntentService } from '../../../src/services/OperatorIntentService.js';
import { OperatorStateProjection } from '../../../src/services/OperatorStateProjection.js';
import { calculateIntentSignature, type IntentReceipt } from '@titan/shared';
import crypto from 'crypto';

const OPS_SECRET = 'test-ops-secret-32chars!!!!!!!!';

// Stub AuthMiddleware that passes all requests through
// Stub AuthMiddleware that can inject users via header
const stubAuthMiddleware = {
  verifyToken: async (req: any) => { 
    if (req.headers['x-mock-user']) {
      try {
        req.user = JSON.parse(req.headers['x-mock-user']);
      } catch (e) {
        console.error('Failed to parse mock user', e);
      }
    }
  },
} as any;

// Stub BrainStateManager
function createStubStateManager() {
  let armed = false;
  let mode: 'paper' | 'live-limited' | 'live-full' = 'paper';
  let halted = false;

  return {
    isArmed: () => armed,
    setArmed: (v: boolean) => { armed = v; },
    getMode: () => mode,
    setMode: (m: 'paper' | 'live-limited' | 'live-full') => { mode = m; },
    isHalted: () => halted,
    setHalted: (v: boolean) => { halted = v; },
    getPositions: () => [],
    invalidateDashboardCache: () => {},
  };
}

// Stub TitanBrain
function createStubBrain() {
  const stateManager = createStubStateManager();
  return {
    getStateManager: () => stateManager,
    getCircuitBreakerStatus: () => ({ active: false }),
    closeAllPositions: async () => {},
  } as any;
}

function makeIntentPayload(
  type: string = 'ARM',
  overrides?: Record<string, unknown>,
) {
  const id = crypto.randomUUID();
  const base = {
    id,
    idempotency_key: `idem-${id}`,
    version: 1,
    type,
    params: {},
    operator_id: 'operator-1',
    reason: 'Integration test',
    submitted_at: new Date().toISOString(),
    ttl_seconds: 30,
    ...overrides,
  };

  const signature = calculateIntentSignature(
    { id: base.id, type: base.type, params: base.params as Record<string, unknown>, operator_id: base.operator_id },
    OPS_SECRET,
  );

  return { ...base, signature };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('OperatorController Integration', () => {
  let app: FastifyInstance;
  let intentService: OperatorIntentService;
  let brain: ReturnType<typeof createStubBrain>;

  beforeAll(async () => {
    brain = createStubBrain();

    intentService = new OperatorIntentService({
      opsSecret: OPS_SECRET,
      executors: {
        ARM: async (): Promise<IntentReceipt> => {
          brain.getStateManager().setArmed(true);
          return { effect: 'System armed', prior_state: { armed: false }, new_state: { armed: true } };
        },
        DISARM: async (): Promise<IntentReceipt> => {
          brain.getStateManager().setArmed(false);
          return { effect: 'System disarmed', prior_state: { armed: true }, new_state: { armed: false } };
        },
        SET_MODE: async (intent): Promise<IntentReceipt> => {
          const mode = (intent as any).params?.mode ?? 'paper';
          brain.getStateManager().setMode(mode);
          return { effect: `Mode set to ${mode}` };
        },
      },
      verifiers: {},
      getStateHash: () => 'test-hash-123',
    });

    const stateProjection = new OperatorStateProjection(brain, intentService);

    const stubEventReplayService = {
      reconstructStateAt: async () => ({
        getEquity: () => ({ total: 100000, currency: 'USD' }),
        getPositions: () => [],
        getAllocation: () => ({ w1: 0, w2: 0, w3: 0, timestamp: 0 }),
        getMode: () => 'paper',
        isArmed: () => false,
      }),
    } as any;

    const controller = new OperatorController(
      intentService,
      stateProjection,
      stubAuthMiddleware,
      stubEventReplayService,
    );

    app = Fastify();
    controller.registerRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    intentService.shutdown();
    await app.close();
  });

  // =========================================================================
  // POST /operator/intents
  // =========================================================================

  describe('POST /operator/intents', () => {
    it('should accept a valid ARM intent and return 200', async () => {
      const payload = makeIntentPayload('ARM');

      const response = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('ACCEPTED');
      expect(body.intent.id).toBe(payload.id);
      expect(body.intent.type).toBe('ARM');

      // Let executor complete
      await sleep(100);
    });

    it('should return 400 for malformed payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload: { bad: 'data' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.details.length).toBeGreaterThan(0);
    });

    it('should return 403 for invalid signature', async () => {
      // Ensure no in-flight DISARM
      await sleep(200);

      const payload = makeIntentPayload('DISARM');
      payload.signature = 'invalid-signature-hex';

      const response = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('SIGNATURE_INVALID');
    });

    it('should return 409 for state hash mismatch', async () => {
      await sleep(200);

      const payload = makeIntentPayload('SET_MODE', {
        state_hash: 'wrong-hash',
        params: { mode: 'live-limited' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('STATE_CONFLICT');
    });

    it('should return IDEMPOTENT_HIT for duplicate idempotency_key', async () => {
      await sleep(200);

      const payload = makeIntentPayload('DISARM');

      const r1 = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload,
      });
      expect(r1.statusCode).toBe(200);
      expect(r1.json().status).toBe('ACCEPTED');

      const r2 = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload,
      });
      expect(r2.statusCode).toBe(200);
      expect(r2.json().status).toBe('IDEMPOTENT_HIT');

      await sleep(100);
    });
  });

  // =========================================================================
  // GET /operator/intents
  // =========================================================================

  describe('GET /operator/intents', () => {
    it('should return intent list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/operator/intents',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('intents');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.intents)).toBe(true);
      expect(body.total).toBeGreaterThan(0);
    });

    it('should support ?limit= query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/operator/intents?limit=1',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().intents.length).toBeLessThanOrEqual(1);
    });

    it('should support ?type= filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/operator/intents?type=ARM',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      for (const intent of body.intents) {
        expect(intent.type).toBe('ARM');
      }
    });
  });

  // =========================================================================
  // GET /operator/state
  // =========================================================================

  describe('GET /operator/state', () => {
    it('should return unified OperatorState', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/operator/state',
      });

      expect(response.statusCode).toBe(200);
      const state = response.json();

      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('posture');
      expect(state).toHaveProperty('phases');
      expect(state).toHaveProperty('truth_confidence');
      expect(state).toHaveProperty('breaker');
      expect(state).toHaveProperty('active_incidents');
      expect(state).toHaveProperty('last_intents');
      expect(state).toHaveProperty('state_hash');
      expect(state).toHaveProperty('last_updated');
    });

    it('should have phase details with correct shape', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/operator/state',
      });

      const { phases } = response.json();
      expect(phases.phase1).toHaveProperty('id', 'phase1');
      expect(phases.phase1).toHaveProperty('name', 'Scavenger');
      expect(phases.phase2).toHaveProperty('id', 'phase2');
      expect(phases.phase3).toHaveProperty('id', 'phase3');
    });

    it('should include 16-char state_hash for optimistic concurrency', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/operator/state',
      });

      const { state_hash } = response.json();
      expect(typeof state_hash).toBe('string');
      expect(state_hash.length).toBe(16);
    });
  });

  // =========================================================================
  // Full Lifecycle
  // =========================================================================

  describe('full intent lifecycle', () => {
    it('should show ACCEPTED → VERIFIED and state reflects changes', async () => {
      await sleep(300);

      // 1. Submit ARM intent
      const payload = makeIntentPayload('ARM');
      const submitRes = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload,
      });
      expect(submitRes.statusCode).toBe(200);
      expect(submitRes.json().status).toBe('ACCEPTED');

      // 2. Let executor run and resolve
      await sleep(300);

      // 3. Query intents — should show VERIFIED
      const queryRes = await app.inject({
        method: 'GET',
        url: `/operator/intents?limit=20`,
      });
      const latestIntent = queryRes.json().intents.find((i: any) => i.id === payload.id);
      expect(latestIntent).toBeDefined();
      expect(latestIntent.status).toBe('VERIFIED');
      expect(latestIntent.receipt).toBeDefined();

      // 4. State should reflect armed
      const stateRes = await app.inject({
        method: 'GET',
        url: '/operator/state',
      });
      expect(stateRes.json().posture).toBe('armed');
    });
  });
  // =========================================================================
  // RBAC Enforcement
  // =========================================================================

  describe('RBAC Enforcement', () => {
    it('should block basic user without permissions', async () => {
      const payload = makeIntentPayload('ARM');
      const response = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload,
        headers: {
          'x-mock-user': JSON.stringify({ 
            operatorId: 'basic-user', 
            role: 'observer', 
            permissions: [] 
          })
        }
      });
      
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should allow user with specific permission', async () => {
      const payload = makeIntentPayload('ARM');
      const response = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload,
        headers: {
          'x-mock-user': JSON.stringify({ 
            operatorId: 'safety-officer', 
            role: 'operator', 
            permissions: ['safety.arm'] 
          })
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('ACCEPTED');
    });

    it('should allow superadmin without specific permission', async () => {
      const payload = makeIntentPayload('ARM');
      const response = await app.inject({
        method: 'POST',
        url: '/operator/intents',
        payload,
        headers: {
          'x-mock-user': JSON.stringify({ 
            operatorId: 'god-mode', 
            role: ['superadmin'], 
            permissions: [] 
          })
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('ACCEPTED');
    });
  });

  describe('History Determinism', () => {
    it('should return identical state for identical timestamps', async () => {
      // SOTA: Determinism Check
      const targetTime = new Date().toISOString();
      const headers = {
        'x-mock-user': JSON.stringify({ operatorId: 'test-audit', role: 'admin', permissions: [] })
      };

      const res1 = await app.inject({
        method: 'GET',
        url: `/operator/history/state?timestamp=${targetTime}`,
        headers
      });

      const res2 = await app.inject({
        method: 'GET',
        url: `/operator/history/state?timestamp=${targetTime}`,
        headers
      });

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(res1.json()).toEqual(res2.json());
    });
  });
});
