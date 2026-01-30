/**
 * HedgeIntegrityMonitor - Enforces Delta Neutrality (Phase 3)
 *
 * Requirements: Phase 4 - Deep Edge & Microstructure
 * - Monitor Portfolio Delta
 * - Trigger Force Hedge if delta drift > threshold
 */

import { Logger } from '../logging/Logger.js';
import { RiskGuardian } from '../features/Risk/RiskGuardian.js';
import { SignalProcessor } from './SignalProcessor.js';
import { PositionManager } from './PositionManager.js';
import { IntentSignal, Position } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export class HedgeIntegrityMonitor {
  private readonly logger: Logger;
  private monitorInterval: NodeJS.Timeout | null = null;

  // Config
  private readonly CHECK_INTERVAL_MS = 5000; // 5s check
  private readonly DELTA_THRESHOLD_USD = 500; // Trigger if net delta > $500 (Configurable?)

  constructor(
    private readonly riskGuardian: RiskGuardian,
    private readonly signalProcessor: SignalProcessor,
    private readonly positionManager: PositionManager,
  ) {
    this.logger = Logger.getInstance('hedge-integrity');
  }

  public start(): void {
    if (this.monitorInterval) return;

    this.logger.info('🛡️ Sentinel Hedge Monitor Started');

    this.monitorInterval = setInterval(() => this.checkIntegrity(), this.CHECK_INTERVAL_MS);
  }

  public stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);

      this.monitorInterval = null;
    }
  }

  private async checkIntegrity(): Promise<void> {
    try {
      // Get current positions
      const positions = this.positionManager.getPositions();

      // Group positions by symbol
      const positionsBySymbol = new Map<string, Position[]>();
      for (const pos of positions) {
        if (!positionsBySymbol.has(pos.symbol)) {
          positionsBySymbol.set(pos.symbol, []);
        }
        positionsBySymbol.get(pos.symbol)!.push(pos);
      }

      // Check delta for each symbol
      for (const [symbol, symbolPositions] of positionsBySymbol) {
        const delta = this.riskGuardian.calculatePortfolioDelta(symbolPositions);

        if (Math.abs(delta) > this.DELTA_THRESHOLD_USD) {
          this.logger.warn(
            `⚠️ Hedge Integrity Breach (${symbol}): Delta ${delta.toFixed(
              2,
            )} > ${this.DELTA_THRESHOLD_USD}`,
          );

          // Trigger Correction per symbol
          await this.triggerForceHedge(symbol, delta);
        }
      }
    } catch (error) {
      this.logger.error('Failed to check hedge integrity', error as Error);
    }
  }

  private async triggerForceHedge(symbol: string, currentDelta: number): Promise<void> {
    // Negative delta -> We are Short -> Need to BUY to flatten
    // Positive delta -> We are Long -> Need to SELL to flatten

    const side = currentDelta > 0 ? 'SELL' : 'BUY';
    const size = Math.abs(currentDelta); // Hedge full drift? Or partial? Full for now.

    // Sanity Check: Don't hedge tiny amounts
    if (size < 10) return;

    const signal: IntentSignal = {
      signalId: `sentinel-${uuidv4()}`,
      phaseId: 'phase3',
      symbol: symbol, // Dynamic symbol
      side: side,
      requestedSize: size,
      timestamp: Date.now(),
      leverage: 1, // Hedge spot/perp mix
      metadata: {
        reason: 'FORCE_HEDGE_INTEGRITY',
        drift: currentDelta,
      },
    };

    this.logger.info(`🚨 Emitting FORCE_HEDGE signal: ${symbol} ${side} $${size.toFixed(2)}`);

    // Push directly to processor
    await this.signalProcessor.processSignal(signal);
  }
}
