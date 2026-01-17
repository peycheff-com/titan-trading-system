#!/bin/bash
set -e

# Staging Configuration
export NODE_ENV=staging
export PORT=3101          # Brain
export EXECUTION_PORT=3003
export SCAVENGER_PORT=8082
export CONSOLE_PORT=5174

# Database Config (Staging)
export DB_HOST=localhost
export DB_PORT=5433
export DB_NAME=titan_brain_staging
export DB_USER=titan_staging
export DB_PASSWORD=staging_password

# Redis Config (Staging)
export REDIS_HOST=localhost
export REDIS_PORT=6380

# NATS Config (Staging)
export NATS_URL=nats://localhost:4223

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Deploying TITAN STAGING ENVIRONMENT...${NC}"

# 1. Start Infrastructure
echo -e "${BLUE}Step 1: Starting Docker Infrastructure...${NC}"
docker compose -f docker-compose.staging.yml up -d
echo -e "${GREEN}✅ Infrastructure Up (DB: 5433, Redis: 6380, NATS: 4223)${NC}"

# Wait for health
echo -e "${BLUE}Waiting for services to be healthy...${NC}"
sleep 5

# 2. Start Brain (Staging)
echo -e "${BLUE}Step 2: Starting Brain (Port $PORT)...${NC}"
cd services/titan-brain
# Ensure DB is migrated
npm run migrate
# Start Brain
# We use nohup to keep it running, logging to distinct file
nohup npm run start > ../../logs/brain.staging.log 2>&1 &
BRAIN_PID=$!
echo $BRAIN_PID > ../../logs/brain.staging.pid
echo -e "${GREEN}✅ Brain Started (PID: $BRAIN_PID)${NC}"
cd ../..

# 3. Start Execution (Staging)
echo -e "${BLUE}Step 3: Starting Execution Engine (Port $EXECUTION_PORT)...${NC}"
cd services/titan-execution-rs
# Export necessary vars for Rust app if it uses env vars, usually .env or env vars work
export SERVER_PORT=$EXECUTION_PORT
export NATS_ADDRESS=127.0.0.1:4223
nohup ./target/release/titan-execution-rs > ../../logs/execution.staging.log 2>&1 &
EXECUTION_PID=$!
echo $EXECUTION_PID > ../../logs/execution.staging.pid
echo -e "${GREEN}✅ Execution Engine Started (PID: $EXECUTION_PID)${NC}"
cd ../..

# 4. Start Scavenger (Staging)
echo -e "${BLUE}Step 4: Starting Scavenger (Port $SCAVENGER_PORT)...${NC}"
cd services/titan-phase1-scavenger
export PORT=$SCAVENGER_PORT
# Scavenger needs to know where Execution is
export EXECUTION_API_URL=http://localhost:$EXECUTION_PORT
nohup npm run start > ../../logs/scavenger.staging.log 2>&1 &
SCAVENGER_PID=$!
echo $SCAVENGER_PID > ../../logs/scavenger.staging.pid
echo -e "${GREEN}✅ Scavenger Started (PID: $SCAVENGER_PID)${NC}"
cd ../..

echo -e "\n${GREEN}🎉 STAGING DEPLOYMENT COMPLETE!${NC}"
echo -e "Brain: http://localhost:$PORT"
echo -e "Execution: http://localhost:$EXECUTION_PORT"
echo -e "Scavenger: http://localhost:$SCAVENGER_PORT"
echo -e "Logs: ./logs/*.staging.log"
echo -e "To stop: kill \$(cat logs/*.staging.pid) && docker compose -f docker-compose.staging.yml down"
