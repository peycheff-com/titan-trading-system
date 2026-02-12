# M16 — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Infrastructure Defined (Prometheus + Grafana in `docker-compose.yml`)
- [x] Alert Rules Defined (300 lines, 6 groups in `alert-rules.yml`)
- [x] SLOs Defined (`monitoring/slos.yaml` — availability, latency, freshness)
- [x] Grafana Dashboard (14-panel comprehensive dashboard)
- [x] Brain PrometheusMetrics (prom-client, 497 lines, 14/14 tests pass)
- [x] Scavenger PrometheusMetrics (manual export, 421 lines)
- [x] StructuredLogger wraps `@titan/shared` Logger
- [x] Tracing configured (Tempo OTLP/gRPC)
- [x] Log aggregation configured (Loki + Promtail)

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Real-time Metrics" | Brain + Scavenger expose `/metrics`; Prometheus scrapes at 5s intervals | ✅ Aligned |
| "Visual Dashboard" | Grafana service in docker-compose, comprehensive dashboard JSON exists | ✅ Aligned |
| "Alerting" | Alert rules defined (6 groups), Alertmanager config dir exists | ✅ Aligned |
| "SLOs" | `monitoring/slos.yaml` covers availability, latency, freshness | ✅ Aligned |
| "All services scraped" | `infra/monitoring/prometheus.yml` has 7 scrape jobs (brain, execution, scavenger, hunter, sentinel, console-api, self) | ✅ Aligned |
| "Dashboard from `monitoring/grafana/dashboards/`" (docs) | Actual location: `services/titan-brain/monitoring/` | ⚠️ Path mismatch in docs |

## Key Findings
1. **Prometheus config consolidated**: `infra/monitoring/prometheus.yml` is comprehensive (7 targets with relabel configs and per-job scrape intervals).
2. **Scavenger uses manual export**: Unlike Brain (prom-client), Scavenger implements Prometheus text format manually — functionally correct but divergent pattern.
3. **No scavenger PrometheusMetrics tests**: Brain has 14 tests; scavenger has 0.
4. **Grafana admin password**: ✅ FIXED — Now uses `${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD required}` (no longer hardcoded `admin`).

## Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |
