# Disaster Recovery - Quick Reference

## Emergency Commands

### Immediate Response
```bash
# Emergency trading halt
curl -X POST http://localhost:3000/emergency/halt

# Check system status
pm2 status
redis-cli ping
curl -f http://localhost:3000/health
```

### System Recovery
```bash
# Full system restore
bash scripts/disaster-recovery.sh --scenario complete-system-failure

# Database restore only
bash scripts/disaster-recovery.sh --scenario database-corruption

# Configuration restore only
bash scripts/disaster-recovery.sh --scenario configuration-corruption
```

### Validation
```bash
# Quick health check
bash scripts/health-check.sh --full

# Trading system validation
curl -f http://localhost:3000/health/trading
```

## Recovery Time Objectives

| Scenario | RTO | RPO | Severity |
|----------|-----|-----|----------|
| Complete System Failure | 15m | 5m | CRITICAL |
| Database Corruption | 10m | 5m | HIGH |
| Network Partition | 5m | 1m | HIGH |
| Configuration Corruption | 8m | 0m | MEDIUM |

## Critical File Locations

- **Backups:** /backups
- **Configuration:** config/
- **Logs:** logs/
- **Scripts:** scripts/
- **PM2 Config:** ecosystem.config.js

## Emergency Contacts

- **On-Call:** [Emergency phone number]
- **Escalation:** [Manager phone number]
- **Infrastructure:** [Infrastructure team contact]

## Key Validation Commands

```bash
# Service status
pm2 jlist | jq '.[].pm2_env.status'

# Database connectivity
redis-cli ping

# External connectivity
curl -f https://api.binance.com/api/v3/ping

# WebSocket connections
curl -f http://localhost:3000/health/websockets

# Trading system health
curl -f http://localhost:3000/health/trading
```

## Recovery Decision Tree

1. **Is the server accessible?**
   - No → Complete System Failure
   - Yes → Continue to step 2

2. **Are services running?**
   - No → Check database and restart services
   - Yes → Continue to step 3

3. **Is database accessible?**
   - No → Database Corruption scenario
   - Yes → Continue to step 4

4. **Are external connections working?**
   - No → Network Partition scenario
   - Yes → Check configuration

5. **Is configuration valid?**
   - No → Configuration Corruption scenario
   - Yes → Investigate other issues
