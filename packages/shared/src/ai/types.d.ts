/**
 * AI Provider Abstraction Layer
 *
 * Unified interface for AI model providers (Gemini, Kimi K2.5, etc.)
 * Enables seamless switching between providers without modifying consuming code.
 *
 * @module @titan/shared/ai
 */
export type AIProviderType = 'gemini' | 'kimi' | 'kimi-local' | 'openai';
export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | AIMessageContent[];
}
export interface AIMessageContent {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
        url: string;
    };
}
export interface AICompletionRequest {
    messages: AIMessage[];
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    responseFormat?: 'text' | 'json';
}
export interface AICompletionResponse {
    content: string;
    finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
export interface AITool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
export interface AIToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}
export interface AIToolResult {
    toolCallId: string;
    content: string;
}
export interface AgentSwarmRequest {
    prompt: string;
    tools?: AITool[];
    maxSubAgents?: number;
    timeout?: number;
}
export interface SubAgentResult {
    agentId: string;
    role: string;
    result: string;
    toolCalls?: AIToolCall[];
}
export interface AgentSwarmResponse {
    orchestratorSummary: string;
    subAgentResults: SubAgentResult[];
    criticalSteps: number;
    parallelismFactor: number;
    totalToolCalls: number;
}
export interface VisualAnalysisRequest {
    image: string;
    prompt: string;
    detail?: 'low' | 'high' | 'auto';
}
export interface VisualAnalysisResponse {
    analysis: string;
    confidence?: number;
    detectedElements?: string[];
}
export interface AIProvider {
    /** Provider identifier */
    readonly type: AIProviderType;
    /** Check if provider is configured and available */
    isAvailable(): boolean;
    /** Generate text completion */
    complete(request: AICompletionRequest): Promise<AICompletionResponse>;
    /** Generate JSON-structured response */
    completeJSON<T>(request: AICompletionRequest): Promise<T>;
    /** Agent Swarm capability (optional - K2.5 specific) */
    agentSwarm?(request: AgentSwarmRequest): Promise<AgentSwarmResponse>;
    /** Visual/multimodal analysis (optional) */
    analyzeImage?(request: VisualAnalysisRequest): Promise<VisualAnalysisResponse>;
    /** Check if rate limit allows request */
    canMakeRequest(): boolean;
    /** Get time until next available slot */
    getTimeUntilNextSlot(): number;
}
export interface AIProviderConfig {
    type: AIProviderType;
    apiKey?: string;
    baseUrl?: string;
    modelName?: string;
    maxRequestsPerMinute?: number;
    maxRetries?: number;
    timeout?: number;
}
export interface KimiK2Config extends AIProviderConfig {
    type: 'kimi';
    /** Use self-hosted endpoint instead of cloud API */
    selfHosted?: boolean;
    /** Local endpoint URL for self-hosted deployment */
    localEndpoint?: string;
    /** Enable Agent Swarm capability */
    enableSwarm?: boolean;
    /** Enable visual analysis */
    enableVision?: boolean;
}
export interface GeminiConfig extends AIProviderConfig {
    type: 'gemini';
}
//# sourceMappingURL=types.d.ts.map