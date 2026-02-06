import { z } from 'zod';
export declare const ExecutionQualityScoreSchema: z.ZodObject<{
    slippage: z.ZodNumber;
    latency_ms: z.ZodNumber;
    fill_rate: z.ZodNumber;
    total_score: z.ZodNumber;
    sample_size: z.ZodNumber;
    window_ms: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    slippage: number;
    latency_ms: number;
    fill_rate: number;
    total_score: number;
    sample_size: number;
    window_ms: number;
}, {
    slippage: number;
    latency_ms: number;
    fill_rate: number;
    total_score: number;
    sample_size: number;
    window_ms: number;
}>;
export type ExecutionQualityScore = z.infer<typeof ExecutionQualityScoreSchema>;
export declare const ExecutionQualityEventSchema: z.ZodObject<{
    score: z.ZodObject<{
        slippage: z.ZodNumber;
        latency_ms: z.ZodNumber;
        fill_rate: z.ZodNumber;
        total_score: z.ZodNumber;
        sample_size: z.ZodNumber;
        window_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        slippage: number;
        latency_ms: number;
        fill_rate: number;
        total_score: number;
        sample_size: number;
        window_ms: number;
    }, {
        slippage: number;
        latency_ms: number;
        fill_rate: number;
        total_score: number;
        sample_size: number;
        window_ms: number;
    }>;
    timestamp: z.ZodNumber;
    service: z.ZodString;
}, "strip", z.ZodTypeAny, {
    service: string;
    timestamp: number;
    score: {
        slippage: number;
        latency_ms: number;
        fill_rate: number;
        total_score: number;
        sample_size: number;
        window_ms: number;
    };
}, {
    service: string;
    timestamp: number;
    score: {
        slippage: number;
        latency_ms: number;
        fill_rate: number;
        total_score: number;
        sample_size: number;
        window_ms: number;
    };
}>;
export type ExecutionQualityEvent = z.infer<typeof ExecutionQualityEventSchema>;
export declare const TITAN_QUALITY_TOPIC = "titan.evt.quality.execution";
//# sourceMappingURL=ExecutionQuality.d.ts.map