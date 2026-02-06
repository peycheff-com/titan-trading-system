import { z } from 'zod';
import { Envelope } from './envelope';
export type BaseCommand<T> = Envelope<T> & {
    idempotency_key: string;
};
export type BaseEvent<T> = Envelope<T>;
export declare const BaseCommandSchema: z.ZodObject<{
    idempotency_key: z.ZodString;
}, "strip", z.ZodTypeAny, {
    idempotency_key: string;
}, {
    idempotency_key: string;
}>;
//# sourceMappingURL=base.d.ts.map