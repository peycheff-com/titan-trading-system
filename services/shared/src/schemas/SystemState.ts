import { z } from 'zod';

/**
 * Global System Health State
 * Defines the operational mode of the entire Titan system.
 */
export enum SystemState {
  /** Normal operation. All trading allowed. */
  Open = 'OPEN',

  /**
   * Soft Halt / Degradation.
   * New risk checks strictly enforced or blocked.
   * Existing positions can be managed/closed.
   * Used for: High Latency, Data Gaps, Minor Drift.
   */
  SoftHalt = 'SOFT_HALT',

  /**
   * Emergency Hard Halt.
   * SYSTEM WIDE STOP.
   * Execution Engine rejects ALL new signals.
   * Manual intervention required to unlock.
   * Used for: Solvency Violation, Insolvency Risk, Security Breach.
   */
  HardHalt = 'HARD_HALT',
}

export const SystemStateSchema = z.nativeEnum(SystemState);

export interface SystemStatus {
  state: SystemState;
  reason?: string;
  timestamp: number;
  operatorId?: string;
}
