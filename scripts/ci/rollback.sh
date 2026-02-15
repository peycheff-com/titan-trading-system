#!/bin/bash
set -euo pipefail
# ==============================================================================
# Titan Trading System - Emergency Rollback Script
# ==============================================================================
# Reverts the symlink /opt/titan/current to the previous release
# and restarts the services using the old configuration.

set -e

TITAN_ROOT="/opt/titan"
CURRENT_LINK="$TITAN_ROOT/current"
RELEASES_DIR="$TITAN_ROOT/releases"
STATE_DIR="$TITAN_ROOT/state"
LOG_FILE="$TITAN_ROOT/logs/rollback.log"

log() {
    echo "[ROLLBACK] $(date -u) $1" | tee -a "$LOG_FILE"
}

log "Initiating Rollback..."

# 1. Identify Target Release
# We look for the second most recent directory in releases/ excluding current if it points there.
# This assumes releases are named timestamp-sha.
# Sorting by name gives chronological order.
CURRENT_TARGET=$(readlink -f "$CURRENT_LINK")
PREVIOUS_TARGET=$(ls -d "$RELEASES_DIR"/*/ | sort -r | grep -v "$CURRENT_TARGET" | head -n 1)
# Remove trailing slash
PREVIOUS_TARGET=${PREVIOUS_TARGET%/}

if [ -z "$PREVIOUS_TARGET" ]; then
    log "CRITICAL: No previous release found to rollback to!"
    exit 1
fi

log "Rolling back from $CURRENT_TARGET to $PREVIOUS_TARGET"

# 2. Switch Symlink (Atomic)
ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
log "Switched current symlink to $PREVIOUS_TARGET"

# 3. Restart Services
cd "$PREVIOUS_TARGET"
log "Restarting docker compose in $PREVIOUS_TARGET..."

# We must use the specific override file from THAT release
COMPOSE_FILE="docker-compose.prod.yml"
OVERRIDE_FILE="compose.override.digest.yml"

if [ -f "$OVERRIDE_FILE" ]; then
    docker compose --env-file .env.prod -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" up -d --force-recreate --remove-orphans
else
    log "WARN: No override file found in previous release. Using base compose."
    docker compose --env-file .env.prod -f "$COMPOSE_FILE" up -d --force-recreate --remove-orphans
fi

# 4. Verification
log "Verifying rolled-back state..."
if "$PREVIOUS_TARGET/scripts/verify.sh"; then
    log "Rollback SUCCESSFUL. System restored to $PREVIOUS_TARGET."
    exit 0
else
    log "CRITICAL: Rollback verification FAILED. Manual intervention required."
    exit 1
fi
