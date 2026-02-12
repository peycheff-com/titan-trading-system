# Module M09 — Redis: Failure Modes

> **Status**: **APPROVED**
> **Last Checked**: 2026-02-12

## 1. Failure Scenarios

| ID | Scenario | Impact | Mitigation |
|----|----------|--------|------------|
| **FM-01** | **OOM Kill** | Service crash, potential data loss if AOF not flushed | `restart: always`, AOF fsync every second |
| **FM-02** | **Disk Full** | Writes fail | Monitoring alerts on disk usage |
| **FM-03** | **Network Partition** | Clients disconnect | Auto-reconnect in clients (`ioredis`) |

## 2. Recovery

- **Restart**: Container auto-restarts.
- **Data**: Loads from `appendonly.aof`.
