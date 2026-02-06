import { z } from 'zod';
export interface Envelope<T> {
    id: string;
    type: string;
    version: number;
    ts: number;
    producer: string;
    correlation_id: string;
    causation_id?: string;
    partition_key?: string;
    idempotency_key?: string;
    payload: T;
    sig?: string;
    key_id?: string;
    nonce?: string;
}
export declare const EnvelopeSchema: z.ZodObject<{
    id: z.ZodDefault<z.ZodString>;
    type: z.ZodString;
    version: z.ZodNumber;
    ts: z.ZodDefault<z.ZodNumber>;
    producer: z.ZodString;
    correlation_id: z.ZodDefault<z.ZodString>;
    causation_id: z.ZodOptional<z.ZodString>;
    partition_key: z.ZodOptional<z.ZodString>;
    idempotency_key: z.ZodOptional<z.ZodString>;
    sig: z.ZodOptional<z.ZodString>;
    key_id: z.ZodOptional<z.ZodString>;
    nonce: z.ZodOptional<z.ZodString>;
    payload: z.ZodRecord<z.ZodString, z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: string;
    version: number;
    ts: number;
    producer: string;
    correlation_id: string;
    payload: Record<string, any>;
    causation_id?: string | undefined;
    partition_key?: string | undefined;
    idempotency_key?: string | undefined;
    sig?: string | undefined;
    key_id?: string | undefined;
    nonce?: string | undefined;
}, {
    type: string;
    version: number;
    producer: string;
    payload: Record<string, any>;
    id?: string | undefined;
    ts?: number | undefined;
    correlation_id?: string | undefined;
    causation_id?: string | undefined;
    partition_key?: string | undefined;
    idempotency_key?: string | undefined;
    sig?: string | undefined;
    key_id?: string | undefined;
    nonce?: string | undefined;
}>;
export declare function createEnvelope<T>(type: string, payload: T, meta: Partial<Omit<Envelope<T>, 'payload' | 'type' | 'version'>> & {
    version: number;
}): Envelope<T>;
//# sourceMappingURL=envelope.d.ts.map