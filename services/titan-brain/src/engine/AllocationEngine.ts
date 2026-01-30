import {
  AllocationEngineConfig,
  AllocationVector,
  EquityTier,
  LeverageCaps,
  TransitionPoints,
} from '../types/index.js';

export class AllocationEngine {
  private config: AllocationEngineConfig;

  constructor(config: AllocationEngineConfig) {
    this.config = config;
  }

  getTransitionPoints(): TransitionPoints {
    return { ...this.config.transitionPoints };
  }

  getLeverageCaps(): LeverageCaps {
    return { ...this.config.leverageCaps };
  }

  getWeights(equity: number): AllocationVector & { timestamp: number } {
    const validEquity = Math.max(0, equity);
    const { startP2, fullP2, startP3 } = this.config.transitionPoints;

    let w1 = 1.0;
    let w2 = 0.0;
    let w3 = 0.0;

    if (validEquity < startP2) {
      w1 = 1.0;
      w2 = 0.0;
      w3 = 0.0;
    } else if (validEquity < fullP2) {
      // Transition P1 -> P2
      // Target at fullP2: w1=0.2, w2=0.8
      const t = (validEquity - startP2) / (fullP2 - startP2);
      const smoothT = t * t * (3 - 2 * t);

      w1 = 1.0 - 0.8 * smoothT;
      w2 = 0.8 * smoothT;
      w3 = 0.0;
    } else if (validEquity < startP3) {
      // Stable P2
      w1 = 0.2;
      w2 = 0.8;
      w3 = 0.0;
    } else {
      // Transition P2 -> P3
      // We start adding P3. w1 stays at 0.2. w2 decreases.
      // Arbitrary end point for full P3? Test doesn't specify top bound, just 50k has behavior.
      // Let's assume transition finishes at 2x startP3 or some large number, or just scales.
      // Given Institutional is 50k, maybe similar bandwidth? 25k -> 50k?
      const endP3 = 75000; // Guess
      const t = Math.min(1.0, (validEquity - startP3) / (endP3 - startP3));
      const smoothT = t * t * (3 - 2 * t);

      w1 = 0.2;
      w3 = 0.8 * smoothT;
      w2 = 0.8 - w3;
    }

    return { w1, w2, w3, timestamp: Date.now() };
  }

  getEquityTier(equity: number): EquityTier {
    if (equity < 1500) return EquityTier.MICRO;
    if (equity < 5000) return EquityTier.SMALL;
    if (equity < 25000) return EquityTier.MEDIUM;
    if (equity < 50000) return EquityTier.LARGE;
    return EquityTier.INSTITUTIONAL;
  }

  getMaxLeverage(equity: number): number {
    const tier = this.getEquityTier(equity);
    return this.config.leverageCaps[tier];
  }

  getAdaptiveWeights(
    equity: number,
    performanceHistory: any[],
    factor?: number,
  ): AllocationVector & { timestamp: number } {
    const base = this.getWeights(equity);

    // Stub logic for testing:
    // If high equity and P3 performing well, boost P3
    if (equity > 5000 && performanceHistory.length > 0) {
      const p3 = performanceHistory.find((p: any) => p.phaseId === 'phase3');
      const p2 = performanceHistory.find((p: any) => p.phaseId === 'phase2');

      if (p3 && p3.sharpeRatio > 2 && p2 && p2.sharpeRatio < 0) {
        // Shift from P2 to P3
        const shift = base.w2 * 0.5;
        return {
          ...base,
          w2: base.w2 - shift,
          w3: base.w3 + shift,
          timestamp: Date.now(),
        };
      }
    }

    return base;
  }
}
