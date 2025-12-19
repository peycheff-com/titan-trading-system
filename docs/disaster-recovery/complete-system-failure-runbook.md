# Complete System Failure - Recovery Runbook

## Scenario Details

- **ID:** complete-system-failure
- **Severity:** CRITICAL
- **Estimated RTO:** 15 minutes
- **Estimated RPO:** 5 minutes

## Description

Total server failure requiring full system restoration from backup. This scenario applies when the entire server is inaccessible or completely non-functional.

## Prerequisites

Before starting this recovery procedure, ensure:

- Access to backup storage
- New server instance provisioned
- Network connectivity established
- DNS records updated if needed

## Recovery Steps

### Step 1: Provision server infrastructure

**Command:**
```bash
bash scripts/provision-infrastructure.sh
```

- **Timeout:** 300 seconds
- **Critical:** YES
- **Notes:** Ensure minimum 8GB RAM, 4 CPU cores

---

### Step 2: Install base dependencies

**Command:**
```bash
bash scripts/setup-dependencies.sh
```

- **Timeout:** 180 seconds
- **Critical:** YES

---

### Step 3: Restore configuration files

**Command:**
```bash
bash scripts/restore-config.sh
```

- **Timeout:** 60 seconds
- **Critical:** YES

---

### Step 4: Restore application code

**Command:**
```bash
bash scripts/restore-application.sh
```

- **Timeout:** 120 seconds
- **Critical:** YES

---

### Step 5: Start Redis service

**Command:**
```bash
sudo systemctl start redis
```

**Expected Output:**
```
Active: active (running)
```

- **Timeout:** 30 seconds
- **Critical:** YES

---

### Step 6: Start Titan services via PM2

**Command:**
```bash
pm2 start ecosystem.config.js
```

- **Timeout:** 60 seconds
- **Critical:** YES

---

### Step 7: Validate all services are running

**Command:**
```bash
pm2 status
```

- **Timeout:** 10 seconds
- **Critical:** YES

---

## Validation Steps

After completing the recovery procedure, validate the system:

### Validation 1: Verify all PM2 processes are online

**Command:**
```bash
pm2 jlist | jq ".[].pm2_env.status"
```

**Expected Result:** All processes show "online"
**Timeout:** 10 seconds

---

### Validation 2: Test Redis connectivity

**Command:**
```bash
redis-cli ping
```

**Expected Result:** PONG
**Timeout:** 5 seconds

---

### Validation 3: Verify WebSocket connections

**Command:**
```bash
curl -f http://localhost:3000/health/websockets
```

**Expected Result:** HTTP 200 OK
**Timeout:** 10 seconds

---

### Validation 4: Check trading system status

**Command:**
```bash
curl -f http://localhost:3000/health/trading
```

**Expected Result:** HTTP 200 OK with trading: true
**Timeout:** 10 seconds

---

## Rollback Procedure

No specific rollback procedure defined. Follow standard system rollback procedures if recovery fails.

## Success Criteria

The recovery is considered successful when:

- All validation steps pass
- System performance is within normal parameters
- Trading functionality is fully operational
- No data loss is detected
- All external connections are restored

## Troubleshooting

Common issues and solutions:

### Issue: Service fails to start after recovery
**Solution:** Check service logs and configuration files for errors

### Issue: Database connection fails
**Solution:** Verify Redis service status and network connectivity

### Issue: External API connections fail
**Solution:** Check network connectivity and API credentials

### Issue: Configuration validation fails
**Solution:** Restore configuration from a known good backup

## Post-Recovery Actions

1. Monitor system performance for 30 minutes
2. Document any deviations from expected behavior
3. Update incident log with recovery completion time
4. Schedule post-incident review within 24 hours
5. Consider implementing additional preventive measures
