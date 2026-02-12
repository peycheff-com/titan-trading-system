import {
  SOTA_CHECKS,
  getChecksForTier,
  getRequiredChecksForTier,
  groupByCategory,
  type RiskGate,
} from '../../src/core/sota-registry';

describe('SOTA_CHECKS registry', () => {
  it('has 34 checks defined', () => {
    expect(SOTA_CHECKS).toHaveLength(36);
  });

  it('every check has required fields', () => {
    for (const check of SOTA_CHECKS) {
      expect(check.id).toBeTruthy();
      expect(check.name).toBeTruthy();
      expect(check.command).toBeTruthy();
      expect(check.category).toBeTruthy();
      expect(['Low', 'Medium', 'High']).toContain(check.minTier);
      expect(check.timeout).toBeGreaterThan(0);
      expect(typeof check.required).toBe('boolean');
    }
  });

  it('has unique IDs', () => {
    const ids = SOTA_CHECKS.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('getChecksForTier', () => {
  it('Low tier returns only Low-min checks', () => {
    const checks = getChecksForTier('Low');
    expect(checks.every((c) => c.minTier === 'Low')).toBe(true);
  });

  it('Medium tier includes Low and Medium checks', () => {
    const checks = getChecksForTier('Medium');
    const tiers = new Set(checks.map((c) => c.minTier));
    expect(tiers.has('Low')).toBe(true);
    expect(tiers.has('Medium')).toBe(true);
    expect(tiers.has('High')).toBe(false);
  });

  it('High tier includes all checks', () => {
    const checks = getChecksForTier('High');
    expect(checks.length).toBe(SOTA_CHECKS.length);
  });

  it('tier inclusion is monotonic (High ⊃ Medium ⊃ Low)', () => {
    const low = getChecksForTier('Low');
    const medium = getChecksForTier('Medium');
    const high = getChecksForTier('High');
    expect(low.length).toBeLessThanOrEqual(medium.length);
    expect(medium.length).toBeLessThanOrEqual(high.length);
  });
});

describe('getRequiredChecksForTier', () => {
  it('returns only required checks', () => {
    const checks = getRequiredChecksForTier('High');
    expect(checks.every((c) => c.required)).toBe(true);
  });

  it('required count is less than or equal to total', () => {
    const tiers: RiskGate[] = ['Low', 'Medium', 'High'];
    for (const tier of tiers) {
      const all = getChecksForTier(tier);
      const required = getRequiredChecksForTier(tier);
      expect(required.length).toBeLessThanOrEqual(all.length);
    }
  });
});

describe('groupByCategory', () => {
  it('groups checks by category', () => {
    const checks = getChecksForTier('High');
    const grouped = groupByCategory(checks);

    expect(grouped.size).toBeGreaterThan(0);

    // Every check should appear in exactly one category
    let total = 0;
    grouped.forEach((categoryChecks) => {
      total += categoryChecks.length;
    });
    expect(total).toBe(checks.length);
  });

  it('all checks in a group share the same category', () => {
    const grouped = groupByCategory(SOTA_CHECKS);
    grouped.forEach((checks, category) => {
      expect(checks.every((c) => c.category === category)).toBe(true);
    });
  });
});
