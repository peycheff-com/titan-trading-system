#!/bin/bash
# =============================================================================
# TITAN PROD-LIKE BOOT SCRIPT
# =============================================================================
# Starts Titan in a production-like configuration for validation
# Usage: ./scripts/boot_prod_like.sh [posture]
#
# Postures: constrained_alpha (default), staging, production
# =============================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

POSTURE="${1:-constrained_alpha}"
POSTURE_FILE="$PROJECT_ROOT/config/postures/${POSTURE}.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[BOOT]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
preflight() {
    log "Running pre-flight checks..."
    
    # Check posture file exists
    if [ ! -f "$POSTURE_FILE" ]; then
        fail "Posture file not found: $POSTURE_FILE"
    fi
    log "  ✓ Posture: $POSTURE"
    
    # Check required secrets
    if [ -z "$HMAC_SECRET" ]; then
        fail "HMAC_SECRET environment variable is required"
    fi
    log "  ✓ HMAC_SECRET: [CONFIGURED]"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        fail "Docker is required but not installed"
    fi
    log "  ✓ Docker: $(docker --version | cut -d' ' -f3)"
    
    # Check Docker Compose
    if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
        fail "Docker Compose is required"
    fi
    log "  ✓ Docker Compose: available"
    
    log "Pre-flight checks passed ✓"
}

# -----------------------------------------------------------------------------
# Load posture configuration
# -----------------------------------------------------------------------------
load_posture() {
    log "Loading posture: $POSTURE"
    
    # Export all variables from posture file
    set -a
    source "$POSTURE_FILE"
    set +a
    
    log "  Max Position: \$${TITAN_MAX_POSITION_NOTIONAL_USD:-NOT_SET}"
    log "  Daily Loss Limit: \$${TITAN_DAILY_LOSS_LIMIT_USD:-NOT_SET}"
    log "  Symbol Whitelist: ${TITAN_SYMBOL_WHITELIST:-NOT_SET}"
    log "  Default Armed: ${TITAN_DEFAULT_ARMED:-true}"
}

# -----------------------------------------------------------------------------
# Start services
# -----------------------------------------------------------------------------
start_services() {
    log "Starting Titan services..."
    
    cd "$PROJECT_ROOT"
    
    # Use prod compose with posture overrides
    docker compose \
        -f docker-compose.yml \
        -f docker-compose.prod.yml \
        --env-file "$POSTURE_FILE" \
        up -d
    
    log "Services started"
}

# -----------------------------------------------------------------------------
# Health check
# -----------------------------------------------------------------------------
health_check() {
    log "Running health checks..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "  Health check attempt $attempt/$max_attempts"
        
        # Check Brain health
        if curl -sf http://localhost:3100/health > /dev/null 2>&1; then
            log "  ✓ Brain: healthy"
            break
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        warn "Health check timeout - services may still be starting"
    fi
}

# -----------------------------------------------------------------------------
# Print status
# -----------------------------------------------------------------------------
print_status() {
    echo ""
    echo "=============================================="
    echo "TITAN BOOT COMPLETE"
    echo "=============================================="
    echo "Posture: $POSTURE"
    echo "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo ""
    echo "Services:"
    docker compose ps 2>/dev/null || true
    echo ""
    echo "Endpoints:"
    echo "  Brain:      http://localhost:3100"
    echo "  Execution:  http://localhost:8080"
    echo "  Metrics:    http://localhost:9090"
    echo ""
    echo "To arm the system:"
    echo "  curl -X POST http://localhost:3100/api/arm"
    echo ""
    echo "To halt:"
    echo "  curl -X POST http://localhost:3100/api/halt"
    echo ""
    echo "To stop:"
    echo "  docker compose down"
    echo "=============================================="
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    echo "=============================================="
    echo "TITAN PROD-LIKE BOOT"
    echo "Posture: $POSTURE"
    echo "=============================================="
    
    preflight
    load_posture
    start_services
    health_check
    print_status
}

main "$@"
