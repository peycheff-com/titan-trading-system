/**
 * Generative World Model Service
 *
 * Extends Active Inference with AI-powered generative world modeling.
 * Uses Kimi K2.5's reasoning capabilities to generate probabilistic
 * belief states and policy recommendations.
 *
 * Core concepts:
 * - Generative Model: P(observations | hidden states)
 * - Inference: P(hidden states | observations)
 * - Policy Learning: Minimize expected free energy
 *
 * @module titan-brain/services/active-inference
 */

import {
    ActiveInferenceEngine,
    MarketState,
} from "../../engine/ActiveInferenceEngine.js";
import { createProviderFromEnv } from "@titan/shared/dist/ai/index.js";
import type { AIProvider } from "@titan/shared/dist/ai/index.js";

// ============================================================================
// Types
// ============================================================================

/** Hidden states inferred from observations */
export interface BeliefState {
    /** Current market regime */
    regime: "trending" | "mean_reverting" | "volatile" | "crash" | "unknown";
    /** Confidence in regime classification (0-1) */
    regimeConfidence: number;
    /** Hidden momentum state (-1 to 1) */
    momentum: number;
    /** Volatility regime (0-1, higher = more volatile) */
    volatilityState: number;
    /** Estimated time until regime change (candles) */
    regimeHorizon: number;
    /** Overall uncertainty in belief state */
    uncertainty: number;
}

/** Policy generated from minimizing expected free energy */
export interface PolicyRecommendation {
    /** Recommended action */
    action: "enter_long" | "enter_short" | "exit" | "hold" | "hedge";
    /** Position sizing multiplier (0-1) */
    sizeMultiplier: number;
    /** Risk appetite based on belief state (0-1) */
    riskAppetite: number;
    /** Expected free energy of this policy (lower is better) */
    expectedFreeEnergy: number;
    /** Reasoning for this recommendation */
    reasoning: string;
}

/** Result from generative world model update */
export interface WorldModelResult {
    /** Current belief state */
    belief: BeliefState;
    /** Policy recommendation */
    policy: PolicyRecommendation;
    /** Statistical cortisol from ActiveInferenceEngine */
    statisticalCortisol: number;
    /** AI-enhanced cortisol (weighted blend) */
    enhancedCortisol: number;
    /** Whether AI inference was used */
    aiInferenceUsed: boolean;
    /** Timestamp */
    timestamp: number;
}

/** Configuration for generative world model */
export interface WorldModelConfig {
    /** Weight of AI inference in blended results (0-1) */
    aiWeight: number;
    /** Minimum price history before AI inference (default: 50) */
    minHistoryForAI: number;
    /** Cooldown between AI calls in ms (default: 30000) */
    aiCooldownMs: number;
    /** Enable policy generation (default: true) */
    enablePolicyGen: boolean;
    /** Model to use for inference (default: auto) */
    model?: string;
}

// ============================================================================
// Generative World Model
// ============================================================================

/**
 * AI-enhanced Generative World Model
 *
 * Combines statistical Active Inference with LLM-powered reasoning
 * to generate rich belief states and policy recommendations.
 */
export class GenerativeWorldModel {
    private readonly config: WorldModelConfig;
    private readonly activeInference: ActiveInferenceEngine;
    private provider: AIProvider | null = null;
    private priceHistory: {
        price: number;
        volume: number;
        timestamp: number;
    }[] = [];
    private lastAICallTime: number = 0;
    private cachedBelief: BeliefState | null = null;
    private cachedPolicy: PolicyRecommendation | null = null;

    constructor(
        activeInference: ActiveInferenceEngine,
        config: Partial<WorldModelConfig> = {},
    ) {
        this.activeInference = activeInference;
        this.config = {
            aiWeight: config.aiWeight ?? 0.3,
            minHistoryForAI: config.minHistoryForAI ?? 50,
            aiCooldownMs: config.aiCooldownMs ?? 30000,
            enablePolicyGen: config.enablePolicyGen ?? true,
            model: config.model,
        };
    }

    /**
     * Update world model with new market observation
     */
    async update(state: MarketState): Promise<WorldModelResult> {
        // Statistical inference via ActiveInferenceEngine
        const statisticalCortisol = this.activeInference.processUpdate(state);

        // Track price history
        this.priceHistory.push({
            price: state.price,
            volume: state.volume,
            timestamp: state.timestamp,
        });

        // Limit history size
        if (this.priceHistory.length > 500) {
            this.priceHistory = this.priceHistory.slice(-500);
        }

        // Check if we should invoke AI inference
        const shouldUseAI =
            this.priceHistory.length >= this.config.minHistoryForAI &&
            Date.now() - this.lastAICallTime >= this.config.aiCooldownMs;

        let belief: BeliefState;
        let policy: PolicyRecommendation;
        let aiUsed = false;

        if (shouldUseAI) {
            try {
                const aiResult = await this.performAIInference(
                    state,
                    statisticalCortisol,
                );
                belief = aiResult.belief;
                policy = aiResult.policy;
                this.cachedBelief = belief;
                this.cachedPolicy = policy;
                this.lastAICallTime = Date.now();
                aiUsed = true;
            } catch (error) {
                console.warn(
                    "[WorldModel] AI inference failed, using cached/default:",
                    error,
                );
                belief = this.cachedBelief ??
                    this.defaultBelief(statisticalCortisol);
                policy = this.cachedPolicy ??
                    this.defaultPolicy(statisticalCortisol);
            }
        } else {
            // Use cached or default
            belief = this.cachedBelief ??
                this.defaultBelief(statisticalCortisol);
            policy = this.cachedPolicy ??
                this.defaultPolicy(statisticalCortisol);
        }

        // Blend cortisol with AI uncertainty
        const enhancedCortisol = aiUsed
            ? statisticalCortisol * (1 - this.config.aiWeight) +
                belief.uncertainty * this.config.aiWeight
            : statisticalCortisol;

        return {
            belief,
            policy,
            statisticalCortisol,
            enhancedCortisol,
            aiInferenceUsed: aiUsed,
            timestamp: Date.now(),
        };
    }

    /**
     * Perform AI-powered belief state inference
     */
    private async performAIInference(
        currentState: MarketState,
        statisticalCortisol: number,
    ): Promise<{ belief: BeliefState; policy: PolicyRecommendation }> {
        // Initialize provider lazily
        if (!this.provider) {
            this.provider = createProviderFromEnv();
        }

        // Build observation context from price history
        const recentPrices = this.priceHistory.slice(-50);
        const returns = this.calculateReturns(recentPrices.map((p) => p.price));
        const volatility = this.calculateVolatility(returns);
        const momentum = this.calculateMomentum(returns);

        const prompt = `You are an Active Inference market regime classifier.

Given the following market observations:
- Current price: ${currentState.price}
- Recent returns (last 50): min=${Math.min(...returns).toFixed(4)}, max=${
            Math.max(...returns).toFixed(4)
        }, avg=${
            (returns.reduce((a, b) => a + b, 0) / returns.length).toFixed(4)
        }
- Volatility (std of returns): ${volatility.toFixed(4)}
- Momentum (sum of recent returns): ${momentum.toFixed(4)}
- Statistical cortisol level: ${statisticalCortisol.toFixed(4)}

Infer the hidden market state and generate a policy recommendation.

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "belief": {
    "regime": "trending" | "mean_reverting" | "volatile" | "crash" | "unknown",
    "regimeConfidence": 0.0-1.0,
    "momentum": -1.0 to 1.0,
    "volatilityState": 0.0-1.0,
    "regimeHorizon": number (candles until expected regime change),
    "uncertainty": 0.0-1.0
  },
  "policy": {
    "action": "enter_long" | "enter_short" | "exit" | "hold" | "hedge",
    "sizeMultiplier": 0.0-1.0,
    "riskAppetite": 0.0-1.0,
    "expectedFreeEnergy": number (lower is better),
    "reasoning": "brief explanation"
  }
}`;

        const response = await this.provider.complete({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            maxTokens: 500,
        });

        // Parse response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No JSON found in AI response");
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
            belief: BeliefState;
            policy: PolicyRecommendation;
        };

        return parsed;
    }

    /**
     * Calculate returns from price series
     */
    private calculateReturns(prices: number[]): number[] {
        const returns: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        return returns;
    }

    /**
     * Calculate volatility (standard deviation of returns)
     */
    private calculateVolatility(returns: number[]): number {
        if (returns.length === 0) return 0;
        const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance =
            returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) /
            returns.length;
        return Math.sqrt(variance);
    }

    /**
     * Calculate momentum (sum of recent returns)
     */
    private calculateMomentum(returns: number[]): number {
        return returns.slice(-10).reduce((a, b) => a + b, 0);
    }

    /**
     * Default belief state when AI is unavailable
     */
    private defaultBelief(cortisol: number): BeliefState {
        return {
            regime: cortisol > 0.7
                ? "volatile"
                : cortisol > 0.4
                ? "mean_reverting"
                : "trending",
            regimeConfidence: 0.5,
            momentum: 0,
            volatilityState: cortisol,
            regimeHorizon: 20,
            uncertainty: 0.5,
        };
    }

    /**
     * Default policy when AI is unavailable
     */
    private defaultPolicy(cortisol: number): PolicyRecommendation {
        return {
            action: cortisol > 0.6 ? "hold" : "enter_long",
            sizeMultiplier: Math.max(0.1, 1 - cortisol),
            riskAppetite: 1 - cortisol,
            expectedFreeEnergy: cortisol,
            reasoning: "Statistical inference only (AI unavailable)",
        };
    }

    /**
     * Get current belief state
     */
    getBeliefState(): BeliefState | null {
        return this.cachedBelief;
    }

    /**
     * Get current policy recommendation
     */
    getPolicyRecommendation(): PolicyRecommendation | null {
        return this.cachedPolicy;
    }

    /**
     * Get combined state for monitoring
     */
    getState() {
        return {
            activeInferenceState: this.activeInference.getState(),
            belief: this.cachedBelief,
            policy: this.cachedPolicy,
            historySize: this.priceHistory.length,
            lastAICallTime: this.lastAICallTime,
        };
    }
}

// ============================================================================
// Singleton Pattern
// ============================================================================

let worldModelInstance: GenerativeWorldModel | null = null;

export function getWorldModel(
    activeInference: ActiveInferenceEngine,
    config?: Partial<WorldModelConfig>,
): GenerativeWorldModel {
    if (!worldModelInstance) {
        worldModelInstance = new GenerativeWorldModel(activeInference, config);
    }
    return worldModelInstance;
}

export function resetWorldModel(): void {
    worldModelInstance = null;
}
