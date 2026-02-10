# Rollback Runbook

[← Back to Runbooks](README.md)

> **When**: Any deploy causes health degradation, elevated errors, or unexpected behavior
> **Time budget**: Complete within 10 minutes of decision to rollback

## Decision Criteria

Rollback immediately if any of:
- Brain health endpoint returns `unhealthy` for > 2 minutes
- Error rate exceeds 1% (visible in Prometheus)
- Circuit breaker trips unexpectedly
- Drawdown exceeds 3% post-deploy

## Procedure

```bash
# 1. Identify the last-known-good commit
git log --oneline -5
# Note the commit SHA before the bad deploy

# 2. Stop all application services (preserve infra)
docker compose -f docker-compose.prod.yml stop titan-brain titan-execution titan-scavenger titan-sentinel

# 3. Checkout previous version
git checkout <LAST_GOOD_SHA>

# 4. Rebuild
docker compose -f docker-compose.prod.yml build --no-cache titan-brain titan-execution titan-scavenger titan-sentinel

# 5. Restart
docker compose -f docker-compose.prod.yml up -d titan-brain titan-execution titan-scavenger titan-sentinel

# 6. Verify
curl -s localhost:3100/health | jq .
curl -s localhost:8081/health | jq .
curl -s localhost:3002/health | jq .
```

## Post-Rollback

1. Document the incident
2. Create a hotfix branch from `main`
3. Schedule post-mortem within 24h
4. Notify stakeholders of rollback
