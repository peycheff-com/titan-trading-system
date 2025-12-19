# Database Corruption - Recovery Runbook

## Scenario Details

- **ID:** database-corruption
- **Severity:** HIGH
- **Estimated RTO:** 10 minutes
- **Estimated RPO:** 5 minutes

## Description

Redis database corruption requiring restoration from backup. This scenario applies when Redis data is corrupted, inaccessible, or inconsistent.

## Prerequisites

Before starting this recovery procedure, ensure:

- Redis backup available
- System access available

## Recovery Steps

### Step 1: Stop all Titan services

**Command:**
```bash
pm2 stop all
```

- **Timeout:** 30 seconds
- **Critical:** YES

---

### Step 2: Stop Redis service

**Command:**
```bash
sudo systemctl stop redis
```

- **Timeout:** 15 seconds
- **Critical:** YES

---

### Step 3: Backup corrupted Redis data

**Command:**
```bash
sudo cp /var/lib/redis/dump.rdb /var/lib/redis/dump.rdb.corrupted
```

- **Timeout:** 10 seconds
- **Critical:** NO

---

### Step 4: Restore Redis from backup

**Command:**
```bash
sudo cp /backups/redis/latest/dump.rdb /var/lib/redis/
```

- **Timeout:** 30 seconds
- **Critical:** YES

---

### Step 5: Set correct permissions

**Command:**
```bash
sudo chown redis:redis /var/lib/redis/dump.rdb
```

- **Timeout:** 5 seconds
- **Critical:** YES

---

### Step 6: Start Redis service

**Command:**
```bash
sudo systemctl start redis
```

- **Timeout:** 30 seconds
- **Critical:** YES

---

### Step 7: Start Titan services

**Command:**
```bash
pm2 start all
```

- **Timeout:** 60 seconds
- **Critical:** YES

---

## Validation Steps

### Validation 1: Verify Redis is running

**Command:**
```bash
redis-cli ping
```

**Expected Result:** PONG
**Timeout:** 5 seconds

---

### Validation 2: Check data integrity

**Command:**
```bash
redis-cli dbsize
```

**Expected Result:** Positive integer
**Timeout:** 5 seconds

---

### Validation 3: Verify all services are online

**Command:**
```bash
pm2 status
```

**Expected Result:** All processes online
**Timeout:** 10 seconds

---

## Success Criteria

The recovery is considered successful when:

- All validation steps pass
- Redis is responding normally
- All services are running
- Data integrity is confirmed
- Trading functionality is operational
