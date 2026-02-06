#!/bin/bash
# =============================================================================
# 06_restore_drill.sh - Documented restore procedure (drill mode)
# =============================================================================
# This script documents and optionally executes a restore procedure.
# DANGER: Only run in drill mode unless you need actual restore.
#
# Usage: ./06_restore_drill.sh [--execute]
# =============================================================================

set -euo pipefail

TITAN_ROOT="/opt/titan"
BACKUP_DIR="${TITAN_ROOT}/backups"
DRILL_MODE=true

if [ "${1:-}" = "--execute" ]; then
    DRILL_MODE=false
    echo "⚠️  EXECUTING ACTUAL RESTORE - NOT A DRILL"
    read -p "Are you sure? This will overwrite production data. (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Aborted."
        exit 1
    fi
fi

echo "============================================================"
if $DRILL_MODE; then
    echo "RESTORE DRILL (No changes will be made)"
else
    echo "RESTORE EXECUTION"
fi
echo "============================================================"
echo ""

# Step 1: List available backups
echo "Step 1: Available backups"
echo "--------------------------"
if [ -d "$BACKUP_DIR" ]; then
    ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No .sql.gz backups found"
    ls -la "$BACKUP_DIR"/*.rdb 2>/dev/null || echo "No Redis backups found"
else
    echo "Backup directory not found: $BACKUP_DIR"
fi
echo ""

# Step 2: Find latest backup
echo "Step 2: Identify restore target"
echo "--------------------------------"
LATEST_PG=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1 || echo "")
if [ -n "$LATEST_PG" ]; then
    echo "Latest PostgreSQL backup: $LATEST_PG"
    echo "Size: $(ls -lh "$LATEST_PG" | awk '{print $5}')"
else
    echo "No PostgreSQL backup found!"
fi
echo ""

# Step 3: Stop services (except infra)
echo "Step 3: Stop application services"
echo "----------------------------------"
if $DRILL_MODE; then
    echo "[DRILL] Would stop: titan-brain, titan-execution, trading phases"
else
    echo "Stopping application services..."
    docker stop titan-brain titan-execution titan-scavenger titan-hunter titan-sentinel 2>/dev/null || true
fi
echo ""

# Step 4: Restore PostgreSQL
echo "Step 4: Restore PostgreSQL"
echo "--------------------------"
if [ -n "$LATEST_PG" ]; then
    if $DRILL_MODE; then
        echo "[DRILL] Would execute:"
        echo "  gunzip -c $LATEST_PG | docker exec -i titan-postgres psql -U titan_user -d titan"
    else
        echo "Restoring from $LATEST_PG..."
        gunzip -c "$LATEST_PG" | docker exec -i titan-postgres psql -U titan_user -d titan
        echo "PostgreSQL restored."
    fi
fi
echo ""

# Step 5: Verify data
echo "Step 5: Verify restored data"
echo "----------------------------"
if $DRILL_MODE; then
    echo "[DRILL] Would verify table counts and recent records"
else
    echo "Checking table counts..."
    docker exec titan-postgres psql -U titan_user -d titan -c "\dt+"
fi
echo ""

# Step 6: Restart services
echo "Step 6: Restart services"
echo "------------------------"
if $DRILL_MODE; then
    echo "[DRILL] Would restart all services"
else
    echo "Restarting services..."
    cd "${TITAN_ROOT}/current"
    docker compose -f docker-compose.prod.yml --env-file "${TITAN_ROOT}/compose/.env.prod" up -d
fi
echo ""

# Summary
echo "============================================================"
if $DRILL_MODE; then
    echo "DRILL COMPLETE - No changes were made"
    echo ""
    echo "To execute actual restore, run:"
    echo "  ./06_restore_drill.sh --execute"
else
    echo "RESTORE COMPLETE"
    echo ""
    echo "Please run verification:"
    echo "  ./04_verify.sh"
fi
echo "============================================================"
