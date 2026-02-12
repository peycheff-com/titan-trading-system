# Module: M16

## Identity
- **Name**: M16 — Monitoring Stack (Prometheus / Grafana / Alertmanager / Loki / Tempo)
- **Purpose**: System Observability, Metrics Collection, Alerting, Log Aggregation, Distributed Tracing
- **Architectural plane**: Operations

## Code Packages (exhaustive)

### Infrastructure / Config
| File | Purpose |
|------|---------|
| `docker-compose.yml` L97-122 | Prometheus + Grafana service definitions |
| `infra/monitoring/prometheus.yml` | Active Prometheus scrape config (mounted by docker-compose) |
| `services/titan-brain/monitoring/prometheus-comprehensive.yml` | Comprehensive Prometheus config (5 services, relabeling, storage) |
| `services/titan-brain/monitoring/alert-rules.yml` | 300-line alert rules — 6 groups (critical, performance, trading, connectivity, resources, business) |
| `services/titan-brain/monitoring/grafana-dashboard-comprehensive.json` | 14-panel Grafana dashboard (497 lines) |
| `monitoring/slos.yaml` | SLOs — availability (99.9%), latency (P99 < 500ms), freshness (5s) |
| `monitoring/alertmanager/` | Alertmanager config directory |
| `monitoring/loki/` | Loki config directory |
| `monitoring/promtail/` | Promtail log shipper config |
| `monitoring/tempo/tempo.yaml` | Tempo distributed tracing config |

### Application Code
| File | Lines | Purpose |
|------|-------|---------|
| `services/titan-brain/src/monitoring/PrometheusMetrics.ts` | 497 | prom-client wrapper — counters, gauges, histograms for brain metrics |
| `services/titan-brain/src/monitoring/StructuredLogger.ts` | 460 | JSON structured logger wrapping `@titan/shared` Logger |
| `services/titan-brain/src/monitoring/index.ts` | 27 | Barrel export |
| `services/titan-phase1-scavenger/src/monitoring/PrometheusMetrics.ts` | 421 | Manual Prometheus text format exporter for scavenger metrics |

### Tests
| File | Tests | Status |
|------|-------|--------|
| `services/titan-brain/tests/unit/PrometheusMetrics.test.ts` | 14 | ✅ All pass |

### Documentation
| File | Purpose |
|------|---------|
| `docs/operations/monitoring-alerting.md` | SLOs, alert thresholds, tracing, dashboards, operator workflow |

## Owner Surfaces
- **Human-facing**: Grafana dashboards (port 3000)
- **Machine-facing**: Prometheus scrape targets (port 9090), `/metrics` endpoints on all services

## Boundaries
- **Inputs**: Metric scrapes from Brain (3100), Execution (3002), Scavenger (8081), Hunter (8082), Sentinel (8083)
- **Outputs**: Grafana dashboards, alert notifications (Alertmanager), log queries (Loki), trace visualization (Tempo)
- **Dependencies**: All service `/metrics` endpoints, Docker network
- **Non-goals**: Application-level business logic, trade execution
