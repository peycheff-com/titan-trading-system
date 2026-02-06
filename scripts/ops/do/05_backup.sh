#!/bin/bash
# =============================================================================
# 05_backup.sh - Production backup wrapper
# =============================================================================
# Wrapper around the main backup script with sensible defaults.
# Usage: ./05_backup.sh [full|db|jetstream]
# =============================================================================

set -euo pipefail

TITAN_ROOT="/opt/titan"
BACKUP_SCRIPT="${TITAN_ROOT}/current/scripts/ops/backup-production.sh"

# Check if main backup script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "ERROR: Backup script not found at ${BACKUP_SCRIPT}"
    echo "Ensure a deployment is active (current symlink exists)"
    exit 1
fi

MODE="${1:-full}"

case "$MODE" in
    full)
        echo "Running full backup (PostgreSQL + JetStream)..."
        bash "$BACKUP_SCRIPT"
        ;;
    db)
        echo "Running database backup only..."
        bash "$BACKUP_SCRIPT" --db-only
        ;;
    jetstream)
        echo "Running JetStream backup only..."
        bash "$BACKUP_SCRIPT" --jetstream-only
        ;;
    *)
        echo "Usage: $0 [full|db|jetstream]"
        exit 1
        ;;
esac
