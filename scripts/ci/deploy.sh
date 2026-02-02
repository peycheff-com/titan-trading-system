#!/bin/bash
set -e

# ==============================================================================
# Titan Trading System - Production Deployment Script
# ==============================================================================
# This script is designed to be run on the Production VPS.
# It assumes the following directory structure:
# /opt/titan/
#   ├── compose/
#   │   ├── docker-compose.prod.yml (Canonical)
#   │   ├── .env.prod (Secrets)
#   │   └── .env.deploy (Validation tags)
#   ├── scripts/
#   │   ├── verify.sh
#   │   └── rollback.sh
#   ├── logs/
#   └── state/
#       └── last_known_good.json
# ==============================================================================

# Configuration
TITAN_ROOT="/opt/titan"
COMPOSE_DIR="$TITAN_ROOT/compose"
SCRIPTS_DIR="$TITAN_ROOT/scripts"
LOGS_DIR="$TITAN_ROOT/logs"
STATE_DIR="$TITAN_ROOT/state"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.prod.yml"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$LOGS_DIR" "$STATE_DIR"

# Timestamp for logging
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_FILE="$LOGS_DIR/deploy-$TIMESTAMP.log"

log() {
    echo -e "${GREEN}[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] WARN: $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

# Trap errors
cleanup() {
    if [ $? -ne 0 ]; then
        error "Deployment failed unexpectedly!"
    fi
}
trap cleanup EXIT

log "Starting deployment..."

# 1. Validate Environment
if [ ! -f "$COMPOSE_FILE" ]; then
    error "Canonical compose file not found at $COMPOSE_FILE"
    exit 1
fi
if [ ! -f "$COMPOSE_DIR/.env.prod" ]; then
    error "Production secrets file (.env.prod) missing!"
    exit 1
fi
if [ ! -f "$COMPOSE_DIR/.env.deploy" ]; then
    error "Deployment variables (.env.deploy) missing! This should be written by CI."
    exit 1
fi

# Load variables to get IMAGE_TAG
source "$COMPOSE_DIR/.env.deploy"

if [ -z "$IMAGE_TAG" ]; then
    error "IMAGE_TAG is not set in .env.deploy"
    exit 1
fi
log "Deploying version: $IMAGE_TAG"

# 2. Save Current State (for Rollback)
log "Snapshotting current state..."
if [ -f "$STATE_DIR/current.json" ]; then
    cp "$STATE_DIR/current.json" "$STATE_DIR/last_known_good.json"
    log "Updated last_known_good.json"
else
    warn "No previous state found. Rollback might not be possible."
fi

# 3. Pull Images
log "Pulling images..."
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.prod" --env-file "$COMPOSE_DIR/.env.deploy" pull
if [ $? -ne 0 ]; then
    error "Failed to pull images. Aborting."
    exit 1
fi

# 4. Database Migrations
log "Running database migrations..."
if docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.prod" --env-file "$COMPOSE_DIR/.env.deploy" run --rm titan-brain npm run migrate; then
    log "Migrations successful."
else
    error "Migrations failed!"
    exit 1
fi

# 5. Restart Services (Rolling Update)
log "Restarting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.prod" --env-file "$COMPOSE_DIR/.env.deploy" up -d --remove-orphans
if [ $? -ne 0 ]; then
    error "Docker compose up failed!"
    exit 1
fi

# 6. Verification
log "Verifying deployment..."
if "$SCRIPTS_DIR/verify.sh"; then
    log "Verification PASSED."
    
    # Update current state
    echo "{\"sha\": \"$IMAGE_TAG\", \"timestamp\": \"$TIMESTAMP\", \"status\": \"verified\"}" > "$STATE_DIR/current.json"
    
    log "Deployment Complete Successfully."
else
    error "Verification FAILED. Initiating Rollback..."
    "$SCRIPTS_DIR/rollback.sh"
    exit 1
fi
