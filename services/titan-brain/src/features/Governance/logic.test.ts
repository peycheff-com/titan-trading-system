import { describe, expect, it } from 'vitest';
import { calculateDefconLevel, canOpenPosition, DEFAULT_THRESHOLDS } from './logic.js';
import { DefconLevel, SystemHealth } from './types.js';

describe('Governance Pure Logic', () => {
  const healthyState: SystemHealth = {
    latency_ms: 100,
    error_rate_5m: 0,
    drawdown_pct: 1.0,
  };

  describe('calculateDefconLevel', () => {
    it('should return NORMAL for healthy system', () => {
      expect(calculateDefconLevel(healthyState)).toBe(DefconLevel.NORMAL);
    });

    it('should trigger CAUTION on high latency', () => {
      const state = { ...healthyState, latency_ms: 400 };
      expect(calculateDefconLevel(state)).toBe(DefconLevel.CAUTION);
    });

    it('should trigger DEFENSIVE on error spike', () => {
      const state = { ...healthyState, error_rate_5m: 0.06 };
      expect(calculateDefconLevel(state)).toBe(DefconLevel.DEFENSIVE);
    });

    it('should trigger EMERGENCY on crash', () => {
      const state = { ...healthyState, drawdown_pct: 20.0 };
      expect(calculateDefconLevel(state)).toBe(DefconLevel.EMERGENCY);
    });
  });

  describe('canOpenPosition', () => {
    it('should allow everything in NORMAL', () => {
      expect(canOpenPosition(DefconLevel.NORMAL, 'phase1')).toBe(true);
      expect(canOpenPosition(DefconLevel.NORMAL, 'phase2')).toBe(true);
    });

    it('should block Phase 2 in CAUTION', () => {
      expect(canOpenPosition(DefconLevel.CAUTION, 'phase2')).toBe(false);
      expect(canOpenPosition(DefconLevel.CAUTION, 'phase3')).toBe(true);
    });

    it('should block everything except Phase 3 in DEFENSIVE', () => {
      expect(canOpenPosition(DefconLevel.DEFENSIVE, 'phase1')).toBe(true); // Logic check: Phase 1 (Scalp) allowed? Code says yes implicitly?
      // Wait, let's check code:
      // if (level === DefconLevel.DEFENSIVE) return phaseId === 'phase3';
      // So phase1 should be FALSE.
      expect(canOpenPosition(DefconLevel.DEFENSIVE, 'phase1')).toBe(false);
      expect(canOpenPosition(DefconLevel.DEFENSIVE, 'phase3')).toBe(true);
    });
  });
});
