# Network Partition - Recovery Runbook

## Scenario Details

- **ID:** network-partition
- **Severity:** HIGH
- **Estimated RTO:** 5 minutes
- **Estimated RPO:** 1 minute

## Description

Loss of connectivity to external services (exchanges, cloud). This scenario applies when network connectivity to critical external services is lost.

## Prerequisites

Before starting this recovery procedure, ensure:

- Network diagnostics tools available
- Alternative connectivity options

## Recovery Steps

### Step 1: Activate emergency trading halt

**Command:**
```bash
curl -X POST http://localhost:3000/emergency/halt
```

- **Timeout:** 5 seconds
- **Critical:** YES

---

### Step 2: Diagnose network connectivity

**Command:**
```bash
bash scripts/network-diagnostics.sh
```

- **Timeout:** 60 seconds
- **Critical:** NO

---

### Step 3: Attempt to restore primary connectivity

**Command:**
```bash
sudo systemctl restart networking
```

- **Timeout:** 30 seconds
- **Critical:** NO

---

### Step 4: Test exchange connectivity

**Command:**
```bash
bash scripts/test-exchange-connectivity.sh
```

- **Timeout:** 30 seconds
- **Critical:** YES

---

### Step 5: Resume trading if connectivity restored

**Command:**
```bash
curl -X POST http://localhost:3000/emergency/resume
```

- **Timeout:** 5 seconds
- **Critical:** YES

---

## Validation Steps

### Validation 1: Verify exchange API connectivity

**Command:**
```bash
curl -f https://api.binance.com/api/v3/ping
```

**Expected Result:** HTTP 200 OK
**Timeout:** 10 seconds

---

### Validation 2: Test WebSocket connections

**Command:**
```bash
bash scripts/test-websocket-connections.sh
```

**Expected Result:** All connections successful
**Timeout:** 15 seconds

---

## Success Criteria

The recovery is considered successful when:

- External API connectivity is restored
- WebSocket connections are stable
- Trading operations can resume safely
- Network latency is within acceptable limits
