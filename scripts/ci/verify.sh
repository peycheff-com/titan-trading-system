#!/bin/bash
# ==============================================================================
# Titan Trading System - Deployment Verification
# ==============================================================================

TITAN_ROOT="/opt/titan"
COMPOSE_DIR="$TITAN_ROOT/compose"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.prod.yml"

# Helper for curl
check_url() {
    local url=$1
    local name=$2
    local retries=12
    local wait=5

    echo -n "Checking $name ($url)... "
    for i in $(seq 1 $retries); do
        if curl -s -f "$url" > /dev/null; then
            echo "OK"
            return 0
        fi
        echo -n "."
        sleep $wait
    done
    echo "FAILED"
    return 1
}

echo "=== Starting Verification ==="

# 1. Docker Compose Status
echo "Checking Docker containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.prod" --env-file "$COMPOSE_DIR/.env.deploy" ps --format "table {{.Service}}\t{{.State}}" > /tmp/ps_status.txt
cat /tmp/ps_status.txt

if grep -q "Exit" /tmp/ps_status.txt; then
    echo "CRITICAL: Found exited containers."
    exit 1
fi
if grep -q "Restarting" /tmp/ps_status.txt; then
    echo "CRITICAL: Found restarting containers."
    exit 1
fi

# 2. Health Endpoints
# Brain (internal port 3100 mapped usually)
# Note: Verification runs on the host, so we use localhost ports mapped in compose.
check_url "http://localhost:3100/health" "Titan Brain" || exit 1
check_url "http://localhost:3002/health" "Titan Execution" || exit 1
check_url "http://localhost:8222/healthz" "NATS" || exit 1

# 3. Telemetry Check
check_url "http://localhost:3100/metrics" "Titan Brain Metrics" || exit 1

# 4. Policy Hash Parity Check (Brain vs Execution)
echo "Checking Policy Hash Parity via Logs..."
# The Brain performs a handshake on startup. We check the logs for success.
sleep 5 # Give it a moment to log
if docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.prod" --env-file "$COMPOSE_DIR/.env.deploy" logs --tail=500 titan-brain | grep -q "Policy hash handshake OK"; then
    echo "OK: Policy hash handshake confirmed in logs."
elif docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.prod" --env-file "$COMPOSE_DIR/.env.deploy" logs --tail=500 titan-brain | grep -q "Leader Election DISABLED"; then
     echo "OK: Leader election disabled, assuming standalone policy valid."
else
    echo "WARNING: Could not find explicit Policy Hash Handshake success message. Checking for Critical Policy Failures..."
    if docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.prod" --env-file "$COMPOSE_DIR/.env.deploy" logs --tail=500 titan-brain | grep -q "Policy hash handshake FAILED"; then
        echo "CRITICAL: Policy hash handshake FAILED."
        exit 1
    fi
     echo "OK: No critical policy failures found."
fi

echo "=== Verification Passed ==="
exit 0
