#!/bin/bash
set -e

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="${TITAN_ENV_FILE:-.env.prod}"
SERVICES=("titan-brain" "titan-execution" "titan-console" "titan-scavenger" "titan-hunter" "titan-sentinel" "titan-ai-quant" "titan-powerlaw-lab" "titan-console-api" "titan-opsd")

echo "🛡️  Starting Safe Deployment..."

# 1. Backup current images
echo "💾 Backing up current images..."
for svc in "${SERVICES[@]}"; do
    if docker image inspect "$svc:latest" > /dev/null 2>&1; then
        docker tag "$svc:latest" "$svc:backup"
    fi
done

# 2. Build new images
echo "🏗️  Building new images..."
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build; then
    echo "❌ Build failed. Aborting."
    exit 1
fi

# 3. Deploy
echo "🚀 Deploying..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans

# 4. Verification
echo "🔎 Verifying deployment..."
if ./scripts/ops/health_check.sh; then
    echo "✅ Deployment Successful!"
    # Optional: cleanup backups
    exit 0
else
    echo "❌ Health check failed! Initiating ROLLBACK..."
    
    # 5. Rollback
    for svc in "${SERVICES[@]}"; do
        if docker image inspect "$svc:backup" > /dev/null 2>&1; then
            echo "Reverting $svc..."
            docker tag "$svc:backup" "$svc:latest"
        fi
    done
    
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
    echo "🔄 Rollback complete. Checking health of rolled-back state..."
    ./scripts/ops/health_check.sh
    exit 1
fi
