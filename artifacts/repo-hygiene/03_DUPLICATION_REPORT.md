# Duplication Report (Phase 0.3)

**Generated:** 2026-02-05

## 1. Documentation Duplication
- **Entry Points:** `README.md`, `DOCUMENTATION_INDEX.md`, `docs/START_HERE.md`. -> **Consolidate to README + START_HERE.**
- **Audits:** `docs/DOCS_AUDIT_REPORT.md`, `docs/repo-hygiene-report.md`. -> **Delete historical reports.**
- **Deployment:** `docs/DEPLOYMENT.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/operations/deployment-standards.md` (referenced in audit). -> **Consolidate to docs/DEPLOYMENT.md.**

## 2. Logic Duplication (Scripts)
- **Deployment:** `scripts/deploy.sh` vs `scripts/ops/start_production.sh` vs `.github/workflows/deploy-prod.yml`.
  - `start_production.sh` seems to be runtime boot.
  - `deploy.sh` seems to be orchestration.
  - **Action:** Clarify boundaries, ensure only one way to deploy.

## 3. Configuration Duplication
- **Compose:** 7 docker-compose files.
  - `docker-compose.staging.yml` appears unused.
  - `docker-compose.micro.yml` and `.dev.yml` may overlap.
  - **Action:** Validate necessities.

## 4. Service Duplication
- **Backtesting:** `services/titan-backtesting` (mentioned in docs) vs `simulation/` directory.
  - Code reference suggests `services/titan-backtesting` might be missing or renamed to `simulation`.
