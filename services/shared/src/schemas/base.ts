import { z } from 'zod';
import { Envelope } from './envelope';

// Base Command: Intent to act. Must be idempotent key aware.
// Commands rarely have partition keys at the envelope level unless routed by it,
// but often the execution engine handles partitioning.
export type BaseCommand<T> = Envelope<T> & {
  idempotency_key: string;
};

// Base Event: Fact that happened.
export type BaseEvent<T> = Envelope<T>;

export const BaseCommandSchema = z.object({
  idempotency_key: z.string().min(1, 'Commands require an idempotency_key'),
});
