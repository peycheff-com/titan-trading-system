/**
 * Nightly Optimization Job
 *
 * Automated daily optimization cycle that runs at 00:00 UTC.
 * Executes full cycle: ingest → analyze → propose → validate
 *
 * Implementation: Task 13
 * Requirements: 6.1, 6.2, 6.3, 6.5
 */

import * as schedule from "node-schedule";
import * as fs from "fs";
import * as path from "path";
import {
  Config,
  Insight,
  MorningBriefing,
  OptimizationProposal,
  RegimeSnapshot,
  Trade,
  ValidationReport,
} from "../types/index.js";
import { Journal } from "../ai/Journal.js";
import { TitanAnalyst } from "../ai/TitanAnalyst.js";
import { StrategicMemory } from "../ai/StrategicMemory.js";
import { Backtester, InMemoryDataCache } from "../simulation/Backtester.js";

export interface NightlyOptimizeConfig {
  /** Cron schedule expression (default: '0 0 * * *' = 00:00 UTC) */
  schedule?: string;
  /** Path to trades.jsonl file */
  tradesFilePath?: string;
  /** Path to regime_snapshots.jsonl file */
  regimeFilePath?: string;
  /** Path to config.json file */
  configFilePath?: string;
  /** Path to store morning briefing */
  briefingFilePath?: string;
  /** Path to SQLite database */
  dbPath?: string;
  /** Minimum confidence threshold for proposals (default: 0.7) */
  minConfidence?: number;
  /** Maximum number of proposals to generate per run (default: 3) */
  maxProposals?: number;
}

/**
 * NightlyOptimize - Automated daily optimization cycle
 *
 * Runs at 00:00 UTC (or configured schedule) to:
 * 1. Ingest last 24 hours of trade logs
 * 2. Analyze failures to identify patterns
 * 3. Generate optimization proposals
 * 4. Validate proposals through backtesting
 * 5. Store insights and proposals in strategic memory
 * 6. Generate morning briefing for display on startup
 */
export class NightlyOptimize {
  private job: schedule.Job | null = null;
  private readonly journal: Journal;
  private readonly analyst: TitanAnalyst;
  private readonly memory: StrategicMemory;
  private readonly backtester: Backtester;
  private readonly config: Required<NightlyOptimizeConfig>;

  constructor(config: NightlyOptimizeConfig = {}) {
    this.config = {
      schedule: config.schedule ?? "0 0 * * *",
      tradesFilePath: config.tradesFilePath ??
        path.join(process.cwd(), "logs", "trades.jsonl"),
      regimeFilePath: config.regimeFilePath ??
        path.join(process.cwd(), "logs", "regime_snapshots.jsonl"),
      configFilePath: config.configFilePath ??
        path.join(process.cwd(), "config", "phase1.config.json"),
      briefingFilePath: config.briefingFilePath ??
        path.join(process.cwd(), "logs", "morning_briefing.json"),
      dbPath: config.dbPath ??
        path.join(process.cwd(), "data", "strategic_memory.db"),
      minConfidence: config.minConfidence ?? 0.7,
      maxProposals: config.maxProposals ?? 3,
    };

    this.journal = new Journal(
      this.config.tradesFilePath,
      this.config.regimeFilePath,
    );
    this.analyst = new TitanAnalyst();
    this.memory = new StrategicMemory(this.config.dbPath);
    this.backtester = new Backtester(new InMemoryDataCache());
  }

  /**
   * Start the scheduled job
   *
   * Requirement 6.1: Execute at 00:00 UTC or during low volume periods
   */
  start(): void {
    if (this.job) {
      return; // Already running
    }

    this.job = schedule.scheduleJob(this.config.schedule, async () => {
      try {
        await this.runOptimization();
      } catch (error) {
        console.error("NightlyOptimize job failed:", error);
      }
    });

    console.log(`NightlyOptimize scheduled with cron: ${this.config.schedule}`);
  }

  /**
   * Stop the scheduled job
   */
  stop(): void {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      console.log("NightlyOptimize job stopped");
    }
  }

  /**
   * Check if the job is currently scheduled
   */
  isRunning(): boolean {
    return this.job !== null;
  }

  /**
   * Get the next scheduled run time
   */
  getNextRun(): Date | null {
    return this.job?.nextInvocation() ?? null;
  }

  /**
   * Run full optimization cycle
   *
   * Requirement 6.2: Analyze the last 24 hours of trade logs
   * Requirement 6.5: Store insights in strategic memory for future context
   */
  async runOptimization(): Promise<MorningBriefing> {
    console.log("Starting nightly optimization cycle...");
    const startTime = Date.now();

    // 1. Ingest last 24 hours of trades
    const trades = await this.journal.ingestTrades();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentTrades = trades.filter((t) => t.timestamp >= oneDayAgo);

    console.log(`Ingested ${recentTrades.length} trades from last 24 hours`);

    // 2. Load regime snapshots for context
    const regimeSnapshots = this.journal.getRegimeSnapshots();

    // 3. Analyze failures to identify patterns
    const insights = await this.analyst.analyzeFailures(
      recentTrades,
      regimeSnapshots,
    );
    console.log(`Generated ${insights.length} insights`);

    // 4. Store insights in strategic memory
    for (const insight of insights) {
      await this.memory.storeInsightFull(insight);
    }

    // 5. Generate proposals for high-confidence insights
    const proposals: Array<
      { proposal: OptimizationProposal; validation: ValidationReport }
    > = [];
    const currentConfig = this.loadCurrentConfig();
    const highConfidenceInsights = insights
      .filter((i) => i.confidence >= this.config.minConfidence)
      .slice(0, this.config.maxProposals);

    for (const insight of highConfidenceInsights) {
      try {
        // Generate proposal
        const proposal = await this.analyst.proposeOptimization(
          insight,
          currentConfig,
        );

        // Validate proposal
        const validation = await this.analyst.validateProposal(proposal);

        if (validation.passed) {
          // Store proposal in strategic memory
          const proposalId = await this.memory.storeProposal({
            ...proposal,
            validationReport: validation,
            status: "pending",
          });
          proposal.id = proposalId;

          proposals.push({ proposal, validation });
          console.log(`Generated proposal for: ${proposal.targetKey}`);
        }
      } catch (error) {
        console.error(
          `Failed to generate proposal for insight: ${insight.topic}`,
          error,
        );
      }
    }

    // 6. Generate morning briefing
    const briefing = this.generateBriefing(insights, proposals, recentTrades);

    // 7. Store briefing to file for display on startup
    this.saveBriefing(briefing);

    const duration = Date.now() - startTime;
    console.log(`Nightly optimization completed in ${duration}ms`);

    return briefing;
  }

  /**
   * Generate morning briefing
   *
   * Requirement 6.3: Generate a morning briefing with key findings
   */
  generateBriefing(
    insights: Insight[],
    proposals: Array<
      { proposal: OptimizationProposal; validation: ValidationReport }
    >,
    trades?: Trade[],
  ): MorningBriefing {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];

    // Calculate performance summary from trades
    const performanceSummary = this.calculatePerformanceSummary(trades ?? []);

    // Build summary text
    const summaryParts: string[] = [];
    summaryParts.push(
      `Analyzed ${insights.length} pattern${insights.length !== 1 ? "s" : ""}`,
    );
    if (proposals.length > 0) {
      summaryParts.push(
        `generated ${proposals.length} optimization proposal${
          proposals.length !== 1 ? "s" : ""
        }`,
      );
    }
    if (trades && trades.length > 0) {
      const failedCount = trades.filter((t) => t.pnl < 0).length;
      summaryParts.push(
        `reviewed ${trades.length} trades (${failedCount} losses)`,
      );
    }

    return {
      date: dateStr,
      summary: summaryParts.join(", "),
      topInsights: insights.slice(0, 3),
      pendingProposals: proposals,
      performanceSummary,
    };
  }

  /**
   * Calculate performance summary from trades
   */
  private calculatePerformanceSummary(
    trades: Trade[],
  ): MorningBriefing["performanceSummary"] {
    if (trades.length === 0) {
      return { totalTrades: 0, winRate: 0, pnl: 0 };
    }

    const winningTrades = trades.filter((t) => t.pnl > 0).length;
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

    return {
      totalTrades: trades.length,
      winRate: winningTrades / trades.length,
      pnl: totalPnl,
    };
  }

  /**
   * Load current configuration from file
   */
  private loadCurrentConfig(): Config {
    try {
      if (fs.existsSync(this.config.configFilePath)) {
        const content = fs.readFileSync(this.config.configFilePath, "utf-8");
        return JSON.parse(content) as Config;
      }
    } catch (error) {
      console.error("Failed to load config:", error);
    }

    // Return default config if file doesn't exist or is invalid
    return this.getDefaultConfig();
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): Config {
    return {
      traps: {
        oi_wipeout: {
          enabled: true,
          stop_loss: 0.02,
          take_profit: 0.04,
          risk_per_trade: 0.02,
          max_leverage: 10,
          min_confidence: 0.7,
          cooldown_period: 300,
        },
        funding_spike: {
          enabled: true,
          stop_loss: 0.015,
          take_profit: 0.03,
          risk_per_trade: 0.015,
          max_leverage: 8,
          min_confidence: 0.75,
          cooldown_period: 600,
        },
        liquidity_sweep: {
          enabled: true,
          stop_loss: 0.025,
          take_profit: 0.05,
          risk_per_trade: 0.02,
          max_leverage: 12,
          min_confidence: 0.65,
          cooldown_period: 180,
        },
        volatility_spike: {
          enabled: true,
          stop_loss: 0.03,
          take_profit: 0.06,
          risk_per_trade: 0.025,
          max_leverage: 15,
          min_confidence: 0.6,
          cooldown_period: 120,
        },
      },
      risk: {
        max_daily_loss: 0.07,
        max_position_size: 0.5,
        max_open_positions: 3,
        emergency_flatten_threshold: 0.15,
      },
      execution: {
        latency_penalty: 200,
        slippage_model: "realistic",
        limit_chaser_enabled: true,
        max_fill_time: 1000,
      },
    };
  }

  /**
   * Save briefing to file for display on startup
   */
  private saveBriefing(briefing: MorningBriefing): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.briefingFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.config.briefingFilePath,
        JSON.stringify(briefing, null, 2),
        "utf-8",
      );
      console.log(`Morning briefing saved to: ${this.config.briefingFilePath}`);
    } catch (error) {
      console.error("Failed to save briefing:", error);
    }
  }

  /**
   * Load morning briefing from file
   * Returns null if no briefing exists or it's outdated
   */
  static loadBriefing(briefingFilePath?: string): MorningBriefing | null {
    const filePath = briefingFilePath ??
      path.join(process.cwd(), "logs", "morning_briefing.json");

    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const briefing = JSON.parse(content) as MorningBriefing;

      // Check if briefing is from today
      const today = new Date().toISOString().split("T")[0];
      if (briefing.date !== today) {
        return null; // Outdated briefing
      }

      return briefing;
    } catch {
      return null;
    }
  }

  /**
   * Run optimization immediately (for testing or manual trigger)
   */
  async runNow(): Promise<MorningBriefing> {
    return this.runOptimization();
  }

  /**
   * Get the strategic memory instance (for testing)
   */
  getMemory(): StrategicMemory {
    return this.memory;
  }

  /**
   * Get the journal instance (for testing)
   */
  getJournal(): Journal {
    return this.journal;
  }

  /**
   * Get the analyst instance (for testing)
   */
  getAnalyst(): TitanAnalyst {
    return this.analyst;
  }

  /**
   * Close resources
   */
  close(): void {
    this.stop();
    this.memory.close();
  }
}
