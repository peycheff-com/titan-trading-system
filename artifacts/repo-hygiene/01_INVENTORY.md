# Repo Inventory (Phase 0.1)

**Generated:** 2026-02-05
**Scope:** Root, docs/, services/, scripts/

## 1. Top-Level Structure

| Directory | Purpose | Status |
| :--- | :--- | :--- |
| `apps/` | Consumer applications (titan-console) | KEEP |
| `artifacts/` | System outputs and reports | CLEANUP |
| `config/` | Shared configurations | VERIFY |
| `docs/` | Documentation (Mixed state) | REFACTOR |
| `evidence/` | Drill logs and inventories | CLEANUP |
| `infra/` | Infrastructure code | KEEP |
| `monitoring/` | Prometheus/Grafana configs | KEEP |
| `packages/` | Shared libraries | KEEP |
| `scripts/` | Automation scripts | CONSOLIDATE |
| `services/` | Backend microservices | KEEP |
| `simulation/` | Simulation environments | KEEP |
| `site/` | Generated MkDocs site | IGNORE (Gitignore) |
| `specs/` | Formal specifications | MERGE to docs |
| `tests/` | E2E or Integration tests | KEEP |

## 2. Documentation Files (Root & docs/)

| File | Location | Recommendation |
| :--- | :--- | :--- |
| `README.md` | Root | KEEP (Update) |
| `AGENTS.md` | Root | MERGE |
| `CONTRIBUTING_QA.md` | Root | MERGE |
| `DOCUMENTATION_INDEX.md` | Root | DELETE (superseded by START_HERE) |
| `docs_inventory.txt` | Root | DELETE (artifact) |
| `complexity_report.md` | Root | DELETE (artifact) |
| `START_HERE.md` | docs/ | KEEP (Move to docs/START_HERE.md) |
| `PRODUCTION_CHECKLIST.md` | docs/ | MERGE to DEPLOYMENT.md |
| `DOCS_AUDIT_REPORT.md` | docs/ | DELETE (artifact) |
| `repo-hygiene-report.md` | docs/ | DELETE (artifact) |
| `deletion-ledger.md` | docs/ | DELETE (artifact) |
| `SELF_HOSTED_AI.md` | docs/ | MERGE to OPERATIONS.md |

## 3. Scripts & Automation

| Directory | Count | Note |
| :--- | :--- | :--- |
| `scripts/ci/` | 9 | CI/CD pipelines |
| `scripts/ops/` | 11 | Operational scripts |
| `scripts/sota/` | 18 | Quality gate scripts |
| `scripts/root` | 19 | Mixed root scripts (deploy.sh, boot_micro.sh) |

## 4. Configuration

| File | Purpose | Recommendation |
| :--- | :--- | :--- |
| `docker-compose.yml` | Main Dev Compose | KEEP |
| `docker-compose.prod.yml` | Production Compose | KEEP |
| `docker-compose.micro.yml` | Micro-services subset | CONSOLIDATE? |
| `docker-compose.dev.yml` | Dev specific overrides | CONSOLIDATE? |
| `docker-compose.gpu.yml` | GPU specific overrides | CONSOLIDATE? |
| `docker-compose.staging.yml` | Staging env | DELETE (if unused) |
| `docker-compose.test.yml` | Test env | KEEP |
| `package.json` | Monorepo root | KEEP |
| `Makefile` | Build orchestration | KEEP |
