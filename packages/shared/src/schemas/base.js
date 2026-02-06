import { z } from 'zod';
export const BaseCommandSchema = z.object({
    idempotency_key: z.string().min(1, 'Commands require an idempotency_key'),
});
//# sourceMappingURL=base.js.map