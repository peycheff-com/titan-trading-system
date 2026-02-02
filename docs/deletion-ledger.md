# Deletion Ledger - Repo Hygiene Audit

> **Branch**: `chore/repo-hygiene-sota`
> **Date**: 2026-02-02

## Summary

| Category | Count | Lines Removed |
|----------|-------|---------------|
| Backup configs | 7 | ~200 |
| Compiled artifacts (scripts/) | 12 | ~350 |
| Compiled artifacts (tests/) | 12 | ~360 |
| Unused brain modules | 14 | ~2100 |
| Empty directory | 1 | - |
| Unused dependencies | 12 | - |
| **Total** | **~58** | **~3000** |

---

## Detailed Ledger

### Backup Config Files

| Path | Why Redundant | Risk | Mitigation |
|------|---------------|------|------------|
| `config/brain.config.json.backup` | Git history preserves versions | None | Recoverable from git |
| `config/disaster-recovery.config.json.backup` | Same | None | Same |
| `config/disaster-recovery-testing.config.json.backup` | Same | None | Same |
| `config/hot-standby.config.json.backup` | Same | None | Same |
| `config/infrastructure.config.json.backup` | Same | None | Same |
| `config/phase1.config.json.backup` | Same | None | Same |
| `config/titan-brain.config.json.backup` | Same | None | Same |

### Compiled TypeScript Artifacts

| Path Pattern | Why Redundant | Notes |
|--------------|---------------|-------|
| `scripts/*.js`, `*.d.ts`, `*.map` | Build output, regenerated on `tsc` | Added to .gitignore |
| `tests/correctness/*.js`, etc. | Same | Same |
| `tests/perf/*.js`, etc. | Same | Same |

### Unused Brain Modules (knip-identified)

| Path | Why Redundant | Referenced By |
|------|---------------|---------------|
| `services/titan-brain/src/services/active-inference/` | Experimental, not wired | None |
| `services/titan-brain/src/services/forecasting/` | Same | None |
| `services/titan-brain/src/services/vision/` | Same | None |
| `services/titan-brain/src/cache/CachedAllocationEngine.ts` | Unused wrapper | None |
| `services/titan-brain/src/cache/CachedPerformanceTracker.ts` | Same | None |
| `services/titan-brain/src/cache/CachedRiskGuardian.ts` | Same | None |
| `services/titan-brain/src/scripts/test_canary_logic.ts` | Unused test script | None |
| `services/titan-brain/src/scripts/verify_*.ts` (4 files) | Unused verification | None |
| `services/titan-ai-quant/src/debug-weaviate.ts` | Debug file | None |

### Empty Directory

| Path | Why Redundant | Replacement |
|------|---------------|-------------|
| `services/titan-console/` | Only contained node_modules symlink | `apps/titan-console` |

### Unused Dependencies (root package.json)

| Package | Type | Why Unused |
|---------|------|------------|
| `vite` | dependency | Console has its own |
| `weaviate-client` | dependency | debug-weaviate.ts removed |
| `@stryker-mutator/typescript-checker` | devDep | Not referenced |
| `axios` | devDep | Not referenced at root |
| `cross-env` | devDep | Not referenced |
| `dependency-cruiser` | devDep | Not referenced |
| `license-checker` | devDep | Not referenced |
| `madge` | devDep | Not referenced |
| `tinybench` | devDep | Not referenced |
| `ws` | devDep | Not referenced at root |
