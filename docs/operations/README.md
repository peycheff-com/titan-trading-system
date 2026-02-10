# Operations & Reliability

[← Back to Index](../README.md)

## 🩺 System Reliability

- [**Data Governance**](data-governance.md) — Schema enforcement and migration policies.
- [**Event Bus Backlog**](reliability/event-bus-backlog.md) — Handling NATS pressure.
- [**Truth Collapse**](reliability/truth-collapse.md) — What happens when consensus fails.

## 🔧 Troubleshooting

- [**Monitoring & Alerting**](monitoring-alerting.md) — Golden signals and paging.
- [**Incident Response**](troubleshooting/incident-response.md) — Triage workflows.

## 📜 Governance

- [**Configuration Governance**](configuration-governance.md) — Environment variables and feature flags.

## 📊 Observability

- [**Metrics Catalog**](metrics-catalog.md) — Exhaustive inventory of all Prometheus metrics by service.
- [**Dashboard Specification**](dashboard-spec.md) — Grafana dashboard layout and PromQL queries.
- [**Monitoring & Alerting**](monitoring-alerting.md) — SLOs, alert thresholds, and tracing.

---

# Operational Posture (Legacy)

> **Note**: This section was merged from the legacy `operations.md`.

## The "Dull" Standard

We prioritize **boring, reliable** operations over fancy tooling.

- **Orchestrator**: Docker Compose (Single node or Swarm).
- **Logs**: JSON stdout/stderr, shipped to vector/loki.
- **Metrics**: Prometheus scrape targets.

## Deployment

👉 **See Canonical Guide**: [deployment-standard.md](../deployment-standard.md)

### Quick Commands

```bash
# Deploy Production
./scripts/deploy_prod.sh

# Emergency Halt (Local)
npm run start:prod -- --halt
```

## Monitoring & Observability

### Dashboards (Grafana)

- **Titan Overview**: Main business metrics (PnL, Exposure).
- **System Health**: CPU, RAM, Event Loop Lag, NATS Lag.
- **Risk Board**: Circuit breaker states, current drawdowns.

### Key Metrics

- `titan_risk_exposure_notional`: Total market exposure.
- `titan_decision_latency_ms`: Brain processing time.
- `titan_execution_ack_latency_ms`: Exchange round-trip time.

## Incident Response

👉 **Runbooks located in**: [RUNBOOKS/](../runbooks/README.md)

### Severity Levels

- **SEV-1 (Critical)**: Fund loss imminent or happening. Action: **Global Halt**.
- **SEV-2 (Major)**: Trading stopped, no fund loss. Action: Investigate.
- **SEV-3 (Minor)**: Degraded performance (e.g., logging lag).

### Drill Schedule

- **Backup Restoration**: Monthly.
- **Circuit Breaker Test**: Weekly (Automated).

## Backup & Disaster Recovery

### Database (Postgres)

- **Strategy**: WAL Archiving + Nightly Dump.
- **Restore**: `scripts/restore_db.sh <timestamp>`

### State (Redis)

- **Strategy**: AOF (Append Only File).
- **Recovery**: Automatic replay on restart.
