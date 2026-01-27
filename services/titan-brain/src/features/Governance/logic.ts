import { DefconLevel, SystemHealth } from './types.js';

export interface GovernanceThresholds {
  latencyMax: number;
  errorRateMax: number;
  drawdownCaution: number;
  drawdownDefensive: number;
  drawdownEmergency: number;
}

export const DEFAULT_THRESHOLDS: GovernanceThresholds = {
  latencyMax: 1000,
  errorRateMax: 0.05,
  drawdownCaution: 5.0,
  drawdownDefensive: 10.0,
  drawdownEmergency: 15.0,
};

/**
 * Pure function to calculate Defcon Level
 */
export function calculateDefconLevel(
  health: SystemHealth,
  thresholds: GovernanceThresholds = DEFAULT_THRESHOLDS,
): DefconLevel {
  // 1. Emergency Checks
  if (health.drawdown_pct >= thresholds.drawdownEmergency) {
    return DefconLevel.EMERGENCY;
  }
  if (health.error_rate_5m > 0.2) return DefconLevel.EMERGENCY; // >20% errors hardcoded emergency? Can be parameterized too if needed.

  // 2. Defensive Checks
  if (health.drawdown_pct >= thresholds.drawdownDefensive) {
    return DefconLevel.DEFENSIVE;
  }
  if (health.latency_ms > thresholds.latencyMax) {
    return DefconLevel.DEFENSIVE;
  }
  if (health.error_rate_5m > thresholds.errorRateMax) {
    return DefconLevel.DEFENSIVE;
  }

  // 3. Caution Checks
  if (health.drawdown_pct >= thresholds.drawdownCaution) {
    return DefconLevel.CAUTION;
  }
  if (health.latency_ms > 300) return DefconLevel.CAUTION; // 300ms caution threshold hardcoded

  return DefconLevel.NORMAL;
}

/**
 * Pure function to determine if a new position can be opened
 */
export function canOpenPosition(level: DefconLevel, phaseId: string): boolean {
  if (level === DefconLevel.EMERGENCY) return false;

  if (level === DefconLevel.DEFENSIVE) {
    return phaseId === 'phase3';
  }

  if (level === DefconLevel.CAUTION) {
    return phaseId !== 'phase2';
  }

  return true;
}

/**
 * Pure function to get leverage multiplier
 */
export function getLeverageMultiplier(level: DefconLevel): number {
  switch (level) {
    case DefconLevel.NORMAL:
      return 1.0;
    case DefconLevel.CAUTION:
      return 0.8;
    case DefconLevel.DEFENSIVE:
      return 0.5;
    case DefconLevel.EMERGENCY:
      return 0.0;
    default:
      return 0.0;
  }
}
