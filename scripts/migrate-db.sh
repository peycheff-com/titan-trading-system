#!/bin/bash
set -e

# Configuration
SOURCE_DB_URL="" # User must provide or set env var
TARGET_DB_URL="${TITAN_DB_URL:-postgres://postgres:postgres@localhost:5432/titan_brain}"

echo "Titan Database Migration Tool"
echo "============================="

if [ -z "$SOURCE_DB_URL" ]; then
    read -p "Enter Source Database URL (Supabase): " SOURCE_DB_URL
fi

if [ -z "$SOURCE_DB_URL" ]; then
    echo "Error: Source Database URL is required."
    exit 1
fi

echo "Migrating from:"
echo "  Source: [HIDDEN]"
echo "  Target: $TARGET_DB_URL"
echo ""
read -p "Are you sure you want to proceed? (y/N) " confirm
if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
    echo "Migration cancelled."
    exit 0
fi

echo "Step 1: Dumping source schema and data..."
pg_dump "$SOURCE_DB_URL" --no-owner --no-acl --format=c > titan_dump.fc

echo "Step 2: Restoring to target..."
pg_restore --verbose --clean --no-acl --no-owner -d "$TARGET_DB_URL" titan_dump.fc

echo "Step 3: Cleanup..."
rm titan_dump.fc

echo "Migration completed successfully!"
