#!/bin/bash
set -euo pipefail

# Titan Trading System - Database Backup Script
# Usage: ./backup.sh

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/titan_brain_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Performa Backup
echo "[$(date)] Starting backup to ${BACKUP_FILE}..."

if docker exec titan-postgres pg_dump -U postgres titan_brain_production | gzip > "$BACKUP_FILE"; then
  echo "[$(date)] Backup completed successfully."
else
  echo "[$(date)] Backup failed!"
  exit 1
fi

# Retention Policy: Delete backups older than $RETENTION_DAYS days
echo "[$(date)] Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "titan_brain_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup operation finished."
