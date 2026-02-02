#!/bin/bash
# ==============================================================================
# Titan Trading System - Emergency Rollback
# ==============================================================================

TITAN_ROOT="/opt/titan"
COMPOSE_DIR="$TITAN_ROOT/compose"
STATE_DIR="$TITAN_ROOT/state"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.prod.yml"

echo "!!! INITIATING ROLLBACK !!!"

if [ ! -f "$STATE_DIR/last_known_good.json" ]; then
    echo "CRITICAL: No last_known_good state found. Cannot rollback automatically."
    exit 1
fi

# Extract previous SHA
LAST_SHA=$(grep -o '"sha": *"[^"]*"' "$STATE_DIR/last_known_good.json" | cut -d'"' -f4)

if [ -z "$LAST_SHA" ]; then
    echo "CRITICAL: Could not parse SHA from last_known_good.json"
    exit 1
fi

echo "Rolling back to image tag: $LAST_SHA"

# Write to .env.deploy
echo "IMAGE_TAG=$LAST_SHA" > "$COMPOSE_DIR/.env.deploy"
# Persist reasonable defaults for other vars if needed
echo "TITAN_REGISTRY=ghcr.io/peycheff-com/titan-trading-system" >> "$COMPOSE_DIR/.env.deploy"

# Pull and Restart
echo "Pulling old images..."
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.prod" --env-file "$COMPOSE_DIR/.env.deploy" pull

echo "Restarting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.prod" --env-file "$COMPOSE_DIR/.env.deploy" up -d --remove-orphans

echo "Verifying rollback..."
if "$TITAN_ROOT/scripts/verify.sh"; then
    echo "Rollback successful. System is stable on version $LAST_SHA."
    exit 0
else
    echo "CRITICAL: Rollback failed! System state is unknown. Manual intervention required."
    exit 1
fi
