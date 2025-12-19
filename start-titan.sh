#!/bin/bash

# Titan Trading System - Enhanced Startup Script
# Starts all services with advanced health checks, rolling deployment, and rollback capabilities
# Requirements: 7.1 - Enhanced deployment automation

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration - Port assignments
CONSOLE_PORT=3001      # titan-console (Next.js dashboard)
EXECUTION_PORT=3002    # titan-execution (Execution microservice)
BRAIN_PORT=3100        # titan-brain (Brain orchestrator)

# Database configuration (for titan-brain)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-titan_brain}"
DB_USER="${DB_USER:-$(whoami)}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Enhanced deployment configuration
MAX_WAIT=60            # Maximum seconds to wait for health checks
HEALTH_CHECK_INTERVAL=2 # Seconds between health checks
ROLLING_DEPLOYMENT="${ROLLING_DEPLOYMENT:-false}"
DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-standard}"  # standard, rolling, blue-green
BACKUP_ON_DEPLOY="${BACKUP_ON_DEPLOY:-true}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"
DEPLOYMENT_ID="deploy-$(date +%s)"

# Log file paths
LOG_DIR="./logs"
CONSOLE_LOG="$LOG_DIR/console.log"
EXECUTION_LOG="$LOG_DIR/execution.log"
BRAIN_LOG="$LOG_DIR/brain.log"

# PID file paths
PID_DIR="."
CONSOLE_PID="$PID_DIR/.console.pid"
EXECUTION_PID="$PID_DIR/.execution.pid"
BRAIN_PID="$PID_DIR/.brain.pid"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Create empty log files if they don't exist
touch "$CONSOLE_LOG" "$EXECUTION_LOG" "$BRAIN_LOG"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         TITAN TRADING SYSTEM - ENHANCED STARTUP            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Deployment ID: $DEPLOYMENT_ID${NC}"
echo -e "${CYAN}Deployment Mode: $DEPLOYMENT_MODE${NC}"
echo -e "${CYAN}Environment: ${NODE_ENV:-development}${NC}"
echo -e "${CYAN}Backup on Deploy: $BACKUP_ON_DEPLOY${NC}"
echo -e "${CYAN}Rollback on Failure: $ROLLBACK_ON_FAILURE${NC}"
echo ""

# ============================================================================
# Pre-deployment Validation
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Pre-deployment Validation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if ! validate_deployment_environment; then
    echo -e "${RED}❌ Environment validation failed${NC}"
    exit 1
fi

# Create deployment backup
create_deployment_backup

# Check for existing services and handle gracefully
echo -e "${BLUE}🔍 Checking for existing services...${NC}"
existing_services=()

if lsof -Pi :$BRAIN_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    existing_services+=("titan-brain:$BRAIN_PORT")
fi
if lsof -Pi :$EXECUTION_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    existing_services+=("titan-execution:$EXECUTION_PORT")
fi
if lsof -Pi :$CONSOLE_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    existing_services+=("titan-console:$CONSOLE_PORT")
fi

if [ ${#existing_services[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ Found existing services:${NC}"
    for service in "${existing_services[@]}"; do
        echo -e "   • $service"
    done
    
    if [ "$DEPLOYMENT_MODE" = "rolling" ]; then
        echo -e "${BLUE}🔄 Rolling deployment mode: will update services one by one${NC}"
    else
        echo -e "${YELLOW}🛑 Stopping existing services first...${NC}"
        ./stop-titan.sh
        sleep 3
    fi
fi

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Enhanced health check function with detailed monitoring
wait_for_health() {
    local url=$1
    local service_name=$2
    local max_attempts=$((MAX_WAIT / HEALTH_CHECK_INTERVAL))
    local attempt=0
    local start_time=$(date +%s)
    
    echo -e "${YELLOW}⏳ Waiting for $service_name health check...${NC}"
    echo -e "   URL: $url"
    echo -e "   Timeout: ${MAX_WAIT}s (checking every ${HEALTH_CHECK_INTERVAL}s)"
    
    while [ $attempt -lt $max_attempts ]; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        # Try health check with detailed response
        local response=$(curl -s -w "HTTP_CODE:%{http_code};TIME:%{time_total}" "$url" 2>/dev/null || echo "FAILED")
        
        if echo "$response" | grep -q "HTTP_CODE:200"; then
            local response_time=$(echo "$response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)
            echo -e "${GREEN}✅ $service_name is healthy (${elapsed}s, ${response_time}s response)${NC}"
            
            # Additional service-specific health checks
            case "$service_name" in
                "titan-brain")
                    check_brain_health "$url"
                    ;;
                "titan-execution")
                    check_execution_health "$url"
                    ;;
                "titan-scavenger")
                    check_scavenger_health "$url"
                    ;;
            esac
            
            return 0
        fi
        
        # Show progress
        local progress=$((attempt * 100 / max_attempts))
        echo -e "${CYAN}   Progress: ${progress}% (${elapsed}s elapsed)${NC}"
        
        sleep $HEALTH_CHECK_INTERVAL
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ $service_name health check failed after ${MAX_WAIT}s${NC}"
    echo -e "${RED}   Last response: $response${NC}"
    return 1
}

# Service-specific health checks
check_brain_health() {
    local base_url=$1
    local status_response=$(curl -s "${base_url}/status" 2>/dev/null || echo "{}")
    
    # Check database connection
    if echo "$status_response" | grep -q '"database":"connected"'; then
        echo -e "${GREEN}   ✓ Database connection healthy${NC}"
    else
        echo -e "${YELLOW}   ⚠ Database connection status unknown${NC}"
    fi
    
    # Check WebSocket status
    if echo "$status_response" | grep -q '"websocket":"active"'; then
        echo -e "${GREEN}   ✓ WebSocket server active${NC}"
    else
        echo -e "${YELLOW}   ⚠ WebSocket server status unknown${NC}"
    fi
}

check_execution_health() {
    local base_url=$1
    local health_response=$(curl -s "${base_url}/health" 2>/dev/null || echo "{}")
    
    # Check broker connections
    if echo "$health_response" | grep -q '"brokers"'; then
        echo -e "${GREEN}   ✓ Broker connections available${NC}"
    else
        echo -e "${YELLOW}   ⚠ Broker connection status unknown${NC}"
    fi
    
    # Check WebSocket status
    if echo "$health_response" | grep -q '"websocket"'; then
        echo -e "${GREEN}   ✓ WebSocket servers active${NC}"
    else
        echo -e "${YELLOW}   ⚠ WebSocket server status unknown${NC}"
    fi
}

check_scavenger_health() {
    local base_url=$1
    local health_response=$(curl -s "${base_url}/health" 2>/dev/null || echo "{}")
    
    # Check Binance connection
    if echo "$health_response" | grep -q '"binance"'; then
        echo -e "${GREEN}   ✓ Binance connection active${NC}"
    else
        echo -e "${YELLOW}   ⚠ Binance connection status unknown${NC}"
    fi
    
    # Check IPC connection
    if echo "$health_response" | grep -q '"ipc"'; then
        echo -e "${GREEN}   ✓ IPC connection active${NC}"
    else
        echo -e "${YELLOW}   ⚠ IPC connection status unknown${NC}"
    fi
}

# Enhanced cleanup and rollback functions
cleanup() {
    echo -e "\n${YELLOW}🛑 Deployment interrupted, cleaning up...${NC}"
    
    if [ "$ROLLBACK_ON_FAILURE" = "true" ] && [ -n "$DEPLOYMENT_ID" ]; then
        echo -e "${YELLOW}🔄 Initiating automatic rollback...${NC}"
        rollback_deployment
    else
        ./stop-titan.sh
    fi
    
    exit 1
}

# Rollback function
rollback_deployment() {
    echo -e "${PURPLE}🔄 Rolling back deployment $DEPLOYMENT_ID...${NC}"
    
    # Stop current services
    ./stop-titan.sh 2>/dev/null || true
    
    # Restore database backups if they exist
    if [ -f "services/titan-execution/titan_execution.db.backup-$DEPLOYMENT_ID" ]; then
        echo -e "${BLUE}📦 Restoring execution database...${NC}"
        mv "services/titan-execution/titan_execution.db.backup-$DEPLOYMENT_ID" "services/titan-execution/titan_execution.db"
    fi
    
    if [ -f "services/titan-brain/brain.db.backup-$DEPLOYMENT_ID" ]; then
        echo -e "${BLUE}📦 Restoring brain database...${NC}"
        mv "services/titan-brain/brain.db.backup-$DEPLOYMENT_ID" "services/titan-brain/brain.db"
    fi
    
    # Restore previous service versions if available
    if [ -d ".deployment-backup-$DEPLOYMENT_ID" ]; then
        echo -e "${BLUE}📦 Restoring service configurations...${NC}"
        cp -r ".deployment-backup-$DEPLOYMENT_ID/"* . 2>/dev/null || true
        rm -rf ".deployment-backup-$DEPLOYMENT_ID"
    fi
    
    echo -e "${GREEN}✅ Rollback completed${NC}"
}

# Create deployment backup
create_deployment_backup() {
    if [ "$BACKUP_ON_DEPLOY" = "true" ]; then
        echo -e "${BLUE}💾 Creating deployment backup...${NC}"
        
        # Backup databases
        if [ -f "services/titan-execution/titan_execution.db" ]; then
            cp "services/titan-execution/titan_execution.db" "services/titan-execution/titan_execution.db.backup-$DEPLOYMENT_ID"
            echo -e "${GREEN}   ✓ Execution database backed up${NC}"
        fi
        
        if [ -f "services/titan-brain/brain.db" ]; then
            cp "services/titan-brain/brain.db" "services/titan-brain/brain.db.backup-$DEPLOYMENT_ID"
            echo -e "${GREEN}   ✓ Brain database backed up${NC}"
        fi
        
        # Backup configuration files
        mkdir -p ".deployment-backup-$DEPLOYMENT_ID"
        find . -name "*.config.js" -o -name "*.env" -o -name "package.json" | while read file; do
            if [ -f "$file" ]; then
                mkdir -p ".deployment-backup-$DEPLOYMENT_ID/$(dirname "$file")"
                cp "$file" ".deployment-backup-$DEPLOYMENT_ID/$file"
            fi
        done
        
        echo -e "${GREEN}   ✓ Configuration files backed up${NC}"
    fi
}

# Validate deployment environment
validate_deployment_environment() {
    echo -e "${BLUE}🔍 Validating deployment environment...${NC}"
    
    # Check required commands
    local required_commands=("node" "npm" "curl" "lsof" "psql" "redis-cli")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            echo -e "${RED}❌ Required command not found: $cmd${NC}"
            return 1
        fi
    done
    echo -e "${GREEN}   ✓ All required commands available${NC}"
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2)
    local major_version=$(echo "$node_version" | cut -d'.' -f1)
    if [ "$major_version" -lt 18 ]; then
        echo -e "${RED}❌ Node.js version $node_version is too old (requires 18+)${NC}"
        return 1
    fi
    echo -e "${GREEN}   ✓ Node.js version $node_version is compatible${NC}"
    
    # Check available disk space (require at least 1GB)
    local available_space=$(df . | tail -1 | awk '{print $4}')
    if [ "$available_space" -lt 1048576 ]; then  # 1GB in KB
        echo -e "${RED}❌ Insufficient disk space (requires at least 1GB)${NC}"
        return 1
    fi
    echo -e "${GREEN}   ✓ Sufficient disk space available${NC}"
    
    # Check memory (require at least 2GB)
    local available_memory=$(free -m 2>/dev/null | awk 'NR==2{print $7}' || echo "2048")
    if [ "$available_memory" -lt 2048 ]; then
        echo -e "${YELLOW}   ⚠ Low available memory (${available_memory}MB)${NC}"
    else
        echo -e "${GREEN}   ✓ Sufficient memory available (${available_memory}MB)${NC}"
    fi
    
    return 0
}

# Trap Ctrl+C and errors
trap cleanup INT TERM ERR

# Load deployment configuration
SCRIPT_DIR="$(dirname "$0")"
if [ -f "$SCRIPT_DIR/scripts/load-deployment-config.sh" ]; then
    source "$SCRIPT_DIR/scripts/load-deployment-config.sh"
fi

# Check for deployment mode
if [ "$DEPLOYMENT_MODE" = "rolling" ]; then
    echo -e "${PURPLE}🔄 Rolling deployment mode detected${NC}"
    echo -e "${PURPLE}   Switching to rolling deployment script...${NC}"
    exec "$SCRIPT_DIR/scripts/rolling-deploy.sh"
fi

# ============================================================================
# Step 0: Start Required Services (PostgreSQL, Redis)
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 0: Starting Required Services${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Start PostgreSQL
echo -e "${BLUE}Starting PostgreSQL...${NC}"
if brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null; then
    echo -e "${GREEN}✅ PostgreSQL started${NC}"
else
    echo -e "${YELLOW}⚠️  PostgreSQL may already be running or not installed via Homebrew${NC}"
fi

# Start Redis
echo -e "${BLUE}Starting Redis...${NC}"
if brew services start redis 2>/dev/null; then
    echo -e "${GREEN}✅ Redis started${NC}"
else
    echo -e "${YELLOW}⚠️  Redis may already be running or not installed via Homebrew${NC}"
fi

# Wait for services to be ready
sleep 2

# Check PostgreSQL connection
if psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL connection verified${NC}"
else
    echo -e "${YELLOW}⚠️  PostgreSQL connection failed, creating database...${NC}"
    createdb $DB_NAME 2>/dev/null || echo -e "${YELLOW}   Database may already exist${NC}"
fi

# Check Redis connection
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis connection verified${NC}"
else
    echo -e "${YELLOW}⚠️  Redis not responding${NC}"
fi

# ============================================================================
# Step 1: Start titan-brain (Brain Orchestrator)
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Starting titan-brain (Brain Orchestrator)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ! -d "services/titan-brain" ]; then
    echo -e "${YELLOW}⚠️  titan-brain not found, skipping...${NC}"
else
    cd services/titan-brain

    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠️  Dependencies not installed, installing now...${NC}"
        npm install
    fi

    # Build TypeScript
    echo -e "${BLUE}Building TypeScript...${NC}"
    npm run build 2>/dev/null || true
    
    # Copy schema.sql to dist if needed
    if [ -f "src/db/schema.sql" ] && [ ! -f "dist/db/schema.sql" ]; then
        mkdir -p dist/db
        cp src/db/schema.sql dist/db/schema.sql
    fi

    # Run migrations
    echo -e "${BLUE}Running database migrations...${NC}"
    DB_HOST=$DB_HOST DB_PORT=$DB_PORT DB_NAME=$DB_NAME DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD \
        node dist/db/migrate.js 2>/dev/null || echo -e "${YELLOW}   Migrations may already be applied${NC}"

    # Start titan-brain
    DB_HOST=$DB_HOST DB_PORT=$DB_PORT DB_NAME=$DB_NAME DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD \
        node dist/index.js > "../../$BRAIN_LOG" 2>&1 &
    BRAIN_PID_VALUE=$!
    echo $BRAIN_PID_VALUE > "../../$BRAIN_PID"

    echo -e "${GREEN}✅ titan-brain started (PID: $BRAIN_PID_VALUE)${NC}"
    echo -e "   Log: $BRAIN_LOG"
    echo -e "   Port: $BRAIN_PORT"

    cd ../..

    # Wait for health check
    sleep 3
    if wait_for_health "http://localhost:$BRAIN_PORT/status" "titan-brain"; then
        echo -e "${GREEN}✅ titan-brain is ready${NC}"
    else
        echo -e "${YELLOW}⚠️  titan-brain health check failed, continuing...${NC}"
    fi
fi

# ============================================================================
# Step 2: Start titan-execution (Execution Microservice)
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Starting titan-execution (Execution Microservice)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ! -d "services/titan-execution" ]; then
    echo -e "${RED}❌ titan-execution not found${NC}"
    exit 1
fi

cd services/titan-execution

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Dependencies not installed, installing now...${NC}"
    npm install
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found, creating from .env.example...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        # Update port in .env
        sed -i '' 's/PORT=3000/PORT=3002/' .env 2>/dev/null || sed -i 's/PORT=3000/PORT=3002/' .env
    fi
fi

# Start titan-execution
node server-production.js > "../../$EXECUTION_LOG" 2>&1 &
EXECUTION_PID_VALUE=$!
echo $EXECUTION_PID_VALUE > "../../$EXECUTION_PID"

echo -e "${GREEN}✅ titan-execution started (PID: $EXECUTION_PID_VALUE)${NC}"
echo -e "   Log: $EXECUTION_LOG"
echo -e "   Port: $EXECUTION_PORT"

cd ../..

# Wait for health check
if wait_for_health "http://localhost:$EXECUTION_PORT/health" "titan-execution"; then
    echo -e "${GREEN}✅ titan-execution is ready${NC}"
else
    echo -e "${YELLOW}⚠️  titan-execution health check failed, continuing...${NC}"
fi

# ============================================================================
# Step 3: Start titan-scavenger (Phase 1 - Headless Mode)
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Starting titan-scavenger (Phase 1 - Headless Mode)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

SCAVENGER_PORT=8081
SCAVENGER_LOG="$LOG_DIR/scavenger.log"
SCAVENGER_PID="$PID_DIR/.scavenger.pid"

if [ ! -d "services/titan-phase1-scavenger" ]; then
    echo -e "${YELLOW}⚠️  titan-scavenger not found, skipping...${NC}"
else
    cd services/titan-phase1-scavenger

    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠️  Dependencies not installed, installing now...${NC}"
        npm install
    fi

    # Build TypeScript
    echo -e "${BLUE}Building TypeScript...${NC}"
    npm run build 2>/dev/null || true

    # Start titan-scavenger in headless mode
    CONSOLE_URL="http://localhost:$EXECUTION_PORT" \
        node dist/index.js --headless > "../../$SCAVENGER_LOG" 2>&1 &
    SCAVENGER_PID_VALUE=$!
    echo $SCAVENGER_PID_VALUE > "../../$SCAVENGER_PID"

    echo -e "${GREEN}✅ titan-scavenger started (PID: $SCAVENGER_PID_VALUE)${NC}"
    echo -e "   Log: $SCAVENGER_LOG"
    echo -e "   Health Port: $SCAVENGER_PORT"

    cd ../..

    # Wait for health check
    sleep 3
    if wait_for_health "http://localhost:$SCAVENGER_PORT/health" "titan-scavenger"; then
        echo -e "${GREEN}✅ titan-scavenger is ready${NC}"
    else
        echo -e "${YELLOW}⚠️  titan-scavenger health check failed, continuing...${NC}"
    fi
fi

# ============================================================================
# Step 4: Start titan-console (Next.js Dashboard)
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Starting titan-console (Next.js Dashboard)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ! -d "services/titan-console" ]; then
    echo -e "${YELLOW}⚠️  titan-console not found, skipping...${NC}"
else
    cd services/titan-console

    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠️  Dependencies not installed, installing now...${NC}"
        npm install
    fi

    # Start in dev mode (or build and start for production)
    PORT=$CONSOLE_PORT npm run dev > "../../$CONSOLE_LOG" 2>&1 &
    CONSOLE_PID_VALUE=$!
    echo $CONSOLE_PID_VALUE > "../../$CONSOLE_PID"

    echo -e "${GREEN}✅ titan-console started (PID: $CONSOLE_PID_VALUE)${NC}"
    echo -e "   Log: $CONSOLE_LOG"
    echo -e "   Port: $CONSOLE_PORT"

    cd ../..

    # Wait for health check
    sleep 5
    if wait_for_health "http://localhost:$CONSOLE_PORT" "titan-console"; then
        echo -e "${GREEN}✅ titan-console is ready${NC}"
    else
        echo -e "${YELLOW}⚠️  titan-console health check failed, continuing...${NC}"
    fi
fi

# ============================================================================
# Step 5: Open Browser
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 5: Opening Browser${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Detect OS and open browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:$CONSOLE_PORT"
    echo -e "${GREEN}✅ Browser opened${NC}"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v xdg-open > /dev/null; then
        xdg-open "http://localhost:$CONSOLE_PORT"
        echo -e "${GREEN}✅ Browser opened${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not open browser automatically${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not open browser automatically${NC}"
fi

# ============================================================================
# Success Summary
# ============================================================================
echo -e "\n${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         TITAN TRADING SYSTEM - READY                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✅ All services started successfully!${NC}"
echo ""
echo -e "${BLUE}Service Status:${NC}"
if [ -f "$BRAIN_PID" ]; then
    echo -e "  • titan-brain:     ${GREEN}RUNNING${NC} (http://localhost:$BRAIN_PORT)"
fi
echo -e "  • titan-execution: ${GREEN}RUNNING${NC} (http://localhost:$EXECUTION_PORT)"
if [ -f "$SCAVENGER_PID" ]; then
    echo -e "  • titan-scavenger: ${GREEN}RUNNING${NC} (http://localhost:$SCAVENGER_PORT)"
fi
if [ -f "$CONSOLE_PID" ]; then
    echo -e "  • titan-console:   ${GREEN}RUNNING${NC} (http://localhost:$CONSOLE_PORT)"
fi
echo ""
echo -e "${BLUE}Supporting Services:${NC}"
echo -e "  • PostgreSQL:      ${GREEN}RUNNING${NC} (localhost:5432)"
echo -e "  • Redis:           ${GREEN}RUNNING${NC} (localhost:6379)"
echo ""
echo -e "${BLUE}API Endpoints:${NC}"
echo -e "  • Dashboard:       http://localhost:$CONSOLE_PORT"
echo -e "  • Execution API:   http://localhost:$EXECUTION_PORT"
echo -e "  • Brain API:       http://localhost:$BRAIN_PORT"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  • Brain:     $BRAIN_LOG"
echo -e "  • Execution: $EXECUTION_LOG"
echo -e "  • Scavenger: $SCAVENGER_LOG"
echo -e "  • Console:   $CONSOLE_LOG"
echo ""
echo -e "${YELLOW}To stop all services, run: ./stop-titan.sh${NC}"
echo -e "${YELLOW}To view logs: tail -f $LOG_DIR/*.log${NC}"
echo ""
