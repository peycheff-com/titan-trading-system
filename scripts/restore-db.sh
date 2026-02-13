#!/bin/bash
set -euo pipefail
set -e

BACKUP_DIR="./backups"
TARGET_DB_URL="${TITAN_DB_URL:-postgres://postgres:postgres@localhost:5432/titan_brain}"

echo "Titan Database Restore Tool"
echo "==========================="

# List available backups
echo "Available backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found."
echo ""

read -p "Enter backup filename to restore (e.g., titan_backup_20260118.sql.gz): " BACKUP_FILE

FULL_PATH="$BACKUP_DIR/$BACKUP_FILE"

if [ ! -f "$FULL_PATH" ]; then
    echo "Error: File $FULL_PATH not found."
    exit 1
fi

echo "Restoring from: $FULL_PATH"
echo "Target: $TARGET_DB_URL"
echo "WARNING: This will overwrite existing data in the target database!"
read -p "Are you sure? (y/N) " confirm

if [[ $confirm != [yY] ]]; then
    echo "Restore cancelled."
    exit 0
fi

echo "Restoring..."
gunzip -c "$FULL_PATH" | psql "$TARGET_DB_URL"

echo "Restore completed successfully."
