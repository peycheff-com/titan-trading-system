# Emergency Response Checklist

## Immediate Response (0-2 minutes)

### Assessment
- [ ] Identify the type and scope of failure
- [ ] Check if trading is still active
- [ ] Determine if this is a partial or complete system failure
- [ ] Note the time of incident detection

### Initial Actions
- [ ] **STOP TRADING IMMEDIATELY** if system integrity is compromised
  ```bash
  curl -X POST http://localhost:3000/emergency/halt
  ```
- [ ] Alert the on-call team
- [ ] Start logging all actions and observations
- [ ] Preserve any error messages or logs

## Triage (2-5 minutes)

### System Status Check
- [ ] Check PM2 process status: `pm2 status`
- [ ] Check Redis connectivity: `redis-cli ping`
- [ ] Check system resources: `top`, `df -h`
- [ ] Check network connectivity: `ping 8.8.8.8`

### Determine Recovery Scenario
- [ ] **Complete System Failure**: Server is inaccessible or completely down
- [ ] **Database Corruption**: Redis issues, data inconsistency
- [ ] **Network Partition**: External connectivity issues
- [ ] **Configuration Corruption**: Config files corrupted or missing
- [ ] **Service Failure**: Individual service issues

## Recovery Execution (5-15 minutes)

### Execute Appropriate Recovery
- [ ] Run disaster recovery script:
  ```bash
  bash scripts/disaster-recovery.sh --scenario <scenario-id>
  ```

### Monitor Progress
- [ ] Watch recovery logs in real-time
- [ ] Validate each step completion
- [ ] Be prepared to escalate if recovery fails

## Validation (15-20 minutes)

### System Health Check
- [ ] All PM2 processes online: `pm2 status`
- [ ] Redis responding: `redis-cli ping`
- [ ] WebSocket connections active: `curl http://localhost:3000/health/websockets`
- [ ] Trading system operational: `curl http://localhost:3000/health/trading`

### Trading Validation
- [ ] Check position reconciliation
- [ ] Verify account balances
- [ ] Test order placement (small test order)
- [ ] Validate risk management systems

### Performance Check
- [ ] Monitor system performance for 30 minutes
- [ ] Check for any error logs
- [ ] Verify all alerts are functioning

## Post-Recovery (20+ minutes)

### Documentation
- [ ] Complete incident report
- [ ] Document lessons learned
- [ ] Update procedures if needed
- [ ] Schedule post-incident review

### Communication
- [ ] Notify stakeholders of resolution
- [ ] Update status page if applicable
- [ ] Prepare summary for management

## Emergency Contacts

| Role | Primary | Secondary |
|------|---------|-----------|
| On-Call Engineer | [Phone] | [Phone] |
| Infrastructure Team | [Phone] | [Phone] |
| Business Stakeholders | [Phone] | [Phone] |
| Exchange Support | [Phone] | [Phone] |

## Critical Commands Quick Reference

```bash
# Emergency halt
curl -X POST http://localhost:3000/emergency/halt

# System status
pm2 status
redis-cli ping
curl http://localhost:3000/health

# Start disaster recovery
bash scripts/disaster-recovery.sh --scenario complete-system-failure

# Resume trading (only after full validation)
curl -X POST http://localhost:3000/emergency/resume
```

## Recovery Time Objectives

{{RTO_TABLE}}

## Escalation Triggers

Escalate immediately if:
- Recovery exceeds maximum RTO
- Multiple recovery attempts fail
- Data integrity is compromised
- External dependencies are affected
- Regulatory reporting is impacted