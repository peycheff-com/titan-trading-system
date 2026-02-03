import { z } from "zod";

export const DliSchema = z.object({
    original_subject: z.string(),
    original_payload: z.unknown(), // Base64 encoded string or JSON
    error_message: z.string(),
    error_stack: z.string().optional(),
    service: z.string(),
    timestamp: z.number(), // Nanoseconds
    metadata: z.record(z.string()).optional(),
});

export type DliMessage = z.infer<typeof DliSchema>;
