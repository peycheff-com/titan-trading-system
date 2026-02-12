#!/bin/bash
# =============================================================================
# test_fresh_bootstrap.sh — CI: Verify all migrations apply from empty DB
# =============================================================================
# Spins up an ephemeral Postgres container, runs all migrations, and validates
# schema matches expectations. Exits 0 on success, 1 on failure.
#
# Usage: ./scripts/ci/test_fresh_bootstrap.sh
# =============================================================================
set -euo pipefail

CONTAINER_NAME="titan-migration-test-$$"
DB_PORT="54320"
DB_URL="postgres://postgres:test_password@localhost:${DB_PORT}/titan_test"

cleanup() {
    echo "🧹 Cleaning up test container..."
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

echo "🧪 Fresh DB Bootstrap Test"
echo ""

# Start ephemeral Postgres
echo "1️⃣  Starting ephemeral Postgres..."
docker run -d \
    --name "$CONTAINER_NAME" \
    -e POSTGRES_PASSWORD=test_password \
    -e POSTGRES_DB=titan_test \
    -p "${DB_PORT}:5432" \
    postgres:16-alpine \
    >/dev/null

# Wait for Postgres to be ready
echo "   Waiting for Postgres..."
for i in $(seq 1 30); do
    if pg_isready -h localhost -p "$DB_PORT" -U postgres -q 2>/dev/null; then
        break
    fi
    sleep 1
done

if ! pg_isready -h localhost -p "$DB_PORT" -U postgres -q 2>/dev/null; then
    echo "❌ FATAL: Postgres did not become ready in 30s"
    exit 1
fi

echo "   ✅ Postgres is ready"
echo ""

# Run migrations
echo "2️⃣  Running migrations..."
if ./scripts/ops/run_migrations.sh "$DB_URL"; then
    echo "   ✅ All migrations applied"
else
    echo "   ❌ Migration failed"
    exit 1
fi

echo ""

# Validate schema
echo "3️⃣  Validating schema..."
TABLES=$(psql "$DB_URL" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
VIEWS=$(psql "$DB_URL" -tAc "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public'")

echo "   Tables: $TABLES"
echo "   Views:  $VIEWS"

if [ "$TABLES" -lt 1 ]; then
    echo "   ❌ No tables created — migrations may be empty or broken"
    exit 1
fi

# Run idempotency check (run migrations again — should skip all)
echo ""
echo "4️⃣  Idempotency check (re-running migrations)..."
if ./scripts/ops/run_migrations.sh "$DB_URL" 2>&1 | grep -q "Applied: 0"; then
    echo "   ✅ Idempotent — no migrations re-applied"
else
    echo "   ❌ Idempotency check failed"
    exit 1
fi

echo ""
echo "✅ Fresh bootstrap test PASSED."
