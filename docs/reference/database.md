# Database Reference (PostgreSQL)

> **Status**: Canonical
> **Schema**: `services/titan-brain/src/db/schema.sql`
> **Owner**: Titan Brain

The Database (`titan_brain`) is the persistent memory of the organism.

## 1. Schema Overview

### 1.1 Core Tables (The Ledger)

| Table | Description | Partitioned? | Owner |
| :--- | :--- | :--- | :--- |
| `fills` | Record of every executed trade. | **YES (Monthly)** | Execution/Brain |
| `event_log` | Event sourcing journal. | **YES (Monthly)** | Brain |
| `brain_decisions` | Why a trade was taken (Audit). | No | Brain |
| `circuit_breaker_events`| Halt/Resume log. | No | Brain |

### 1.2 State Tables

| Table | Description |
| :--- | :--- |
| `allocation_history` | Time-series of capital allocation per phase. |
| `high_watermark` | Peak equity tracking (for drawdown calc). |
| `operators` | Admin users and permissions. |
| `config_history` | Audit trail of config changes. |

## 2. Partitioning Strategy

High-volume tables are partitioned by time (Monthly) to ensure query performance and efficient archival.

- **Fills**: `fills_y2026m02`, `fills_y2026m03`...
- **Events**: `event_log_y2026m02`...

**Maintenance**:
Partitions are managed automatically by the `pg_partman` extension (or manual migration scripts in `services/titan-brain/migrations`).

## 3. Row Level Security (RLS)

All tables have RLS enabled by default to prevent accidental cross-tenant data leaks (though Titan is currently single-tenant).

## 4. Migrations

Located in: `services/titan-brain/migrations/`.

**Runners:**
- **Dev**: `npm run start:brain` (auto-migrates on boot via `src/db/migrate.ts`)
- **Production**: `scripts/ops/run_migrations.sh` (idempotent, tracks applied migrations in `_titan_migrations` table with SHA256 hashes, fails closed on drift)
- **CI**: `scripts/ci/test_fresh_bootstrap.sh` (ephemeral Postgres → migrate → validate → idempotency proof)

**Invariant**: Schema changes must be backward compatible or require a maintenance window.
