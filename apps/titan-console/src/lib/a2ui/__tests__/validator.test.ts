/**
 * A2UI Validator Tests
 *
 * Validates schema enforcement, unknown-field rejection,
 * component-specific prop validation, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { validateA2UISpec, type ValidationResult } from '../validator';
import { A2UI_SPEC_VERSION } from '../schema';

// ---------------------------------------------------------------------------
// Helper: Build a minimal valid spec
// ---------------------------------------------------------------------------

function validSpec(overrides: Record<string, unknown> = {}) {
  return {
    uiSpecVersion: A2UI_SPEC_VERSION,
    model: 'titan-brain-v1',
    components: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Root-level validation
// ---------------------------------------------------------------------------

describe('A2UI Validator — root level', () => {
  it('accepts a minimal valid spec', () => {
    const result = validateA2UISpec(validSpec());
    expect(result.valid).toBe(true);
  });

  it('rejects non-object input', () => {
    const result = validateA2UISpec('not-an-object');
    expect(result.valid).toBe(false);
    if (!result.valid) expect((result as { valid: false; errors: string[] }).errors).toContain('Root: must be an object');
  });

  it('rejects wrong version', () => {
    const result = validateA2UISpec(validSpec({ uiSpecVersion: '2.0' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect((result as { valid: false; errors: string[] }).errors[0]).toContain('uiSpecVersion');
  });

  it('rejects missing model', () => {
    const result = validateA2UISpec(validSpec({ model: undefined }));
    expect(result.valid).toBe(false);
  });

  it('rejects missing components', () => {
    const result = validateA2UISpec(validSpec({ components: undefined }));
    expect(result.valid).toBe(false);
  });

  it('rejects unknown root-level fields', () => {
    const result = validateA2UISpec(validSpec({ extraField: 'bad' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect((result as { valid: false; errors: string[] }).errors[0]).toContain('unknown field "extraField"');
  });

  it('accepts valid layout values', () => {
    expect(validateA2UISpec(validSpec({ layout: 'stack' })).valid).toBe(true);
    expect(validateA2UISpec(validSpec({ layout: 'grid-2' })).valid).toBe(true);
  });

  it('rejects invalid layout values', () => {
    const result = validateA2UISpec(validSpec({ layout: 'horizontal' }));
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Component validation
// ---------------------------------------------------------------------------

describe('A2UI Validator — components', () => {
  it('rejects unknown component types', () => {
    const result = validateA2UISpec(
      validSpec({
        components: [{ type: 'FancyWidget', props: {} }],
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect((result as { valid: false; errors: string[] }).errors[0]).toContain('unknown component type');
  });

  it('rejects components without type', () => {
    const result = validateA2UISpec(
      validSpec({
        components: [{ props: {} }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it('rejects components without props', () => {
    const result = validateA2UISpec(
      validSpec({
        components: [{ type: 'Text' }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it('rejects unknown fields on components', () => {
    const result = validateA2UISpec(
      validSpec({
        components: [{ type: 'Text', props: { content: 'hello' }, extra: 1 }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it('validates Text component props', () => {
    const good = validateA2UISpec(
      validSpec({ components: [{ type: 'Text', props: { content: 'hi' } }] }),
    );
    expect(good.valid).toBe(true);

    const bad = validateA2UISpec(
      validSpec({ components: [{ type: 'Text', props: { content: 123 } }] }),
    );
    expect(bad.valid).toBe(false);
  });

  it('validates ActionCard component props', () => {
    const good = validateA2UISpec(
      validSpec({
        components: [
          {
            type: 'ActionCard',
            props: {
              intentType: 'THROTTLE',
              description: 'Throttle scavenger',
              dangerLevel: 'moderate',
              params: { phase: 'scavenger', value: 50 },
            },
          },
        ],
      }),
    );
    expect(good.valid).toBe(true);
  });

  it('validates RiskDelta component props', () => {
    const result = validateA2UISpec(
      validSpec({
        components: [
          {
            type: 'RiskDelta',
            props: {
              affectedPhases: ['scavenger'],
              affectedSymbols: ['BTC-USD'],
              capViolations: [],
            },
          },
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('validates DecisionTrace component props', () => {
    const result = validateA2UISpec(
      validSpec({
        components: [
          {
            type: 'DecisionTrace',
            props: {
              decisionId: 'dec-123',
              model: 'titan-brain-v1',
              reasoning: 'Market conditions favorable',
              confidence: 0.87,
              factors: [{ name: 'volatility', weight: 0.5, value: 'low' }],
            },
          },
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Actions validation
// ---------------------------------------------------------------------------

describe('A2UI Validator — actions', () => {
  it('accepts valid actions', () => {
    const result = validateA2UISpec(
      validSpec({
        actions: [
          {
            label: 'Approve throttle',
            danger: 'moderate',
            intentDraft: {
              type: 'THROTTLE',
              description: 'Throttle scavenger to 50%',
              params: { phase: 'scavenger', value: 50 },
              dangerLevel: 'moderate',
            },
          },
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects actions with invalid danger level', () => {
    const result = validateA2UISpec(
      validSpec({
        actions: [
          {
            label: 'Do thing',
            danger: 'unknown',
            intentDraft: {
              type: 'TEST',
              description: 'Test',
              params: {},
              dangerLevel: 'safe',
            },
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it('rejects actions without intentDraft', () => {
    const result = validateA2UISpec(
      validSpec({
        actions: [{ label: 'Do thing', danger: 'safe' }],
      }),
    );
    expect(result.valid).toBe(false);
  });
});
