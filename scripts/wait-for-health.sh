#!/bin/bash
# Wait for all services to be healthy
# Usage: ./scripts/wait-for-health.sh [TIMEOUT_SECONDS]

TIMEOUT=${1:-60}
echo "⏳ Waiting for services to be healthy (Timeout: ${TIMEOUT}s)..."

start_time=$(date +%s)
while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))
    
    if [ $elapsed -ge $TIMEOUT ]; then
        echo "❌ Timeout waiting for services to be healthy."
        exit 1
    fi

    # Check for any unhealthy container or starting container
    # We grep for 'health: starting' or 'unhealthy'. If found, we wait.
    # If all declared healthy services are 'healthy', and none are failing, we continue.
    
    # Note: This is a simplistic check. In complex scenarios, parse JSON.
    OUTPUT=$(docker compose -f docker-compose.prod.yml ps --format "json")
    
    # Check if we have any 'unhealthy'
    if echo "$OUTPUT" | grep -q '"Health":"unhealthy"'; then
        echo "⚠️  Detected unhealthy service..."
    elif echo "$OUTPUT" | grep -q '"Health":"starting"'; then
        echo "⏳ Services starting..."
    else
        # If we are here, everything running is not 'unhealthy' or 'starting'.
        # Assuming services with healthchecks are now 'healthy'.
        # Ideally check if count(running) == expected.
        echo "✅ All services appear healthy!"
        exit 0
    fi
    
    sleep 5
done
