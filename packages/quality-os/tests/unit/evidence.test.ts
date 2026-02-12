import { hashPack, generateQualityPack, generateCostPack } from '../../src/core/evidence';

describe('hashPack', () => {
  it('produces deterministic hash for same input', () => {
    const data = { b: 2, a: 1 };
    const hash1 = hashPack(data);
    const hash2 = hashPack(data);
    expect(hash1).toBe(hash2);
  });

  it('produces same hash regardless of key order', () => {
    const hash1 = hashPack({ a: 1, b: 2 });
    const hash2 = hashPack({ b: 2, a: 1 });
    expect(hash1).toBe(hash2);
  });

  it('handles null input gracefully', () => {
    expect(() => hashPack(null)).not.toThrow();
    const hash = hashPack(null);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64); // SHA256 hex
  });

  it('handles array input gracefully', () => {
    expect(() => hashPack([1, 2, 3])).not.toThrow();
    const hash = hashPack([1, 2, 3]);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64);
  });

  it('handles string input gracefully', () => {
    expect(() => hashPack('hello')).not.toThrow();
    const hash = hashPack('hello');
    expect(hash.length).toBe(64);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = hashPack({ a: 1 });
    const hash2 = hashPack({ a: 2 });
    expect(hash1).not.toBe(hash2);
  });
});

describe('generateQualityPack', () => {
  it('produces a valid QualityPack', () => {
    const results = [
      { package: 'test-pkg', command: 'npm test', exitCode: 0, duration: 1234 },
    ];
    const pack = generateQualityPack(results, 'plan-hash-123', 0, 0);

    expect(pack.meta.plan_hash).toBe('plan-hash-123');
    expect(pack.results).toHaveLength(1);
    expect(pack.results[0].test_suite).toBe('test-pkg');
    expect(pack.results[0].passed).toBe(1);
    expect(pack.results[0].failed).toBe(0);
    expect(pack.lint_status.passed).toBe(true);
    expect(pack.lint_status.errors).toBe(0);
    expect(pack.determinism_vectors.pack_hash).toBeDefined();
    expect(pack.determinism_vectors.pack_hash.length).toBe(64);
  });

  it('marks lint as failed when errors > 0', () => {
    const pack = generateQualityPack([], 'hash', 3, 5);
    expect(pack.lint_status.passed).toBe(false);
    expect(pack.lint_status.errors).toBe(3);
    expect(pack.lint_status.warnings).toBe(5);
  });

  it('records failed test results correctly', () => {
    const results = [
      { package: 'pkg-a', command: 'npm test', exitCode: 1, duration: 500 },
    ];
    const pack = generateQualityPack(results, 'hash', 0, 0);
    expect(pack.results[0].passed).toBe(0);
    expect(pack.results[0].failed).toBe(1);
  });
});

describe('generateCostPack', () => {
  it('calculates total runtime minutes', () => {
    const results = [
      { package: 'pkg-a', command: 'npm test', exitCode: 0, duration: 60000 },
      { package: 'pkg-b', command: 'npm test', exitCode: 0, duration: 120000 },
    ];
    const costPack = generateCostPack(results, 'Medium');

    expect(costPack.runtime.total_minutes).toBe(3);
    expect(costPack.runtime.jobs).toHaveLength(2);
    expect(costPack.justification.risk_tier).toBe('Medium');
    expect(costPack.justification.skipped_checks).toEqual([]);
  });

  it('skips integration and e2e for Low tier', () => {
    const costPack = generateCostPack([], 'Low');
    expect(costPack.justification.skipped_checks).toEqual(['full-integration', 'e2e']);
  });

  it('records job status correctly', () => {
    const results = [
      { package: 'failing', command: 'npm test', exitCode: 1, duration: 5000 },
    ];
    const costPack = generateCostPack(results, 'High');
    expect(costPack.runtime.jobs[0].status).toBe('failed');
  });
});
