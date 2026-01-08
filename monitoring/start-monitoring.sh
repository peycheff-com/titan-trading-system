#!/bin/bash

# Start Titan Monitoring Stack

set -e

MONITORING_DIR="$(dirname "$0")"
cd "$MONITORING_DIR"

echo "🚀 Starting Titan Monitoring Stack..."

# Start Loki
echo "📊 Starting Loki..."
loki -config.file=loki/config/loki.yml > logs/loki.log 2>&1 &
echo $! > loki.pid

# Start Prometheus
echo "📈 Starting Prometheus..."
prometheus \
  --config.file=prometheus/config/prometheus.yml \
  --storage.tsdb.path=prometheus/data \
  --web.console.templates=prometheus/consoles \
  --web.console.libraries=prometheus/console_libraries \
  --web.listen-address=0.0.0.0:9090 \
  --web.enable-lifecycle \
  > logs/prometheus.log 2>&1 &
echo $! > prometheus.pid

# Start Alertmanager
echo "🚨 Starting Alertmanager..."
alertmanager \
  --config.file=alertmanager/config/alertmanager.yml \
  --storage.path=alertmanager/data \
  --web.listen-address=0.0.0.0:9093 \
  > logs/alertmanager.log 2>&1 &
echo $! > alertmanager.pid

# Start Promtail
echo "📋 Starting Promtail..."
promtail -config.file=promtail/config/promtail.yml > logs/promtail.log 2>&1 &
echo $! > promtail.pid

# Start Grafana
echo "📊 Starting Grafana..."
grafana-server \
  --config=grafana/config/grafana.ini \
  --homepath=/usr/share/grafana \
  > logs/grafana.log 2>&1 &
echo $! > grafana.pid

echo "✅ Monitoring stack started!"
echo ""
echo "🌐 Access URLs:"
echo "   Prometheus: http://localhost:9090"
echo "   Grafana:    http://localhost:3000 (admin/titan123)"
echo "   Alertmanager: http://localhost:9093"
echo "   Loki:       http://localhost:3100"
