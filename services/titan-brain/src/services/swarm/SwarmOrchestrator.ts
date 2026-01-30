/**
 * Swarm Orchestrator Service
 *
 * Coordinates AI agent swarm for multi-asset parallel analysis.
 * Uses Kimi K2.5's PARL (Parallel Agentic Reinforcement Learning) capabilities
 * to spawn specialized sub-agents for different analysis tasks.
 *
 * @module titan-brain/services/swarm
 */

import {
    type AgentSwarmRequest,
    type AgentSwarmResponse,
    type AIProvider,
    type AITool,
    createProviderFromEnv,
    type VisualAnalysisRequest,
    type VisualAnalysisResponse,
} from "@titan/shared";

// ============================================================================
// Types
// ============================================================================

export interface MarketAnalysisTask {
    symbol: string;
    timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
    analysisType: "technical" | "sentiment" | "regime" | "full";
    context?: string;
}

export interface SwarmAnalysisResult {
    symbol: string;
    timeframe: string;
    technicalScore?: number;
    sentimentScore?: number;
    regimeState?: "trending" | "ranging" | "volatile" | "transitioning";
    signals: SwarmSignal[];
    confidence: number;
    reasoning: string;
}

export interface SwarmSignal {
    type: "entry" | "exit" | "scale" | "hedge";
    direction: "long" | "short" | "neutral";
    strength: number; // 0-1
    trigger: string;
}

export interface SwarmStatus {
    isActive: boolean;
    activeAgents: number;
    pendingTasks: number;
    completedTasks: number;
    lastError?: string;
}

export interface SwarmConfig {
    maxConcurrentAnalyses: number;
    defaultMaxSubAgents: number;
    timeoutMs: number;
    enableVisualAnalysis: boolean;
    fallbackToSimple: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SWARM_CONFIG: SwarmConfig = {
    maxConcurrentAnalyses: 10,
    defaultMaxSubAgents: 50,
    timeoutMs: 30_000,
    enableVisualAnalysis: true,
    fallbackToSimple: true,
};

// ============================================================================
// Analysis Tools for Sub-Agents
// ============================================================================

const ANALYSIS_TOOLS: AITool[] = [
    {
        name: "calculate_rsi",
        description:
            "Calculate RSI (Relative Strength Index) for a given period",
        parameters: {
            type: "object",
            properties: {
                period: {
                    type: "number",
                    description: "RSI period (default: 14)",
                },
            },
        },
    },
    {
        name: "detect_pattern",
        description:
            "Detect chart patterns (head and shoulders, double top/bottom, etc.)",
        parameters: {
            type: "object",
            properties: {
                patternType: {
                    type: "string",
                    enum: [
                        "head_shoulders",
                        "double_top",
                        "double_bottom",
                        "triangle",
                        "wedge",
                        "flag",
                    ],
                },
            },
        },
    },
    {
        name: "measure_volatility",
        description:
            "Measure current volatility using ATR or Bollinger Band width",
        parameters: {
            type: "object",
            properties: {
                method: { type: "string", enum: ["atr", "bbwidth", "stddev"] },
                period: { type: "number" },
            },
        },
    },
    {
        name: "identify_support_resistance",
        description: "Identify key support and resistance levels",
        parameters: {
            type: "object",
            properties: {
                lookback: {
                    type: "number",
                    description: "Number of candles to analyze",
                },
            },
        },
    },
    {
        name: "analyze_order_flow",
        description: "Analyze order book imbalance and large trades",
        parameters: {
            type: "object",
            properties: {
                depth: {
                    type: "number",
                    description: "Order book depth levels",
                },
            },
        },
    },
];

// ============================================================================
// Swarm Orchestrator
// ============================================================================

export class SwarmOrchestrator {
    private provider: AIProvider | null = null;
    private config: SwarmConfig;
    private status: SwarmStatus = {
        isActive: false,
        activeAgents: 0,
        pendingTasks: 0,
        completedTasks: 0,
    };

    constructor(config: Partial<SwarmConfig> = {}) {
        this.config = { ...DEFAULT_SWARM_CONFIG, ...config };
    }

    // --------------------------------------------------------------------------
    // Lifecycle
    // --------------------------------------------------------------------------

    async initialize(): Promise<void> {
        try {
            this.provider = createProviderFromEnv();
            this.status.isActive = true;
            // eslint-disable-next-line no-console
            console.log(
                "[SwarmOrchestrator] Initialized with provider:",
                this.provider.type,
            );
        } catch (error) {
            this.status.lastError = error instanceof Error
                ? error.message
                : "Unknown error";
            throw error;
        }
    }

    async shutdown(): Promise<void> {
        this.status.isActive = false;
        this.provider = null;
    }

    getStatus(): SwarmStatus {
        return { ...this.status };
    }

    // --------------------------------------------------------------------------
    // Multi-Asset Analysis
    // --------------------------------------------------------------------------

    async analyzeMultipleAssets(
        tasks: MarketAnalysisTask[],
    ): Promise<SwarmAnalysisResult[]> {
        if (!this.provider) {
            throw new Error("SwarmOrchestrator not initialized");
        }

        this.status.pendingTasks = tasks.length;

        // Batch tasks into groups based on maxConcurrentAnalyses
        const results: SwarmAnalysisResult[] = [];
        const chunks = this.chunkArray(
            tasks,
            this.config.maxConcurrentAnalyses,
        );

        for (const chunk of chunks) {
            const chunkResults = await Promise.all(
                chunk.map((task) =>
                    this.analyzeAsset(task).catch((err) =>
                        this.createErrorResult(task, err)
                    )
                ),
            );
            results.push(...chunkResults);
            this.status.completedTasks += chunk.length;
            this.status.pendingTasks -= chunk.length;
        }

        return results;
    }

    async analyzeAsset(task: MarketAnalysisTask): Promise<SwarmAnalysisResult> {
        if (!this.provider) {
            throw new Error("SwarmOrchestrator not initialized");
        }

        this.status.activeAgents++;

        try {
            // Check if provider supports agent swarm
            if (
                "agentSwarm" in this.provider &&
                typeof this.provider.agentSwarm === "function"
            ) {
                return await this.executeSwarmAnalysis(task);
            }

            // Fallback to simple completion
            if (this.config.fallbackToSimple) {
                return await this.executeSimpleAnalysis(task);
            }

            throw new Error(
                "Provider does not support agent swarm and fallback is disabled",
            );
        } finally {
            this.status.activeAgents--;
        }
    }

    // --------------------------------------------------------------------------
    // Visual Analysis (Chart Screenshots)
    // --------------------------------------------------------------------------

    async analyzeChart(
        imageBase64: string,
        symbol: string,
        context?: string,
    ): Promise<SwarmAnalysisResult> {
        if (!this.provider) {
            throw new Error("SwarmOrchestrator not initialized");
        }

        if (!this.config.enableVisualAnalysis) {
            throw new Error("Visual analysis is disabled");
        }

        if (!("analyzeImage" in this.provider)) {
            throw new Error("Provider does not support visual analysis");
        }

        const request: VisualAnalysisRequest = {
            image: imageBase64,
            prompt: `Analyze this trading chart for ${symbol}. ${context || ""}
      
Identify:
1. Current trend direction and strength
2. Key support and resistance levels
3. Notable chart patterns
4. Volume profile characteristics
5. Potential entry/exit signals

Respond in JSON format:
{
  "trend": "bullish|bearish|neutral",
  "strength": 0-1,
  "patterns": ["pattern1", "pattern2"],
  "supports": [price1, price2],
  "resistances": [price1, price2],
  "signals": [
    {"type": "entry|exit", "direction": "long|short", "trigger": "description"}
  ],
  "reasoning": "brief explanation"
}`,
            detail: "high",
        };

        const response: VisualAnalysisResponse = await (
            this.provider as {
                analyzeImage: (
                    req: VisualAnalysisRequest,
                ) => Promise<VisualAnalysisResponse>;
            }
        ).analyzeImage(request);

        return this.parseVisualAnalysisResponse(symbol, response);
    }

    // --------------------------------------------------------------------------
    // Private Methods
    // --------------------------------------------------------------------------

    private async executeSwarmAnalysis(
        task: MarketAnalysisTask,
    ): Promise<SwarmAnalysisResult> {
        const provider = this.provider as {
            agentSwarm: (req: AgentSwarmRequest) => Promise<AgentSwarmResponse>;
        };

        const prompt = this.buildAnalysisPrompt(task);

        const request: AgentSwarmRequest = {
            prompt,
            tools: ANALYSIS_TOOLS,
            maxSubAgents: this.config.defaultMaxSubAgents,
            timeout: this.config.timeoutMs,
        };

        const swarmResponse = await provider.agentSwarm(request);

        return this.parseSwarmResponse(task, swarmResponse);
    }

    private async executeSimpleAnalysis(
        task: MarketAnalysisTask,
    ): Promise<SwarmAnalysisResult> {
        const prompt = this.buildAnalysisPrompt(task);

        const response = await this.provider!.complete({
            messages: [
                {
                    role: "system",
                    content:
                        "You are a quantitative trading analyst. Analyze market data and provide actionable insights in JSON format.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
            maxTokens: 2048,
            responseFormat: "json",
        });

        return this.parseSimpleResponse(task, response.content);
    }

    private buildAnalysisPrompt(task: MarketAnalysisTask): string {
        const analysisTypes = {
            technical:
                "Perform technical analysis including trend, momentum, and pattern recognition.",
            sentiment:
                "Analyze market sentiment based on price action and volume.",
            regime:
                "Identify current market regime (trending, ranging, volatile, or transitioning).",
            full:
                "Perform comprehensive analysis including technical, sentiment, and regime detection.",
        };

        return `Analyze ${task.symbol} on the ${task.timeframe} timeframe.

${analysisTypes[task.analysisType]}

${task.context ? `Additional context: ${task.context}` : ""}

Respond in JSON format:
{
  "technicalScore": 0-100,
  "sentimentScore": 0-100,
  "regimeState": "trending|ranging|volatile|transitioning",
  "signals": [
    {
      "type": "entry|exit|scale|hedge",
      "direction": "long|short|neutral",
      "strength": 0-1,
      "trigger": "description of trigger condition"
    }
  ],
  "confidence": 0-1,
  "reasoning": "brief explanation of analysis"
}`;
    }

    private parseSwarmResponse(
        task: MarketAnalysisTask,
        response: AgentSwarmResponse,
    ): SwarmAnalysisResult {
        try {
            // Try to parse JSON from the orchestrator summary
            const jsonMatch = response.orchestratorSummary.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    symbol: task.symbol,
                    timeframe: task.timeframe,
                    technicalScore: parsed.technicalScore,
                    sentimentScore: parsed.sentimentScore,
                    regimeState: parsed.regimeState,
                    signals: parsed.signals || [],
                    confidence: parsed.confidence ?? 0.5,
                    reasoning: parsed.reasoning || response.orchestratorSummary,
                };
            }
        } catch {
            // Fall through to default
        }

        // Default result if parsing fails
        return {
            symbol: task.symbol,
            timeframe: task.timeframe,
            signals: [],
            confidence: 0.3,
            reasoning: response.orchestratorSummary,
        };
    }

    private parseSimpleResponse(
        task: MarketAnalysisTask,
        content: string,
    ): SwarmAnalysisResult {
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    symbol: task.symbol,
                    timeframe: task.timeframe,
                    technicalScore: parsed.technicalScore,
                    sentimentScore: parsed.sentimentScore,
                    regimeState: parsed.regimeState,
                    signals: parsed.signals || [],
                    confidence: parsed.confidence ?? 0.5,
                    reasoning: parsed.reasoning || "",
                };
            }
        } catch {
            // Fall through to default
        }

        return {
            symbol: task.symbol,
            timeframe: task.timeframe,
            signals: [],
            confidence: 0.3,
            reasoning: content,
        };
    }

    private parseVisualAnalysisResponse(
        symbol: string,
        response: VisualAnalysisResponse,
    ): SwarmAnalysisResult {
        try {
            const jsonMatch = response.analysis.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    symbol,
                    timeframe: "visual",
                    regimeState: parsed.trend === "bullish"
                        ? "trending"
                        : parsed.trend === "bearish"
                        ? "trending"
                        : "ranging",
                    signals: (parsed.signals || []).map(
                        (
                            s: {
                                type: string;
                                direction: string;
                                trigger: string;
                            },
                        ) => ({
                            type: s.type as "entry" | "exit",
                            direction: s.direction as "long" | "short",
                            strength: parsed.strength ?? 0.5,
                            trigger: s.trigger,
                        }) as SwarmSignal,
                    ),
                    confidence: parsed.strength ?? 0.5,
                    reasoning: parsed.reasoning || response.analysis,
                };
            }
        } catch {
            // Fall through
        }

        return {
            symbol,
            timeframe: "visual",
            signals: [],
            confidence: 0.3,
            reasoning: response.analysis,
        };
    }

    private createErrorResult(
        task: MarketAnalysisTask,
        error: unknown,
    ): SwarmAnalysisResult {
        return {
            symbol: task.symbol,
            timeframe: task.timeframe,
            signals: [],
            confidence: 0,
            reasoning: `Analysis failed: ${
                error instanceof Error ? error.message : "Unknown error"
            }`,
        };
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: SwarmOrchestrator | null = null;

export function getSwarmOrchestrator(
    config?: Partial<SwarmConfig>,
): SwarmOrchestrator {
    if (!instance) {
        instance = new SwarmOrchestrator(config);
    }
    return instance;
}

export function resetSwarmOrchestrator(): void {
    if (instance) {
        void instance.shutdown();
        instance = null;
    }
}
