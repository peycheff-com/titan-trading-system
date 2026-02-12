# M14 — Invariants

> Cross-reference system invariants I-01 through I-20.

## Control Loop (Cybernetics Lens)

### Essential Variables
- **Quality Score**: Aggregate of test pass/fail, lint errors, SOTA check results
- **Evidence Pack**: 5 JSON artifacts with SHA256 hashes for determinism
- **Risk Tier**: High / Medium / Low — gates which checks run

### Actuators
- `FixCommand`: Autonomously applies F0 patches (eslint-fix, prettier)
- `RunCommand`: Orchestrates check execution and evidence generation
- `PlanCommand`: Analyzes git diff → risk tier → execution plan

### Regulator Policy
- `DiffRiskClassifier`: Enforces tier escalation for critical paths (execution-rs, shared)
- `SOTA_CHECKS` registry: Canonical source of truth for all quality checks
- `getChecksForTier()`: Higher tiers include all lower-tier checks (cumulative)

## Module Invariants

| # | Invariant | System ID | Enforcement | Test | Evidence |
|---|-----------|-----------|-------------|------|----------|
| 1 | Plan Generation checks Git diff | I-14-01 | `PlanCommand.execute()` calls `git diff --name-only` | Manual | `plan.ts:44` |
| 2 | Plan Execution produces Evidence Packs | I-14-02 | `RunCommand` writes 5 JSON packs to `artifacts/` | Manual | `run.ts:176-188` |
| 3 | CLI driven interaction | I-14-03 | `Program.parse(process.argv)` via `commander` | Manual | `cli.ts:38` |
| 4 | Risk classification is monotonic (High ⊃ Medium ⊃ Low) | I-14-04 | `getChecksForTier()` filters by `TIER_PRIORITY` | Manual | `sota-registry.ts:414-415` |
| 5 | Evidence hashes are deterministic (SHA256) | I-14-05 | `hashPack()` uses sorted keys for canonical JSON | Manual | `evidence.ts:9-12` |
| 6 | Critical paths auto-escalate to High | I-14-06 | `DiffRiskClassifier` checks `execution-rs` and `shared` prefixes | Manual | `risk-classifier.ts:56-67` |
| 7 | Transitive dependency analysis | I-14-07 | `expandImpacts()` performs BFS closure on graph | Manual | `risk-classifier.ts:27-45` |
| 8 | Fix tiers enforce approval gates | I-14-08 | F0=auto, F1=PR review, F2=human approval | Manual | `fix.ts:7-12` |
| 9 | Quality gate verdict is fail-closed | I-14-09 | Non-zero exit on any required check failure | Manual | `run.ts:202-207` |
| 10 | SOTA registry is single source of truth | I-14-10 | All 34 checks defined in `SOTA_CHECKS` array | Manual | `sota-registry.ts:36-402` |
