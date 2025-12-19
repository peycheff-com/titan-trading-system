# Error Recovery Runbook

This runbook provides step-by-step procedures for recovering from common errors in the Titan Execution Service.

**Requirements**: 9.1-9.7

## Error Classification

### Transient Errors (Automatic Recovery)
These errors are handled automatically by the system with retry logic:
- WebSocket disconnections
- API rate limits
- Temporary network issues
- Database connection timeouts

### Permanent Errors (Operator Intervention Required)
These errors require manual intervention:
- Invalid API credentials
- Database corruption
- Configuration errors
- Insufficient account balance

---

## 1. WebSocket Disconnection Recovery

**Error**: `WebSocket disconnected` or `Connection lost to Binance/Bybit`

**Symptoms**:
- No real-time market data updates
- Stale prices in L2 cache
- Health status shows `websocket: unhealthy`

**Automatic Recovery**:
The system automatically attempts reconnection with exponential backoff:
1. First retry: 2 seconds
2. Second retry: 4 seconds
3. Third retry: 8 seconds
4. Max 3 attempts before alerting

**Manual Recovery** (if automatic fails):

```bash
# 1. Check WebSocket status
curl http://localhost:8080/api/health

# 2. Check network connectivity
ping stream.binance.com
ping stream.bybit.com

# 3. Restart Execution Service
pm2 restart titan-execution

# 4. Verify reconnection
curl http://localhost:8080/api/health | jq '.websocket'
```

**Prevention**:
- Monitor WebSocket health metrics in Grafana
- Set up alerts for disconnections > 60 seconds
- Ensure stable network connection

---

## 2. Order Rejection Handling

**Error**: `Order rejected by broker` or `Insufficient margin`

**Symptoms**:
- Orders fail to execute
- Error logs show rejection reasons
- Fill rate drops below 80%

**Automatic Recovery**:
The system logs rejection and continues operation without retry (by design).

**Manual Recovery**:

```bash
# 1. Check rejection reason in logs
tail -f logs/execution.log | grep "Order rejected"

# 2. Common rejection reasons and fixes:

# Insufficient margin
# → Check account balance
curl http://localhost:8080/api/state/equity

# → Reduce position size or leverage
# Edit config: risk.maxRiskPct or risk.phase1RiskPct

# Invalid symbol
# → Verify symbol format (e.g., BTCUSDT not BTC-USDT)

# Price out of range
# → Check if limit price is within exchange limits
# → Adjust entry zone in signal

# Rate limit exceeded
# → Wait for cooldown period (see section 3)

# 3. Test with small order
# Use testnet to verify fix before production
```

**Prevention**:
- Monitor order fill rate in Grafana
- Set up alerts for fill rate < 80%
- Maintain sufficient account balance (2x max position size)
- Use testnet for testing new configurations

---

## 3. API Rate Limit Exceeded

**Error**: `Rate limit exceeded` or `HTTP 429 Too Many Requests`

**Symptoms**:
- Orders delayed or queued
- API requests failing
- Rate limit warnings in logs

**Automatic Recovery**:
The system automatically queues requests and retries after cooldown:
1. Queue pending requests
2. Wait for rate limit window to reset (typically 1 minute)
3. Retry queued requests with exponential backoff

**Manual Recovery**:

```bash
# 1. Check current rate limit status
curl http://localhost:8080/api/health | jq '.broker.rate_limit_status'

# 2. If rate limit persists, reduce request rate
# Edit .env:
BYBIT_RATE_LIMIT_RPS=5  # Reduce from 10 to 5 requests/second

# 3. Restart service
pm2 restart titan-execution

# 4. Monitor rate limit metrics
# Check Grafana dashboard for "API Request Rate"
```

**Prevention**:
- Configure conservative rate limits (default: 10 req/s)
- Use account caching to reduce API calls
- Monitor API request rate in Grafana
- Set up alerts for rate limit warnings

---

## 4. Database Connection Loss

**Error**: `Database connection lost` or `SQLITE_BUSY`

**Symptoms**:
- Shadow State not persisting
- Position data not updating
- Database errors in logs

**Automatic Recovery**:
The system attempts reconnection with max 5 retries:
1. First retry: immediate
2. Subsequent retries: 2s, 4s, 8s, 16s
3. If all retries fail, service exits

**Manual Recovery**:

```bash
# 1. Check database file
ls -lh titan_execution.db

# 2. Check database integrity
sqlite3 titan_execution.db "PRAGMA integrity_check;"

# 3. If corrupted, restore from backup
node scripts/restore-database.js --latest

# 4. Verify restoration
sqlite3 titan_execution.db "SELECT COUNT(*) FROM positions;"

# 5. Restart service
pm2 restart titan-execution

# 6. Verify Shadow State restoration
curl http://localhost:8080/api/state/positions
```

**Prevention**:
- Enable automated hourly backups (see section 7)
- Monitor database size and growth
- Use SSD for database storage
- Avoid concurrent writes from multiple processes

---

## 5. Shadow State Desynchronization

**Error**: `Ghost position detected` or `Position mismatch with broker`

**Symptoms**:
- Shadow State doesn't match broker positions
- Unexpected positions on broker
- Position count mismatch

**Manual Recovery**:

```bash
# 1. Check Shadow State
curl http://localhost:8080/api/state/positions

# 2. Check broker positions
# Log into Bybit web interface and verify positions

# 3. Run reconciliation
curl -X POST http://localhost:8080/api/state/reconcile

# 4. If ghost position detected, flatten it
curl -X POST http://localhost:8080/api/positions/BTCUSDT/close

# 5. Verify reconciliation
curl http://localhost:8080/api/state/positions
```

**Prevention**:
- Run automatic reconciliation on startup
- Monitor for ghost position alerts
- Never manually trade on the same account
- Use separate accounts for manual and automated trading

---

## 6. Crash Recovery

**Error**: Service crashes or is killed unexpectedly

**Symptoms**:
- Service not responding
- PM2 shows service stopped
- No recent logs

**Manual Recovery**:

```bash
# 1. Check PM2 status
pm2 status

# 2. Check crash logs
pm2 logs titan-execution --lines 100

# 3. Restart service
pm2 restart titan-execution

# 4. Verify Shadow State restoration
curl http://localhost:8080/api/state/positions

# 5. Verify no ghost positions
curl http://localhost:8080/api/state/reconcile

# 6. Check system health
curl http://localhost:8080/api/health
```

**Prevention**:
- Enable PM2 auto-restart: `pm2 startup`
- Monitor service uptime in Grafana
- Set up alerts for service downtime
- Investigate crash causes in logs

---

## 7. Database Corruption

**Error**: `Database disk image is malformed` or `SQLITE_CORRUPT`

**Symptoms**:
- Service refuses to start
- Database integrity check fails
- Cannot read position data

**Manual Recovery**:

```bash
# 1. Verify corruption
sqlite3 titan_execution.db "PRAGMA integrity_check;"

# 2. Create backup of corrupted database (for forensics)
cp titan_execution.db titan_execution.db.corrupted-$(date +%s)

# 3. Restore from latest backup
node scripts/restore-database.js --latest

# 4. If no local backup, restore from S3
node scripts/restore-database.js --from-s3

# 5. Verify restoration
sqlite3 titan_execution.db "PRAGMA integrity_check;"
sqlite3 titan_execution.db "SELECT COUNT(*) FROM positions;"

# 6. Restart service
pm2 restart titan-execution

# 7. Verify system health
curl http://localhost:8080/api/health
```

**Prevention**:
- Enable automated hourly backups
- Upload backups to S3 for off-server storage
- Monitor database integrity
- Use reliable storage (SSD, RAID)
- Avoid force-killing the service

---

## 8. Insufficient Account Balance

**Error**: `Insufficient balance` or `Margin insufficient`

**Symptoms**:
- Orders rejected
- Cannot open new positions
- Account equity below minimum

**Manual Recovery**:

```bash
# 1. Check current equity
curl http://localhost:8080/api/state/equity

# 2. Check open positions
curl http://localhost:8080/api/state/positions

# 3. Close positions to free up margin (if needed)
curl -X POST http://localhost:8080/api/positions/BTCUSDT/close

# 4. Deposit funds to account
# Log into Bybit and deposit USDT

# 5. Verify new balance
curl http://localhost:8080/api/state/equity

# 6. Resume trading
# Service will automatically resume when balance is sufficient
```

**Prevention**:
- Maintain minimum 2x max position size in account
- Monitor equity in Grafana
- Set up alerts for low balance
- Use conservative position sizing

---

## 9. Configuration Errors

**Error**: `Configuration validation failed` or `Invalid config parameter`

**Symptoms**:
- Service refuses to start
- Validation errors on startup
- Missing required fields

**Manual Recovery**:

```bash
# 1. Check configuration file
cat config/production.json

# 2. Validate configuration
node -e "import('./config/ConfigValidator.js').then(m => m.validateOnStartup('config/production.json'))"

# 3. Fix validation errors
# Edit config/production.json based on error messages

# 4. Restore from example if needed
cp config/production.example.json config/production.json
# Then edit with your values

# 5. Restart service
pm2 restart titan-execution
```

**Prevention**:
- Use configuration validation on startup
- Keep backup of working configuration
- Test configuration changes in testnet first
- Use version control for configuration files

---

## 10. Emergency Flatten All Positions

**When to use**: System malfunction, unexpected behavior, or manual intervention needed

```bash
# 1. Flatten all positions immediately
curl -X POST http://localhost:8080/api/emergency/flatten-all

# 2. Verify all positions closed
curl http://localhost:8080/api/state/positions

# 3. Check final P&L
curl http://localhost:8080/api/state/equity

# 4. Stop service to prevent new trades
pm2 stop titan-execution

# 5. Investigate issue before restarting
tail -f logs/execution.log
```

---

## Monitoring and Alerting

### Key Metrics to Monitor
1. **WebSocket Health**: Should be "healthy" at all times
2. **Order Fill Rate**: Should be > 80%
3. **Order Latency**: Should be < 1 second (P95)
4. **Drawdown**: Should be < 5%
5. **Account Equity**: Should be > minimum threshold

### Alert Thresholds
- WebSocket disconnected > 60 seconds → **CRITICAL**
- Order fill rate < 80% → **WARNING**
- Order latency > 1 second → **WARNING**
- Drawdown > 5% → **WARNING**
- Drawdown > 7% → **CRITICAL**
- Service down > 5 minutes → **CRITICAL**

### Alert Channels
- Slack: Real-time notifications
- Email: Daily summaries
- SMS: Critical alerts only

---

## Contact Information

**On-Call Engineer**: [Your contact info]
**Backup Contact**: [Backup contact info]
**Escalation**: [Escalation contact info]

**Support Resources**:
- Grafana Dashboard: http://localhost:3000
- Prometheus Metrics: http://localhost:8080/metrics
- Service Logs: `pm2 logs titan-execution`
- Database Backups: `./backups/` or S3 bucket

---

## Appendix: Common Log Messages

### Normal Operation
```
✅ Connected to Execution Service
✅ Bybit connection test successful
✅ Shadow State restored from database
✅ PREPARE accepted: BTCUSDT
🚀 EXECUTED: BTCUSDT @ 50000
```

### Warnings
```
⚠️ PREPARE rejected: BTCUSDT (insufficient margin)
⚠️ Trap invalidated, ABORT sent: ETHUSDT
⚠️ Rate limit exceeded for IP: 192.168.1.100
⚠️ WebSocket disconnected, reconnecting...
```

### Errors
```
❌ Execution failed: BTCUSDT (order rejected)
❌ Database connection lost
❌ Max reconnection attempts reached
❌ Configuration validation failed
🚨 Ghost position detected: BTCUSDT
```
