#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Titan Trading System - VPS Deployment Script${NC}"

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker is not installed.${NC}"
    exit 1
fi

# Check for Docker Compose
if ! command -v docker-compose &> /dev/null; then
    # Try docker compose plugin
    if ! docker compose version &> /dev/null; then
         echo -e "${RED}Error: docker-compose is not installed.${NC}"
         exit 1
    fi
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo -e "${YELLOW}📍 working directory: $(pwd)${NC}"

# Check for .env
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found! Copying .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ .env created. PLEASE EDIT IT with production secrets!${NC}"
        # We don't exit here, but the user should know
    else
        echo -e "${RED}Error: .env.example not found. Cannot configure environment.${NC}"
        exit 1
    fi
fi

# Pull latest changes (if inside a git repo)
if [ -d .git ]; then
    echo -e "${YELLOW}⬇️  Pulling latest code...${NC}"
    git pull origin main
fi

# Build and Start
echo -e "${YELLOW}🏗️  Building and Starting Services...${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml up -d --build --remove-orphans

echo -e "${YELLOW}🧹 Pruning unused images...${NC}"
docker image prune -f

echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "   - Traefik: http://localhost (or configured domain)"
echo -e "   - Console: https://<domain>"
echo -e "   - Brain:   Internal port 3100"

# Health check summary
echo -e "${YELLOW}🏥 Checking container status...${NC}"
$COMPOSE_CMD -f docker-compose.prod.yml ps

exit 0
