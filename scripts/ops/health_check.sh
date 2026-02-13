#!/bin/bash
set -euo pipefail

# Configuration
MAX_RETRIES=12
SLEEP_SECONDS=5

echo "🏥 Starting Health Check..."

check_container() {
    local name=$1
    local container=$2
    local retries=0

    echo -n "Checking $name ($container)... "
    
    until [ $retries -ge $MAX_RETRIES ]; do
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
        if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
            echo "OK ✅"
            return 0
        fi
        ((retries++))
        echo -n "."
        sleep $SLEEP_SECONDS
    done

    echo "FAILED ❌"
    docker logs --tail 50 "$container" 2>/dev/null || true
    return 1
}

# Check Core Services
check_container "Titan Brain" "titan-brain" || exit 1
check_container "Titan Execution" "titan-execution" || exit 1
check_container "NATS" "titan-nats" || exit 1
check_container "Redis" "titan-redis" || exit 1
check_container "Postgres" "titan-postgres" || exit 1

echo "✅ All Systems Healthy"
exit 0
