/**
 * TitanTrap Core Engine
 *
 * The Predestination Engine that pre-calculates structural breakout levels,
 * monitors Binance Spot for validation signals, and executes on Bybit Perps.
 *
 * Three-Layer Architecture (Refactored):
 * 1. Pre-Computation Layer (TrapGenerator): Calculates tripwires
 * 2. Detection Layer (TrapDetector): Monitors Binance WebSocket
 * 3. Execution Layer (TrapExecutor): Fires orders via Fast Path IPC
 * 4. State Layer (TrapStateManager): shared state
 */

import { EventEmitter } from "../events/EventEmitter.js";
import { getNatsClient, SignalClient, TitanSubject } from "@titan/shared";
import { CVDCalculator } from "../calculators/CVDCalculator.js";
import { LeadLagDetector } from "../calculators/LeadLagDetector.js";
import { TripwireCalculators } from "../calculators/TripwireCalculators.js";
import { PositionSizeCalculator } from "../calculators/PositionSizeCalculator.js";
import { BinanceSpotClient } from "../exchanges/BinanceSpotClient.js";
import { BybitPerpsClient } from "../exchanges/BybitPerpsClient.js";
import { ConfigManager } from "../config/ConfigManager.js";
import { VelocityCalculator } from "../calculators/VelocityCalculator.js";
import { Trade, Tripwire } from "../types/index.js";
import { Logger } from "../logging/Logger.js";
import { OIWipeoutDetector } from "../detectors/OIWipeoutDetector.js";
import { FundingSqueezeDetector } from "../detectors/FundingSqueezeDetector.js";
import { BasisArbDetector } from "../detectors/BasisArbDetector.js";
import { UltimateBulgariaProtocol } from "../detectors/UltimateBulgariaProtocol.js";

// Components
import { TrapStateManager } from "./components/TrapStateManager.js";
import { TrapGenerator } from "./components/TrapGenerator.js";
import { TrapExecutor } from "./components/TrapExecutor.js";
import { TrapDetector } from "./components/TrapDetector.js";

/**
 * TitanTrap Engine
 *
 * Facade that coordinates the trap lifecycle components.
 */
export class TitanTrap {
  // Components
  public stateManager: TrapStateManager; // Public for index.tsx access if needed, or use getter
  private generator: TrapGenerator;
  private executor: TrapExecutor;
  private detector: TrapDetector;

  // Timers
  private preComputationInterval?: NodeJS.Timeout;
  private memoryMonitorInterval?: NodeJS.Timeout;
  private stateBroadcastInterval?: NodeJS.Timeout;

  // Clients & Dependencies
  private binanceClient: BinanceSpotClient;
  private bybitClient: BybitPerpsClient | null;
  private signalClient: SignalClient;
  private logger: Logger;
  private config: ConfigManager;
  private eventEmitter: EventEmitter;

  // Calculators (maintained here for injection compatibility or component use)
  private velocityCalculator: VelocityCalculator;
  private positionSizeCalculator: PositionSizeCalculator;
  private tripwireCalculators: TripwireCalculators;

  constructor(dependencies: {
    binanceClient: BinanceSpotClient;
    bybitClient: BybitPerpsClient | null;
    logger: Logger;
    config: ConfigManager;
    eventEmitter: EventEmitter;
    tripwireCalculators: TripwireCalculators;
    velocityCalculator: VelocityCalculator;
    positionSizeCalculator: PositionSizeCalculator;
    oiDetector?: OIWipeoutDetector;
    fundingDetector?: FundingSqueezeDetector;
    basisDetector?: BasisArbDetector;
    ultimateProtocol?: UltimateBulgariaProtocol;
    signalClient?: SignalClient;
  }) {
    this.binanceClient = dependencies.binanceClient;
    this.bybitClient = dependencies.bybitClient;
    this.logger = dependencies.logger;
    this.config = dependencies.config;
    this.eventEmitter = dependencies.eventEmitter;
    this.tripwireCalculators = dependencies.tripwireCalculators;
    this.velocityCalculator = dependencies.velocityCalculator;
    this.positionSizeCalculator = dependencies.positionSizeCalculator;

    // Initialize Signal Client (Brain IPC)
    this.signalClient = dependencies.signalClient || new SignalClient({
      source: "scavenger",
    });
    // Removed legacy setupExecutionEventListeners (dead IPC)

    // Initialize Components
    this.stateManager = new TrapStateManager();

    this.generator = new TrapGenerator({
      logger: this.logger,
      config: this.config,
      eventEmitter: this.eventEmitter,
      binanceClient: this.binanceClient,
      bybitClient: this.bybitClient,
      stateManager: this.stateManager,
      oiDetector: dependencies.oiDetector,
      fundingDetector: dependencies.fundingDetector,
      basisDetector: dependencies.basisDetector,
    });

    // Initialize calculators required for components
    const cvdCalculator = new CVDCalculator();
    const leadLagDetector = new LeadLagDetector();

    this.executor = new TrapExecutor({
      logger: this.logger,
      config: this.config,
      eventEmitter: this.eventEmitter,
      bybitClient: this.bybitClient,
      stateManager: this.stateManager,
      signalClient: this.signalClient,
      positionSizeCalculator: this.positionSizeCalculator,
      velocityCalculator: this.velocityCalculator,
      cvdCalculator: cvdCalculator,
      leadLagDetector: leadLagDetector,
    });

    this.detector = new TrapDetector({
      logger: this.logger,
      config: this.config,
      eventEmitter: this.eventEmitter,
      stateManager: this.stateManager,
      executor: this.executor,
      velocityCalculator: this.velocityCalculator,
      cvdCalculator: cvdCalculator,
      leadLagDetector: leadLagDetector,
    });

    // Wire up Bybit callbacks
    if (this.bybitClient) {
      this.generator.setOnTickerCallback(
        this.detector.onBybitTicker.bind(this.detector),
      );
    }
  }

  /**
   * Setup Execution Client Event Listeners (IPC/Fast Path)
   */

  /**
   * Start the TitanTrap engine
   */
  async start(): Promise<void> {
    this.logger.info("🕸️ Starting TitanTrap Engine...");

    try {
      this.logger.info("🔌 Connecting to Signal Service via NATS...");
      await this.signalClient.connect();
      this.logger.info("✅ Connected to Signal Service");
    } catch (error) {
      // Non-fatal, retry handled by NATS
      this.logger.warn(
        "⚠️ Failed to connect to Signal Service (initial): " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }

    this.startMemoryMonitoring();
    this.startStateBroadcast();

    await this.generator.updateTrapMap();
    await this.updateSubscriptions();

    const updateInterval = this.config.getConfig().updateInterval || 60000;
    this.preComputationInterval = setInterval(async () => {
      await this.generator.updateTrapMap();
      await this.updateSubscriptions();
    }, updateInterval);

    this.logger.info("✅ TitanTrap Engine started");
  }

  /**
   * Stop the TitanTrap engine
   */
  async stop(): Promise<void> {
    this.logger.info("🛑 Stopping TitanTrap Engine...");

    if (this.preComputationInterval) clearInterval(this.preComputationInterval);
    if (this.memoryMonitorInterval) clearInterval(this.memoryMonitorInterval);
    if (this.stateBroadcastInterval) clearInterval(this.stateBroadcastInterval);

    try {
      // no disconnect method on signalClient? It uses shared NATS.
      // We can leave it open or check. NatsClient is usually long-lived.
      this.logger.info("✅ Signal Client clean up (noop)");
    } catch (error) {
      // ignore
    }

    this.binanceClient.close();
    if (this.bybitClient) {
      this.bybitClient.close();
    }

    this.logger.info("✅ TitanTrap Engine stopped");
  }

  /**
   * EXPOSED for index.tsx: Handle Binance Tick
   */
  public async onBinanceTick(
    symbol: string,
    price: number,
    trades: Trade[],
  ): Promise<void> {
    await this.detector.onBinanceTick(symbol, price, trades);
  }

  /**
   * EXPOSED for index.tsx: Get Trap Map
   */
  public getTrapMap(): Map<string, Tripwire[]> {
    return this.stateManager.getTrapMap();
  }

  /**
   * EXPOSED for index.tsx: Get Equity
   */
  public getCachedEquity(): number {
    return this.executor.getCachedEquity();
  }

  /**
   * Force Reconnect IPC
   */
  public async forceIPCReconnect(): Promise<void> {
    this.logger.warn("🔌 Forcing IPC Reconnection...");
    await this.signalClient.forceReconnect();
  }

  /**
   * Get IPC Status (for tests/monitoring)
   */
  public getIPCStatus(): Record<string, unknown> {
    return this.signalClient.getStatus();
  }

  private startMemoryMonitoring(): void {
    this.memoryMonitorInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
      const rssMB = memoryUsage.rss / 1024 / 1024;

      if (heapUsedMB > 150) {
        this.logger.warn(
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
    }, 10000);
  }

  private startStateBroadcast(): void {
    this.stateBroadcastInterval = setInterval(() => {
      this.broadcastState();
    }, 5000);
  }

  private async broadcastState(): Promise<void> {
    const nats = getNatsClient();
    if (!nats.isConnected()) return;

    const posturePayload = {
      phase: "scavenger",
      status: "RUNNING",
      regime: "MULTI",
      metrics: {
        activeTraps: this.stateManager.getTrapMap().size,
        topSymbols: Array.from(this.stateManager.getTrapMap().keys()).slice(
          0,
          5,
        ),
        equity: this.executor.getCachedEquity(),
      },
      timestamp: Date.now(),
    };
    nats.publish(`${TitanSubject.EVT_PHASE_POSTURE}.scavenger`, posturePayload);

    const diagnosticsPayload = {
      phase: "scavenger",
      health: "HEALTHY",
      alerts: [],
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      },
      timestamp: Date.now(),
    };
    nats.publish(
      `${TitanSubject.EVT_PHASE_DIAGNOSTICS}.scavenger`,
      diagnosticsPayload,
    );
  }

  private async updateSubscriptions(): Promise<void> {
    const symbols = this.stateManager.getAllSymbols();
    if (symbols.length === 0) return;

    this.logger.info(
      `🔄 Updating Binance subscriptions for ${symbols.length} symbols`,
    );
    await this.binanceClient.subscribeAggTrades(symbols);

    for (const symbol of symbols) {
      this.binanceClient.onTrade(symbol, (trades) => {
        if (trades.length > 0) {
          this.onBinanceTick(symbol, trades[trades.length - 1].price, trades);
        }
      });
    }
  }
}
