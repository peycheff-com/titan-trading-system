import { EventEmitter } from "events";
import { ExchangeRouter } from "../router/ExchangeRouter.js";
import { PortfolioManager } from "../portfolio/PortfolioManager.js";
import { RiskManager } from "../risk/RiskManager.js";
import { VacuumMonitor } from "../vacuum/VacuumMonitor.js";
import { PerformanceTracker } from "../performance/PerformanceTracker.js";
import { SignalGenerator } from "./StatEngine.js";
import { PriceMonitor } from "../router/PriceMonitor.js";
import type { Signal, SignalAction } from "../types/signals.js";
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
            "binance": 0.001,
            "bybit": 0.001,
        });

        this.portfolio = new PortfolioManager(gatewayMap);

        this.risk = new RiskManager({
            maxDelta: config.riskLimits.maxDelta,
            criticalDelta: config.riskLimits.maxDelta * 1.5,
            maxLeverage: config.riskLimits.maxLeverage,
            dailyDrawdownLimit: config.riskLimits.maxDrawdown * 0.5,
            criticalDrawdown: config.riskLimits.maxDrawdown,
            maxPositionSize: 50000,
            stopLossThreshold: 0.10,
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

    private async onTick(): Promise<void> {
        try {
            // 1. Update Prices
            const allPrices = await this.priceMonitor.getAllPrices(
                this.config.symbol,
            );

            if (allPrices.length < 2) return;

            const spotQuote = allPrices.find((p) =>
                p.exchange.includes("spot")
            );
            const perpQuote = allPrices.find((p) =>
                p.exchange.includes("perp")
            );

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

            // 3. Signal Generation (Basis Arb)
            const currentBasis = (perpPrice - spotPrice) / spotPrice;
            this.signals.updateBasis(this.config.symbol, currentBasis);
            const basisSignal = this.signals.getSignal(this.config.symbol);

            if (
                basisSignal &&
                (basisSignal.action === "EXPAND" ||
                    basisSignal.action === "CONTRACT")
            ) {
                await this.executeSignal(basisSignal);
            }

            // 4. Vacuum Check
            const vacOpp = await this.vacuum.checkForOpportunity(
                this.config.symbol,
                spotPrice,
                perpPrice,
            );
            // vacuum might return promise? earlier error said it returns promise. Added await.

            if (vacOpp) {
                this.emit("log", "Vacuum Opportunity Detected!");
            }

            // 5. Broadcast State
            const state: SentinelState = {
                health,
                metrics: this.performance.getMetrics(),
                signals: basisSignal ? [basisSignal] : [],
                prices: {
                    spot: spotPrice,
                    perp: perpPrice,
                    basis: currentBasis,
                },
            };
            this.emit("tick", state);
        } catch (e) {
            this.emit("error", e);
        }
    }

    private async executeSignal(signal: Signal): Promise<void> {
        const size = 100; // USD size
        this.emit(
            "log",
            `Executing Signal: ${signal.action} @ ${signal.basis.toFixed(4)}`,
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
        });
    }
}
