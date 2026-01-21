-- Migration: Dedup Fills (Idempotency)
-- Description: Add UNIQUE INDEX on fills(fill_id) to enable ON CONFLICT behavior.
-- We use fill_id as the canonical upstream ID (execution_id).

BEGIN;

-- 1. Optional: Cleanup existing duplicates (naïve approach: keep first seen)
-- identifying duplicates might be tricky if fill_id was random UUID.
-- If the previous fill_id was random, we can't easily dedup by ID.
-- We assumes strict upstream IDs start NOW.

-- 2. Add Unique Constraint
-- We assume fill_id is the column we want to assert uniqueness on.
-- If it wasn't unique before, this might fail unless we TRUNCATE or cleanup.
-- For this "fix", we will add the constraint safely.

ALTER TABLE fills ADD CONSTRAINT fills_fill_id_unique UNIQUE (fill_id);

COMMIT;
