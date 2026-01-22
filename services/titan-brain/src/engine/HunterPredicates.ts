/**
 * HunterPredicates - Validates Phase 2 (Discretionary/Structural) signals
 *
 * Requirements: Phase 4 - Deep Edge & Microstructure
 * - Enforce structural logic: Liquidation Clusters & Structure Breaks
 */

import { IntentSignal } from '../types/index.js';
import { Logger } from '../logging/Logger.js';

interface HunterMetadata {
  has_liquidation_cluster?: boolean;
  cluster_intensity?: number; // 0-100
  structure_break?: 'BMS_LONG' | 'BMS_SHORT' | 'NONE';
  context_score?: number; // 0-100
  [key: string]: unknown;
}

export class HunterPredicates {
  private logger: Logger;

  // Thresholds
  private readonly MIN_CLUSTER_INTENSITY = 50; // Minimum intensity for a valid cluster setup
  private readonly MIN_CONTEXT_SCORE = 70; // High bar for discretionary structures

  constructor() {
    this.logger = Logger.getInstance('hunter-predicates');
  }

  /**
   * Validate a Hunter (Phase 2) signal
   */
  public validate(signal: IntentSignal): { valid: boolean; reason?: string } {
    if (signal.phaseId !== 'phase2') {
      return { valid: true }; // Not applicable
    }

    const metadata = signal.metadata as HunterMetadata | undefined;

    if (!metadata) {
      // Hunter requires explicit structural justification
      return {
        valid: false,
        reason: 'HUNTER_VETO: Missing metadata for Structural validation',
      };
    }

    // 1. Liquidation Cluster Check
    // If checking for a reversal or acceleration, we imply clusters exist
    if (metadata.has_liquidation_cluster) {
      const intensity = metadata.cluster_intensity || 0;
      if (intensity < this.MIN_CLUSTER_INTENSITY) {
        return {
          valid: false,
          reason: `CLUSTER_VETO: Intensity too low (${intensity} < ${this.MIN_CLUSTER_INTENSITY})`,
        };
      }
    }

    // 2. Structure Break Check (BMS)
    // If trading a breakout or retest, we expect a defined structure break
    if (metadata.structure_break && metadata.structure_break !== 'NONE') {
      const side = signal.side;
      const breakType = metadata.structure_break;

      // Alignment check
      const isAligned =
        (side === 'BUY' && breakType === 'BMS_LONG') ||
        (side === 'SELL' && breakType === 'BMS_SHORT');

      if (!isAligned) {
        return {
          valid: false,
          reason: `STRUCTURE_VETO: Direction mismatch. Side=${side}, Break=${breakType}`,
        };
      }
    }

    // 3. General Context Score
    // Phase 2 is "Sniper" mode - only high quality setups
    if (typeof metadata.context_score === 'number') {
      if (metadata.context_score < this.MIN_CONTEXT_SCORE) {
        return {
          valid: false,
          reason: `QUALITY_VETO: Context score too low (${metadata.context_score} < ${this.MIN_CONTEXT_SCORE})`,
        };
      }
    } else {
      // If no specific structural tags, rely on generic score
      return {
        valid: false,
        reason: 'HUNTER_VETO: Missing context_score or structural evidence',
      };
    }

    return { valid: true };
  }
}
