#!/bin/bash
set -e

# Configuration
COMPOSE_FILE="docker-compose.staging.yml"
SERVICES=("titan-brain-staging" "titan-execution-staging" "titan-console-staging" "titan-nats-staging" "titan-redis-staging" "titan-db-staging" "traefik-staging")

echo "🛡️  Starting Staging Deployment..."

# 1. Build new images
echo "🏗️  Building new images for staging..."
if ! docker-compose -f $COMPOSE_FILE build; then
    echo "❌ Build failed. Aborting."
    exit 1
fi

# 2. Deploy
echo "🚀 Deploying to staging..."
docker-compose -f $COMPOSE_FILE up -d --remove-orphans

# 3. Verification
echo "mw  Verifying deployment..."
# Wait for services to start
sleep 10
if docker-compose -f $COMPOSE_FILE ps | grep -q "Exit"; then
    echo "❌ Deployment Failed! Some containers exited."
    docker-compose -f $COMPOSE_FILE logs --tail=50
    exit 1
else
    echo "✅ Staging Deployment Successful!"
    docker-compose -f $COMPOSE_FILE ps
    exit 0
fi
