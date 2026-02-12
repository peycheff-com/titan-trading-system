# Module: M14

## Identity
- **Name**: M14 — Quality OS
- **Purpose**: Autonomous Code Quality, Linting, Testing Orchestration
- **Architectural plane**: Operations (Immune System)

## Code Packages (exhaustive)

| File | Lines | Role |
|------|-------|------|
| `src/cli.ts` | 39 | CLI entry point (`commander`-based) |
| `src/commands/plan.ts` | 158 | Risk-classified execution plan generator |
| `src/commands/run.ts` | 285 | Plan executor with 5 evidence pack outputs |
| `src/commands/fix.ts` | 171 | Tiered auto-fix loop (F0/F1/F2) |
| `src/core/evidence.ts` | 261 | Evidence pack generators + SHA256 hashing |
| `src/core/graph-builder.ts` | 125 | Monorepo dependency graph builder |
| `src/core/hygiene-engine.ts` | 156 | Dead code, doc links, architecture checks |
| `src/core/risk-classifier.ts` | 113 | Diff risk classification (High/Medium/Low) |
| `src/core/sota-registry.ts` | 432 | 34 SOTA check definitions, tier-gated |
| `src/schemas/*.json` | 5 files | JSON schemas for evidence packs |
| `package.json` | 30 | Package manifest |
| `tsconfig.json` | 11 | TypeScript config (extends root) |

**Total**: ~1,740 lines of TypeScript + 5 JSON schemas

## Owner Surfaces
- **Human-facing**:
    - CLI: `npm run quality:plan`, `npm run quality:run`, `npm run quality:fix`
- **Machine-facing**:
    - CI/CD Pipelines (reads/writes `artifacts/quality_os/` JSON packs)

## Boundaries
- **Inputs**:
    - Git diff (`git diff --name-only`)
    - Source code (all `package.json`, `Cargo.toml` files)
    - SOTA check commands (34 entries in `sota-registry.ts`)
- **Outputs**:
    - `plan.json` — execution plan
    - `quality-pack.json` — test results + lint status
    - `hygiene-pack.json` — dead code, doc integrity, architecture
    - `supply-chain-pack.json` — npm audit, GitHub Actions pinning
    - `cost-pack.json` — runtime costs, caching
    - `sota-pack.json` — SOTA check results
    - `fix-report.json` — auto-fix results
- **Dependencies** (other modules):
    - Node.js Runtime, `commander`, `chalk`, `glob`
    - External tools: `eslint`, `prettier`, `knip`, `dependency-cruiser`, `npm audit`
- **Non-goals**:
    - Runtime Monitoring
    - Production deployment
