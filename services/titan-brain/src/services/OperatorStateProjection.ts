/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
/**
 * OperatorStateProjection
 *
 * Read-model that projects the unified OperatorState from multiple
 * Brain subsystems. Provides a single consistent view for the Control Deck.
 */

import crypto from 'crypto';
import type { OperatorState, PhaseStatus } from '@titan/shared';
import type { TitanBrain } from '../engine/TitanBrain.js';
import type { OperatorIntentService } from './OperatorIntentService.js';

export class OperatorStateProjection {
  constructor(
    private readonly brain: TitanBrain,
    private readonly intentService: OperatorIntentService,
  ) {}

  /**
   * Build the complete OperatorState snapshot.
   */
  getState(): OperatorState {
    const stateManager = this.brain.getStateManager();
    const mode = stateManager.getMode();
    const posture = this.derivePosture(stateManager);
    const phases = this.getPhaseStatuses();
    const breaker = this.getBreakerState();
    const truthConfidence = this.deriveTruthConfidence();
    const lastIntents = this.intentService.getLastIntentSummaries(10);

    const state: OperatorState = {
      mode,
      posture,
      phases,
      truth_confidence: truthConfidence,
      breaker,
      active_incidents: 0, // v1: no incident tracking, stub
      last_intents: lastIntents,
      pending_approvals: this.intentService.getPendingApprovalCount(),
      state_hash: '', // computed below
      last_updated: new Date().toISOString(),
    };

    state.state_hash = this.computeStateHash(state);
    return state;
  }

  /**
   * Compute a deterministic hash of the operator-relevant state.
   */
  computeStateHash(state?: Partial<OperatorState>): string {
    const s = state ?? this.getState();
    const input = [
      s.mode ?? 'paper',
      s.posture ?? 'disarmed',
      s.phases?.phase1?.status ?? 'offline',
      s.phases?.phase2?.status ?? 'offline',
      s.phases?.phase3?.status ?? 'offline',
      s.breaker ?? 'closed',
    ].join(':');

    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
  }

  // =========================================================================
  // Private
  // =========================================================================

  private derivePosture(
    stateManager: ReturnType<TitanBrain['getStateManager']>,
  ): 'disarmed' | 'armed' | 'halted' {
    if (stateManager.isHalted()) return 'halted';
    if (stateManager.isArmed()) return 'armed';
    return 'disarmed';
  }

  private getPhaseStatuses(): { phase1: PhaseStatus; phase2: PhaseStatus; phase3: PhaseStatus } {
    return {
      phase1: this.buildPhaseStatus('phase1', 'Scavenger'),
      phase2: this.buildPhaseStatus('phase2', 'Hunter'),
      phase3: this.buildPhaseStatus('phase3', 'Sentinel'),
    };
  }

  private buildPhaseStatus(id: 'phase1' | 'phase2' | 'phase3', name: string): PhaseStatus {
    return {
      id,
      name,
      status: 'active' as const,
      throttle_pct: 100,
      last_signal_at: null,
    };
  }

  private getBreakerState(): 'closed' | 'open' | 'half-open' {
    try {
      const status = this.brain.getCircuitBreakerStatus();
      if (status?.active) return 'open';
      return 'closed';
    } catch {
      return 'closed';
    }
  }

  private deriveTruthConfidence(): 'high' | 'degraded' | 'unknown' {
    // v1: Stub — assumes high confidence unless we have evidence otherwise
    return 'high';
  }
}
