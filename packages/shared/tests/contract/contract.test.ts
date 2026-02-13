/**
 * Event Contract Tests — Phase 1 CI Hard Gate
 *
 * These tests enforce that:
 * 1. Zod schemas produce JSON matching the canonical JSON Schemas
 * 2. Consumers reject invalid messages (missing required fields, bad types)
 * 3. schema_version is always present on envelopes
 * 4. All TITAN_SUBJECTS string literals are well-formed
 */

import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import { createEnvelope, EnvelopeSchema } from '../../src/schemas/envelope';
import { IntentPayloadSchemaV1 } from '../../src/schemas/intentSchema';
import { TITAN_SUBJECTS } from '../../src/messaging/titan_subjects';

const ajv = new Ajv({ allErrors: true, strict: false });
const schemasDir = path.resolve(__dirname, '../../schemas/json');

function loadJsonSchema(name: string) {
  const filePath = path.join(schemasDir, `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. Envelope Contract
// ---------------------------------------------------------------------------
describe('Envelope Contract', () => {
  const envelopeJsonSchema = loadJsonSchema('Envelope');

  it('createEnvelope produces JSON valid against Envelope.json schema', () => {
    const envelope = createEnvelope(
      'test.event.v1',
      { action: 'buy' },
      {
        version: 1,
        producer: 'brain',
        schema_version: 1,
      },
    );

    const validate = ajv.compile(envelopeJsonSchema);
    const valid = validate(envelope);
    expect(valid).toBe(true);
    if (!valid) console.error(validate.errors);
  });

  it('schema_version field is always present in created envelopes', () => {
    const envelope = createEnvelope(
      'test.evt',
      { x: 1 },
      {
        version: 1,
        producer: 'test',
      },
    );
    expect(envelope.schema_version).toBeDefined();
    expect(typeof envelope.schema_version).toBe('number');
    expect(envelope.schema_version).toBeGreaterThanOrEqual(1);
  });

  it('schema_version defaults to 1 when not provided', () => {
    const envelope = createEnvelope(
      'test.evt',
      { x: 1 },
      {
        version: 1,
        producer: 'test',
      },
    );
    expect(envelope.schema_version).toBe(1);
  });

  it('rejects envelope missing required "type" field', () => {
    const bad = {
      version: 1,
      schema_version: 1,
      producer: 'test',
      payload: {},
    };
    const result = EnvelopeSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects envelope missing required "version" field', () => {
    const bad = {
      type: 'test',
      schema_version: 1,
      producer: 'test',
      payload: {},
    };
    const result = EnvelopeSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects envelope missing required "producer" field', () => {
    const bad = {
      type: 'test',
      version: 1,
      schema_version: 1,
      payload: {},
    };
    const result = EnvelopeSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects envelope missing required "payload" field', () => {
    const bad = {
      type: 'test',
      version: 1,
      schema_version: 1,
      producer: 'test',
    };
    const result = EnvelopeSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('accepts envelope with all required + optional fields', () => {
    const full = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      type: 'test.cmd',
      version: 1,
      schema_version: 1,
      ts: Date.now(),
      producer: 'brain',
      correlation_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      causation_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      partition_key: 'BTCUSDT',
      idempotency_key: 'idem-123',
      sig: 'sha256:abc',
      key_id: 'key-1',
      nonce: 'nonce-123',
      payload: { action: 'buy' },
    };
    const result = EnvelopeSchema.safeParse(full);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. IntentPayload Contract
// ---------------------------------------------------------------------------
describe('IntentPayload Contract', () => {
  const intentJsonSchema = loadJsonSchema('IntentPayload');

  it('valid IntentPayload conforms to IntentPayload.json schema', () => {
    const payload = {
      signal_id: 'sig-1',
      symbol: 'BTCUSDT',
      direction: 1,
      type: 'BUY_SETUP',
      size: 100,
      status: 'VALIDATED',
      t_signal: Date.now(),
    };

    const zodResult = IntentPayloadSchemaV1.safeParse(payload);
    expect(zodResult.success).toBe(true);

    const validate = ajv.compile(intentJsonSchema);
    const jsonValid = validate(payload);
    expect(jsonValid).toBe(true);
    if (!jsonValid) console.error(validate.errors);
  });

  it('rejects IntentPayload missing required signal_id', () => {
    const bad = {
      symbol: 'BTCUSDT',
      direction: 1,
      type: 'BUY_SETUP',
      size: 100,
      status: 'VALIDATED',
    };
    const result = IntentPayloadSchemaV1.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects IntentPayload with invalid type enum', () => {
    const bad = {
      signal_id: 'sig-1',
      symbol: 'BTCUSDT',
      direction: 1,
      type: 'INVALID_TYPE',
      size: 100,
      status: 'VALIDATED',
    };
    const result = IntentPayloadSchemaV1.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects IntentPayload with invalid status enum', () => {
    const bad = {
      signal_id: 'sig-1',
      symbol: 'BTCUSDT',
      direction: 1,
      type: 'BUY_SETUP',
      size: 100,
      status: 'UNKNOWN_STATUS',
    };
    const result = IntentPayloadSchemaV1.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. TITAN_SUBJECTS Well-Formedness
// ---------------------------------------------------------------------------
describe('TITAN_SUBJECTS Well-Formedness', () => {
  /**
   * Recursively collect all string values from a nested object.
   * Skips function subjects — those are tested by calling them.
   */
  function collectStringSubjects(obj: Record<string, unknown>, prefix = ''): string[] {
    const result: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        result.push(val);
      } else if (typeof val === 'object' && val !== null) {
        const nested = collectStringSubjects(val as Record<string, unknown>, `${prefix}${key}.`);
        for (const s of nested) {
          result.push(s);
        }
      }
      // Functions are tested separately below
    }
    return result;
  }

  const allStringSubjects = collectStringSubjects(
    TITAN_SUBJECTS as unknown as Record<string, unknown>,
  );

  it('all string subjects follow titan.{layer}.{domain} convention', () => {
    for (const subject of allStringSubjects) {
      // Must start with 'titan.' or 'powerlaw.' (legacy)
      expect(subject).toMatch(/^(titan\.|powerlaw\.)/);
    }
  });

  it('no duplicate subject strings exist (excluding wildcards)', () => {
    // Wildcard subjects like 'titan.evt.execution.>' may legitimately appear in
    // multiple categories, so we only check non-wildcard subjects for uniqueness.
    const nonWildcard = allStringSubjects.filter((s) => !s.endsWith('>'));
    const unique = new Set(nonWildcard);
    expect(unique.size).toBe(nonWildcard.length);
  });

  it('function-based subjects produce well-formed strings', () => {
    // Test key dynamic subjects
    const place = TITAN_SUBJECTS.CMD.EXECUTION.PLACE('binance', 'main', 'BTCUSDT');
    expect(place).toBe('titan.cmd.execution.place.v1.binance.main.BTCUSDT');

    const ticker = TITAN_SUBJECTS.DATA.MARKET.TICKER('binance', 'BTCUSDT');
    expect(ticker).toBe('titan.data.market.ticker.v1.binance.BTCUSDT');

    const heartbeat = TITAN_SUBJECTS.SYS.HEARTBEAT('brain');
    expect(heartbeat).toBe('titan.sys.heartbeat.v1.brain');

    const positions = TITAN_SUBJECTS.SYS.RPC.GET_POSITIONS('binance');
    expect(positions).toBe('titan.rpc.execution.get_positions.v1.binance');

    const balances = TITAN_SUBJECTS.SYS.RPC.GET_BALANCES('binance');
    expect(balances).toBe('titan.rpc.execution.get_balances.v1.binance');
  });

  it('FUNDING event subject exists and is well-formed', () => {
    expect(TITAN_SUBJECTS.EVT.EXECUTION.FUNDING).toBe('titan.evt.execution.funding.v1');
  });

  it('RPC subjects use canonical titan.rpc.* namespace', () => {
    expect(TITAN_SUBJECTS.SYS.RPC.GET_POSITIONS_PREFIX).toMatch(/^titan\.rpc\./);
    expect(TITAN_SUBJECTS.SYS.RPC.GET_BALANCES_PREFIX).toMatch(/^titan\.rpc\./);
  });
});
