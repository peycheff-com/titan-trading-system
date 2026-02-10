# Postgres Outage Runbook

[← Back to Runbooks](README.md)


## Symptoms

- Services fail to query/write to database
- Health checks fail on DB connectivity
- Logs show "connection refused" or "too many connections"

## Immediate Actions

1. Check Postgres container: `docker ps | grep postgres`
2. Check Postgres logs: `docker logs titan-postgres --tail 100`
3. Verify connections: `docker exec titan-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"`

## Recovery

1. Restart Postgres: `docker restart titan-postgres`
2. If connection exhaustion, kill idle connections
3. If data corruption suspected, restore from backup (see restore_drill)

## Escalation

- Data loss suspected: Immediately escalate to on-call lead
