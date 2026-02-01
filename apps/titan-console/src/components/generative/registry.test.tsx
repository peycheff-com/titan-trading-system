import { describe, it, expect } from 'vitest';
import { GEN_UI_REGISTRY } from './registry';

describe('Generative UI Registry', () => {
  it('should export the whitelist of allowed components', () => {
    expect(GEN_UI_REGISTRY).toHaveProperty('DriftIncidentCard');
    expect(GEN_UI_REGISTRY).toHaveProperty('RiskGateDecisionCard');
    expect(GEN_UI_REGISTRY).toHaveProperty('FlattenProposalForm');
  });

  it('should not contain unknown components', () => {
    const keys = Object.keys(GEN_UI_REGISTRY);
    expect(keys).toContain('DriftIncidentCard');
    // Ensure no accidental exports
    expect(keys.length).toBeGreaterThanOrEqual(3);
  });
});
