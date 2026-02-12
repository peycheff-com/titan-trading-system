# M14 — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] **Invariants Verified in Code** (`cli.ts`, `sota-registry.ts`, `evidence.ts`)
- [x] All 9 TypeScript files use `readonly` types and functional patterns

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Autonomous Repair" | `FixCommand` implements F0/F1/F2 tiered fixes | ✅ |
| "Evidence Generation" | `RunCommand` produces 5 evidence packs (quality, hygiene, supply-chain, cost, SOTA) | ✅ |
| "Git Integration" | `PlanCommand` uses `git diff --name-only` for changed files | ✅ |
| "Risk Classification" | `DiffRiskClassifier` classifies into High/Medium/Low with transitive closure | ✅ |
| "SOTA Registry" | 34 checks defined in `sota-registry.ts`, tier-gated | ✅ |
| "Graph Builder" | `RepoGraphBuilder` scans `package.json` + `Cargo.toml` for dependency graph | ✅ |
| "Supply Chain Audit" | Checks GitHub Actions pinning + `npm audit` | ✅ |
| "Determinism Vectors" | SHA256 hashing via `hashPack()` in all evidence packs | ✅ |
| "QualityKernel" | Concept in CLI output, not a distinct class — CLI dispatches to commands | ℹ️ Naming only |

## Code Quality Assessment
- **Type safety**: Strong — `readonly` interfaces, typed catches, no `any`
- **Error handling**: All `execSync`/`execAsync` calls wrapped in try/catch
- **Patterns**: Functional (immutable data, `reduce`, `flatMap`), no mutation
- **Dependencies**: Minimal (commander, chalk, glob) — appropriate for CLI tool

## Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |
