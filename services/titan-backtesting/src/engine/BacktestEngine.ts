import { BacktestResult, OHLCV, SimulationConfig, Trade } from '../types/index.js';
import { EventEmitter } from 'events';
// Import Strategy Engine from Phase 1 (Core Logic)
// @ts-ignore - Dynamic import to avoid build strictness for now
import { TitanTrap } from 'titan-phase1-scavenger/src/engine/TitanTrap.js';
// @ts-ignore
import { TripwireCalculators } from 'titan-phase1-scavenger/src/calculators/TripwireCalculators.js';
// @ts-ignore
import { VelocityCalculator } from 'titan-phase1-scavenger/src/calculators/VelocityCalculator.js';

import { MockBinanceSpotClient } from '../mocks/MockBinanceSpotClient.js';
import { MockBybitPerpsClient } from '../mocks/MockBybitPerpsClient.js';
import { MockConfigManager } from '../mocks/MockConfigManager.js';
import { MockSignalClient } from '../mocks/MockSignalClient.js';

// Simple Logger Mock
const mockLogger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => {}, // Silence debug
};

export class BacktestEngine extends EventEmitter {
  private config: SimulationConfig;
  private binanceMock: MockBinanceSpotClient;
  private bybitMock: MockBybitPerpsClient;
  private configMock: MockConfigManager;
  private signalMock: MockSignalClient;
  private engine: any; // TitanTrap instance

  constructor(config: SimulationConfig) {
    super();
    this.config = config;

    // 1. Initialize Mocks
    this.binanceMock = new MockBinanceSpotClient();
    this.bybitMock = new MockBybitPerpsClient(config.initialCapital);
    this.configMock = new MockConfigManager();
    this.signalMock = new MockSignalClient();

    // 2. Configure Mock Config
    this.configMock.setConfig({
      exchanges: {
        binance: {
          enabled: true,
          executeOn: false,
          testnet: false,
          rateLimit: 1000,
          timeout: 5000,
        },
        bybit: {
          enabled: true,
          executeOn: true,
          testnet: false,
          rateLimit: 1000,
          timeout: 5000,
        },
        mexc: {
          enabled: false,
          executeOn: false,
          testnet: false,
          rateLimit: 50,
          timeout: 5000,
        },
      },
      enabled: true,
      ghostMode: false, // We capture orders via mock, so engine should think it's live
    });

    // 3. Instantiate TitanTrap (The Real Engine)
    console.log('[BacktestEngine] Instantiating TitanTrap with Mocks...');
    this.engine = new TitanTrap({
      binanceClient: this.binanceMock as any,
      bybitClient: this.bybitMock as any,
      logger: mockLogger as any,
      config: this.configMock as any,
      tripwireCalculators: TripwireCalculators,
      velocityCalculator: new VelocityCalculator(),
      positionSizeCalculator: { calculate: () => 0.01 },
      signalClient: this.signalMock as any,
      eventEmitter: new EventEmitter() as any,
    });
  }

  /**
   * Run the simulation
   */
  async runSimulation(data: { candles: OHLCV[]; trades?: Trade[] }): Promise<BacktestResult> {
    console.log(`[BacktestEngine] Starting simulation with ${data.candles.length} candles...`);

    // Start Engine
    await this.engine.start();

    const startTime = Date.now();
    let processedCandles = 0;

    // 4. Feeder Loop
    // We simulate time by feeding candles/trades sequentially
    for (const candle of data.candles) {
      // Update Mock Prices (so execution gets correct price)
      this.bybitMock.setPrice(this.config.symbol, candle.close);

      // Feed Trade Data to Trigger Engine
      // We convert Candle to a simulated Trade for the simple detector
      // In high-fidelity, we would have real trade ticks.
      const simulatedTrade = {
        symbol: this.config.symbol,
        price: candle.close,
        qty: candle.volume / 60, // approximate
        time: candle.timestamp,
        isBuyerMaker: false,
      };

      // Push to Binance Mock (Trigger Source)
      this.binanceMock.pushTrade(this.config.symbol, simulatedTrade as any);

      // In a real backtest, we would tick the clock forward here.
      // For now, we assume synchronous processing of the pushed trade.

      processedCandles++;
    }

    // Stop Engine
    this.engine.stop();
    const duration = Date.now() - startTime;

    // 5. Calculate Results
    const orders = this.bybitMock.getFilledOrders();
    const equity = await this.bybitMock.getEquity(); // This would need PnL tracking logic update in MockBybit

    console.log(`[BacktestEngine] Simulation Complete. Orders: ${orders.length}`);

    return {
      metrics: {
        totalReturn: (equity - this.config.initialCapital) / this.config.initialCapital,
        maxDrawdown: 0, // Todo: calculate
        sharpeRatio: 0,
        winRate: 0,
        tradesCount: orders.length,
      },
      trades: orders.map((o) => ({
        id: o.orderId,
        timestamp: o.timestamp,
        symbol: o.symbol,
        entryPrice: o.price,
        exitPrice: 0, // Todo
        pnl: 0,
        side: o.side === 'Buy' ? 'long' : 'short',
        quantity: o.qty,
        size: o.qty,
      })),
      equityCurve: [],
      logs: [], // Captured from logger
    };
  }
}
