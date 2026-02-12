# Module M08 — PostgreSQL: Observability

> **Status**: **DRAFT**

## 1. Metrics (Prometheus)

- `pg_up`: Service status.
- `pg_database_size_bytes`: Disk usage.
- `pg_stat_activity_count`: Active connections.

## 2. Logs

- JSON logging enabled for ingestion by Loki.
- Slow query log enabled (>100ms).
