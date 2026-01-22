import { z } from 'zod';
import { ulid } from 'ulid';

export interface Envelope<T> {
  id: string; // ULID
  type: string;
  version: number;
  ts: number; // ISO timestamp (epoch ms)
  producer: string;
  correlation_id: string;
  causation_id?: string;
  partition_key?: string;
  idempotency_key?: string; // Required for commands
  payload: T;

  // Security (Jan 2026)
  sig?: string;
  key_id?: string;
  nonce?: string;
}

export const EnvelopeSchema = z.object({
  id: z
    .string()
    .regex(/^[0-9A-Z]{26}$/, 'Invalid ULID')
    .default(() => ulid()),
  type: z.string(),
  version: z.number().int(),
  ts: z
    .number()
    .int()
    .default(() => Date.now()),
  producer: z.string(),
  correlation_id: z.string().default(() => ulid()),
  causation_id: z.string().optional(),
  partition_key: z.string().optional(),
  idempotency_key: z.string().optional(),
  sig: z.string().optional(),
  key_id: z.string().optional(),
  nonce: z.string().optional(),
  payload: z.record(z.any()), // Generic wrapper validation
});

export function createEnvelope<T>(
  type: string,
  payload: T,
  meta: Partial<Omit<Envelope<T>, 'payload' | 'type' | 'version'>> & {
    version: number;
  },
): Envelope<T> {
  return {
    id: meta.id || ulid(),
    type,
    version: meta.version,
    ts: meta.ts || Date.now(),
    producer: meta.producer || 'unknown',
    correlation_id: meta.correlation_id || ulid(),
    causation_id: meta.causation_id,
    partition_key: meta.partition_key,
    idempotency_key: meta.idempotency_key,
    sig: meta.sig,
    key_id: meta.key_id,
    nonce: meta.nonce,
    payload,
  };
}
