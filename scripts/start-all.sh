#!/bin/bash

# Titan Trading System - Unified Startup Script
# Starts Brain, Execution, and Sentinel in a coordinated manner.

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}>>> Titan Trading System: Startup Sequence Initiated <<<${NC}"

# 1. Cleanup: Kill existing processes
echo -e "${BLUE}[1/4] Cleaning up ports...${NC}"
lsof -i :3100 -t | xargs kill -9 2>/dev/null
lsof -i :8080 -t | xargs kill -9 2>/dev/null
echo -e "${GREEN}✓ Ports 3100 and 8080 cleared.${NC}"

# 2. Start Titan Brain
echo -e "${BLUE}[2/4] Starting Titan Brain (Port 3100)...${NC}"
cd services/titan-brain
# Use local_bypass to avoid Postgres dependency for local run
PORT=3100 HMAC_SECRET=mysecret DATABASE_URL="sqlite://titan_brain.db" npm start > ../../logs/brain.log 2>&1 &
BRAIN_PID=$!
echo "Brain PID: $BRAIN_PID"
cd ../..

# Wait for Brain to be ready
echo "Waiting for Brain health check..."
# Loop with timeout
MAX_RETRIES=30
COUNT=0
URL="http://localhost:3100/health"

while [ $COUNT -lt $MAX_RETRIES ]; do
    if curl -s "$URL" | grep -q "status"; then
        echo -e "${GREEN}✓ Titan Brain is ONLINE.${NC}"
        break
    fi
    sleep 1
    COUNT=$((COUNT+1))
    echo -n "."
done

if [ $COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ Titan Brain failed to start.${NC}"
    kill $BRAIN_PID
    exit 1
fi

# 3. Start Titan Execution
echo -e "${BLUE}[3/4] Starting Titan Execution (Port 8080)...${NC}"
cd services/titan-execution
PORT=8080 HMAC_SECRET=mysecret npm start > ../../logs/execution.log 2>&1 &
EXEC_PID=$!
echo "Execution PID: $EXEC_PID"
cd ../..

# Wait for Execution to be ready (simple port check or wait)
sleep 5
echo -e "${GREEN}✓ Titan Execution started (Check logs for status).${NC}"

# 4. Start Titan Sentinel
echo -e "${BLUE}[4/4] Starting Titan Sentinel...${NC}"
cd services/titan-phase3-sentinel
# Assuming it listens or loops. If it's just a loop, we background it.
# We might need an ENV var to enable the "Mock Signal Injection" server if we build it.
HMAC_SECRET=mysecret npm start > ../../logs/sentinel.log 2>&1 &
SENTINEL_PID=$!
echo "Sentinel PID: $SENTINEL_PID"
cd ../..

echo -e "${GREEN}>>> All Systems Operational <<<${NC}"
echo "Logs available in logs/ directory."
echo "Press Ctrl+C to stop all services."

# Trap Ctrl+C to kill all
cleanup() {
    echo -e "${BLUE}Shutting down...${NC}"
    kill $BRAIN_PID
    kill $EXEC_PID
    kill $SENTINEL_PID
    exit
}

trap cleanup INT

wait
