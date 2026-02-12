#!/bin/bash
# =============================================================================
# restore_db.sh - PostgreSQL database restore from backup
# =============================================================================
# Restores a PostgreSQL database from a compressed backup file.
# Supports both point-in-time restore and latest backup restore.
#
# Usage:
#   ./restore_db.sh [backup_file]       Restore from specific backup
#   ./restore_db.sh --latest            Restore from most recent backup
#   ./restore_db.sh --dry-run [file]    Validate without restoring
#
# CAUTION: This will DROP and RECREATE the target database.
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/titan/backups/postgres}"
DB_NAME="${POSTGRES_DB:-titan}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-titan}"
DRY_RUN=false
BACKUP_FILE=""

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { log "FATAL: $*"; exit 1; }

# ─── Parse Arguments ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --latest)
            BACKUP_FILE=$(find "$BACKUP_DIR" -name "*.sql.gz" -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
            [ -z "$BACKUP_FILE" ] && die "No backup files found in $BACKUP_DIR"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            BACKUP_FILE="$1"
            shift
            ;;
    esac
done

[ -z "$BACKUP_FILE" ] && die "Usage: $0 [--latest | backup_file] [--dry-run]"
[ -f "$BACKUP_FILE" ] || die "Backup file not found: $BACKUP_FILE"

# ─── Validate Backup ────────────────────────────────────────────────────────
log "Validating backup: $BACKUP_FILE"

SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat --printf="%s" "$BACKUP_FILE" 2>/dev/null)
log "Backup size: ${SIZE} bytes"

if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
    die "Backup file is corrupted (gzip integrity check failed)"
fi
log "Backup integrity: OK"

if [ "$DRY_RUN" = true ]; then
    log "✅ Dry run complete. Backup is valid and ready for restore."
    exit 0
fi

# ─── Safety Confirmation ────────────────────────────────────────────────────
log "⚠️  WARNING: This will DROP and RECREATE database '$DB_NAME' on $DB_HOST:$DB_PORT"
log "Backup file: $(basename "$BACKUP_FILE")"

if [ -t 0 ]; then
    printf "Type 'RESTORE' to confirm: "
    read -r CONFIRM
    [ "$CONFIRM" = "RESTORE" ] || die "Aborted by user"
else
    log "Non-interactive mode — proceeding with restore"
fi

# ─── Pre-Restore: Disconnect active sessions ────────────────────────────────
log "Terminating active connections to '$DB_NAME'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
    2>/dev/null || log "WARN: Could not terminate existing connections"

# ─── Drop and Recreate Database ─────────────────────────────────────────────
log "Dropping database '$DB_NAME'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"

log "Creating database '$DB_NAME'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"

# ─── Restore ────────────────────────────────────────────────────────────────
log "Restoring from $(basename "$BACKUP_FILE")..."
gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --single-transaction

RESTORE_EXIT=$?
if [ "$RESTORE_EXIT" -eq 0 ]; then
    log "✅ Database restore completed successfully"
else
    die "Database restore failed with exit code $RESTORE_EXIT"
fi

# ─── Post-Restore Validation ────────────────────────────────────────────────
log "Running post-restore validation..."
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
log "Tables restored: $TABLE_COUNT"

if [ "$TABLE_COUNT" -lt 5 ]; then
    log "⚠️  WARNING: Only $TABLE_COUNT tables found — expected at least 5. Verify restore completeness."
else
    log "✅ Post-restore validation passed"
fi
