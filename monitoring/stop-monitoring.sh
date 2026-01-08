#!/bin/bash

# Stop Titan Monitoring Stack

MONITORING_DIR="$(dirname "$0")"
cd "$MONITORING_DIR"

echo "🛑 Stopping Titan Monitoring Stack..."

# Stop services
for service in prometheus grafana alertmanager loki promtail; do
    if [ -f "$service.pid" ]; then
        pid=$(cat "$service.pid")
        if kill -0 "$pid" 2>/dev/null; then
            echo "   Stopping $service (PID: $pid)..."
            kill "$pid"
            rm "$service.pid"
        fi
    fi
done

echo "✅ Monitoring stack stopped!"
