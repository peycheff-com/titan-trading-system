import { z } from 'zod';
export declare const DliSchema: z.ZodObject<{
    original_subject: z.ZodString;
    original_payload: z.ZodUnknown;
    error_message: z.ZodString;
    error_stack: z.ZodOptional<z.ZodString>;
    service: z.ZodString;
    timestamp: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    service: string;
    timestamp: number;
    original_subject: string;
    error_message: string;
    metadata?: Record<string, string> | undefined;
    original_payload?: unknown;
    error_stack?: string | undefined;
}, {
    service: string;
    timestamp: number;
    original_subject: string;
    error_message: string;
    metadata?: Record<string, string> | undefined;
    original_payload?: unknown;
    error_stack?: string | undefined;
}>;
export type DliMessage = z.infer<typeof DliSchema>;
//# sourceMappingURL=dlq.d.ts.map