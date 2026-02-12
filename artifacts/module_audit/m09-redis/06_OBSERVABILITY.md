# Module M09 — Redis: Observability

> **Status**: **APPROVED**
> **Last Checked**: 2026-02-12

## 1. Metrics

- **Excluded**: No dedicated `redis-exporter` currently deployed (Low complexity deployment).
- **Healthcheck**: `redis-cli ping` via Docker Healthcheck.

## 2. Logs

- Standard Docker logs (stdout/stderr).
- Ingested by Promtail (if configured for all containers).

## 3. Alerts

- **Service Down**: Prometheus `up{job="redis"}` (if exporter added) or via blackbox probes.
- **Currently**: Relies on dependent service health checks.
