# Schema Drift Note — config_overrides / config_receipts FK Fix

## What Changed

Two foreign key constraints in `schema.sql` were corrected:

| Table | Constraint | Before | After |
|-------|-----------|--------|-------|
| `config_overrides` | `fk_config_overrides_operator` | `REFERENCES operators(id)` | `REFERENCES operators(operator_id)` |
| `config_receipts` | `fk_config_receipts_operator` | `REFERENCES operators(id)` | `REFERENCES operators(operator_id)` |

## Why

The `operators` table uses `operator_id` as its primary key column, not `id`. The old FK references were incorrect and would fail on a fresh `CREATE TABLE` run.

## Backward Compatibility

- **YES** — this is backward compatible.
- If the constraint already exists in production with the old definition, `CREATE TABLE IF NOT EXISTS` will skip the table creation entirely.
- If constraints were never created (table existed before the constraint was added), this is a no-op.

## Migration Path

**Option A (preferred): No-op if table exists.**
`CREATE TABLE IF NOT EXISTS` means this only matters for fresh database installs. No migration needed for existing production databases.

**Option B (if constraint exists with wrong reference):**
```sql
-- Drop and recreate the constraint
ALTER TABLE config_overrides DROP CONSTRAINT IF EXISTS fk_config_overrides_operator;
ALTER TABLE config_overrides ADD CONSTRAINT fk_config_overrides_operator
  FOREIGN KEY (operator_id) REFERENCES operators(operator_id);

ALTER TABLE config_receipts DROP CONSTRAINT IF EXISTS fk_config_receipts_operator;
ALTER TABLE config_receipts ADD CONSTRAINT fk_config_receipts_operator
  FOREIGN KEY (operator_id) REFERENCES operators(operator_id);
```

## Services Affected

Only `titan-brain` owns and reads this schema. No other service writes to `config_overrides` or `config_receipts`.

## Verdict

**Safe to ship.** This is a correctness fix. The old FK reference was wrong. No data migration required.
