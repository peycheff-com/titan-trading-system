#!/bin/bash

# Comprehensive Monitoring Setup Script for Titan Trading System
# Requirements: 7.3 - Create Grafana dashboards, implement alerting rules, add log aggregation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
MONITORING_DIR="monitoring"
PROMETHEUS_VERSION="2.45.0"
GRAFANA_VERSION="10.0.0"
ALERTMANAGER_VERSION="0.25.0"
LOKI_VERSION="2.8.0"
PROMTAIL_VERSION="2.8.0"

# Ports
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
ALERTMANAGER_PORT=9093
LOKI_PORT=3100

echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         TITAN MONITORING STACK SETUP                       ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to download and install binary
install_binary() {
    local name=$1
    local version=$2
    local url=$3
    local binary_name=$4
    
    echo -e "${BLUE}📥 Installing $name v$version...${NC}"
    
    if command_exists "$binary_name"; then
        local current_version=$($binary_name --version 2>/dev/null | head -1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1 || echo "unknown")
        if [ "$current_version" = "$version" ]; then
            echo -e "${GREEN}   ✓ $name v$version already installed${NC}"
            return 0
        fi
    fi
    
    local temp_dir=$(mktemp -d)
    cd "$temp_dir"
    
    echo -e "${BLUE}   Downloading from: $url${NC}"
    curl -L -o "$name.tar.gz" "$url"
    tar -xzf "$name.tar.gz"
    
    # Find the binary in the extracted files
    local binary_path=$(find . -name "$binary_name" -type f | head -1)
    if [ -z "$binary_path" ]; then
        echo -e "${RED}   ❌ Binary $binary_name not found in archive${NC}"
        cd - >/dev/null
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Install to /usr/local/bin
    sudo cp "$binary_path" "/usr/local/bin/"
    sudo chmod +x "/usr/local/bin/$binary_name"
    
    cd - >/dev/null
    rm -rf "$temp_dir"
    
    echo -e "${GREEN}   ✓ $name v$version installed${NC}"
}

# Create monitoring directory structure
echo -e "${BLUE}📁 Creating monitoring directory structure...${NC}"
mkdir -p "$MONITORING_DIR"/{prometheus,grafana,alertmanager,loki,promtail}/{config,data}
mkdir -p "$MONITORING_DIR"/dashboards
mkdir -p logs/monitoring

# Step 1: Install Prometheus
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Installing Prometheus${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

PROMETHEUS_URL="https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"
if [[ "$OSTYPE" == "darwin"* ]]; then
    PROMETHEUS_URL="https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.darwin-amd64.tar.gz"
fi

install_binary "prometheus" "$PROMETHEUS_VERSION" "$PROMETHEUS_URL" "prometheus"

# Create Prometheus configuration
echo -e "${BLUE}⚙️ Creating Prometheus configuration...${NC}"
cat > "$MONITORING_DIR/prometheus/config/prometheus.yml" << 'EOF'
# Prometheus Configuration for Titan Trading System
global:
  scrape_interval: 5s
  evaluation_interval: 5s
  external_labels:
    monitor: 'titan-trading-system'
    environment: 'production'

rule_files:
  - "/etc/prometheus/alert-rules-comprehensive.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

scrape_configs:
  - job_name: 'titan-brain'
    static_configs:
      - targets: ['localhost:3100']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'titan-execution'
    static_configs:
      - targets: ['localhost:3002']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'titan-console'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/metrics'
    scrape_interval: 10s

  - job_name: 'titan-scavenger'
    static_configs:
      - targets: ['localhost:8081']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
EOF

# Copy alert rules
cp monitoring/alert-rules-comprehensive.yml "$MONITORING_DIR/prometheus/config/"

# Step 2: Install Grafana
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Installing Grafana${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ "$OSTYPE" == "darwin"* ]]; then
    if command_exists brew; then
        echo -e "${BLUE}Installing Grafana via Homebrew...${NC}"
        brew install grafana
    else
        echo -e "${YELLOW}⚠ Homebrew not found, please install Grafana manually${NC}"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${BLUE}Installing Grafana via package manager...${NC}"
    
    # Add Grafana repository
    curl -fsSL https://packages.grafana.com/gpg.key | sudo apt-key add -
    echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list
    
    sudo apt-get update
    sudo apt-get install -y grafana
fi

# Create Grafana configuration
echo -e "${BLUE}⚙️ Creating Grafana configuration...${NC}"
cat > "$MONITORING_DIR/grafana/config/grafana.ini" << 'EOF'
[server]
http_port = 3000
domain = localhost

[database]
type = sqlite3
path = /var/lib/grafana/grafana.db

[security]
admin_user = admin
admin_password = titan123

[dashboards]
default_home_dashboard_path = /etc/grafana/dashboards/titan-overview.json

[provisioning]
dashboards = /etc/grafana/provisioning/dashboards
datasources = /etc/grafana/provisioning/datasources
EOF

# Create Grafana provisioning configs
mkdir -p "$MONITORING_DIR/grafana/config/provisioning"/{dashboards,datasources}

cat > "$MONITORING_DIR/grafana/config/provisioning/datasources/prometheus.yml" << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
    editable: true
EOF

cat > "$MONITORING_DIR/grafana/config/provisioning/dashboards/titan.yml" << 'EOF'
apiVersion: 1

providers:
  - name: 'Titan Dashboards'
    orgId: 1
    folder: 'Titan'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/dashboards
EOF

# Copy existing dashboards
if [ -f "services/titan-brain/monitoring/grafana-dashboard-comprehensive.json" ]; then
    cp "services/titan-brain/monitoring/grafana-dashboard-comprehensive.json" "$MONITORING_DIR/dashboards/titan-comprehensive.json"
fi

# Step 3: Install Alertmanager
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Installing Alertmanager${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ALERTMANAGER_URL="https://github.com/prometheus/alertmanager/releases/download/v${ALERTMANAGER_VERSION}/alertmanager-${ALERTMANAGER_VERSION}.linux-amd64.tar.gz"
if [[ "$OSTYPE" == "darwin"* ]]; then
    ALERTMANAGER_URL="https://github.com/prometheus/alertmanager/releases/download/v${ALERTMANAGER_VERSION}/alertmanager-${ALERTMANAGER_VERSION}.darwin-amd64.tar.gz"
fi

install_binary "alertmanager" "$ALERTMANAGER_VERSION" "$ALERTMANAGER_URL" "alertmanager"

# Create Alertmanager configuration
echo -e "${BLUE}⚙️ Creating Alertmanager configuration...${NC}"
cat > "$MONITORING_DIR/alertmanager/config/alertmanager.yml" << 'EOF'
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@titan.com'

route:
  group_by: ['alertname', 'component']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
    - match:
        severity: warning
      receiver: 'warning-alerts'

receivers:
  - name: 'web.hook'
    webhook_configs:
      - url: 'http://localhost:5001/webhook'

  - name: 'critical-alerts'
    webhook_configs:
      - url: 'http://localhost:5001/webhook/critical'
    email_configs:
      - to: 'admin@titan.com'
        subject: 'CRITICAL: Titan Trading System Alert'
        body: |
          Alert: {{ .GroupLabels.alertname }}
          Component: {{ .GroupLabels.component }}
          Description: {{ range .Alerts }}{{ .Annotations.description }}{{ end }}

  - name: 'warning-alerts'
    webhook_configs:
      - url: 'http://localhost:5001/webhook/warning'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'component']
EOF

# Step 4: Install Loki (Log Aggregation)
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Installing Loki (Log Aggregation)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

LOKI_URL="https://github.com/grafana/loki/releases/download/v${LOKI_VERSION}/loki-linux-amd64.zip"
if [[ "$OSTYPE" == "darwin"* ]]; then
    LOKI_URL="https://github.com/grafana/loki/releases/download/v${LOKI_VERSION}/loki-darwin-amd64.zip"
fi

echo -e "${BLUE}📥 Installing Loki v$LOKI_VERSION...${NC}"
temp_dir=$(mktemp -d)
cd "$temp_dir"
curl -L -o "loki.zip" "$LOKI_URL"
unzip loki.zip
sudo cp loki-* /usr/local/bin/loki
sudo chmod +x /usr/local/bin/loki
cd - >/dev/null
rm -rf "$temp_dir"

# Create Loki configuration
echo -e "${BLUE}⚙️ Creating Loki configuration...${NC}"
cat > "$MONITORING_DIR/loki/config/loki.yml" << 'EOF'
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 5m
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 168h

storage_config:
  boltdb:
    directory: /tmp/loki/index
  filesystem:
    directory: /tmp/loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s
EOF

# Step 5: Install Promtail (Log Shipper)
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 5: Installing Promtail (Log Shipper)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

PROMTAIL_URL="https://github.com/grafana/loki/releases/download/v${PROMTAIL_VERSION}/promtail-linux-amd64.zip"
if [[ "$OSTYPE" == "darwin"* ]]; then
    PROMTAIL_URL="https://github.com/grafana/loki/releases/download/v${PROMTAIL_VERSION}/promtail-darwin-amd64.zip"
fi

echo -e "${BLUE}📥 Installing Promtail v$PROMTAIL_VERSION...${NC}"
temp_dir=$(mktemp -d)
cd "$temp_dir"
curl -L -o "promtail.zip" "$PROMTAIL_URL"
unzip promtail.zip
sudo cp promtail-* /usr/local/bin/promtail
sudo chmod +x /usr/local/bin/promtail
cd - >/dev/null
rm -rf "$temp_dir"

# Create Promtail configuration
echo -e "${BLUE}⚙️ Creating Promtail configuration...${NC}"
cat > "$MONITORING_DIR/promtail/config/promtail.yml" << 'EOF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://localhost:3100/loki/api/v1/push

scrape_configs:
  - job_name: titan-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: titan-logs
          __path__: /var/log/titan/*.log

  - job_name: titan-brain
    static_configs:
      - targets:
          - localhost
        labels:
          job: titan-brain
          service: brain
          __path__: ./logs/brain.log

  - job_name: titan-execution
    static_configs:
      - targets:
          - localhost
        labels:
          job: titan-execution
          service: execution
          __path__: ./logs/execution.log

  - job_name: titan-console
    static_configs:
      - targets:
          - localhost
        labels:
          job: titan-console
          service: console
          __path__: ./logs/console.log

  - job_name: titan-scavenger
    static_configs:
      - targets:
          - localhost
        labels:
          job: titan-scavenger
          service: scavenger
          __path__: ./logs/scavenger.log
EOF

# Step 6: Create startup scripts
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 6: Creating Startup Scripts${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create monitoring startup script
cat > "$MONITORING_DIR/start-monitoring.sh" << 'EOF'
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
EOF

chmod +x "$MONITORING_DIR/start-monitoring.sh"

# Create monitoring stop script
cat > "$MONITORING_DIR/stop-monitoring.sh" << 'EOF'
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
EOF

chmod +x "$MONITORING_DIR/stop-monitoring.sh"

# Step 7: Create systemd services (Linux only)
if [[ "$OSTYPE" == "linux-gnu"* ]] && command_exists systemctl; then
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 7: Creating Systemd Services${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Create systemd service files
    sudo tee /etc/systemd/system/titan-monitoring.service > /dev/null << EOF
[Unit]
Description=Titan Trading System Monitoring Stack
After=network.target

[Service]
Type=forking
User=titan
Group=titan
WorkingDirectory=$(pwd)/$MONITORING_DIR
ExecStart=$(pwd)/$MONITORING_DIR/start-monitoring.sh
ExecStop=$(pwd)/$MONITORING_DIR/stop-monitoring.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable titan-monitoring
    
    echo -e "${GREEN}   ✓ Systemd service created and enabled${NC}"
fi

# Final summary
echo -e "\n${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         MONITORING SETUP COMPLETED                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✅ Monitoring stack installed successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Components Installed:${NC}"
echo -e "   • Prometheus v$PROMETHEUS_VERSION (Metrics)"
echo -e "   • Grafana v$GRAFANA_VERSION (Dashboards)"
echo -e "   • Alertmanager v$ALERTMANAGER_VERSION (Alerting)"
echo -e "   • Loki v$LOKI_VERSION (Log Aggregation)"
echo -e "   • Promtail v$PROMTAIL_VERSION (Log Shipping)"
echo ""
echo -e "${BLUE}🚀 To start monitoring:${NC}"
echo -e "   cd $MONITORING_DIR && ./start-monitoring.sh"
echo ""
echo -e "${BLUE}🌐 Access URLs:${NC}"
echo -e "   • Prometheus: http://localhost:9090"
echo -e "   • Grafana:    http://localhost:3000 (admin/titan123)"
echo -e "   • Alertmanager: http://localhost:9093"
echo ""
echo -e "${YELLOW}⚠ Next Steps:${NC}"
echo -e "   1. Configure email/Slack notifications in Alertmanager"
echo -e "   2. Import additional Grafana dashboards"
echo -e "   3. Adjust alert thresholds for your environment"
echo -e "   4. Set up log rotation for monitoring logs"