# M18 — Performance and Cost Budgets

## Latency Budget
| Operation | P50 | P95 | P99 | Hard Limit |
|-----------|-----|-----|-----|------------|
| Postgres backup (pg_dump + gzip) | 30s | 2m | 5m | 15m |
| JetStream snapshot (DO API) | 10s | 30s | 60s | 5m |
| Redis BGSAVE + copy | 5s | 10s | 15s | 60s |
| Backup verification | 5s | 10s | 15s | 60s |
| Exchange whitelist check (per exchange) | 2s | 5s | 10s | 30s |

## Throughput Target
- Not applicable — cron-driven batch operations, no sustained throughput requirement.

## Resource Budgets
| Resource | Budget | Measurement |
|----------|--------|-------------|
| CPU | Minimal (pg_dump + gzip spike) | Cron execution window |
| Memory | < 512 MB during backup | pg_dump + gzip pipeline |
| Storage (local backups) | ~500 MB (3 Postgres backups retained) | `ls -t | tail -n +4 | xargs rm` |
| Storage (DO Spaces) | Unlimited (S3-compatible) | Monthly billing |
| DO Snapshots | 7 retained (auto-pruned) | `doctl snapshot list` |

## Trading Cost Budget
| Unit | Cost | Measurement |
|------|------|-------------|
| Per trade (fees) | N/A — no trading in this module | — |
| Daily infra cost | ~$0.10 (Spaces storage + snapshot fees) | DigitalOcean billing |
| Slippage budget | N/A | — |

## CI Impact
| Metric | Target | Current |
|--------|--------|---------|
| Config validation test | < 5s | < 2s |
| Property tests | < 30s | ~15s |
| SOTA checks | < 30s | Covered by config validation |

> **Rule**: If cost is not measured, it is not controlled.
