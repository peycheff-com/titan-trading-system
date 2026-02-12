#!/bin/bash
# =============================================================================
# 05_backup.sh - Production backup wrapper
# =============================================================================
# Wrapper around the main backup script with sensible defaults.
# Usage: ./05_backup.sh [all|postgres|jetstream|redis|verify]
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

MODE="${1:-all}"

case "$MODE" in
    all)
        echo "Running full backup (PostgreSQL + JetStream + Redis)..."
        bash "$BACKUP_SCRIPT" all
        ;;
    postgres)
        echo "Running database backup only..."
        bash "$BACKUP_SCRIPT" postgres
        ;;
    jetstream)
        echo "Running JetStream backup only..."
        bash "$BACKUP_SCRIPT" jetstream
        ;;
    redis)
        echo "Running Redis backup only..."
        bash "$BACKUP_SCRIPT" redis
        ;;
    verify)
        echo "Running backup verification..."
        bash "$BACKUP_SCRIPT" verify
        ;;
    *)
        echo "Usage: $0 [all|postgres|jetstream|redis|verify]"
        exit 1
        ;;
esac
