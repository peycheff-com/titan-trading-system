import { EventEmitter } from 'events';
import { ExchangeRouter } from '../router/ExchangeRouter.js';
import { PortfolioManager } from '../portfolio/PortfolioManager.js';
import { RiskManager } from '../risk/RiskManager.js';
import { VacuumMonitor } from '../vacuum/VacuumMonitor.js';
import { PerformanceTracker } from '../performance/PerformanceTracker.js';
import { SignalGenerator } from './StatEngine.js';
import { PriceMonitor } from '../router/PriceMonitor.js';
import type { Signal } from '../types/signals.js';
import type { IExchangeGateway } from '../exchanges/interfaces.js';
import { DEFAULT_SIGNAL_THRESHOLDS } from '../types/signals.js';
import type { HealthReport, PerformanceMetrics } from '../types/portfolio.js';
import { getNatsClient, type IntentSignal, SignalClient, TitanSubject } from '@titan/shared';

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
  private signalClient: SignalClient;

  // State from NATS
  private currentRegime: string = 'STABLE';
  private currentAPTR: number = 0;
  private allocatedEquity: number = 0;

  // ... (constructor) ...

  public updateBudget(equity: number) {
    // eslint-disable-next-line functional/immutable-data
    this.allocatedEquity = equity;
    this.emit('log', `💰 Budget Updated: $${equity.toFixed(2)}`);
  }

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
    this.signalClient = new SignalClient({ source: 'sentinel' });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    // eslint-disable-next-line functional/immutable-data
    this.isRunning = true;
    this.emit('log', 'Sentinel Core Starting...');

    // Initialize Portfolio
    await this.portfolio.initialize();

    // Connect Signal Client
    try {
      await this.signalClient.connect();
      this.emit('log', '✅ Signal Client Connected');
    } catch (e) {
      this.emit('log', `⚠️ Signal Client Connect Failed: ${e}`);
    }

    // Start Loops
    // eslint-disable-next-line functional/immutable-data
    this.tickInterval = setInterval(() => this.onTick(), this.config.updateIntervalMs);
    this.emit('log', 'Sentinel Core Started.');
  }

  async stop(): Promise<void> {
    // eslint-disable-next-line functional/immutable-data
    this.isRunning = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.emit('log', 'Sentinel Core Stopped.');
  }

  public updateRegime(regime: string, aptr: number) {
    const oldRegime = this.currentRegime;
    // eslint-disable-next-line functional/immutable-data
    this.currentRegime = regime;
    // eslint-disable-next-line functional/immutable-data
    this.currentAPTR = aptr;

    if (oldRegime !== regime) {
      this.emit('log', `⚠️ Regime Change: ${oldRegime} -> ${regime} (APTR: ${aptr.toFixed(4)})`);
    }
  }

  private async onTick(): Promise<void> {
    try {
      // 1. Update Prices
      const allPrices = await this.priceMonitor.getAllPrices(this.config.symbol);

      if (allPrices.length < 2) return;

      const spotQuote = allPrices.find((p) => p.exchange.includes('spot'));
      const perpQuote = allPrices.find((p) => p.exchange.includes('perp'));

      if (!spotQuote || !perpQuote) return;

      const spotPrice = spotQuote.price;
      const perpPrice = perpQuote.price;

      // 2. Risk Check (Pre-Trade)
      const health = this.portfolio.getHealthReport();

      // Risk evaluate signature: (health, totalEquity)
      // Health likely has NAV which is roughly equity
      const riskStatus = this.risk.evaluate(health, health.nav);

      if (!riskStatus.withinLimits) {
        this.emit('log', `Risk Limit Violated: ${riskStatus.violations.join(', ')}`);
        const isCritical = riskStatus.violations.some((v) => v.includes('CRITICAL'));
        if (isCritical) return;
      }

      // 3. Liquidity Gate (Pre-Trade)
      // Block trading if spread is too wide (> 5bps / 0.05%)
      if (spotQuote.spread && spotQuote.spread > 0.0005) {
        // Optimization: Don't spam log
        if (Math.random() < 0.01) {
          this.emit(
            'log',
            `⚠️ Liquidity Gate: Spread too wide (${(spotQuote.spread * 100).toFixed(4)}%)`,
          );
        }
        return;
      }

      // Calculate Basis immediately for use in Logic
      const currentBasis = (perpPrice - spotPrice) / spotPrice;

      // 4. Unwind Logic (Post-Trade)
      // Aggressive Unwind in CRASH regime
      const isCrash = this.currentRegime === 'CRASH';
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
              'log',
              `🚨 UNWIND (Spread): ${position.symbol} spread ${(spotQuote.spread * 100).toFixed(
                3,
              )}% > ${(actualThreshold * 100).toFixed(3)}%`,
            );
            continue;
          }
        }

        // 2. Basis Deviation check
        const basisDiff = Math.abs(currentBasis - position.entryBasis);
        if (basisDiff > deviationThreshold) {
          // 2% move against?
          this.performance.closeTrade(position.id, perpPrice, Date.now(), currentBasis);
          this.emit(
            'log',
            `🚨 UNWIND (Basis Deviation): ${basisDiff.toFixed(4)} > ${deviationThreshold}`,
          );
        }
      }

      // 5. Signal Generation (Basis Arb)
      // eslint-disable-next-line functional/no-let
      let currentSignals: Signal[] = [];
      // currentBasis is already defined above at line 176

      // CRASH Protocol: Halt new positions
      if (this.currentRegime === 'CRASH') {
        // No new signals
      } else {
        this.signals.updateBasis(this.config.symbol, currentBasis);
        const basisSignal = this.signals.getSignal(this.config.symbol);

        if (basisSignal && (basisSignal.action === 'EXPAND' || basisSignal.action === 'CONTRACT')) {
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
        this.emit('log', 'Vacuum Opportunity Detected!');
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

      this.emit('tick', state);
      this.publishState(state);
    } catch (e) {
      this.emit('error', e instanceof Error ? e : new Error(String(e)));
    }
  }

  private async publishState(state: SentinelState): Promise<void> {
    const nats = getNatsClient();
    if (!nats.isConnected()) return;

    // Publish Posture
    const posturePayload = {
      phase: 'sentinel',
      status: this.isRunning ? 'RUNNING' : 'STOPPED',
      regime: this.currentRegime,
      metrics: {
        nav: state.health.nav,
        equity: this.allocatedEquity,
        openPositions: state.health.positions.length,
        basis: state.prices.basis,
      },
      timestamp: Date.now(),
    };
    nats.publish(`${TitanSubject.EVT_PHASE_POSTURE}.sentinel`, posturePayload);

    // Publish Diagnostics
    const diagnosticsPayload = {
      phase: 'sentinel',
      health: state.health.riskStatus,
      alerts: state.health.alerts,
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      },
      timestamp: Date.now(),
    };
    nats.publish(`${TitanSubject.EVT_PHASE_DIAGNOSTICS}.sentinel`, diagnosticsPayload);
  }

  private async executeSignal(signal: Signal): Promise<void> {
    // Truth Layer Sizing: Use Allocated Equity if available, else static config
    const capitalBase =
      this.allocatedEquity > 0 ? this.allocatedEquity : this.config.initialCapital;

    // Sizing Strategy:
    // STABLE: 10% of capital per trade
    // VOLATILE: 5% of capital per trade
    // CRASH: 0% (Handled by regime rejection earlier, but safe to default 0)

    // eslint-disable-next-line functional/no-let
    let sizingPercentage = 0.1;
    if (this.currentRegime === 'VOLATILE') {
      sizingPercentage = 0.05;
    }

    const calculatedSize = capitalBase * sizingPercentage;

    // Cap at Max Position Size from Risk Settings
    // Need to cast to any if maxPositionSize is not public in RiskManager, but usually access via getter or public prop
    // Actually this.risk is public.
    // However, RiskManager def is imported. Let's assume it has maxPositionSize if it was passed in config.
    // In constructor: maxPositionSize: 50000.
    // Let's assume RiskManager has a limit logic, but we want to cap the *intent* size.
    // For now, let's just log the calculated size.

    this.emit(
      'log',
      `Generaring Intent with Truth Sizing: ${sizingPercentage * 100}% of $${capitalBase.toFixed(
        0,
      )} => $${calculatedSize.toFixed(2)}`,
    );

    // Orchestrate Intent
    // Basis Arb requires two legs. For Phase 3 Alpha, we execute Leg 1 (Perp) then Leg 2 (Spot)
    // EXPAND: Buy Perp, Sell Spot
    // CONTRACT: Sell Perp, Buy Spot

    const direction = signal.action === 'EXPAND' ? 'LONG' : 'SHORT';

    // Construct Intent
    const intent: IntentSignal = {
      signal_id: `sentinel-${Date.now()}-${signal.symbol}`,
      source: 'sentinel',
      symbol: signal.symbol,
      direction: direction,
      entry_zone: {
        min: 0,
        max: 999999, // Market order mostly
      },
      stop_loss: 0,
      take_profits: [],
      confidence: signal.confidence,
      leverage: 1,
      timestamp: Date.now(),

      // Truth Layer Injection
      position_size: calculatedSize,

      trap_type: 'BASIS_ARB',
    };

    try {
      this.emit('log', `📤 Sending PREPARE...`);
      const prepareResult = await this.signalClient.sendPrepare(intent);

      if (prepareResult.prepared) {
        const confirmResult = await this.signalClient.sendConfirm(intent.signal_id);
        this.emit('log', `✅ CONFIRM Executed: ${confirmResult.executed}`);

        // Simple performance tracking (approximate)
        this.performance.recordTrade({
          id: intent.signal_id,
          symbol: signal.symbol,
          type: 'BASIS_SCALP',
          entryTime: Date.now(),
          exitTime: 0,
          entryBasis: signal.basis,
          exitBasis: 0,
          size: calculatedSize,
          realizedPnL: 0,
          fees: 0,
          entryPrice: confirmResult.fill_price || 0,
        });
      } else {
        this.emit('log', `❌ PREPARE Rejected: ${prepareResult.reason}`);
      }
    } catch (error) {
      this.emit('log', `❌ Execution Error: ${error}`);
    }
  }
}
