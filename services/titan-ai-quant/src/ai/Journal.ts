/**
 * Journal - Trade Log Parser
 *
 * Parses trade logs and correlates with regime snapshots
 * to create AI-readable narratives.
 *
 * Requirements: 1.1, 1.2, 1.6
 */

import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { RegimeSnapshot, Trade } from "../types/index.js";

/**
 * Maps trend state to human-readable string
 */
function trendStateToString(state: -1 | 0 | 1): string {
  switch (state) {
    case 1:
      return "Bull";
    case 0:
      return "Range";
    case -1:
      return "Bear";
    default:
      return "Unknown";
  }
}

/**
 * Maps volatility state to human-readable string
 */
function volStateToString(state: 0 | 1 | 2): string {
  switch (state) {
    case 0:
      return "Low-Vol";
    case 1:
      return "Normal-Vol";
    case 2:
      return "Extreme-Vol";
    default:
      return "Unknown-Vol";
  }
}

/**
 * Maps regime state to human-readable string
 */
function regimeStateToString(state: -1 | 0 | 1): string {
  switch (state) {
    case 1:
      return "Risk-On";
    case 0:
      return "Neutral";
    case -1:
      return "Risk-Off";
    default:
      return "Unknown";
  }
}

export class Journal {
  private tradesFilePath: string;
  private regimeFilePath: string;
  private regimeSnapshots: RegimeSnapshot[] = [];
  private regimeLoaded: boolean = false;

  constructor(
    tradesFilePath: string = path.join(process.cwd(), "logs", "trades.jsonl"),
    regimeFilePath: string = path.join(
      process.cwd(),
      "logs",
      "regime_snapshots.jsonl",
    ),
  ) {
    this.tradesFilePath = tradesFilePath;
    this.regimeFilePath = regimeFilePath;
  }

  /**
   * Load regime snapshots into memory for fast lookup
   * Regime snapshots are small enough to fit in memory
   */
  private async loadRegimeSnapshots(): Promise<void> {
    if (this.regimeLoaded) return;

    if (!fs.existsSync(this.regimeFilePath)) {
      this.regimeSnapshots = [];
      this.regimeLoaded = true;
      return;
    }

    const snapshots: RegimeSnapshot[] = [];
    const fileStream = fs.createReadStream(this.regimeFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const snapshot = JSON.parse(line) as RegimeSnapshot;
          snapshots.push(snapshot);
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Sort by timestamp for binary search
    this.regimeSnapshots = snapshots.sort((a, b) => a.timestamp - b.timestamp);
    this.regimeLoaded = true;
  }

  /**
   * Read trades efficiently using streaming
   * Uses Node.js readline for memory-efficient parsing of large files
   *
   * Requirement 1.1: Parse trades from trades.jsonl efficiently using streaming
   */
  async ingestTrades(limit?: number): Promise<Trade[]> {
    // Ensure regime snapshots are loaded for correlation
    await this.loadRegimeSnapshots();

    if (!fs.existsSync(this.tradesFilePath)) {
      return [];
    }

    const trades: Trade[] = [];
    const fileStream = fs.createReadStream(this.tradesFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (limit !== undefined && trades.length >= limit) {
        break;
      }

      if (line.trim()) {
        try {
          const trade = JSON.parse(line) as Trade;
          // Validate required fields
          if (this.isValidTrade(trade)) {
            trades.push(trade);
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Close the stream if we hit the limit early
    rl.close();
    fileStream.destroy();

    return trades;
  }

  /**
   * Validate that a trade object has all required fields
   */
  private isValidTrade(trade: unknown): trade is Trade {
    if (typeof trade !== "object" || trade === null) return false;

    const t = trade as Record<string, unknown>;
    return (
      typeof t.timestamp === "number" &&
      typeof t.symbol === "string" &&
      typeof t.trapType === "string" &&
      typeof t.pnl === "number" &&
      typeof t.duration === "number" &&
      typeof t.slippage === "number"
    );
  }

  /**
   * Convert trade to token-efficient narrative
   * Format: "Symbol: SOL, Type: OI_WIPEOUT, Result: -1.2%, Duration: 4s, Slippage: 0.1%, Regime: Risk-Off/Extreme-Vol"
   *
   * Requirement 1.2: Create token-efficient summaries containing symbol, trap type, result, duration, and slippage
   */
  summarizeTrade(trade: Trade, regime: RegimeSnapshot): string {
    const resultPercent = (trade.pnlPercent * 100).toFixed(2);
    const resultSign = trade.pnlPercent >= 0 ? "+" : "";
    const durationSec = Math.round(trade.duration / 1000);
    const slippagePercent = (trade.slippage * 100).toFixed(2);

    const regimeStr = `${regimeStateToString(regime.regimeState)}/${
      volStateToString(regime.volState)
    }`;
    const trendStr = trendStateToString(regime.trendState);

    return `Symbol: ${trade.symbol}, Type: ${trade.trapType.toUpperCase()}, Result: ${resultSign}${resultPercent}%, Duration: ${durationSec}s, Slippage: ${slippagePercent}%, Regime: ${regimeStr}, Trend: ${trendStr}`;
  }

  /**
   * Filter for loss-making trades
   * Returns trades where PnL is negative
   */
  getFailedTrades(trades: Trade[]): Trade[] {
    return trades.filter((trade) => trade.pnl < 0);
  }

  /**
   * Correlate trade with regime at execution time
   * Uses binary search to find the closest regime snapshot
   * that is less than or equal to the trade timestamp
   *
   * Requirement 1.6: Correlate each trade with the regime snapshot from that timestamp
   */
  getRegimeContext(trade: Trade): RegimeSnapshot | null {
    if (this.regimeSnapshots.length === 0) {
      return null;
    }

    // Binary search for the closest regime snapshot <= trade timestamp
    const targetTimestamp = trade.timestamp;
    let left = 0;
    let right = this.regimeSnapshots.length - 1;
    let result: RegimeSnapshot | null = null;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const snapshot = this.regimeSnapshots[mid];

      if (snapshot.timestamp <= targetTimestamp) {
        result = snapshot;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }

  /**
   * Get regime context for multiple trades efficiently
   * Useful for batch processing
   */
  getRegimeContextBatch(trades: Trade[]): Map<string, RegimeSnapshot | null> {
    const results = new Map<string, RegimeSnapshot | null>();

    for (const trade of trades) {
      results.set(trade.id, this.getRegimeContext(trade));
    }

    return results;
  }

  /**
   * Generate narratives for all failed trades
   * Combines getFailedTrades, getRegimeContext, and summarizeTrade
   */
  async generateFailureNarratives(limit?: number): Promise<string[]> {
    const trades = await this.ingestTrades(limit);
    const failedTrades = this.getFailedTrades(trades);
    const narratives: string[] = [];

    for (const trade of failedTrades) {
      const regime = this.getRegimeContext(trade);
      if (regime) {
        narratives.push(this.summarizeTrade(trade, regime));
      } else {
        // Create narrative without regime context
        const resultPercent = (trade.pnlPercent * 100).toFixed(2);
        const durationSec = Math.round(trade.duration / 1000);
        const slippagePercent = (trade.slippage * 100).toFixed(2);
        narratives.push(
          `Symbol: ${trade.symbol}, Type: ${trade.trapType.toUpperCase()}, Result: ${resultPercent}%, Duration: ${durationSec}s, Slippage: ${slippagePercent}%, Regime: Unknown`,
        );
      }
    }

    return narratives;
  }

  /**
   * Set regime snapshots directly (useful for testing)
   */
  setRegimeSnapshots(snapshots: RegimeSnapshot[]): void {
    this.regimeSnapshots = snapshots.sort((a, b) => a.timestamp - b.timestamp);
    this.regimeLoaded = true;
  }

  /**
   * Get loaded regime snapshots (useful for testing)
   */
  getRegimeSnapshots(): RegimeSnapshot[] {
    return this.regimeSnapshots;
  }

  /**
   * Reset the journal state (useful for testing)
   */
  reset(): void {
    this.regimeSnapshots = [];
    this.regimeLoaded = false;
  }
}
