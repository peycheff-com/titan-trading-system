# Titan Trading System - Daily Operations Runbook

This runbook provides comprehensive daily operational procedures for the Titan
Trading System, including morning startup checks, ongoing monitoring tasks, and
end-of-day procedures.

## Daily Operations Schedule

### Pre-Market (30 minutes before market open)

**Time**: 30 minutes before primary market open **Duration**: 15-20 minutes
**Responsible**: Operations Team

### Market Hours (During active trading)

**Frequency**: Continuous monitoring with hourly checks **Responsible**:
Operations Team + On-call Engineer

### Post-Market (After market close)

**Time**: 30 minutes after market close **Duration**: 20-30 minutes
**Responsible**: Operations Team

### End-of-Day (Daily wrap-up)

**Time**: End of business day **Duration**: 15-20 minutes **Responsible**:
Operations Manager

## Pre-Market Checklist

### System Health Verification

```bash
# 1. Run comprehensive health check
./scripts/health-check.sh

# Expected output should show all services as "healthy"
# If any service shows as "degraded" or "unhealthy", investigate immediately
```

**Health Check Verification**:

```
□ Brain Service: Status = "ok", Uptime > 0
□ Execution Service: Status = "ok", Uptime > 0  
□ Console Service: Status = "ok", Uptime > 0
□ Scavenger Service: Status = "ok", Uptime > 0
□ Database: PostgreSQL connected, Redis connected
□ Exchange APIs: Bybit connected, MEXC connected (if enabled)
□ WebSocket Channels: Console active, Scavenger active, Status active
```

### Service Status Review

```bash
# 2. Check PM2 service status
pm2 status

# All services should show "online" status
# Check for any recent restarts (restart count should be stable)
```

**PM2 Status Verification**:

```
□ titan-brain: Status = online, CPU < 50%, Memory < 200MB
□ titan-execution: Status = online, CPU < 50%, Memory < 300MB

□ titan-scavenger: Status = online, CPU < 40%, Memory < 200MB
□ No services showing "errored" or "stopped" status
□ Restart counts stable (no unexpected restarts overnight)
```

### System Resource Check

```bash
# 3. Check system resources
htop  # Check CPU and memory usage
df -h # Check disk space
free -m # Check available memory

# 4. Check system load
uptime
# Load average should be < number of CPU cores
```

**Resource Verification**:

```
□ CPU Usage: Overall < 70%
□ Memory Usage: < 80% of total RAM
□ Disk Space: > 20% free on all partitions
□ Load Average: < number of CPU cores
□ No swap usage (or minimal < 10%)
```

### Database Health Check

```bash
# 5. Check database connectivity and performance
psql -h localhost -U titan_user -d titan_brain -c "
  SELECT 
    'Database Size' as metric,
    pg_size_pretty(pg_database_size('titan_brain')) as value
  UNION ALL
  SELECT 
    'Active Connections',
    count(*)::text
  FROM pg_stat_activity 
  WHERE state = 'active';"

# 6. Check Redis status
redis-cli ping
redis-cli info memory | grep used_memory_human
```

**Database Verification**:

```
□ PostgreSQL: Connection successful
□ Database size: Reasonable growth (< 10% daily increase)
□ Active connections: < 20
□ Redis: PONG response received
□ Redis memory usage: < 1GB (or configured limit)
```

### Trading Configuration Review

```bash
# 7. Check Master Arm status
curl -s http://localhost:3002/api/console/master-arm | jq '.'

# 8. Check circuit breaker status  
curl -s http://localhost:3100/breaker | jq '.'

# 9. Review current configuration
curl -s http://localhost:3002/api/console/config | jq '.risk_tuner, .asset_whitelist'
```

**Configuration Verification**:

```
□ Master Arm: Enabled (unless maintenance mode)
□ Circuit Breaker: Not active
□ Risk Parameters: Within expected ranges
  - Phase 1 Risk %: 1-3%
  - Phase 2 Risk %: 1-2.5%
□ Asset Whitelist: Enabled with approved symbols
□ API Keys: Validated and not expired
```

### Position and Balance Review

```bash
# 10. Check current positions
curl -s http://localhost:3002/positions | jq '.positions | length'

# 11. Get current equity from Brain dashboard
curl -s http://localhost:3100/dashboard | jq '.nav, .phaseEquity'

# 12. Verify no orphaned positions
./scripts/verify-positions.sh
```

**Position Verification**:

```
□ Position count matches expectations
□ No orphaned positions (Shadow State vs Exchange)
□ Equity levels within expected ranges
□ Phase allocation matches configuration
□ No positions exceeding size limits
```

### Market Condition Assessment

```bash
# 13. Check recent market volatility
curl -s "https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=1&limit=24" | \
  jq '.result.list[] | [.[0], .[4]] | @csv'

# 14. Check funding rates
curl -s "https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=5" | \
  jq '.result.list[] | [.fundingRateTimestamp, .fundingRate] | @csv'
```

**Market Assessment**:

```
□ BTC volatility: Review 24h price range
□ ETH volatility: Review 24h price range  
□ Funding rates: Check for extreme rates (>±0.1%)
□ Market structure: Assess trending vs ranging conditions
□ News events: Check for major market-moving events
```

### Log Review

```bash
# 15. Check for overnight errors or warnings
pm2 logs --lines 100 | grep -i "error\|warning\|critical" | tail -20

# 16. Check system logs for issues
journalctl --since "yesterday" --until "now" -p err | tail -10
```

**Log Verification**:

```
□ No critical errors in application logs
□ No system-level errors in journalctl
□ Warning count within normal ranges
□ No repeated error patterns
□ Database logs show no corruption warnings
```

### Pre-Market Completion

```bash
# 17. Document pre-market check completion
echo "$(date): Pre-market check completed successfully" >> /var/log/titan/daily-ops.log

# 18. Send status update (if configured)
./scripts/send-daily-status.sh --type premarket
```

**Pre-Market Sign-off**:

```
□ All health checks passed
□ System ready for trading
□ No critical issues identified
□ Configuration verified
□ Positions reconciled
□ Logs reviewed
□ Status documented

Operator: _________________ Time: _________ Date: _________
```

## Market Hours Monitoring

### Hourly Monitoring Tasks

**Every Hour During Market Hours**:

```bash
# 1. Quick health check
curl -s http://localhost:3002/health | jq '.status'
curl -s http://localhost:3100/health | jq '.status'

# 2. Check current equity and P&L
curl -s http://localhost:3100/dashboard | jq '.nav, .riskMetrics.globalLeverage'

# 3. Monitor active positions
curl -s http://localhost:3002/positions | jq '.count'

# 4. Check for circuit breaker status
curl -s http://localhost:3100/breaker | jq '.active'
```

**Hourly Checklist**:

```
□ All services responding (< 2 second response time)
□ Equity tracking properly (no sudden unexplained changes)
□ Position count within expected ranges
□ Circuit breaker not triggered
□ No alerts in monitoring system
□ WebSocket connections stable
```

### Real-Time Monitoring Alerts

**Critical Alerts (Immediate Action Required)**:

- Circuit breaker activation
- Service health check failures
- Position tracking discrepancies
- Exchange API disconnections
- Database connection failures

**Warning Alerts (Monitor Closely)**:

- High latency (>200ms signal processing)
- Memory usage >80%
- Unusual trading volume
- Repeated WebSocket reconnections

### Performance Monitoring

```bash
# Monitor key performance metrics
./scripts/performance-monitor.sh --duration 300

# Check WebSocket message rates
curl -s http://localhost:3002/api/console/system-status | jq '.websocket'

# Monitor database performance
psql -h localhost -U titan_user -d titan_brain -c "
  SELECT 
    schemaname,
    tablename,
    n_tup_ins + n_tup_upd + n_tup_del as total_writes,
    seq_scan,
    seq_tup_read
  FROM pg_stat_user_tables 
  ORDER BY total_writes DESC 
  LIMIT 5;"
```

### Trading Activity Review

**Mid-Day Review (12:00 PM)**:

```bash
# Review morning trading performance
curl -s http://localhost:3100/dashboard | jq '.recentDecisions[-10:]'

# Check signal approval rates
curl -s http://localhost:3100/phases/approval-rates

# Review recent trades
curl -s http://localhost:3002/api/console/trades?limit=20
```

**Mid-Day Checklist**:

```
□ Signal approval rates within normal ranges (>70%)
□ Trade execution success rate >95%
□ P&L tracking correctly
□ No unusual market behavior affecting system
□ Risk parameters still appropriate for current conditions
```

## Post-Market Procedures

### Trading Session Wrap-Up

```bash
# 1. Final position check
curl -s http://localhost:3002/positions | jq '.'

# 2. Daily P&L calculation
curl -s http://localhost:3100/dashboard | jq '.nav, .treasury'

# 3. Check for any pending orders
curl -s http://localhost:3002/api/console/signals?limit=50 | \
  jq '.signals[] | select(.status == "PENDING")'

# 4. Review circuit breaker activity
curl -s http://localhost:3100/breaker | jq '.'
```

**Post-Market Verification**:

```
□ All positions properly tracked
□ No pending orders requiring attention
□ Daily P&L calculated and reasonable
□ Circuit breaker status reviewed
□ No orphaned or stuck orders
```

### Performance Analysis

```bash
# 5. Generate daily performance report
./scripts/generate-daily-report.sh --date $(date +%Y-%m-%d)

# 6. Check AI Quant recommendations (if any)
curl -s http://localhost:3004/api/proposals/pending 2>/dev/null || echo "AI Quant not running"

# 7. Review system performance metrics
./scripts/performance-summary.sh --timeframe 1d
```

**Performance Review**:

```
□ Daily return within expected ranges
□ Sharpe ratio tracking appropriately
□ Win rate within historical norms
□ Maximum drawdown within limits
□ System latency within targets
□ No performance degradation trends
```

### System Maintenance Check

```bash
# 8. Check for system updates
sudo apt list --upgradable 2>/dev/null | grep -v "WARNING"

# 9. Review disk space trends
df -h | awk 'NR>1 {print $5 " " $6}' | grep -v "0%"

# 10. Check log rotation status
ls -la /var/log/titan/ | tail -5

# 11. Verify backup completion
./scripts/check-backup-status.sh
```

**Maintenance Verification**:

```
□ No critical system updates pending
□ Disk space usage stable
□ Log rotation working properly
□ Backups completed successfully
□ No maintenance alerts requiring attention
```

## End-of-Day Procedures

### Daily Reconciliation

```bash
# 1. Force position reconciliation
curl -X POST http://localhost:3002/api/state/reconcile \
  -H "Content-Type: application/json" \
  -u admin:password

# 2. Verify reconciliation results
curl -s http://localhost:3002/api/state/reconciliation-status

# 3. Generate reconciliation report
./scripts/daily-reconciliation.sh --date $(date +%Y-%m-%d)
```

### Data Backup Verification

```bash
# 4. Check database backup status
./scripts/check-backup-status.sh --verbose

# 5. Verify backup integrity
./scripts/verify-backup-integrity.sh --latest

# 6. Check backup retention policy compliance
./scripts/cleanup-old-backups.sh --dry-run
```

**Backup Verification**:

```
□ Database backup completed successfully
□ Configuration backup completed
□ Backup integrity verified
□ Backup retention policy compliant
□ Off-site backup sync completed (if configured)
```

### Security Review

```bash
# 7. Review authentication logs
sudo journalctl -u ssh --since "today" | grep -i "failed\|invalid" | wc -l

# 8. Check for unusual API activity
grep "$(date +%Y-%m-%d)" /var/log/nginx/access.log | \
  awk '{print $1}' | sort | uniq -c | sort -nr | head -10

# 9. Verify SSL certificate status
./scripts/check-ssl-status.sh
```

**Security Verification**:

```
□ No unusual authentication attempts
□ API access patterns normal
□ SSL certificates valid and not expiring soon
□ No security alerts from monitoring systems
□ Firewall rules still appropriate
```

### Documentation Updates

```bash
# 10. Update daily operations log
echo "$(date): End-of-day procedures completed" >> /var/log/titan/daily-ops.log

# 11. Generate daily summary report
./scripts/generate-daily-summary.sh --email operations@company.com

# 12. Update capacity planning metrics
./scripts/update-capacity-metrics.sh
```

### End-of-Day Sign-off

**Daily Summary Checklist**:

```
□ All trading sessions completed successfully
□ Positions reconciled and verified
□ Performance metrics within expectations
□ System health maintained throughout day
□ Backups completed and verified
□ Security review completed
□ No outstanding issues requiring immediate attention
□ Documentation updated
□ Next day preparation completed

Daily P&L: $_______ (____%)
Max Drawdown: _____%
System Uptime: _____%
Trades Executed: _____
Signal Success Rate: _____%

Issues Identified: ________________
Actions Taken: ___________________
Follow-up Required: ______________

Operator: _________________ Time: _________ Date: _________
```

## Weekly Procedures

### Monday - Week Planning

```bash
# Review weekly performance targets
./scripts/weekly-performance-review.sh

# Check for scheduled maintenance
./scripts/check-maintenance-schedule.sh

# Review capacity planning metrics
./scripts/capacity-planning-review.sh
```

### Wednesday - Mid-Week Review

```bash
# Performance trend analysis
./scripts/performance-trend-analysis.sh --period 7d

# System health trend review
./scripts/health-trend-analysis.sh --period 7d

# Configuration drift check
./scripts/config-drift-check.sh
```

### Friday - Week Wrap-Up

```bash
# Generate weekly report
./scripts/generate-weekly-report.sh

# Review and approve AI Quant recommendations
./scripts/review-ai-recommendations.sh

# Plan weekend maintenance (if any)
./scripts/plan-weekend-maintenance.sh
```

## Monthly Procedures

### First Monday of Month

```bash
# Monthly performance review
./scripts/monthly-performance-review.sh

# Capacity planning update
./scripts/update-capacity-plan.sh

# Security audit
./scripts/monthly-security-audit.sh

# Update documentation
./scripts/update-documentation.sh
```

### API Key Rotation (Monthly)

```bash
# Generate new API keys (manual process)
# 1. Create new keys on exchange
# 2. Test new keys in staging
# 3. Update production configuration
# 4. Verify functionality
# 5. Revoke old keys

./scripts/rotate-api-keys.sh --dry-run
# Follow prompts for actual rotation
```

## Emergency Procedures Reference

### Quick Emergency Actions

**Emergency Flatten All Positions**:

```bash
curl -X POST http://localhost:3002/api/console/flatten-all \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"operator_id": "emergency"}'
```

**Disable Master Arm**:

```bash
curl -X POST http://localhost:3002/api/console/master-arm \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"enabled": false, "operator_id": "emergency"}'
```

**Cancel All Orders**:

```bash
curl -X POST http://localhost:3002/api/console/cancel-all \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"operator_id": "emergency"}'
```

### Emergency Contacts

```
On-Call Engineer: +1-555-0100
Operations Manager: +1-555-0200
Technical Lead: +1-555-0300
Escalation (CTO): +1-555-0400
```

## Troubleshooting Quick Reference

### Common Issues and Solutions

**Service Won't Start**:

```bash
# Check logs
pm2 logs titan-brain --lines 50

# Check port conflicts
sudo netstat -tlnp | grep :3100

# Restart with fresh environment
pm2 delete titan-brain
pm2 start ecosystem.config.js --only titan-brain
```

**High Memory Usage**:

```bash
# Identify memory-heavy processes
ps aux --sort=-%mem | head -10

# Restart services if memory leak suspected
pm2 restart all

# Check for memory leaks in logs
pm2 logs | grep -i "memory\|heap\|gc"
```

**Database Connection Issues**:

```bash
# Test connection
psql -h localhost -U titan_user -d titan_brain -c "SELECT 1;"

# Check PostgreSQL status
sudo systemctl status postgresql

# Restart if needed
sudo systemctl restart postgresql
```

**WebSocket Connection Issues**:

```bash
# Test WebSocket connectivity
wscat -c ws://localhost:3002/ws/console

# Check Nginx configuration
sudo nginx -t

# Restart Nginx if needed
sudo systemctl restart nginx
```

---

This daily operations runbook should be followed consistently to ensure reliable
operation of the Titan Trading System. Any deviations or issues should be
documented and reported to the operations team for continuous improvement.
