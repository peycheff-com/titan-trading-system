# M14 — Drift Control and Upgrade Strategy

## SOTA Registry ↔ Root package.json Sync
- **Source**: `src/core/sota-registry.ts` (34 checks)
- **Consumer**: Root `package.json` `sota:*` scripts
- **Risk**: Registry references `npm run sota:*` commands that may not exist in `package.json`
- **Enforcement**: Quality OS itself validates by running the commands — non-existent scripts fail visibly

## Schema ↔ Code Sync
- **Source**: `src/schemas/*.schema.json` (5 schemas)
- **Consumer**: Evidence generators in `src/core/evidence.ts` and `src/core/hygiene-engine.ts`
- **Risk**: Schema `proof_method` enum (`static_analysis | compiler_unused | zero_references`) doesn't match code emission (`knip | zero_references`)
- **Status**: Minor drift — does not affect functionality
- **Remediation**: Low priority, tracked in `10_REMEDIATION_PLAN.md`

## Doc-to-Code Sync
- Enforcement: `scripts/verify-docs.sh`
- CI gate: `contract-check` job

## Fix Tier Policy Sync
- **Source**: `fix.ts` (F0/F1/F2 definitions)
- **Consumer**: `01_GATEBOARD.md` Fix Policy column
- **Enforcement**: Manual review — fix tier classifications are stable

## Upgrade Playbook
- Quality OS has no deployment — it's a dev dependency
- Upgrades are via `package.json` version bumps
- External tool upgrades (eslint, prettier, knip) tested via `npm run quality:run`
