import { BrainDecision, IntentSignal, PhaseId } from '../types/index.js';
import { SignalProcessor } from './SignalProcessor.js';
import { Logger } from '@titan/shared';

const logger = Logger.getInstance('signal-router');

/**
 * Phase priority for signal processing
 * Requirement 7.1: P3 > P2 > P1
 */
const PHASE_PRIORITY: Record<PhaseId | 'manual', number> = {
  phase3: 3,
  phase2: 2,
  phase1: 1,
  manual: 4,
};

export class SignalRouter {
  constructor(private readonly signalProcessor: SignalProcessor) {}

  /**
   * Process a single signal by delegating to the processor.
   */
  async processSignal(signal: IntentSignal): Promise<BrainDecision> {
    return this.signalProcessor.processSignal(signal);
  }

  /**
   * Process a batch of signals, sorting them by priority first.
   */
  async processSignals(signals: IntentSignal[]): Promise<BrainDecision[]> {
    // Sort by priority
    const sortedSignals = [...signals].sort((a, b) => {
      const pA = PHASE_PRIORITY[a.phaseId] || 0;
      const pB = PHASE_PRIORITY[b.phaseId] || 0;
      return pB - pA; // Descending
    });

    const decisions: BrainDecision[] = [];
    for (const signal of sortedSignals) {
      // Process sequentially to ensure state consistency
       
      decisions.push(await this.processSignal(signal));
    }

    return decisions;
  }
}
