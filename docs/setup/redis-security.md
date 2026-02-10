# Redis Security Guide for Titan Trading System

## Overview

This guide provides comprehensive instructions for securing Redis in the Titan trading system production environment. Redis stores critical trading data and system state, making its security paramount.

## Security Requirements

### Authentication

- **Password Protection**: Redis must be configured with a strong password
- **Password Rotation**: Passwords should be rotated every 90 days
- **Environment Variables**: Passwords must be stored in environment variables, never in code

### Network Security

- **Bind Address**: Redis should only bind to localhost (127.0.0.1)
- **Protected Mode**: Always enable protected mode
- **Firewall**: Block Redis port (6379) from external access

### Command Security

- **Dangerous Commands**: Disable or rename dangerous commands
- **Command Renaming**: Rename administrative commands to prevent unauthorized access

## Quick Setup

### Automatic Setup (Recommended)

```bash
# Run the automated setup script
sudo ./scripts/setup-redis-secure.sh

# This will:
# 1. Generate a secure password
# 2. Configure Redis with secure settings
# 3. Save password to .env file
# 4. Restart Redis service
# 5. Test the configuration
```

### Manual Setup

If you prefer manual configuration:

```bash
# 1. Generate a secure password
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# 2. Configure Redis
sudo ./scripts/setup-redis-secure.sh --password "$REDIS_PASSWORD"

# 3. Test the configuration
sudo ./scripts/setup-redis-secure.sh --test-only --password "$REDIS_PASSWORD"
```

## Configuration Details

### Redis Configuration File

The secure Redis configuration (`config/redis-secure.conf`) includes:

```conf
# Authentication
requirepass ${REDIS_PASSWORD}

# Network Security
bind 127.0.0.1 ::1
protected-mode yes
port 6379

# Disable Dangerous Commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command KEYS ""
rename-command CONFIG "CONFIG_b840fc02d524045429941cc15f59e41cb7be6c52"
rename-command SHUTDOWN "SHUTDOWN_b840fc02d524045429941cc15f59e41cb7be6c52"
rename-command DEBUG ""
rename-command EVAL ""

# Memory and Performance
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
```

### Environment Variables

Store Redis credentials in `.env` file:

```bash
# Redis Configuration
REDIS_PASSWORD=your_secure_password_here
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
```

**Important**: Never commit the `.env` file to version control!

## Application Integration

### Node.js Connection

```javascript
const redis = require('redis');

const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: process.env.REDIS_DB || 0,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      return new Error('Redis server connection refused');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error('Redis retry time exhausted');
    }
    if (options.attempt > 10) {
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

client.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

client.on('connect', () => {
  console.log('Connected to Redis');
});
```

### Connection String Format

```text
redis://localhost:6379
redis://:password@localhost:6379
redis://:password@localhost:6379/0
```

## Security Best Practices

### Password Management

1. **Strong Passwords**: Use passwords with at least 32 characters
2. **Random Generation**: Use cryptographically secure random generation
3. **Regular Rotation**: Rotate passwords every 90 days
4. **Secure Storage**: Store passwords in environment variables or secure vaults

### Network Security

1. **Localhost Only**: Bind Redis to localhost only
2. **Firewall Rules**: Block external access to Redis port
3. **VPN Access**: Use VPN for remote administration
4. **SSL/TLS**: Consider Redis with SSL/TLS for additional security

### Monitoring and Auditing

1. **Connection Monitoring**: Monitor Redis connections
2. **Command Auditing**: Log administrative commands
3. **Performance Monitoring**: Monitor Redis performance metrics
4. **Security Alerts**: Set up alerts for authentication failures

## Disaster Recovery Integration

### Backup Security

```bash
# Secure Redis backup
redis-cli -a "$REDIS_PASSWORD" --rdb /backups/redis/dump-$(date +%Y%m%d).rdb

# Encrypt backup
gpg --symmetric --cipher-algo AES256 /backups/redis/dump-$(date +%Y%m%d).rdb
```

### Recovery with Authentication

The disaster recovery system automatically handles Redis authentication:

```bash
# Recovery steps include authentication
{
  "id": "restore-redis-data",
  "command": "redis-cli -a ${REDIS_PASSWORD} --rdb /var/lib/redis/dump.rdb",
  "environment": {
    "REDIS_PASSWORD": "${REDIS_PASSWORD}"
  }
}
```

## Testing and Validation

### Connection Testing

```bash
# Test Redis connection
redis-cli -a "$REDIS_PASSWORD" ping

# Test authentication requirement
redis-cli ping  # Should return NOAUTH error

# Test basic operations
redis-cli -a "$REDIS_PASSWORD" set test_key "test_value"
redis-cli -a "$REDIS_PASSWORD" get test_key
redis-cli -a "$REDIS_PASSWORD" del test_key
```

### Security Validation

```bash
# Check Redis configuration
redis-cli -a "$REDIS_PASSWORD" CONFIG GET requirepass
redis-cli -a "$REDIS_PASSWORD" CONFIG GET bind

# Verify dangerous commands are disabled
redis-cli -a "$REDIS_PASSWORD" FLUSHDB  # Should return error
redis-cli -a "$REDIS_PASSWORD" KEYS "*"  # Should return error
```

### Performance Testing

```bash
# Redis benchmark with authentication
redis-benchmark -a "$REDIS_PASSWORD" -n 10000 -c 10

# Memory usage check
redis-cli -a "$REDIS_PASSWORD" INFO memory
```

## Troubleshooting

### Common Issues

1. **Authentication Failures**

   ```bash
   # Check password in .env file
   grep REDIS_PASSWORD .env
   
   # Test with correct password
   redis-cli -a "$(grep REDIS_PASSWORD .env | cut -d'=' -f2)" ping
   ```

2. **Connection Refused**

   ```bash
   # Check if Redis is running
   sudo systemctl status redis
   
   # Check Redis logs
   sudo tail -f /var/log/redis/redis-server.log
   ```

3. **Permission Denied**

   ```bash
   # Check Redis configuration file permissions
   ls -la /etc/redis/redis.conf
   
   # Fix permissions if needed
   sudo chown redis:redis /etc/redis/redis.conf
   sudo chmod 640 /etc/redis/redis.conf
   ```

### Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `NOAUTH Authentication required` | No password provided | Use `-a password` option |
| `ERR invalid password` | Wrong password | Check password in .env file |
| `Could not connect to Redis` | Redis not running | Start Redis service |
| `Connection refused` | Wrong host/port | Check connection parameters |

## Security Checklist

- [ ] Redis password configured and strong (32+ characters)
- [ ] Password stored in environment variables
- [ ] Redis bound to localhost only
- [ ] Protected mode enabled
- [ ] Dangerous commands disabled or renamed
- [ ] Firewall rules configured
- [ ] Regular password rotation scheduled
- [ ] Backup encryption configured
- [ ] Monitoring and alerting set up
- [ ] Security testing performed

## Password Rotation Procedure

### Monthly Password Rotation

1. **Generate New Password**

   ```bash
   NEW_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
   ```

2. **Update Configuration**

   ```bash
   sudo ./scripts/setup-redis-secure.sh --password "$NEW_PASSWORD"
   ```

3. **Update Applications**

   ```bash
   # Update .env file
   sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$NEW_PASSWORD/" .env
   
   # Restart applications
   pm2 restart all
   ```

4. **Verify Connectivity**

   ```bash
   redis-cli -a "$NEW_PASSWORD" ping
   ```

## Compliance and Auditing

### Security Audit Log

Keep a record of security changes:

```bash
# Log password rotation
echo "$(date): Redis password rotated by $(whoami)" >> /var/log/redis-security.log

# Log configuration changes
echo "$(date): Redis configuration updated by $(whoami)" >> /var/log/redis-security.log
```

### Compliance Requirements

- **PCI DSS**: If handling payment data, ensure Redis meets PCI requirements
- **SOX**: For financial systems, maintain audit trails
- **GDPR**: If storing personal data, ensure proper encryption and access controls

## Emergency Procedures

### Password Reset

If Redis password is lost or compromised:

1. **Stop Redis**

   ```bash
   sudo systemctl stop redis
   ```

2. **Temporarily Disable Auth**

   ```bash
   sudo sed -i 's/requirepass/#requirepass/' /etc/redis/redis.conf
   ```

3. **Start Redis**

   ```bash
   sudo systemctl start redis
   ```

4. **Set New Password**

   ```bash
   redis-cli CONFIG SET requirepass "new_secure_password"
   ```

5. **Update Configuration**

   ```bash
   sudo ./scripts/setup-redis-secure.sh --password "new_secure_password"
   ```

### Security Incident Response

1. **Immediate Actions**
   - Change Redis password immediately
   - Check Redis logs for unauthorized access
   - Review application logs for anomalies
   - Notify security team

2. **Investigation**
   - Analyze Redis command history
   - Check network connections
   - Review system access logs
   - Document findings

3. **Recovery**
   - Restore from clean backup if needed
   - Update security configurations
   - Implement additional monitoring
   - Update incident response procedures

## Additional Resources

- [Redis Security Documentation](https://redis.io/topics/security)
- [Redis Configuration Guide](https://redis.io/topics/config)
- [Redis Best Practices](https://redis.io/topics/memory-optimization)
- [Titan System Architecture](../architecture.md)
