#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file_path>"
    exit 1
fi

BACKUP_FILE="$1"

# Configuration
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-titan_brain}

echo "⚠️  WARNING: This will overwrite data in ${DB_NAME}."
read -p "Are you sure? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo "📦 Restoring from ${BACKUP_FILE}..."

if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
else
    PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" < "$BACKUP_FILE"
fi

echo "✅ Restore completed."
