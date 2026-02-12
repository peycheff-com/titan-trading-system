# Module M08 — PostgreSQL: Reality

> **Status**: **CORRECTED**
> **Last Checked**: 2026-02-12

## 1. Infrastructure

- **Image**: `postgres:16-alpine` (Standardized)
- **Extensions**: `pgvector` (Verified in Dockerfile)
- **Config**: Standard `postgresql.conf` tuned for SSD.

## 2. Schema

- **Location**: `services/titan-brain/migrations`
- **Tables**: `users`, `strategies`, `executions`, `market_data` (in Schema).
- **Partitions**: `market_data` partitioned by time.

## 3. Data Flow

- **Writes**: Execution Engine (High volume), Scavenger (Medium).
- **Reads**: Brain (Aggregates), Console (Queries).
