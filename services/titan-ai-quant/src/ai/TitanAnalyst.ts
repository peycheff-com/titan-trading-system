/**
 * TitanAnalyst - AI Engine
 *
 * Uses Gemini 1.5 Flash to analyze trade patterns
 * and generate optimization proposals.
 *
 * Requirements: 1.3, 2.1, 2.2
 */

import * as fs from "fs";
import * as path from "path";
const baseDir = path.join(process.cwd(), "src/ai");
import {
  BacktestResult,
  Config,
  Insight,
  OptimizationProposal,
  RegimeSnapshot,
  Trade,
  ValidationReport,
} from "../types/index.js";
import { GeminiClient, GeminiClientConfig } from "./GeminiClient.js";
import { Journal } from "./Journal.js";
import { Guardrails } from "./Guardrails.js";

/**
 * AI response structure for analysis
 */
interface AnalysisResponse {
  insights: Array<{
    topic: string;
    text: string;
    confidence: number;
    affectedSymbols?: string[];
    affectedTraps?: string[];
    regimeContext?: string;
  }>;
}

/**
 * AI response structure for optimization
 */
interface OptimizationResponse {
  targetKey: string;
  currentValue: unknown;
  suggestedValue: unknown;
  reasoning: string;
  expectedImpact: {
    pnlImprovement: number;
    riskChange: number;
    confidenceScore: number;
  };
}

export interface TitanAnalystConfig {
  geminiConfig?: GeminiClientConfig;
  promptsDir?: string;
}

/**
 * TitanAnalyst - AI-powered trade analysis and optimization engine
 *
 * Analyzes failed trades to identify patterns and generates
 * configuration optimization proposals validated through backtesting.
 */
export class TitanAnalyst {
  private readonly client: GeminiClient;
  private readonly journal: Journal;
  private readonly guardrails: Guardrails;
  private readonly promptsDir: string;
  private analysisPromptTemplate: string = "";
  private optimizationPromptTemplate: string = "";
  private deepThinkPromptTemplate: string = "";

  constructor(config: TitanAnalystConfig = {}) {
    this.client = new GeminiClient(config.geminiConfig);
    this.journal = new Journal();
    this.guardrails = new Guardrails();
    this.promptsDir = config.promptsDir ?? path.join(baseDir, "prompts");
    this.loadPromptTemplates();
  }

  /**
   * Load prompt templates from files
   */
  private loadPromptTemplates(): void {
    try {
      const analysisPath = path.join(this.promptsDir, "analysis.txt");
      const optimizationPath = path.join(this.promptsDir, "optimization.txt");

      if (fs.existsSync(analysisPath)) {
        // eslint-disable-next-line functional/immutable-data
        this.analysisPromptTemplate = fs.readFileSync(analysisPath, "utf-8");
      } else {
        // eslint-disable-next-line functional/immutable-data
        this.analysisPromptTemplate = this.getDefaultAnalysisPrompt();
      }

      if (fs.existsSync(optimizationPath)) {
        // eslint-disable-next-line functional/immutable-data
        this.optimizationPromptTemplate = fs.readFileSync(
          optimizationPath,
          "utf-8",
        );
      } else {
        // eslint-disable-next-line functional/immutable-data
        this.optimizationPromptTemplate = this.getDefaultOptimizationPrompt();
      }

      const deepThinkPath = path.join(this.promptsDir, "deep_think.txt");
      if (fs.existsSync(deepThinkPath)) {
        // eslint-disable-next-line functional/immutable-data
        this.deepThinkPromptTemplate = fs.readFileSync(deepThinkPath, "utf-8");
      } else {
        // eslint-disable-next-line functional/immutable-data
        this.deepThinkPromptTemplate = this.getDefaultDeepThinkPrompt();
      }
    } catch {
      // Use default prompts if files can't be read
      // eslint-disable-next-line functional/immutable-data
      this.analysisPromptTemplate = this.getDefaultAnalysisPrompt();
      // eslint-disable-next-line functional/immutable-data
      this.optimizationPromptTemplate = this.getDefaultOptimizationPrompt();
      // eslint-disable-next-line functional/immutable-data
      this.deepThinkPromptTemplate = this.getDefaultDeepThinkPrompt();
    }
  }

  /**
   * Analyze failed trades and identify patterns
   *
   * Requirement 1.3: Identify correlations in losses such as time-of-day patterns
   * or symbol-specific issues
   */
  async analyzeFailures(
    trades: Trade[],
    regimeContext: RegimeSnapshot[],
  ): Promise<Insight[]> {
    if (trades.length === 0) {
      return [];
    }

    // Filter for failed trades
    const failedTrades = this.journal.getFailedTrades(trades);
    if (failedTrades.length === 0) {
      return [];
    }

    // Set regime snapshots for correlation
    this.journal.setRegimeSnapshots(regimeContext);

    // Generate narratives for failed trades
    const narratives: string[] = [];
    for (const trade of failedTrades) {
      const regime = this.journal.getRegimeContext(trade);
      if (regime) {
        // eslint-disable-next-line functional/immutable-data
        narratives.push(this.journal.summarizeTrade(trade, regime));
      }
    }

    if (narratives.length === 0) {
      return [];
    }

    // Build the analysis prompt
    const prompt = this.buildAnalysisPrompt(narratives, failedTrades);

    try {
      // Call Gemini API for analysis
      const response = await this.client.generateJSON<AnalysisResponse>(
        prompt,
        {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      );

      // Validate and transform response
      return this.parseAnalysisResponse(response);
    } catch (error) {
      // Return empty insights on error - don't crash the system
      console.error("TitanAnalyst.analyzeFailures error:", error);
      return [];
    }
  }

  /**
   * Generate optimization proposal from insight
   *
   * Requirement 2.1: Map insights to specific config.json parameter keys
   * Requirement 2.2: Include current value, suggested value, and reasoning
   */
  async proposeOptimization(
    insight: Insight,
    currentConfig: Config,
  ): Promise<OptimizationProposal> {
    // Build the optimization prompt
    const prompt = this.buildOptimizationPrompt(insight, currentConfig);

    // Deep Think Step: Generate reasoning chain
    const reasoningContext =
      `Insight: ${insight.text}\nConfig Schema: ${this.getConfigSchemaDescription()}\nCurrent Values: ${
        JSON.stringify(
          this.extractRelevantConfigValues(insight, currentConfig),
        )
      }`;
    const reasoning = await this.deepThink(reasoningContext);

    // Append reasoning to the final prompt to guide the output
    const finalPrompt =
      `${prompt}\n\nPREVIOUS REASONING:\n${reasoning}\n\nBased on this reasoning, generate the final JSON proposal.`;

    try {
      // Call Gemini API for optimization proposal
      const response = await this.client.generateJSON<OptimizationResponse>(
        finalPrompt,
        {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      );

      // Create proposal from response
      const proposal: OptimizationProposal = {
        createdAt: Date.now(),
        insightId: insight.id,
        targetKey: response.targetKey,
        currentValue: response.currentValue,
        suggestedValue: response.suggestedValue,
        reasoning: response.reasoning,
        expectedImpact: {
          pnlImprovement: response.expectedImpact.pnlImprovement,
          riskChange: response.expectedImpact.riskChange,
          confidenceScore: response.expectedImpact.confidenceScore,
        },
        status: "pending",
      };

      // Validate proposal against guardrails
      const validation = this.guardrails.validateProposal(proposal);
      if (!validation.valid) {
        throw new Error(
          `Proposal validation failed: ${validation.errors.join(", ")}`,
        );
      }

      return proposal;
    } catch (error) {
      // Re-throw with context
      throw new Error(
        `Failed to generate optimization proposal: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Validate proposal through backtesting
   *
   * Orchestrates the backtesting validation process using the Backtester class.
   * Loads historical data, runs baseline and proposed configurations, and
   * generates a comprehensive validation report.
   */
  async validateProposal(
    proposal: OptimizationProposal,
    backtester?: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    historicalData?: {
      trades: Trade[];
      ohlcvData: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      regimeSnapshots: RegimeSnapshot[];
    },
  ): Promise<ValidationReport> {
    // First, validate against guardrails
    const guardrailValidation = this.guardrails.validateProposal(proposal);

    if (!guardrailValidation.valid) {
      return this.createRejectionReport(
        proposal,
        `Guardrail validation failed: ${guardrailValidation.errors.join(", ")}`,
      );
    }

    // If no backtester provided, create a basic validation report
    if (!backtester || !historicalData) {
      return this.createBasicValidationReport(proposal);
    }

    try {
      // Load current configuration
      const currentConfig = await this.loadCurrentConfig();

      // Apply proposal to create new configuration
      const proposedConfig = this.applyProposalToConfig(
        currentConfig,
        proposal,
      );

      // Run backtesting comparison
      const backtestPeriod = this.getBacktestPeriod();
      const comparisonResult = await backtester.compareConfigs(
        currentConfig,
        proposedConfig,
        historicalData.trades,
        historicalData.ohlcvData,
        historicalData.regimeSnapshots,
        {
          startTime: backtestPeriod.start,
          endTime: backtestPeriod.end,
          skipMissingData: true,
        },
      );

      // Create validation report from comparison
      return {
        passed: comparisonResult.recommendation === "approve",
        timestamp: Date.now(),
        backtestPeriod,
        baselineMetrics: comparisonResult.baseResult,
        proposedMetrics: comparisonResult.proposedResult,
        deltas: {
          pnlDelta: comparisonResult.pnlDelta,
          pnlDeltaPercent: comparisonResult.baseResult.totalPnL !== 0
            ? (comparisonResult.pnlDelta /
              Math.abs(comparisonResult.baseResult.totalPnL)) * 100
            : comparisonResult.pnlDelta > 0
            ? 100
            : comparisonResult.pnlDelta < 0
            ? -100
            : 0,
          drawdownDelta: comparisonResult.drawdownDelta,
          drawdownDeltaPercent: comparisonResult.baseResult.maxDrawdown !== 0
            ? (comparisonResult.drawdownDelta /
              comparisonResult.baseResult.maxDrawdown) * 100
            : comparisonResult.drawdownDelta > 0
            ? 100
            : comparisonResult.drawdownDelta < 0
            ? -100
            : 0,
          winRateDelta: comparisonResult.proposedResult.winRate -
            comparisonResult.baseResult.winRate,
        },
        confidenceScore: this.calculateValidationConfidence(
          comparisonResult.baseResult.totalTrades,
          comparisonResult.proposedResult,
          comparisonResult.baseResult,
        ),
        rejectionReason: comparisonResult.recommendation === "reject"
          ? comparisonResult.reason
          : undefined,
        recommendation: comparisonResult.recommendation,
      };
    } catch (error) {
      // If backtesting fails, return rejection report
      return this.createRejectionReport(
        proposal,
        `Backtesting validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Apply optimization proposal and update configuration
   *
   * Applies the approved proposal to the current configuration and
   * persists the changes. Includes rollback mechanism for failed applications.
   */
  async applyProposal(
    proposal: OptimizationProposal,
    validationReport: ValidationReport,
  ): Promise<{ success: boolean; error?: string; rollbackData?: Config }> {
    // Only apply approved proposals
    if (validationReport.recommendation !== "approve") {
      return {
        success: false,
        error:
          `Cannot apply proposal with recommendation: ${validationReport.recommendation}`,
      };
    }

    try {
      // Load current configuration for rollback
      const currentConfig = await this.loadCurrentConfig();

      // Apply the proposal
      const newConfig = this.applyProposalToConfig(currentConfig, proposal);

      // Basic validation - ensure the configuration structure is valid
      if (!newConfig || typeof newConfig !== "object") {
        return {
          success: false,
          error: "Invalid configuration structure",
        };
      }

      // Save the new configuration
      await this.saveConfig(newConfig);

      // Update proposal status
      // eslint-disable-next-line functional/immutable-data
      proposal.status = "applied";
      // eslint-disable-next-line functional/immutable-data
      proposal.validationReport = validationReport;

      return {
        success: true,
        rollbackData: currentConfig,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to apply proposal: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Rollback configuration changes
   *
   * Restores the previous configuration in case of issues after applying
   * an optimization proposal.
   */
  async rollbackConfiguration(
    rollbackData: Config,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.saveConfig(rollbackData);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to rollback configuration: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Create performance comparison report
   *
   * Compares performance before and after applying optimization proposals
   * to validate the effectiveness of the changes.
   */
  async createPerformanceComparison(
    beforeMetrics: BacktestResult,
    afterMetrics: BacktestResult,
    _timeRange: { start: number; end: number },
  ): Promise<{
    improvement: boolean;
    metrics: {
      pnlImprovement: number;
      winRateImprovement: number;
      drawdownImprovement: number;
      sharpeImprovement: number;
    };
    recommendation: "keep" | "rollback";
    reason: string;
  }> {
    const pnlImprovement = afterMetrics.totalPnL - beforeMetrics.totalPnL;
    const winRateImprovement = afterMetrics.winRate - beforeMetrics.winRate;
    const drawdownImprovement = beforeMetrics.maxDrawdown -
      afterMetrics.maxDrawdown; // Positive = better
    const sharpeImprovement = afterMetrics.sharpeRatio -
      beforeMetrics.sharpeRatio;

    // Determine if changes should be kept

    // eslint-disable-next-line functional/no-let
    let improvement = true;

    // eslint-disable-next-line functional/no-let
    let recommendation: "keep" | "rollback" = "keep";

    // eslint-disable-next-line functional/no-let
    let reason = "Performance metrics improved";

    // Apply rollback rules
    if (pnlImprovement <= 0) {
      improvement = false;
      recommendation = "rollback";
      reason = "PnL decreased after optimization";
    } else if (
      drawdownImprovement < 0 &&
      Math.abs(drawdownImprovement) > beforeMetrics.maxDrawdown * 0.1
    ) {
      improvement = false;
      recommendation = "rollback";
      reason = "Drawdown increased by more than 10%";
    } else if (winRateImprovement < -0.1) {
      improvement = false;
      recommendation = "rollback";
      reason = "Win rate decreased significantly";
    }

    return {
      improvement,
      metrics: {
        pnlImprovement,
        winRateImprovement,
        drawdownImprovement,
        sharpeImprovement,
      },
      recommendation,
      reason,
    };
  }

  /**
   * Build analysis prompt from template
   */
  private buildAnalysisPrompt(narratives: string[], trades: Trade[]): string {
    // Calculate time range
    const timestamps = trades.map((t) => t.timestamp);
    const startTime = new Date(Math.min(...timestamps)).toISOString();
    const endTime = new Date(Math.max(...timestamps)).toISOString();

    // Format narratives
    const failedTradeNarratives = narratives.join("\n");

    // Replace placeholders in template
    return this.analysisPromptTemplate
      .replace("{recentInsights}", "None available")
      .replace("{startTime}", startTime)
      .replace("{endTime}", endTime)
      .replace("{failedTradeNarratives}", failedTradeNarratives);
  }

  /**
   * Build optimization prompt from template
   */
  private buildOptimizationPrompt(
    insight: Insight,
    currentConfig: Config,
  ): string {
    // Get relevant config values based on insight
    const relevantValues = this.extractRelevantConfigValues(
      insight,
      currentConfig,
    );

    // Build config schema description
    const configSchema = this.getConfigSchemaDescription();

    // Replace placeholders in template
    return this.optimizationPromptTemplate
      .replace("{insightText}", insight.text)
      .replace("{configSchema}", configSchema)
      .replace(
        "{relevantConfigValues}",
        JSON.stringify(relevantValues, null, 2),
      );
  }

  /**
   * Deep Think: Generate intermediate reasoning chain
   * Requirement: Phase 3 - "Depp Think" loop
   */
  private async deepThink(context: string): Promise<string> {
    const prompt = this.deepThinkPromptTemplate.replace("{context}", context);

    try {
      return await this.client.generate(prompt, {
        temperature: 0.7, // Higher temperature for creative reasoning
        maxOutputTokens: 2048,
      });
    } catch (error) {
      console.warn("Deep think failed, proceeding without it:", error);
      return "Analysis skipped due to error.";
    }
  }

  /**
   * Extract relevant config values based on insight
   */
  private extractRelevantConfigValues(
    insight: Insight,
    config: Config,
  ): Record<string, unknown> {
    const relevant: Record<string, unknown> = {};

    // If insight mentions specific traps, include their config
    if (insight.affectedTraps && insight.affectedTraps.length > 0) {
      for (const trap of insight.affectedTraps) {
        const trapKey = trap.toLowerCase().replace(/ /g, "_");
        if (trapKey in config.traps) {
          // eslint-disable-next-line functional/immutable-data
          relevant[`traps.${trapKey}`] =
            config.traps[trapKey as keyof typeof config.traps];
        }
      }
    } else {
      // Include all trap configs if no specific traps mentioned
      // eslint-disable-next-line functional/immutable-data
      relevant["traps"] = config.traps;
    }

    // Always include risk and execution config
    // eslint-disable-next-line functional/immutable-data
    relevant["risk"] = config.risk;
    // eslint-disable-next-line functional/immutable-data
    relevant["execution"] = config.execution;

    return relevant;
  }

  /**
   * Get config schema description for prompt
   */
  private getConfigSchemaDescription(): string {
    return `{
  "traps": {
    "<trap_name>": {
      "enabled": boolean,
      "stop_loss": number (0.001-0.05),
      "take_profit": number (0.005-0.20),
      "trailing_stop": number (0.001-0.05, optional),
      "risk_per_trade": number (0.001-0.05),
      "max_leverage": integer (1-20),
      "min_confidence": number (0-1),
      "cooldown_period": integer (0-3600)
    }
  },
  "risk": {
    "max_daily_loss": number (0.01-0.20),
    "max_position_size": number (0.1-1.0),
    "max_open_positions": integer (1-10),
    "emergency_flatten_threshold": number (0.05-0.30)
  },
  "execution": {
    "latency_penalty": number (0-1000),
    "slippage_model": "conservative" | "realistic" | "optimistic",
    "limit_chaser_enabled": boolean,
    "max_fill_time": integer (100-5000)
  }
}`;
  }

  /**
   * Parse and validate analysis response
   */
  private parseAnalysisResponse(response: AnalysisResponse): Insight[] {
    if (!response || !Array.isArray(response.insights)) {
      return [];
    }

    return response.insights
      .filter((i) => i.topic && i.text && typeof i.confidence === "number")
      .map((i) => ({
        topic: i.topic,
        text: i.text,
        confidence: Math.max(0, Math.min(1, i.confidence)), // Clamp to [0, 1]
        affectedSymbols: i.affectedSymbols,
        affectedTraps: i.affectedTraps,
        regimeContext: i.regimeContext,
      }));
  }

  /**
   * Create a rejection validation report
   */
  private createRejectionReport(
    proposal: OptimizationProposal,
    reason: string,
  ): ValidationReport {
    const now = Date.now();
    const emptyMetrics: BacktestResult = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      avgSlippage: 0,
      avgDuration: 0,
      profitFactor: 0,
    };

    return {
      passed: false,
      timestamp: now,
      backtestPeriod: {
        start: now - 24 * 60 * 60 * 1000,
        end: now,
      },
      baselineMetrics: emptyMetrics,
      proposedMetrics: emptyMetrics,
      deltas: {
        pnlDelta: 0,
        pnlDeltaPercent: 0,
        drawdownDelta: 0,
        drawdownDeltaPercent: 0,
        winRateDelta: 0,
      },
      confidenceScore: 0,
      rejectionReason: reason,
      recommendation: "reject",
    };
  }

  /**
   * Default analysis prompt template
   */
  private getDefaultAnalysisPrompt(): string {
    return `You are a quantitative trading analyst reviewing execution logs.

CONTEXT:
- Recent Insights: {recentInsights}
- Time Period: {startTime} to {endTime}

FAILED TRADES:
{failedTradeNarratives}

TASK:
Identify patterns in losses. Consider:
1. Time-of-day correlations
2. Symbol-specific issues
3. Regime context (were losses during Risk-Off periods?)
4. Trap type performance
5. Slippage patterns

OUTPUT FORMAT (JSON):
{
  "insights": [
    {
      "topic": "string",
      "text": "string",
      "confidence": 0.0-1.0,
      "affectedSymbols": ["string"],
      "regimeContext": "string"
    }
  ]
}`;
  }

  /**
   * Default optimization prompt template
   */
  private getDefaultOptimizationPrompt(): string {
    return `You are a trading system engineer proposing configuration changes.

INSIGHT:
{insightText}

CURRENT CONFIG SCHEMA:
{configSchema}

CURRENT VALUES:
{relevantConfigValues}

TASK:
Map this insight to specific config.json parameters. Propose ONE change.

CONSTRAINTS:
- max_leverage: 1-20
- stop_loss: 0.001-0.05
- risk_per_trade: 0.001-0.05
- Only modify parameters that exist in the schema

OUTPUT FORMAT (JSON):
{
  "targetKey": "traps.oi_wipeout.stop_loss",
  "currentValue": 0.01,
  "suggestedValue": 0.015,
  "reasoning": "string",
  "expectedImpact": {
    "pnlImprovement": 5.0,
    "riskChange": 2.0,
    "confidenceScore": 0.75
  }
}`;
  }

  /**
   * Default deep think prompt template
   */
  private getDefaultDeepThinkPrompt(): string {
    return `You are a senior quantitative researcher analyzing a trading system configuration issue.

CONTEXT:
{context}

TASK:
Perform a "Deep Think" analysis. Do not generate the JSON proposal yet. Instead:
1. Analyze the root cause of the insight.
2. Evaluate potential side effects of changing relevant parameters.
3. Consider counter-factuals (what if we do the opposite?).
4. Formulate a specific hypothesis for optimization.

OUTPUT:
Provide a concise reasoning paragraph (plain text).`;
  }

  /**
   * Check if rate limit allows a request
   */
  canMakeRequest(): boolean {
    return this.client.canMakeRequest();
  }

  /**
   * Get current request count
   */
  getCurrentRequestCount(): number {
    return this.client.getCurrentRequestCount();
  }

  /**
   * Get time until next available slot
   */
  getTimeUntilNextSlot(): number {
    return this.client.getTimeUntilNextSlot();
  }

  /**
   * Load current configuration from file system
   */
  private async loadCurrentConfig(): Promise<Config> {
    try {
      const configPath = path.join(
        process.cwd(),
        "config",
        "phase1.config.json",
      );
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(configContent);
      }
    } catch (error) {
      console.warn("Failed to load current config, using defaults:", error);
    }

    // Return default configuration if file doesn't exist
    return this.getDefaultConfig();
  }

  /**
   * Save configuration to file system
   */
  private async saveConfig(config: Config): Promise<void> {
    const configPath = path.join(process.cwd(), "config", "phase1.config.json");
    const configDir = path.dirname(configPath);

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Apply optimization proposal to configuration
   */
  private applyProposalToConfig(
    currentConfig: Config,
    proposal: OptimizationProposal,
  ): Config {
    const newConfig = JSON.parse(JSON.stringify(currentConfig)); // Deep clone

    // Parse the target key path (e.g., "traps.oi_wipeout.stop_loss")
    const keyPath = proposal.targetKey.split(".");

    // Navigate to the target object
    // eslint-disable-next-line functional/no-let
    let target = newConfig;
    // eslint-disable-next-line functional/no-let
    for (let i = 0; i < keyPath.length - 1; i++) {
      const key = keyPath[i];
      if (!(key in target)) {
        // eslint-disable-next-line functional/immutable-data
        target[key] = {};
      }
      target = target[key];
    }

    // Set the new value
    const finalKey = keyPath[keyPath.length - 1];
    // eslint-disable-next-line functional/immutable-data
    target[finalKey] = proposal.suggestedValue;

    return newConfig;
  }

  /**
   * Get backtest period (last 7 days by default)
   */
  private getBacktestPeriod(): { start: number; end: number } {
    const end = Date.now();
    const start = end - 7 * 24 * 60 * 60 * 1000; // 7 days ago
    return { start, end };
  }

  /**
   * Calculate validation confidence score
   */
  private calculateValidationConfidence(
    tradeCount: number,
    proposedResult: BacktestResult,
    baseResult: BacktestResult,
  ): number {
    // Base confidence from sample size
    const sampleConfidence = Math.min(0.9, 0.3 + (tradeCount / 1000) * 0.6);

    // Consistency factor
    const winRateDrop = baseResult.winRate - proposedResult.winRate;
    const consistencyPenalty = Math.max(0, winRateDrop * 0.5);

    // Improvement factor
    const pnlImprovement = baseResult.totalPnL !== 0
      ? (proposedResult.totalPnL - baseResult.totalPnL) /
        Math.abs(baseResult.totalPnL)
      : proposedResult.totalPnL > 0
      ? 0.1
      : 0;
    const improvementBonus = Math.min(0.1, Math.max(0, pnlImprovement * 0.1));

    return Math.max(
      0,
      Math.min(1, sampleConfidence - consistencyPenalty + improvementBonus),
    );
  }

  /**
   * Create basic validation report without backtesting
   */
  private createBasicValidationReport(
    proposal: OptimizationProposal,
  ): ValidationReport {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Create baseline metrics (placeholder)
    const baselineMetrics: BacktestResult = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      avgSlippage: 0,
      avgDuration: 0,
      profitFactor: 0,
    };

    // Create proposed metrics (placeholder)
    const proposedMetrics: BacktestResult = { ...baselineMetrics };

    // Determine recommendation based on expected impact
    const { pnlImprovement, riskChange, confidenceScore } =
      proposal.expectedImpact;

    // eslint-disable-next-line functional/no-let
    let passed = true;
    // eslint-disable-next-line functional/no-let
    let rejectionReason: string | undefined;
    // eslint-disable-next-line functional/no-let
    let recommendation: "approve" | "reject" | "review" = "review";

    // Apply rejection rules from design
    if (pnlImprovement <= 0) {
      passed = false;
      rejectionReason = "Expected PnL improvement is not positive";
      recommendation = "reject";
    } else if (riskChange > 10) {
      passed = false;
      rejectionReason = "Risk change exceeds 10% threshold";
      recommendation = "reject";
    } else if (confidenceScore < 0.5) {
      recommendation = "review";
    } else if (confidenceScore >= 0.7 && pnlImprovement > 0) {
      recommendation = "approve";
    }

    return {
      passed,
      timestamp: now,
      backtestPeriod: {
        start: oneDayAgo,
        end: now,
      },
      baselineMetrics,
      proposedMetrics,
      deltas: {
        pnlDelta: 0,
        pnlDeltaPercent: pnlImprovement,
        drawdownDelta: 0,
        drawdownDeltaPercent: riskChange,
        winRateDelta: 0,
      },
      confidenceScore,
      rejectionReason,
      recommendation,
    };
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): Config {
    return {
      traps: {
        oi_wipeout: {
          enabled: true,
          stop_loss: 0.015,
          take_profit: 0.03,
          risk_per_trade: 0.01,
          max_leverage: 15,
          min_confidence: 0.7,
          cooldown_period: 300,
        },
        funding_spike: {
          enabled: true,
          stop_loss: 0.02,
          take_profit: 0.04,
          risk_per_trade: 0.01,
          max_leverage: 12,
          min_confidence: 0.75,
          cooldown_period: 600,
        },
        liquidity_sweep: {
          enabled: true,
          stop_loss: 0.01,
          take_profit: 0.025,
          risk_per_trade: 0.008,
          max_leverage: 18,
          min_confidence: 0.8,
          cooldown_period: 180,
        },
        volatility_spike: {
          enabled: false,
          stop_loss: 0.025,
          take_profit: 0.05,
          risk_per_trade: 0.015,
          max_leverage: 10,
          min_confidence: 0.65,
          cooldown_period: 900,
        },
      },
      risk: {
        max_daily_loss: 0.05,
        max_position_size: 0.5,
        max_open_positions: 3,
        emergency_flatten_threshold: 0.1,
      },
      execution: {
        latency_penalty: 200,
        slippage_model: "realistic",
        limit_chaser_enabled: true,
        max_fill_time: 1000,
      },
    };
  }
}
