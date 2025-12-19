# Titan Execution Service - Deployment Guide

This guide provides step-by-step instructions for deploying the Titan Execution Service to production.

**Requirements**: All production readiness requirements

---

## Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04 LTS or later (recommended)
- **CPU**: 2+ cores
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 50GB SSD (for database and backups)
- **Network**: Stable internet connection with low latency to exchanges

### Software Requirements
- **Node.js**: v18.x or later
- **npm**: v9.x or later
- **PM2**: v5.x or later (process manager)
- **SQLite**: v3.x or later
- **Redis**: v7.x or later (optional, for distributed deployments)
- **Prometheus**: v2.x or later (for monitoring)
- **Grafana**: v9.x or later (for dashboards)

### Exchange Accounts
- **Bybit Account**: With API keys (testnet and mainnet)
- **Binance Account**: For market data (no API keys needed for public data)

### AWS Account (Optional)
- **S3 Bucket**: For off-server database backups
- **IAM Credentials**: With S3 write permissions

---

## Installation Steps

### 1. Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v18.x or later
npm --version   # Should be v9.x or later

# Install PM2 globally
sudo npm install -g pm2

# Install Redis (optional)
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify Redis
redis-cli ping  # Should return PONG
```

### 2. Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/titan
sudo chown $USER:$USER /opt/titan

# Clone repository
cd /opt/titan
git clone <your-repo-url> .

# Navigate to execution service
cd services/titan-execution
```

### 3. Install Dependencies

```bash
# Install Node.js dependencies
npm ci --production

# Verify installation
npm list --depth=0
```

### 4. Configure Environment Variables

```bash
# Create .env file
cp .env.example .env

# Edit .env with your values
nano .env
```

**Required Environment Variables**:

```bash
# Server Configuration
PORT=8080
HOST=0.0.0.0
NODE_ENV=production

# Security
HMAC_SECRET=<generate-random-32-char-string>
TITAN_MASTER_PASSWORD=<strong-password-min-16-chars>

# Bybit Configuration (Testnet first!)
BYBIT_API_KEY=<your-testnet-api-key>
BYBIT_API_SECRET=<your-testnet-api-secret>
BYBIT_TESTNET=true
BYBIT_CATEGORY=linear
BYBIT_RATE_LIMIT_RPS=10
BYBIT_MAX_RETRIES=3

# Database
DATABASE_PATH=./titan_execution.db
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=30

# Monitoring
LOG_LEVEL=info
PROMETHEUS_ENABLED=true

# AWS S3 (Optional)
AWS_S3_BUCKET=<your-s3-bucket-name>
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>

# Redis (Optional)
REDIS_URL=redis://localhost:6379
```

**Generate HMAC Secret**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Configure Application

```bash
# Copy example configuration
cp config/production.example.json config/production.json

# Edit configuration
nano config/production.json
```

Update the following fields:
- `hmacSecret`: Use the generated HMAC secret
- `masterPassword`: Use your master password
- `bybit.apiKey`: Your Bybit API key
- `bybit.apiSecret`: Your Bybit API secret
- `bybit.testnet`: Set to `true` for testnet, `false` for mainnet

### 6. Encrypt Credentials

```bash
# Set master password
export TITAN_MASTER_PASSWORD="your-strong-password"

# Create credentials JSON
cat > credentials.json << EOF
{
  "bybit": {
    "apiKey": "your-api-key",
    "apiSecret": "your-api-secret"
  }
}
EOF

# Encrypt credentials
cat credentials.json | node security/CredentialManager.js encrypt

# Verify encryption
node security/CredentialManager.js exists

# Delete plaintext credentials
rm credentials.json

# Verify encrypted file
ls -lh ~/.titan/credentials.enc
```

### 7. Initialize Database

```bash
# The database will be created automatically on first run
# But you can verify the schema:
sqlite3 titan_execution.db ".schema"
```

### 8. Test Configuration

```bash
# Validate configuration
node -e "import('./config/ConfigValidator.js').then(m => m.validateOnStartup('config/production.json'))"

# Test Bybit connection (testnet)
USE_MOCK_BROKER=false BYBIT_TESTNET=true node -e "
import('./adapters/BybitAdapter.js').then(async (m) => {
  const adapter = new m.BybitAdapter({
    apiKey: process.env.BYBIT_API_KEY,
    apiSecret: process.env.BYBIT_API_SECRET,
    testnet: true
  });
  const health = await adapter.healthCheck();
  console.log('Health check:', health);
  process.exit(health.success ? 0 : 1);
});
"
```

---

## Deployment

### 1. Start with PM2

```bash
# Start Execution Service
pm2 start server.js --name titan-execution \
  --max-memory-restart 500M \
  --time \
  --log-date-format "YYYY-MM-DD HH:mm:ss Z"

# View logs
pm2 logs titan-execution

# Check status
pm2 status
```

### 2. Configure PM2 Startup

```bash
# Generate startup script
pm2 startup

# Save PM2 process list
pm2 save

# Verify startup configuration
sudo systemctl status pm2-$USER
```

### 3. Verify Health

```bash
# Wait for service to start (30 seconds)
sleep 30

# Check health endpoint
curl http://localhost:8080/api/health | jq .

# Expected output:
# {
#   "status": "healthy",
#   "timestamp": "2025-12-07T...",
#   "uptime": 30,
#   "websocket": "healthy",
#   "database": "healthy",
#   "broker": "healthy"
# }
```

### 4. Test with Testnet

```bash
# Send test PREPARE signal
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "signal": {
      "signal_id": "test_001",
      "signal_type": "PREPARE",
      "source": "scavenger",
      "symbol": "BTCUSDT",
      "direction": "LONG",
      "entry_zone": { "min": 50000, "max": 50100 },
      "stop_loss": 49500,
      "take_profits": [51500],
      "confidence": 90,
      "leverage": 20,
      "timestamp": '$(date +%s000)'
    },
    "signature": "test-signature"
  }'

# Check Shadow State
curl http://localhost:8080/api/state/positions | jq .

# Check logs
pm2 logs titan-execution --lines 50
```

---

## Monitoring Setup

### 1. Install Prometheus

```bash
# Download Prometheus
cd /tmp
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-2.45.0.linux-amd64.tar.gz
sudo mv prometheus-2.45.0.linux-amd64 /opt/prometheus

# Create Prometheus user
sudo useradd --no-create-home --shell /bin/false prometheus

# Create directories
sudo mkdir -p /etc/prometheus /var/lib/prometheus
sudo chown prometheus:prometheus /var/lib/prometheus

# Create Prometheus configuration
sudo tee /etc/prometheus/prometheus.yml > /dev/null << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'titan-execution'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/metrics'
EOF

# Create systemd service
sudo tee /etc/systemd/system/prometheus.service > /dev/null << EOF
[Unit]
Description=Prometheus
Wants=network-online.target
After=network-online.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/opt/prometheus/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus/ \
  --web.console.templates=/opt/prometheus/consoles \
  --web.console.libraries=/opt/prometheus/console_libraries

[Install]
WantedBy=multi-user.target
EOF

# Start Prometheus
sudo systemctl daemon-reload
sudo systemctl enable prometheus
sudo systemctl start prometheus

# Verify Prometheus
curl http://localhost:9090/-/healthy
```

### 2. Install Grafana

```bash
# Add Grafana repository
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -

# Install Grafana
sudo apt-get update
sudo apt-get install -y grafana

# Start Grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server

# Verify Grafana
curl http://localhost:3000/api/health
```

### 3. Configure Grafana

```bash
# Access Grafana web interface
# URL: http://your-server-ip:3000
# Default credentials: admin/admin

# Add Prometheus data source:
# 1. Go to Configuration > Data Sources
# 2. Click "Add data source"
# 3. Select "Prometheus"
# 4. Set URL to http://localhost:9090
# 5. Click "Save & Test"

# Import Titan dashboard:
# 1. Go to Dashboards > Import
# 2. Upload monitoring/grafana-dashboard.json
# 3. Select Prometheus data source
# 4. Click "Import"
```

---

## Backup Configuration

### 1. Configure Automated Backups

```bash
# Create backup script wrapper
sudo tee /opt/titan/services/titan-execution/backup.sh > /dev/null << 'EOF'
#!/bin/bash
cd /opt/titan/services/titan-execution
export DATABASE_PATH=./titan_execution.db
export BACKUP_DIR=./backups
export AWS_S3_BUCKET=your-s3-bucket
export AWS_REGION=us-east-1
node scripts/backup-database.js >> logs/backup.log 2>&1
EOF

# Make executable
sudo chmod +x /opt/titan/services/titan-execution/backup.sh

# Add to crontab (hourly backups)
crontab -e

# Add this line:
0 * * * * /opt/titan/services/titan-execution/backup.sh
```

### 2. Test Backup

```bash
# Run backup manually
./backup.sh

# Verify backup created
ls -lh backups/

# Test restore
node scripts/restore-database.js --latest
```

---

## Security Hardening

### 1. Firewall Configuration

```bash
# Enable UFW firewall
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow Execution Service (internal only)
sudo ufw allow from 10.0.0.0/8 to any port 8080

# Allow Prometheus (internal only)
sudo ufw allow from 10.0.0.0/8 to any port 9090

# Allow Grafana (internal only)
sudo ufw allow from 10.0.0.0/8 to any port 3000

# Verify rules
sudo ufw status
```

### 2. SSL/TLS Configuration (Optional)

```bash
# Install Certbot
sudo apt install -y certbot

# Generate SSL certificate
sudo certbot certonly --standalone -d your-domain.com

# Update .env to use HTTPS
# Add to .env:
HTTPS_ENABLED=true
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem

# Restart service
pm2 restart titan-execution
```

### 3. File Permissions

```bash
# Restrict database permissions
chmod 600 titan_execution.db

# Restrict credentials permissions
chmod 600 ~/.titan/credentials.enc

# Restrict configuration permissions
chmod 600 config/production.json
chmod 600 .env
```

---

## Health Check Verification

### 1. System Health

```bash
# Check all components
curl http://localhost:8080/api/health | jq .

# Check Prometheus metrics
curl http://localhost:8080/metrics | grep titan_health_status

# Check PM2 status
pm2 status

# Check logs for errors
pm2 logs titan-execution --lines 100 | grep -i error
```

### 2. Trading Health

```bash
# Check Shadow State
curl http://localhost:8080/api/state/positions | jq .

# Check account equity
curl http://localhost:8080/api/state/equity | jq .

# Check recent signals
curl http://localhost:8080/api/state/signals | jq .
```

---

## Switching from Testnet to Mainnet

**⚠️ CRITICAL: Only switch to mainnet after thorough testnet testing!**

### 1. Verify Testnet Success

```bash
# Check testnet trading history
curl http://localhost:8080/api/trades | jq .

# Verify no errors in logs
pm2 logs titan-execution --lines 1000 | grep -i error

# Verify Shadow State accuracy
curl http://localhost:8080/api/state/reconcile | jq .
```

### 2. Update Configuration

```bash
# Stop service
pm2 stop titan-execution

# Update .env
nano .env

# Change:
BYBIT_TESTNET=false
BYBIT_API_KEY=<mainnet-api-key>
BYBIT_API_SECRET=<mainnet-api-secret>

# Update encrypted credentials
export TITAN_MASTER_PASSWORD="your-password"
cat > credentials.json << EOF
{
  "bybit": {
    "apiKey": "mainnet-api-key",
    "apiSecret": "mainnet-api-secret"
  }
}
EOF

cat credentials.json | node security/CredentialManager.js encrypt
rm credentials.json

# Restart service
pm2 restart titan-execution
```

### 3. Verify Mainnet Connection

```bash
# Check health
curl http://localhost:8080/api/health | jq .

# Verify mainnet connection
pm2 logs titan-execution | grep "Bybit connection test successful"

# Start with small position
# Monitor closely for first 24 hours
```

---

## Troubleshooting

See [Error Recovery Runbook](./runbooks/error-recovery.md) for detailed troubleshooting procedures.

### Common Issues

**Service won't start**:
```bash
# Check logs
pm2 logs titan-execution --err

# Check configuration
node -e "import('./config/ConfigValidator.js').then(m => m.validateOnStartup('config/production.json'))"

# Check permissions
ls -l titan_execution.db
ls -l ~/.titan/credentials.enc
```

**Database errors**:
```bash
# Check integrity
sqlite3 titan_execution.db "PRAGMA integrity_check;"

# Restore from backup if corrupted
node scripts/restore-database.js --latest
```

**Bybit connection errors**:
```bash
# Test API keys
node -e "import('./adapters/BybitAdapter.js').then(async (m) => {
  const adapter = new m.BybitAdapter({
    apiKey: process.env.BYBIT_API_KEY,
    apiSecret: process.env.BYBIT_API_SECRET,
    testnet: process.env.BYBIT_TESTNET === 'true'
  });
  const health = await adapter.healthCheck();
  console.log(health);
});
"
```

---

## Maintenance

### Daily Tasks
- Check Grafana dashboards
- Review error logs
- Verify backup creation

### Weekly Tasks
- Review trading performance
- Check disk space
- Update dependencies (if needed)

### Monthly Tasks
- Security audit
- Performance optimization
- Disaster recovery drill

---

## Rollback Procedure

If issues occur after deployment:

```bash
# 1. Stop service
pm2 stop titan-execution

# 2. Restore database from backup
node scripts/restore-database.js --latest

# 3. Revert code changes
git checkout <previous-commit>
npm ci

# 4. Restart service
pm2 restart titan-execution

# 5. Verify health
curl http://localhost:8080/api/health
```

---

## Support

For issues or questions:
- Check [Error Recovery Runbook](./runbooks/error-recovery.md)
- Review logs: `pm2 logs titan-execution`
- Check Grafana dashboards
- Contact on-call engineer

---

## Appendix: Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Yes | 8080 | HTTP server port |
| `HOST` | Yes | 0.0.0.0 | HTTP server host |
| `NODE_ENV` | Yes | production | Environment (production/development) |
| `HMAC_SECRET` | Yes | - | HMAC secret for webhook signatures |
| `TITAN_MASTER_PASSWORD` | Yes | - | Master password for credential encryption |
| `BYBIT_API_KEY` | Yes | - | Bybit API key |
| `BYBIT_API_SECRET` | Yes | - | Bybit API secret |
| `BYBIT_TESTNET` | Yes | false | Use Bybit testnet |
| `DATABASE_PATH` | No | ./titan_execution.db | SQLite database path |
| `BACKUP_DIR` | No | ./backups | Backup directory |
| `AWS_S3_BUCKET` | No | - | S3 bucket for backups |
| `REDIS_URL` | No | - | Redis connection URL |
| `LOG_LEVEL` | No | info | Log level (debug/info/warn/error) |
