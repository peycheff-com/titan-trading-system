# M16 — Remediation Plan

| # | Finding | Impact | Fix Policy | Current Signal | Proposed Change | Tests Added | Evidence to Collect | Gate Target |
|---|---------|--------|------------|----------------|-----------------|-------------|--------------------|------------|
| 1 | `infra/monitoring/prometheus.yml` is basic (3 targets, no alert rules, no storage config) | Med — production blind spots for scavenger/hunter/sentinel | F0 | Partial scraping | Consolidate comprehensive config into primary `infra/monitoring/prometheus.yml` | Config validation test | YAML parse + job count check | A |
| 2 | Alert rules and Grafana dashboard not mounted by docker-compose | Med — alerts and dashboards not provisioned automatically | F0 | Manual setup required | Add volume mounts for alert rules and Grafana dashboard provisioning | Config validation test | docker-compose review | A |
| 3 | No config validation tests for monitoring stack | Low — configs could silently break | F0 | No tests | Add `scripts/sota/monitoring-config.test.ts` | New test file | Test output | A | ✅ RESOLVED |
| 4 | No unit tests for scavenger PrometheusMetrics | Low — manual export logic untested | F0 | 0 tests | Add `services/titan-phase1-scavenger/tests/unit/PrometheusMetrics.test.ts` | New test file | Test output | A |
