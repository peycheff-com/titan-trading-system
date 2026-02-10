# Deploy Runbook

[← Back to Runbooks](README.md)

> **Scope**: Production deployment to DigitalOcean `titan-prod`
> **Target**: `/opt/titan` on droplet

## Pre-Deploy Checklist

- [ ] All CI gates green on `main`
- [ ] No open critical issues
- [ ] Backup taken: `./scripts/ops/backup_db.sh pre_deploy`
- [ ] Notify stakeholders

## Procedure

```bash
# 1. SSH to production
ssh deploy@<DROPLET_IP>

# 2. Pull latest
cd /opt/titan
git fetch origin main
git checkout main
git pull origin main

# 3. Build images
docker compose -f docker-compose.prod.yml build --no-cache

# 4. Rolling restart (infra first, then services)
docker compose -f docker-compose.prod.yml up -d titan-postgres titan-nats
sleep 10

docker compose -f docker-compose.prod.yml up -d titan-execution
sleep 5

docker compose -f docker-compose.prod.yml up -d titan-brain
sleep 5

docker compose -f docker-compose.prod.yml up -d titan-scavenger titan-sentinel

# 5. Verify health
curl -s localhost:3100/health | jq .status
curl -s localhost:8081/health | jq .status
curl -s localhost:8084/health | jq .status
curl -s localhost:3002/health | jq .status
docker exec titan-nats nats stream ls
```

## Post-Deploy Verification

```bash
# Check all containers running
docker compose -f docker-compose.prod.yml ps

# Verify no error spikes in last 5 minutes
docker compose -f docker-compose.prod.yml logs --since 5m 2>&1 | grep -i error | wc -l

# Check metrics endpoint responds
curl -s localhost:3100/metrics | head -5
```

## Rollback Trigger

If any health check returns `unhealthy` within 5 minutes, execute [rollback.md](./rollback.md).
