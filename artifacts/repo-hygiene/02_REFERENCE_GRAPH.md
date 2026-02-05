# Reference Graph (Phase 0.2)

**Generated:** 2026-02-05

## 1. Critical Paths (The "Code Truth")

### Build & Deploy
- **Makefile** -> references `services/*`, `apps/titan-console`, `docker-compose.prod.yml` (in mock)
- **package.json** -> references `scripts/sota/*`, `scripts/ops/start_production.sh`, `scripts/validate-configs.ts`
- **.github/workflows/deploy-prod.yml** -> references `docker-compose.prod.yml` (implied)

### Documentation Chains
- **README.md** -> Linked by GitHub default.
- **docs/START_HERE.md** -> Should be the main entry point. Use counts: Low.
- **DOCUMENTATION_INDEX.md** -> Referenced by: `docs_inventory.txt` (weak).
- **AGENTS.md** -> Referenced by: `node_modules` (coincidental name match likely), `docs/explanation/ci-quality-gates.md`.

## 2. Orphan Candidates (Zero References Detected)

| File | Proposed Action | Evidence |
| :--- | :--- | :--- |
| `docs_inventory.txt` | DELETE | Only references itself or generated output. |
| `complexity_report.md` | DELETE | Root clutter, generated artifact. |
| `docs/DOCS_AUDIT_REPORT.md` | DELETE | Historical report, not a living doc. |
| `docs/repo-hygiene-report.md` | DELETE | Historical report. |
| `docs/deletion-ledger.md` | DELETE | Historical record. |
| `DOCUMENTATION_INDEX.md` | DELETE | Superseded by START_HERE.md / README.md. |
| `docker-compose.staging.yml` | DELETE | No references in CI or Makefile found yet. |

## 3. Script References

| Script | Referenced By | Status |
| :--- | :--- | :--- |
| `scripts/validate-configs.ts` | `package.json` | KEEP |
| `scripts/sota/*.sh` | `package.json` | KEEP |
| `deploy.sh` | `Makefile` (deploy-prod-sim) | KEEP |
| `generate_pages.sh` | Unused? | INVESTIGATE |
