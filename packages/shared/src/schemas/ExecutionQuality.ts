import { z } from "zod";

export const ExecutionQualityScoreSchema = z.object({
    slippage: z.number().describe("Slippage vs Target Price (0.0 - 1.0)"),
    latency_ms: z.number().describe("Latency in milliseconds"),
    fill_rate: z.number().describe("Fill Rate (0.0 - 1.0)"),
    total_score: z.number().describe("Aggregated Quality Score (0.0 - 1.0)"),
    sample_size: z.number().describe("Number of executions in window"),
    window_ms: z.number().describe("Time window in ms"),
});

export type ExecutionQualityScore = z.infer<typeof ExecutionQualityScoreSchema>;

export const ExecutionQualityEventSchema = z.object({
    score: ExecutionQualityScoreSchema,
    timestamp: z.number(),
    service: z.string(),
});

export type ExecutionQualityEvent = z.infer<typeof ExecutionQualityEventSchema>;

export const TITAN_QUALITY_TOPIC = "titan.evt.quality.execution";
