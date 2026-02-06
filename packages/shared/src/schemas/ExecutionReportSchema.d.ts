import { z } from 'zod';
/**
 * Zod Schema for Execution Reports (Fill/Reject/Canceled).
 * Aligns with `ExecutionReport` interface in Brain and Rust events.
 */
export declare const ExecutionReportSchema: z.ZodEffects<z.ZodObject<{
    type: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    phaseId: z.ZodOptional<z.ZodString>;
    signalId: z.ZodOptional<z.ZodString>;
    symbol: z.ZodString;
    side: z.ZodEffects<z.ZodEnum<["BUY", "SELL", "buy", "sell"]>, "BUY" | "SELL", "BUY" | "SELL" | "buy" | "sell">;
    price: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodNumber]>, number, string | number>;
    qty: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodNumber]>, number, string | number>;
    status: z.ZodString;
    timestamp: z.ZodEffects<z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodNumber]>>, number, string | number | undefined>;
    orderId: z.ZodOptional<z.ZodString>;
    fillId: z.ZodOptional<z.ZodString>;
    executionId: z.ZodOptional<z.ZodString>;
    fee: z.ZodOptional<z.ZodNumber>;
    feeCurrency: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    symbol: string;
    type: string;
    status: string;
    timestamp: number;
    price: number;
    side: "BUY" | "SELL";
    qty: number;
    reason?: string | undefined;
    orderId?: string | undefined;
    phaseId?: string | undefined;
    signalId?: string | undefined;
    fillId?: string | undefined;
    executionId?: string | undefined;
    fee?: number | undefined;
    feeCurrency?: string | undefined;
}, {
    symbol: string;
    status: string;
    price: string | number;
    side: "BUY" | "SELL" | "buy" | "sell";
    qty: string | number;
    type?: string | undefined;
    reason?: string | undefined;
    orderId?: string | undefined;
    timestamp?: string | number | undefined;
    phaseId?: string | undefined;
    signalId?: string | undefined;
    fillId?: string | undefined;
    executionId?: string | undefined;
    fee?: number | undefined;
    feeCurrency?: string | undefined;
}>, {
    orderId: string | undefined;
    fillId: string | undefined;
    price: number;
    qty: number;
    symbol: string;
    type: string;
    status: string;
    timestamp: number;
    side: "BUY" | "SELL";
    reason?: string | undefined;
    phaseId?: string | undefined;
    signalId?: string | undefined;
    executionId?: string | undefined;
    fee?: number | undefined;
    feeCurrency?: string | undefined;
}, {
    symbol: string;
    status: string;
    price: string | number;
    side: "BUY" | "SELL" | "buy" | "sell";
    qty: string | number;
    type?: string | undefined;
    reason?: string | undefined;
    orderId?: string | undefined;
    timestamp?: string | number | undefined;
    phaseId?: string | undefined;
    signalId?: string | undefined;
    fillId?: string | undefined;
    executionId?: string | undefined;
    fee?: number | undefined;
    feeCurrency?: string | undefined;
}>;
export type ExecutionReport = z.infer<typeof ExecutionReportSchema>;
//# sourceMappingURL=ExecutionReportSchema.d.ts.map