/**
 * Reconciliation Types
 * Defines types for the three-way reconciliation system
 */

export type ReconciliationType = 'BRAIN_VS_EXCHANGE' | 'BRAIN_VS_DB';

export type MismatchSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface MismatchDetail {
  symbol: string;
  reason: string;
  brainParam: string | number | undefined;
  exchangeParam: string | number | undefined;
  severity: MismatchSeverity;
}

export interface ReconciliationReport {
  reconciliationId: string;
  type: ReconciliationType;
  timestamp: number;
  exchange: string; // "DATABASE" or actual exchange name
  status: 'MATCH' | 'MISMATCH' | 'ERROR';
  mismatches: MismatchDetail[];
}

export interface TruthConfidence {
  scope: string; // e.g. "BYBIT"
  score: number; // 0.0 - 1.0
  state: 'HIGH' | 'DEGRADED' | 'LOW';
  reasons: string[];
  lastUpdateTs: number;
}

export interface DriftEvent {
  id: string; // UUID
  runId: number;
  scope: string;
  driftType: string;
  severity: MismatchSeverity;
  detectedAt: number;
  details: Record<string, any>;
  recommendedAction?: 'RESYNC' | 'FLATTEN' | 'HALT';
  resolvedAt?: number;
  resolutionMethod?: 'AUTO' | 'MANUAL';
}

export interface ReconciliationStats {
  totalPositions: number;
  matchedPositions: number;
  mismatchedPositions: number;
  ghostPositions: number;
  untrackedPositions: number;
}

export interface ReconciliationRun {
  id?: number; // DB ID
  scope: string;
  startedAt: number;
  finishedAt?: number;
  success: boolean;
  stats?: ReconciliationStats;
}
