# M16 — Definition of Done

## Gate Achieved: **A**
## Justification: All audit artifacts complete. Infrastructure exists (Prometheus + Grafana + Alertmanager). Config consolidated. Tests pass. SLOs defined.

## Checklist
- [x] All invariants enforced with tests (Brain: 14/14, Scavenger: 18/18)
- [x] Prometheus config consolidated (7 targets, alert rules, SLOs)
- [x] Grafana dashboard provisioned (14 panels)
- [x] Alert rules defined (6 groups, 300 lines)
- [x] Config validation tests pass (20/20 checks)
- [x] No known critical gaps remain
- [x] Evidence manifest complete (`evidence/MANIFEST.md` — 10 items)

## Evidence Links
- [Brain PrometheusMetrics Tests](file:///Users/ivan/Code/work/trading/titan/services/titan-brain/tests/unit/PrometheusMetrics.test.ts) — 14/14 pass
- [Scavenger PrometheusMetrics Tests](file:///Users/ivan/Code/work/trading/titan/services/titan-phase1-scavenger/tests/unit/PrometheusMetrics.test.ts) — 18/18 pass
- [Config Validation](file:///Users/ivan/Code/work/trading/titan/scripts/sota/monitoring-config.test.ts) — 20/20 pass
- [Prometheus Config](file:///Users/ivan/Code/work/trading/titan/infra/monitoring/prometheus.yml) — 7 scrape targets
- [Alert Rules](file:///Users/ivan/Code/work/trading/titan/services/titan-brain/monitoring/alert-rules.yml) — 6 groups
- [Grafana Dashboard](file:///Users/ivan/Code/work/trading/titan/services/titan-brain/monitoring/grafana-dashboard-comprehensive.json) — 14 panels
- [SLOs](file:///Users/ivan/Code/work/trading/titan/monitoring/slos.yaml) — availability, latency, freshness
