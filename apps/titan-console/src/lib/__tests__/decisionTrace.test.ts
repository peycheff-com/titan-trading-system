/**
 * Decision Trace Type Contract Tests
 *
 * Verifies that the Decision Trace types satisfy their contracts:
 * - ReasonCode structure
 * - VerificationEvidence structure
 * - RecommendedAction structure
 * - Backward compat: IntentPreviewResult with/without reasons[]
 */

import { describe, it, expect } from 'vitest';
import type {
  ReasonCode,
  ReasonCodeCategory,
  VerificationEvidence,
  RecommendedAction,
  IntentPreviewResult,
  IntentReceipt,
} from '../../hooks/useOperatorIntents';

describe('Decision Trace types', () => {
  // -----------------------------------------------------------------------
  // ReasonCode
  // -----------------------------------------------------------------------

  it('should accept valid ReasonCode with all categories', () => {
    const categories: ReasonCodeCategory[] = [
      'RBAC', 'OCC', 'CAP', 'BREAKER', 'CONFLICT', 'VENUE', 'POSTURE', 'RECONCILE',
    ];

    categories.forEach((code) => {
      const reason: ReasonCode = {
        code,
        key: `${code}_TEST`,
        message: `Test message for ${code}`,
        severity: 'info',
      };
      expect(reason.code).toBe(code);
      expect(reason.key).toBeTruthy();
      expect(reason.message).toBeTruthy();
    });
  });

  it('should accept ReasonCode with metadata', () => {
    const reason: ReasonCode = {
      code: 'CAP',
      key: 'CAP_EXPOSURE_EXCEEDED',
      message: 'Max exposure cap exceeded',
      severity: 'block',
      metadata: { current: 45000, limit: 40000 },
    };
    expect(reason.metadata).toEqual({ current: 45000, limit: 40000 });
  });

  it('should support all severity levels', () => {
    const severities = ['info', 'warning', 'block'] as const;
    severities.forEach((severity) => {
      const reason: ReasonCode = {
        code: 'POSTURE',
        key: 'TEST',
        message: 'test',
        severity,
      };
      expect(reason.severity).toBe(severity);
    });
  });

  // -----------------------------------------------------------------------
  // VerificationEvidence
  // -----------------------------------------------------------------------

  it('should accept valid VerificationEvidence', () => {
    const evidence: VerificationEvidence = {
      source: 'venue:binance',
      timestamp: '2026-02-08T19:30:00.000Z',
      hash_or_seq: 'seq:1834729',
      summary: 'Order fill confirmed',
    };
    expect(evidence.source).toBe('venue:binance');
    expect(evidence.timestamp).toBeTruthy();
    expect(evidence.hash_or_seq).toBeTruthy();
    expect(evidence.summary).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // RecommendedAction
  // -----------------------------------------------------------------------

  it('should accept valid RecommendedAction', () => {
    const action: RecommendedAction = {
      label: 'Flatten all positions',
      command: 'flatten all',
      danger: 'critical',
    };
    expect(action.label).toBeTruthy();
    expect(action.command).toBeTruthy();
    expect(['safe', 'moderate', 'critical']).toContain(action.danger);
  });

  // -----------------------------------------------------------------------
  // IntentPreviewResult backward compat
  // -----------------------------------------------------------------------

  it('should accept IntentPreviewResult without optional reasons/actions', () => {
    const preview: IntentPreviewResult = {
      allowed: true,
      reason: 'All checks passed',
      state_hash_valid: true,
      current_state_hash: 'abc123',
      risk_delta: {
        posture_change: null,
        affected_phases: [],
        affected_symbols: [],
        max_exposure_delta: null,
        throttle_delta: null,
        cap_violations: [],
      },
      blast_radius: { phases: [], venues: [], symbols: [] },
      requires_approval: false,
      rbac_allowed: true,
    };
    expect(preview.reasons).toBeUndefined();
    expect(preview.recommended_actions).toBeUndefined();
  });

  it('should accept IntentPreviewResult with structured reasons and actions', () => {
    const preview: IntentPreviewResult = {
      allowed: false,
      reason: 'Blocked',
      reasons: [
        { code: 'RBAC', key: 'RBAC_ROLE_DENIED', message: 'Not authorized', severity: 'block' },
        { code: 'CAP', key: 'CAP_EXCEEDED', message: 'Cap exceeded', severity: 'block' },
      ],
      state_hash_valid: true,
      current_state_hash: 'abc123',
      risk_delta: {
        posture_change: null,
        affected_phases: [],
        affected_symbols: [],
        max_exposure_delta: null,
        throttle_delta: null,
        cap_violations: ['max_exposure'],
      },
      blast_radius: { phases: ['scavenger'], venues: ['binance'], symbols: ['BTC'] },
      requires_approval: false,
      rbac_allowed: false,
      recommended_actions: [
        { label: 'Check status', command: 'status', danger: 'safe' },
      ],
    };
    expect(preview.reasons).toHaveLength(2);
    expect(preview.recommended_actions).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // IntentReceipt with verification_evidence
  // -----------------------------------------------------------------------

  it('should accept IntentReceipt without verification_evidence', () => {
    const receipt: IntentReceipt = {
      effect: 'Position flattened',
      verification: 'passed',
    };
    expect(receipt.verification_evidence).toBeUndefined();
  });

  it('should accept IntentReceipt with verification_evidence', () => {
    const receipt: IntentReceipt = {
      effect: 'Position flattened',
      verification: 'passed',
      verification_evidence: [
        {
          source: 'venue:binance',
          timestamp: '2026-02-08T19:30:00.000Z',
          hash_or_seq: 'seq:1834729',
          summary: 'Order fill confirmed',
        },
      ],
    };
    expect(receipt.verification_evidence).toHaveLength(1);
    expect(receipt.verification_evidence![0].source).toBe('venue:binance');
  });
});
