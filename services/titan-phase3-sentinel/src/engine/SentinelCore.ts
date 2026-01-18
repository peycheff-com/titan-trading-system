import { EventEmitter } from "events";
import { ExchangeRouter } from "../router/ExchangeRouter.js";
import { PortfolioManager } from "../portfolio/PortfolioManager.js";
import { RiskManager } from "../risk/RiskManager.js";
import { VacuumMonitor } from "../vacuum/VacuumMonitor.js";
import { PerformanceTracker } from "../performance/PerformanceTracker.js";
import { SignalGenerator } from "./StatEngine.js";
import { PriceMonitor } from "../router/PriceMonitor.js";
import type { Signal } from "../types/signals.js";
import type { IExchangeGateway } from "../exchanges/interfaces.js";
import { DEFAULT_SIGNAL_THRESHOLDS } from "../types/signals.js";
import type {
  HealthReport,
  PerformanceMetrics,
  RiskStatus,
} from "../types/portfolio.js";

export interface SentinelConfig {
  updateIntervalMs: number;
  symbol: string;
  initialCapital: number;
  riskLimits: {
    maxDrawdown: number;
    maxLeverage: number;
    maxDelta: number;
  };
}

export interface SentinelState {
  health: HealthReport;
  metrics: PerformanceMetrics;
  signals: Signal[];
  prices: { spot: number; perp: number; basis: number };
}

export class SentinelCore extends EventEmitter {
  private isRunning: boolean = false;
  private tickInterval: NodeJS.Timeout | null = null;

  // Components
  public router: ExchangeRouter;
  public portfolio: PortfolioManager;
  public risk: RiskManager;
  public vacuum: VacuumMonitor;
  public performance: PerformanceTracker;
  public signals: SignalGenerator;
  public priceMonitor: PriceMonitor;

  // State from NATS
  private currentRegime: string = "STABLE";
  private currentAPTR: number = 0;

  constructor(
    private config: SentinelConfig,
    gateways: IExchangeGateway[],
  ) {
    super();

    // Initialize Components
    const gatewayMap: Record<string, IExchangeGateway> = {};
    gateways.forEach((g) => {
      gatewayMap[g.name] = g;
    });

    this.priceMonitor = new PriceMonitor(gatewayMap);
    this.router = new ExchangeRouter(gatewayMap, {
      binance: 0.001,
      bybit: 0.001,
    });

    this.portfolio = new PortfolioManager(gatewayMap);

    this.risk = new RiskManager({
      maxDelta: config.riskLimits.maxDelta,
      criticalDelta: config.riskLimits.maxDelta * 1.5,
      maxLeverage: config.riskLimits.maxLeverage,
      dailyDrawdownLimit: config.riskLimits.maxDrawdown * 0.5,
      criticalDrawdown: config.riskLimits.maxDrawdown,
      maxPositionSize: 50000,
      stopLossThreshold: 0.1,
    });

    this.signals = new SignalGenerator(DEFAULT_SIGNAL_THRESHOLDS);
    this.vacuum = new VacuumMonitor(this.signals); // Pass signalGenerator
    this.performance = new PerformanceTracker(config.initialCapital);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.emit("log", "Sentinel Core Starting...");

    // Initialize Portfolio
    await this.portfolio.initialize();

    // Start Loops
    this.tickInterval = setInterval(
      () => this.onTick(),
      this.config.updateIntervalMs,
    );
    this.emit("log", "Sentinel Core Started.");
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.emit("log", "Sentinel Core Stopped.");
  }

  public updateRegime(regime: string, aptr: number) {
    const oldRegime = this.currentRegime;
    this.currentRegime = regime;
    this.currentAPTR = aptr;

    if (oldRegime !== regime) {
      this.emit(
        "log",
        `⚠️ Regime Change: ${oldRegime} -> ${regime} (APTR: ${
          aptr.toFixed(4)
        })`,
      );
    }
  }

  private async onTick(): Promise<void> {
    try {
      // 1. Update Prices
      const allPrices = await this.priceMonitor.getAllPrices(
        this.config.symbol,
      );

      if (allPrices.length < 2) return;

      const spotQuote = allPrices.find((p) => p.exchange.includes("spot"));
      const perpQuote = allPrices.find((p) => p.exchange.includes("perp"));

      if (!spotQuote || !perpQuote) return;

      const spotPrice = spotQuote.price;
      const perpPrice = perpQuote.price;

      // 2. Risk Check (Pre-Trade)
      const health = this.portfolio.getHealthReport();

      // Risk evaluate signature: (health, totalEquity)
      // Health likely has NAV which is roughly equity
      const riskStatus = this.risk.evaluate(health, health.nav);

      if (!riskStatus.withinLimits) {
        this.emit(
          "log",
          `Risk Limit Violated: ${riskStatus.violations.join(", ")}`,
        );
        const isCritical = riskStatus.violations.some((v) =>
          v.includes("CRITICAL")
        );
        if (isCritical) return;
      }

      // 3. Liquidity Gate (Pre-Trade)
      // Block trading if spread is too wide (> 5bps / 0.05%)
      if (spotQuote.spread && spotQuote.spread > 0.0005) {
        // Optimization: Don't spam log
        if (Math.random() < 0.01) {
          this.emit(
            "log",
            `⚠️ Liquidity Gate: Spread too wide (${
              (spotQuote.spread * 100).toFixed(4)
            }%)`,
          );
        }
        return;
      }

      // Calculate Basis immediately for use in Logic
      const currentBasis = (perpPrice - spotPrice) / spotPrice;

      // 4. Unwind Logic (Post-Trade)
      // Aggressive Unwind in CRASH regime
      const isCrash = this.currentRegime === "CRASH";
      const spreadThreshold = isCrash ? 0.05 : 0.1; // 0.05% vs 0.1% spread tolerance
      const deviationThreshold = isCrash ? 0.01 : 0.02; // 1% vs 2% basis deviation

      const openPositions = this.performance.getOpenPositions();
      for (const position of openPositions) {
        // Check unwinds
        // 1. Spread Check
        if (spotQuote.spread && spotQuote.spread * 100 > spreadThreshold) {
          // wait, spread is ratio e.g. 0.001 (0.1%). logic below used 0.001
          // Code used: spread > 0.001. My vars: spreadThreshold 0.1 (meaning 0.1%).
          // Need to be consistent. Let's use raw number: 0.001 (10bps)
          const actualThreshold = isCrash ? 0.0005 : 0.001;
          if (spotQuote.spread > actualThreshold) {
            this.performance.closeTrade(
              position.id,
              perpPrice, // approx exit
              Date.now(),
              currentBasis,
            );
            this.emit(
              "log",
              `🚨 UNWIND (Spread): ${position.symbol} spread ${
                (spotQuote.spread * 100).toFixed(
                  3,
                )
              }% > ${(actualThreshold * 100).toFixed(3)}%`,
            );
            continue;
          }
        }

        // 2. Basis Deviation check
        const basisDiff = Math.abs(currentBasis - position.entryBasis);
        if (basisDiff > deviationThreshold) {
          // 2% move against?
          this.performance.closeTrade(
            position.id,
            perpPrice,
            Date.now(),
            currentBasis,
          );
          this.emit(
            "log",
            `🚨 UNWIND (Basis Deviation): ${
              basisDiff.toFixed(4)
            } > ${deviationThreshold}`,
          );
        }
      }

      // 5. Signal Generation (Basis Arb)
      let currentSignals: Signal[] = [];
      // currentBasis is already defined above at line 176

      // CRASH Protocol: Halt new positions
      if (this.currentRegime === "CRASH") {
        // No new signals
      } else {
        this.signals.updateBasis(this.config.symbol, currentBasis);
        const basisSignal = this.signals.getSignal(this.config.symbol);

        if (
          basisSignal &&
          (basisSignal.action === "EXPAND" || basisSignal.action === "CONTRACT")
        ) {
          await this.executeSignal(basisSignal);
          currentSignals = [basisSignal];
        }
      }

      // 4. Vacuum Check
      const vacOpp = await this.vacuum.checkForOpportunity(
        this.config.symbol,
        spotPrice,
        perpPrice,
      );

      if (vacOpp) {
        this.emit("log", "Vacuum Opportunity Detected!");
      }

      // 5. Broadcast State
      const state: SentinelState = {
        health,
        metrics: this.performance.getMetrics(),
        signals: currentSignals,
        prices: {
          spot: spotPrice,
          perp: perpPrice,
          basis: currentBasis,
        },
      };

      this.emit("tick", state);
    } catch (e) {
      this.emit("error", e instanceof Error ? e : new Error(String(e)));
    }
  }

  private async executeSignal(signal: Signal): Promise<void> {
    // Volatile Protocol: reduce size
    let size = 100; // Base USD size
    if (this.currentRegime === "VOLATILE") {
      size = 50; // Half size
    }

    this.emit(
      "log",
      `Executing Signal: ${signal.action} @ ${
        signal.basis.toFixed(4)
      } (Size: ${size})`,
    );

    // Record Trade (Simulated)
    this.performance.recordTrade({
      id: `tr-${Date.now()}`,
      symbol: signal.symbol,
      type: "BASIS_SCALP",
      entryTime: Date.now(),
      exitTime: 0,
      entryBasis: signal.basis,
      exitBasis: 0,
      size,
      realizedPnL: 0, // Pending close
      fees: 0.1,
      entryPrice: 0,
    });
  }
}
