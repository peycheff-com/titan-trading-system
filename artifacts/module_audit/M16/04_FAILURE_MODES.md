# M16 — Failure Modes and Blast Radius

> **Rule**: If you cannot describe recovery deterministically, you do not own the module.
> **Trading context**: Every failure mode must state financial impact.

| # | Failure Mode | Trigger | Detection Signal | Auto Containment | Manual Runbook | Fund Risk? | Customer Impact | Recovery Steps | RTO | RPO |
|---|-------------|---------|-----------------|-----------------|----------------|-----------|----------------|----------------|-----|-----|
| 1 | Prometheus crash | OOM, disk full, config error | `docker ps` shows container stopped | Docker `restart: unless-stopped` | Check logs, restart container | Indirect — loss of observability | No dashboards, no alerts | `docker restart titan-prometheus` | < 2min | 0 (WAL recovery) |
| 2 | Grafana unavailable | OOM, disk full | Port 3000 unreachable | Docker auto-restart | Check container logs | No — dashboards only | No visual monitoring | `docker restart titan-grafana` | < 2min | 0 (persistent volume) |
| 3 | Alert routing failure | Alertmanager crash or misconfiguration | Alerts not received during incident | None — silent failure | Test alert delivery manually | Indirect — missed critical alert (e.g., drawdown) | Delayed human response | Restart alertmanager, verify config | < 5min | N/A |
| 4 | Scrape target unreachable | Service crash, network partition | `up == 0` in Prometheus | `ServiceDown` alert fires | Check service health | Indirect — blind spot for that service | Partial observability loss | Restart affected service | < 1min | N/A |
| 5 | Metric cardinality explosion | Unbounded label values | High memory usage, slow queries | None | Audit metric labels, prune series | No | Degraded query performance | Restart Prometheus, fix labels | < 10min | 0 |
