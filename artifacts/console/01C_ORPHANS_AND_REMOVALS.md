# 01C Orphans and Removals

## Inventory
- `start_alpha.sh`: Potentially obsolete if `docker-compose.prod.yml` is canonical.
- `docker-compose.yml` vs `docker-compose.prod.yml`:
  - `docker-compose.prod.yml` is explicit and identified as canonical.
  - `docker-compose.yml` appears to be a dev/default var.
- `monitoring` folder: Contains config for Prometheus/Grafana/Tempo. Used in composed files. **KEEP**.

## Candidates for Removal
- **Legacy Dashboards**: None found (only `titan-console` exists).
- **Unused Services**: `titan-scavenger`, `titan-hunter`, etc. are all active phases.

## Integration Plan
- `titan-opsd` will be added as a NEW service in `services/titan-opsd`.
- `titan-console-api` will be added as a NEW service (or extracted from brain) to `services/titan-console-api`.

## Action
- No immediate file deletions required for "Orphans" as the repo appears relatively clean of *dead* services.
- Focus is on *adding* the missing Control Plane components.
