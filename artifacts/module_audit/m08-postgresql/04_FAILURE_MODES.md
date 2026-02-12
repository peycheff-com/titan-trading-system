# Module M08 — PostgreSQL: Failure Modes

> **Status**: **DRAFT**

## 1. Analysis

| ID | Failure | Detection | Mitigation |
|----|---------|-----------|------------|
| **FM-DB-01** | **Connection Saturation** | Prometheus `pg_stat_activity` | PGBouncer / Scaling |
| **FM-DB-02** | **Slow Queries** | `pg_stat_statements` | Query optimization / Indexing |
| **FM-DB-03** | **Data Corruption** | Checksum failure | Restore from PITR backup |

## 2. Recovery

- **Auto**: Docker restart policy `always`.
- **Manual**: `restore_db.sh` script.
