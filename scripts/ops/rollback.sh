#!/bin/bash
# Titan Emergency Rollback Script
# 
# Usage: ./scripts/ops/rollback.sh [version]
# 
# This script performs an orderly rollback of the Titan stack.
# If a version tag is provided, it rolls back to that Docker image version.
# Otherwise, it rolls back to the previous deployment.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

VERSION=${1:-"previous"}

main() {
    log_warn "🔄 Titan Emergency Rollback Initiated"
    log_warn "======================================"
    
    # Step 1: HALT all trading immediately
    log_info "Step 1: Sending HARD_HALT to Execution Engine..."
    docker exec titan-nats nats pub titan.cmd.sys.halt '{"state":"HARD_HALT","reason":"Rollback in progress","timestamp":'$(date +%s)'}' 2>/dev/null || log_warn "NATS not available, skipping halt signal"
    sleep 2
    
    # Step 2: Stop trading phases first (dependent services)
    log_info "Step 2: Stopping Trading Phases..."
    docker compose -f docker-compose.prod.yml stop \
        titan-phase1-scavenger \
        titan-phase2-hunter \
        titan-phase3-sentinel \
        titan-powerlaw-lab \
        titan-ai-quant 2>/dev/null || true
    
    # Step 3: Stop core services
    log_info "Step 3: Stopping Core Services..."
    docker compose -f docker-compose.prod.yml stop titan-execution titan-brain 2>/dev/null || true
    
    # Step 4: Rollback images (if version specified)
    if [ "$VERSION" != "previous" ]; then
        log_info "Step 4: Rolling back to version: $VERSION"
        # Update compose file or use specific image tags
        export TITAN_VERSION=$VERSION
        docker compose -f docker-compose.prod.yml pull titan-brain titan-execution
    else
        log_info "Step 4: Using existing (previous) images"
    fi
    
    # Step 5: Restart services in correct order
    log_info "Step 5: Restarting services..."
    
    # Brain first
    docker compose -f docker-compose.prod.yml up -d titan-brain
    log_info "Waiting for Brain to initialize..."
    sleep 10
    
    # Execution Engine
    docker compose -f docker-compose.prod.yml up -d titan-execution
    sleep 5
    
    # Trading Phases
    docker compose -f docker-compose.prod.yml up -d \
        titan-phase1-scavenger \
        titan-phase2-hunter \
        titan-phase3-sentinel \
        titan-powerlaw-lab \
        titan-ai-quant
    
    # Step 6: Resume trading (send OPEN signal)
    log_info "Step 6: Sending OPEN signal to resume trading..."
    sleep 5
    docker exec titan-nats nats pub titan.cmd.sys.halt '{"state":"OPEN","reason":"Rollback complete","timestamp":'$(date +%s)'}' 2>/dev/null || log_warn "NATS not available, manual OPEN required"
    
    log_info ""
    log_info "======================================"
    log_info "✅ Rollback Complete"
    log_info ""
    log_info "IMPORTANT: Verify system health manually:"
    log_info "  curl http://localhost:3100/health"
    log_info "  docker compose -f docker-compose.prod.yml ps"
    log_info ""
    log_warn "If issues persist, escalate immediately!"
}

# Confirmation prompt
echo ""
log_warn "⚠️  WARNING: You are about to rollback the production system!"
echo ""
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" = "yes" ]; then
    main
else
    log_info "Rollback cancelled."
    exit 0
fi
