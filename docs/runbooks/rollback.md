# Rollback Runbook

## Pre-Rollback Checklist
- [ ] Identify the bad commit/version
- [ ] Confirm rollback target version is known good
- [ ] Notify stakeholders

## Rollback Procedure

### 1. Stop Current Services
```bash
docker compose down
```

### 2. Checkout Previous Version
```bash
git checkout <previous-good-sha>
```

### 3. Rebuild and Deploy
```bash
make docker-build
docker compose up -d
```

### 4. Verify Health
```bash
curl localhost:3100/health
```

## Post-Rollback
- Document incident
- Create hotfix branch for proper fix
- Schedule post-mortem
