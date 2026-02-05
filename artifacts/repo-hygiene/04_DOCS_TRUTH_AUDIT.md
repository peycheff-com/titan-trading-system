# Docs Truth Audit (Phase 0.4)

**Generated:** 2026-02-05
**Verdict:** **SOFT_FAIL** (Clutter present, multiple entry points)

## 1. Truth Gaps

| Claim | Reality | Verdict |
| :--- | :--- | :--- |
| `DOCUMENTATION_INDEX.md` is entry point | `README.md` and `START_HERE.md` also exist. | FALSE TRUTH |
| `titan-backtesting` service | Not present in `services/`. Found `simulation/` dir. | OUTDATED |
| `docker-compose.staging.yml` exists | CI uses `deploy-prod.yml` (direct to DigitalOcean?). | LIKELY DEAD |

## 2. Canonical Structure Violations
- Root contains `AGENTS.md`, `CONTRIBUTING_QA.md` (Should be in docs/ or merged).
- `docs/` contains flat files `PRODUCTION_CHECKLIST.md` (Should be in operations/ or DEPLOYMENT).
- `docs/` contains historical artifacts (`DOCS_AUDIT_REPORT.md`).

## 3. SOTA Alignment Plan
1.  **Move** `START_HERE.md` to `docs/START_HERE.md` (if not already).
2.  **Delete** `DOCUMENTATION_INDEX.md`.
3.  **Merge** `AGENTS.md` and `CONTRIBUTING_QA.md` into `docs/CONTRIBUTING.md` or `docs/OPERATIONS.md` or `README.md`.
4.  **Rewrite** `README.md` to be minimal pointer.
5.  **Delete** root clutter (`docs_inventory.txt`, `complexity_report.md`).
