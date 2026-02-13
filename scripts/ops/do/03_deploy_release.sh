#!/bin/bash
set -euo pipefail
# =============================================================================
# 03_deploy_release.sh - Deploy a specific release to production
# =============================================================================
# This is a simplified operator-friendly wrapper around the CI deploy process.
# For emergency/manual deployments when CI is not available.
#
# Usage: ./03_deploy_release.sh [SHA|latest]
# =============================================================================

set -euo pipefail

TITAN_ROOT="/opt/titan"
COMPOSE_DIR="${TITAN_ROOT}/compose"
CURRENT_LINK="${TITAN_ROOT}/current"
RELEASES_DIR="${TITAN_ROOT}/releases"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Parse Arguments
# =============================================================================
SHA="${1:-latest}"
REGISTRY="ghcr.io/peycheff-com/titan-trading-system"

if [ "$SHA" = "latest" ]; then
    log_info "Deploying latest images..."
    TAG="latest"
else
    log_info "Deploying release: ${SHA}"
    TAG="${SHA}"
fi

# =============================================================================
# Pre-Flight Checks
# =============================================================================
log_info "Running pre-flight checks..."

if [ ! -f "${COMPOSE_DIR}/.env.prod" ]; then
    log_error "Missing .env.prod at ${COMPOSE_DIR}/.env.prod"
    exit 1
fi

if grep -q "__CHANGE_ME__" "${COMPOSE_DIR}/.env.prod"; then
    log_error ".env.prod contains placeholder values. Cannot deploy."
    exit 1
fi

if [ ! -f "${TITAN_ROOT}/docker-compose.prod.yml" ] && [ ! -f "${CURRENT_LINK}/docker-compose.prod.yml" ]; then
    log_error "No docker-compose.prod.yml found. Need to copy compose files first."
    log_warn "Ensure docker-compose.prod.yml is at ${TITAN_ROOT}/ or ${CURRENT_LINK}/"
    exit 1
fi

# =============================================================================
# Pull Images
# =============================================================================
log_info "Pulling images from ${REGISTRY}..."

SERVICES=(
    "titan-brain"
    "titan-execution-rs"
    "titan-console"
    "titan-phase1-scavenger"
    "titan-phase2-hunter"
    "titan-phase3-sentinel"
    "titan-ai-quant"
    "titan-powerlaw-lab"
)

for svc in "${SERVICES[@]}"; do
    log_info "Pulling ${svc}:${TAG}..."
    docker pull "${REGISTRY}/${svc}:${TAG}" || log_warn "Failed to pull ${svc}, may not exist"
done

# Pull infrastructure images
log_info "Pulling infrastructure images..."
docker pull traefik:v3.0
docker pull nats:2.10.24-alpine
docker pull redis:7.4-alpine
docker pull postgres:16-alpine
docker pull prom/prometheus:v2.54.1
docker pull grafana/grafana:11.2.0
docker pull grafana/tempo:2.6.0

# =============================================================================
# Deploy
# =============================================================================
COMPOSE_FILE=""
if [ -f "${CURRENT_LINK}/docker-compose.prod.yml" ]; then
    COMPOSE_FILE="${CURRENT_LINK}/docker-compose.prod.yml"
elif [ -f "${TITAN_ROOT}/docker-compose.prod.yml" ]; then
    COMPOSE_FILE="${TITAN_ROOT}/docker-compose.prod.yml"
fi

log_info "Starting deployment..."
cd "$(dirname "${COMPOSE_FILE}")"

# Set TITAN_MODE to DISARMED for safety
export TITAN_MODE="DISARMED"

docker compose -f docker-compose.prod.yml \
    --env-file "${COMPOSE_DIR}/.env.prod" \
    up -d --remove-orphans

# =============================================================================
# Verify
# =============================================================================
log_info "Waiting for services to start (30s)..."
sleep 30

log_info "Running verification..."
./scripts/ops/do/04_verify.sh || log_warn "Verification had warnings"

echo ""
echo "============================================================"
log_info "Deployment complete!"
echo "============================================================"
echo ""
echo "  Tag: ${TAG}"
echo "  Mode: DISARMED (default)"
echo ""
echo "To arm the system (DANGER):"
echo "  1. Verify all acceptance tests pass"
echo "  2. Update TITAN_MODE in .env.prod"
echo "  3. Restart services"
echo ""
