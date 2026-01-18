# Configuration Corruption - Recovery Runbook

## Scenario Details

- **ID:** configuration-corruption
- **Severity:** MEDIUM
- **Estimated RTO:** 8 minutes
- **Estimated RPO:** 0 minutes

## Description

Critical configuration files corrupted or missing. This scenario applies when configuration files are corrupted, missing, or contain invalid data.

## Prerequisites

Before starting this recovery procedure, ensure:

- Configuration backups available
- System access available

## Recovery Steps

### Step 1: Stop affected services

**Command:**
```bash
pm2 stop all
```

- **Timeout:** 30 seconds
- **Critical:** YES

---

### Step 2: Backup corrupted configuration

**Command:**
```bash
cp -r config config.corrupted.$(date +%s)
```

- **Timeout:** 10 seconds
- **Critical:** NO

---

### Step 3: Restore configuration from backup

**Command:**
```bash
bash scripts/restore-config.sh
```

- **Timeout:** 30 seconds
- **Critical:** YES

---

### Step 4: Validate configuration integrity

**Command:**
```bash
node scripts/validate-config.js
```

- **Timeout:** 15 seconds
- **Critical:** YES

---

### Step 5: Restart services with restored config

**Command:**
```bash
pm2 start ecosystem.config.js
```

- **Timeout:** 60 seconds
- **Critical:** YES

---

## Validation Steps

### Validation 1: Verify configuration schema compliance

**Command:**
```bash
node scripts/validate-config.js --strict
```

**Expected Result:** All configurations valid
**Timeout:** 10 seconds

---

### Validation 2: Check service startup with new config

**Command:**
```bash
pm2 status
```

**Expected Result:** All processes online
**Timeout:** 10 seconds

---

## Success Criteria

The recovery is considered successful when:

- Configuration files are valid and complete
- All services start successfully with restored config
- System functionality is fully operational
- No configuration-related errors in logs
