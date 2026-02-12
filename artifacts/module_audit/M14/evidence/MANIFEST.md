# Evidence Manifest - M14 Quality OS

> Verification of SOTA compliance via Code and Configuration.

## 1. CLI Entry Point
- **Invariant**: CLI uses `commander` for structured args (I-14-03).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/cli.ts`
- **Snippet**:
```typescript
// Line 8
const program = new Command();
program.name('quality-os').description('Titan Autonomous Quality OS CLI');
```
- **Status**: ✅ Verified

## 2. Plan Generation
- **Invariant**: PlanCommand analyzes Git diffs (I-14-01).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/commands/plan.ts`
- **Snippet**:
```typescript
// Line 44
const diffOutput = execSync(`git diff --name-only ${options.base} ${options.head}`, {
  encoding: 'utf-8',
});
```
- **Status**: ✅ Verified

## 3. Autonomous Repair
- **Invariant**: FixCommand applies patches with tiered approval (I-14-08).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/commands/fix.ts`
- **Snippet**:
```typescript
// Lines 14-29 (F0: automatic)
const runLintFix = (rootDir: string, dryRun: boolean): readonly FixAction[] => {
  // ...
  execSync('npx eslint src --ext .ts --fix', { cwd: rootDir, ... });
};
```
- **Status**: ✅ Verified

## 4. Risk Classification
- **Invariant**: DiffRiskClassifier auto-escalates critical paths (I-14-06).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/core/risk-classifier.ts`
- **Snippet**:
```typescript
// Lines 56-63
if (nodeId.startsWith('services/titan-execution-rs') ||
    nodeId.startsWith('packages/shared')) {
  return { tier: RiskTier.High, reasons: [...] };
}
```
- **Status**: ✅ Verified

## 5. Evidence Determinism
- **Invariant**: SHA256 hashing produces deterministic pack hashes (I-14-05).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/core/evidence.ts`
- **Snippet**:
```typescript
// Lines 9-12
export const hashPack = (data: unknown): string => {
  const canonical = JSON.stringify(data, Object.keys(data as object).sort(), 0);
  return crypto.createHash('sha256').update(canonical).digest('hex');
};
```
- **Status**: ✅ Verified

## 6. SOTA Registry Completeness
- **Invariant**: All 34 SOTA checks defined in single source of truth (I-14-10).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/core/sota-registry.ts`
- **Snippet**:
```typescript
// Lines 36-402
export const SOTA_CHECKS: readonly SOTACheck[] = [
  // 6 Low-tier checks (always run)
  // 22 Medium-tier checks (code changes)
  // 6 High-tier checks (critical path / release)
] as const;
```
- **Status**: ✅ Verified (34 checks: 6 Low + 22 Medium + 6 High)

## 7. Monotonic Tier Inclusion
- **Invariant**: Higher tiers include all lower-tier checks (I-14-04).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/core/sota-registry.ts`
- **Snippet**:
```typescript
// Lines 414-415
export const getChecksForTier = (tier: RiskGate): readonly SOTACheck[] =>
  SOTA_CHECKS.filter((check) => TIER_PRIORITY[check.minTier] <= TIER_PRIORITY[tier]);
```
- **Status**: ✅ Verified

## 8. Transitive Dependency Analysis
- **Invariant**: BFS closure captures all impacted nodes (I-14-07).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/core/risk-classifier.ts`
- **Snippet**:
```typescript
// Lines 27-45
const expandImpacts = (
  currentImpacts: ReadonlySet<string>,
  currentReasons: readonly string[],
): { impacts: ReadonlySet<string>; reasons: readonly string[] } => {
  // Recursive expansion until no new dependents found
};
```
- **Status**: ✅ Verified

## 9. Quality Gate Fail-Closed
- **Invariant**: Non-zero exit on any required check failure (I-14-09).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/commands/run.ts`
- **Snippet**:
```typescript
// Lines 202-207
if (totalFailed > 0) {
  console.log(chalk.red(`💥 QUALITY GATE FAILED: ${totalFailed} required check(s) failed.`));
  process.exit(1);
}
```
- **Status**: ✅ Verified

## 10. Evidence Pack Generation
- **Invariant**: RunCommand produces 5 evidence packs (I-14-02).
- **Evidence Type**: Code Reference
- **Location**: `packages/quality-os/src/commands/run.ts`
- **Snippet**:
```typescript
// Lines 176-182
const packs = [
  { name: 'quality-pack.json', data: qualityPack },
  { name: 'hygiene-pack.json', data: hygienePack },
  { name: 'supply-chain-pack.json', data: supplyChainPack },
  { name: 'cost-pack.json', data: costPack },
  { name: 'sota-pack.json', data: signedSotaPack },
] as const;
```
- **Status**: ✅ Verified
