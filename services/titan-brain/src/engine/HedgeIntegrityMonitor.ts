/**
 * HedgeIntegrityMonitor - Enforces Delta Neutrality (Phase 3)
 *
 * Requirements: Phase 4 - Deep Edge & Microstructure
 * - Monitor Portfolio Delta
 * - Trigger Force Hedge if delta drift > threshold
 */

import { Logger } from '../logging/Logger.js';
import { RiskGuardian } from './RiskGuardian.js';
import { SignalProcessor } from './SignalProcessor.js';
import { PositionManager } from './PositionManager.js';
import { IntentSignal } from '../types/index.js';
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
    // eslint-disable-next-line functional/immutable-data
    this.monitorInterval = setInterval(() => this.checkIntegrity(), this.CHECK_INTERVAL_MS);
  }

  public stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      // eslint-disable-next-line functional/immutable-data
      this.monitorInterval = null;
    }
  }

  private async checkIntegrity(): Promise<void> {
    try {
      // Get current positions
      const positions = this.positionManager.getPositions();

      // Calculate delta
      const delta = this.riskGuardian.calculatePortfolioDelta(positions);

      if (Math.abs(delta) > this.DELTA_THRESHOLD_USD) {
        this.logger.warn(
          `⚠️ Hedge Integrity Breach: Delta ${delta.toFixed(2)} > ${this.DELTA_THRESHOLD_USD}`,
        );

        // Trigger Correction
        await this.triggerForceHedge(delta);
      }
    } catch (error) {
      this.logger.error('Failed to check hedge integrity', error as Error);
    }
  }

  private async triggerForceHedge(currentDelta: number): Promise<void> {
    // Negative delta -> We are Short -> Need to BUY to flatten
    // Positive delta -> We are Long -> Need to SELL to flatten

    const side = currentDelta > 0 ? 'SELL' : 'BUY';
    const size = Math.abs(currentDelta); // Hedge full drift? Or partial? Full for now.

    // Sanity Check: Don't hedge tiny amounts
    if (size < 10) return;

    const signal: IntentSignal = {
      signalId: `sentinel-${uuidv4()}`,
      phaseId: 'phase3',
      symbol: 'BTC/USDT', // Assuming BTC for now, or need to calculate per symbol?
      // Ideally we'd know which symbol caused the delta.
      // RiskGuardian.portfolioDelta is aggregated.
      // For now, assuming single-asset or BTC-dominant portfolio.
      // TODO: Multi-asset support requires Per-Symbol Delta check.
      side: side,
      requestedSize: size,
      timestamp: Date.now(),
      leverage: 1, // Hedge spot/perp mix
      metadata: {
        reason: 'FORCE_HEDGE_INTEGRITY',
        drift: currentDelta,
      },
    };

    this.logger.info(`🚨 Emitting FORCE_HEDGE signal: ${side} $${size.toFixed(2)}`);

    // Push directly to processor (bypassing queue/router for speed? or standard route?)
    // Standard route to ensure checks still pass (though Phase 3 is auto-approved usually)
    await this.signalProcessor.processSignal(signal);
  }
}
