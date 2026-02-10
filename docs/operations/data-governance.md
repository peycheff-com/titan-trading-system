# Data Engineering and Governance

## Ownership

- **Primary owner**: Titan Brain team
- **Schema changes**: Must be reviewed by platform operations

## Schema Migration Policy

- Use forward-only migrations in `services/titan-brain/src/db/migrations`.
- Prefer additive changes (new columns/tables) with safe defaults.
- Breaking changes require a deprecation window and dual-write if needed.
- All migrations must be reversible or have a rollback plan.

## Migration Workflow

1. Create migration file with version bump
2. Validate on staging with production-like data volume
3. Run `npm run migrate` during deployment window
4. Verify schema and application health

## Backward Compatibility Rules

- Avoid dropping columns used by active services
- Gate new fields behind feature flags where possible
- Maintain compatibility across at least one release cycle

## Retention and Archival

Baseline retention (adjust to regulatory requirements):

- **Orders and fills**: 7 years
- **Risk decisions and allocations**: 3 years
- **Market data (raw ticks)**: 30 days
- **Aggregated market data**: 1 year
- **Operational logs**: 90 days
- **Metrics/telemetry**: 90 days

Archival policy:

- Export long-term records to immutable object storage
- Encrypt archives at rest with KMS-managed keys
- Maintain a searchable index for audits

## Data Quality Controls

- Enforce schema validation at ingest
- Track missing or delayed data feeds
- Maintain data lineage for backtests
