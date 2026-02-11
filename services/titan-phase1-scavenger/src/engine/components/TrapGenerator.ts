/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
import { Logger } from '../../logging/Logger.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import { EventEmitter } from '../../events/EventEmitter.js';
import { BinanceSpotClient } from '../../exchanges/BinanceSpotClient.js';
import { BybitPerpsClient } from '../../exchanges/BybitPerpsClient.js';
import { TrapStateManager } from './TrapStateManager.js';
import { OIWipeoutDetector } from '../../detectors/OIWipeoutDetector.js';
import { FundingSqueezeDetector } from '../../detectors/FundingSqueezeDetector.js';
import { BasisArbDetector } from '../../detectors/BasisArbDetector.js';
import { OHLCV, Tripwire } from '../../types/index.js';

interface TrapGeneratorDependencies {
  logger: Logger;
  config: ConfigManager;
  eventEmitter: EventEmitter;
  binanceClient: BinanceSpotClient;
  bybitClient: BybitPerpsClient | null;
  stateManager: TrapStateManager;
  oiDetector?: OIWipeoutDetector;
  fundingDetector?: FundingSqueezeDetector;
  basisDetector?: BasisArbDetector;
}

/**
 * TrapGenerator (Pre-Computation Layer / The Web)
 *
 * Responsible for calculating potential tripwires based on market structure.
 * Runs periodically (e.g., every minute) to update the map of active traps.
 */
export class TrapGenerator {
  private logger: Logger;
  private config: ConfigManager;
  private eventEmitter: EventEmitter;
  private binanceClient: BinanceSpotClient;
  private bybitClient: BybitPerpsClient | null;
  private stateManager: TrapStateManager;

  // Detectors
  private oiDetector?: OIWipeoutDetector;
  private fundingDetector?: FundingSqueezeDetector;
  private basisDetector?: BasisArbDetector;

  // Callback for Ticker updates (wired to Detector)
  private onTickerCallback?: (symbol: string, price: number, timestamp: number) => void;

  constructor(dependencies: TrapGeneratorDependencies) {
    this.logger = dependencies.logger;
    this.config = dependencies.config;
    this.eventEmitter = dependencies.eventEmitter;
    this.binanceClient = dependencies.binanceClient;
    this.bybitClient = dependencies.bybitClient;
    this.stateManager = dependencies.stateManager;
    this.oiDetector = dependencies.oiDetector;
    this.fundingDetector = dependencies.fundingDetector;
    this.basisDetector = dependencies.basisDetector;
  }

  setOnTickerCallback(callback: (symbol: string, price: number, timestamp: number) => void): void {
    this.onTickerCallback = callback;
  }

  /**
   * Main Loop: Update Trap Map
   */
  async updateTrapMap(): Promise<void> {
    const startTime = Date.now();
    this.logger.info('🔄 Pre-Computation Layer: Calculating tripwires...');

    if (!this.bybitClient) {
      this.logger.warn('⚠️ Bybit Client not available for Pre-Computation. Skipping.');
      return;
    }

    try {
      // 1. Fetch Top Symbols by Volume
      const topSymbols = await this.bybitClient.fetchTopSymbols(20);
      const symbolList = topSymbols.filter((s) => !this.stateManager.isBlacklisted(s));

      // 2. Clear old traps
      this.stateManager.clearTraps();

      // 3. Parallel Calculation
      await Promise.all(
        symbolList.map(async (symbol) => {
          try {
            // Get OHLCV (using Bybit as it has the method)
            const ohlcv = await this.bybitClient!.fetchOHLCV(symbol, '60', 50);

            // Calculate Metrics (Structure, Volatility)
            const structure = this.analyzeStructure(ohlcv);
            const volatility = this.analyzeVolatility(ohlcv);

            // Detectors
            const oiTrap = this.oiDetector ? await this.oiDetector.detectWipeout(symbol) : null;
            const fundingTrap = this.fundingDetector
              ? await this.fundingDetector.detectSqueeze(symbol)
              : null;
            const basisTrap = this.basisDetector
              ? await this.basisDetector.detectBasisArb(symbol)
              : null;

            // Generate Tripwires
            const tripwires: Tripwire[] = [];

            // Pattern: Range Breakout
            if (structure.regime === 'RANGE') {
              tripwires.push({
                id: `${symbol}-L-${Date.now()}`,
                symbol,
                direction: 'LONG',
                triggerPrice: structure.resistance,
                created: Date.now(),
                trapType: 'BREAKOUT',
                confidence: 0.8,
                leverage: 5,
                volatilityMetrics: volatility,
                estimatedCascadeSize: 0.02,
                activated: false,
              });
              tripwires.push({
                id: `${symbol}-S-${Date.now()}`,
                symbol,
                direction: 'SHORT',
                triggerPrice: structure.support,
                created: Date.now(),
                trapType: 'BREAKDOWN',
                confidence: 0.8,
                leverage: 5,
                volatilityMetrics: volatility,
                estimatedCascadeSize: 0.02,
                activated: false,
              });
            }

            // Pattern: Trend Continuation (Pullback)
            if (structure.regime === 'TREND_UP') {
              tripwires.push({
                id: `${symbol}-L-PB-${Date.now()}`,
                symbol,
                direction: 'LONG',
                triggerPrice: structure.support, // Buy at support
                created: Date.now(),
                trapType: 'PULLBACK',
                confidence: 0.75,
                leverage: 3,
                volatilityMetrics: volatility,
                estimatedCascadeSize: 0.015,
                activated: false,
              });
            } else if (structure.regime === 'TREND_DOWN') {
              tripwires.push({
                id: `${symbol}-S-PB-${Date.now()}`,
                symbol,
                direction: 'SHORT',
                triggerPrice: structure.resistance, // Sell at resistance
                created: Date.now(),
                trapType: 'PULLBACK',
                confidence: 0.75,
                leverage: 3,
                volatilityMetrics: volatility,
                estimatedCascadeSize: 0.015,
                activated: false,
              });
            }

            // Add Detected Traps
            if (oiTrap) tripwires.push(oiTrap);
            if (fundingTrap) tripwires.push(fundingTrap);
            if (basisTrap) tripwires.push(basisTrap);

            // Store Traps
            if (tripwires.length > 0) {
              this.stateManager.setTraps(symbol, tripwires);
            }
          } catch (err) {
            this.logger.error(`Error processing ${symbol} in generator`, err as Error);
          }
        }),
      );

      // 4. Update Binance Subscriptions managed by TitanTrap
    } catch (error) {
      this.logger.error('Trap generation failed', error as Error);
    }

    // Subscribe to Bybit too (Lead/Lag)
    if (this.bybitClient && this.onTickerCallback) {
      const symbolList = this.stateManager.getAllSymbols();
      if (symbolList.length > 0) {
        this.bybitClient.subscribeTicker(symbolList, this.onTickerCallback);
        this.logger.info(`   ✅ Subscribed to Bybit Tickers for Lead/Lag detection`);
      }
    }

    const duration = Date.now() - startTime;
    const count = this.stateManager.getAllSymbols().length;
    this.logger.info(`✅ Trap Map updated: ${count} symbols, ${duration}ms`);

    this.eventEmitter.emit('TRAP_MAP_UPDATED', {
      symbolCount: count,
      duration,
      timestamp: Date.now(),
    });
  }

  // --- Helpers ---

  private analyzeStructure(ohlcv: OHLCV[]): {
    regime: string;
    resistance: number;
    support: number;
  } {
    if (!ohlcv || ohlcv.length === 0) {
      return { regime: 'RANGE', resistance: 0, support: 0 };
    }

    const closes = ohlcv.map((c) => c.close);
    const high = Math.max(...ohlcv.map((c) => c.high));
    const low = Math.min(...ohlcv.map((c) => c.low));
    const current = closes[closes.length - 1];

    // Simple logic
    if (current > high * 0.99) {
      return { regime: 'BREAKOUT', resistance: high, support: low };
    }
    if (current < low * 1.01) {
      return { regime: 'BREAKDOWN', resistance: high, support: low };
    }

    return { regime: 'RANGE', resistance: high, support: low };
  }

  private analyzeVolatility(ohlcv: OHLCV[]): {
    atr: number;
    regime: string;
    positionSizeMultiplier: number;
    stopLossMultiplier: number;
  } {
    if (!ohlcv || ohlcv.length < 2) {
      return {
        atr: 0,
        regime: 'LOW_VOL',
        positionSizeMultiplier: 1,
        stopLossMultiplier: 1,
      };
    }

    let trSum = 0;
    for (let i = 1; i < ohlcv.length; i++) {
      const high = ohlcv[i].high;
      const low = ohlcv[i].low;
      const prevClose = ohlcv[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trSum += tr;
    }
    const atr = trSum / (ohlcv.length - 1);

    return {
      atr,
      regime: atr > ohlcv[0].close * 0.01 ? 'HIGH_VOL' : 'LOW_VOL',
      positionSizeMultiplier: 1,
      stopLossMultiplier: 1,
    };
  }
}
