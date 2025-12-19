/**
 * Allocation Types for Titan Brain
 * Defines types for capital allocation across phases
 */

/**
 * Equity tier classification based on account size
 */
export enum EquityTier {
  MICRO = 'MICRO',           // < $1,500
  SMALL = 'SMALL',           // $1,500 - $5,000
  MEDIUM = 'MEDIUM',         // $5,000 - $25,000
  LARGE = 'LARGE',           // $25,000 - $50,000
  INSTITUTIONAL = 'INSTITUTIONAL' // > $50,000
}

/**
 * Allocation vector representing capital distribution across phases
 */
export interface AllocationVector {
  /** Phase 1 (Scavenger) weight (0-1) */
  w1: number;
  /** Phase 2 (Hunter) weight (0-1) */
  w2: number;
  /** Phase 3 (Sentinel) weight (0-1) */
  w3: number;
  /** Timestamp when allocation was calculated */
  timestamp: number;
}

/**
 * Allocation history record for persistence
 */
export interface AllocationRecord {
  id?: number;
  timestamp: number;
  equity: number;
  w1: number;
  w2: number;
  w3: number;
  tier: EquityTier;
}

/**
 * Leverage caps by equity tier
 */
export interface LeverageCaps {
  [EquityTier.MICRO]: number;
  [EquityTier.SMALL]: number;
  [EquityTier.MEDIUM]: number;
  [EquityTier.LARGE]: number;
  [EquityTier.INSTITUTIONAL]: number;
}

/**
 * Transition points for sigmoid allocation transitions
 */
export interface TransitionPoints {
  /** Equity level where Phase 2 starts receiving allocation */
  startP2: number;
  /** Equity level where Phase 2 reaches full allocation */
  fullP2: number;
  /** Equity level where Phase 3 starts receiving allocation */
  startP3: number;
}

/**
 * Allocation engine configuration
 */
export interface AllocationEngineConfig {
  transitionPoints: TransitionPoints;
  leverageCaps: LeverageCaps;
}
