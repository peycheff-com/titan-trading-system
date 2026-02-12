# Module M09 — Redis: Contracts

> **Status**: **APPROVED**
> **Last Checked**: 2026-02-12

## 1. System Boundaries

### Inputs
- **Commands**: Standard Redis protocol (RESP) on port `6379`.
- **Auth**: `AUTH <password>` required for all connections.

### Outputs
- **Data**: Key-value responses.
- **Persistence**: `appendonly.aof` file updates.

## 2. Interface Definition

| Interface | Type | Protocol | Owner |
|-----------|------|----------|-------|
| `primary` | TCP | Redis/6379 | Infra |

## 3. Data Contracts

- **Persistence**: AOF enabled (`appendonly yes`).
- **Eviction**: No eviction policy (`maxmemory-policy noeviction`) - we want errors if full, not data loss for state.
