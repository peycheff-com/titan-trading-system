# M16 — Drift Control and Upgrade Strategy

## Prometheus Config Sync
- **Primary source**: `infra/monitoring/prometheus.yml` (mounted by docker-compose)
- **Comprehensive reference**: `services/titan-brain/monitoring/prometheus-comprehensive.yml`
- **Risk**: Two divergent configs. Primary is basic (3 targets); comprehensive has 7 targets + alert rules + storage config.
- **Remediation**: Consolidate — primary config updated to match comprehensive version.

## Alert Rules Sync
- **Source**: `services/titan-brain/monitoring/alert-rules.yml`
- **Mounted**: Via `rule_files` directive in `prometheus.yml`
- **Enforcement**: Config validation test verifies rule file exists and parses

## Grafana Dashboard Sync
- **Source**: `services/titan-brain/monitoring/grafana-dashboard-comprehensive.json`
- **Provisioned**: Via Grafana provisioning volume mount
- **Enforcement**: Config validation test verifies JSON parseable

## SLO Sync
- **Source**: `monitoring/slos.yaml`
- **Consumed by**: Prometheus rule evaluation
- **Enforcement**: Manual review during audit cycles

## Metric Name Consistency
- Brain prefix: `titan_brain_` (via prom-client)
- Scavenger prefix: `titan_scavenger_` (manual export)
- Alert rules reference both prefixes correctly

## Upgrade Playbook
- Prometheus upgrade: Update image tag in `docker-compose.yml`, restart
- Grafana upgrade: Update image tag in `docker-compose.yml`, restart (data persisted in volume)
- Alert rule changes: Edit `alert-rules.yml`, Prometheus auto-reloads on config change
- Dashboard changes: Update JSON file, reimport via Grafana UI or provisioning
