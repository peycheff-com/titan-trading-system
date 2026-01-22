/**
 * ScavengerValidator - Validates Phase 1 signals against deep edge criteria
 *
 * Requirements: Phase 4 - Deep Edge & Microstructure
 * - Replace "count" validation with "trade size distribution" and "imbalance"
 */

import { IntentSignal } from '../types/index.js';
import { Logger } from '../logging/Logger.js';

interface ScavengerMetadata {
  trade_size_mean?: number;
  trade_size_std_dev?: number;
  order_book_imbalance?: number; // -1 to 1 (0 = balanced)
  [key: string]: unknown;
}

export class ScavengerValidator {
  private logger: Logger;

  // Configuration constraints (could be moved to dynamic config later)
  private readonly MAX_STD_DEV_DEVIATION = 2.0; // Signal size within 2 SD of mean
  private readonly MIN_IMBALANCE_THRESHOLD = 0.3; // Minimum imbalance to justify scalping (0.3 = 30% skew)

  constructor() {
    this.logger = Logger.getInstance('scavenger-validator');
  }

  /**
   * Validate a Scavenger (Phase 1) signal
   */
  public validate(signal: IntentSignal): { valid: boolean; reason?: string } {
    if (signal.phaseId !== 'phase1') {
      return { valid: true }; // Not applicable to other phases
    }

    const metadata = signal.metadata as ScavengerMetadata | undefined;

    if (!metadata) {
      // Soft fail or strict?
      // Phase 4 implies strictness, but let's warn for now if migrating
      return {
        valid: false,
        reason: 'SCAVENGER_VETO: Missing metadata for Deep Edge validation',
      };
    }

    // 1. Trade Size Distribution Check
    // Ensure we are participating in a liquidity regime we understand
    if (
      typeof metadata.trade_size_mean === 'number' &&
      typeof metadata.trade_size_std_dev === 'number'
    ) {
      const size = signal.requestedSize;
      const mean = metadata.trade_size_mean;
      const stdDev = metadata.trade_size_std_dev;

      // Z-Score check
      if (stdDev > 0) {
        const zScore = Math.abs((size - mean) / stdDev);
        if (zScore > this.MAX_STD_DEV_DEVIATION) {
          return {
            valid: false,
            reason: `DISTRIBUTION_VETO: Size ${size} is outlier (Z=${zScore.toFixed(
              2,
            )} > ${this.MAX_STD_DEV_DEVIATION})`,
          };
        }
      }
    }

    // 2. Order Book Imbalance Check
    // Scavenger scalps should generally follow the imbalance
    if (typeof metadata.order_book_imbalance === 'number') {
      const imbalance = metadata.order_book_imbalance;
      const side = signal.side; // BUY or SELL

      // Imbalance: Positive = Buy Pressure, Negative = Sell Pressure
      // If BUY, we want Positive Imbalance
      // If SELL, we want Negative Imbalance

      const isAligned = (side === 'BUY' && imbalance > 0) || (side === 'SELL' && imbalance < 0);

      if (!isAligned) {
        return {
          valid: false,
          reason: `IMBALANCE_VETO: Fighting the flow. Side=${side}, Imbalance=${imbalance}`,
        };
      }

      if (Math.abs(imbalance) < this.MIN_IMBALANCE_THRESHOLD) {
        return {
          valid: false,
          reason: `IMBALANCE_VETO: Signal too weak. |${imbalance}| < ${this.MIN_IMBALANCE_THRESHOLD}`,
        };
      }
    } else {
      return {
        valid: false,
        reason: "SCAVENGER_VETO: Missing 'order_book_imbalance' in metadata",
      };
    }

    return { valid: true };
  }
}
