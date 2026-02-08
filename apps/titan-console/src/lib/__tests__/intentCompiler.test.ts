/**
 * Intent Compiler Tests
 *
 * Covers pattern matching, RBAC, danger classification, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { compileNLToIntent } from '../intentCompiler';

describe('intentCompiler', () => {
  // -----------------------------------------------------------------------
  // Pattern matching
  // -----------------------------------------------------------------------

  it('should match "arm"', () => {
    const result = compileNLToIntent('arm', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent?.type).toBe('ARM');
    expect(result.intent?.dangerLevel).toBe('moderate');
  });

  it('should match "arm the system"', () => {
    const result = compileNLToIntent('arm the system', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent?.type).toBe('ARM');
  });

  it('should match "disarm"', () => {
    const result = compileNLToIntent('disarm', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent?.type).toBe('DISARM');
    expect(result.intent?.dangerLevel).toBe('safe');
  });

  it('should match "set mode paper"', () => {
    const result = compileNLToIntent('set mode paper', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent?.type).toBe('SET_MODE');
    expect(result.intent?.params).toEqual({ mode: 'paper' });
  });

  it('should match "throttle scavenger to 50%"', () => {
    const result = compileNLToIntent('throttle scavenger to 50%', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent?.type).toBe('THROTTLE_PHASE');
    expect(result.intent?.params).toEqual({ phase: 'scavenger', pct: 50 });
  });

  it('should match "throttle hunter 75"', () => {
    const result = compileNLToIntent('throttle hunter 75', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent?.params).toEqual({ phase: 'hunter', pct: 75 });
  });

  it('should match "reconcile"', () => {
    const result = compileNLToIntent('reconcile', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent?.type).toBe('RUN_RECONCILE');
    expect(result.intent?.dangerLevel).toBe('safe');
  });

  it('should match "flatten all" with risk_owner role', () => {
    const result = compileNLToIntent('flatten all', 'risk_owner');
    expect(result.matched).toBe(true);
    expect(result.intent?.type).toBe('FLATTEN');
    expect(result.intent?.dangerLevel).toBe('critical');
  });

  it('should match "flatten BTC" with risk_owner role', () => {
    const result = compileNLToIntent('flatten BTC', 'risk_owner');
    expect(result.matched).toBe(true);
    expect(result.intent?.params).toEqual({ symbol: 'BTC' });
  });

  // -----------------------------------------------------------------------
  // RBAC
  // -----------------------------------------------------------------------

  it('should reject FLATTEN for operator role', () => {
    const result = compileNLToIntent('flatten all', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent).toBeUndefined();
    expect(result.error).toContain('operator');
    expect(result.error).toContain('FLATTEN');
  });

  it('should reject OVERRIDE_RISK for operator role', () => {
    const result = compileNLToIntent('override risk maxDrawdown 10', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent).toBeUndefined();
    expect(result.error).toContain('OVERRIDE_RISK');
  });

  it('should reject all intents for observer role', () => {
    const result = compileNLToIntent('arm', 'observer');
    expect(result.matched).toBe(true);
    expect(result.intent).toBeUndefined();
    expect(result.error).toContain('observer');
  });

  // -----------------------------------------------------------------------
  // No match / edge cases
  // -----------------------------------------------------------------------

  it('should not match empty input', () => {
    const result = compileNLToIntent('', 'operator');
    expect(result.matched).toBe(false);
  });

  it('should not match random text', () => {
    const result = compileNLToIntent('how is the weather', 'operator');
    expect(result.matched).toBe(false);
  });

  it('should be case insensitive', () => {
    const result = compileNLToIntent('ARM THE SYSTEM', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent?.type).toBe('ARM');
  });

  it('should trim whitespace', () => {
    const result = compileNLToIntent('  arm  ', 'operator');
    expect(result.matched).toBe(true);
    expect(result.intent?.type).toBe('ARM');
  });

  it('should generate a UUID for each intent', () => {
    const result1 = compileNLToIntent('arm', 'operator');
    const result2 = compileNLToIntent('arm', 'operator');
    expect(result1.intent?.id).toBeDefined();
    expect(result2.intent?.id).toBeDefined();
    expect(result1.intent?.id).not.toBe(result2.intent?.id);
  });
});
