/**
 * BudgetService.ts
 * Proactive Allocator that issues Risk Budgets to Phases.
 *
 * Logic:
 * 1. Calculate Base Allocation from AllocationEngine (Equity -> Weights).
 * 2. Apply Execution Quality Penalty (Slippage/Rejects -> Throttle).
 * 3. Apply Regime Penalty (Crash/Uncertainty -> Halt/Reduce).
 * 4. Emit deterministic PhaseBudget events.
 */

import { v4 as uuidv4 } from "uuid";
import { AllocationEngine } from "../features/Allocation/AllocationEngine.js";
import { RiskGuardian } from "../features/Risk/RiskGuardian.js";
import {
  getCanonicalRiskPolicy,
  NatsClient,
  RegimeState,
  TitanSubject,
} from "@titan/shared";
import { logger } from "../utils/Logger.js";
import {
  BudgetState,
  ExecutionQualityReport,
  PhaseBudget,
} from "../types/budget.js";
import { RiskPolicy, RiskPolicyState } from "../types/risk.js";
import { PerformanceTracker } from "./PerformanceTracker.js";

export interface BudgetServiceConfig {
  /** Interval in ms to broadcast budgets (e.g. 5000ms) */
  broadcastInterval: number;
  /** Budget validity duration in ms (e.g. 10000ms) */
  budgetTtl: number;
  /** Slippage threshold in BPS to trigger throttling */
  slippageThresholdBps: number;
  /** Reject rate threshold (0-1) to trigger throttling */
  rejectRateThreshold: number;
}

export class BudgetService {
  private config: BudgetServiceConfig;
  private allocationEngine: AllocationEngine;
  private riskGuardian: RiskGuardian; // For Regime & Confidence
  private performanceTracker: PerformanceTracker;
  private natsClient: NatsClient;

  // State
  private currentQuality: ExecutionQualityReport;
  private lastBroadcast: number = 0;
  private broadcastTimer: NodeJS.Timeout | null = null;

  // Phase IDs
  private readonly PHASES = ["phase1", "phase2", "phase3"];

  constructor(
    config: BudgetServiceConfig,
    allocationEngine: AllocationEngine,
    riskGuardian: RiskGuardian,
    performanceTracker: PerformanceTracker,
    natsClient: NatsClient,
  ) {
    this.config = config;
    this.allocationEngine = allocationEngine;
    this.riskGuardian = riskGuardian;
    this.performanceTracker = performanceTracker;
    this.natsClient = natsClient;

    // Default "Perfect" Quality until reported otherwise
    this.currentQuality = {
      timestamp: Date.now(),
      avgSlippageBps: 0,
      fillRate: 1.0,
      rejectRate: 0.0,
      latencyMs: 0,
    };
  }

  public async start(): Promise<void> {
    logger.info("[BudgetService] Starting...");

    // Start Broadcast Loop

    this.broadcastTimer = setInterval(() => {
      this.broadcastBudgets().catch((err) =>
        logger.error("[BudgetService] Broadcast failed:", err)
      );
    }, this.config.broadcastInterval);
  }

  public stop(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);

      this.broadcastTimer = null;
    }
    logger.info("[BudgetService] Stopped.");
  }

  /**
   * Update internal view of Execution Quality
   * Called when new report arrives (e.g. via NATS or internal metrics)
   */
  public updateExecutionQuality(report: ExecutionQualityReport): void {
    this.currentQuality = report;

    // Immediate check: If quality is critical, broadcast throttle IMMEDIATELY
    if (this.isQualityCritical(report)) {
      logger.warn(
        "[BudgetService] Critical Quality Degradation detected. Broadcasting throttle immediately.",
      );
      this.broadcastBudgets();
    }
  }

  private isQualityCritical(report: ExecutionQualityReport): boolean {
    return (
      report.avgSlippageBps > this.config.slippageThresholdBps * 2 ||
      report.rejectRate > this.config.rejectRateThreshold * 2
    );
  }

  /**
   * Core Logic: Calculate and Broadcast Budgets
   */
  private async broadcastBudgets(): Promise<void> {
    const timestamp = Date.now();
    const expiresAt = timestamp + this.config.budgetTtl;
    const equity = this.riskGuardian.getEquity(); // Get authoritative equity from RiskGuardian
    const tier = this.allocationEngine.getEquityTier(equity);
    const maxLeverage = this.allocationEngine.getMaxLeverage(equity);
    const canonicalPolicy = getCanonicalRiskPolicy();

    // 1. Get Base Weights
    // Note: In real impl, we might use getAdaptiveWeights using performance history
    const weights = this.allocationEngine.getWeights(equity);

    // 2. Determine System State
    const regime = this.riskGuardian.getRegimeState();

    let systemState = BudgetState.ACTIVE;

    let penaltyMultiplier = 1.0;

    let reason = "Normal Operation";

    // 2a. Regime Check
    if (regime === RegimeState.CRASH) {
      systemState = BudgetState.CLOSE_ONLY;
      penaltyMultiplier = 0.0;
      reason = "REGIME_CRASH: Risk Halted";
    }

    // 2b. Quality Check
    if (systemState === BudgetState.ACTIVE) {
      if (
        this.currentQuality.avgSlippageBps > this.config.slippageThresholdBps
      ) {
        systemState = BudgetState.THROTTLED;
        penaltyMultiplier *= 0.5;
        reason += ` | High Slippage (${this.currentQuality.avgSlippageBps}bps)`;
      }
      if (this.currentQuality.rejectRate > this.config.rejectRateThreshold) {
        systemState = BudgetState.THROTTLED;
        penaltyMultiplier *= 0.5;
        reason += ` | High Rejects (${
          (this.currentQuality.rejectRate * 100).toFixed(1)
        }%)`;
      }
    }

    // 2c. Global Risk Limits (Daily Loss)
    const dailyPnL = this.performanceTracker.getCurrentDailyPnL();
    const maxDailyLoss = canonicalPolicy.policy.maxDailyLoss ?? 1000; // Positive number representing loss limit

    // PnL is usually negative when losing. If dailyPnL < -maxDailyLoss, we halt.
    if (dailyPnL < -Math.abs(maxDailyLoss)) {
      systemState = BudgetState.CLOSE_ONLY;
      penaltyMultiplier = 0.0;
      reason = `GLOBAL_RISK_HALT: Max Daily Loss Exceeded (${
        dailyPnL.toFixed(2)
      } < -${maxDailyLoss})`;
    }

    // 3. Generate Budgets for each Phase
    const budgets: PhaseBudget[] = this.PHASES.map((phaseId) => {
      let phaseWeight = 0;
      if (phaseId === "phase1") phaseWeight = weights.w1;
      else if (phaseId === "phase2") phaseWeight = weights.w2;
      else if (phaseId === "phase3") phaseWeight = weights.w3;

      // Calculate Notional Cap
      // Global Cap = Equity * MaxLeverage
      // Phase Cap = Global Cap * PhaseWeight * Penalty
      const globalCap = equity * maxLeverage;
      const phaseCap = globalCap * phaseWeight * penaltyMultiplier;

      // Ensure we don't issue budget if we are close to hitting loss limit
      // If we have $100 left of loss budget, we should be careful.
      // For now, the Halt above handles the hard stop. Proactive throttling could be added here.

      return {
        phaseId,
        budgetId: uuidv4(),
        timestamp,
        expiresAt,
        state: phaseWeight > 0 ? systemState : BudgetState.HALTED,
        maxNotional: Math.floor(phaseCap), // Integer USD
        maxLeverage: maxLeverage, // Global leverage cap applies to phase too
        maxDrawdown: equity * 0.02 * phaseWeight, // Example: 2% daily loss per phase share
        maxOrderRate: systemState === BudgetState.THROTTLED ? 5 : 30, // 5/sec logic or similar
        reason: phaseWeight > 0 ? reason : "Zero Allocation",
      };
    });

    // 4. Broadcast via NATS
    for (const budget of budgets) {
      try {
        await this.natsClient.publish(TitanSubject.EVT_BUDGET_UPDATE, budget);
      } catch (err) {
        logger.error(
          `[BudgetService] Failed to publish budget for ${budget.phaseId}`,
          err as Error,
        );
      }
    }

    // 5. Broadcast Risk Policy (Global Enforcement)
    // If regime is CRASH, we enforce stricter policy

    let riskPolicyState = RiskPolicyState.Normal;
    if (regime === RegimeState.CRASH) {
      riskPolicyState = RiskPolicyState.Emergency;
    } else if (
      regime === RegimeState.VOLATILE_BREAKOUT ||
      regime === RegimeState.MEAN_REVERSION
    ) {
      riskPolicyState = RiskPolicyState.Cautious;
    } else if (systemState === BudgetState.CLOSE_ONLY) {
      riskPolicyState = RiskPolicyState.Defensive;
    }

    // Map Canonical Policy to RiskPolicy payload
    const policyPayload: RiskPolicy = {
      current_state: riskPolicyState,
      max_position_notional: canonicalPolicy.policy.maxPositionNotional ??
        50000,
      max_account_leverage: canonicalPolicy.policy.maxAccountLeverage ?? 10,
      max_daily_loss: canonicalPolicy.policy.maxDailyLoss ?? 1000,
      max_open_orders_per_symbol:
        canonicalPolicy.policy.maxOpenOrdersPerSymbol ??
          5,
      symbol_whitelist: canonicalPolicy.policy.symbolWhitelist ??
        ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
      max_slippage_bps: 100, // Should be in policy?
      max_staleness_ms: 5000,
    };

    // Override if Emergency
    if (riskPolicyState === RiskPolicyState.Emergency) {
      policyPayload.max_position_notional = 0;
      policyPayload.max_open_orders_per_symbol = 0;
    }

    try {
      await this.natsClient.publish(
        TitanSubject.CMD_RISK_POLICY,
        policyPayload,
      );
    } catch (err) {
      logger.error(
        "[BudgetService] Failed to publish RiskPolicy",
        err as Error,
      );
    }

    this.lastBroadcast = timestamp;
    logger.debug(
      `[BudgetService] Broadcasted budgets. State: ${systemState}. Reason: ${reason}`,
    );
  }
}
