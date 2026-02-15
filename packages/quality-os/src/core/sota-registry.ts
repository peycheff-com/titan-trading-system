/**
 * SOTA Check Registry — canonical source of truth for all quality checks.
 *
 * Maps every existing `sota:*` script to a typed, risk-gated entry that the
 * Quality OS plan/run commands use to build the execution matrix.
 */

export type CheckCategory =
  | 'lint'
  | 'test'
  | 'security'
  | 'architecture'
  | 'docs'
  | 'performance'
  | 'correctness'
  | 'rust'
  | 'supply-chain';

export type RiskGate = 'Low' | 'Medium' | 'High';

export interface SOTACheck {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly category: CheckCategory;
  readonly minTier: RiskGate;
  readonly timeout: number; // ms
  readonly required: boolean; // fail the pipeline if this check fails
  readonly parseOutput?: 'json' | 'exit-code' | 'line-count';
}

/**
 * All SOTA checks from the monorepo, ordered by priority within each tier.
 * Low tier = must always pass. Medium = deeper checks. High = full assurance.
 */
export const SOTA_CHECKS: readonly SOTACheck[] = [
  // ── Low Tier (Always Run) ──────────────────────────────────────────
  {
    id: 'typecheck',
    name: 'TypeScript Type Check',
    command: 'npm run sota:typecheck',
    category: 'lint',
    minTier: 'Low',
    timeout: 120_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'immutability',
    name: 'Immutability Rules',
    command: 'npm run sota:immutability',
    category: 'lint',
    minTier: 'Low',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'circular',
    name: 'Circular Dependency Check',
    command: 'npm run sota:circular',
    category: 'architecture',
    minTier: 'Low',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'dead-code',
    name: 'Dead Code Detection',
    command: 'npm run sota:dead',
    category: 'architecture',
    minTier: 'Low',
    timeout: 120_000,
    required: false, // advisory — dead code needs systematic cleanup, not a blocking gate
    parseOutput: 'exit-code',
  },
  {
    id: 'docs-links',
    name: 'Documentation Link Integrity',
    command: 'npm run sota:docs:links',
    category: 'docs',
    minTier: 'Low',
    timeout: 60_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'secrets',
    name: 'Secret Scanning',
    command: 'npm run sota:secrets',
    category: 'security',
    minTier: 'Low',
    timeout: 30_000,
    required: true,
    parseOutput: 'exit-code',
  },

  // ── Medium Tier (Code Changes) ─────────────────────────────────────
  {
    id: 'architecture',
    name: 'Architecture Enforcement',
    command: 'npm run sota:arch',
    category: 'architecture',
    minTier: 'Medium',
    timeout: 120_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'complexity',
    name: 'Complexity Analysis',
    command: 'npm run sota:complexity',
    category: 'correctness',
    minTier: 'Medium',
    timeout: 60_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'god-class',
    name: 'God Class Detection',
    command: 'npm run sota:god',
    category: 'architecture',
    minTier: 'Medium',
    timeout: 60_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'zombie',
    name: 'Zombie Code Detection',
    command: 'npm run sota:zombie',
    category: 'architecture',
    minTier: 'Medium',
    timeout: 60_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'bundle',
    name: 'Bundle Size Check',
    command: 'npm run sota:bundle',
    category: 'performance',
    minTier: 'Medium',
    timeout: 120_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'correctness',
    name: 'Correctness Tests',
    command: 'npm run sota:correctness',
    category: 'correctness',
    minTier: 'Medium',
    timeout: 180_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'unit-tests',
    name: 'Unit Tests',
    command: 'npm run sota:unit',
    category: 'test',
    minTier: 'Medium',
    timeout: 300_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'edge-validation',
    name: 'Edge Case Validation',
    command: 'npm run sota:edge:validation',
    category: 'correctness',
    minTier: 'Medium',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'contracts-schemas',
    name: 'Contract Schema Validation',
    command: 'npm run sota:contracts:schemas',
    category: 'correctness',
    minTier: 'Medium',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'deps',
    name: 'Dependency Health Check',
    command: 'npm run sota:deps',
    category: 'supply-chain',
    minTier: 'Medium',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'audit',
    name: 'Security Audit',
    command: 'npm run sota:audit',
    category: 'security',
    minTier: 'Medium',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'license',
    name: 'License Compliance',
    command: 'npm run sota:license',
    category: 'supply-chain',
    minTier: 'Medium',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'docs-truth',
    name: 'Documentation Truth Check',
    command: 'npm run sota:docs:truth',
    category: 'docs',
    minTier: 'Medium',
    timeout: 60_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'health-deps',
    name: 'Health Dependencies',
    command: 'npm run sota:health:deps',
    category: 'architecture',
    minTier: 'Medium',
    timeout: 60_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'runbooks',
    name: 'Runbook Compliance',
    command: 'npm run sota:runbooks',
    category: 'docs',
    minTier: 'Medium',
    timeout: 30_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'metrics-probes',
    name: 'Metrics Probe Coverage',
    command: 'npm run sota:metrics:required',
    category: 'correctness',
    minTier: 'Medium',
    timeout: 60_000,
    required: false,
    parseOutput: 'exit-code',
  },

  // ── High Tier (Critical Path / Release) ────────────────────────────
  {
    id: 'rust-fmt',
    name: 'Rust Format Check',
    command: 'npm run sota:rust:fmt',
    category: 'rust',
    minTier: 'High',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'rust-clippy',
    name: 'Rust Clippy Analysis',
    command: 'npm run sota:rust:clippy',
    category: 'rust',
    minTier: 'High',
    timeout: 180_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'rust-test',
    name: 'Rust Unit Tests',
    command: 'npm run sota:rust:test',
    category: 'rust',
    minTier: 'High',
    timeout: 300_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'api-drift',
    name: 'API Drift Detection',
    command: 'npm run sota:api',
    category: 'correctness',
    minTier: 'High',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'replay-determinism',
    name: 'Replay Determinism Verification',
    command: 'npm run sota:replay:determinism',
    category: 'correctness',
    minTier: 'High',
    timeout: 120_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'migrations-safety',
    name: 'Migration Safety Check',
    command: 'npm run sota:migrations:safety',
    category: 'security',
    minTier: 'High',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'mutation',
    name: 'Mutation Testing (Stryker)',
    command: 'npm run sota:mutation',
    category: 'test',
    minTier: 'High',
    timeout: 600_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'perf',
    name: 'Performance Benchmarks',
    command: 'npm run sota:perf',
    category: 'performance',
    minTier: 'High',
    timeout: 120_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'e2e',
    name: 'End-to-End Tests (Playwright)',
    command: 'npm run sota:e2e',
    category: 'test',
    minTier: 'High',
    timeout: 600_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'secrets-deep',
    name: 'Deep Secret Scanning',
    command: 'npm run sota:secrets:deep',
    category: 'security',
    minTier: 'High',
    timeout: 120_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'db-migrations',
    name: 'Database Migration Check',
    command: 'npm run sota:db',
    category: 'security',
    minTier: 'High',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
  {
    id: 'impact',
    name: 'Impact Analysis',
    command: 'npm run sota:impact',
    category: 'architecture',
    minTier: 'High',
    timeout: 60_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'flakiness',
    name: 'Flakiness Detection',
    command: 'npm run sota:flake',
    category: 'test',
    minTier: 'High',
    timeout: 300_000,
    required: false,
    parseOutput: 'exit-code',
  },
  {
    id: 'provenance',
    name: 'Build Provenance',
    command: 'npm run sota:provenance',
    category: 'supply-chain',
    minTier: 'High',
    timeout: 60_000,
    required: true,
    parseOutput: 'exit-code',
  },
] as const;

const TIER_PRIORITY: Record<RiskGate, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

/**
 * Returns all checks that should run for a given risk tier.
 * Higher tiers include all lower-tier checks.
 */
export const getChecksForTier = (tier: RiskGate): readonly SOTACheck[] =>
  SOTA_CHECKS.filter((check) => TIER_PRIORITY[check.minTier] <= TIER_PRIORITY[tier]);

/**
 * Returns only required checks for a given risk tier.
 */
export const getRequiredChecksForTier = (tier: RiskGate): readonly SOTACheck[] =>
  getChecksForTier(tier).filter((check) => check.required);

/**
 * Returns checks grouped by category.
 */
export const groupByCategory = (
  checks: readonly SOTACheck[],
): ReadonlyMap<CheckCategory, readonly SOTACheck[]> => {
  const categories = [...new Set(checks.map((c) => c.category))];
  return new Map(categories.map((cat) => [cat, checks.filter((c) => c.category === cat)]));
};
