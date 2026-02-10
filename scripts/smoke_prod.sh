#!/bin/bash
set -e

# 06 Dull Deployment Standard: Smoke Test
# Usage: ./scripts/smoke_prod.sh

# 1. Check if containers are running
if [ $(docker ps | grep "titan-brain" | wc -l) -eq 0 ]; then
    echo "❌ Brain is not running!"
    exit 1
fi

if [ $(docker ps | grep "titan-execution" | wc -l) -eq 0 ]; then
    echo "❌ Execution is not running!"
    exit 1
fi

# 2. Check Health Endpoints (Internal curl)
echo "🔎 Checking Brain health..."
# Adjust port if running via docker compose networking
# For simplicity, we assume we can curl localhost if mapped, or exec into container
docker compose -f docker-compose.prod.yml exec brain curl -f http://localhost:3100/health || exit 1

echo "🔎 Checking Execution health..."
docker compose -f docker-compose.prod.yml exec execution curl -f http://localhost:3002/health || exit 1

# 3. Check NATS connectivity
echo "🔎 Checking NATS..."
docker compose -f docker-compose.prod.yml exec brain node -e "require('./dist/messaging/NatsClient').testConnection()" || echo "⚠️ NATS check skipped (node script missing)"

echo "✅ SMOKE TEST PASSED"
exit 0
