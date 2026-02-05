# Repo Hygiene Changelog

## Phase 2: Documentation Consolidation
- **CREATED** `docs/CONTRIBUTING.md` (Merged `AGENTS.md`, `CONTRIBUTING_QA.md`, `STYLE_GUIDE.md`)
- **CREATED** `docs/OPERATIONS.md` (Merged `docs/operations/*`, `docs/SELF_HOSTED_AI.md`)
- **CREATED** `docs/DEPLOYMENT.md` (Merged `docs/PRODUCTION_CHECKLIST.md`, `docs/runbooks/POLICY_DEPLOYMENT.md`)
- **MOVED** `docs/explanation/architecture_overview.md` -> `docs/ARCHITECTURE.md`
- **UPDATED** `README.md` and `docs/START_HERE.md` to point to new canonical locations
- **DELETED** `AGENTS.md`, `CONTRIBUTING_QA.md`, `docs/STYLE_GUIDE.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/SELF_HOSTED_AI.md`

## Phase 3: Clutter Removal
- **DELETED** `scripts/deploy.sh` (Redundant with `canary/deploy.sh` / `ci/deploy.sh`)
- **DELETED** `docker-compose.staging.yml` (Unused)
- **DELETED** `packages/titan-execution-rs` (Orphaned package)
- **DELETED** `check_output.txt`, `knip_report.json` (Transient logs)

## Phase 4: Verification
- **FIXED** Broken links in `docs/setup/redis-security-guide.md` and `docs/explanation/index.md`
- **VERIFIED** Script integrity (sanity check)
- **VERIFIED** Docs navigation (START_HERE -> Canonical)
