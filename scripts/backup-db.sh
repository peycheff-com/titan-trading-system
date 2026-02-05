#!/bin/bash
set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_CONTAINER="${DB_CONTAINER:-titan-postgres}"
DB_USER="${DB_USER:-titan}"
DB_NAME="${DB_NAME:-titan_brain}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${BACKUP_DIR}/titan_brain_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "Starting backup of ${DB_NAME} from container ${DB_CONTAINER}..."

# Execute dump
docker exec -t "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILENAME"

echo "Backup completed successfully: $FILENAME"
echo "Size: $(du -h "$FILENAME" | cut -f1)"

# Prune old backups (keep last 7 days)
find "$BACKUP_DIR" -name "titan_brain_*.sql.gz" -mtime +7 -delete
echo "Pruned backups older than 7 days."
