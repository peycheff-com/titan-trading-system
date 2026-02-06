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
// ============================================================================
// Constants
// ============================================================================
const KIMI_CLOUD_BASE_URL = 'https://api.moonshot.ai/v1';
const DEFAULT_MODEL = 'kimi-k2.5-instruct';
const DEFAULT_VISION_MODEL = 'kimi-k2.5-vision';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_RPM = 10;
// ============================================================================
// Rate Limiter (Simple Token Bucket)
// ============================================================================
class SimpleRateLimiter {
    tokens;
    lastRefill;
    maxTokens;
    refillRateMs;
    constructor(maxRequestsPerMinute) {
        this.maxTokens = maxRequestsPerMinute;
        this.tokens = maxRequestsPerMinute;
        this.lastRefill = Date.now();
        this.refillRateMs = 60_000 / maxRequestsPerMinute;
    }
    canMakeRequest() {
        this.refill();
        return this.tokens >= 1;
    }
    consume() {
        this.refill();
        if (this.tokens >= 1) {
            // eslint-disable-next-line functional/immutable-data -- Token bucket requires mutation
            this.tokens -= 1;
            return true;
        }
        return false;
    }
    getTimeUntilNextSlot() {
        if (this.canMakeRequest())
            return 0;
        return this.refillRateMs - (Date.now() - this.lastRefill);
    }
    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const tokensToAdd = Math.floor(elapsed / this.refillRateMs);
        if (tokensToAdd > 0) {
            // eslint-disable-next-line functional/immutable-data -- Token bucket requires mutation
            this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
            // eslint-disable-next-line functional/immutable-data -- Token bucket requires mutation
            this.lastRefill = now;
        }
    }
}
// ============================================================================
// Kimi K2.5 Provider
// ============================================================================
export class KimiK2Provider {
    type = 'kimi';
    baseUrl;
    apiKey;
    modelName;
    visionModel;
    timeout;
    maxRetries;
    rateLimiter;
    enableSwarm;
    enableVision;
    constructor(config) {
        const apiKey = config.apiKey ?? process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY;
        if (!apiKey) {
            throw new Error('KIMI_API_KEY or MOONSHOT_API_KEY environment variable is required');
        }
        this.apiKey = apiKey;
        this.baseUrl =
            config.selfHosted && config.localEndpoint
                ? config.localEndpoint
                : (config.baseUrl ?? KIMI_CLOUD_BASE_URL);
        this.modelName = config.modelName ?? DEFAULT_MODEL;
        this.visionModel = DEFAULT_VISION_MODEL;
        this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.enableSwarm = config.enableSwarm ?? true;
        this.enableVision = config.enableVision ?? true;
        this.rateLimiter = new SimpleRateLimiter(config.maxRequestsPerMinute ?? DEFAULT_MAX_RPM);
    }
    isAvailable() {
        return !!this.apiKey && this.rateLimiter.canMakeRequest();
    }
    canMakeRequest() {
        return this.rateLimiter.canMakeRequest();
    }
    getTimeUntilNextSlot() {
        return this.rateLimiter.getTimeUntilNextSlot();
    }
    // --------------------------------------------------------------------------
    // Chat Completion (OpenAI-Compatible)
    // --------------------------------------------------------------------------
    async complete(request) {
        return this.executeWithRetry(async () => {
            const response = await this.fetch('/chat/completions', {
                model: this.modelName,
                messages: request.messages.map((m) => ({
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : m.content,
                })),
                temperature: request.temperature ?? 0.7,
                max_tokens: request.maxTokens ?? 4096,
                top_p: request.topP ?? 0.95,
                response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
            });
            const choice = response.choices?.[0];
            if (!choice) {
                throw new Error('Empty response from Kimi API');
            }
            return {
                content: choice.message?.content ?? '',
                finishReason: this.mapFinishReason(choice.finish_reason),
                usage: response.usage
                    ? {
                        promptTokens: response.usage.prompt_tokens,
                        completionTokens: response.usage.completion_tokens,
                        totalTokens: response.usage.total_tokens,
                    }
                    : undefined,
            };
        });
    }
    async completeJSON(request) {
        const response = await this.complete({
            ...request,
            responseFormat: 'json',
            temperature: request.temperature ?? 0.3, // Lower for JSON
        });
        return this.parseJSON(response.content);
    }
    // --------------------------------------------------------------------------
    // Agent Swarm (Kimi K2.5 Specific)
    // --------------------------------------------------------------------------
    async agentSwarm(request) {
        if (!this.enableSwarm) {
            throw new Error('Agent Swarm is not enabled for this provider instance');
        }
        return this.executeWithRetry(async () => {
            // Build swarm orchestration prompt
            const swarmPrompt = this.buildSwarmPrompt(request);
            const response = await this.fetch('/chat/completions', {
                model: this.modelName,
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI orchestrator capable of spawning up to ${request.maxSubAgents ?? 50} specialized sub-agents to complete complex tasks in parallel. Decompose the task, assign roles, and synthesize results.`,
                    },
                    { role: 'user', content: swarmPrompt },
                ],
                temperature: 0.5,
                max_tokens: 8192,
                tools: request.tools?.map((t) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters,
                    },
                })),
            });
            // Parse swarm response (simplified - real implementation would track sub-agents)
            const content = response.choices?.[0]?.message?.content ?? '';
            return {
                orchestratorSummary: content,
                subAgentResults: [], // Would be populated from structured response
                criticalSteps: 1,
                parallelismFactor: 1,
                totalToolCalls: response.usage?.completion_tokens ?? 0,
            };
        });
    }
    // --------------------------------------------------------------------------
    // Visual Analysis (MoonViT)
    // --------------------------------------------------------------------------
    async analyzeImage(request) {
        if (!this.enableVision) {
            throw new Error('Visual analysis is not enabled for this provider instance');
        }
        return this.executeWithRetry(async () => {
            const imageContent = request.image.startsWith('data:')
                ? request.image
                : `data:image/png;base64,${request.image}`;
            const response = await this.fetch('/chat/completions', {
                model: this.visionModel,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageContent,
                                    detail: request.detail ?? 'auto',
                                },
                            },
                            { type: 'text', text: request.prompt },
                        ],
                    },
                ],
                temperature: 0.3,
                max_tokens: 2048,
            });
            const content = response.choices?.[0]?.message?.content ?? '';
            return {
                analysis: content,
                confidence: undefined, // Would need structured output for this
                detectedElements: undefined,
            };
        });
    }
    // --------------------------------------------------------------------------
    // Internal Helpers
    // --------------------------------------------------------------------------
    async fetch(path, body) {
        if (!this.rateLimiter.consume()) {
            const waitTime = this.rateLimiter.getTimeUntilNextSlot();
            throw new Error(`Rate limit exceeded. Wait ${waitTime}ms before retrying.`);
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await globalThis.fetch(`${this.baseUrl}${path}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!response.ok) {
                const errorBody = await response.text().catch(() => 'Unknown error');
                throw new KimiAPIError(response.status, errorBody);
            }
            return (await response.json());
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    async executeWithRetry(fn) {
        // eslint-disable-next-line functional/no-let
        let lastError;
        // eslint-disable-next-line functional/no-let -- For loop counter requires mutation
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (!this.isRetryableError(lastError) || attempt >= this.maxRetries) {
                    throw lastError;
                }
                const delayMs = this.calculateBackoff(attempt);
                await this.sleep(delayMs);
            }
        }
        throw lastError ?? new Error('Max retries exceeded');
    }
    isRetryableError(error) {
        if (error instanceof KimiAPIError) {
            return error.status === 429 || error.status >= 500;
        }
        const msg = error.message.toLowerCase();
        return (msg.includes('timeout') ||
            msg.includes('network') ||
            msg.includes('econnreset') ||
            msg.includes('rate limit'));
    }
    calculateBackoff(attempt) {
        const baseDelay = 1000;
        const maxDelay = 30000;
        const jitter = Math.random() * 0.2 - 0.1; // ±10%
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        return Math.round(delay * (1 + jitter));
    }
    mapFinishReason(reason) {
        switch (reason) {
            case 'stop':
                return 'stop';
            case 'length':
                return 'length';
            case 'tool_calls':
                return 'tool_calls';
            default:
                return 'stop';
        }
    }
    parseJSON(content) {
        // eslint-disable-next-line functional/no-let
        let jsonStr = content.trim();
        // Remove markdown code blocks
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.slice(7);
        }
        else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.slice(3);
        }
        if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.slice(0, -3);
        }
        return JSON.parse(jsonStr.trim());
    }
    buildSwarmPrompt(request) {
        const toolList = request.tools?.map((t) => `- ${t.name}: ${t.description}`).join('\n') ??
            'No tools available.';
        return `Task: ${request.prompt}

Available Tools:
${toolList}

Instructions:
1. Decompose this task into parallelizable subtasks
2. Assign specialized roles to sub-agents
3. Execute subtasks and synthesize results
4. Optimize for critical path (minimize max subtask duration)

Provide your analysis and coordination plan.`;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
// ============================================================================
// Error Types
// ============================================================================
class KimiAPIError extends Error {
    status;
    body;
    constructor(status, body) {
        super(`Kimi API error (${status}): ${body}`);
        this.status = status;
        this.body = body;
        this.name = 'KimiAPIError';
    }
}
//# sourceMappingURL=KimiK2Provider.js.map