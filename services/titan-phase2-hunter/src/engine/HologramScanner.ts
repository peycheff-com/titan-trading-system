/**
 * HologramScanner - Continuous Symbol Scanning Engine
 *
 * Scans top 100 symbols by volume, ranks by alignment score, and selects top 20
 * for monitoring. Implements parallel processing and scan duration monitoring.
 *
 * Core Logic:
 * 1. Fetch top 100 symbols by 24h volume from Bybit
 * 2. Analyze each symbol using HologramEngine (parallel processing)
 * 3. Rank symbols by alignment score (A+ > B > CONFLICT > NO_PLAY)
 * 4. Select top 20 symbols for active monitoring
 * 5. Emit warning if scan takes > 30 seconds
 *
 * Requirements: 9.1-9.7 (Hologram Scanning Engine)
 */

import { EventEmitter } from "events";
import {
  EnhancedHolographicState,
  HologramState,
  HologramStatus,
} from "../types";
import { HologramEngine } from "./HologramEngine";
import { EnhancedHolographicEngine } from "./enhanced/EnhancedHolographicEngine";
import { BybitPerpsClient } from "../exchanges/BybitPerpsClient";
import { InstitutionalFlowClassifier } from "../flow/InstitutionalFlowClassifier";

export interface ScanResult {
  symbols: EnhancedHolographicState[];
  top20: EnhancedHolographicState[];
  scanDuration: number;
  timestamp: number;
  totalSymbols: number;
  successCount: number;
  errorCount: number;
}

export interface ScanStats {
  totalScans: number;
  averageDuration: number;
  lastScanDuration: number;
  successRate: number;
  slowScans: number; // Scans > 30s
}

export class HologramScanner extends EventEmitter {
  private hologramEngine: HologramEngine;
  private enhancedEngine: EnhancedHolographicEngine;
  private bybitClient: BybitPerpsClient;
  private isScanning = false;
  private scanStats: ScanStats = {
    totalScans: 0,
    averageDuration: 0,
    lastScanDuration: 0,
    successRate: 0,
    slowScans: 0,
  };
  private readonly SCAN_WARNING_THRESHOLD = 30000; // 30 seconds
  private readonly MAX_PARALLEL_REQUESTS = 10; // Limit concurrent API calls
  private readonly SCAN_TIMEOUT = 60000; // 60 seconds max scan time

  constructor(bybitClient: BybitPerpsClient) {
    super();
    this.bybitClient = bybitClient;
    const flowClassifier = new InstitutionalFlowClassifier();
    this.hologramEngine = new HologramEngine(bybitClient, flowClassifier);
    this.enhancedEngine = new EnhancedHolographicEngine();
    this.enhancedEngine.setHologramEngine(this.hologramEngine);
    // Initialize (fire and forget for now, or await if possible - keeping sync in constructor, relying on lazy init or error handling if not ready)
    this.enhancedEngine
      .initialize()
      .catch((err) => console.error("Failed to init enhanced engine:", err));
  }

  /**
   * Scan top 100 symbols and return ranked results
   * Implements parallel processing with concurrency limits
   *
   * @returns Promise with scan results including top 20 symbols
   */
  public async scan(): Promise<ScanResult> {
    if (this.isScanning) {
      throw new Error("Scan already in progress");
    }

    this.isScanning = true;
    const startTime = Date.now();
    let symbols: string[] = [];
    let holograms: EnhancedHolographicState[] = [];
    let successCount = 0;
    let errorCount = 0;

    try {
      console.log("🔍 Starting hologram scan...");

      // Step 1: Fetch top 100 symbols by volume
      symbols = await this.fetchTopSymbols();
      console.log(`📊 Fetched ${symbols.length} symbols for analysis`);

      // Step 2: Analyze symbols in parallel with concurrency control
      holograms = await this.analyzeSymbolsParallel(symbols);

      // Count successes and errors
      successCount = holograms.length;
      errorCount = symbols.length - successCount;

      // Step 3: Rank symbols by alignment score
      const rankedSymbols = this.rankByAlignment(holograms);

      // Step 4: Select top 20 for monitoring
      const top20 = this.selectTop20(rankedSymbols);

      // Calculate scan duration
      const scanDuration = Date.now() - startTime;

      // Step 5: Check for slow scan warning
      if (scanDuration > this.SCAN_WARNING_THRESHOLD) {
        this.scanStats.slowScans++;
        this.emit("scanSlow", {
          duration: scanDuration,
          threshold: this.SCAN_WARNING_THRESHOLD,
          symbolCount: symbols.length,
        });
        console.warn(
          `⚠️ Slow scan detected: ${scanDuration}ms (threshold: ${this.SCAN_WARNING_THRESHOLD}ms)`,
        );
      }

      // Update statistics
      this.updateScanStats(scanDuration, successCount, symbols.length);

      const result: ScanResult = {
        symbols: rankedSymbols,
        top20,
        scanDuration,
        timestamp: Date.now(),
        totalSymbols: symbols.length,
        successCount,
        errorCount,
      };

      // Emit scan complete event
      this.emit("scanComplete", result);

      console.log(
        `✅ Hologram scan complete: ${successCount}/${symbols.length} symbols analyzed in ${scanDuration}ms`,
      );
      console.log(
        `🎯 Top 20 symbols selected: ${
          top20.map((h) => `${h.symbol}(${h.alignment})`).join(", ")
        }`,
      );

      return result;
    } catch (error) {
      const scanDuration = Date.now() - startTime;
      this.updateScanStats(scanDuration, successCount, symbols.length);

      this.emit("scanError", {
        error: error instanceof Error ? error.message : "Unknown error",
        duration: scanDuration,
        symbolsProcessed: successCount,
        totalSymbols: symbols.length,
      });

      throw new Error(
        `Hologram scan failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Rank symbols by alignment score in descending order
   * Priority: A+ > B > CONFLICT > NO_PLAY
   * Within same status, sort by alignment score
   *
   * @param holograms - Array of hologram states
   * @returns Sorted array with highest alignment first
   */
  public rankByAlignment(
    holograms: EnhancedHolographicState[],
  ): EnhancedHolographicState[] {
    // Define status priority (lower number = higher priority)
    // New 2026 Enhanced Alignments: A+, A, B, C, VETO
    const statusPriority: { [key: string]: number } = {
      "A+": 1,
      A: 2,
      B: 3,
      C: 4,
      VETO: 5,
    };

    return holograms.sort((a, b) => {
      // First sort by status priority
      const statusDiff = (statusPriority[a.alignment] || 99) -
        (statusPriority[b.alignment] || 99);
      if (statusDiff !== 0) {
        return statusDiff;
      }

      // Within same status, sort by enhanced score (descending)
      const scoreDiff = b.enhancedScore - a.enhancedScore;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      // If alignment scores are equal, sort by RS score (descending)
      return Math.abs(b.rsScore) - Math.abs(a.rsScore);
    });
  }

  /**
   * Select top 20 symbols for monitoring
   * Filters for tradeable symbols (A+ and B status)
   * Falls back to best available if < 20 tradeable symbols
   *
   * @param rankedSymbols - Symbols ranked by alignment
   * @returns Top 20 symbols for monitoring
   */
  public selectTop20(
    rankedSymbols: EnhancedHolographicState[],
  ): EnhancedHolographicState[] {
    // First, try to get 20 tradeable symbols (A+, A, and B)
    const tradeableSymbols = rankedSymbols.filter(
      (h) => h.alignment === "A+" || h.alignment === "A" || h.alignment === "B",
    );

    if (tradeableSymbols.length >= 20) {
      return tradeableSymbols.slice(0, 20);
    }

    // If we don't have 20 tradeable symbols, take the best available
    console.warn(
      `⚠️ Only ${tradeableSymbols.length} tradeable symbols found, selecting top 20 overall`,
    );
    return rankedSymbols.slice(0, 20);
  }

  /**
   * Fetch top 100 symbols by 24h volume from Bybit
   * Uses BybitPerpsClient with caching
   *
   * @returns Promise with array of symbol names
   */
  private async fetchTopSymbols(): Promise<string[]> {
    try {
      const symbols = await this.bybitClient.fetchTopSymbols();

      if (symbols.length === 0) {
        throw new Error("No symbols returned from exchange");
      }

      // Ensure we have exactly 100 symbols (or less if exchange returns fewer)
      return symbols.slice(0, 100);
    } catch (error) {
      throw new Error(
        `Failed to fetch top symbols: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Analyze symbols in parallel with concurrency control
   * Processes symbols in batches to avoid overwhelming the API
   *
   * @param symbols - Array of symbol names to analyze
   * @returns Promise with array of successful hologram states
   */
  private async analyzeSymbolsParallel(
    symbols: string[],
  ): Promise<EnhancedHolographicState[]> {
    const results: EnhancedHolographicState[] = [];
    const errors: string[] = [];

    // Process symbols in batches to control concurrency
    for (let i = 0; i < symbols.length; i += this.MAX_PARALLEL_REQUESTS) {
      const batch = symbols.slice(i, i + this.MAX_PARALLEL_REQUESTS);

      console.log(
        `📈 Analyzing batch ${Math.floor(i / this.MAX_PARALLEL_REQUESTS) + 1}/${
          Math.ceil(
            symbols.length / this.MAX_PARALLEL_REQUESTS,
          )
        } (${batch.length} symbols)`,
      );

      // Create promises for this batch with timeout
      const batchPromises = batch.map(async (symbol) => {
        try {
          // Add timeout to individual symbol analysis
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error(`Analysis timeout for ${symbol}`)),
              10000,
            );
          });

          const analysisPromise = this.enhancedEngine.calculateEnhancedState(
            symbol,
          );
          const hologram = await Promise.race([
            analysisPromise,
            timeoutPromise,
          ]);

          return { success: true, hologram, symbol };
        } catch (error) {
          const errorMsg = `${symbol}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          errors.push(errorMsg);
          return { success: false, error: errorMsg, symbol };
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Collect successful results
      for (const result of batchResults) {
        if (result.success && "hologram" in result && result.hologram) {
          results.push(result.hologram);
        }
      }

      // Add small delay between batches to be respectful to API
      if (i + this.MAX_PARALLEL_REQUESTS < symbols.length) {
        await this.sleep(100); // 100ms delay between batches
      }
    }

    // Log errors if any
    if (errors.length > 0) {
      console.warn(`⚠️ ${errors.length} symbols failed analysis:`);
      errors.slice(0, 5).forEach((error) => console.warn(`  - ${error}`));
      if (errors.length > 5) {
        console.warn(`  ... and ${errors.length - 5} more`);
      }
    }

    return results;
  }

  /**
   * Update scan statistics
   * Tracks performance metrics for monitoring
   *
   * @param duration - Scan duration in milliseconds
   * @param successCount - Number of successful analyses
   * @param totalCount - Total number of symbols attempted
   */
  private updateScanStats(
    duration: number,
    successCount: number,
    totalCount: number,
  ): void {
    this.scanStats.totalScans++;
    this.scanStats.lastScanDuration = duration;

    // Update average duration (rolling average)
    this.scanStats.averageDuration =
      (this.scanStats.averageDuration * (this.scanStats.totalScans - 1) +
        duration) /
      this.scanStats.totalScans;

    // Update success rate (simple calculation based on current scan)
    if (totalCount > 0) {
      this.scanStats.successRate = successCount / totalCount;
    }
  }

  /**
   * Get current scan statistics
   * @returns Current scan performance statistics
   */
  public getScanStats(): ScanStats {
    return { ...this.scanStats };
  }

  /**
   * Check if scanner is currently running
   * @returns true if scan is in progress
   */
  public getIsScanning(): boolean {
    return this.isScanning;
  }

  /**
   * Reset scan statistics
   * Useful for testing or performance monitoring reset
   */
  public resetStats(): void {
    this.scanStats = {
      totalScans: 0,
      averageDuration: 0,
      lastScanDuration: 0,
      successRate: 0,
      slowScans: 0,
    };
  }

  /**
   * Get hologram summary for a symbol
   * Convenience method for logging and debugging
   *
   * @param symbol - Symbol to analyze
   * @returns Promise with hologram summary string
   */
  public async getSymbolSummary(symbol: string): Promise<string> {
    try {
      const hologram = await this.hologramEngine.analyze(symbol);
      return HologramEngine.getHologramSummary(hologram);
    } catch (error) {
      return `❌ ${symbol}: Analysis failed - ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  }

  /**
   * Sleep for specified milliseconds
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   * Should be called when scanner is no longer needed
   */
  public cleanup(): void {
    this.removeAllListeners();
    this.hologramEngine.clearCache();
  }
}
