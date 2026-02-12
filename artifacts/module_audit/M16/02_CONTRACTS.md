# M16 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## Scrape Targets (Prometheus)
| Job Name | Target | Port | Metrics Path | Scrape Interval |
|----------|--------|------|--------------|-----------------|
| `titan-brain` | `titan-brain:3100` | 3100 | `/metrics` | 5s |
| `titan-execution` | `localhost:3002` | 3002 | `/metrics` | 5s |
| `titan-scavenger` | `localhost:8081` | 8081 | `/metrics` | 5s |
| `titan-hunter` | `localhost:8082` | 8082 | `/metrics` | 5s |
| `titan-sentinel` | `localhost:8083` | 8083 | `/metrics` | 5s |
| `node-exporter` | `localhost:9100` | 9100 | `/metrics` | 15s |
| `prometheus` | `localhost:9090` | 9090 | `/metrics` | 15s |

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| `/health` | GET | none | — | All services — health check |
| `/metrics` | GET | none | — | Prometheus scrape target |
| Grafana UI | GET | admin/admin | — | Port 3000 |
| Prometheus UI | GET | none | — | Port 9090 |

## Alert Rule Groups
| Group | Interval | Rules | Severity Range |
|-------|----------|-------|----------------|
| `titan.critical` | 30s | CircuitBreaker, HighDrawdown, CriticalDrawdown, ServiceUnhealthy | warning–critical |
| `titan.performance` | 1m | HighSignalLatency, HighOrderLatency, HighIPCLatency, SlowDB, LowCacheHitRate | warning |
| `titan.trading` | 1m | LowApprovalRate, NoSignals, NoTraps, LowFillRate | info–warning |
| `titan.connectivity` | 30s | BinanceDown, IPCFailed, HighIPCFailureRate | warning–critical |
| `titan.resources` | 1m | HighCPU, HighMemory, ServiceDown | warning–critical |
| `titan.business` | 5m | ExcessiveLeverage, TooManyPositions, ConfigReloadFailed | warning–critical |

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------|
| `GF_SECURITY_ADMIN_PASSWORD` | string | `admin` | No — weak default |
| `scrape_interval` | duration | `5s` (comprehensive) / `15s` (basic) | N/A |
| `retention.time` | duration | `30d` | N/A |
| `retention.size` | bytes | `10GB` | N/A |

## Error Taxonomy
| Code | Retryable | Fail-closed | Financial Impact? | Description |
|------|-----------|-------------|-------------------|-------------|
| Scrape timeout | Yes | No | Indirect — blind spot | Prometheus cannot reach target |
| Alert delivery failure | Yes | No | Indirect — missed alert | Alertmanager cannot route notification |
