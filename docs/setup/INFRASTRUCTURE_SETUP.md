# Titan Infrastructure Setup Guide

This guide provides comprehensive instructions for provisioning and configuring the infrastructure required for the Titan Trading System production deployment.

## Overview

The Titan Trading System requires a robust infrastructure foundation with specific minimum requirements to ensure reliable, high-frequency trading operations. This setup includes:

- VPS instance with minimum specifications (8GB RAM, 4 CPU cores)
- Base dependencies (Node.js v18+, Redis, PM2, Nginx)
- Security hardening (firewall, fail2ban, SSL certificates)
- System optimization for high-frequency trading
- Automated security updates

## Prerequisites

- Ubuntu 22.04 LTS server (recommended)
- Root or sudo access
- Domain name (optional, for SSL certificates)
- Email address (for SSL certificate registration)

## Quick Start

### 1. Basic Infrastructure Provisioning

```bash
# Clone the repository and navigate to scripts
cd titan-production-deployment
chmod +x scripts/provision-infrastructure.sh

# Run basic provisioning
./scripts/provision-infrastructure.sh

# Or with SSL setup (recommended)
./scripts/provision-infrastructure.sh -d yourdomain.com -e admin@yourdomain.com
```

### 2. Validate Installation

Manually verify service status:

```bash
docker compose -f docker-compose.prod.yml ps
```

### 3. Configure Environment

```bash
# Copy and customize environment configuration
cp config/deployment/infrastructure.env.example config/deployment/infrastructure.env
nano config/deployment/infrastructure.env
```

## Detailed Setup Instructions

### System Requirements Validation

The infrastructure must meet these minimum requirements:

| Component | Minimum Requirement | Recommended |
|-----------|-------------------|-------------|
| RAM | 8GB | 16GB+ |
| CPU Cores | 4 | 8+ |
| Disk Space | 50GB free | 100GB+ SSD |
| Network | 100 Mbps | 1 Gbps |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Dependencies Installation

#### Node.js v18+
- Installed via NodeSource repository
- Includes npm package manager
- Global PM2 installation for process management

#### Redis
- Latest stable version
- Configured for production use
- Memory limit: 2GB with LRU eviction policy
- Bound to localhost (127.0.0.1) for security

#### PM2 Process Manager
- Global installation via npm
- Configured for automatic startup
- Process monitoring and auto-restart capabilities

#### Nginx Web Server
- Latest stable version
- Configured as reverse proxy
- SSL/TLS termination support
- Gzip compression enabled

### Security Configuration

#### UFW Firewall
```bash
# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allowed ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS

# Restricted ports
ufw allow from 127.0.0.1 to any port 6379  # Redis localhost only
```

#### fail2ban Protection
- SSH brute force protection (3 attempts, 1-hour ban)
- Nginx authentication failure protection
- Custom jail configurations for trading system

#### SSL Certificates
- Let's Encrypt certificates via Certbot
- Automatic renewal via systemd timer
- Strong cipher suites and protocols

#### Automatic Security Updates
- Unattended upgrades for security patches
- Configurable reboot policies
- Email notifications for critical updates

### System Optimization

#### File Descriptor Limits
```bash
# /etc/security/limits.conf
titan soft nofile 65536
titan hard nofile 65536
titan soft nproc 32768
titan hard nproc 32768
```

#### Kernel Parameters
```bash
# /etc/sysctl.conf
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.core.netdev_max_backlog = 5000
vm.swappiness = 10
```

## Configuration Files

### Infrastructure Configuration
- `config/infrastructure.config.json` - Main infrastructure configuration
- `config/deployment/infrastructure.env` - Environment-specific settings

### Security Configuration
- `/etc/fail2ban/jail.local` - fail2ban jail configuration
- `/etc/ufw/applications.d/titan` - UFW application profile
- `/etc/nginx/sites-available/titan` - Nginx virtual host configuration

## Validation and Testing

### Infrastructure Validation

Ensure all containers are running and healthy:

```bash
docker compose -f docker-compose.prod.yml ps
```

The output should show `healthy` status for core services (nats, redis, postgres).

### Manual Validation Commands

```bash
# Check system resources
free -h                    # Memory
nproc                     # CPU cores
df -h                     # Disk space

# Check services
systemctl status redis-server
systemctl status nginx
systemctl status fail2ban

# Check network connectivity
redis-cli ping            # Redis connectivity
curl -I http://localhost  # Nginx response

# Check security
sudo ufw status verbose   # Firewall rules
sudo fail2ban-client status  # fail2ban status
```

## Troubleshooting

### Common Issues

#### Insufficient Resources
```bash
# Check current usage
htop                      # Real-time system monitor
iotop                     # Disk I/O monitor
nethogs                   # Network usage by process
```

#### Service Startup Failures
```bash
# Check service logs
journalctl -u redis-server -f
journalctl -u nginx -f
journalctl -u fail2ban -f

# Check configuration syntax
nginx -t                  # Nginx config test
redis-server --test-memory 1024  # Redis memory test
```

#### Network Connectivity Issues
```bash
# Check port bindings
netstat -tlnp | grep :80   # HTTP
netstat -tlnp | grep :443  # HTTPS
netstat -tlnp | grep :6379 # Redis

# Test connectivity
telnet localhost 6379     # Redis
curl -v http://localhost  # HTTP
```

#### SSL Certificate Issues
```bash
# Check certificate status
certbot certificates

# Test SSL configuration
openssl s_client -connect yourdomain.com:443

# Renew certificates manually
certbot renew --dry-run
```

### Log Locations

| Service | Log Location |
|---------|-------------|
| System | `/var/log/syslog` |
| Nginx | `/var/log/nginx/` |
| Redis | `/var/log/redis/` |
| fail2ban | `/var/log/fail2ban.log` |
| UFW | `/var/log/ufw.log` |
| Certbot | `/var/log/letsencrypt/` |

## Security Best Practices

### Regular Maintenance
- Update system packages monthly
- Review firewall rules quarterly
- Rotate SSL certificates (automatic)
- Monitor fail2ban logs weekly
- Audit user access monthly

### Monitoring Recommendations
- Set up log monitoring and alerting
- Monitor system resource usage
- Track failed authentication attempts
- Monitor SSL certificate expiration
- Set up uptime monitoring

### Backup Considerations
- Regular configuration backups
- SSL certificate backups
- Database backups (Redis snapshots)
- Log file archival
- Disaster recovery testing

## Next Steps

After successful infrastructure provisioning:

1. **Deploy Titan Services**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
   ```

2. **Verify Logs**
   ```bash
   docker compose -f docker-compose.prod.yml logs -f
   ```

## Support and Documentation

- [Deployment Guide](../operations/deployment/getting-started.md)
- [Security Hardening](../operations/security/hardening-guide.md)
- [Monitoring Setup](../operations/monitoring/setup-guide.md)
- [Troubleshooting Guide](../operations/troubleshooting/incident-response.md)

For additional support, refer to the operational runbooks in `docs/operations/runbooks/`.