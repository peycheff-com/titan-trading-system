# Module M08 — PostgreSQL: Drift Control

> **Status**: **DRAFT**

## 1. Schema Drift

- **Mechanism**: `run_migrations.sh` computes SHA256 of all applied SQL files.
- **Check**: Startup fails if hash mismatch detected.

## 2. Version Drift

- **Mechanism**: Docker image pinning (`postgres:16-alpine`).
