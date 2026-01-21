#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting Production Deployment...${NC}"

# 1. Validation
echo "Validating environment..."
if [ -z "$docker-compose" ] && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose not found${NC}"
    exit 1
fi

# 2. Build Services from Monorepo
echo "Building services..."
# Assuming we run this from project root
npm install
npm run build --workspaces

# 3. Test
echo "Running critical tests..."
# Start with just unit tests to be fast
npm run test:unit --workspace=titan-brain

# 4. Infrastructure Check
echo "Checking infrastructure..."
# Ensure network exists
docker network create titan-network 2>/dev/null || true

# 5. Deployment (Rolling Update via Docker Compose)
echo "Deploying containers..."
docker-compose -f docker-compose.prod.yml up -d --build --remove-orphans

# 6. Health Check (Simple Wait)
echo "Waiting for services to stabilize..."
sleep 10
if docker-compose -f docker-compose.prod.yml ps | grep -q "Exit"; then
    echo -e "${RED}Deployment Failed! Some containers exited.${NC}"
    docker-compose -f docker-compose.prod.yml logs --tail=50
    exit 1
fi

echo -e "${GREEN}Deployment Successful!${NC}"
