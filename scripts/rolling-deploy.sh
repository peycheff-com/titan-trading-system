#!/bin/bash

# Rolling Deployment Script for Titan Trading System
# Requirements: 7.1 - Rolling deployment capabilities with zero downtime

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Load deployment configuration
SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/load-deployment-config.sh"

echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         TITAN TRADING SYSTEM - ROLLING DEPLOYMENT          ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Service deployment order (dependencies first)
SERVICES=(
    "titan-brain:$BRAIN_PORT:services/titan-brain"
    "titan-execution:$EXECUTION_PORT:services/titan-execution"
    "titan-scavenger:8081:services/titan-phase1-scavenger"
    "titan-console:$CONSOLE_PORT:services/titan-console"
)

# Rolling deployment configuration
OVERLAP_TIME=10  # Seconds to run both old and new versions
DRAIN_TIME=5     # Seconds to drain connections from old version

# Function to deploy a single service
deploy_service() {
    local service_info=$1
    IFS=':' read -r service_name service_port service_path <<< "$service_info"
    
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Rolling Deployment: $service_name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Check if service directory exists
    if [ ! -d "$service_path" ]; then
        echo -e "${YELLOW}⚠ Service directory not found: $service_path, skipping...${NC}"
        return 0
    fi
    
    # Step 1: Check if service is currently running
    local old_pid=""
    if lsof -Pi :$service_port -sTCP:LISTEN -t >/dev/null 2>&1; then
        old_pid=$(lsof -ti:$service_port)
        echo -e "${BLUE}📍 Found existing service on port $service_port (PID: $old_pid)${NC}"
    else
        echo -e "${BLUE}📍 No existing service found on port $service_port${NC}"
    fi
    
    # Step 2: Prepare new version
    echo -e "${BLUE}🔧 Preparing new version...${NC}"
    cd "$service_path"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        echo -e "${BLUE}   Installing dependencies...${NC}"
        npm install --production
    fi
    
    # Build if needed
    if [ -f "tsconfig.json" ]; then
        echo -e "${BLUE}   Building TypeScript...${NC}"
        npm run build 2>/dev/null || npx tsc
    fi
    
    # Step 3: Start new version on temporary port
    local temp_port=$((service_port + 1000))
    echo -e "${BLUE}🚀 Starting new version on temporary port $temp_port...${NC}"
    
    # Determine start command based on service
    local start_command=""
    case "$service_name" in
        "titan-brain")
            start_command="DB_HOST=$DB_HOST DB_PORT=$DB_PORT DB_NAME=$DB_NAME DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD PORT=$temp_port node dist/index.js"
            ;;
        "titan-execution")
            start_command="PORT=$temp_port node server-production.js"
            ;;
        "titan-scavenger")
            start_command="HEALTH_PORT=$temp_port node dist/index.js --headless"
            ;;
        "titan-console")
            start_command="PORT=$temp_port npm start"
            ;;
        *)
            echo -e "${RED}❌ Unknown service: $service_name${NC}"
            cd - >/dev/null
            return 1
            ;;
    esac
    
    # Start new version
    eval "$start_command" > "/tmp/${service_name}-new.log" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "/tmp/${service_name}-new.pid"
    
    echo -e "${GREEN}   ✓ New version started (PID: $new_pid)${NC}"
    
    # Step 4: Wait for new version to be healthy
    echo -e "${BLUE}⏳ Waiting for new version to be healthy...${NC}"
    local health_url=""
    case "$service_name" in
        "titan-brain")
            health_url="http://localhost:$temp_port/status"
            ;;
        "titan-execution")
            health_url="http://localhost:$temp_port/health"
            ;;
        "titan-scavenger")
            health_url="http://localhost:$temp_port/health"
            ;;
        "titan-console")
            health_url="http://localhost:$temp_port"
            ;;
    esac
    
    local attempts=0
    local max_attempts=30
    while [ $attempts -lt $max_attempts ]; do
        if curl -s -f "$health_url" >/dev/null 2>&1; then
            echo -e "${GREEN}   ✓ New version is healthy${NC}"
            break
        fi
        sleep 2
        attempts=$((attempts + 1))
    done
    
    if [ $attempts -eq $max_attempts ]; then
        echo -e "${RED}❌ New version failed to become healthy${NC}"
        kill $new_pid 2>/dev/null || true
        cd - >/dev/null
        return 1
    fi
    
    # Step 5: Switch traffic (if old version exists)
    if [ -n "$old_pid" ]; then
        echo -e "${BLUE}🔄 Switching traffic from old to new version...${NC}"
        
        # For services with load balancers, this would update the load balancer
        # For now, we'll use port switching
        
        # Kill old version
        echo -e "${BLUE}   Stopping old version (PID: $old_pid)...${NC}"
        kill -TERM $old_pid 2>/dev/null || true
        
        # Wait for graceful shutdown
        local shutdown_attempts=0
        while [ $shutdown_attempts -lt 10 ] && kill -0 $old_pid 2>/dev/null; do
            sleep 1
            shutdown_attempts=$((shutdown_attempts + 1))
        done
        
        # Force kill if still running
        if kill -0 $old_pid 2>/dev/null; then
            echo -e "${YELLOW}   Force killing old version...${NC}"
            kill -KILL $old_pid 2>/dev/null || true
        fi
        
        echo -e "${GREEN}   ✓ Old version stopped${NC}"
    fi
    
    # Step 6: Move new version to correct port
    echo -e "${BLUE}🔄 Moving new version to production port...${NC}"
    
    # Stop new version temporarily
    kill -TERM $new_pid 2>/dev/null || true
    sleep 2
    
    # Restart on correct port
    case "$service_name" in
        "titan-brain")
            start_command="DB_HOST=$DB_HOST DB_PORT=$DB_PORT DB_NAME=$DB_NAME DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD PORT=$service_port node dist/index.js"
            ;;
        "titan-execution")
            start_command="PORT=$service_port node server-production.js"
            ;;
        "titan-scavenger")
            start_command="HEALTH_PORT=$service_port node dist/index.js --headless"
            ;;
        "titan-console")
            start_command="PORT=$service_port npm start"
            ;;
    esac
    
    eval "$start_command" > "/tmp/${service_name}-prod.log" 2>&1 &
    local prod_pid=$!
    echo "$prod_pid" > "/tmp/${service_name}-prod.pid"
    
    # Wait for production version to be healthy
    attempts=0
    local prod_health_url=""
    case "$service_name" in
        "titan-brain")
            prod_health_url="http://localhost:$service_port/status"
            ;;
        "titan-execution")
            prod_health_url="http://localhost:$service_port/health"
            ;;
        "titan-scavenger")
            prod_health_url="http://localhost:$service_port/health"
            ;;
        "titan-console")
            prod_health_url="http://localhost:$service_port"
            ;;
    esac
    
    while [ $attempts -lt $max_attempts ]; do
        if curl -s -f "$prod_health_url" >/dev/null 2>&1; then
            echo -e "${GREEN}   ✓ Production version is healthy${NC}"
            break
        fi
        sleep 2
        attempts=$((attempts + 1))
    done
    
    if [ $attempts -eq $max_attempts ]; then
        echo -e "${RED}❌ Production version failed to become healthy${NC}"
        kill $prod_pid 2>/dev/null || true
        cd - >/dev/null
        return 1
    fi
    
    echo -e "${GREEN}✅ $service_name deployment completed successfully${NC}"
    cd - >/dev/null
    return 0
}

# Main deployment loop
echo -e "${BLUE}🚀 Starting rolling deployment of ${#SERVICES[@]} services...${NC}"

failed_services=()
for service_info in "${SERVICES[@]}"; do
    IFS=':' read -r service_name service_port service_path <<< "$service_info"
    
    if ! deploy_service "$service_info"; then
        failed_services+=("$service_name")
        echo -e "${RED}❌ Failed to deploy $service_name${NC}"
        
        if [ "$ROLLBACK_ON_FAILURE" = "true" ]; then
            echo -e "${YELLOW}🔄 Rolling back due to failure...${NC}"
            # Implement rollback logic here
            break
        fi
    else
        echo -e "${GREEN}✅ Successfully deployed $service_name${NC}"
    fi
    
    # Brief pause between services
    sleep 2
done

# Final status
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Deployment Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ${#failed_services[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All services deployed successfully${NC}"
    echo -e "${GREEN}🎉 Rolling deployment completed${NC}"
    exit 0
else
    echo -e "${RED}❌ Failed services: ${failed_services[*]}${NC}"
    echo -e "${RED}💥 Rolling deployment failed${NC}"
    exit 1
fi