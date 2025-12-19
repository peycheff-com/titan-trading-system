# Titan System - Operator Manual

This manual provides operational procedures for running the Titan Trading System in production.

## Table of Contents

- [Console Overview](#console-overview)
- [Daily Operations](#daily-operations)
- [Emergency Procedures](#emergency-procedures)
- [Configuration Management](#configuration-management)
- [Monitoring & Alerts](#monitoring--alerts)
- [Troubleshooting Guide](#troubleshooting-guide)

---

## Console Overview

### Accessing the Console

**URL**: `https://titan-core.yourdomain.com`

**Authentication**: Basic Auth (username/password configured in Nginx)

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  TITAN CONSOLE                                    [🟢 Connected]    │
├─────────────────────────────────────────────────────────────────────┤
│  [Overview] [Phase 1] [Positions] [Settings]                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   EQUITY     │  │    PHASE     │  │   DRAWDOWN   │               │
│  │   $2,450     │  │      1       │  │    -2.3%     │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  MASTER ARM: [🔴 DISARMED]  [ARM SYSTEM]                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  EMERGENCY CONTROLS                                          │    │
│  │  [⚠️ FLATTEN ALL]  [🛑 CANCEL ALL]  [🔒 KILL SWITCH]        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Connection Status Indicator

| Status | Meaning | Action |
|--------|---------|--------|
| 🟢 Connected | WebSocket active | Normal operation |
| 🟡 Reconnecting | Connection lost, retrying | Wait 30 seconds |
| 🔴 Disconnected | Connection failed | Check server health |

---

## Daily Operations

### Morning Checklist

1. **Check System Health**
   ```bash
   curl https://titan-core.yourdomain.com/health
   ```
   Expected: `{"status":"healthy",...}`

2. **Review Overnight Activity**
   - Open Console → Overview tab
   - Check equity change
   - Review any triggered alerts

3. **Check Morning Briefing**
   - If AI Quant generated proposals, review them
   - Approve or reject optimization suggestions

4. **Verify Positions**
   - Open Console → Positions tab
   - Verify all positions match exchange
   - Check for any orphaned positions

5. **Check Phase Status**
   - Verify current phase matches equity
   - Review phase-specific risk parameters

### Pre-Market Checklist

1. **Verify Master Arm Status**
   - Should be ARMED for live trading
   - Should be DISARMED during maintenance

2. **Check Exchange Connectivity**
   - Bybit WebSocket: Connected
   - Binance WebSocket: Connected

3. **Review Risk Parameters**
   - Max leverage: Within limits
   - Daily loss limit: Not exceeded
   - Circuit breaker: Not triggered

### End-of-Day Checklist

1. **Review Daily Performance**
   - Total P&L
   - Win rate
   - Number of trades

2. **Check Database Backup**
   ```bash
   ls -la /data/backups/
   ```
   Verify today's backup exists

3. **Review System Logs**
   ```bash
   pm2 logs titan-core --lines 100 | grep -i "error\|warning"
   ```

---

## Emergency Procedures

### Emergency Flatten All Positions

**When to use**: Market crash, unexpected volatility, system malfunction

**Console Method**:
1. Click **[⚠️ FLATTEN ALL]** button
2. Confirm in dialog: "Are you sure? This will close ALL positions."
3. Wait for confirmation message

**API Method**:
```bash
curl -X POST https://titan-core.yourdomain.com/api/emergency/flatten \
  -H "Content-Type: application/json" \
  -u titan_admin:your_password
```

**Expected Response**:
```json
{
  "success": true,
  "positions_closed": 3,
  "results": [
    {"symbol": "BTCUSDT", "success": true},
    {"symbol": "ETHUSDT", "success": true},
    {"symbol": "SOLUSDT", "success": true}
  ]
}
```

### Cancel All Pending Orders

**When to use**: Stale orders, market conditions changed

**Console Method**:
1. Click **[🛑 CANCEL ALL]** button
2. Confirm in dialog

**API Method**:
```bash
curl -X POST https://titan-core.yourdomain.com/api/console/cancel-all \
  -H "Content-Type: application/json" \
  -u titan_admin:your_password
```

### Kill Switch (Full System Stop)

**When to use**: Critical system failure, security breach

**Console Method**:
1. Click **[🔒 KILL SWITCH]** button
2. Enter confirmation code
3. System will:
   - Flatten all positions
   - Cancel all orders
   - Disable Master Arm
   - Pause Scavenger

**Recovery**:
1. Investigate root cause
2. Fix issue
3. Re-arm system manually

### Circuit Breaker Triggered

**Automatic triggers**:
- Daily drawdown > 7%
- 3 consecutive losses
- Extreme volatility detected

**What happens**:
1. Master Arm automatically disabled
2. No new trades allowed
3. Existing positions remain open

**Recovery**:
1. Wait for cooldown period (4 hours default)
2. Review what triggered the breaker
3. Manually re-arm when ready

**Manual Reset** (if needed):
```bash
curl -X POST https://titan-core.yourdomain.com/api/circuit-breaker/reset \
  -H "Content-Type: application/json" \
  -u titan_admin:your_password \
  -d '{"reason": "Manual reset after review"}'
```

### Bybit Connection Lost

**Automatic behavior**:
1. Scavenger paused (SIGSTOP)
2. No new signals processed
3. Existing positions monitored via REST API

**When connection restored**:
1. Scavenger resumed (SIGCONT)
2. Normal operation continues

**Manual intervention** (if not auto-recovered):
```bash
# Restart titan-core
pm2 restart titan-core

# Check connection
curl https://titan-core.yourdomain.com/health
```

---

## Configuration Management

### Viewing Current Configuration

**Console Method**:
1. Go to Settings tab
2. View current parameters

**API Method**:
```bash
curl https://titan-core.yourdomain.com/api/console/config \
  -u titan_admin:your_password
```

### Updating Risk Parameters

**Console Method**:
1. Go to Settings → Risk tab
2. Adjust parameters:
   - Max Risk Per Trade: 1-5%
   - Max Daily Drawdown: 3-10%
   - Max Leverage: 5-50x
3. Click Save

**API Method**:
```bash
curl -X POST https://titan-core.yourdomain.com/api/console/config/risk \
  -H "Content-Type: application/json" \
  -u titan_admin:your_password \
  -d '{
    "maxRiskPerTrade": 0.02,
    "maxDailyDrawdown": 0.05,
    "maxLeverage": 20
  }'
```

### Managing Asset Whitelist

**Console Method**:
1. Go to Settings → Assets tab
2. Add/remove symbols from whitelist
3. Click Save

**API Method**:
```bash
# Add symbol
curl -X POST https://titan-core.yourdomain.com/api/console/config/whitelist \
  -H "Content-Type: application/json" \
  -u titan_admin:your_password \
  -d '{"action": "add", "symbol": "SOLUSDT"}'

# Remove symbol
curl -X POST https://titan-core.yourdomain.com/api/console/config/whitelist \
  -H "Content-Type: application/json" \
  -u titan_admin:your_password \
  -d '{"action": "remove", "symbol": "DOGEUSDT"}'
```

### Configuration Rollback

If a configuration change causes issues:

```bash
# List available versions
curl https://titan-core.yourdomain.com/api/config/versions \
  -u titan_admin:your_password

# Rollback to previous version
curl -X POST https://titan-core.yourdomain.com/api/config/rollback \
  -H "Content-Type: application/json" \
  -u titan_admin:your_password \
  -d '{"version_tag": "2024-12-13T10:30:00Z"}'
```

---

## Monitoring & Alerts

### Key Metrics to Watch

| Metric | Normal Range | Warning | Critical |
|--------|--------------|---------|----------|
| Equity | Growing | -5% daily | -10% daily |
| Win Rate | >50% | <45% | <40% |
| Latency | <50ms | >100ms | >500ms |
| Memory | <400MB | >450MB | >500MB |
| CPU | <50% | >70% | >90% |

### Health Check Endpoints

```bash
# System health
curl https://titan-core.yourdomain.com/health

# Detailed status
curl https://titan-core.yourdomain.com/api/status \
  -u titan_admin:your_password

# Prometheus metrics
curl https://titan-core.yourdomain.com/metrics
```

### Log Monitoring

```bash
# Real-time logs
pm2 logs titan-core

# Error logs only
pm2 logs titan-core --err

# Search for specific events
pm2 logs titan-core | grep "TRAP_SPRUNG"
pm2 logs titan-core | grep "ORDER_FILLED"
pm2 logs titan-core | grep "CIRCUIT_BREAKER"
```

### Alert Conditions

The system automatically logs alerts for:

| Event | Severity | Action |
|-------|----------|--------|
| Circuit breaker triggered | CRITICAL | Review immediately |
| Bybit connection lost | HIGH | Monitor for auto-recovery |
| Daily drawdown > 5% | HIGH | Consider reducing exposure |
| 3 consecutive losses | MEDIUM | Review strategy |
| Signal rejected | LOW | Check logs for reason |

---

## Troubleshooting Guide

### Problem: Console Shows "Disconnected"

**Symptoms**: Red connection indicator, no real-time updates

**Diagnosis**:
```bash
# Check if server is running
pm2 status

# Check Nginx
sudo systemctl status nginx

# Check WebSocket endpoint
curl -i https://titan-core.yourdomain.com/ws
```

**Solutions**:
1. Restart titan-core: `pm2 restart titan-core`
2. Restart Nginx: `sudo systemctl restart nginx`
3. Check firewall: `sudo ufw status`

### Problem: Orders Not Executing

**Symptoms**: Signals generated but no fills

**Diagnosis**:
```bash
# Check Master Arm status
curl https://titan-core.yourdomain.com/api/status | jq '.masterArm'

# Check circuit breaker
curl https://titan-core.yourdomain.com/api/status | jq '.circuitBreaker'

# Check Bybit connection
curl https://titan-core.yourdomain.com/api/status | jq '.bybitConnected'
```

**Solutions**:
1. If Master Arm disabled → Re-arm in Console
2. If Circuit Breaker triggered → Wait for cooldown or manual reset
3. If Bybit disconnected → Restart titan-core

### Problem: High Latency

**Symptoms**: Slow order execution, delayed updates

**Diagnosis**:
```bash
# Check server load
htop

# Check network latency
ping api.bybit.com

# Check PM2 metrics
pm2 show titan-core
```

**Solutions**:
1. High CPU → Restart services: `pm2 restart all`
2. High memory → Check for memory leaks in logs
3. Network issues → Check AWS network status

### Problem: Database Errors

**Symptoms**: "Database locked" or "SQLITE_BUSY" errors

**Diagnosis**:
```bash
# Check database file
ls -la /data/titan.db

# Check for stuck processes
fuser /data/titan.db
```

**Solutions**:
1. Restart services: `pm2 restart all`
2. If persists, restore from backup:
   ```bash
   pm2 stop all
   cp /data/backups/latest.db /data/titan.db
   pm2 start all
   ```

### Problem: Shadow State Mismatch

**Symptoms**: Console shows different positions than exchange

**Diagnosis**:
```bash
# Force reconciliation
curl -X POST https://titan-core.yourdomain.com/api/state/reconcile \
  -u titan_admin:your_password
```

**Solutions**:
1. Reconciliation will sync Shadow State with exchange
2. If positions still mismatch, check logs for errors
3. Manual correction via exchange UI if needed

---

## Appendix: Quick Reference

### PM2 Commands

```bash
pm2 status              # View all services
pm2 logs                # View all logs
pm2 logs titan-core     # View specific service logs
pm2 restart all         # Restart all services
pm2 restart titan-core  # Restart specific service
pm2 stop all            # Stop all services
pm2 monit               # Real-time monitoring
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | System health check |
| `/api/status` | GET | Detailed system status |
| `/api/console/config` | GET | Current configuration |
| `/api/console/config/risk` | POST | Update risk parameters |
| `/api/console/config/whitelist` | POST | Update asset whitelist |
| `/api/emergency/flatten` | POST | Flatten all positions |
| `/api/console/cancel-all` | POST | Cancel all orders |
| `/api/state/positions` | GET | Current positions |
| `/api/state/reconcile` | POST | Force reconciliation |
| `/api/circuit-breaker/reset` | POST | Reset circuit breaker |

### Emergency Contacts

| Role | Contact |
|------|---------|
| System Admin | your-email@example.com |
| On-Call | +1-xxx-xxx-xxxx |

---

*Last updated: December 2024*
