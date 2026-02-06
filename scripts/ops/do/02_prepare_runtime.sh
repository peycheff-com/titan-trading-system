#!/bin/bash
# =============================================================================
# 02_prepare_runtime.sh - Prepare runtime environment for deployment
# =============================================================================
# Run as deploy user after bootstrap completes.
# Usage: ssh deploy@<IP> 'bash -s' < scripts/ops/do/02_prepare_runtime.sh
# =============================================================================

set -euo pipefail

TITAN_ROOT="/opt/titan"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# =============================================================================
# 1. Verify Prerequisites
# =============================================================================
log_info "Verifying prerequisites..."

if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker not installed. Run 01_bootstrap_host.sh first."
    exit 1
fi

if ! docker ps &>/dev/null; then
    echo "ERROR: Cannot connect to Docker. Is current user in docker group?"
    echo "Try: newgrp docker"
    exit 1
fi

# =============================================================================
# 2. Create Docker Network
# =============================================================================
if docker network inspect titan-network &>/dev/null; then
    log_info "Docker network 'titan-network' already exists"
else
    log_info "Creating Docker network 'titan-network'..."
    docker network create titan-network
fi

# =============================================================================
# 3. Create Docker Volumes
# =============================================================================
log_info "Creating Docker volumes..."

VOLUMES=(
    "traefik-certs"
    "titan-ipc"
    "titan-ai-data"
    "titan-redis-data"
    "titan-db-data"
    "titan-prometheus-data"
    "titan-grafana-data"
    "titan-tempo-data"
    "titan-jetstream-data"
)

for vol in "${VOLUMES[@]}"; do
    if docker volume inspect "$vol" &>/dev/null; then
        log_info "Volume '$vol' already exists"
    else
        docker volume create "$vol"
        log_info "Created volume '$vol'"
    fi
done

# =============================================================================
# 4. Verify .env.prod
# =============================================================================
ENV_FILE="${TITAN_ROOT}/compose/.env.prod"
if [ -f "$ENV_FILE" ]; then
    if grep -q "__CHANGE_ME__" "$ENV_FILE"; then
        log_warn ".env.prod contains placeholder values - MUST BE UPDATED!"
        log_warn "Edit ${ENV_FILE} and replace all __CHANGE_ME__ values"
    else
        log_info ".env.prod appears to be populated"
    fi
else
    echo "ERROR: .env.prod not found at ${ENV_FILE}"
    echo "Run 01_bootstrap_host.sh first to create the template."
    exit 1
fi

# =============================================================================
# 5. Login to GHCR (if needed)
# =============================================================================
log_info "Checking GHCR authentication..."
if docker pull ghcr.io/peycheff-com/titan-trading-system/titan-brain:latest 2>/dev/null; then
    log_info "GHCR public images accessible (no auth needed)"
else
    log_warn "Cannot pull from GHCR. If images are private, authenticate with:"
    log_warn "  echo \$GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================================"
log_info "Runtime environment ready!"
echo "============================================================"
echo ""
echo "  ✓ Docker network 'titan-network' exists"
echo "  ✓ Docker volumes created"
echo "  ✓ Environment file checked"
echo ""
echo "Next steps:"
echo "  1. Ensure .env.prod has production secrets"
echo "  2. Deploy a release using 03_deploy_release.sh"
echo ""
