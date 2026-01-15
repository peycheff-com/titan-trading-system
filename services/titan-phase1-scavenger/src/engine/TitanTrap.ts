/**
 * TitanTrap Core Engine
 *
 * The Predestination Engine that pre-calculates structural breakout levels,
 * monitors Binance Spot for validation signals, and executes on Bybit Perps.
 *
 * Three-Layer Architecture:
 * 1. Pre-Computation Layer (The Web): Calculates tripwires every 1 minute
 * 2. Detection Layer (The Spider): Monitors Binance WebSocket for tripwire hits
 * 3. Execution Layer (The Bite): Fires orders on Bybit when traps spring
 */

import { EventEmitter } from "../events/EventEmitter.js";
import { FastPathClient, IntentSignal } from "../ipc/FastPathClient.js";
import { VolatilityScaler } from "../calculators/VolatilityScaler.js";
import { CVDCalculator } from "../calculators/CVDCalculator.js";
import { PredictionMarketDetector } from "../detectors/PredictionMarketDetector.js";
import { PolymarketClient } from "../exchanges/PolymarketClient.js";
import { TripwireCalculators } from "../calculators/TripwireCalculators.js";
import { PositionSizeCalculator } from "../calculators/PositionSizeCalculator.js";
import {
  OHLCV,
  OrderParams,
  Trade,
  TrapType,
  Tripwire,
} from "../types/index.js";

interface VolumeCounter {
  count: number;
  buyVolume: number;
  sellVolume: number;
  startTime: number;
}

/**
 * TitanTrap Engine
 *
 * Manages the complete trap lifecycle from calculation to execution.
 */
export class TitanTrap {
  // Trap storage
  private trapMap: Map<string, Tripwire[]> = new Map();
  private volumeCounters: Map<string, VolumeCounter> = new Map();

  // Cached equity (updated every 5 seconds in background)
  private cachedEquity: number = 0;
  private equityUpdateInterval?: NodeJS.Timeout;

  // Pre-computation interval
  private preComputationInterval?: NodeJS.Timeout;

  // Memory monitoring interval
  private memoryMonitorInterval?: NodeJS.Timeout;

  // Client references (injected via constructor)
  private binanceClient: any; // TODO: Type as BinanceSpotClient
  private bybitClient: any; // TODO: Type as BybitPerpsClient
  private fastPathClient: FastPathClient; // Fast Path IPC client for execution
  private logger: any; // TODO: Type as Logger
  private config: any; // TODO: Type as ConfigManager
  private eventEmitter: EventEmitter;

  // Calculators and detectors (injected via constructor)
  private tripwireCalculators: any; // TODO: Type as TripwireCalculators
  private velocityCalculator: any; // TODO: Type as VelocityCalculator
  private positionSizeCalculator: any; // TODO: Type as PositionSizeCalculator
  private oiDetector?: any; // TODO: Type as OIWipeoutDetector
  private fundingDetector?: any; // TODO: Type as FundingSqueezeDetector
  private basisDetector?: any; // TODO: Type as BasisArbDetector
  private ultimateProtocol?: any; // TODO: Type as UltimateBulgariaProtocol
  private volatilityScaler: VolatilityScaler;
  private cvdCalculator: CVDCalculator;
  private predictionDetector: PredictionMarketDetector;

  constructor(dependencies: {
    binanceClient: any;
    bybitClient: any | null; // Can be null when using titan-execution service
    logger: any;
    config: any;
    eventEmitter: EventEmitter;
    tripwireCalculators: any;
    velocityCalculator: any;
    positionSizeCalculator: any;
    oiDetector?: any;
    fundingDetector?: any;
    basisDetector?: any;
    ultimateProtocol?: any;
  }) {
    this.binanceClient = dependencies.binanceClient;
    this.bybitClient = dependencies.bybitClient;
    this.logger = dependencies.logger;
    this.config = dependencies.config;
    this.eventEmitter = dependencies.eventEmitter;
    this.tripwireCalculators = dependencies.tripwireCalculators;
    this.velocityCalculator = dependencies.velocityCalculator;
    this.positionSizeCalculator = dependencies.positionSizeCalculator;
    this.oiDetector = dependencies.oiDetector;
    this.fundingDetector = dependencies.fundingDetector;
    this.basisDetector = dependencies.basisDetector;
    this.ultimateProtocol = dependencies.ultimateProtocol;

    // Initialize Volatility Scaler
    this.volatilityScaler = new VolatilityScaler();

    // Initialize CVD Calculator for smart filtering
    this.cvdCalculator = new CVDCalculator();

    // Initialize Prediction Market Detector (2026)
    const polymarket = new PolymarketClient();
    this.predictionDetector = new PredictionMarketDetector(
      polymarket,
      this.binanceClient,
    );

    // Initialize Fast Path IPC client with proper configuration
    this.fastPathClient = new FastPathClient({
      socketPath: process.env.TITAN_IPC_SOCKET || "/tmp/titan-ipc.sock",
      hmacSecret: process.env.TITAN_HMAC_SECRET || "default-secret",
      maxReconnectAttempts: 10,
      baseReconnectDelay: 1000,
      maxReconnectDelay: 30000,
      connectionTimeout: 5000,
      messageTimeout: 1000,
      enableMetrics: true,
    });

    // Setup Fast Path IPC event listeners for enhanced error handling
    this.setupFastPathEventListeners();
  }

  /**
   * Setup Fast Path IPC event listeners for enhanced error handling and monitoring
   * Requirements: 2.5, 5.1 (IPC communication failures, automatic reconnection)
   */
  private setupFastPathEventListeners(): void {
    // Connection events
    this.fastPathClient.on("connected", () => {
      console.log("✅ Fast Path IPC connected");
      this.eventEmitter.emit("IPC_CONNECTED", {
        timestamp: Date.now(),
        socketPath: this.fastPathClient.getStatus().socketPath,
      });
    });

    this.fastPathClient.on("disconnected", () => {
      console.log("🔌 Fast Path IPC disconnected");
      this.eventEmitter.emit("IPC_DISCONNECTED", {
        timestamp: Date.now(),
      });
    });

    this.fastPathClient.on("reconnecting", (attempt: number) => {
      console.log(`🔄 Fast Path IPC reconnecting (attempt ${attempt})`);
      this.eventEmitter.emit("IPC_RECONNECTING", {
        attempt,
        timestamp: Date.now(),
      });
    });

    this.fastPathClient.on("error", (error: Error) => {
      console.error(`❌ Fast Path IPC error: ${error.message}`);
      this.eventEmitter.emit("IPC_ERROR", {
        error: error.message,
        timestamp: Date.now(),
      });
    });

    this.fastPathClient.on("maxReconnectAttemptsReached", () => {
      console.error("❌ Fast Path IPC max reconnection attempts reached");
      this.eventEmitter.emit("IPC_MAX_RECONNECT_ATTEMPTS", {
        timestamp: Date.now(),
      });
    });

    // Message events for monitoring
    this.fastPathClient.on("message", (message: any) => {
      // Handle unsolicited messages from execution service
      if (message.type === "status_update") {
        console.log("📊 Execution service status update:", message);
      } else if (message.type === "CONFIG_UPDATE") {
        console.log("🔄 IPC Config Update Received:", message.config);

        // Dynamic configuration update
        if (
          this.config && typeof this.config.updatePhaseConfig === "function"
        ) {
          try {
            this.config.updatePhaseConfig(message.config);
            console.log("✅ Config successfully updated via IPC");

            // Emit event for monitoring
            this.eventEmitter.emit("CONFIG_UPDATED_IPC", {
              timestamp: Date.now(),
              config: message.config,
            });
          } catch (err) {
            console.error("❌ Failed to apply IPC config update:", err);
          }
        } else {
          console.warn(
            "⚠️ ConfigManager not available or invalid for IPC update",
          );
        }
      }
    });
  }

  /**
   * Start the TitanTrap engine
   * - Starts background equity cache loop (every 5 seconds)
   * - Starts pre-computation layer (every 1 minute)
   */
  async start(): Promise<void> {
    console.log("🕸️ Starting TitanTrap Engine...");

    // Connect to Fast Path IPC with enhanced error handling
    try {
      console.log("🔌 Connecting to Fast Path IPC...");
      await this.fastPathClient.connect();
      console.log("✅ Connected to Execution Service via Fast Path IPC");

      // Test connection with ping
      const pingResult = await this.fastPathClient.ping();
      if (pingResult.success) {
        console.log(
          `🏓 Fast Path IPC ping successful: ${pingResult.latency}ms`,
        );
      } else {
        console.warn(`⚠️ Fast Path IPC ping failed: ${pingResult.error}`);
      }
    } catch (error) {
      console.warn(
        "⚠️ Failed to connect to Fast Path IPC, will fall back to HTTP POST:",
        error instanceof Error ? error.message : "Unknown error",
      );

      // Emit warning event
      this.eventEmitter.emit("IPC_CONNECTION_FAILED", {
        error: error instanceof Error ? error.message : "Unknown error",
        fallback: "HTTP",
        timestamp: Date.now(),
      });
    }

    // CRITICAL: Initialize equity BEFORE any traps can fire
    // This prevents position sizing with $0 equity on first trap activation
    console.log("💰 Initializing equity cache...");
    await this.updateCachedEquity();

    // Start background equity cache loop
    this.startEquityCacheLoop();

    // Start memory monitoring (Requirement 1.7)
    this.startMemoryMonitoring();

    // Run initial pre-computation
    await this.updateTrapMap();

    // Start pre-computation interval (every 1 minute)
    const updateInterval = this.config.getConfig().updateInterval || 60000;
    this.preComputationInterval = setInterval(async () => {
      await this.updateTrapMap();
    }, updateInterval);

    console.log("✅ TitanTrap Engine started");
  }

  /**
   * Stop the TitanTrap engine
   */
  async stop(): Promise<void> {
    console.log("🛑 Stopping TitanTrap Engine...");

    if (this.equityUpdateInterval) {
      clearInterval(this.equityUpdateInterval);
    }

    if (this.preComputationInterval) {
      clearInterval(this.preComputationInterval);
    }

    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }

    // Disconnect Fast Path IPC gracefully
    try {
      await this.fastPathClient.disconnect();
      console.log("✅ Disconnected from Fast Path IPC");
    } catch (error) {
      console.warn(
        "⚠️ Error disconnecting from Fast Path IPC:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    console.log("✅ TitanTrap Engine stopped");
  }

  /**
   * Background loop: Update equity every 5 seconds
   *
   * CRITICAL: This prevents fire() from hanging on slow API calls.
   * We cache equity and read it instantly during execution.
   */
  private startEquityCacheLoop(): void {
    // Initial equity fetch
    this.updateCachedEquity();

    // Update every 5 seconds
    this.equityUpdateInterval = setInterval(async () => {
      await this.updateCachedEquity();
    }, 5000);
  }

  private async updateCachedEquity(): Promise<void> {
    try {
      this.cachedEquity = await this.bybitClient.getEquity();
      console.log(`💰 Equity updated: $${this.cachedEquity.toFixed(2)}`);
    } catch (error) {
      console.error("⚠️ Failed to update equity:", error);
    }
  }

  /**
   * PRE-COMPUTATION LAYER (The Web)
   *
   * Runs every 1 minute to calculate tripwires for top 20 volatile symbols.
   *
   * Steps:
   * 1. Fetch top 500 symbols by volume from Bybit
   * 2. Calculate tripwires for each symbol
   * 3. Score trap quality (volatility + volume + confluence)
   * 4. Select top 20 symbols
   * 5. Update Trap Map
   * 6. Subscribe Binance Spot WebSocket to top 20
   */
  async updateTrapMap(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log("🔄 Pre-Computation Layer: Calculating tripwires...");

      // 1. Fetch top 500 symbols by volume from Bybit
      const symbols = await this.bybitClient.fetchTopSymbols(500);
      console.log(`   Fetched ${symbols.length} symbols`);

      // 2. Calculate tripwires for each symbol
      const scoredSymbols = await Promise.all(
        symbols.map(async (symbol: string) => {
          try {
            // Fetch OHLCV data
            const ohlcv = await this.bybitClient.fetchOHLCV(symbol, "1h", 100);

            // Calculate tripwires using calculators
            const traps: Tripwire[] = [];

            // Basic tripwires
            const liquidationTrap = TripwireCalculators
              .calcLiquidationCluster(ohlcv, symbol);
            const dailyLevelTrap = TripwireCalculators.calcDailyLevel(
              ohlcv,
              symbol,
            );
            const bollingerTrap = TripwireCalculators
              .calcBollingerBreakout(ohlcv, symbol);

            if (liquidationTrap) traps.push(liquidationTrap);
            if (dailyLevelTrap) traps.push(dailyLevelTrap);
            if (bollingerTrap) traps.push(bollingerTrap);

            // Structural flaw detectors (if available)
            if (this.oiDetector) {
              const oiWipeout = await this.oiDetector.detectWipeout(symbol);
              if (oiWipeout) traps.push(oiWipeout);
            }

            if (this.fundingDetector) {
              const fundingSqueeze = await this.fundingDetector.detectSqueeze(
                symbol,
              );
              if (fundingSqueeze) traps.push(fundingSqueeze);
            }

            if (this.basisDetector) {
              const basisArb = await this.basisDetector.detectBasisArb(symbol);
              if (basisArb) traps.push(basisArb);
            }

            // --- ADAPTIVE VOLATILITY LOGIC ---
            const volMetrics = this.volatilityScaler.calculateMetrics(ohlcv);

            // --- ALPHA LOGIC: TREND AGGREGATION ---
            const adx = TripwireCalculators.calcADX(ohlcv);

            // Determine trend direction (Price vs SMA20)
            const lastClose = ohlcv[ohlcv.length - 1].close;
            const sma20 = TripwireCalculators.calcSMA(
              new Float64Array(ohlcv.map((b) => b.close)),
              20,
            );
            const trend = lastClose > sma20 ? "UP" : "DOWN";

            // Attach metrics to all traps for this symbol
            for (const trap of traps) {
              trap.volatilityMetrics = {
                atr: volMetrics.atr,
                regime: volMetrics.regime,
                stopLossMultiplier: volMetrics.stopLossMultiplier,
                positionSizeMultiplier: volMetrics.positionSizeMultiplier,
              };

              // Alpha Tags
              trap.adx = adx;
              trap.trend = trend;
            }

            // Calculate trap quality score
            const trapQuality = this.calculateTrapQuality(ohlcv, traps);

            return {
              symbol,
              trapQuality,
              traps,
            };
          } catch (error) {
            console.error(
              `   ⚠️ Failed to calculate traps for ${symbol}:`,
              error,
            );
            return {
              symbol,
              trapQuality: 0,
              traps: [],
            };
          }
        }),
      );

      // 3. Select top 20 symbols with highest trap quality
      const topSymbolsCount = this.config.getConfig().topSymbolsCount || 20;
      const top20 = scoredSymbols
        .filter((s) => s.trapQuality > 0)
        .sort((a, b) => b.trapQuality - a.trapQuality)
        .slice(0, topSymbolsCount);

      // 4. Update trap map
      this.trapMap.clear();
      for (const { symbol, traps } of top20) {
        this.trapMap.set(symbol, traps);
      }

      // 5. Subscribe to Binance Spot for these symbols
      const symbolList = top20.map((s) => s.symbol);
      await this.binanceClient.subscribeAggTrades(symbolList);

      const duration = Date.now() - startTime;

      // Warn if pre-computation exceeded 60 seconds
      if (duration > 60000) {
        console.warn(
          `⚠️ COMPUTATION_SLOW: Pre-computation exceeded 60s: ${duration}ms`,
        );
      }

      console.log(
        `✅ Trap Map updated: ${top20.length} symbols, ${duration}ms`,
      );

      // Log trap summary
      this.logTrapSummary();

      // Emit TRAP_MAP_UPDATED event (Requirement 7.5)
      this.eventEmitter.emit("TRAP_MAP_UPDATED", {
        symbolCount: top20.length,
        duration,
        symbols: symbolList,
      });
    } catch (error) {
      console.error("❌ Pre-Computation Layer failed:", error);

      // Emit ERROR event
      this.eventEmitter.emit("ERROR", {
        message: "Pre-Computation Layer failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Calculate trap quality score
   *
   * Score = (volatility * 0.4) + (volume * 0.3) + (confluence * 0.3)
   */
  private calculateTrapQuality(ohlcv: OHLCV[], traps: Tripwire[]): number {
    if (traps.length === 0) return 0;

    // Volatility score (0-100)
    const volatility = this.calcVolatility(ohlcv);

    // Volume score (0-100)
    const volume = ohlcv[ohlcv.length - 1].volume;
    const volumeScore = Math.min(volume / 10000000, 1) * 100; // Normalize to $10M

    // Confluence score (0-100)
    const confluence = this.calcConfluence(traps);

    // Weighted score
    const trapQuality = (volatility * 0.4) + (volumeScore * 0.3) +
      (confluence * 0.3);

    return trapQuality;
  }

  private calcVolatility(ohlcv: OHLCV[]): number {
    // Calculate ATR as volatility measure
    const atrPeriod = 14;
    const recentBars = ohlcv.slice(-atrPeriod);

    let atrSum = 0;
    for (let i = 1; i < recentBars.length; i++) {
      const high = recentBars[i].high;
      const low = recentBars[i].low;
      const prevClose = recentBars[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      );

      atrSum += tr;
    }

    const atr = atrSum / (recentBars.length - 1);
    const currentPrice = ohlcv[ohlcv.length - 1].close;
    const atrPercent = (atr / currentPrice) * 100;

    // Normalize to 0-100 (assume 5% ATR is max)
    return Math.min(atrPercent / 5, 1) * 100;
  }

  private calcConfluence(traps: Tripwire[]): number {
    // More traps = higher confluence
    // Max score at 3+ traps
    return Math.min(traps.length / 3, 1) * 100;
  }

  private logTrapSummary(): void {
    console.log("\n📊 Active Traps Summary:");
    for (const [symbol, traps] of this.trapMap.entries()) {
      console.log(`   ${symbol}: ${traps.length} traps`);
      for (const trap of traps) {
        console.log(
          `      - ${trap.trapType} @ ${
            trap.triggerPrice.toFixed(2)
          } (${trap.direction}, ${trap.confidence}% conf)`,
        );
      }
    }
    console.log("");
  }

  /**
   * DETECTION LAYER (The Spider)
   *
   * Real-time WebSocket handler for Binance Spot ticks.
   *
   * Steps:
   * 1. Check if price matches any tripwire (±0.1%)
   * 2. Start volume accumulation counter
   * 3. Count trades in 100ms window
   * 4. If trades >= 50, activate trap and trigger execution
   */
  onBinanceTick(symbol: string, price: number, trades: Trade[]): void {
    const traps = this.trapMap.get(symbol);
    if (!traps) return;

    // Record price with exchange timestamp (not Date.now())
    const exchangeTime = trades[0].time;
    this.velocityCalculator.recordPrice(symbol, price, exchangeTime);

    // Feed trades to CVD Calculator
    for (const trade of trades) {
      this.cvdCalculator.recordTrade(trade);
    }

    for (const trap of traps) {
      // Skip if already activated
      if (trap.activated) continue;

      // Check cooldown (5-minute minimum between activations)
      const timeSinceActivation = Date.now() - (trap.activatedAt || 0);
      if (trap.activatedAt && timeSinceActivation < 300000) {
        continue; // Still in cooldown
      }

      // Check if price is within 0.1% of trigger
      const priceDistance = Math.abs(price - trap.triggerPrice) /
        trap.triggerPrice;
      if (priceDistance > 0.001) continue; // Not close enough

      // Start volume accumulation
      if (!this.volumeCounters.has(symbol)) {
        this.volumeCounters.set(symbol, {
          count: 0,
          buyVolume: 0,
          sellVolume: 0,
          startTime: Date.now(),
        });
      }

      const counter = this.volumeCounters.get(symbol)!;
      counter.count += trades.length;

      // Accumulate Micro-CVD
      for (const trade of trades) {
        // isBuyerMaker = false -> Buyer is Taker -> BUY
        // isBuyerMaker = true  -> Seller is Taker -> SELL
        if (!trade.isBuyerMaker) {
          counter.buyVolume += trade.qty;
        } else {
          counter.sellVolume += trade.qty;
        }
      }

      // Check if 100ms window has elapsed
      const elapsed = Date.now() - counter.startTime;
      if (elapsed >= 100) {
        // Validate: Require minimum trades in 100ms
        const minTrades = this.config.getConfig().minTradesIn100ms || 50;

        if (counter.count >= minTrades) {
          const microCVD = counter.buyVolume - counter.sellVolume;

          console.log(
            `⚡ TRAP SPRUNG: ${symbol} at ${
              price.toFixed(2)
            } (${counter.count} trades, CVD: ${microCVD.toFixed(4)})`,
          );

          // Emit TRAP_SPRUNG event
          this.eventEmitter.emit("TRAP_SPRUNG", {
            symbol,
            price,
            trapType: trap.trapType,
            direction: trap.direction,
            confidence: trap.confidence,
            tradeCount: counter.count,
            microCVD, // Add to event
            elapsed,
          });

          this.fire(trap, microCVD);
        }

        // Reset counter
        this.volumeCounters.delete(symbol);
      }
    }
  }

  /**
   * EXECUTION LAYER (The Bite)
   *
   * Sends PREPARE/CONFIRM/ABORT signals to Execution Service via Fast Path IPC.
   *
   * Steps:
   * 1. Validate Micro-CVD
   * 2. Calculate price velocity
   * 3. Send PREPARE via Fast Path IPC
   */
  async fire(trap: Tripwire, microCVD?: number): Promise<void> {
    let signalId: string | undefined;

    try {
      // IDEMPOTENCY CHECK: Prevent duplicate activation (Requirement 7.6)
      if (trap.activated) {
        console.warn(`⚠️ Trap already activated: ${trap.symbol}`);
        return;
      }

      // COOLDOWN CHECK: Prevent reactivation within 5 minutes (Requirement 7.6)
      const timeSinceActivation = Date.now() - (trap.activatedAt || 0);
      if (trap.activatedAt && timeSinceActivation < 300000) {
        console.warn(
          `⚠️ Trap cooldown: ${trap.symbol} (${
            Math.floor(timeSinceActivation / 1000)
          }s ago)`,
        );
        return;
      }

      // --- MICRO-CVD VALIDATION (2026 Optimization) ---
      // Detection Layer passes microCVD from the breakout burst.
      // We must check if the flow supports the breakout.
      if (microCVD !== undefined) {
        const isCVDAligned = (trap.direction === "LONG" && microCVD > 0) ||
          (trap.direction === "SHORT" && microCVD < 0);

        if (!isCVDAligned) {
          // STRICT VETO: If burst volume opposes direction, it's likely a fakeout/absorption.
          console.warn(
            `🛑 MICRO-CVD VETO: Volume flow opposes trap. Direction: ${trap.direction}, CVD: ${
              microCVD.toFixed(4)
            }`,
          );
          return;
        }
        console.log(
          `✅ MICRO-CVD CONFIRMED: ${
            microCVD.toFixed(4)
          } aligns with ${trap.direction}`,
        );
      }

      // Mark trap as activated
      trap.activated = true;
      trap.activatedAt = Date.now();

      console.log(`🔥 FIRING TRAP: ${trap.symbol} ${trap.trapType}`);

      // --- CVD FILTER CHECK (Macro) ---
      const cvd = await this.cvdCalculator.calcCVD(trap.symbol, 60); // 1-minute CVD
      const isCounterFlow = (trap.direction === "LONG" && cvd < 0) ||
        (trap.direction === "SHORT" && cvd > 0);

      // Note: We previously preferred counter-flow for mean reversion, but for momentum ignition (2026),
      // alignment is often safer unless specifically catching a wick (Ultimate Bulgaria).
      // Keeping original logic as warning/info for now.
      if (!isCounterFlow) {
        console.warn(
          `⚠️ MACRO CVD INFO: Trend following detected (CVD: ${cvd}).`,
        );
      } else {
        console.log(`✅ MACRO CVD INFO: Counter-flow detected (CVD: ${cvd})`);
      }

      // --- ALPHA LOGIC: KNIFE-CATCH PROTECTION (Acceleration) ---
      const acceleration = this.velocityCalculator.getAcceleration(trap.symbol);
      if (acceleration > 0) {
        console.warn(
          `🛑 KNIFE-CATCH VETO: Price is accelerating (${
            acceleration.toFixed(4)
          }). Waiting for deceleration.`,
        );
        return; // VETO EXECUTION
      }
      console.log(
        `✅ ACCELERATION CHECK: Safe (Acc: ${acceleration.toFixed(4)})`,
      );

      // --- ALPHA LOGIC: TREND FILTER (ADX) ---
      if (trap.adx && trap.adx > 25) {
        const isFadingTrend =
          (trap.direction === "LONG" && trap.trend === "DOWN") ||
          (trap.direction === "SHORT" && trap.trend === "UP");

        if (isFadingTrend) {
          console.warn(
            `🛑 TREND VETO: Strong Trend (ADX: ${
              trap.adx.toFixed(2)
            }) is against us. Aborting fade.`,
          );
          return; // VETO EXECUTION
        }
      }

      // Calculate price velocity
      const bybitPrice = this.bybitClient
        ? await this.bybitClient.getCurrentPrice(trap.symbol)
        : trap.triggerPrice;
      const velocity = this.velocityCalculator.calcVelocity(trap.symbol);

      // --- DYNAMIC VELOCITY THRESHOLDS (2026 Optimization) ---
      // Use ATR-based metrics if available to scale velocity thresholds
      // Base thresholds
      const config = this.config.getConfig();
      let extremeVelocity = config.extremeVelocityThreshold || 0.005;
      let moderateVelocity = config.moderateVelocityThreshold || 0.001;

      if (trap.volatilityMetrics?.atr) {
        // Example dynamic logic:
        // If ATR is high, expect higher velocity for the same "panic" level.
        // Scale threshold by relative volatility (ATR % / 5% baseline)
        // Note: normalized ATR was %/5.
        // Let's use positionSizeMultiplier inverse? Or just scale raw?
        // Let's stick to a simpler heuristic: If regime is 'HIGH_VOL', double thresholds.
        if (trap.volatilityMetrics.regime === "HIGH_VOL") {
          extremeVelocity *= 1.5;
          moderateVelocity *= 1.5;
          console.log(
            `   🌊 High Volatility Regime: Scaling velocity thresholds x1.5`,
          );
        } else if (trap.volatilityMetrics.regime === "LOW_VOL") {
          extremeVelocity *= 0.8;
          moderateVelocity *= 0.8;
          console.log(
            `   🧊 Low Volatility Regime: Scaling velocity thresholds x0.8`,
          );
        }
      }

      // Determine order type based on velocity
      let orderType: "MARKET" | "LIMIT";
      let limitPrice: number | undefined;

      const aggressiveMarkup = config.aggressiveLimitMarkup || 0.002;

      if (velocity > extremeVelocity) {
        // Extreme Velocity -> Market Order
        orderType = "MARKET";
        console.log(
          `   🚀 Using MARKET order (velocity: ${
            (velocity * 100).toFixed(2)
          }% > ${extremeVelocity * 100}%)`,
        );
      } else if (velocity > moderateVelocity) {
        // Moderate Velocity -> Aggressive Limit
        orderType = "LIMIT";
        limitPrice = trap.direction === "LONG"
          ? bybitPrice * (1 + aggressiveMarkup) // Ask + 0.2%
          : bybitPrice * (1 - aggressiveMarkup); // Bid - 0.2%
        console.log(
          `   ⚡ Using AGGRESSIVE LIMIT at ${
            limitPrice.toFixed(2)
          } (velocity: ${(velocity * 100).toFixed(2)}%)`,
        );
      } else {
        // Low Velocity -> Limit at best price
        orderType = "LIMIT";
        limitPrice = trap.direction === "LONG"
          ? bybitPrice * 1.0001 // Ask
          : bybitPrice * 0.9999; // Bid
        console.log(
          `   📍 Using LIMIT at ${limitPrice.toFixed(2)} (velocity: ${
            (velocity * 100).toFixed(2)
          }%)`,
        );
      }

      // Calculate position size using cached equity
      const positionSize = PositionSizeCalculator.calcPositionSize({
        equity: this.cachedEquity,
        confidence: trap.confidence,
        leverage: trap.leverage,
        stopLossPercent: config.stopLossPercent || 0.01,
        targetPercent: config.targetPercent || 0.03,
        maxPositionSizePercent: config.maxPositionSizePercent || 0.5,
      });

      console.log(
        `   💰 Position size: ${positionSize.toFixed(4)} (Equity: $${
          this.cachedEquity.toFixed(2)
        })`,
      );

      // --- ADAPTIVE VOLATILITY SIZING ---
      // Apply volatility multiplier to position size if available
      const volMultiplier = trap.volatilityMetrics?.positionSizeMultiplier || 1;
      const adjustedPositionSize = positionSize * volMultiplier;

      if (volMultiplier !== 1) {
        console.log(
          `   📉 Volatility Adjustment: Size scaled by ${
            volMultiplier.toFixed(2)
          }x -> ${adjustedPositionSize.toFixed(4)}`,
        );
      }

      // Calculate stop loss and target
      const stopLossPercent = config.stopLossPercent || 0.01;
      const targetPercent = config.targetPercent || 0.03;

      const stopLoss = trap.stopLoss ||
        (trap.direction === "LONG"
          ? bybitPrice * (1 - stopLossPercent) // -1%
          : bybitPrice * (1 + stopLossPercent)); // +1%

      const target = trap.targetPrice ||
        (trap.direction === "LONG"
          ? bybitPrice * (1 + targetPercent) // +3%
          : bybitPrice * (1 - targetPercent)); // -3%

      // Create Intent Signal
      const intentSignal: IntentSignal = {
        signal_id: `scavenger-${trap.symbol}-${Date.now()}`,
        source: "scavenger",
        symbol: trap.symbol,
        direction: trap.direction,
        entry_zone: {
          min: limitPrice ? limitPrice * 0.999 : bybitPrice * 0.999,
          max: limitPrice ? limitPrice * 1.001 : bybitPrice * 1.001,
        },
        stop_loss: stopLoss,
        take_profits: [target],
        confidence: trap.confidence,
        leverage: trap.leverage,
        velocity,
        trap_type: trap.trapType,
        timestamp: Date.now(),
      };

      // --- GHOST MODE CHECK ---
      const ghostMode = config.ghostMode;
      if (ghostMode) {
        console.log(
          `👻 GHOST MODE ACTIVE: Skipping IPC execution for ${trap.symbol}`,
        );
        console.log(
          `👻 Virtual Trade: ${trap.direction} ${trap.symbol} @ ${
            limitPrice || bybitPrice
          } (Size: ${positionSize})`,
        );

        // Mark as "activated" logic remains to prevent re-firing
        // We simply return early to simulate execution without risk
        return;
      }

      // STEP 1: Send PREPARE via Fast Path IPC
      signalId = intentSignal.signal_id;
      const ipcStartTime = Date.now();
      console.log(
        `   📤 Sending PREPARE signal via Fast Path IPC (signal_id=${signalId})...`,
      );

      try {
        // Check if IPC is connected before attempting to send
        if (!this.fastPathClient.isConnected()) {
          throw new Error("IPC_NOT_CONNECTED");
        }

        const prepareResult = await this.fastPathClient.sendPrepare(
          intentSignal,
        );

        if (prepareResult.rejected) {
          throw new Error(`PREPARE_REJECTED: ${prepareResult.reason}`);
        }

        const prepareLatency = Date.now() - ipcStartTime;
        console.log(
          `   ✅ PREPARE acknowledged: prepared=${prepareResult.prepared} (${prepareLatency}ms)`,
        );

        // STEP 2: Wait 100ms for trap confirmation
        await this.sleep(100);

        // STEP 3: Check if trap is still valid
        if (this.isTrapStillValid(trap)) {
          // Send CONFIRM
          console.log(`   ✅ Trap still valid, sending CONFIRM...`);

          const confirmStartTime = Date.now();
          const confirmResult = await this.fastPathClient.sendConfirm(signalId);

          if (confirmResult.rejected) {
            throw new Error(`CONFIRM_REJECTED: ${confirmResult.reason}`);
          }

          const confirmLatency = Date.now() - confirmStartTime;
          const totalLatency = Date.now() - ipcStartTime;

          console.log(
            `   ✅ CONFIRM acknowledged: executed=${confirmResult.executed}, fill_price=${confirmResult.fill_price} (${confirmLatency}ms, total: ${totalLatency}ms)`,
          );

          // Log execution with IPC metrics
          this.logger.log({
            timestamp: Date.now(),
            signal_id: signalId,
            symbol: trap.symbol,
            trapType: trap.trapType,
            direction: trap.direction,
            entry: confirmResult.fill_price || bybitPrice,
            stop: stopLoss,
            target: target,
            confidence: trap.confidence,
            leverage: trap.leverage,
            orderType,
            velocity,
            positionSize: adjustedPositionSize,
            ipc_prepare_latency_ms: prepareLatency,
            ipc_confirm_latency_ms: confirmLatency,
            ipc_total_latency_ms: totalLatency,
          });

          console.log(`✅ Trap execution complete: ${trap.symbol}`);

          // Emit EXECUTION_COMPLETE event
          this.eventEmitter.emit("EXECUTION_COMPLETE", {
            signal_id: signalId,
            symbol: trap.symbol,
            trapType: trap.trapType,
            direction: trap.direction,
            fillPrice: confirmResult.fill_price || bybitPrice,
            positionSize: adjustedPositionSize,
            leverage: trap.leverage,
            stopLoss,
            target,
            orderType,
            ipcLatency: totalLatency,
          });
        } else {
          // Send ABORT
          console.log(`   ⚠️ Trap invalidated, sending ABORT...`);

          const abortResult = await this.fastPathClient.sendAbort(signalId);

          console.log(
            `   ✅ ABORT acknowledged: aborted=${abortResult.aborted}`,
          );

          // Reset trap activation
          trap.activated = false;
          trap.activatedAt = undefined;

          // Emit TRAP_ABORTED event
          this.eventEmitter.emit("TRAP_ABORTED", {
            signal_id: signalId,
            symbol: trap.symbol,
            trapType: trap.trapType,
            reason: "trap_invalidated",
            timestamp: Date.now(),
          });
        }
      } catch (ipcError) {
        // Fast Path IPC failed, fall back to HTTP POST
        const errorMessage = ipcError instanceof Error
          ? ipcError.message
          : "Unknown IPC error";
        console.warn(
          `⚠️ Fast Path IPC failed (${errorMessage}), falling back to HTTP POST`,
        );

        // Emit IPC failure event
        this.eventEmitter.emit("IPC_EXECUTION_FAILED", {
          signal_id: signalId,
          symbol: trap.symbol,
          error: errorMessage,
          fallback: "HTTP",
          timestamp: Date.now(),
        });

        try {
          await this.fallbackToHTTP(intentSignal);

          console.log(`✅ HTTP POST fallback successful: ${trap.symbol}`);

          // Log execution (HTTP fallback)
          this.logger.log({
            timestamp: Date.now(),
            signal_id: signalId,
            symbol: trap.symbol,
            trapType: trap.trapType,
            direction: trap.direction,
            entry: bybitPrice,
            stop: stopLoss,
            target: target,
            confidence: trap.confidence,
            leverage: trap.leverage,
            orderType,
            velocity,
            positionSize,
            fallback: "HTTP",
            ipc_error: errorMessage,
          });

          // Emit EXECUTION_COMPLETE event
          this.eventEmitter.emit("EXECUTION_COMPLETE", {
            signal_id: signalId,
            symbol: trap.symbol,
            trapType: trap.trapType,
            direction: trap.direction,
            fillPrice: bybitPrice,
            positionSize,
            leverage: trap.leverage,
            stopLoss,
            target,
            orderType,
            fallback: "HTTP",
          });
        } catch (httpError) {
          // Both IPC and HTTP failed
          throw new Error(
            `Both IPC and HTTP execution failed. IPC: ${errorMessage}, HTTP: ${
              httpError instanceof Error ? httpError.message : "Unknown error"
            }`,
          );
        }
      }
    } catch (error) {
      console.error(`❌ Trap execution failed: ${trap.symbol}`, error);

      // If we have a signal_id, send ABORT
      if (signalId) {
        try {
          await this.fastPathClient.sendAbort(signalId);
          console.log(
            `   ✅ Sent ABORT for failed execution: signal_id=${signalId}`,
          );
        } catch (abortError) {
          console.error(`   ⚠️ Failed to send ABORT:`, abortError);
        }
      }

      // Emit ERROR event
      this.eventEmitter.emit("ERROR", {
        message: `Trap execution failed: ${trap.symbol}`,
        error: error instanceof Error ? error.message : String(error),
        symbol: trap.symbol,
        trapType: trap.trapType,
      });

      // Reset trap activation on failure
      trap.activated = false;
      trap.activatedAt = undefined;
    }
  }

  /**
   * Get current trap map (for dashboard display)
   */
  getTrapMap(): Map<string, Tripwire[]> {
    return this.trapMap;
  }

  /**
   * Memory monitoring loop: Check memory usage every 10 seconds
   *
   * Requirement 1.7: Emit RESOURCE_WARNING when memory exceeds 150MB
   */
  private startMemoryMonitoring(): void {
    this.memoryMonitorInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const rssMB = memUsage.rss / 1024 / 1024;

      // Log memory stats occasionally
      if (Math.random() < 0.1) {
        console.log(
          `📊 Memory: Heap ${heapUsedMB.toFixed(1)}MB / ${
            heapTotalMB.toFixed(1)
          }MB, RSS ${rssMB.toFixed(1)}MB`,
        );
      }

      // Emit warning if heap usage exceeds 150MB
      if (heapUsedMB > 150) {
        console.warn(
          `⚠️ RESOURCE_WARNING: Memory usage ${
            heapUsedMB.toFixed(2)
          }MB exceeds 150MB threshold`,
        );
        this.eventEmitter.emit("RESOURCE_WARNING", {
          memoryUsageMB: heapUsedMB,
          heapTotalMB,
          rssMB,
          threshold: 150,
          timestamp: Date.now(),
        });
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Get cached equity (for dashboard display)
   */
  getCachedEquity(): number {
    return this.cachedEquity;
  }

  /**
   * Get Fast Path IPC status and metrics
   * Requirements: 2.5, 5.1 (IPC monitoring and metrics)
   */
  getIPCStatus(): {
    connected: boolean;
    connectionState: string;
    metrics: any;
    status: any;
  } {
    return {
      connected: this.fastPathClient.isConnected(),
      connectionState: this.fastPathClient.getConnectionState(),
      metrics: this.fastPathClient.getMetrics(),
      status: this.fastPathClient.getStatus(),
    };
  }

  /**
   * Force IPC reconnection (for manual recovery)
   * Requirements: 2.5 (IPC connection management)
   */
  async forceIPCReconnect(): Promise<void> {
    try {
      console.log("🔄 Force reconnecting Fast Path IPC...");
      await this.fastPathClient.forceReconnect();
      console.log("✅ Fast Path IPC reconnection successful");

      this.eventEmitter.emit("IPC_FORCE_RECONNECT_SUCCESS", {
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("❌ Fast Path IPC force reconnection failed:", error);

      this.eventEmitter.emit("IPC_FORCE_RECONNECT_FAILED", {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Check if trap is still valid after 100ms delay
   *
   * Validates:
   * - Price is still within 0.1% of trigger price
   * - Volume counter still shows sufficient activity
   * - Trap hasn't been deactivated
   *
   * Requirements: 1.4
   */
  private isTrapStillValid(trap: Tripwire): boolean {
    try {
      // Check if trap is still activated
      if (!trap.activated) {
        console.log(`   ⚠️ Trap validation failed: trap deactivated`);
        return false;
      }

      // Get current price from velocity calculator (most recent tick)
      const currentPrice = this.velocityCalculator.getLastPrice(trap.symbol);

      if (!currentPrice) {
        console.log(`   ⚠️ Trap validation failed: no current price available`);
        return false;
      }

      // Check if price is still within 0.1% of trigger price
      const priceDistance = Math.abs(currentPrice - trap.triggerPrice) /
        trap.triggerPrice;
      const maxPriceDistance = 0.001; // 0.1%

      if (priceDistance > maxPriceDistance) {
        console.log(
          `   ⚠️ Trap validation failed: price moved ${
            (priceDistance * 100).toFixed(3)
          }% from trigger (max ${(maxPriceDistance * 100).toFixed(1)}%)`,
        );
        return false;
      }

      // Check if volume counter still exists (indicates recent activity)
      const volumeCounter = this.volumeCounters.get(trap.symbol);

      if (!volumeCounter) {
        console.log(`   ⚠️ Trap validation failed: no volume activity`);
        return false;
      }

      // Check if volume counter is recent (within last 200ms)
      const timeSinceVolumeStart = Date.now() - volumeCounter.startTime;

      if (timeSinceVolumeStart > 200) {
        console.log(
          `   ⚠️ Trap validation failed: volume activity stale (${timeSinceVolumeStart}ms old)`,
        );
        return false;
      }

      console.log(
        `   ✅ Trap validation passed: price=${
          currentPrice.toFixed(2)
        }, distance=${
          (priceDistance * 100).toFixed(3)
        }%, volume=${volumeCounter.count} trades`,
      );
      return true;
    } catch (error) {
      console.error(`   ❌ Trap validation error:`, error);
      return false;
    }
  }

  /**
   * Fall back to HTTP POST if Fast Path IPC fails
   */
  private async fallbackToHTTP(signal: IntentSignal): Promise<void> {
    try {
      const executionServiceUrl = process.env.TITAN_EXECUTION_URL ||
        "http://localhost:8080";

      const response = await fetch(`${executionServiceUrl}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Titan-Source": "scavenger",
        },
        body: JSON.stringify(signal),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ HTTP POST fallback successful: ${signal.symbol}`, result);
    } catch (error) {
      console.error(`❌ HTTP POST fallback failed: ${signal.symbol}`, error);
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
