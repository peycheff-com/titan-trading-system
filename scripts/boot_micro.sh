#!/usr/bin/env bash
# =============================================================================
# Titan Micro-Capital Boot Script
# =============================================================================
# Usage: ./scripts/boot_micro.sh [paper|live]
#
# Prerequisites:
#   - HMAC_SECRET set in environment or ~/secrets/titan_hmac
#   - BINANCE_API_KEY and BINANCE_API_SECRET for live mode
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Configuration
# =============================================================================
MODE="${1:-paper}"
POSTURE="micro_capital"

log_info "=============================================="
log_info "TITAN MICRO-CAPITAL DEPLOYMENT"
log_info "=============================================="
log_info "Mode: $MODE"
log_info "Posture: $POSTURE"
log_info "Capital: \$50-\$100"
log_info "Max Leverage: 10x"
log_info "Daily Loss Limit: \$20 (20%)"
log_info "=============================================="

# =============================================================================
# Load Secrets
# =============================================================================
load_secrets() {
    log_info "Loading secrets..."
    
    # HMAC Secret
    if [[ -z "${HMAC_SECRET:-}" ]]; then
        if [[ -f ~/secrets/titan_hmac ]]; then
            export HMAC_SECRET=$(cat ~/secrets/titan_hmac)
            log_success "Loaded HMAC_SECRET from ~/secrets/titan_hmac"
        else
            log_error "HMAC_SECRET not set and ~/secrets/titan_hmac not found"
            log_error "Generate with: openssl rand -hex 32 > ~/secrets/titan_hmac"
            exit 1
        fi
    else
        log_success "HMAC_SECRET already set"
    fi
    
    # Exchange credentials (live mode only)
    if [[ "$MODE" == "live" ]]; then
        if [[ -z "${BINANCE_API_KEY:-}" ]]; then
            if [[ -f ~/secrets/binance_key ]]; then
                export BINANCE_API_KEY=$(cat ~/secrets/binance_key)
                log_success "Loaded BINANCE_API_KEY"
            else
                log_error "BINANCE_API_KEY required for live mode"
                exit 1
            fi
        fi
        
        if [[ -z "${BINANCE_API_SECRET:-}" ]]; then
            if [[ -f ~/secrets/binance_secret ]]; then
                export BINANCE_API_SECRET=$(cat ~/secrets/binance_secret)
                log_success "Loaded BINANCE_API_SECRET"
            else
                log_error "BINANCE_API_SECRET required for live mode"
                exit 1
            fi
        fi
    else
        log_warn "Paper mode - using mock exchange"
        export BINANCE_API_KEY="paper_mode"
        export BINANCE_API_SECRET="paper_mode"
    fi
}

# =============================================================================
# Load Posture
# =============================================================================
load_posture() {
    log_info "Loading posture: $POSTURE"
    
    POSTURE_FILE="$PROJECT_ROOT/config/postures/${POSTURE}.env"
    
    if [[ ! -f "$POSTURE_FILE" ]]; then
        log_error "Posture file not found: $POSTURE_FILE"
        exit 1
    fi
    
    set -a
    source "$POSTURE_FILE"
    set +a
    
    log_success "Posture loaded: $TITAN_POSTURE"
    log_info "  Max Leverage: $TITAN_MAX_LEVERAGE"
    log_info "  Daily Loss Limit: \$$TITAN_DAILY_LOSS_LIMIT_USD"
    log_info "  Symbols: $TITAN_SYMBOL_WHITELIST"
}

# =============================================================================
# Pre-flight Checks
# =============================================================================
preflight_checks() {
    log_info "Running pre-flight checks..."
    
    # Docker check
    if ! command -v docker &> /dev/null; then
        log_error "Docker not installed"
        exit 1
    fi
    log_success "Docker available"
    
    # Docker Compose check
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose not available"
        exit 1
    fi
    log_success "Docker Compose available"
    
    # Config files check
    if [[ ! -f "$PROJECT_ROOT/docker-compose.micro.yml" ]]; then
        log_error "docker-compose.micro.yml not found"
        exit 1
    fi
    log_success "Docker Compose config found"
    
    if [[ ! -f "$PROJECT_ROOT/services/titan-brain/config/titan-brain.micro.config.json" ]]; then
        log_error "titan-brain.micro.config.json not found"
        exit 1
    fi
    log_success "Brain config found"
    
    if [[ ! -f "$PROJECT_ROOT/packages/shared/risk_policy_micro.json" ]]; then
        log_error "risk_policy_micro.json not found"
        exit 1
    fi
    log_success "Risk policy found"
}

# =============================================================================
# Build & Deploy
# =============================================================================
deploy() {
    log_info "Building and deploying..."
    
    cd "$PROJECT_ROOT"
    
    # Set paper mode if applicable
    if [[ "$MODE" == "paper" ]]; then
        export TITAN_PAPER_MODE=true
    fi
    
    # Build images
    log_info "Building Docker images..."
    docker compose -f docker-compose.micro.yml build --parallel
    
    # Start services
    log_info "Starting services..."
    docker compose -f docker-compose.micro.yml up -d
    
    # Wait for health
    log_info "Waiting for services to become healthy..."
    sleep 10
    
    # Health check
    for i in {1..30}; do
        if curl -sf http://localhost:3100/health > /dev/null 2>&1; then
            log_success "Titan Brain is healthy"
            break
        fi
        if [[ $i -eq 30 ]]; then
            log_error "Health check failed after 30 attempts"
            docker compose -f docker-compose.micro.yml logs titan-brain
            exit 1
        fi
        sleep 2
    done
}

# =============================================================================
# Post-Deploy Summary
# =============================================================================
summary() {
    echo ""
    log_info "=============================================="
    log_success "TITAN MICRO-CAPITAL DEPLOYED"
    log_info "=============================================="
    
    # Get status
    ARMED=$(curl -sf http://localhost:3100/api/status 2>/dev/null | jq -r '.armed // "unknown"')
    
    echo ""
    log_info "Status:"
    log_info "  Mode: $MODE"
    log_info "  Armed: $ARMED"
    log_info "  Brain: http://localhost:3100"
    log_info "  Metrics: http://localhost:9090"
    echo ""
    
    if [[ "$ARMED" == "false" ]]; then
        log_warn "System is DISARMED. To arm:"
        echo ""
        echo "  curl -X POST http://localhost:3100/api/arm \\"
        echo "    -H 'Content-Type: application/json' \\"
        echo "    -d '{\"reason\": \"Micro-capital production launch\"}'"
        echo ""
    fi
    
    log_info "Emergency Commands:"
    log_info "  HALT:    curl -X POST http://localhost:3100/api/halt -H 'Content-Type: application/json' -d '{\"reason\": \"Emergency\"}'"
    log_info "  FLATTEN: curl -X POST http://localhost:3100/api/flatten -H 'Content-Type: application/json' -d '{\"reason\": \"Close all\"}'"
    log_info "  DISARM:  curl -X POST http://localhost:3100/api/disarm -H 'Content-Type: application/json' -d '{\"reason\": \"Stop trading\"}'"
    echo ""
    log_info "Logs:"
    log_info "  docker compose -f docker-compose.micro.yml logs -f"
    echo ""
}

# =============================================================================
# Main
# =============================================================================
main() {
    load_secrets
    load_posture
    preflight_checks
    deploy
    summary
}

main "$@"
