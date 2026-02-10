# Key Rotation Runbook

[← Back to Runbooks](README.md)

> **Scope**: Rotate secrets without service interruption (where possible)
> **Secrets**: DB password, HMAC secret, exchange API keys

## 1. Database Password Rotation

**Impact**: Brief brain/execution downtime during restart.

```bash
# 1. Stop consumers
docker compose -f docker-compose.prod.yml stop titan-brain titan-execution

# 2. Update password in Postgres
docker exec -it titan-postgres psql -U titan -d titan_brain -c \
  "ALTER USER titan WITH PASSWORD '<NEW_PASSWORD>';"

# 3. Update .env.prod
sed -i 's/TITAN_DB_PASSWORD=.*/TITAN_DB_PASSWORD=<NEW_PASSWORD>/' .env.prod

# 4. Restart consumers
docker compose -f docker-compose.prod.yml up -d titan-brain titan-execution

# 5. Verify
curl -s localhost:3100/health | jq '.components[] | select(.name=="database")'
```

## 2. HMAC Secret Rotation (Critical)

**Impact**: Invalidates ALL in-flight HMAC signatures. Requires atomic restart of brain + execution.

```bash
# 1. Generate new secret
NEW_HMAC=$(openssl rand -hex 32)
echo "New HMAC: $NEW_HMAC"

# 2. Update .env.prod
sed -i "s/HMAC_SECRET=.*/HMAC_SECRET=$NEW_HMAC/" .env.prod

# 3. Atomic restart (both must restart simultaneously)
docker compose -f docker-compose.prod.yml up -d --force-recreate titan-brain titan-execution

# 4. Verify NATS communication restored
docker compose -f docker-compose.prod.yml logs --since 30s titan-brain 2>&1 | grep -i "hmac\|signature\|auth"
```

## 3. Exchange API Key Rotation

**Impact**: Temporary loss of trading capability on rotated exchange.

```bash
# 1. Generate new keys on exchange (Binance/Bybit web console)
# 2. Update .env.prod with new keys
# 3. Restart market data consumers
docker compose -f docker-compose.prod.yml restart titan-scavenger titan-sentinel

# 4. Verify connectivity
curl -s localhost:8081/health | jq '.connections.binance'
```

## Post-Rotation Checklist

- [ ] Verify all health endpoints return `healthy`
- [ ] Verify metrics scrape is working (`curl localhost:3100/metrics | head`)
- [ ] Verify no HMAC errors in logs for 5 minutes
- [ ] Old secrets have been securely deleted (not in shell history)
