#!/bin/bash
# =============================================================================
# verify_backup.sh - Verify backup integrity
# =============================================================================
# Validates that the most recent backups exist, are non-empty, and structurally
# sound. Exits 0 if all checks pass, 1 on any failure.
#
# Usage: ./verify_backup.sh [backup_dir]
# =============================================================================

set -euo pipefail

BACKUP_DIR="${1:-/opt/titan/backups}"
ERRORS=0

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { log "FAIL: $*"; ERRORS=$((ERRORS + 1)); }
pass() { log "PASS: $*"; }

# ─── Check Directory Exists ──────────────────────────────────────────────────
if [ ! -d "$BACKUP_DIR" ]; then
    fail "Backup directory does not exist: $BACKUP_DIR"
    exit 1
fi

# ─── PostgreSQL Backup Verification ─────────────────────────────────────────
PG_DIR="$BACKUP_DIR/postgres"
if [ -d "$PG_DIR" ]; then
    LATEST_PG=$(find "$PG_DIR" -name "*.sql.gz" -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
    if [ -z "$LATEST_PG" ]; then
        fail "No PostgreSQL backup files found in $PG_DIR"
    else
        SIZE=$(stat -f%z "$LATEST_PG" 2>/dev/null || stat --printf="%s" "$LATEST_PG" 2>/dev/null)
        if [ "$SIZE" -lt 1024 ]; then
            fail "PostgreSQL backup suspiciously small (${SIZE} bytes): $LATEST_PG"
        else
            # Verify gzip integrity
            if gzip -t "$LATEST_PG" 2>/dev/null; then
                pass "PostgreSQL backup valid (${SIZE} bytes): $(basename "$LATEST_PG")"
            else
                fail "PostgreSQL backup corrupted (gzip test failed): $LATEST_PG"
            fi
        fi

        # Check age (warn if > 25 hours old)
        if [ "$(uname)" = "Darwin" ]; then
            AGE_SECS=$(( $(date +%s) - $(stat -f%m "$LATEST_PG") ))
        else
            AGE_SECS=$(( $(date +%s) - $(stat --printf="%Y" "$LATEST_PG") ))
        fi
        if [ "$AGE_SECS" -gt 90000 ]; then
            fail "PostgreSQL backup is $(( AGE_SECS / 3600 )) hours old (threshold: 25h)"
        fi
    fi
else
    fail "PostgreSQL backup directory missing: $PG_DIR"
fi

# ─── JetStream Backup Verification ──────────────────────────────────────────
JS_DIR="$BACKUP_DIR/jetstream"
if [ -d "$JS_DIR" ]; then
    LATEST_JS=$(find "$JS_DIR" -name "*.tar.gz" -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
    if [ -z "$LATEST_JS" ]; then
        fail "No JetStream backup files found in $JS_DIR"
    else
        SIZE=$(stat -f%z "$LATEST_JS" 2>/dev/null || stat --printf="%s" "$LATEST_JS" 2>/dev/null)
        if [ "$SIZE" -lt 512 ]; then
            fail "JetStream backup suspiciously small (${SIZE} bytes): $LATEST_JS"
        else
            if tar tzf "$LATEST_JS" &>/dev/null; then
                pass "JetStream backup valid (${SIZE} bytes): $(basename "$LATEST_JS")"
            else
                fail "JetStream backup corrupted (tar test failed): $LATEST_JS"
            fi
        fi
    fi
else
    fail "JetStream backup directory missing: $JS_DIR"
fi

# ─── Redis Backup Verification ──────────────────────────────────────────────
REDIS_DIR="$BACKUP_DIR/redis"
if [ -d "$REDIS_DIR" ]; then
    LATEST_REDIS=$(find "$REDIS_DIR" -name "*.rdb" -o -name "*.rdb.gz" -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
    if [ -z "$LATEST_REDIS" ]; then
        fail "No Redis backup files found in $REDIS_DIR"
    else
        SIZE=$(stat -f%z "$LATEST_REDIS" 2>/dev/null || stat --printf="%s" "$LATEST_REDIS" 2>/dev/null)
        if [ "$SIZE" -lt 128 ]; then
            fail "Redis backup suspiciously small (${SIZE} bytes): $LATEST_REDIS"
        else
            pass "Redis backup valid (${SIZE} bytes): $(basename "$LATEST_REDIS")"
        fi
    fi
else
    fail "Redis backup directory missing: $REDIS_DIR"
fi

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -eq 0 ]; then
    log "✅ All backup verification checks passed"
    exit 0
else
    log "❌ ${ERRORS} verification check(s) failed"
    exit 1
fi
