import { BacktestResult, OHLCV, SimulationConfig, Trade } from '../types/index.js';
import { EventEmitter } from 'events';
import { Logger } from '@titan/shared';
// Import Strategy Engine from Phase 1 (Core Logic)
import { TitanTrap } from 'titan-phase1-scavenger/src/engine/TitanTrap.js';

import { TripwireCalculators } from 'titan-phase1-scavenger/src/calculators/TripwireCalculators.js';

import { VelocityCalculator } from 'titan-phase1-scavenger/src/calculators/VelocityCalculator.js';

import { MockBinanceSpotClient } from '../mocks/MockBinanceSpotClient.js';
import { MockBybitPerpsClient } from '../mocks/MockBybitPerpsClient.js';
import { MockConfigManager } from '../mocks/MockConfigManager.js';
import { MockSignalClient } from '../mocks/MockSignalClient.js';

const logger = Logger.getInstance('backtesting');

export class BacktestEngine extends EventEmitter {
  private config: SimulationConfig;
  private binanceMock: MockBinanceSpotClient;
  private bybitMock: MockBybitPerpsClient;
  private configMock: MockConfigManager;
  private signalMock: MockSignalClient;
  private engine: any; // TitanTrap instance — concrete type mismatch by design

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
    // Note: `as any` casts are required here because TitanTrap expects concrete
    // BinanceSpotClient/BybitPerpsClient/ConfigManager types, not interfaces.
    // Mocks implement the same public surface but cannot structurally satisfy
    // the concrete class types. This is the documented backtesting adapter boundary.
    logger.info('Instantiating TitanTrap with Mocks...');
    type TitanDeps = ConstructorParameters<typeof TitanTrap>[0];
    this.engine = new TitanTrap({
      binanceClient: this.binanceMock as unknown as TitanDeps['binanceClient'],
      bybitClient: this.bybitMock as unknown as TitanDeps['bybitClient'],
      logger: logger as unknown as TitanDeps['logger'],
      config: this.configMock as unknown as TitanDeps['config'],
      tripwireCalculators: TripwireCalculators,
      velocityCalculator: new VelocityCalculator(),
      positionSizeCalculator: {
        calculate: () => 0.01,
      } as unknown as TitanDeps['positionSizeCalculator'],
      signalClient: this.signalMock as unknown as TitanDeps['signalClient'],
      eventEmitter: new EventEmitter() as unknown as TitanDeps['eventEmitter'],
    });
  }

  /**
   * Run the simulation
   */
  async runSimulation(data: { candles: OHLCV[]; trades?: Trade[] }): Promise<BacktestResult> {
    logger.info(`Starting simulation with ${data.candles.length} candles...`);

    // Start Engine
    await this.engine.start();

    const startTime = Date.now();
    const equityCurve: { timestamp: number; equity: number }[] = [];
    // eslint-disable-next-line functional/no-let
    let peakEquity = this.config.initialCapital;
    // eslint-disable-next-line functional/no-let
    let maxDrawdown = 0;

    // 4. Feeder Loop — simulate time by feeding candles/trades sequentially
    for (const candle of data.candles) {
      // Update Mock Prices (so execution gets correct price)
      this.bybitMock.setPrice(this.config.symbol, candle.close);

      // Feed Trade Data to Trigger Engine
      const simulatedTrade = {
        symbol: this.config.symbol,
        price: candle.close,
        qty: candle.volume / 60, // approximate
        time: candle.timestamp,
        isBuyerMaker: false,
      };

      // Push to Binance Mock (Trigger Source)
      this.binanceMock.pushTrade(
        this.config.symbol,
        simulatedTrade as Parameters<MockBinanceSpotClient['pushTrade']>[1],
      );

      // Track equity curve after each candle
      const currentEquity = await this.bybitMock.getEquity();
      // eslint-disable-next-line functional/immutable-data
      equityCurve.push({ timestamp: candle.timestamp, equity: currentEquity });

      // Track max drawdown
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const drawdown = peakEquity > 0 ? (peakEquity - currentEquity) / peakEquity : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Stop Engine
    this.engine.stop();
    const duration = Date.now() - startTime;

    // 5. Calculate Results
    const orders = this.bybitMock.getFilledOrders();
    const finalEquity = await this.bybitMock.getEquity();

    // Build trade list with PnL calculation
    const resultTrades = this.buildTrades(orders);

    // Calculate metrics
    const totalReturn = (finalEquity - this.config.initialCapital) / this.config.initialCapital;
    const winRate = this.calculateWinRate(resultTrades);
    const sharpeRatio = this.calculateSharpeRatio(equityCurve, this.config.initialCapital);

    logger.info(`Simulation complete. Orders: ${orders.length}, Duration: ${duration}ms`);

    return {
      metrics: {
        totalReturn,
        maxDrawdown,
        sharpeRatio,
        winRate,
        tradesCount: orders.length,
      },
      trades: resultTrades,
      equityCurve,
      logs: [],
    };
  }

  /**
   * Build trade list from filled orders
   */
  private buildTrades(orders: ReturnType<MockBybitPerpsClient['getFilledOrders']>): Trade[] {
    return orders.map((o) => ({
      id: o.orderId,
      timestamp: o.timestamp,
      symbol: o.symbol,
      entryPrice: o.price,
      exitPrice: 0, // Paired exit not yet implemented
      pnl: 0,
      side: o.side === 'Buy' ? ('long' as const) : ('short' as const),
      quantity: o.qty,
      size: o.qty,
    }));
  }

  /**
   * Calculate win rate from trades with non-zero PnL
   */
  private calculateWinRate(trades: Trade[]): number {
    const closedTrades = trades.filter((t) => t.pnl !== 0);
    if (closedTrades.length === 0) return 0;
    const wins = closedTrades.filter((t) => t.pnl > 0).length;
    return wins / closedTrades.length;
  }

  /**
   * Calculate annualized Sharpe Ratio from equity curve
   * Uses simple returns and assumes 365-day year
   */
  private calculateSharpeRatio(
    equityCurve: { timestamp: number; equity: number }[],
    initialCapital: number,
  ): number {
    if (equityCurve.length < 2) return 0;

    // Calculate period returns
    const returns: number[] = [];
    // eslint-disable-next-line functional/no-let
    let prevEquity = initialCapital;
    for (const point of equityCurve) {
      if (prevEquity > 0) {
        // eslint-disable-next-line functional/immutable-data
        returns.push((point.equity - prevEquity) / prevEquity);
      }
      prevEquity = point.equity;
    }

    if (returns.length === 0) return 0;

    // Mean return
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Standard deviation
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize: assume each candle is ~1 period, scale by sqrt(periods per year)
    // For simplicity, use the raw ratio (no annualization since period is unknown)
    return meanReturn / stdDev;
  }
}
