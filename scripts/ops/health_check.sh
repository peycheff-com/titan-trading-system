#!/bin/bash

# Configuration
BRAIN_URL="http://localhost:3100"
EXECUTION_URL="http://localhost:3002"
MAX_RETRIES=12
SLEEP_SECONDS=5

echo "🏥 Starting Health Check..."

check_service() {
    local name=$1
    local url=$2
    local retries=0

    echo -n "Checking $name ($url)... "
    
    until curl -s -f "$url/health" > /dev/null; do
        ((retries++))
        if [ $retries -ge $MAX_RETRIES ]; then
            echo "FAILED ❌"
            return 1
        fi
        echo -n "."
        sleep $SLEEP_SECONDS
    done
    
    echo "OK ✅"
    return 0
}

# Check Core Services
check_service "Titan Brain" "$BRAIN_URL" || exit 1
check_service "Titan Execution" "$EXECUTION_URL" || exit 1

# Check NATS (via Docker)
echo -n "Checking NATS... "
if docker exec titan-nats nats stream ls > /dev/null 2>&1; then
    echo "OK ✅"
else 
    echo "WARNING: NATS CLI not available or failing. Skipping deep check."
fi

echo "✅ All Systems Healthy"
exit 0
