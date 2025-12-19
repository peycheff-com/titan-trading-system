#!/bin/sh
# ============================================================================
# Titan Brain - Health Check Script
# ============================================================================
# This script performs comprehensive health checks for the Titan Brain service.
# Used by Docker HEALTHCHECK and external monitoring systems.
# ============================================================================

set -e

HOST="${SERVER_HOST:-localhost}"
PORT="${SERVER_PORT:-3100}"
TIMEOUT="${HEALTHCHECK_TIMEOUT:-5}"

# Check if the service is responding
response=$(curl -sf --max-time "$TIMEOUT" "http://${HOST}:${PORT}/status" 2>/dev/null) || {
    echo "UNHEALTHY: Service not responding"
    exit 1
}

# Parse the response to check status
status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

if [ "$status" = "healthy" ] || [ "$status" = "ok" ]; then
    echo "HEALTHY: Service is running"
    exit 0
else
    echo "UNHEALTHY: Service status is $status"
    exit 1
fi
