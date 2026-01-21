-- Migration: Phase Performance View/Cache
-- Description: Rename phase_performance to phase_performance_cache to indicate it is a derived view.

BEGIN;

ALTER TABLE phase_performance RENAME TO phase_performance_cache;

-- Add index for fast lookup by phase + timestamp
CREATE INDEX IF NOT EXISTS idx_phase_performance_cache_lookup 
ON phase_performance_cache (phase_id, timestamp DESC);

COMMIT;
