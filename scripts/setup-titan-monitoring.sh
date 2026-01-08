#!/bin/bash

# Titan Monitoring and Alerting Setup Script
# This script sets up comprehensive monitoring and alerting for the Titan Trading System
# Requirements: 5.1, 5.2 - Implement system metrics monitoring and alert system

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MONITORING_DIR="$PROJECT_ROOT/monitoring"
CONFIG_DIR="$PROJECT_ROOT/config"
SERVICES_DIR="$PROJECT_ROOT/services"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Monitoring configuration
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
ALERTMANAGER_PORT=9093
NODE_EXPORTER_PORT=9100
METRICS_INTERVAL=30
ALERT_EMAIL=""
SLACK_WEBHOOK=""
DISCORD_WEBHOOK=""

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Create monitoring directories
create_monitoring_directories() {
    log "Creating monitoring directory structure..."
    
    local monitoring_dirs=(
        "$MONITORING_DIR"
        "$MONITORING_DIR/prometheus"
        "$MONITORING_DIR/grafana"
        "$MONITORING_DIR/alertmanager"
        "$MONITORING_DIR/node-exporter"
        "$MONITORING_DIR/dashboards"
        "$MONITORING_DIR/alerts"
        "$MONITORING_DIR/scripts"
        "$MONITORING_DIR/data"
        "$MONITORING_DIR/logs"
    )
    
    for dir in "${monitoring_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log "Created directory: $dir"
        fi
    done
    
    success "Monitoring directories created"
}

# Install monitoring dependencies
install_monitoring_dependencies() {
    log "Installing monitoring dependencies..."
    
    # Install Node.js monitoring packages
    local monitoring_packages=(
        "prom-client"
        "express-prometheus-middleware"
        "node-os-utils"
        "systeminformation"
        "ws"
        "nodemailer"
    )
    
    cd "$PROJECT_ROOT"
    
    # Check if package.json exists at root level
    if [[ ! -f "package.json" ]]; then
        log "Creating root package.json for monitoring dependencies..."
        cat > package.json << 'EOF'
{
  "name": "titan-monitoring",
  "version": "1.0.0",
  "description": "Titan Trading System Monitoring",
  "private": true,
  "dependencies": {}
}
EOF
    fi
    
    # Install monitoring packages
    for package in "${monitoring_packages[@]}"; do
        if ! npm list "$package" &> /dev/null; then
            npm install "$package" --save
            log "Installed package: $package"
        fi
    done
    
    success "Monitoring dependencies installed"
}

# Create Prometheus configuration
create_prometheus_config() {
    log "Creating Prometheus configuration..."
    
    cat > "$MONITORING_DIR/prometheus/prometheus.yml" << 'EOF'
# Prometheus Configuration for Titan Trading System
global:
  scrape_interval: 30s
  evaluation_interval: 30s
  external_labels:
    monitor: 'titan-trading-system'
    environment: 'production'

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

scrape_configs:
  # System metrics
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
    scrape_interval: 30s

  # Titan services
  - job_name: 'titan-brain'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s

  - job_name: 'titan-execution'
    static_configs:
      - targets: ['localhost:3003']
    metrics_path: '/metrics'
    scrape_interval: 15s

  - job_name: 'titan-shared'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'titan-security'
    static_configs:
      - targets: ['localhost:3002']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'titan-scavenger'
    static_configs:
      - targets: ['localhost:3004']
    metrics_path: '/metrics'
    scrape_interval: 15s

  - job_name: 'titan-ai-quant'
    static_configs:
      - targets: ['localhost:3005']
    metrics_path: '/metrics'
    scrape_interval: 60s



  # Redis metrics
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:6379']
    scrape_interval: 30s

  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
EOF
    
    success "Prometheus configuration created"
}

# Create alert rules
create_alert_rules() {
    log "Creating Prometheus alert rules..."
    
    cat > "$MONITORING_DIR/prometheus/alert_rules.yml" << 'EOF'
groups:
  - name: titan_system_alerts
    rules:
      # System resource alerts
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
          component: system
        annotations:
          summary: "High CPU usage detected"
          description: "CPU usage is above 80% for more than 5 minutes"

      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
        for: 5m
        labels:
          severity: warning
          component: system
        annotations:
          summary: "High memory usage detected"
          description: "Memory usage is above 85% for more than 5 minutes"

      - alert: LowDiskSpace
        expr: (1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100 > 90
        for: 2m
        labels:
          severity: critical
          component: system
        annotations:
          summary: "Low disk space"
          description: "Disk usage is above 90%"

      # Service availability alerts
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
          component: service
        annotations:
          summary: "Service is down"
          description: "{{ $labels.job }} service is not responding"

      # Trading system specific alerts
      - alert: HighDrawdown
        expr: titan_portfolio_drawdown > 0.10
        for: 1m
        labels:
          severity: critical
          component: trading
        annotations:
          summary: "High portfolio drawdown"
          description: "Portfolio drawdown is {{ $value | humanizePercentage }}"

      - alert: ExcessiveLeverage
        expr: titan_total_leverage > 40
        for: 2m
        labels:
          severity: warning
          component: trading
        annotations:
          summary: "Excessive leverage detected"
          description: "Total leverage is {{ $value }}x"

      - alert: TradingVolumeAnomaly
        expr: rate(titan_trades_total[5m]) > 10
        for: 2m
        labels:
          severity: warning
          component: trading
        annotations:
          summary: "High trading frequency"
          description: "Trading frequency is {{ $value }} trades per second"

      # Exchange connectivity alerts
      - alert: ExchangeConnectionLost
        expr: titan_exchange_connected == 0
        for: 30s
        labels:
          severity: critical
          component: exchange
        annotations:
          summary: "Exchange connection lost"
          description: "Connection to {{ $labels.exchange }} is down"

      - alert: HighOrderLatency
        expr: titan_order_latency_seconds > 1.0
        for: 1m
        labels:
          severity: warning
          component: exchange
        annotations:
          summary: "High order execution latency"
          description: "Order latency is {{ $value }}s on {{ $labels.exchange }}"

      # Redis alerts
      - alert: RedisDown
        expr: redis_up == 0
        for: 1m
        labels:
          severity: critical
          component: redis
        annotations:
          summary: "Redis is down"
          description: "Redis server is not responding"

      - alert: RedisHighMemoryUsage
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.9
        for: 5m
        labels:
          severity: warning
          component: redis
        annotations:
          summary: "Redis high memory usage"
          description: "Redis memory usage is {{ $value | humanizePercentage }}"
EOF
    
    success "Alert rules created"
}

# Create Alertmanager configuration
create_alertmanager_config() {
    log "Creating Alertmanager configuration..."
    
    cat > "$MONITORING_DIR/alertmanager/alertmanager.yml" << EOF
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@titan-trading.com'
  smtp_auth_username: ''
  smtp_auth_password: ''

route:
  group_by: ['alertname', 'component']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
      group_wait: 5s
      repeat_interval: 30m
    - match:
        severity: warning
      receiver: 'warning-alerts'
      repeat_interval: 2h
    - match:
        component: trading
      receiver: 'trading-alerts'
      group_wait: 5s
      repeat_interval: 15m

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://localhost:5001/webhook/default'
        send_resolved: true

  - name: 'critical-alerts'
    email_configs:
      - to: '$ALERT_EMAIL'
        subject: 'CRITICAL: Titan Trading System Alert'
        body: |
          Alert: {{ .GroupLabels.alertname }}
          Component: {{ .GroupLabels.component }}
          Severity: {{ .CommonLabels.severity }}
          
          {{ range .Alerts }}
          Description: {{ .Annotations.description }}
          Started: {{ .StartsAt }}
          {{ end }}
    webhook_configs:
      - url: 'http://localhost:5001/webhook/critical'
        send_resolved: true
    slack_configs:
      - api_url: '$SLACK_WEBHOOK'
        channel: '#titan-alerts'
        title: 'CRITICAL: Titan Alert'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'warning-alerts'
    webhook_configs:
      - url: 'http://localhost:5001/webhook/warning'
        send_resolved: true

  - name: 'trading-alerts'
    email_configs:
      - to: '$ALERT_EMAIL'
        subject: 'TRADING ALERT: {{ .GroupLabels.alertname }}'
        body: |
          Trading Alert: {{ .GroupLabels.alertname }}
          
          {{ range .Alerts }}
          Description: {{ .Annotations.description }}
          Started: {{ .StartsAt }}
          {{ end }}
    webhook_configs:
      - url: 'http://localhost:5001/webhook/trading'
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'component']
EOF
    
    success "Alertmanager configuration created"
}

# Create Grafana dashboards
create_grafana_dashboards() {
    log "Creating Grafana dashboards..."
    
    # System overview dashboard
    cat > "$MONITORING_DIR/dashboards/system_overview.json" << 'EOF'
{
  "dashboard": {
    "id": null,
    "title": "Titan System Overview",
    "tags": ["titan", "system"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "CPU Usage",
        "type": "stat",
        "targets": [
          {
            "expr": "100 - (avg(irate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
            "legendFormat": "CPU Usage %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 70},
                {"color": "red", "value": 90}
              ]
            }
          }
        },
        "gridPos": {"h": 8, "w": 6, "x": 0, "y": 0}
      },
      {
        "id": 2,
        "title": "Memory Usage",
        "type": "stat",
        "targets": [
          {
            "expr": "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
            "legendFormat": "Memory Usage %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 70},
                {"color": "red", "value": 90}
              ]
            }
          }
        },
        "gridPos": {"h": 8, "w": 6, "x": 6, "y": 0}
      },
      {
        "id": 3,
        "title": "Service Status",
        "type": "table",
        "targets": [
          {
            "expr": "up",
            "legendFormat": "{{ job }}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "30s"
  }
}
EOF
    
    # Trading dashboard
    cat > "$MONITORING_DIR/dashboards/trading_overview.json" << 'EOF'
{
  "dashboard": {
    "id": null,
    "title": "Titan Trading Overview",
    "tags": ["titan", "trading"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Portfolio Equity",
        "type": "timeseries",
        "targets": [
          {
            "expr": "titan_portfolio_equity",
            "legendFormat": "Total Equity"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "currencyUSD"
          }
        },
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
      },
      {
        "id": 2,
        "title": "Current Drawdown",
        "type": "stat",
        "targets": [
          {
            "expr": "titan_portfolio_drawdown",
            "legendFormat": "Drawdown"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 0.05},
                {"color": "red", "value": 0.10}
              ]
            }
          }
        },
        "gridPos": {"h": 8, "w": 6, "x": 12, "y": 0}
      },
      {
        "id": 3,
        "title": "Active Positions",
        "type": "stat",
        "targets": [
          {
            "expr": "titan_active_positions",
            "legendFormat": "Positions"
          }
        ],
        "gridPos": {"h": 8, "w": 6, "x": 18, "y": 0}
      }
    ],
    "time": {
      "from": "now-6h",
      "to": "now"
    },
    "refresh": "15s"
  }
}
EOF
    
    success "Grafana dashboards created"
}

# Create monitoring service
create_monitoring_service() {
    log "Creating monitoring service..."
    
    cat > "$MONITORING_DIR/scripts/titan-monitor.js" << 'EOF'
#!/usr/bin/env node

/**
 * Titan Trading System Monitor
 * Collects and exposes metrics for Prometheus
 */

const express = require('express');
const promClient = require('prom-client');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// Create Express app
const app = express();
const port = process.env.MONITOR_PORT || 9200;

// Create Prometheus registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const systemMetrics = {
  cpuUsage: new promClient.Gauge({
    name: 'titan_cpu_usage_percent',
    help: 'CPU usage percentage',
    registers: [register]
  }),
  
  memoryUsage: new promClient.Gauge({
    name: 'titan_memory_usage_percent',
    help: 'Memory usage percentage',
    registers: [register]
  }),
  
  diskUsage: new promClient.Gauge({
    name: 'titan_disk_usage_percent',
    help: 'Disk usage percentage',
    labelNames: ['mount'],
    registers: [register]
  }),
  
  networkConnections: new promClient.Gauge({
    name: 'titan_network_connections',
    help: 'Number of network connections',
    labelNames: ['state'],
    registers: [register]
  })
};

const tradingMetrics = {
  portfolioEquity: new promClient.Gauge({
    name: 'titan_portfolio_equity',
    help: 'Total portfolio equity in USD',
    registers: [register]
  }),
  
  portfolioDrawdown: new promClient.Gauge({
    name: 'titan_portfolio_drawdown',
    help: 'Current portfolio drawdown percentage',
    registers: [register]
  }),
  
  totalLeverage: new promClient.Gauge({
    name: 'titan_total_leverage',
    help: 'Total leverage across all positions',
    registers: [register]
  }),
  
  activePositions: new promClient.Gauge({
    name: 'titan_active_positions',
    help: 'Number of active trading positions',
    registers: [register]
  }),
  
  tradesTotal: new promClient.Counter({
    name: 'titan_trades_total',
    help: 'Total number of trades executed',
    labelNames: ['phase', 'side', 'result'],
    registers: [register]
  })
};

const serviceMetrics = {
  serviceUp: new promClient.Gauge({
    name: 'titan_service_up',
    help: 'Service availability (1 = up, 0 = down)',
    labelNames: ['service'],
    registers: [register]
  }),
  
  exchangeConnected: new promClient.Gauge({
    name: 'titan_exchange_connected',
    help: 'Exchange connection status (1 = connected, 0 = disconnected)',
    labelNames: ['exchange'],
    registers: [register]
  }),
  
  orderLatency: new promClient.Histogram({
    name: 'titan_order_latency_seconds',
    help: 'Order execution latency in seconds',
    labelNames: ['exchange'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0],
    registers: [register]
  })
};

// Collect system metrics
async function collectSystemMetrics() {
  try {
    // CPU usage
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    
    systemMetrics.cpuUsage.set(usage);
    
    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = ((totalMem - freeMem) / totalMem) * 100;
    
    systemMetrics.memoryUsage.set(memUsage);
    
    // Disk usage
    try {
      const { stdout } = await execAsync('df -h / | tail -1');
      const diskInfo = stdout.trim().split(/\s+/);
      const diskUsage = parseInt(diskInfo[4].replace('%', ''));
      systemMetrics.diskUsage.set({ mount: '/' }, diskUsage);
    } catch (error) {
      console.error('Error collecting disk metrics:', error.message);
    }
    
    // Network connections
    try {
      const { stdout } = await execAsync('netstat -an | grep ESTABLISHED | wc -l');
      const established = parseInt(stdout.trim());
      systemMetrics.networkConnections.set({ state: 'established' }, established);
    } catch (error) {
      console.error('Error collecting network metrics:', error.message);
    }
    
  } catch (error) {
    console.error('Error collecting system metrics:', error.message);
  }
}

// Collect trading metrics
async function collectTradingMetrics() {
  try {
    // Read trading data from logs or API
    // This is a placeholder - implement based on your actual data sources
    
    // Example: Read from trades.jsonl
    const tradesFile = '../logs/trades.jsonl';
    if (fs.existsSync(tradesFile)) {
      // Parse recent trades and update metrics
      // Implementation depends on your log format
    }
    
    // Example: Query Brain service API
    // const response = await fetch('http://localhost:3000/api/metrics');
    // const data = await response.json();
    // tradingMetrics.portfolioEquity.set(data.equity);
    
  } catch (error) {
    console.error('Error collecting trading metrics:', error.message);
  }
}

// Collect service metrics
async function collectServiceMetrics() {
  try {
    const services = [
      { name: 'titan-brain', port: 3000 },
      { name: 'titan-execution', port: 3003 },
      { name: 'titan-shared', port: 3001 },
      { name: 'titan-security', port: 3002 },
      { name: 'titan-scavenger', port: 3004 },

    ];
    
    for (const service of services) {
      try {
        const { stdout } = await execAsync(`netstat -tuln | grep :${service.port}`);
        serviceMetrics.serviceUp.set({ service: service.name }, stdout ? 1 : 0);
      } catch (error) {
        serviceMetrics.serviceUp.set({ service: service.name }, 0);
      }
    }
    
    // Exchange connectivity (placeholder)
    const exchanges = ['binance', 'bybit', 'mexc'];
    exchanges.forEach(exchange => {
      // Check WebSocket connections or API availability
      serviceMetrics.exchangeConnected.set({ exchange }, 1); // Placeholder
    });
    
  } catch (error) {
    console.error('Error collecting service metrics:', error.message);
  }
}

// Metrics collection interval
setInterval(async () => {
  await collectSystemMetrics();
  await collectTradingMetrics();
  await collectServiceMetrics();
}, 30000); // Collect every 30 seconds

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error.message);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
  console.log(`Titan Monitor running on port ${port}`);
  console.log(`Metrics available at http://localhost:${port}/metrics`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});
EOF
    
    chmod +x "$MONITORING_DIR/scripts/titan-monitor.js"
    success "Monitoring service created"
}

# Create alert webhook handler
create_alert_webhook() {
    log "Creating alert webhook handler..."
    
    cat > "$MONITORING_DIR/scripts/alert-webhook.js" << 'EOF'
#!/usr/bin/env node

/**
 * Titan Alert Webhook Handler
 * Processes alerts from Alertmanager and sends notifications
 */

const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');

const app = express();
const port = process.env.WEBHOOK_PORT || 5001;

// Middleware
app.use(express.json());

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || 'localhost',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
};

const transporter = nodemailer.createTransporter(emailConfig);

// Alert handlers
const alertHandlers = {
  async sendEmail(alert, severity) {
    if (!process.env.ALERT_EMAIL) return;
    
    const subject = `${severity.toUpperCase()}: Titan Alert - ${alert.labels.alertname}`;
    const text = `
Alert: ${alert.labels.alertname}
Component: ${alert.labels.component || 'unknown'}
Severity: ${severity}
Description: ${alert.annotations.description}
Started: ${alert.startsAt}
Status: ${alert.status}
    `;
    
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'alerts@titan-trading.com',
        to: process.env.ALERT_EMAIL,
        subject,
        text
      });
      console.log(`Email sent for alert: ${alert.labels.alertname}`);
    } catch (error) {
      console.error('Failed to send email:', error.message);
    }
  },
  
  async sendSlack(alert, severity) {
    if (!process.env.SLACK_WEBHOOK) return;
    
    const payload = {
      text: `${severity.toUpperCase()}: ${alert.labels.alertname}`,
      attachments: [{
        color: severity === 'critical' ? 'danger' : 'warning',
        fields: [
          { title: 'Component', value: alert.labels.component || 'unknown', short: true },
          { title: 'Description', value: alert.annotations.description, short: false },
          { title: 'Status', value: alert.status, short: true }
        ],
        ts: Math.floor(new Date(alert.startsAt).getTime() / 1000)
      }]
    };
    
    try {
      const response = await fetch(process.env.SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        console.log(`Slack notification sent for alert: ${alert.labels.alertname}`);
      } else {
        console.error('Failed to send Slack notification:', response.statusText);
      }
    } catch (error) {
      console.error('Failed to send Slack notification:', error.message);
    }
  },
  
  async logAlert(alert, severity) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      alertname: alert.labels.alertname,
      component: alert.labels.component,
      severity,
      description: alert.annotations.description,
      status: alert.status,
      startsAt: alert.startsAt,
      endsAt: alert.endsAt
    };
    
    const logFile = '../logs/alerts.jsonl';
    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
      fs.appendFileSync(logFile, logLine);
      console.log(`Alert logged: ${alert.labels.alertname}`);
    } catch (error) {
      console.error('Failed to log alert:', error.message);
    }
  }
};

// Webhook endpoints
app.post('/webhook/:type', async (req, res) => {
  const alertType = req.params.type;
  const alerts = req.body.alerts || [];
  
  console.log(`Received ${alerts.length} alerts for type: ${alertType}`);
  
  for (const alert of alerts) {
    const severity = alert.labels.severity || 'unknown';
    
    // Log all alerts
    await alertHandlers.logAlert(alert, severity);
    
    // Handle based on type and severity
    switch (alertType) {
      case 'critical':
        await alertHandlers.sendEmail(alert, 'critical');
        await alertHandlers.sendSlack(alert, 'critical');
        break;
        
      case 'warning':
        await alertHandlers.sendSlack(alert, 'warning');
        break;
        
      case 'trading':
        await alertHandlers.sendEmail(alert, severity);
        await alertHandlers.sendSlack(alert, severity);
        break;
        
      default:
        console.log(`Alert received: ${alert.labels.alertname} (${severity})`);
    }
  }
  
  res.json({ status: 'ok', processed: alerts.length });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
  console.log(`Alert webhook handler running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});
EOF
    
    chmod +x "$MONITORING_DIR/scripts/alert-webhook.js"
    success "Alert webhook handler created"
}

# Create monitoring startup script
create_monitoring_startup() {
    log "Creating monitoring startup script..."
    
    cat > "$MONITORING_DIR/start-monitoring.sh" << 'EOF'
#!/bin/bash

# Start Titan Monitoring Stack

set -e

MONITORING_DIR="$(dirname "$0")"
cd "$MONITORING_DIR"

echo "🚀 Starting Titan Monitoring Stack..."

# Start monitoring service
echo "📊 Starting Titan Monitor..."
node scripts/titan-monitor.js > logs/monitor.log 2>&1 &
echo $! > monitor.pid

# Start alert webhook handler
echo "🚨 Starting Alert Webhook Handler..."
node scripts/alert-webhook.js > logs/webhook.log 2>&1 &
echo $! > webhook.pid

# Start Prometheus (if installed)
if command -v prometheus &> /dev/null; then
    echo "📈 Starting Prometheus..."
    prometheus \
        --config.file=prometheus/prometheus.yml \
        --storage.tsdb.path=data/prometheus \
        --web.listen-address=0.0.0.0:9090 \
        --web.enable-lifecycle \
        > logs/prometheus.log 2>&1 &
    echo $! > prometheus.pid
fi

# Start Alertmanager (if installed)
if command -v alertmanager &> /dev/null; then
    echo "🚨 Starting Alertmanager..."
    alertmanager \
        --config.file=alertmanager/alertmanager.yml \
        --storage.path=data/alertmanager \
        --web.listen-address=0.0.0.0:9093 \
        > logs/alertmanager.log 2>&1 &
    echo $! > alertmanager.pid
fi

echo "✅ Monitoring stack started!"
echo ""
echo "🌐 Access URLs:"
echo "   Titan Monitor: http://localhost:9200/metrics"
echo "   Prometheus:    http://localhost:9090 (if installed)"
echo "   Alertmanager:  http://localhost:9093 (if installed)"
EOF
    
    chmod +x "$MONITORING_DIR/start-monitoring.sh"
    
    # Create stop script
    cat > "$MONITORING_DIR/stop-monitoring.sh" << 'EOF'
#!/bin/bash

# Stop Titan Monitoring Stack

MONITORING_DIR="$(dirname "$0")"
cd "$MONITORING_DIR"

echo "🛑 Stopping Titan Monitoring Stack..."

# Stop services
for service in monitor webhook prometheus alertmanager; do
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
    
    success "Monitoring startup scripts created"
}

# Create PM2 ecosystem for monitoring
create_monitoring_ecosystem() {
    log "Creating PM2 ecosystem for monitoring..."
    
    cat > "$MONITORING_DIR/ecosystem.monitoring.js" << 'EOF'
module.exports = {
  apps: [
    {
      name: 'titan-monitor',
      script: './scripts/titan-monitor.js',
      cwd: './monitoring',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        MONITOR_PORT: 9200
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: './logs/monitor.log',
      error_file: './logs/monitor-error.log'
    },
    {
      name: 'alert-webhook',
      script: './scripts/alert-webhook.js',
      cwd: './monitoring',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: 5001,
        ALERT_EMAIL: process.env.ALERT_EMAIL || '',
        SLACK_WEBHOOK: process.env.SLACK_WEBHOOK || '',
        SMTP_HOST: process.env.SMTP_HOST || 'localhost',
        SMTP_PORT: process.env.SMTP_PORT || 587,
        SMTP_USER: process.env.SMTP_USER || '',
        SMTP_PASS: process.env.SMTP_PASS || ''
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: './logs/webhook.log',
      error_file: './logs/webhook-error.log'
    }
  ]
};
EOF
    
    success "PM2 monitoring ecosystem created"
}

# Main setup function
main() {
    log "Starting Titan Monitoring and Alerting Setup..."
    
    # Create directories
    create_monitoring_directories
    
    # Install dependencies
    install_monitoring_dependencies
    
    # Create configurations
    create_prometheus_config
    create_alert_rules
    create_alertmanager_config
    create_grafana_dashboards
    
    # Create services
    create_monitoring_service
    create_alert_webhook
    
    # Create startup scripts
    create_monitoring_startup
    create_monitoring_ecosystem
    
    success "Titan Monitoring and Alerting Setup completed successfully!"
    
    echo ""
    log "Setup Summary:"
    log "- Prometheus configuration created"
    log "- Alert rules configured"
    log "- Alertmanager setup completed"
    log "- Grafana dashboards created"
    log "- Monitoring service implemented"
    log "- Alert webhook handler created"
    
    echo ""
    log "Next steps:"
    log "1. Install Prometheus and Grafana (optional):"
    log "   - Run: ./scripts/setup-monitoring.sh"
    log "2. Configure email/Slack credentials in environment"
    log "3. Start monitoring services:"
    log "   - Run: cd monitoring && ./start-monitoring.sh"
    log "   - Or use PM2: pm2 start ecosystem.monitoring.js"
    log "4. Import Grafana dashboards from monitoring/dashboards/"
    log "5. Test alerting by triggering test alerts"
}

# Display usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --email EMAIL         Email address for critical alerts
    --slack-webhook URL   Slack webhook URL for notifications
    --discord-webhook URL Discord webhook URL for notifications
    --metrics-interval N  Metrics collection interval in seconds (default: 30)
    -h, --help           Show this help message

Examples:
    $0                                           # Basic setup
    $0 --email admin@company.com                # With email alerts
    $0 --slack-webhook https://hooks.slack.com/... # With Slack notifications

This script will:
1. Create monitoring directory structure
2. Install required Node.js packages
3. Generate Prometheus and Alertmanager configurations
4. Create Grafana dashboards
5. Implement monitoring service and alert handlers
6. Set up startup scripts and PM2 ecosystem

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --email)
                ALERT_EMAIL="$2"
                shift 2
                ;;
            --slack-webhook)
                SLACK_WEBHOOK="$2"
                shift 2
                ;;
            --discord-webhook)
                DISCORD_WEBHOOK="$2"
                shift 2
                ;;
            --metrics-interval)
                METRICS_INTERVAL="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Main execution
echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         TITAN MONITORING & ALERTING SETUP                   ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

parse_args "$@"
main