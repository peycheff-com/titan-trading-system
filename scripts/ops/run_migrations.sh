#!/bin/bash
set -euo pipefail
# =============================================================================
# run_migrations.sh — Idempotent PostgreSQL migration runner
# =============================================================================
# Applies SQL migration files from services/titan-brain/migrations/ in order.
# Tracks applied migrations in _titan_migrations table with SHA256 hashes.
# Fails closed on any error. Safe to run repeatedly.
#
# Usage: ./scripts/ops/run_migrations.sh [DATABASE_URL]
# =============================================================================
set -euo pipefail

DB_URL="${1:-${TITAN_DB_URL:-${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/titan_brain}}}"
MIGRATIONS_DIR="services/titan-brain/migrations"

echo "🗄️  Titan Migration Runner"
echo "   Database: ${DB_URL%%@*}@***"
echo "   Migrations: ${MIGRATIONS_DIR}/"
echo ""

# Ensure migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "❌ FATAL: Migrations directory not found: $MIGRATIONS_DIR"
    exit 1
fi

# Create tracking table if not exists
psql "$DB_URL" -q <<'SQL'
CREATE TABLE IF NOT EXISTS _titan_migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

echo "📋 Scanning for pending migrations..."

APPLIED=0
SKIPPED=0
FAILED=0

# Process migration files in sorted order
for migration_file in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    filename=$(basename "$migration_file")
    sha256=$(shasum -a 256 "$migration_file" | awk '{print $1}')

    # Check if already applied
    existing_hash=$(psql "$DB_URL" -tAc "SELECT sha256 FROM _titan_migrations WHERE filename = '$filename'" 2>/dev/null || echo "")

    if [ -n "$existing_hash" ]; then
        if [ "$existing_hash" = "$sha256" ]; then
            SKIPPED=$((SKIPPED + 1))
            continue
        else
            echo "❌ FATAL: Migration $filename has changed since it was applied!"
            echo "   Expected: $existing_hash"
            echo "   Current:  $sha256"
            echo "   This indicates schema drift. Resolve manually."
            exit 1
        fi
    fi

    # Apply migration inside a transaction
    echo "  ▶ Applying: $filename"
    if psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$migration_file" -q; then
        # Record the migration
        psql "$DB_URL" -q -c "INSERT INTO _titan_migrations (filename, sha256) VALUES ('$filename', '$sha256')"
        APPLIED=$((APPLIED + 1))
        echo "  ✅ Applied: $filename"
    else
        echo "  ❌ FAILED: $filename"
        FAILED=$((FAILED + 1))
        exit 1
    fi
done

echo ""
echo "📊 Migration Summary:"
echo "   Applied: $APPLIED"
echo "   Skipped: $SKIPPED (already applied)"
echo "   Failed:  $FAILED"

if [ $FAILED -gt 0 ]; then
    echo ""
    echo "❌ Migration run FAILED."
    exit 1
else
    echo ""
    echo "✅ All migrations applied successfully."
fi
