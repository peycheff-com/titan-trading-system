# Railway Service Investigation Report

**Date:** 2026-01-12 **Status:** Phase 4 Complete

## Service Health Summary

| Service             | Status      | Symptom                                  | Criticality  |
| ------------------- | ----------- | ---------------------------------------- | ------------ |
| **Titan Brain**     | 🔴 CRASHING | `relation "phase_trades" does not exist` | **CRITICAL** |
| **Titan Scavenger** | 🟠 DEGRADED | `HTTP 403: Forbidden` (Bybit API)        | HIGH         |
| **Titan Execution** | 🟢 HEALTHY  | Running, port 3002 inferred              | LOW          |
| **Titan Console**   | 🟢 HEALTHY  | Running, port 8080                       | LOW          |
| **Titan Hunter**    | 🟢 HEALTHY  | Logged large trade history               | LOW          |
| **Titan Sentinel**  | 🟢 HEALTHY  | Market Monitor started                   | LOW          |
| **Titan AI Quant**  | 🟢 HEALTHY  | Nightly optimizer scheduled              | LOW          |

## Root Cause Analysis

### 1. Titan Brain: Missing Database Tables

**Symptom:** Logs show `error: relation "phase_trades" does not exist` causing
crash loops during `updateMetrics`.

**Root Causes:**

1. **Explicit Skip:** `migrate.ts` contains
   `if (process.env.RAILWAY_ENVIRONMENT) return;`, effectively disabling
   migrations in production.
2. **Build configurations:** The `build` script (`tsc`) does not copy
   `src/db/schema.sql` to `dist/db/schema.sql`. The migration file
   `001_initial_schema.ts` relies on reading this file at runtime.
3. **Incomplete Fallback:** The `runMigrationSQL` fallback function in
   `migrate.ts` defines some tables but **misses** `phase_trades`,
   `allocation_history`, `treasury_operations`, etc.

**Evidence:**

- `artifacts/logs/titan-brain-deploy.log`:
  `relation "phase_trades" does not exist`
- `services/titan-brain/src/db/migrate.ts`: Line 29-31 explicitly returns if
  `RAILWAY_ENVIRONMENT` is set.

### 2. Titan Brain: Safe-Fail Checks Disabled

**Symptom:** Potential silent failures or masked connection issues.

**Root Cause:** `DatabaseManager.ts` forces `isConnected()` and `healthCheck()`
to return `true` when `RAILWAY_ENVIRONMENT` is set, regardless of the actual
connection state.

**Evidence:**

- `services/titan-brain/src/db/DatabaseManager.ts`: Line 664 and 675.

### 3. Titan Scavenger: Geo-Blocking (403)

**Symptom:** `Failed to get funding rate... HTTP 403: Forbidden`.

**Root Cause:** Bybit blocks US IP addresses. Railway's default region is likely
US West.

**Proposed Mitigation:** This requires infra-level changes (proxy or region
change). For now, we will focus on stability fixes. The service is running but
cannot fetch data.

## Proposed Fixes (Phase 5)

### Titan Brain

1. **Enable Migrations:** Remove the `RAILWAY_ENVIRONMENT` check in
   `migrate.ts`.
2. **Fix Build Artifacts:** Update `package.json` to copy `schema.sql` to
   `dist/` after `tsc`.
3. **Robust Fallback:** Update `runMigrationSQL` in `migrate.ts` to include the
   full schema definition, ensuring DB init works even if file reading fails.
4. **Real Health Checks:** Remove fake returns in `DatabaseManager.ts` to ensure
   the orchestrator knows when the DB is down.

### Verification Plan

1. **Brain:** Deploy -> Check logs for "Migration 1 completed" -> Check logs for
   successful `updateMetrics` (no crash).
2. **Scavenger:** Acknowledge 403s but ensure service stays up.
3. **Global:** Verify cross-service connectivity via private domains.
