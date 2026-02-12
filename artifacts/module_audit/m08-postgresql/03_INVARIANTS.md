# Module M08 — PostgreSQL: Invariants

> **Status**: **DRAFT**

## 1. Critical Safeguards

| ID | Invariant | Check |
|----|-----------|-------|
| **DB-001** | **No Plaintext Passwords** | `docker-compose` env vars check |
| **DB-002** | **Backups Exist** | `backup-production.sh` daily run |
| **DB-003** | **Migrations Idempotent** | `_titan_migrations` hash check |
| **DB-004** | **Disk Space** | Alert at 80% usage |

## 2. Verification

Verified via `infra/scripts/verify_postgres.ts`.
