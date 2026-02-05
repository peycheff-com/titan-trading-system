#!/bin/bash
set -e

# Titan Trading System - Production Deployment Script
# Usage: ./scripts/deploy.sh [IMAGE_TAG]

TAG=${1:-latest}
echo "🚀 Deploying Titan Trading System (Tag: $TAG)..."

# 1. Update Code/Config
# git pull origin main

# 2. Pull Images
echo "📥 Pulling images..."
export IMAGE_TAG=$TAG
docker compose -f docker-compose.prod.yml pull

# 3. Deploy
echo "🔄 Updating services..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# 4. Verification
echo "✅ Validating health..."
./scripts/wait-for-health.sh # We might need to write this utility, or rely on internal healthchecks

echo "🎉 Deployment Complete!"
