/**
 * Swarm + ChangePointDetector Integration
 *
 * Bridges the SwarmOrchestrator with ChangePointDetector to enhance
 * regime detection with AI-powered multi-asset analysis.
 *
 * @module titan-brain/services/swarm
 */

import { RegimeState } from "@titan/shared";
import { ChangePointDetector } from "../../features/Risk/ChangePointDetector.js";
import {
    type MarketAnalysisTask,
    type SwarmAnalysisResult,
    SwarmOrchestrator,
} from "./SwarmOrchestrator.js";

// ============================================================================
// Types
// ============================================================================

export interface EnhancedRegimeResult {
    symbol: string;
    statisticalRegime: RegimeState;
    aiRegime?: RegimeState;
    aiConfidence?: number;
    changeScore: number;
    aiSignals?: SwarmAnalysisResult["signals"];
    consensus: RegimeState;
    consensusWeight: number;
}

export interface SwarmChangePointConfig {
    aiWeight: number; // 0-1: Weight for AI prediction in consensus
    enableSwarmEnhancement: boolean;
    symbols: string[];
    timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
    triggerOnHighChangeScore: boolean;
    changeScoreThreshold: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SwarmChangePointConfig = {
    aiWeight: 0.3, // 30% AI, 70% statistical
    enableSwarmEnhancement: true,
    symbols: ["BTCUSDT", "ETHUSDT"],
    timeframe: "1h",
    triggerOnHighChangeScore: true,
    changeScoreThreshold: 0.4,
};

// ============================================================================
// SwarmChangePointIntegration
// ============================================================================

export class SwarmChangePointIntegration {
    private readonly config: SwarmChangePointConfig;
    private readonly detectors: Map<string, ChangePointDetector> = new Map();
    private swarmOrchestrator: SwarmOrchestrator | null = null;
    private lastSwarmResults: Map<string, SwarmAnalysisResult> = new Map();
    private pendingSwarmTask: Promise<void> | null = null;

    constructor(config: Partial<SwarmChangePointConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Initialize detectors per symbol
        for (const symbol of this.config.symbols) {
            this.detectors.set(symbol, new ChangePointDetector());
        }
    }

    // --------------------------------------------------------------------------
    // Lifecycle
    // --------------------------------------------------------------------------

    async initialize(): Promise<void> {
        if (this.config.enableSwarmEnhancement) {
            this.swarmOrchestrator = new SwarmOrchestrator();
            await this.swarmOrchestrator.initialize();
        }
    }

    async shutdown(): Promise<void> {
        if (this.swarmOrchestrator) {
            await this.swarmOrchestrator.shutdown();
            this.swarmOrchestrator = null;
        }
    }

    // --------------------------------------------------------------------------
    // Core Update
    // --------------------------------------------------------------------------

    async update(
        symbol: string,
        price: number,
        timestamp: number,
    ): Promise<EnhancedRegimeResult> {
        // Get or create detector
        let detector = this.detectors.get(symbol);
        if (!detector) {
            detector = new ChangePointDetector();
            this.detectors.set(symbol, detector);
        }

        // Statistical update
        const cpdResult = detector.update(price, timestamp);
        const statisticalRegime = cpdResult.regime;
        const changeScore = cpdResult.changeScore;

        // Get last AI result if available
        const lastAiResult = this.lastSwarmResults.get(symbol);

        // Trigger swarm analysis if changeScore is high
        if (
            this.config.enableSwarmEnhancement &&
            this.config.triggerOnHighChangeScore &&
            changeScore > this.config.changeScoreThreshold &&
            !this.pendingSwarmTask
        ) {
            // Non-blocking swarm analysis
            this.pendingSwarmTask = this.triggerSwarmAnalysis(
                this.config.symbols.map((s) => ({
                    symbol: s,
                    timeframe: this.config.timeframe,
                    analysisType: "full" as const,
                    context: `Change score ${
                        changeScore.toFixed(3)
                    } triggered analysis`,
                })),
            )
                .then(() => {
                    /* Results cached in triggerSwarmAnalysis */
                })
                .finally(() => {
                    this.pendingSwarmTask = null;
                });
        }

        // Build enhanced result
        return this.buildEnhancedResult(
            symbol,
            statisticalRegime,
            changeScore,
            lastAiResult,
        );
    }

    // --------------------------------------------------------------------------
    // Swarm Analysis
    // --------------------------------------------------------------------------

    async triggerSwarmAnalysis(
        tasks: MarketAnalysisTask[],
    ): Promise<SwarmAnalysisResult[]> {
        if (!this.swarmOrchestrator) {
            return [];
        }

        try {
            const results = await this.swarmOrchestrator.analyzeMultipleAssets(
                tasks,
            );

            // Cache results
            for (const result of results) {
                this.lastSwarmResults.set(result.symbol, result);
            }

            return results;
        } catch (error) {
            console.error(
                "[SwarmChangePointIntegration] Swarm analysis failed:",
                error,
            );
            return [];
        }
    }

    // --------------------------------------------------------------------------
    // Private Methods
    // --------------------------------------------------------------------------

    private buildEnhancedResult(
        symbol: string,
        statisticalRegime: RegimeState,
        changeScore: number,
        aiResult?: SwarmAnalysisResult,
    ): EnhancedRegimeResult {
        // Map AI regime state if available
        let aiRegime: RegimeState | undefined;
        let aiConfidence: number | undefined;

        if (aiResult) {
            aiRegime = this.mapSwarmResultToRegime(aiResult);
            aiConfidence = aiResult.confidence;
        }

        // Calculate consensus
        const { consensus, consensusWeight } = this.calculateConsensus(
            statisticalRegime,
            aiRegime,
            aiConfidence,
            changeScore,
        );

        return {
            symbol,
            statisticalRegime,
            aiRegime,
            aiConfidence,
            changeScore,
            aiSignals: aiResult?.signals,
            consensus,
            consensusWeight,
        };
    }

    private mapSwarmResultToRegime(result: SwarmAnalysisResult): RegimeState {
        // Map swarm result to RegimeState
        if (result.regimeState) {
            switch (result.regimeState) {
                case "trending":
                    return RegimeState.VOLATILE_BREAKOUT;
                case "ranging":
                    return RegimeState.MEAN_REVERSION;
                case "volatile":
                    return RegimeState.CRASH;
                case "transitioning":
                    return RegimeState.VOLATILE_BREAKOUT;
                default:
                    return RegimeState.STABLE;
            }
        }

        // Infer from signals
        const entrySignals = result.signals.filter((s) => s.type === "entry");
        if (entrySignals.some((s) => s.strength > 0.7)) {
            return RegimeState.VOLATILE_BREAKOUT;
        }

        if (result.confidence < 0.3) {
            return RegimeState.MEAN_REVERSION;
        }

        return RegimeState.STABLE;
    }

    private calculateConsensus(
        statistical: RegimeState,
        ai?: RegimeState,
        aiConfidence?: number,
        changeScore?: number,
    ): { consensus: RegimeState; consensusWeight: number } {
        // If no AI result, use statistical
        if (!ai || aiConfidence === undefined) {
            return {
                consensus: statistical,
                consensusWeight: 1 - this.config.aiWeight,
            };
        }

        // Calculate weighted vote
        const statWeight = 1 - this.config.aiWeight;
        const effectiveAiWeight = this.config.aiWeight * aiConfidence;

        // Simple voting: if both agree, high confidence
        if (statistical === ai) {
            return {
                consensus: statistical,
                consensusWeight: statWeight + effectiveAiWeight,
            };
        }

        // Disagreement: use change score to break tie
        // High change score = trust statistical more (it's designed for change detection)
        if (changeScore && changeScore > 0.5) {
            return {
                consensus: statistical,
                consensusWeight: statWeight * 1.5,
            };
        }

        // Otherwise prefer AI if confidence is high
        if (aiConfidence > 0.7) {
            return { consensus: ai, consensusWeight: effectiveAiWeight };
        }

        // Default to statistical
        return { consensus: statistical, consensusWeight: statWeight };
    }

    // --------------------------------------------------------------------------
    // Accessors
    // --------------------------------------------------------------------------

    getLastSwarmResult(symbol: string): SwarmAnalysisResult | undefined {
        return this.lastSwarmResults.get(symbol);
    }

    getAllSwarmResults(): Map<string, SwarmAnalysisResult> {
        return new Map(this.lastSwarmResults);
    }

    hasPendingAnalysis(): boolean {
        return this.pendingSwarmTask !== null;
    }
}

// ============================================================================
// Factory
// ============================================================================

let instance: SwarmChangePointIntegration | null = null;

export function getSwarmChangePointIntegration(
    config?: Partial<SwarmChangePointConfig>,
): SwarmChangePointIntegration {
    if (!instance) {
        instance = new SwarmChangePointIntegration(config);
    }
    return instance;
}

export function resetSwarmChangePointIntegration(): void {
    if (instance) {
        void instance.shutdown();
        instance = null;
    }
}
