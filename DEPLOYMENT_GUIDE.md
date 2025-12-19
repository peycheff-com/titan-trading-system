# Titan Trading System - Production Deployment Guide

## Overview

This guide covers deploying the Titan Trading System to production with proper security, monitoring, and reliability features.

## Prerequisites

### Server Requirements
- **OS**: Ubuntu 20.04+ or CentOS 8+
- **CPU**: 4+ cores (8+ recommended)
- **RAM**: 8GB minimum (16GB+ recommended)
- **Storage**: 100GB+ SSD
- **Network**: Stable internet with low latency to exchanges

### Required Software
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- PM2 (process manager)
- Nginx (reverse proxy)
- Certbot (SSL certificates)

## Quick Production Setup

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Install Redis
sudo apt install redis-server -y
sudo systemctl start redis
sudo systemctl enable redis

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx

# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

### 2. Database Setup

```bash
# Create database user and database
sudo -u postgres psql << EOF
CREATE USER titan WITH PASSWORD 'your_secure_password';
CREATE DATABASE titan_brain OWNER titan;
GRANT ALL PRIVILEGES ON DATABASE titan_brain TO titan;
\q
EOF

# Configure PostgreSQL for production
sudo nano /etc/postgresql/14/main/postgresql.conf
# Uncomment and modify:
# listen_addresses = 'localhost'
# max_connections = 100
# shared_buffers = 256MB

sudo systemctl restart postgresql
```

### 3. Redis Configuration

```bash
# Configure Redis for production
sudo nano /etc/redis/redis.conf
# Modify these settings:
# maxmemory 1gb
# maxmemory-policy allkeys-lru
# save 900 1
# save 300 10
# save 60 10000

sudo systemctl restart redis
```

### 4. Application Deployment

```bash
# Create application user
sudo useradd -m -s /bin/bash titan
sudo usermod -aG sudo titan

# Switch to titan user
sudo su - titan

# Clone repository
git clone https://github.com/yourusername/titan-system.git
cd titan-system

# Install dependencies for all services
cd services/titan-brain && npm install --production && npm run build && cd ../..
cd services/titan-execution && npm install --production && cd ../..
cd services/titan-console && npm install --production && npm run build && cd ../..
cd services/titan-phase1-scavenger && npm install --production && npm run build && cd ../..

# Create production environment files
cp services/titan-execution/.env.example services/titan-execution/.env
cp services/titan-console/.env.local.example services/titan-console/.env.local

# Edit environment files with production values
nano services/titan-execution/.env
nano services/titan-console/.env.local
```

### 5. Environment Configuration

Create production environment files:

**services/titan-execution/.env**:
```bash
NODE_ENV=production
PORT=3002
HMAC_SECRET=your_very_secure_hmac_secret_here
DATABASE_PATH=/home/titan/titan-system/data/titan_execution.db
LOG_LEVEL=info

# Exchange API credentials (encrypted)
BYBIT_API_KEY=your_encrypted_bybit_key
BYBIT_API_SECRET=your_encrypted_bybit_secret
MEXC_API_KEY=your_encrypted_mexc_key
MEXC_API_SECRET=your_encrypted_mexc_secret

# WebSocket settings
WS_PORT=8081
WS_HEARTBEAT_INTERVAL=30000
WS_RECONNECT_DELAY=5000
```

**services/titan-console/.env.local**:
```bash
NODE_ENV=production
NEXT_PUBLIC_EXECUTION_URL=https://api.yourdomain.com
NEXT_PUBLIC_BRAIN_URL=https://brain.yourdomain.com
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=https://dashboard.yourdomain.com
```

### 6. PM2 Production Configuration

Update `ecosystem.config.js` for production:

```javascript
module.exports = {
  apps: [
    {
      name: 'titan-execution',
      script: './services/titan-execution/server-production.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: '/home/titan/logs/titan-execution-error.log',
      out_file: '/home/titan/logs/titan-execution-out.log',
      log_file: '/home/titan/logs/titan-execution.log'
    },
    {
      name: 'titan-brain',
      script: './services/titan-brain/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env_production: {
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'titan_brain',
        DB_USER: 'titan',
        DB_PASSWORD: 'your_secure_password'
      },
      error_file: '/home/titan/logs/titan-brain-error.log',
      out_file: '/home/titan/logs/titan-brain-out.log',
      log_file: '/home/titan/logs/titan-brain.log'
    },
    {
      name: 'titan-scavenger',
      script: './services/titan-phase1-scavenger/dist/index.js',
      args: '--headless',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env_production: {
        NODE_ENV: 'production',
        CONSOLE_URL: 'http://localhost:3002',
        HEALTH_PORT: 8082
      },
      error_file: '/home/titan/logs/titan-scavenger-error.log',
      out_file: '/home/titan/logs/titan-scavenger-out.log',
      log_file: '/home/titan/logs/titan-scavenger.log'
    },
    {
      name: 'titan-console',
      script: 'npm',
      args: 'start',
      cwd: './services/titan-console',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '/home/titan/logs/titan-console-error.log',
      out_file: '/home/titan/logs/titan-console-out.log',
      log_file: '/home/titan/logs/titan-console.log'
    }
  ]
};
```

### 7. Nginx Reverse Proxy

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/titan-system
```

```nginx
# Dashboard (titan-console)
server {
    listen 80;
    server_name dashboard.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# API (titan-execution)
server {
    listen 80;
    server_name api.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }
}

# Brain API (titan-brain)
server {
    listen 80;
    server_name brain.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Restrict access to brain API
        allow 127.0.0.1;
        allow your.trusted.ip.address;
        deny all;
    }
}

# Rate limiting configuration
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/titan-system /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8. SSL Certificates

```bash
# Get SSL certificates for all domains
sudo certbot --nginx -d dashboard.yourdomain.com
sudo certbot --nginx -d api.yourdomain.com
sudo certbot --nginx -d brain.yourdomain.com

# Set up auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 9. Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw allow from your.trusted.ip.address to any port 22
sudo ufw deny 22  # Deny SSH from all other IPs
```

### 10. Start Production Services

```bash
# Create log directory
mkdir -p /home/titan/logs

# Start services with PM2
cd /home/titan/titan-system
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup

# Check status
pm2 status
pm2 logs
```

## Security Hardening

### 1. API Key Encryption

```bash
# Install encryption utility
npm install -g @titan/crypto-utils

# Encrypt API keys
titan-encrypt --key "your_bybit_api_key" --output services/titan-execution/.env
titan-encrypt --key "your_mexc_api_key" --output services/titan-execution/.env
```

### 2. Database Security

```bash
# Secure PostgreSQL
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Change to: local all all md5

# Set strong password policy
sudo nano /etc/postgresql/14/main/postgresql.conf
# Add: password_encryption = scram-sha-256
```

### 3. Redis Security

```bash
# Secure Redis
sudo nano /etc/redis/redis.conf
# Add: requirepass your_redis_password
# Add: rename-command FLUSHDB ""
# Add: rename-command FLUSHALL ""
```

## Monitoring & Alerting

### 1. System Monitoring

```bash
# Install monitoring tools
sudo apt install htop iotop nethogs -y

# Install log monitoring
sudo npm install -g pm2-logrotate
pm2 install pm2-logrotate
```

### 2. Application Monitoring

Create monitoring script:

```bash
nano /home/titan/scripts/health-check.sh
```

```bash
#!/bin/bash
# Health check script for Titan services

SERVICES=("titan-execution" "titan-brain" "titan-scavenger" "titan-console")
ALERT_EMAIL="admin@yourdomain.com"

for service in "${SERVICES[@]}"; do
    if ! pm2 describe "$service" | grep -q "online"; then
        echo "ALERT: $service is down" | mail -s "Titan Service Alert" "$ALERT_EMAIL"
        pm2 restart "$service"
    fi
done

# Check disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo "ALERT: Disk usage is ${DISK_USAGE}%" | mail -s "Disk Space Alert" "$ALERT_EMAIL"
fi
```

Add to crontab:
```bash
crontab -e
# Add: */5 * * * * /home/titan/scripts/health-check.sh
```

### 3. Log Rotation

```bash
# Configure logrotate
sudo nano /etc/logrotate.d/titan-system
```

```
/home/titan/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 titan titan
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Backup Strategy

### 1. Database Backup

```bash
# Create backup script
nano /home/titan/scripts/backup-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/titan/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup PostgreSQL
pg_dump -h localhost -U titan titan_brain > "$BACKUP_DIR/titan_brain_$DATE.sql"

# Backup SQLite databases
cp /home/titan/titan-system/services/titan-execution/titan_execution.db "$BACKUP_DIR/titan_execution_$DATE.db"

# Compress and upload to cloud storage (optional)
tar -czf "$BACKUP_DIR/titan_backup_$DATE.tar.gz" "$BACKUP_DIR"/*_$DATE.*

# Clean old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /home/titan/scripts/backup-db.sh
```

### 2. Configuration Backup

```bash
# Backup configurations
tar -czf /home/titan/backups/config_$(date +%Y%m%d).tar.gz \
    /home/titan/titan-system/services/*/.*env* \
    /home/titan/titan-system/ecosystem.config.js \
    /etc/nginx/sites-available/titan-system
```

## Disaster Recovery

### 1. Automated Failover

```bash
# Create failover script
nano /home/titan/scripts/failover.sh
```

```bash
#!/bin/bash
# Emergency failover script

echo "EMERGENCY: Initiating failover procedure"

# Stop all trading activities
pm2 stop titan-scavenger
pm2 stop titan-brain

# Close all positions (implement your emergency close logic)
curl -X POST http://localhost:3002/api/emergency/close-all

# Send alert
echo "EMERGENCY FAILOVER ACTIVATED" | mail -s "TITAN EMERGENCY" admin@yourdomain.com

# Log the event
echo "$(date): Emergency failover activated" >> /home/titan/logs/emergency.log
```

### 2. Recovery Procedures

Document recovery steps in `/home/titan/docs/recovery.md`:

1. **Service Recovery**: Steps to restart failed services
2. **Database Recovery**: How to restore from backups
3. **Configuration Recovery**: Restore configurations
4. **Trading Recovery**: Resume trading operations safely

## Performance Optimization

### 1. System Tuning

```bash
# Optimize system for trading
echo 'net.core.rmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_rmem = 4096 87380 16777216' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_wmem = 4096 65536 16777216' >> /etc/sysctl.conf
sysctl -p
```

### 2. Database Optimization

```bash
# Optimize PostgreSQL for trading workload
sudo nano /etc/postgresql/14/main/postgresql.conf
```

```
# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Checkpoint settings
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Connection settings
max_connections = 100
```

## Maintenance

### 1. Regular Updates

```bash
# Create update script
nano /home/titan/scripts/update-system.sh
```

```bash
#!/bin/bash
# System update script

# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js packages
cd /home/titan/titan-system
npm update

# Restart services
pm2 restart all

# Check health
sleep 10
pm2 status
```

### 2. Log Analysis

```bash
# Install log analysis tools
sudo apt install goaccess -y

# Analyze Nginx logs
goaccess /var/log/nginx/access.log -o /home/titan/reports/nginx-report.html --log-format=COMBINED

# Analyze application logs
grep ERROR /home/titan/logs/*.log | tail -100
```

## Troubleshooting

### Common Issues

1. **Service Won't Start**
   ```bash
   pm2 logs titan-execution --lines 50
   pm2 describe titan-execution
   ```

2. **Database Connection Issues**
   ```bash
   sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
   ```

3. **High Memory Usage**
   ```bash
   pm2 monit
   htop
   ```

4. **Network Issues**
   ```bash
   netstat -tulpn | grep :3002
   curl -I http://localhost:3002/health
   ```

## Support

For production support:
- Monitor logs: `pm2 logs`
- Check status: `pm2 status`
- Restart service: `pm2 restart <service-name>`
- Emergency stop: `pm2 stop all`

Remember to test all procedures in a staging environment before applying to production!