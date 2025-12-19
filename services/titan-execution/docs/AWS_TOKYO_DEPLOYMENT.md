# Titan System - AWS Tokyo Deployment Guide

This guide provides step-by-step instructions for deploying the complete Titan Trading System to AWS Tokyo (ap-northeast-1) for optimal latency to Asian exchanges.

## Table of Contents

- [Why AWS Tokyo?](#why-aws-tokyo)
- [Prerequisites](#prerequisites)
- [Infrastructure Setup](#infrastructure-setup)
- [Service Deployment](#service-deployment)
- [PM2 Configuration](#pm2-configuration)
- [Nginx & SSL Setup](#nginx--ssl-setup)
- [Database Initialization](#database-initialization)
- [Credential Encryption](#credential-encryption)
- [Startup & Shutdown](#startup--shutdown)
- [Validation Checklist](#validation-checklist)
- [Monitoring & Alerts](#monitoring--alerts)
- [Troubleshooting](#troubleshooting)

---

## Why AWS Tokyo?

**The Bulgaria Problem**: Running execution from Bulgaria adds ~200ms latency to Bybit (Singapore) and ~250ms to Binance (Tokyo). This "Bulgaria Tax" costs real money on every trade.

**The Solution**: Deploy the execution core to AWS Tokyo (ap-northeast-1):
- **Bybit latency**: ~10ms (vs 200ms from Bulgaria)
- **Binance latency**: ~5ms (vs 250ms from Bulgaria)
- **Control**: You control from Bulgaria via secure WebSocket, but execution happens in Tokyo

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BULGARIA (Your Location)                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ titan-console (Next.js)                                      │   │
│  │ - Connects to Tokyo via WSS                                  │   │
│  │ - ~150ms latency (acceptable for monitoring)                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ WSS (Secure WebSocket)
                              │ ~150ms latency
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS TOKYO (ap-northeast-1)                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ titan-core (Execution Service)                               │   │
│  │ - Shadow State, Risk Overlay, Phase Manager                  │   │
│  │ - <10ms to Bybit, <5ms to Binance                            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ titan-scavenger (Phase 1)                                    │   │
│  │ - Runs on same server (localhost IPC)                        │   │
│  │ - <0.1ms signal delivery                                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### AWS Account Setup

1. **Create AWS Account** (if not already)
2. **Enable MFA** on root account
3. **Create IAM User** with programmatic access
4. **Install AWS CLI**:
   ```bash
   # macOS
   brew install awscli
   
   # Linux
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   ```

5. **Configure AWS CLI**:
   ```bash
   aws configure
   # AWS Access Key ID: <your-access-key>
   # AWS Secret Access Key: <your-secret-key>
   # Default region name: ap-northeast-1
   # Default output format: json
   ```

### Domain & DNS

1. **Register domain** (e.g., `titan-core.yourdomain.com`)
2. **Configure DNS** to point to your EC2 instance (after creation)

### Local Tools

- Git
- SSH client
- Node.js 18+ (for local testing)

---

## Infrastructure Setup

### Step 1: Create EC2 Instance

```bash
# Create key pair
aws ec2 create-key-pair \
  --key-name titan-tokyo-key \
  --query 'KeyMaterial' \
  --output text > titan-tokyo-key.pem

chmod 400 titan-tokyo-key.pem

# Create security group
aws ec2 create-security-group \
  --group-name titan-sg \
  --description "Titan Trading System Security Group" \
  --region ap-northeast-1

# Get security group ID
SG_ID=$(aws ec2 describe-security-groups \
  --group-names titan-sg \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Allow SSH (port 22) - restrict to your IP
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32

# Allow HTTPS (port 443)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Block direct access to port 3000 (internal only)
# (No rule needed - default deny)

# Launch EC2 instance (Ubuntu 22.04 LTS)
aws ec2 run-instances \
  --image-id ami-0d52744d6551d851e \
  --instance-type t3.medium \
  --key-name titan-tokyo-key \
  --security-group-ids $SG_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":50,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=titan-tokyo}]' \
  --region ap-northeast-1
```

### Step 2: Allocate Elastic IP

```bash
# Allocate Elastic IP
ALLOC_ID=$(aws ec2 allocate-address \
  --domain vpc \
  --query 'AllocationId' \
  --output text)

# Get instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=titan-tokyo" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

# Associate Elastic IP
aws ec2 associate-address \
  --instance-id $INSTANCE_ID \
  --allocation-id $ALLOC_ID

# Get public IP
PUBLIC_IP=$(aws ec2 describe-addresses \
  --allocation-ids $ALLOC_ID \
  --query 'Addresses[0].PublicIp' \
  --output text)

echo "Your server IP: $PUBLIC_IP"
```

### Step 3: Connect to Server

```bash
ssh -i titan-tokyo-key.pem ubuntu@$PUBLIC_IP
```

### Step 4: Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js
node --version  # Should be v18.x
npm --version   # Should be v9.x or v10.x

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install SQLite3
sudo apt install -y sqlite3

# Install build tools (for native modules)
sudo apt install -y build-essential python3

# Create data directory
sudo mkdir -p /data
sudo chown ubuntu:ubuntu /data
```

---

## Service Deployment

### Step 1: Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/titan-system
sudo chown ubuntu:ubuntu /opt/titan-system

# Clone repository
cd /opt/titan-system
git clone <your-repo-url> .

# Or upload via SCP
# scp -i titan-tokyo-key.pem -r ./titan ubuntu@$PUBLIC_IP:/opt/titan-system/
```

### Step 2: Install Dependencies

```bash
# Install titan-execution dependencies
cd /opt/titan-system/services/titan-execution
npm ci --production

# Install titan-phase1-scavenger dependencies
cd /opt/titan-system/services/titan-phase1-scavenger
npm ci --production
npm run build

# Install titan-console dependencies (if running on same server)
cd /opt/titan-system/services/titan-console
npm ci --production
npm run build
```

### Step 3: Configure Environment

```bash
# Create titan-execution .env
cd /opt/titan-system/services/titan-execution
cat > .env << 'EOF'
# Server Configuration
PORT=3000
HOST=127.0.0.1
NODE_ENV=production

# Security
HMAC_SECRET=<generate-with: openssl rand -hex 32>
TITAN_MASTER_PASSWORD=<your-strong-password>

# Bybit Configuration
BYBIT_API_KEY=<your-api-key>
BYBIT_API_SECRET=<your-api-secret>
BYBIT_TESTNET=false
BYBIT_CATEGORY=linear
BYBIT_RATE_LIMIT_RPS=10

# Database
DATABASE_PATH=/data/titan.db
BACKUP_DIR=/data/backups

# ZeroMQ (Fast Path)
ZMQ_PORT=5555

# Logging
LOG_LEVEL=info
EOF

# Create titan-scavenger .env
cd /opt/titan-system/services/titan-phase1-scavenger
cat > .env << 'EOF'
# Execution Service Connection
EXECUTION_SERVICE_URL=http://127.0.0.1:3000
ZMQ_URL=tcp://127.0.0.1:5555

# Binance WebSocket
BINANCE_WS_URL=wss://stream.binance.com:9443/ws

# Health Server
HEALTH_PORT=8081

# Logging
LOG_LEVEL=info
EOF
```

---

## PM2 Configuration

### Create Ecosystem File

```bash
cd /opt/titan-system
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'titan-core',
      script: './services/titan-execution/server.js',
      cwd: '/opt/titan-system',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000
    },
    {
      name: 'titan-scavenger',
      script: './services/titan-phase1-scavenger/dist/index.js',
      cwd: '/opt/titan-system',
      args: '--headless',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        ZMQ_PORT: 5555
      },
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000
    },
    {
      name: 'titan-console',
      script: 'npm',
      args: 'start',
      cwd: '/opt/titan-system/services/titan-console',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
EOF
```

### Start Services

```bash
# Start all services
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs

# Save PM2 configuration
pm2 save

# Setup auto-start on reboot
pm2 startup
# Run the command it outputs (sudo env PATH=...)
```

---

## Nginx & SSL Setup

### Step 1: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/titan-core
```

```nginx
# Rate limiting zone
limit_req_zone $binary_remote_addr zone=titan_limit:10m rate=10r/s;

upstream titan_core {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream titan_console {
    server 127.0.0.1:3001;
    keepalive 32;
}

# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name titan-core.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    server_name titan-core.yourdomain.com;

    # SSL Configuration (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/titan-core.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/titan-core.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Basic Auth for API endpoints
    auth_basic "Titan Core";
    auth_basic_user_file /etc/nginx/.htpasswd;

    # Rate limiting
    limit_req zone=titan_limit burst=20 nodelay;

    # API endpoints
    location /api/ {
        proxy_pass http://titan_core;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health endpoint (no auth)
    location /health {
        auth_basic off;
        proxy_pass http://titan_core;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://titan_core;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Scavenger WebSocket
    location /ws/scavenger {
        proxy_pass http://titan_core;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }

    # Console WebSocket
    location /ws/console {
        proxy_pass http://titan_core;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }

    # Console UI (optional - if running on same server)
    location / {
        proxy_pass http://titan_console;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Step 2: Create Basic Auth

```bash
# Install htpasswd utility
sudo apt install -y apache2-utils

# Create password file
sudo htpasswd -c /etc/nginx/.htpasswd titan_admin
# Enter your password when prompted
```

### Step 3: Enable Site

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/titan-core /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 4: Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d titan-core.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## Database Initialization

```bash
# Initialize database with schema
cd /opt/titan-system/services/titan-execution
sqlite3 /data/titan.db < schema.sql

# Verify tables created
sqlite3 /data/titan.db ".tables"

# Expected output:
# active_traps       positions          strategic_insights
# config_versions    regime_snapshots   system_events
# phase_performance  system_state       trade_history
```

---

## Credential Encryption

```bash
# Set master password
export TITAN_MASTER_PASSWORD="your-strong-password"

# Create credentials JSON
cat > /tmp/credentials.json << EOF
{
  "bybit": {
    "apiKey": "your-bybit-api-key",
    "apiSecret": "your-bybit-api-secret"
  },
  "binance": {
    "apiKey": "your-binance-api-key",
    "apiSecret": "your-binance-api-secret"
  }
}
EOF

# Encrypt credentials
cd /opt/titan-system/services/titan-execution
node scripts/encrypt-credentials.js /tmp/credentials.json

# Delete plaintext credentials
rm /tmp/credentials.json

# Verify encrypted file exists
ls -la ~/.titan/credentials.enc
```

---

## Startup & Shutdown

### Start All Services

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Or use the startup script
./start-titan.sh
```

### Stop All Services

```bash
# Graceful shutdown
pm2 stop all

# Or use the shutdown script
./stop-titan.sh
```

### Restart Services

```bash
# Restart all
pm2 restart all

# Restart specific service
pm2 restart titan-core
```

### View Logs

```bash
# All logs
pm2 logs

# Specific service
pm2 logs titan-core

# Last 100 lines
pm2 logs titan-core --lines 100
```

---

## Validation Checklist

### Infrastructure Validation

```bash
# 1. Check PM2 status
pm2 status
# Expected: titan-core, titan-scavenger, titan-console all "online"

# 2. Check health endpoint
curl https://titan-core.yourdomain.com/health
# Expected: {"status":"healthy",...}

# 3. Check WebSocket connection
# From Bulgaria, open Console and verify connection indicator is green

# 4. Check database persistence
sqlite3 /data/titan.db "SELECT * FROM system_state;"
# Expected: system state records
```

### Communication Validation

```bash
# 1. Test ZeroMQ Fast Path
# Send test signal from scavenger, verify titan-core receives it
pm2 logs titan-core | grep "Signal received"

# 2. Test WebSocket to Console
# Open Console from Bulgaria, verify real-time updates
```

### Security Validation

```bash
# 1. Verify API keys encrypted
ls -la ~/.titan/credentials.enc
# Expected: encrypted file exists

# 2. Test Basic Auth
curl -u titan_admin:wrong_password https://titan-core.yourdomain.com/api/health
# Expected: 401 Unauthorized

curl -u titan_admin:correct_password https://titan-core.yourdomain.com/api/health
# Expected: 200 OK

# 3. Verify port 3000 blocked externally
nmap -p 3000 titan-core.yourdomain.com
# Expected: filtered or closed
```

### Recovery Validation

```bash
# 1. Test server reboot
sudo reboot

# Wait 2 minutes, then reconnect
ssh -i titan-tokyo-key.pem ubuntu@$PUBLIC_IP

# 2. Verify services auto-started
pm2 status
# Expected: all services "online"

# 3. Verify Shadow State restored
curl https://titan-core.yourdomain.com/api/state/positions
# Expected: positions from before reboot
```

### Log Deployment Validation

```bash
# After all checks pass, log the event
curl -X POST https://titan-core.yourdomain.com/api/system/event \
  -H "Content-Type: application/json" \
  -u titan_admin:your_password \
  -d '{
    "event_type": "DEPLOYMENT_VALIDATED",
    "details": {
      "server": "aws-tokyo",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "checks_passed": ["infrastructure", "communication", "security", "recovery"]
    }
  }'
```

---

## Monitoring & Alerts

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Process metrics
pm2 show titan-core
```

### Log Monitoring

```bash
# Watch for errors
pm2 logs --err

# Search for specific events
pm2 logs titan-core | grep -i "error\|warning\|circuit"
```

### Health Check Script

Create `/opt/titan-system/scripts/health-check.sh`:

```bash
#!/bin/bash

HEALTH_URL="http://127.0.0.1:3000/health"
ALERT_EMAIL="your-email@example.com"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ "$response" != "200" ]; then
    echo "Titan health check failed at $(date)" | mail -s "TITAN ALERT: Health Check Failed" $ALERT_EMAIL
    pm2 restart titan-core
fi
```

Add to crontab:
```bash
# Run health check every minute
* * * * * /opt/titan-system/scripts/health-check.sh
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
pm2 logs titan-core --err --lines 100

# Common issues:
# 1. Port already in use
lsof -i :3000

# 2. Missing environment variables
cat /opt/titan-system/services/titan-execution/.env

# 3. Database permissions
ls -la /data/titan.db
```

### WebSocket Connection Failed

```bash
# Check Nginx WebSocket config
sudo nginx -t

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Test WebSocket locally
wscat -c ws://127.0.0.1:3000/ws
```

### High Latency

```bash
# Check network latency to Bybit
ping api.bybit.com

# Check server load
htop

# Check PM2 metrics
pm2 show titan-core
```

### Database Locked

```bash
# Check for stuck processes
fuser /data/titan.db

# Restart services
pm2 restart all
```

---

## Backup & Recovery

### Automated Backups

```bash
# Create backup script
cat > /opt/titan-system/scripts/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/data/backups
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
sqlite3 /data/titan.db ".backup $BACKUP_DIR/titan_$DATE.db"

# Compress
gzip $BACKUP_DIR/titan_$DATE.db

# Keep only last 7 days
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete

echo "Backup completed: titan_$DATE.db.gz"
EOF

chmod +x /opt/titan-system/scripts/backup.sh

# Add to crontab (daily at 00:00 UTC)
echo "0 0 * * * /opt/titan-system/scripts/backup.sh" | crontab -
```

### Manual Restore

```bash
# Stop services
pm2 stop all

# Restore from backup
gunzip -c /data/backups/titan_20251214_000000.db.gz > /data/titan.db

# Start services
pm2 start all
```

---

## Cost Estimation

| Resource | Specification | Monthly Cost (USD) |
|----------|---------------|-------------------|
| EC2 t3.medium | 2 vCPU, 4GB RAM | ~$30 |
| EBS gp3 50GB | Storage | ~$4 |
| Elastic IP | Static IP | ~$3.65 |
| Data Transfer | ~100GB/month | ~$9 |
| **Total** | | **~$47/month** |

---

## Next Steps

After successful deployment:

1. **Monitor for 24 hours** - Watch logs and metrics closely
2. **Start with testnet** - Verify everything works before mainnet
3. **Small position test** - First mainnet trade with minimum size
4. **Scale gradually** - Increase position size as confidence grows

---

*Last updated: December 2024*
