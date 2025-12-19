# Titan Trading System - Incident Response Procedures

This document outlines the incident response procedures for the Titan Trading System, including escalation paths, communication protocols, and recovery procedures for various types of incidents.

## Incident Classification

### Severity Levels

#### Severity 1 - Critical (Response Time: Immediate)
**Impact**: Complete system outage or trading halted
**Examples**:
- All services down
- Circuit breaker activated due to system failure
- Database corruption or complete data loss
- Security breach with unauthorized access
- Exchange API keys compromised

**Response Team**: On-call engineer + Operations manager + Development lead
**Communication**: Immediate notification to all stakeholders

#### Severity 2 - High (Response Time: 15 minutes)
**Impact**: Significant service degradation or partial outage
**Examples**:
- Single critical service down (Brain or Execution)
- WebSocket disconnections affecting real-time updates
- Position tracking discrepancies
- High latency (>500ms) in signal processing
- Memory leaks causing service instability

**Response Team**: On-call engineer + Operations manager
**Communication**: Notification within 15 minutes

#### Severity 3 - Medium (Response Time: 1 hour)
**Impact**: Minor service degradation or non-critical issues
**Examples**:
- Console dashboard unavailable
- AI Quant service failures
- Non-critical configuration issues
- Performance degradation (200-500ms latency)
- Monitoring system alerts

**Response Team**: On-call engineer
**Communication**: Notification within 1 hour

#### Severity 4 - Low (Response Time: Next business day)
**Impact**: Minimal impact or informational
**Examples**:
- Documentation updates needed
- Enhancement requests
- Non-urgent configuration changes
- Capacity planning alerts

**Response Team**: Operations team during business hours
**Communication**: Standard ticketing system

## Incident Response Team

### Roles and Responsibilities

#### Incident Commander (IC)
**Primary**: Operations Manager
**Backup**: Senior On-call Engineer

**Responsibilities**:
- Overall incident coordination and decision making
- Communication with stakeholders and management
- Resource allocation and escalation decisions
- Post-incident review coordination

#### Technical Lead
**Primary**: Development Team Lead
**Backup**: Senior Developer

**Responsibilities**:
- Technical analysis and troubleshooting
- Code-level debugging and fixes
- Architecture decisions during incident
- Technical communication to IC

#### Operations Lead
**Primary**: Senior System Administrator
**Backup**: On-call Engineer

**Responsibilities**:
- System-level troubleshooting and recovery
- Infrastructure changes and scaling
- Service restart and configuration changes
- Monitoring and alerting management

#### Communications Lead
**Primary**: Operations Manager
**Backup**: Business Stakeholder

**Responsibilities**:
- External stakeholder communication
- Status page updates
- Customer/user notifications
- Media and regulatory communication (if required)

### Contact Information

```
Incident Commander:
- Primary: +1-555-0101 (Operations Manager)
- Backup: +1-555-0102 (Senior Engineer)

Technical Lead:
- Primary: +1-555-0201 (Dev Team Lead)
- Backup: +1-555-0202 (Senior Developer)

Operations Lead:
- Primary: +1-555-0301 (SysAdmin)
- Backup: +1-555-0302 (On-call Engineer)

Escalation:
- CTO: +1-555-0401
- CEO: +1-555-0501 (Severity 1 only)
```

## Incident Response Process

### Phase 1: Detection and Initial Response (0-5 minutes)

#### Automatic Detection
- Monitoring alerts (Prometheus/Grafana)
- Health check failures
- Circuit breaker activations
- Exception tracking (error rates)

#### Manual Detection
- User reports
- Operator observations
- Routine health checks

#### Initial Response Checklist
```
□ Acknowledge the incident
□ Assess initial severity level
□ Check system status dashboard
□ Verify if circuit breaker is active
□ Check if Master Arm is enabled
□ Review recent changes or deployments
□ Notify incident response team
□ Create incident ticket/channel
```

### Phase 2: Assessment and Triage (5-15 minutes)

#### Severity Assessment
```bash
# Quick system health check
./scripts/health-check.sh

# Check service status
pm2 status

# Check recent logs for errors
pm2 logs --lines 100 | grep -i error

# Check system resources
htop
df -h
free -m

# Check network connectivity
ping api.bybit.com
ping api.mexc.com
```

#### Impact Assessment
- Number of affected users/services
- Financial impact (trading halted, positions at risk)
- Data integrity concerns
- Security implications
- Regulatory compliance impact

#### Triage Decision Matrix
| System Status | Trading Impact | Severity | Response |
|---------------|----------------|----------|----------|
| All services down | Trading halted | 1 | Immediate all-hands |
| Brain down | No new signals | 1 | Immediate response |
| Execution down | No order execution | 1 | Immediate response |
| Console down | No monitoring | 2 | High priority |
| Scavenger down | Phase 1 disabled | 2-3 | Based on equity level |
| AI Quant down | No optimization | 3-4 | Standard response |

### Phase 3: Containment and Stabilization (15-60 minutes)

#### Immediate Containment Actions

**For Trading System Issues**:
```bash
# Emergency flatten all positions (if necessary)
curl -X POST https://titan.yourdomain.com/api/execution/flatten-all \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"operator_id": "incident_response"}'

# Disable Master Arm (halt new trading)
curl -X POST https://titan.yourdomain.com/api/execution/master-arm \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"enabled": false, "operator_id": "incident_response"}'

# Cancel all pending orders
curl -X POST https://titan.yourdomain.com/api/execution/cancel-all \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"operator_id": "incident_response"}'
```

**For Service Failures**:
```bash
# Restart failed services
pm2 restart titan-brain
pm2 restart titan-execution

# Check service dependencies
systemctl status postgresql
systemctl status redis-server
systemctl status nginx

# Restart dependencies if needed
sudo systemctl restart postgresql
sudo systemctl restart redis-server
```

**For Database Issues**:
```bash
# Check database connectivity
psql -h localhost -U titan_user -d titan_brain -c "SELECT 1;"

# Check database locks
psql -h localhost -U titan_user -d titan_brain -c "
  SELECT pid, usename, application_name, state, query 
  FROM pg_stat_activity 
  WHERE state != 'idle';"

# Check disk space
df -h /var/lib/postgresql/

# If corruption suspected, stop writes and assess
sudo systemctl stop titan-brain
sudo systemctl stop titan-execution
```

#### Stabilization Checklist
```
□ Immediate risk mitigation completed
□ System state documented and preserved
□ Logs collected and preserved
□ Monitoring systems functional
□ Communication channels established
□ Stakeholders notified of status
```

### Phase 4: Investigation and Diagnosis (Parallel to containment)

#### Data Collection
```bash
# Collect system information
./scripts/collect-diagnostic-info.sh

# Collect service logs
mkdir -p /tmp/incident-logs
pm2 logs --lines 1000 > /tmp/incident-logs/pm2-logs.txt
journalctl -u postgresql --since "1 hour ago" > /tmp/incident-logs/postgresql.log
journalctl -u redis --since "1 hour ago" > /tmp/incident-logs/redis.log
journalctl -u nginx --since "1 hour ago" > /tmp/incident-logs/nginx.log

# Collect system metrics
sar -A > /tmp/incident-logs/system-metrics.txt
iostat -x 1 10 > /tmp/incident-logs/io-stats.txt
netstat -tuln > /tmp/incident-logs/network-stats.txt

# Database diagnostics
pg_dump --schema-only titan_brain > /tmp/incident-logs/db-schema.sql
```

#### Root Cause Analysis Framework

**5 Whys Analysis**:
1. What happened? (Symptom)
2. Why did it happen? (Immediate cause)
3. Why did that happen? (Underlying cause)
4. Why did that happen? (Root cause)
5. Why did that happen? (Systemic cause)

**Timeline Reconstruction**:
- When did the incident start?
- What was the sequence of events?
- What changes occurred before the incident?
- What alerts fired and when?

**Change Analysis**:
- Recent deployments or configuration changes
- Infrastructure changes
- Third-party service changes
- Market condition changes

### Phase 5: Resolution and Recovery (Variable duration)

#### Resolution Strategies by Incident Type

**Service Restart Issues**:
```bash
# Clean restart procedure
pm2 stop all
pm2 delete all
pm2 start ecosystem.config.js

# If persistent issues, check for:
# - Port conflicts
# - File permission issues
# - Environment variable problems
# - Dependency version conflicts
```

**Database Issues**:
```bash
# For connection issues
sudo systemctl restart postgresql
# Wait for startup
sleep 10
# Test connection
psql -h localhost -U titan_user -d titan_brain -c "SELECT 1;"

# For corruption (if detected)
sudo -u postgres pg_dump titan_brain > /tmp/backup-before-repair.sql
sudo -u postgres reindexdb titan_brain
# Test integrity
sudo -u postgres vacuumdb --analyze titan_brain
```

**Network/Connectivity Issues**:
```bash
# Check DNS resolution
nslookup api.bybit.com
nslookup api.mexc.com

# Check routing
traceroute api.bybit.com

# Check firewall
sudo ufw status
sudo iptables -L

# Test API connectivity
curl -I https://api.bybit.com/v5/market/time
```

**Performance Issues**:
```bash
# Check resource usage
top -p $(pgrep -d',' -f titan)

# Check for memory leaks
ps aux --sort=-%mem | head -20

# Check disk I/O
iotop -o

# Restart services if memory leak detected
pm2 restart all
```

#### Recovery Verification
```bash
# Run comprehensive health check
./scripts/health-check.sh

# Test critical functionality
./scripts/test-signal-flow.sh --quick

# Verify position accuracy
./scripts/verify-positions.sh

# Check performance metrics
./scripts/performance-check.sh
```

### Phase 6: Communication and Updates

#### Internal Communication Template
```
INCIDENT UPDATE - [SEVERITY] - [TIMESTAMP]

Status: [INVESTIGATING/IDENTIFIED/MONITORING/RESOLVED]
Impact: [Description of current impact]
Services Affected: [List of affected services]
Estimated Resolution: [Time estimate or "Unknown"]

Current Actions:
- [Action 1]
- [Action 2]

Next Update: [Time for next update]

Incident Commander: [Name]
```

#### External Communication Template
```
SYSTEM STATUS UPDATE

We are currently experiencing [brief description of issue].

Impact: [User-facing impact description]
Status: [Current status]
Estimated Resolution: [Time estimate]

We will provide updates every [frequency] until resolved.

For real-time updates: [status page URL]
```

#### Communication Channels
- **Internal**: Slack #incidents channel
- **External**: Status page, email notifications
- **Regulatory**: As required by jurisdiction
- **Media**: Through designated spokesperson only

### Phase 7: Post-Incident Activities

#### Immediate Post-Resolution (Within 1 hour)
```
□ Confirm full service restoration
□ Re-enable Master Arm (if appropriate)
□ Verify all positions and balances
□ Update stakeholders on resolution
□ Schedule post-incident review
□ Preserve all incident data
```

#### Post-Incident Review (Within 24 hours)

**Review Agenda**:
1. Incident timeline and impact assessment
2. Response effectiveness evaluation
3. Root cause analysis findings
4. Action items and improvements
5. Process and procedure updates

**Deliverables**:
- Incident report with timeline
- Root cause analysis document
- Action item list with owners and deadlines
- Process improvement recommendations

## Specific Incident Scenarios

### Scenario 1: Circuit Breaker Activation

**Immediate Actions**:
1. Verify circuit breaker reason and validity
2. Check if positions need immediate attention
3. Assess market conditions
4. Determine if manual intervention needed

**Investigation**:
```bash
# Check circuit breaker status
curl https://titan.yourdomain.com/api/brain/breaker

# Review recent trading activity
curl https://titan.yourdomain.com/api/execution/trades?limit=50

# Check performance metrics
curl https://titan.yourdomain.com/api/brain/dashboard
```

**Resolution**:
- If valid trigger: Wait for cooldown period
- If false positive: Manual reset with justification
- Document decision rationale

### Scenario 2: Position Tracking Mismatch

**Immediate Actions**:
1. Halt new trading immediately
2. Compare Shadow State vs exchange positions
3. Identify discrepancy source
4. Determine if manual reconciliation needed

**Investigation**:
```bash
# Get Shadow State positions
curl https://titan.yourdomain.com/api/execution/positions

# Force reconciliation
curl -X POST https://titan.yourdomain.com/api/execution/reconcile \
  -u admin:password

# Check reconciliation results
curl https://titan.yourdomain.com/api/execution/reconciliation-status
```

### Scenario 3: Exchange API Issues

**Immediate Actions**:
1. Check if issue is exchange-wide or account-specific
2. Switch to backup exchange if available
3. Monitor position status via web interface
4. Prepare for manual intervention if needed

**Investigation**:
```bash
# Test API connectivity
./scripts/test-exchange-apis.sh

# Check API rate limits
curl -H "X-BAPI-API-KEY: $BYBIT_API_KEY" \
     "https://api.bybit.com/v5/account/rate-limit"

# Check account status
curl -H "X-BAPI-API-KEY: $BYBIT_API_KEY" \
     "https://api.bybit.com/v5/account/info"
```

## Recovery Procedures

### Service Recovery Order

1. **Database Services** (PostgreSQL, Redis)
2. **Core Services** (Brain, Execution)
3. **Interface Services** (Console)
4. **Trading Services** (Scavenger, AI Quant)
5. **Monitoring Services** (Prometheus, Grafana)

### Data Recovery Procedures

**Database Recovery**:
```bash
# Stop all services
pm2 stop all

# Restore from backup (if needed)
sudo -u postgres psql -d titan_brain < /backup/latest-backup.sql

# Verify data integrity
sudo -u postgres psql -d titan_brain -c "
  SELECT COUNT(*) FROM allocations;
  SELECT COUNT(*) FROM decisions;
  SELECT MAX(timestamp) FROM performance;"

# Restart services
pm2 start ecosystem.config.js
```

**Configuration Recovery**:
```bash
# Restore configuration from backup
cp /backup/config/.env .env
cp /backup/config/ecosystem.config.js ecosystem.config.js

# Validate configuration
./scripts/validate-config.sh

# Restart with new configuration
pm2 reload ecosystem.config.js
```

## Escalation Procedures

### When to Escalate

**To Management**:
- Severity 1 incidents
- Incidents lasting >2 hours
- Financial impact >$10,000
- Security breaches
- Regulatory implications

**To Development Team**:
- Code-level issues requiring fixes
- Architecture changes needed
- Database schema issues
- Performance optimization needs

**To External Vendors**:
- Exchange API issues
- Infrastructure provider issues
- Third-party service failures

### Escalation Contacts

```
Level 1: On-call Engineer
- Response: Immediate
- Authority: Service restart, configuration changes

Level 2: Operations Manager
- Response: 15 minutes
- Authority: Emergency procedures, resource allocation

Level 3: Technical Director
- Response: 30 minutes
- Authority: Architecture changes, vendor escalation

Level 4: CTO
- Response: 1 hour
- Authority: Business decisions, external communication

Level 5: CEO
- Response: 2 hours (Severity 1 only)
- Authority: All decisions
```

## Documentation and Reporting

### Incident Documentation Requirements

**During Incident**:
- Real-time status updates
- Action log with timestamps
- Decision rationale documentation
- Communication log

**Post-Incident**:
- Complete incident report
- Root cause analysis
- Financial impact assessment
- Lessons learned document
- Process improvement plan

### Regulatory Reporting

**When Required**:
- Trading system outages >30 minutes
- Position tracking errors
- Security incidents
- Data breaches

**Reporting Timeline**:
- Initial notification: Within 4 hours
- Detailed report: Within 24 hours
- Final report: Within 5 business days

## Continuous Improvement

### Incident Metrics

**Response Metrics**:
- Mean Time to Detection (MTTD)
- Mean Time to Response (MTTR)
- Mean Time to Resolution (MTTR)
- Escalation frequency

**Quality Metrics**:
- Incident recurrence rate
- False positive rate
- Customer impact duration
- Process compliance rate

### Process Improvement

**Monthly Reviews**:
- Incident trend analysis
- Process effectiveness review
- Training needs assessment
- Tool and automation opportunities

**Quarterly Updates**:
- Procedure documentation updates
- Contact information verification
- Escalation path optimization
- Training program updates

---

This incident response procedure is reviewed quarterly and updated based on lessons learned from actual incidents and industry best practices.