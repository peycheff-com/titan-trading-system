import { Tripwire } from '../../types/index.js';
import { TrapStrategy, TrapValidationResult } from './TrapStrategy.js';
import { CVDCalculator } from '../../calculators/CVDCalculator.js';
import { Logger } from '../../logging/Logger.js';

export class CvdValidator implements TrapStrategy {
  constructor(
    private cvdCalculator: CVDCalculator,
    private logger: Logger,
  ) {}

  async validate(
    trap: Tripwire,
    microCVD?: number,
    burstVolume?: number,
  ): Promise<TrapValidationResult> {
    // Micro CVD Check
    if (microCVD !== undefined && burstVolume !== undefined && burstVolume > 0) {
      if (!this.checkMicroCVD(trap, microCVD, burstVolume)) {
        return { isValid: false, reason: 'Micro CVD Mismatch' };
      }
    }

    // Macro CVD Check (Informational mostly, but logic is here)
    const cvd = await this.cvdCalculator.calcCVD(trap.symbol, 60);
    const isCounterFlow =
      (trap.direction === 'LONG' && cvd < 0) || (trap.direction === 'SHORT' && cvd > 0);

    if (!isCounterFlow) {
      this.logger.warn(`⚠️ MACRO CVD INFO: Trend following detected (CVD: ${cvd}).`);
    } else {
      this.logger.info(`✅ MACRO CVD INFO: Counter-flow detected (CVD: ${cvd})`);
    }

    return { isValid: true };
  }

  private checkMicroCVD(trap: Tripwire, microCVD: number, burstVolume: number): boolean {
    const isCVDAligned =
      (trap.direction === 'LONG' && microCVD > 0) || (trap.direction === 'SHORT' && microCVD < 0);

    if (!isCVDAligned) {
      this.logger.warn(
        `🛑 MICRO-CVD VETO: Volume flow opposes trap. Direction: ${trap.direction}, CVD: ${microCVD.toFixed(
          4,
        )}`,
      );
      return false;
    }

    const directionalRatio = Math.abs(microCVD) / burstVolume;
    if (directionalRatio < 0.3) {
      this.logger.warn(
        `🛑 BURST QUALITY VETO: Low directional conviction. Ratio: ${directionalRatio.toFixed(
          2,
        )} < 0.3`,
      );
      return false;
    }

    this.logger.info(
      `✅ MICRO-CVD CONFIRMED: ${microCVD.toFixed(
        4,
      )} aligns with ${trap.direction} (Quality: ${directionalRatio.toFixed(2)})`,
    );
    return true;
  }
}
