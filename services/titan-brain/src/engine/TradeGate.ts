/**
 * TradeGate.ts
 * Centralized gatekeeper for trade viability.
 * Enforces Positive Expectancy: Expected Edge > Total Friction (Spread + Fees + Slippage).
 *
 * Requirements:
 * - Block trades with net_edge <= 0.
 * - Estimate slippage using Square-Root Law.
 */

import { IntentSignal } from "../types/index.js";
import { logger } from "../utils/Logger.js";

export interface TradeGateConfig {
  /** Maker fee rate (e.g., 0.0002 for 0.02%) */
  makerFee: number;
  /** Taker fee rate (e.g., 0.0005 for 0.05%) */
  takerFee: number;
  /** Minimum edge multiplier (e.g., 1.0 means Edge > Cost) */
  minEdgeMultiplier: number;
  /** Default slippage in BPS if volatility checks fail (e.g. 5) */
  defaultSlippageBps: number;
  /** Coefficient for Square Root Law (typically 0.7 - 1.0) */
  volatilityMultiplier: number;
  /** Default daily volume in USD for impact calc if unknown */
  defaultDailyVolume: number;
}

export interface ViabilityResult {
  accepted: boolean;
  reason: string;
  metrics: {
    expectedEdge: number;
    totalFriction: number;
    spreadCost: number;
    feeCost: number;
    slippageCost: number;
    netExpectancy: number;
  };
}

export class TradeGate {
  private config: TradeGateConfig;

  constructor(config?: Partial<TradeGateConfig>) {
    this.config = {
      makerFee: config?.makerFee ?? 0.0002, // 0.02%
      takerFee: config?.takerFee ?? 0.0005, // 0.05%
      minEdgeMultiplier: config?.minEdgeMultiplier ?? 1.05, // 5% buffer
      defaultSlippageBps: config?.defaultSlippageBps ?? 5, // 5 bps fallback
      volatilityMultiplier: config?.volatilityMultiplier ?? 0.7,
      defaultDailyVolume: config?.defaultDailyVolume ?? 100_000_000, // $100M
    };
  }

  /**
   * Check if a trade signal has positive expectancy after costs.
   * @param signal The intent signal to evaluate
   * @returns ViabilityResult with decision and metrics
   */
  public checkViability(signal: IntentSignal): ViabilityResult {
    // 1. Get Expected Edge (default to 0 if not provided)
    const expectedEdge = signal.expectedEdge ?? 0;

    // 2. Estimate Costs

    // 2.1 Fees (Assume Taker for conservative estimate, or check if signal implies maker)
    // IntentSignal currently doesn't specify order type, assuming Taker for safety in cost model.
    const feeCost = this.config.takerFee;

    // 2.2 Calculate Volatility (needed for Spread and Slippage)
    const sigma = signal.volatility ?? 0.03; // Default 3% daily vol
    const dailyVol = this.config.defaultDailyVolume;

    // 2.3 Spread Cost (Assumed 1/2 spread if crossing, but we model full spread impact as cost)
    // Dynamic: Spread typically widens with volatility.
    // Approx: Spread ~ 0.1 * Daily Volatility (heuristic) or min 2bps
    const estimatedSpread = Math.max(0.0002, sigma * 0.1);
    const spreadCost = estimatedSpread;

    // 2.4 Slippage (Impact)
    // Formula: Impact = c * sigma * sqrt(OrderSize / DailyVolume)
    // Impact BPS = Impact * 10000
    const size = signal.requestedSize;

    const volumeRatio = size / dailyVol;
    const impactParams = Math.sqrt(volumeRatio);

    // Slippage in decimal (e.g. 0.0005 for 5bps)
    const slippageCost = this.config.volatilityMultiplier * sigma *
      impactParams;

    // 3. Total Friction
    const totalFriction = feeCost + spreadCost + slippageCost;

    // 4. Expectancy Check
    // Net = Edge - Friction
    const netExpectancy = expectedEdge - totalFriction;

    // Required Edge = Friction * Multiplier
    const requiredEdge = totalFriction * this.config.minEdgeMultiplier;

    const accepted = expectedEdge > requiredEdge;

    const acceptedStr = accepted ? "✅ ACCEPTED" : "❌ REJECTED";
    const reason = accepted
      ? `Positive Expectancy: Edge ${
        (expectedEdge * 100).toFixed(
          3,
        )
      }% > Cost ${(totalFriction * 100).toFixed(3)}% (Spr: ${
        (spreadCost * 10000).toFixed(1)
      }bps)`
      : `Negative Expectancy: Edge ${
        (expectedEdge * 100).toFixed(
          3,
        )
      }% <= Cost ${(totalFriction * 100).toFixed(3)}% (Req: ${
        (requiredEdge * 100).toFixed(
          3,
        )
      }%)`;

    // Log the check
    logger.info(
      `[TradeGate] ${acceptedStr} ${signal.symbol} ${signal.side} $${size}: ${reason}`,
    );

    return {
      accepted,
      reason,
      metrics: {
        expectedEdge,
        totalFriction,
        spreadCost,
        feeCost,
        slippageCost,
        netExpectancy,
      },
    };
  }

  /**
   * Update configuration dynamically
   */
  public updateConfig(newConfig: Partial<TradeGateConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info("TradeGate config updated");
  }
}
