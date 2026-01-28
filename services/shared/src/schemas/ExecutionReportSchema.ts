import { z } from "zod";

/**
 * Zod Schema for Execution Reports (Fill/Reject/Canceled).
 * Aligns with `ExecutionReport` interface in Brain and Rust events.
 */
export const ExecutionReportSchema = z.object({
    // Required Fields
    type: z.string().optional().default("EXECUTION_REPORT"),
    phaseId: z.string().optional(),
    signalId: z.string().optional(),
    symbol: z.string(),
    side: z.enum(["BUY", "SELL", "buy", "sell"]).transform((val) =>
        val.toUpperCase() as "BUY" | "SELL"
    ),
    price: z.union([z.string(), z.number()]).transform((val) => Number(val)),
    qty: z.union([z.string(), z.number()]).transform((val) => Number(val)),
    status: z.string(), // FILLED, PARTIALLY_FILLED, CANCELED, REJECTED, NEW

    // Timestamps
    timestamp: z.union([z.string(), z.number()]).default(() => Date.now())
        .transform((val) => Number(val)),

    // IDs
    orderId: z.string().optional(),
    fillId: z.string().optional(),
    executionId: z.string().optional(),

    // Fee Info (Optional)
    fee: z.number().optional(),
    feeCurrency: z.string().optional(),

    // Metadata
    reason: z.string().optional(),
}).transform((data) => ({
    ...data,
    // Normalize IDs if coming from different snake_case upstream sources
    orderId: data.orderId,
    fillId: data.fillId || data.executionId,
    // Ensure numeric safety
    price: isNaN(data.price) ? 0 : data.price,
    qty: isNaN(data.qty) ? 0 : data.qty,
}));

export type ExecutionReport = z.infer<typeof ExecutionReportSchema>;
