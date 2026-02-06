/**
 * Kimi K2.5 AI Provider
 *
 * Implementation of AIProvider for Moonshot AI's Kimi K2.5 model.
 * Supports:
 * - OpenAI-compatible chat completions
 * - Agent Swarm orchestration (PARL)
 * - Visual analysis (MoonViT)
 *
 * @module @titan/shared/ai
 */
import type { AgentSwarmRequest, AgentSwarmResponse, AICompletionRequest, AICompletionResponse, AIProvider, KimiK2Config, VisualAnalysisRequest, VisualAnalysisResponse } from './types.js';
export declare class KimiK2Provider implements AIProvider {
    readonly type: "kimi";
    private readonly baseUrl;
    private readonly apiKey;
    private readonly modelName;
    private readonly visionModel;
    private readonly timeout;
    private readonly maxRetries;
    private readonly rateLimiter;
    private readonly enableSwarm;
    private readonly enableVision;
    constructor(config: KimiK2Config);
    isAvailable(): boolean;
    canMakeRequest(): boolean;
    getTimeUntilNextSlot(): number;
    complete(request: AICompletionRequest): Promise<AICompletionResponse>;
    completeJSON<T>(request: AICompletionRequest): Promise<T>;
    agentSwarm(request: AgentSwarmRequest): Promise<AgentSwarmResponse>;
    analyzeImage(request: VisualAnalysisRequest): Promise<VisualAnalysisResponse>;
    private fetch;
    private executeWithRetry;
    private isRetryableError;
    private calculateBackoff;
    private mapFinishReason;
    private parseJSON;
    private buildSwarmPrompt;
    private sleep;
}
//# sourceMappingURL=KimiK2Provider.d.ts.map