# Evidence Manifest - M08 PostgreSQL

> Verification of SOTA compliance via Code and Configuration.

## 1. Schema Versioning (Drift Control)
- **Invariant**: Migrations are tracked.
- **Evidence Type**: SQL Schema
- **Location**: `services/titan-brain/migrations/`
- **Snippet**:
```sql
-- Migration files 003, 004, 005, 20240523 exist
-- System ensures ordered application
```
- **Status**: ✅ Verified

## 2. Row Level Security (Security)
- **Invariant**: RLS enabled on sensitive tables.
- **Evidence Type**: SQL Schema
- **Location**: `services/titan-brain/src/db/schema.sql`
- **Snippet**:
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON users USING (id = current_user_id());
```
- **Status**: ✅ Verified

## 3. Deduplication (Consistency)
- **Invariant**: Fills are not duplicated.
- **Evidence Type**: SQL Schema
- **Location**: `services/titan-brain/migrations/003_dedup_fills.sql`
- **Snippet**:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_fills_dedup ON fills (execution_id, symbol);
```
- **Status**: ✅ Verified
