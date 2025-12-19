#!/bin/bash

# Titan Trading System - Shutdown Script
# Gracefully stops all services

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Port assignments (must match start-titan.sh)
CONSOLE_PORT=3001      # titan-console
EXECUTION_PORT=3002    # titan-execution
BRAIN_PORT=3100        # titan-brain
SCAVENGER_PORT=8081    # titan-scavenger health

# PID file paths
PID_DIR="."
CONSOLE_PID="$PID_DIR/.console.pid"
EXECUTION_PID="$PID_DIR/.execution.pid"
BRAIN_PID="$PID_DIR/.brain.pid"
SCAVENGER_PID="$PID_DIR/.scavenger.pid"

# Maximum time to wait for graceful shutdown (seconds)
MAX_WAIT=10

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         TITAN TRADING SYSTEM - SHUTDOWN                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if process is running
is_running() {
    local pid=$1
    if ps -p $pid > /dev/null 2>&1; then
        return 0  # Process is running
    else
        return 1  # Process is not running
    fi
}

# Function to stop a service gracefully
stop_service() {
    local pid_file=$1
    local service_name=$2
    
    if [ ! -f "$pid_file" ]; then
        echo -e "${YELLOW}⚠️  $service_name PID file not found${NC}"
        return 0
    fi
    
    local pid=$(cat "$pid_file")
    
    if ! is_running $pid; then
        echo -e "${YELLOW}⚠️  $service_name not running (PID: $pid)${NC}"
        rm -f "$pid_file"
        return 0
    fi
    
    echo -e "${BLUE}🛑 Stopping $service_name (PID: $pid)...${NC}"
    
    # Send SIGTERM for graceful shutdown
    kill -TERM $pid 2>/dev/null || true
    
    # Wait for process to stop
    local wait_time=0
    while is_running $pid && [ $wait_time -lt $MAX_WAIT ]; do
        sleep 0.5
        wait_time=$((wait_time + 1))
    done
    
    # If still running, force kill
    if is_running $pid; then
        echo -e "${YELLOW}⚠️  $service_name did not stop gracefully, forcing...${NC}"
        kill -KILL $pid 2>/dev/null || true
        sleep 1
    fi
    
    # Verify stopped
    if is_running $pid; then
        echo -e "${RED}❌ Failed to stop $service_name${NC}"
        return 1
    else
        echo -e "${GREEN}✅ $service_name stopped${NC}"
        rm -f "$pid_file"
        return 0
    fi
}

# Stop services in reverse order (Console -> Scavenger -> Execution -> Brain)

# Step 1: Stop titan-console
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Stopping titan-console${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
stop_service "$CONSOLE_PID" "titan-console"

# Step 2: Stop titan-scavenger
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Stopping titan-scavenger${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
stop_service "$SCAVENGER_PID" "titan-scavenger"

# Step 3: Stop titan-execution
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Stopping titan-execution${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
stop_service "$EXECUTION_PID" "titan-execution"

# Step 4: Stop titan-brain
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Stopping titan-brain${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
stop_service "$BRAIN_PID" "titan-brain"

# Step 5: Cleanup any remaining processes on ports
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 5: Cleanup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Kill any remaining processes on our ports
for port in $CONSOLE_PORT $EXECUTION_PORT $BRAIN_PORT $SCAVENGER_PORT; do
    pid=$(lsof -ti:$port 2>/dev/null || true)
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}⚠️  Found process on port $port (PID: $pid), killing...${NC}"
        kill -KILL $pid 2>/dev/null || true
    fi
done

# Remove Unix Domain Socket if it exists
IPC_SOCKET="/tmp/titan-ipc.sock"
if [ -S "$IPC_SOCKET" ]; then
    echo -e "${BLUE}🧹 Removing IPC socket: $IPC_SOCKET${NC}"
    rm -f "$IPC_SOCKET"
fi

# Step 6: Optionally stop supporting services
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 6: Supporting Services${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Ask if user wants to stop PostgreSQL and Redis
read -p "Stop PostgreSQL and Redis? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Stopping PostgreSQL...${NC}"
    brew services stop postgresql@14 2>/dev/null || brew services stop postgresql 2>/dev/null || true
    echo -e "${BLUE}Stopping Redis...${NC}"
    brew services stop redis 2>/dev/null || true
    echo -e "${GREEN}✅ Supporting services stopped${NC}"
else
    echo -e "${YELLOW}⚠️  PostgreSQL and Redis left running${NC}"
fi

# Verify all processes stopped
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Verification${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

all_stopped=true

for port in $CONSOLE_PORT $EXECUTION_PORT $BRAIN_PORT $SCAVENGER_PORT; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}❌ Port $port still in use${NC}"
        all_stopped=false
    else
        echo -e "${GREEN}✅ Port $port is free${NC}"
    fi
done

# Check for remaining PID files
for pid_file in "$CONSOLE_PID" "$EXECUTION_PID" "$BRAIN_PID" "$SCAVENGER_PID"; do
    if [ -f "$pid_file" ]; then
        echo -e "${YELLOW}⚠️  Stale PID file: $pid_file${NC}"
        rm -f "$pid_file"
    fi
done

# Final status
echo ""
if [ "$all_stopped" = true ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         TITAN TRADING SYSTEM - STOPPED                     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}✅ All services stopped successfully${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║         TITAN TRADING SYSTEM - SHUTDOWN FAILED             ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}❌ Some services failed to stop${NC}"
    echo -e "${YELLOW}   Try running: killall -9 node${NC}"
    echo ""
    exit 1
fi
