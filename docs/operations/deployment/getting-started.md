# Titan Trading System - Getting Started Deployment Guide

This guide provides step-by-step instructions for deploying the Titan Trading System from scratch. Follow these procedures for both development and production environments.

## Prerequisites

### System Requirements

**Minimum Requirements** (Development):
- CPU: 4 cores (2.5GHz+)
- RAM: 8GB
- Storage: 100GB SSD
- Network: 100Mbps with low latency to exchanges

**Recommended Requirements** (Production):
- CPU: 8 cores (3.0GHz+)
- RAM: 16GB
- Storage: 500GB NVMe SSD
- Network: 1Gbps with <50ms latency to exchanges
- Redundancy: Load balancer and backup server

**Operating System**:
- Ubuntu 20.04 LTS or 22.04 LTS (recommended)
- CentOS 8+ or RHEL 8+
- Amazon Linux 2

### Software Dependencies

**Core Dependencies**:
```bash
# Node.js 18+ (LTS recommended)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 13+
sudo apt-get install -y postgresql postgresql-contrib

# Redis 6+
sudo apt-get install -y redis-server

# PM2 Process Manager
sudo npm install -g pm2

# Nginx (reverse proxy)
sudo apt-get install -y nginx

# Git (for deployment)
sudo apt-get install -y git curl wget
```

**Optional Dependencies**:
```bash
# Docker (for containerized deployment)
sudo apt-get install -y docker.io docker-compose

# Monitoring tools
sudo apt-get install -y htop iotop nethogs

# SSL certificate management
sudo apt-get install -y certbot python3-certbot-nginx
```

### Trading Account Setup

**Required API Keys**:
1. **Bybit API Keys** (Primary execution venue):
   - Create account at [bybit.com](https://www.bybit.com)
   - Generate API key with trading permissions
   - Whitelist server IP addresses
   - Enable futures trading permissions

2. **MEXC API Keys** (Optional backup venue):
   - Create account at [mexc.com](https://www.mexc.com)
   - Generate API key with trading permissions
   - Configure as backup execution venue

**Security Configuration**:
- Enable IP whitelisting for all API keys
- Use separate API keys for testnet and mainnet
- Implement API key rotation schedule (monthly)
- Store keys securely using environment variables

## Installation Steps

### Step 1: System Preparation

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Create titan user (recommended for security)
sudo useradd -m -s /bin/bash titan
sudo usermod -aG sudo titan

# Switch to titan user
sudo su - titan

# Create application directory
mkdir -p ~/titan-trading
cd ~/titan-trading
```

### Step 2: Clone Repository

```bash
# Clone the repository (replace with actual repository URL)
git clone https://github.com/your-org/titan-trading-system.git .

# Verify repository structure
ls -la
# Should see: services/, config/, scripts/, docs/, etc.
```

### Step 3: Database Setup

**PostgreSQL Configuration**:
```bash
# Switch to postgres user
sudo -u postgres psql

-- Create database and user
CREATE DATABASE titan_brain;
CREATE USER titan_user WITH ENCRYPTED PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE titan_brain TO titan_user;
\q

# Configure PostgreSQL for remote connections (if needed)
sudo nano /etc/postgresql/13/main/postgresql.conf
# Uncomment and modify: listen_addresses = 'localhost'

sudo nano /etc/postgresql/13/main/pg_hba.conf
# Add: local   titan_brain   titan_user   md5

# Restart PostgreSQL
sudo systemctl restart postgresql
sudo systemctl enable postgresql
```

**Redis Configuration**:
```bash
# Configure Redis
sudo nano /etc/redis/redis.conf
# Modify these settings:
# bind 127.0.0.1
# maxmemory 1gb
# maxmemory-policy allkeys-lru

# Restart Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Test Redis connection
redis-cli ping
# Should return: PONG
```

### Step 4: Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit environment configuration
nano .env
```

**Environment Configuration (.env)**:
```bash
# Node Environment
NODE_ENV=production

# Service Ports
BRAIN_PORT=3100
EXECUTION_PORT=3002
CONSOLE_PORT=3001
SCAVENGER_PORT=8081

# Database Configuration
DATABASE_URL=postgresql://titan_user:secure_password_here@localhost:5432/titan_brain
REDIS_URL=redis://localhost:6379

# Bybit API Configuration (Primary)
BYBIT_API_KEY=your_bybit_api_key_here
BYBIT_API_SECRET=your_bybit_api_secret_here
BYBIT_TESTNET=false

# MEXC API Configuration (Backup)
MEXC_API_KEY=your_mexc_api_key_here
MEXC_API_SECRET=your_mexc_api_secret_here

# Security Configuration
WEBHOOK_SECRET=generate_secure_random_string_here
JWT_SECRET=generate_secure_jwt_secret_here
ENCRYPTION_KEY=generate_32_byte_encryption_key_here

# Monitoring Configuration
PROMETHEUS_ENABLED=true
GRAFANA_ENABLED=true
LOG_LEVEL=info

# Trading Configuration
MASTER_ARM_DEFAULT=false
CIRCUIT_BREAKER_ENABLED=true
MAX_DAILY_DRAWDOWN=0.07
MAX_POSITION_SIZE=0.5

# Notification Configuration (Optional)
SLACK_WEBHOOK_URL=your_slack_webhook_url_here
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USERNAME=your_email@gmail.com
EMAIL_PASSWORD=your_app_password_here
```

### Step 5: Install Dependencies

```bash
# Install shared infrastructure dependencies
cd services/shared
npm install
npm run build
cd ../..

# Install Brain service dependencies
cd services/titan-brain
npm install
npm run build
cd ../..

# Install Execution service dependencies
cd services/titan-execution
npm install
# Note: Execution service uses JavaScript, no build step needed
cd ../..

# Install Console service dependencies
cd services/titan-console
npm install
npm run build
cd ../..

# Install Scavenger service dependencies
cd services/titan-phase1-scavenger
npm install
npm run build
cd ../..

# Install AI Quant service dependencies (Python)
cd services/titan-ai-quant
pip3 install -r requirements.txt
cd ../..
```

### Step 6: Database Initialization

```bash
# Run database migrations for Brain service
cd services/titan-brain
npm run migrate
cd ../..

# Run database migrations for Execution service
cd services/titan-execution
npm run migrate
cd ../..

# Verify database setup
psql -h localhost -U titan_user -d titan_brain -c "\dt"
# Should show tables: allocations, decisions, performance, etc.
```

### Step 7: Configuration Validation

```bash
# Validate configuration files
./scripts/validate-config.sh

# Test database connections
./scripts/test-connections.sh

# Validate API keys (testnet first)
./scripts/validate-api-keys.sh --testnet

# Expected output:
# ✅ PostgreSQL connection: OK
# ✅ Redis connection: OK
# ✅ Bybit API keys: Valid
# ✅ MEXC API keys: Valid (optional)
```

### Step 8: Service Startup

**PM2 Ecosystem Configuration**:
```bash
# Review PM2 configuration
cat ecosystem.config.js

# Start all services
pm2 start ecosystem.config.js

# Check service status
pm2 status

# Expected output:
# ┌─────┬────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
# │ id  │ name           │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
# ├─────┼────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
# │ 0   │ titan-brain    │ default     │ 1.0.0   │ fork    │ 12345    │ 5s     │ 0    │ online    │ 0%       │ 45.2mb   │ titan    │ disabled │
# │ 1   │ titan-execution│ default     │ 1.0.0   │ fork    │ 12346    │ 5s     │ 0    │ online    │ 0%       │ 52.1mb   │ titan    │ disabled │
# │ 2   │ titan-console  │ default     │ 1.0.0   │ fork    │ 12347    │ 5s     │ 0    │ online    │ 0%       │ 38.7mb   │ titan    │ disabled │
# │ 3   │ titan-scavenger│ default     │ 1.0.0   │ fork    │ 12348    │ 5s     │ 0    │ online    │ 0%       │ 41.3mb   │ titan    │ disabled │
# └─────┴────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘

# View logs
pm2 logs

# Save PM2 configuration for auto-restart
pm2 save
pm2 startup
# Follow the instructions to enable auto-startup
```

### Step 9: Health Verification

```bash
# Run comprehensive health check
./scripts/health-check.sh

# Expected output:
# 🏥 Titan Trading System Health Check
# =====================================
# 
# ✅ Brain Service (http://localhost:3100/health)
#    Status: ok, Uptime: 30s
# 
# ✅ Execution Service (http://localhost:3002/health)
#    Status: ok, Uptime: 30s
# 
# ✅ Console Service (http://localhost:3001/health)
#    Status: ok, Uptime: 30s
# 
# ✅ Scavenger Service (http://localhost:8081/health)
#    Status: ok, Uptime: 30s
# 
# ✅ Database Connectivity
#    PostgreSQL: Connected
#    Redis: Connected
# 
# ✅ Exchange Connectivity
#    Bybit: Connected
#    MEXC: Connected (optional)
# 
# ✅ WebSocket Channels
#    Console: Active
#    Scavenger: Active
#    Status: Active
# 
# 🎯 All systems operational!
```

### Step 10: Nginx Configuration (Production)

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/titan-trading

# Nginx configuration content:
```

**Nginx Configuration**:
```nginx
# Titan Trading System - Nginx Configuration

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=webhook:10m rate=1000r/m;

# Upstream servers
upstream titan_brain {
    server 127.0.0.1:3100;
    keepalive 32;
}

upstream titan_execution {
    server 127.0.0.1:3002;
    keepalive 32;
}

upstream titan_console {
    server 127.0.0.1:3001;
    keepalive 32;
}

# Main server block
server {
    listen 80;
    server_name titan.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name titan.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/titan.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/titan.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    # Console (Main Dashboard)
    location / {
        proxy_pass http://titan_console;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Brain API
    location /api/brain/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://titan_brain/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout settings
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }
    
    # Execution API and Webhooks
    location /api/execution/ {
        limit_req zone=api burst=50 nodelay;
        
        proxy_pass http://titan_execution/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Webhook endpoints (higher rate limit)
    location /webhook {
        limit_req zone=webhook burst=100 nodelay;
        
        proxy_pass http://titan_execution;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Webhook-specific settings
        proxy_connect_timeout 2s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
    }
    
    # WebSocket endpoints
    location /ws/ {
        proxy_pass http://titan_execution;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket settings
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    
    # Health checks (no rate limiting)
    location /health {
        proxy_pass http://titan_execution;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }
    
    # Metrics endpoint (restricted access)
    location /metrics {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        deny all;
        
        proxy_pass http://titan_execution;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

**Enable Nginx Configuration**:
```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/titan-trading /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx

# Obtain SSL certificate (if using Let's Encrypt)
sudo certbot --nginx -d titan.yourdomain.com
```

### Step 11: Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow specific service ports (if direct access needed)
sudo ufw allow from 10.0.0.0/8 to any port 3100  # Brain (internal only)
sudo ufw allow from 10.0.0.0/8 to any port 3002  # Execution (internal only)

# Check firewall status
sudo ufw status verbose
```

### Step 12: Monitoring Setup (Optional)

```bash
# Install Prometheus (monitoring)
wget https://github.com/prometheus/prometheus/releases/download/v2.40.0/prometheus-2.40.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
sudo mv prometheus-*/prometheus /usr/local/bin/
sudo mv prometheus-*/promtool /usr/local/bin/

# Create Prometheus configuration
sudo mkdir -p /etc/prometheus
sudo nano /etc/prometheus/prometheus.yml
```

**Prometheus Configuration**:
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "titan_rules.yml"

scrape_configs:
  - job_name: 'titan-services'
    static_configs:
      - targets: ['localhost:3100', 'localhost:3002']
    scrape_interval: 5s
    metrics_path: /metrics

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

## Post-Deployment Verification

### Functional Testing

```bash
# Test signal flow
./scripts/test-signal-flow.sh

# Test WebSocket connections
./scripts/test-websockets.sh

# Test emergency controls
./scripts/test-emergency-controls.sh --dry-run

# Test configuration changes
./scripts/test-config-changes.sh
```

### Performance Testing

```bash
# Run performance benchmarks
./scripts/benchmark-system.sh

# Test under load
./scripts/load-test.sh --duration 300 --concurrent 50

# Monitor resource usage
./scripts/monitor-resources.sh --duration 600
```

### Security Testing

```bash
# Test API security
./scripts/test-api-security.sh

# Verify SSL configuration
./scripts/test-ssl-config.sh

# Check for security vulnerabilities
./scripts/security-scan.sh
```

## Initial Configuration

### Trading Parameters

```bash
# Access the console
curl -u admin:password https://titan.yourdomain.com/api/execution/config

# Set initial risk parameters
curl -X POST https://titan.yourdomain.com/api/execution/config \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "risk_tuner": {
      "phase1_risk_pct": 0.02,
      "phase2_risk_pct": 0.015
    },
    "asset_whitelist": {
      "enabled": true,
      "assets": ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    }
  }'
```

### Enable Master Arm

```bash
# Enable Master Arm (allows live trading)
curl -X POST https://titan.yourdomain.com/api/execution/master-arm \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "enabled": true,
    "operator_id": "admin"
  }'
```

## Troubleshooting Common Issues

### Service Won't Start

```bash
# Check logs
pm2 logs titan-brain --lines 50

# Check port conflicts
sudo netstat -tlnp | grep :3100

# Check environment variables
pm2 show titan-brain
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql -h localhost -U titan_user -d titan_brain -c "SELECT 1;"

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-13-main.log

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### API Key Issues

```bash
# Test Bybit API keys
./scripts/test-bybit-connection.sh

# Check API key permissions
curl -H "X-BAPI-API-KEY: your_api_key" \
     -H "X-BAPI-TIMESTAMP: $(date +%s)000" \
     "https://api.bybit.com/v5/account/wallet-balance"
```

### WebSocket Connection Issues

```bash
# Test WebSocket connectivity
wscat -c ws://localhost:3002/ws/console

# Check Nginx WebSocket configuration
sudo nginx -t
sudo systemctl reload nginx
```

## Next Steps

After successful deployment:

1. **Set up monitoring**: Configure Grafana dashboards and alerts
2. **Configure backups**: Set up automated database and configuration backups
3. **Security hardening**: Implement additional security measures
4. **Performance tuning**: Optimize system performance for your workload
5. **Documentation**: Document your specific configuration and procedures

For detailed information on these topics, see:
- [Monitoring Setup](../monitoring/prometheus-setup.md)
- [Backup Procedures](../maintenance/backup-procedures.md)
- [Security Hardening](../maintenance/security-hardening.md)
- [Performance Tuning](../maintenance/performance-tuning.md)

## Support

If you encounter issues during deployment:

1. Check the [troubleshooting guide](../troubleshooting/common-issues.md)
2. Review service logs: `pm2 logs`
3. Run health checks: `./scripts/health-check.sh`
4. Contact support with detailed error messages and system information

---

**Deployment completed successfully!** Your Titan Trading System is now ready for operation.