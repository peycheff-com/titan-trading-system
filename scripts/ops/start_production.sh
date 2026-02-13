#!/bin/bash
set -euo pipefail
# Titan Production Startup Script
# Dependency-aware startup with health gating
#
# Usage: ./scripts/ops/start_production.sh
# Requirements: docker compose, curl
# Optional env:
#   TITAN_ENV_FILE=.env.prod
#   TITAN_START_AUXILIARY=true|false
#   TITAN_FORCE_AMD64=true (for arm64 hosts pulling amd64-only images)
#
# This script starts the Titan stack in the correct order,
# waiting for each dependency to be healthy before proceeding.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
HEALTH_TIMEOUT=180  # seconds to wait for each service
POLL_INTERVAL=2    # seconds between health checks
ENV_FILE="${TITAN_ENV_FILE:-.env.prod}"
COMPOSE_FILE="docker-compose.prod.yml"
AUX_SERVICES="${TITAN_START_AUXILIARY:-false}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Wait for a container to become healthy/running
wait_for_container() {
    local service=$1
    local container=$2
    local elapsed=0

    log_info "Waiting for ${service} (${container}) to become healthy..."
    
    while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
        local status
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}" 2>/dev/null || true)"

        if [ "${status}" = "healthy" ] || [ "${status}" = "running" ]; then
            log_info "${service} is ${status} ✅"
            return 0
        fi
        if [ "${status}" = "unhealthy" ] || [ "${status}" = "exited" ] || [ "${status}" = "dead" ]; then
            log_error "${service} is ${status}"
            docker logs --tail 80 "${container}" 2>/dev/null || true
            return 1
        fi
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
        echo -n "."
    done
    
    echo ""
    log_error "${service} failed to become healthy within ${HEALTH_TIMEOUT}s"
    docker logs --tail 80 "${container}" 2>/dev/null || true
    return 1
}

# Main execution
main() {
    # Phase 0: Pre-flight Validation
    log_info "Phase 0: Pre-flight Validation"

    if [ ! -f "${ENV_FILE}" ]; then
        log_error "Environment file not found: ${ENV_FILE}"
        exit 1
    fi

    if grep -q "__CHANGE_ME__" "${ENV_FILE}"; then
        log_error "${ENV_FILE} contains placeholder values (__CHANGE_ME__)."
        exit 1
    fi

    # shellcheck disable=SC1090
    set -a; source "${ENV_FILE}"; set +a

    # Backward compatibility: allow a single legacy NATS_PASS to fan out to per-service passwords.
    if [ -n "${NATS_PASS:-}" ]; then
        export NATS_SYS_PASSWORD="${NATS_SYS_PASSWORD:-${NATS_PASS}}"
        export NATS_BRAIN_PASSWORD="${NATS_BRAIN_PASSWORD:-${NATS_PASS}}"
        export NATS_EXECUTION_PASSWORD="${NATS_EXECUTION_PASSWORD:-${NATS_PASS}}"
        export NATS_SCAVENGER_PASSWORD="${NATS_SCAVENGER_PASSWORD:-${NATS_PASS}}"
        export NATS_HUNTER_PASSWORD="${NATS_HUNTER_PASSWORD:-${NATS_PASS}}"
        export NATS_SENTINEL_PASSWORD="${NATS_SENTINEL_PASSWORD:-${NATS_PASS}}"
        export NATS_POWERLAW_PASSWORD="${NATS_POWERLAW_PASSWORD:-${NATS_PASS}}"
        export NATS_QUANT_PASSWORD="${NATS_QUANT_PASSWORD:-${NATS_PASS}}"
        export NATS_CONSOLE_PASSWORD="${NATS_CONSOLE_PASSWORD:-${NATS_PASS}}"
    fi

    if ! npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ops/validate_env.ts; then
        log_error "Environment validation failed. Check ${ENV_FILE}."
        exit 1
    fi

    if [ "$(uname -m)" = "arm64" ] || [ "$(uname -m)" = "aarch64" ]; then
        if [ "${TITAN_FORCE_AMD64:-false}" = "true" ]; then
            export DOCKER_DEFAULT_PLATFORM="linux/amd64"
            log_warn "ARM host detected; forcing DOCKER_DEFAULT_PLATFORM=${DOCKER_DEFAULT_PLATFORM}"
        else
            log_warn "ARM host detected. Some GHCR images may be amd64-only."
            log_warn "Set TITAN_FORCE_AMD64=true if image pulls fail due missing arm64 manifests."
        fi
    fi

    log_info "🚀 Starting Titan Production Stack"
    log_info "=================================="
    
    # Phase 1: Infrastructure
    log_info ""
    log_info "Phase 1: Starting Infrastructure..."
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d nats redis postgres
    
    wait_for_container "NATS" "titan-nats" || exit 1
    wait_for_container "Redis" "titan-redis" || exit 1
    wait_for_container "Postgres" "titan-postgres" || exit 1
    
    # Phase 2: Core Brain
    log_info ""
    log_info "Phase 2: Starting Titan Brain..."
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d titan-brain
    
    wait_for_container "Titan Brain" "titan-brain" || exit 1
    
    # Phase 3: Execution Engine
    log_info ""
    log_info "Phase 3: Starting Execution Engine..."
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d titan-execution
    wait_for_container "Titan Execution" "titan-execution" || exit 1
    
    # Phase 4: Trading Phases (can start in parallel)
    log_info ""
    log_info "Phase 4: Starting Trading Phases..."
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d \
        titan-scavenger \
        titan-hunter \
        titan-sentinel

    wait_for_container "Titan Scavenger" "titan-scavenger" || exit 1
    wait_for_container "Titan Hunter" "titan-hunter" || exit 1
    wait_for_container "Titan Sentinel" "titan-sentinel" || exit 1

    if [ "${AUX_SERVICES}" = "true" ]; then
        log_info ""
        log_info "Phase 5: Starting Auxiliary Services..."
        docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d \
            titan-powerlaw-lab \
            titan-ai-quant
        wait_for_container "Titan AI Quant" "titan-ai-quant" || exit 1
        wait_for_container "Titan PowerLaw Lab" "titan-powerlaw-lab" || exit 1
    else
        log_warn "Skipping auxiliary services (titan-ai-quant, titan-powerlaw-lab)."
        log_warn "Set TITAN_START_AUXILIARY=true to start full stack."
    fi
    
    # Final status
    log_info ""
    log_info "=================================="
    log_info "✅ Titan Production Stack Started"
    log_info ""
    log_info "Service Status:"
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps --format "table {{.Name}}\t{{.Status}}"

    log_info ""
    log_info "To enable live trading:"
    log_info "  ./scripts/ops/set_trading_mode.sh arm \"Go live\" \"<operator_id>\""
}

# Run main
main "$@"
