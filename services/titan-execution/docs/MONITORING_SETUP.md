# Monitoring Setup Guide - Prometheus + Grafana

This guide walks you through setting up production monitoring for the Titan Execution Service using Prometheus and Grafana.

## Prerequisites

- macOS (Homebrew) or Linux
- Titan Execution Service running on port 3001
- Basic understanding of Prometheus and Grafana

## Quick Start (5 minutes)

```bash
# 1. Install Prometheus and Grafana
brew install prometheus grafana

# 2. Start Prometheus (scrapes metrics from Titan)
prometheus --config.file=services/titan-execution/monitoring/prometheus.yml

# 3. Start Grafana (visualizes metrics)
brew services start grafana

# 4. Import dashboard
# Open http://localhost:3000 (admin/admin)
# Import services/titan-execution/monitoring/grafana-dashboard.json
```

## Detailed Setup

### Step 1: Install Prometheus

**macOS:**
```bash
brew install prometheus
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install prometheus
```

**Verify installation:**
```bash
prometheus --version
```

### Step 2: Configure Prometheus

Create Prometheus configuration file:

```bash
# Create config file
cat > services/titan-execution/monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 5s
  evaluation_interval: 5s

scrape_configs:
  - job_name: 'titan-execution'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
    scrape_interval: 5s
EOF
```

### Step 3: Start Prometheus

```bash
# Start Prometheus with config
prometheus --config.file=services/titan-execution/monitoring/prometheus.yml

# Or run in background
nohup prometheus --config.file=services/titan-execution/monitoring/prometheus.yml > logs/prometheus.log 2>&1 &
```

**Verify Prometheus is running:**
- Open http://localhost:9090
- Go to Status → Targets
- Verify `titan-execution` target is UP

**Test metrics collection:**
```bash
# Check if metrics are being scraped
curl http://localhost:9090/api/v1/query?query=titan_equity_usd
```

### Step 4: Install Grafana

**macOS:**
```bash
brew install grafana
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana
```

### Step 5: Start Grafana

**macOS:**
```bash
# Start Grafana service
brew services start grafana

# Or run manually
grafana-server --config=/usr/local/etc/grafana/grafana.ini --homepath /usr/local/share/grafana
```

**Linux:**
```bash
sudo systemctl start grafana-server
sudo systemctl enable grafana-server
```

**Verify Grafana is running:**
- Open http://localhost:3000
- Default credentials: `admin` / `admin`
- You'll be prompted to change the password

### Step 6: Add Prometheus Data Source

1. Log in to Grafana (http://localhost:3000)
2. Click **Configuration** (gear icon) → **Data Sources**
3. Click **Add data source**
4. Select **Prometheus**
5. Configure:
   - **Name:** Prometheus
   - **URL:** http://localhost:9090
   - **Access:** Server (default)
6. Click **Save & Test**
7. Verify "Data source is working" message

### Step 7: Import Titan Dashboard

1. Click **Dashboards** (four squares icon) → **Import**
2. Click **Upload JSON file**
3. Select `services/titan-execution/monitoring/grafana-dashboard.json`
4. Select **Prometheus** as the data source
5. Click **Import**

**Dashboard includes:**
- System Health Status
- Account Equity
- Current Drawdown
- Signal Processing Rate
- Order Execution Latency (P95/P99)
- Position P&L by Symbol
- Order Fill Rate
- Active Positions & Leverage
- Signal Results Distribution
- CPU Usage
- Memory Usage

### Step 8: Configure Alerting

#### Option A: Slack Notifications (Recommended)

1. Create Slack Incoming Webhook:
   - Go to https://api.slack.com/apps
   - Create new app → From scratch
   - Enable **Incoming Webhooks**
   - Add webhook to workspace
   - Copy webhook URL

2. Add Slack notification channel in Grafana:
   - Go to **Alerting** → **Contact points**
   - Click **New contact point**
   - **Name:** Slack
   - **Integration:** Slack
   - **Webhook URL:** Paste your webhook URL
   - Click **Test** to verify
   - Click **Save contact point**

3. Create notification policy:
   - Go to **Alerting** → **Notification policies**
   - Click **New policy**
   - **Contact point:** Slack
   - **Matchers:** Add labels to filter alerts
   - Click **Save policy**

#### Option B: Email Notifications

1. Configure SMTP in Grafana:
   ```bash
   # Edit Grafana config
   sudo nano /usr/local/etc/grafana/grafana.ini  # macOS
   # or
   sudo nano /etc/grafana/grafana.ini  # Linux
   ```

2. Add SMTP configuration:
   ```ini
   [smtp]
   enabled = true
   host = smtp.gmail.com:587
   user = your-email@gmail.com
   password = your-app-password
   from_address = your-email@gmail.com
   from_name = Titan Alerts
   ```

3. Restart Grafana:
   ```bash
   brew services restart grafana  # macOS
   # or
   sudo systemctl restart grafana-server  # Linux
   ```

4. Add email notification channel:
   - Go to **Alerting** → **Contact points**
   - Click **New contact point**
   - **Name:** Email
   - **Integration:** Email
   - **Addresses:** your-email@example.com
   - Click **Test** to verify
   - Click **Save contact point**

### Step 9: Configure Alert Rules

The dashboard includes 3 pre-configured alerts:

1. **Drawdown > 5%**
   - Triggers when equity drawdown exceeds 5%
   - Frequency: Check every 1 minute
   - Action: Send notification

2. **Order Latency > 1s**
   - Triggers when P95 order latency exceeds 1 second
   - Frequency: Check every 1 minute
   - Action: Send notification

3. **Fill Rate < 80%**
   - Triggers when order fill rate drops below 80%
   - Frequency: Check every 1 minute
   - Action: Send notification

**To enable alerts:**
1. Open the Titan dashboard
2. Click on each panel with alerts
3. Click **Edit** → **Alert** tab
4. Verify alert is configured
5. Click **Apply**

### Step 10: Test Alerts

**Test Drawdown Alert:**
```bash
# Simulate drawdown by manually updating equity metric
# (This is for testing only - don't do this in production!)
curl -X POST http://localhost:3001/api/test/simulate-drawdown
```

**Test Latency Alert:**
```bash
# Send a slow order to trigger latency alert
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{"signal_type":"PREPARE","symbol":"BTCUSDT","direction":"LONG"}'
```

**Verify alerts:**
- Check Grafana **Alerting** → **Alert rules**
- Check Slack channel for notifications
- Check email inbox for notifications

## Monitoring Best Practices

### 1. Set Up Alert Thresholds

Adjust alert thresholds based on your risk tolerance:

```javascript
// In Grafana dashboard, edit alert conditions:

// Conservative (low risk)
- Drawdown: 3%
- Latency: 500ms
- Fill Rate: 90%

// Moderate (medium risk)
- Drawdown: 5%
- Latency: 1s
- Fill Rate: 80%

// Aggressive (high risk)
- Drawdown: 7%
- Latency: 2s
- Fill Rate: 70%
```

### 2. Monitor Key Metrics

**Critical Metrics (check every 5 minutes):**
- System Health Status
- Account Equity
- Current Drawdown
- Order Fill Rate

**Important Metrics (check hourly):**
- Signal Processing Rate
- Order Execution Latency
- Position P&L
- Active Positions & Leverage

**System Metrics (check daily):**
- CPU Usage
- Memory Usage
- Signal Results Distribution

### 3. Set Up Metric Retention

Configure Prometheus retention:

```bash
# Edit prometheus.yml
storage:
  tsdb:
    retention.time: 30d  # Keep 30 days of data
    retention.size: 10GB  # Or 10GB max
```

### 4. Create Custom Dashboards

Create additional dashboards for specific needs:

**Trading Performance Dashboard:**
- Win rate by symbol
- Average R:R ratio
- Total P&L by day/week/month
- Sharpe ratio

**System Performance Dashboard:**
- IPC latency
- WebSocket connection status
- Database query performance
- API rate limit usage

## Troubleshooting

### Prometheus Not Scraping Metrics

**Check Titan is exposing metrics:**
```bash
curl http://localhost:3001/metrics
```

**Check Prometheus targets:**
- Open http://localhost:9090/targets
- Verify `titan-execution` target is UP
- Check error message if DOWN

**Common issues:**
- Titan not running on port 3001
- Firewall blocking port 3001
- Wrong metrics path in prometheus.yml

### Grafana Not Showing Data

**Check Prometheus data source:**
- Go to Configuration → Data Sources
- Click **Prometheus**
- Click **Save & Test**
- Verify "Data source is working"

**Check dashboard queries:**
- Open dashboard
- Click panel → Edit
- Check query syntax
- Verify metric names match Prometheus

**Common issues:**
- Wrong Prometheus URL
- Prometheus not running
- No data in time range

### Alerts Not Firing

**Check alert configuration:**
- Open dashboard
- Click panel → Edit → Alert tab
- Verify alert conditions
- Check notification channel

**Check notification channel:**
- Go to Alerting → Contact points
- Click **Test** on your channel
- Verify webhook/email works

**Common issues:**
- Alert threshold too high/low
- Notification channel not configured
- Slack webhook expired
- Email SMTP not configured

## Production Deployment

### 1. Run Prometheus as Service

**macOS:**
```bash
# Create LaunchAgent
cat > ~/Library/LaunchAgents/com.titan.prometheus.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.titan.prometheus</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/prometheus</string>
        <string>--config.file=/path/to/titan/services/titan-execution/monitoring/prometheus.yml</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

# Load service
launchctl load ~/Library/LaunchAgents/com.titan.prometheus.plist
```

**Linux:**
```bash
# Create systemd service
sudo cat > /etc/systemd/system/prometheus.service << 'EOF'
[Unit]
Description=Prometheus
After=network.target

[Service]
Type=simple
User=prometheus
ExecStart=/usr/local/bin/prometheus \
  --config.file=/path/to/titan/services/titan-execution/monitoring/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus/data
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable prometheus
sudo systemctl start prometheus
```

### 2. Secure Grafana

**Change default password:**
```bash
# First login, change admin password
# Or use CLI:
grafana-cli admin reset-admin-password <new-password>
```

**Enable HTTPS:**
```bash
# Edit grafana.ini
[server]
protocol = https
cert_file = /path/to/cert.pem
cert_key = /path/to/key.pem
```

**Restrict access:**
```bash
# Edit grafana.ini
[auth.anonymous]
enabled = false

[auth.basic]
enabled = true
```

### 3. Set Up Backup

**Backup Prometheus data:**
```bash
# Create backup script
cat > backup-prometheus.sh << 'EOF'
#!/bin/bash
tar -czf prometheus-backup-$(date +%Y%m%d).tar.gz /var/lib/prometheus/data
EOF

# Add to crontab (daily backup)
0 2 * * * /path/to/backup-prometheus.sh
```

**Backup Grafana dashboards:**
```bash
# Export dashboard JSON
curl -H "Authorization: Bearer <api-key>" \
  http://localhost:3000/api/dashboards/uid/<dashboard-uid> \
  > dashboard-backup.json
```

## Next Steps

1. ✅ Prometheus installed and scraping metrics
2. ✅ Grafana installed with Titan dashboard
3. ✅ Alerts configured for critical metrics
4. ⏳ Set up additional custom dashboards
5. ⏳ Configure long-term metric retention
6. ⏳ Set up automated backups
7. ⏳ Document alert response procedures

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Alerting](https://grafana.com/docs/grafana/latest/alerting/)

## Support

For issues or questions:
1. Check Prometheus logs: `tail -f logs/prometheus.log`
2. Check Grafana logs: `tail -f /var/log/grafana/grafana.log`
3. Check Titan logs: `tail -f logs/execution.log`
4. Review this guide's Troubleshooting section
