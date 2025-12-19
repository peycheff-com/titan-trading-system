# Titan Execution Service - Operations Guide

This guide provides operational procedures for monitoring, maintaining, and troubleshooting the Titan Execution Service in production.

**Requirements**: All production readiness requirements

---

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Monitoring Dashboards](#monitoring-dashboards)
3. [Alert Response Procedures](#alert-response-procedures)
4. [Backup and Restore](#backup-and-restore)
5. [Performance Tuning](#performance-tuning)
6. [Common Troubleshooting](#common-troubleshooting)
7. [Emergency Procedures](#emergency-procedures)

---

## Daily Operations

### Morning Checklist (Start of Trading Day)

```bash
# 1. Check service status
pm2 status

# 2. Check system health
curl http://localhost:8080/api/health | jq .

# 3. Check account equity
curl http://localhost:8080/api/state/equity | jq .

# 4. Check open positions
curl http://localhost:8080/api/state/positions | jq .

# 5. Review overnight logs
pm2 logs titan-execution --lines 500 | grep -E "(ERROR|WARN|CRITICAL)"

# 6. Check Grafana dashboards
# Open: http://localhost:3000/d/titan-trading-system

# 7. Verify backup creation
ls -lht backups/ | head -5

# 8. Check disk space
df -h

# 9. Check memory usage
free -h
pm2 info titan-execution | grep memory
```

### Evening Checklist (End of Trading Day)

```bash
# 1. Review daily performance
curl http://localhost:8080/api/trades?date=$(date +%Y-%m-%d) | jq .

# 2. Check for any errors
pm2 logs titan-execution --lines 1000 | grep -i error > daily-errors-$(date +%Y-%m-%d).log

# 3. Verify all positions closed (if day trading)
curl http://localhost:8080/api/state/positions | jq 'length'

# 4. Check daily P&L
curl http://localhost:8080/api/state/equity | jq .

# 5. Review Grafana metrics
# Check: Signal processing rate, order fill rate, latency

# 6. Verify backup completed
ls -lh backups/ | head -1

# 7. Check for any alerts
# Review Grafana alerts panel
```

---

## Monitoring Dashboards

### Grafana Dashboard Overview

**URL**: `http://localhost:3000/d/titan-trading-system`

**Key Panels**:

1. **System Health Status**
   - Shows health of all components (WebSocket, Database, IPC, Broker)
   - **Green**: All systems operational
   - **Red**: Component failure - investigate immediately

2. **Account Equity**
   - Real-time account balance
   - **Watch for**: Sudden drops (potential losses)
   - **Alert threshold**: < initial capital

3. **Current Drawdown**
   - Percentage drawdown from peak equity
   - **Green**: 0-3%
   - **Yellow**: 3-5%
   - **Orange**: 5-7%
   - **Red**: > 7% (circuit breaker should trigger)

4. **Signal Processing Rate**
   - Signals processed per minute
   - **Normal**: 0-10 signals/min
   - **High**: > 20 signals/min (may indicate issue)

5. **Order Execution Latency (P95)**
   - 95th percentile order latency
   - **Target**: < 100ms
   - **Warning**: > 500ms
   - **Critical**: > 1000ms

6. **Position P&L by Symbol**
   - Real-time P&L for each open position
   - **Watch for**: Large unrealized losses

7. **Order Fill Rate**
   - Percentage of orders successfully filled
   - **Target**: > 90%
   - **Warning**: < 80%
   - **Critical**: < 70%

8. **Active Positions & Total Leverage**
   - Number of open positions
   - Total leverage across all positions
   - **Max positions**: 5 (configurable)
   - **Max leverage**: 50x total

### Prometheus Metrics

**URL**: `http://localhost:8080/metrics`

**Key Metrics**:

```promql
# System health
titan_health_status{component="websocket"}
titan_health_status{component="database"}
titan_health_status{component="broker"}

# Trading metrics
titan_signals_total
titan_order_latency_seconds
titan_position_pnl_usd
titan_equity_usd
titan_order_fill_rate
titan_drawdown_percent

# System metrics
titan_process_cpu_seconds_total
titan_process_resident_memory_bytes
```

---

## Alert Response Procedures

### Alert: WebSocket Disconnected > 60s

**Severity**: CRITICAL

**Impact**: No real-time market data, cannot detect new opportunities

**Response**:

```bash
# 1. Check WebSocket status
curl http://localhost:8080/api/health | jq '.websocket'

# 2. Check network connectivity
ping stream.binance.com
ping stream.bybit.com

# 3. Check logs for disconnection reason
pm2 logs titan-execution | grep -i websocket | tail -50

# 4. If automatic reconnection failed, restart service
pm2 restart titan-execution

# 5. Verify reconnection
sleep 10
curl http://localhost:8080/api/health | jq '.websocket'

# 6. Monitor for stability
watch -n 5 'curl -s http://localhost:8080/api/health | jq .websocket'
```

### Alert: Order Fill Rate < 80%

**Severity**: WARNING

**Impact**: Reduced trading efficiency, missing opportunities

**Response**:

```bash
# 1. Check recent order rejections
pm2 logs titan-execution | grep "Order rejected" | tail -20

# 2. Check account balance
curl http://localhost:8080/api/state/equity | jq .

# 3. Check broker API status
curl http://localhost:8080/api/health | jq '.broker'

# 4. Common causes:
# - Insufficient margin → Reduce position size or add funds
# - Rate limiting → Check rate limit status
# - Invalid prices → Check entry zone calculations
# - Network issues → Check connectivity

# 5. If persistent, reduce trading frequency
# Edit config: risk.maxRiskPct or phase1RiskPct
```

### Alert: Order Latency > 1s

**Severity**: WARNING

**Impact**: Slippage, reduced profitability

**Response**:

```bash
# 1. Check current latency
curl http://localhost:8080/metrics | grep titan_order_latency_seconds

# 2. Check system resources
top -bn1 | head -20
free -h

# 3. Check network latency
ping -c 10 api.bybit.com

# 4. Check for rate limiting
pm2 logs titan-execution | grep "rate limit" | tail -20

# 5. If system resources low, restart service
pm2 restart titan-execution

# 6. If network latency high, consider VPS closer to exchange
```

### Alert: Drawdown > 5%

**Severity**: WARNING (> 7% = CRITICAL)

**Impact**: Approaching circuit breaker threshold

**Response**:

```bash
# 1. Check current drawdown
curl http://localhost:8080/api/state/equity | jq .

# 2. Review recent trades
curl http://localhost:8080/api/trades?limit=20 | jq .

# 3. Check open positions
curl http://localhost:8080/api/state/positions | jq .

# 4. Analyze losing trades
# Look for patterns: specific symbols, trap types, market conditions

# 5. Consider actions:
# - Reduce position size (edit config: risk.maxRiskPct)
# - Tighten stop losses
# - Pause trading temporarily (stop service)
# - Close losing positions manually

# 6. If drawdown > 7%, circuit breaker should trigger automatically
# Verify: pm2 logs titan-execution | grep "Circuit breaker"
```

### Alert: System Health Unhealthy > 60s

**Severity**: CRITICAL

**Impact**: System not functioning properly

**Response**:

```bash
# 1. Check which component is unhealthy
curl http://localhost:8080/api/health | jq .

# 2. Check logs for errors
pm2 logs titan-execution --err --lines 100

# 3. Component-specific actions:
# - WebSocket: See "WebSocket Disconnected" procedure
# - Database: Check disk space, run integrity check
# - Broker: Check API keys, network connectivity
# - IPC: Check socket file exists, permissions

# 4. If multiple components unhealthy, restart service
pm2 restart titan-execution

# 5. If restart doesn't help, check system resources
df -h
free -h
top -bn1

# 6. If critical, flatten all positions and stop service
curl -X POST http://localhost:8080/api/emergency/flatten-all
pm2 stop titan-execution
```

---

## Backup and Restore

### Automated Backups

**Schedule**: Hourly (via cron)

**Location**: `./backups/` and S3 (if configured)

**Retention**: 30 days

**Verify Backup**:

```bash
# Check latest backup
ls -lht backups/ | head -1

# Check backup age
LATEST_BACKUP=$(ls -t backups/ | head -1)
BACKUP_AGE=$(($(date +%s) - $(stat -c %Y "backups/$LATEST_BACKUP")))
echo "Latest backup is $((BACKUP_AGE / 3600)) hours old"

# If backup > 2 hours old, investigate
if [ $BACKUP_AGE -gt 7200 ]; then
  echo "⚠️ Backup is stale, check cron job"
  crontab -l | grep backup
fi
```

### Manual Backup

```bash
# Create backup now
node scripts/backup-database.js

# Verify backup created
ls -lht backups/ | head -1

# Test backup integrity
node scripts/backup-database.js --verify
```

### Restore from Backup

```bash
# List available backups
node scripts/restore-database.js --list

# Restore latest local backup
node scripts/restore-database.js --latest

# Restore from S3
node scripts/restore-database.js --from-s3

# Restore specific backup
node scripts/restore-database.js backups/backup-2025-12-07T10-00-00.db.gz

# Verify restoration
sqlite3 titan_execution.db "PRAGMA integrity_check;"
curl http://localhost:8080/api/state/positions | jq .
```

---

## Performance Tuning

### Optimize Database

```bash
# Vacuum database (reclaim space)
sqlite3 titan_execution.db "VACUUM;"

# Analyze database (update statistics)
sqlite3 titan_execution.db "ANALYZE;"

# Check database size
ls -lh titan_execution.db

# If database > 1GB, consider archiving old data
```

### Optimize Memory Usage

```bash
# Check current memory usage
pm2 info titan-execution | grep memory

# If memory usage high (> 400MB), restart service
pm2 restart titan-execution

# Set memory limit (auto-restart if exceeded)
pm2 restart titan-execution --max-memory-restart 500M
pm2 save
```

### Optimize Network

```bash
# Check network latency to exchanges
ping -c 100 api.bybit.com | tail -1
ping -c 100 stream.binance.com | tail -1

# If latency > 50ms, consider:
# - Using VPS closer to exchange (Singapore for Bybit)
# - Upgrading network connection
# - Checking for network congestion
```

---

## Common Troubleshooting

### Service Won't Start

```bash
# Check logs
pm2 logs titan-execution --err --lines 50

# Common issues:
# 1. Port already in use
sudo lsof -i :8080
# Kill process if needed: sudo kill -9 <PID>

# 2. Database locked
rm -f titan_execution.db-shm titan_execution.db-wal

# 3. Invalid configuration
node -e "import('./config/ConfigValidator.js').then(m => m.validateOnStartup('config/production.json'))"

# 4. Missing credentials
node security/CredentialManager.js exists

# 5. Permissions issue
chmod 600 titan_execution.db
chmod 600 ~/.titan/credentials.enc
```

### High CPU Usage

```bash
# Check CPU usage
top -bn1 | grep titan-execution

# If CPU > 80%, investigate:
# 1. Check for infinite loops in logs
pm2 logs titan-execution | grep -i loop

# 2. Check signal processing rate
curl http://localhost:8080/metrics | grep titan_signals_total

# 3. Restart service
pm2 restart titan-execution

# 4. If persistent, check for memory leak
pm2 monit
```

### Disk Space Full

```bash
# Check disk space
df -h

# If disk full:
# 1. Clean old backups
find backups/ -name "*.db.gz" -mtime +30 -delete

# 2. Clean old logs
pm2 flush

# 3. Vacuum database
sqlite3 titan_execution.db "VACUUM;"

# 4. Check for large log files
du -sh logs/*
```

---

## Emergency Procedures

### Emergency Flatten All Positions

**When to use**: System malfunction, unexpected behavior, market crash

```bash
# 1. Flatten all positions immediately
curl -X POST http://localhost:8080/api/emergency/flatten-all

# 2. Verify all positions closed
curl http://localhost:8080/api/state/positions | jq 'length'

# 3. Stop service to prevent new trades
pm2 stop titan-execution

# 4. Check final P&L
curl http://localhost:8080/api/state/equity | jq .

# 5. Investigate issue
pm2 logs titan-execution --lines 500

# 6. Create incident report
echo "Incident: $(date)" > incident-$(date +%Y%m%d-%H%M%S).txt
pm2 logs titan-execution --lines 1000 >> incident-$(date +%Y%m%d-%H%M%S).txt
```

### Database Corruption Recovery

```bash
# 1. Stop service
pm2 stop titan-execution

# 2. Backup corrupted database
cp titan_execution.db titan_execution.db.corrupted-$(date +%s)

# 3. Restore from latest backup
node scripts/restore-database.js --latest

# 4. Verify restoration
sqlite3 titan_execution.db "PRAGMA integrity_check;"

# 5. Restart service
pm2 restart titan-execution

# 6. Verify health
curl http://localhost:8080/api/health | jq .
```

### Complete System Restart

```bash
# 1. Flatten all positions
curl -X POST http://localhost:8080/api/emergency/flatten-all

# 2. Stop service
pm2 stop titan-execution

# 3. Backup database
node scripts/backup-database.js

# 4. Restart service
pm2 restart titan-execution

# 5. Wait for startup
sleep 30

# 6. Verify health
curl http://localhost:8080/api/health | jq .

# 7. Verify Shadow State restored
curl http://localhost:8080/api/state/positions | jq .

# 8. Monitor for 15 minutes
watch -n 10 'curl -s http://localhost:8080/api/health | jq .'
```

---

## Maintenance Windows

### Weekly Maintenance (Sunday 00:00 UTC)

```bash
# 1. Flatten all positions
curl -X POST http://localhost:8080/api/emergency/flatten-all

# 2. Stop service
pm2 stop titan-execution

# 3. Backup database
node scripts/backup-database.js

# 4. Vacuum database
sqlite3 titan_execution.db "VACUUM; ANALYZE;"

# 5. Update dependencies (if needed)
npm outdated
# npm update (only if necessary)

# 6. Restart service
pm2 restart titan-execution

# 7. Verify health
curl http://localhost:8080/api/health | jq .

# 8. Monitor for 30 minutes
```

### Monthly Maintenance

```bash
# 1. Security audit
npm audit

# 2. Review and archive old logs
tar -czf logs-archive-$(date +%Y%m).tar.gz logs/*.log
rm logs/*.log.old

# 3. Review and clean old backups
find backups/ -name "*.db.gz" -mtime +60 -delete

# 4. Performance review
# - Check Grafana metrics for trends
# - Review trading performance
# - Optimize configuration if needed

# 5. Disaster recovery drill
# - Test backup restoration
# - Verify emergency procedures
# - Update runbooks if needed
```

---

## Contact Information

**On-Call Engineer**: [Your contact]
**Backup Contact**: [Backup contact]
**Escalation**: [Escalation contact]

**Emergency Contacts**:
- Slack: #titan-alerts
- Email: titan-alerts@your-domain.com
- Phone: [Emergency phone]

**Support Resources**:
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090
- Logs: `pm2 logs titan-execution`
- Runbooks: `./docs/runbooks/`

---

## Appendix: Useful Commands

### Quick Status Check
```bash
alias titan-status='curl -s http://localhost:8080/api/health | jq .'
alias titan-positions='curl -s http://localhost:8080/api/state/positions | jq .'
alias titan-equity='curl -s http://localhost:8080/api/state/equity | jq .'
alias titan-logs='pm2 logs titan-execution --lines 50'
```

### Quick Actions
```bash
alias titan-restart='pm2 restart titan-execution'
alias titan-stop='pm2 stop titan-execution'
alias titan-start='pm2 start titan-execution'
alias titan-flatten='curl -X POST http://localhost:8080/api/emergency/flatten-all'
alias titan-backup='node scripts/backup-database.js'
```

Add these to your `~/.bashrc` or `~/.zshrc` for quick access.
