/**
 * Health Status Tracker
 *
 * Tracks the health status of power law metrics based on
 * sample size, fit quality, and staleness.
 */

import type { HealthStatus } from '@titan/shared';

export interface HealthChecks {
  sampleSize: number;
  minSampleSize: number;
  fitQuality: number;
  minFitQuality: number;
  lastUpdateMs: number;
  maxStalenessMs: number;
}

export class HealthTracker {
  private readonly DEFAULT_MIN_SAMPLE = 50;
  private readonly DEFAULT_MIN_FIT_QUALITY = 0.5;
  private readonly DEFAULT_MAX_STALENESS_MS = 60000; // 1 minute

  /**
   * Determine health status from multiple checks
   */
  determineStatus(checks: Partial<HealthChecks>): HealthStatus {
    const {
      sampleSize = 0,
      minSampleSize = this.DEFAULT_MIN_SAMPLE,
      fitQuality = 0,
      minFitQuality = this.DEFAULT_MIN_FIT_QUALITY,
      lastUpdateMs = 0,
      maxStalenessMs = this.DEFAULT_MAX_STALENESS_MS,
    } = checks;

    const now = Date.now();
    const age = now - lastUpdateMs;

    // Priority order: stale > fit_failed > low_sample > ok
    if (lastUpdateMs === 0) {
      return 'unknown';
    }

    if (age > maxStalenessMs) {
      return 'stale';
    }

    if (fitQuality > 0 && fitQuality < minFitQuality) {
      return 'fit_failed';
    }

    if (sampleSize < minSampleSize) {
      return 'low_sample';
    }

    return 'ok';
  }

  /**
   * Check if status is healthy enough for trading decisions
   */
  isHealthy(status: HealthStatus): boolean {
    return status === 'ok';
  }

  /**
   * Check if status requires defensive fallback
   */
  requiresDefensiveFallback(status: HealthStatus): boolean {
    return status !== 'ok' && status !== 'low_sample';
  }
}
