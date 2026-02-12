# Module M08 — PostgreSQL: Scope & Boundaries

> **Status**: **CORRECTED**

## 1. Identity

- **Name**: PostgreSQL Database
- **Role**: Primary relational store for Titan.
- **Services**: `titan-brain`, `titan-scavenger`, `titan-hunter`, `titan-sentinel`.

## 2. Components

- **Schema**: `services/titan-brain/migrations/` & `services/titan-brain/src/db/schema.sql`
- **Docker**: `docker-compose.prod.yml` (service: `postgres`)
- **Backup**: `scripts/ops/backup-production.sh`

## 3. Interfaces

- **Port**: 5432 (Internal)
- **Protocol**: TCP / Postgres Wire Protocol
- **Users**: `titan_admin`, `titan_app`
