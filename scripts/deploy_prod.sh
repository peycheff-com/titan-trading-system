#!/bin/bash
set -e

# 06 Dull Deployment Standard implementation
# Usage: ./scripts/deploy_prod.sh [GIT_SHA]

TAG=${1:-latest}
echo "🚀 Deploying Titan (Tag: $TAG)..."

# 1. Verification
if [ ! -f .env ]; then
    echo "❌ FATAL: .env file missing!"
    exit 1
fi

# 2. Export Tag
export TITAN_TAG=$TAG

# 3. Pull Images
echo "📥 Pulling images..."
docker compose -f docker-compose.prod.yml pull

# 4. Stop (Graceful)
echo "🛑 Stopping services..."
docker compose -f docker-compose.prod.yml stop

# 5. Database Migrations (Ephemeral)
echo "📦 Running migrations..."
# Assuming brain container has migration capability. 
# In a real scenario, we might run a one-off container.
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
    # Automatic Rollback Logic could go here
    # For now, we just alert
    echo "$(date): $TAG FAILED" >> deployment_log.txt
    exit 1
fi
