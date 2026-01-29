#!/bin/bash
# Titan Production Startup Script
# Dependency-aware startup with health gating
#
# Usage: ./scripts/ops/start_production.sh
# Requirements: docker compose, curl
#
# This script starts the Titan stack in the correct order,
# waiting for each dependency to be healthy before proceeding.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
HEALTH_TIMEOUT=60  # seconds to wait for each service
POLL_INTERVAL=2    # seconds between health checks

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Wait for a service to become healthy
wait_for_health() {
    local service=$1
    local url=$2
    local elapsed=0

    log_info "Waiting for $service to become healthy..."
    
    while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            log_info "$service is healthy ✅"
            return 0
        fi
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
        echo -n "."
    done
    
    echo ""
    log_error "$service failed to become healthy within ${HEALTH_TIMEOUT}s"
    return 1
}

# Wait for NATS to be ready via docker exec
wait_for_nats() {
    local elapsed=0

    log_info "Waiting for NATS to become healthy..."
    
    while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
        if docker exec titan-nats nats server ping > /dev/null 2>&1; then
            log_info "NATS is healthy ✅"
            return 0
        fi
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
        echo -n "."
    done
    
    echo ""
    log_error "NATS failed to become healthy within ${HEALTH_TIMEOUT}s"
    return 1
}

# Wait for Redis to be ready
wait_for_redis() {
    local elapsed=0

    log_info "Waiting for Redis to become healthy..."
    
    while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
        if docker exec titan-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            log_info "Redis is healthy ✅"
            return 0
        fi
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
        echo -n "."
    done
    
    echo ""
    log_error "Redis failed to become healthy within ${HEALTH_TIMEOUT}s"
    return 1
}

# Wait for Postgres to be ready
wait_for_postgres() {
    local elapsed=0

    log_info "Waiting for Postgres to become healthy..."
    
    while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
        if docker exec titan-postgres pg_isready -U titan > /dev/null 2>&1; then
            log_info "Postgres is healthy ✅"
            return 0
        fi
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
        echo -n "."
    done
    
    echo ""
    log_error "Postgres failed to become healthy within ${HEALTH_TIMEOUT}s"
    return 1
}

# Main execution
main() {
    log_info "🚀 Starting Titan Production Stack"
    log_info "=================================="
    
    # Phase 1: Infrastructure
    log_info ""
    log_info "Phase 1: Starting Infrastructure..."
    docker compose -f docker-compose.prod.yml up -d nats redis postgres
    
    wait_for_nats || exit 1
    wait_for_redis || exit 1
    wait_for_postgres || exit 1
    
    # Phase 2: Core Brain
    log_info ""
    log_info "Phase 2: Starting Titan Brain..."
    docker compose -f docker-compose.prod.yml up -d titan-brain
    
    wait_for_health "Titan Brain" "http://localhost:3100/health" || exit 1
    
    # Phase 3: Execution Engine
    log_info ""
    log_info "Phase 3: Starting Execution Engine..."
    docker compose -f docker-compose.prod.yml up -d titan-execution
    
    # Rust doesn't have HTTP health by default, wait a few seconds
    log_info "Waiting for Execution Engine to initialize..."
    sleep 5
    
    # Check via logs
    if docker logs titan-execution 2>&1 | tail -5 | grep -q "Engine started"; then
        log_info "Titan Execution is running ✅"
    else
        log_warn "Titan Execution may still be starting (check logs)"
    fi
    
    # Phase 4: Trading Phases (can start in parallel)
    log_info ""
    log_info "Phase 4: Starting Trading Phases..."
    docker compose -f docker-compose.prod.yml up -d \
        titan-phase1-scavenger \
        titan-phase2-hunter \
        titan-phase3-sentinel \
        titan-powerlaw-lab \
        titan-ai-quant
    
    # Brief wait for phases
    sleep 3
    
    # Final status
    log_info ""
    log_info "=================================="
    log_info "✅ Titan Production Stack Started"
    log_info ""
    log_info "Service Status:"
    docker compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}"
}

# Run main
main "$@"
