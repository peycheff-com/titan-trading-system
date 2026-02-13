#!/bin/bash
set -euo pipefail
set -e

# 06 Dull Deployment Standard implementation
# Strategy: Stop → Migrate → Start (sequential, with downtime window)
# This is NOT blue/green. Accepted trade-off: brief downtime during deploy.
# Rollback: automated stop + restart on smoke failure.
# Usage: ./scripts/deploy_prod.sh [GIT_SHA]

TAG=${1:-latest}
echo "🚀 Deploying Titan (Tag: $TAG)..."

# 1. Verification
if [ ! -f .env ]; then
    echo "❌ FATAL: .env file missing!"
    exit 1
fi

# 1.5. Environment Validation
echo "🔍 Validating environment..."
./scripts/ops/validate_prod_env.sh .env

# 2. Export Tag
export TITAN_TAG=$TAG

# 3. Pull Images
echo "📥 Pulling images..."
docker compose -f docker-compose.prod.yml pull

# 4. Stop (Graceful)
echo "🛑 Stopping services..."
docker compose -f docker-compose.prod.yml stop

# 5. Database Migrations (Idempotent — tracked via _titan_migrations table)
echo "📦 Running migrations..."
docker compose -f docker-compose.prod.yml run --rm brain npm run db:migrate

# 6. Start
echo "✅ Starting services..."
docker compose -f docker-compose.prod.yml up -d

# 7. Smoke Test
echo "💨 Running smoke tests..."
./scripts/smoke_prod.sh

if [ $? -eq 0 ]; then
    echo "🎉 Deployment Successful!"
    # Log success
    echo "$(date): $TAG SUCCESS" >> deployment_log.txt
else
    echo "🚨 SMOKE TEST FAILED! ROLLING BACK..."
    echo "🔄 Rolling back to previous state..."
    docker compose -f docker-compose.prod.yml stop
    docker compose -f docker-compose.prod.yml up -d
    echo "$(date): $TAG FAILED — rollback executed" >> deployment_log.txt
    exit 1
fi
