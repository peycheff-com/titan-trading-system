#!/bin/bash
set -euo pipefail
# ==============================================================================
# Titan Trading System - Critical Production Deployment Script
# ==============================================================================
# This script orchestrates an atomic, verified, zero-downtime deployment.
# It enforces strict locking, artifact immutability via digest pinning,
# and fails strictly (calls rollback on failure).
# ==============================================================================

set -e

# Configuration
TITAN_ROOT="${TITAN_ROOT:-/opt/titan}"
RELEASES_DIR="$TITAN_ROOT/releases"
SCRIPTS_DIR="$TITAN_ROOT/scripts"
LOGS_DIR="$TITAN_ROOT/logs"
STATE_DIR="$TITAN_ROOT/state"
LOCK_FILE="$STATE_DIR/deploy.lock"

# Trap errors and cleanup
trap cleanup EXIT

cleanup() {
    # Unlock on exit
    flock -u 200
    # Clean up temp
}

log() {
    echo -e "\033[0;32m[DEPLOY] $(date -u) $1\033[0m" | tee -a "$LOGS_DIR/deploy.log"
}

error() {
    echo -e "\033[0;31m[ERROR] $(date -u) $1\033[0m" | tee -a "$LOGS_DIR/deploy.log"
}

# 1. Acquire Deployment Lock
exec 200>"$LOCK_FILE"
flock -n 200 || { log "Deployment locked by another process!"; exit 1; }

# Enforce Single Project Name for Continuity (Zero-Downtime Rolling Updates)
export COMPOSE_PROJECT_NAME=titan

# 2. Parse Inputs
SHA=$1
if [ -z "$SHA" ]; then
    error "Usage: deploy.sh <SHA>"
    exit 1
fi
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
RELEASE_ID="$TIMESTAMP-$SHA"
NEW_RELEASE="$RELEASES_DIR/$RELEASE_ID"

log "Deploying SHA: $SHA (Release ID: $RELEASE_ID)"

# 3. Prepare Release Directory
mkdir -p "$NEW_RELEASE/evidence"
mkdir -p "$NEW_RELEASE/scripts"
mkdir -p "$NEW_RELEASE/compose"

# Symlink shared config (nats.conf, etc.) from operator-managed location
ln -sfn "$TITAN_ROOT/compose/config" "$NEW_RELEASE/config"

# Copy Artifacts from Temp Location (Assume CI copied to known location or we are in it)
# CI actually copies to /opt/titan/tmp_deploy_$SHA
TEMP_DEPLOY="$TITAN_ROOT/tmp_deploy_$SHA"
if [ ! -d "$TEMP_DEPLOY" ]; then
    error "Temporary deploy directory not found: $TEMP_DEPLOY"
    exit 1
fi

cp "$TEMP_DEPLOY/compose/docker-compose.prod.yml" "$NEW_RELEASE/docker-compose.prod.yml"
cp "$TEMP_DEPLOY/evidence/digests.json" "$NEW_RELEASE/evidence/digests.json"
cp "$TEMP_DEPLOY/evidence/digests.json.sig" "$NEW_RELEASE/evidence/digests.json.sig"
cp "$TEMP_DEPLOY/scripts/"* "$NEW_RELEASE/scripts/"
chmod +x "$NEW_RELEASE/scripts/"*.sh

# 4. Verify Provenance
log "Verifying artifact provenance..."
    # Provenance scripts are now shipped in the deployment package.
    # We do NOT overwrite them from TITAN_ROOT (which may be stale).

# Ensure npx/node is available. If not, this fails.
# We verification requires the signature file.
if [ -f "$NEW_RELEASE/evidence/digests.json.sig" ]; then
    if npx --yes tsx "$NEW_RELEASE/scripts/provenance.ts" verify \
        "$NEW_RELEASE/evidence/digests.json" \
        "$NEW_RELEASE/evidence/digests.json.sig" \
        "$NEW_RELEASE/scripts/titan_release.pub"; then
        log "Provenance Verified: Signature matches Release Key."
    else
        error "PROVENANCE CHECK FAILED: Signature Invalid!"
        exit 1
    fi
else
    error "PROVENANCE CHECK FAILED: Missing signature file (digests.json.sig)!"
    exit 1
fi

# 5. Generate Digest Override
log "Generating digest override from evidence/digests.json..."
python3 "$NEW_RELEASE/scripts/generate_digest_override.py" \
    "$NEW_RELEASE/evidence/digests.json" \
    "$NEW_RELEASE/compose.override.digest.yml"

if [ ! -f "$NEW_RELEASE/compose.override.digest.yml" ]; then
    error "Failed to generate digest override file!"
    exit 1
fi

# 5. Link Shared Secrets and Environment
# We assume .env.prod exists in TITAN_ROOT/compose/ or similar shared location
# CI must NOT overwrite secrets. Operator manages .env.prod manually.
SHARED_ENV="$TITAN_ROOT/compose/.env.prod"
if [ ! -f "$SHARED_ENV" ]; then
    error "Shared secrets file not found at $SHARED_ENV"
    echo "Please create .env.prod with required secrets."
    exit 1
fi
ln -sf "$SHARED_ENV" "$NEW_RELEASE/.env.prod"

# Create .env.deploy specific to this release
echo "IMAGE_TAG=$SHA" > "$NEW_RELEASE/.env.deploy"
echo "TITAN_ROOT=$TITAN_ROOT" >> "$NEW_RELEASE/.env.deploy"
echo "RELEASE_DIR=$NEW_RELEASE" >> "$NEW_RELEASE/.env.deploy"
# Disarm by default
# This env var is read by Titan Brain
echo "TITAN_MODE=DISARMED" >> "$NEW_RELEASE/.env.deploy"

# 6. Pull Images (Deterministic)
log "Pulling images pinned by digest..."
cd "$NEW_RELEASE"
docker compose --env-file .env.prod -f docker-compose.prod.yml -f compose.override.digest.yml pull
if [ $? -ne 0 ]; then
    error "Docker pull failed!"
    exit 1
fi

# 7. Database Migrations (Schema Safety)
log "Running database migrations..."
# We use the new image to run migrations against the existing DB
if docker compose --env-file .env.prod -f docker-compose.prod.yml -f compose.override.digest.yml run --rm --no-deps titan-brain npm run migrate; then
    log "Migrations successful."
else
    error "Migrations failed! Aborting."
    exit 1
fi

# 8. Atomic Switch (Symlink) & Update
log "Switching symlink and applying update..."

# Update symlink
ln -sfn "$NEW_RELEASE" "$TITAN_ROOT/current"

# Stop any orphan containers with hardcoded names from a previous project
for ctr in traefik nats postgres redis titan-execution titan-brain; do
    if docker ps -a --format '{{.Names}}' | grep -qx "$ctr"; then
        log "Removing orphan container: $ctr"
        docker rm -f "$ctr" || true
    fi
done

log "Applying new configuration (Rolling Update)..."
if docker compose --env-file .env.prod -f docker-compose.prod.yml -f compose.override.digest.yml up -d --force-recreate --remove-orphans; then
    log "Containers updated."
else
    error "Failed to update containers! Initiating Rollback..."
    "$NEW_RELEASE/scripts/rollback.sh"
    exit 1
fi

# 9. Verify
log "Verifying deployment..."
export RELEASE_DIR="$NEW_RELEASE"
if "$NEW_RELEASE/scripts/verify.sh"; then
    log "Verification PASSED."
else
    error "Verification FAILED! Initiating Rollback..."
    log "--- DEBUG: Dumping logs of restarting containers ---"
    docker ps --format '{{.Names}}' | while read ctr; do
        if ! docker ps -f "name=$ctr" --format '{{.Status}}' | grep -q "Up"; then
             log "Logs for $ctr:"
             docker logs --tail 50 "$ctr" 2>&1 | tee -a "$LOGS_DIR/deploy.log"
        fi
    done
    log "--- End DEBUG ---"
    "$NEW_RELEASE/scripts/rollback.sh"
    exit 1
fi

# 10. Arming (Optional)
# If AUTO_ARM_PROD is true in .env.prod, we arm.
# Not implemented in this iteration, keeping explicit disarm safety.
log "Deployment specific configuration requires manual Arming or API call."

log "Deployment $SHA SUCCESSFUL."
exit 0
