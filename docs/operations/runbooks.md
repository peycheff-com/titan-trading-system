# Operations Runbooks

## 1. Incident Response

### Global Halt (Circuit Breaker)
In the event of catastrophic market conditions or system malfunction, use the Global Halt to immediately stop all new order creation.

**Trigger Halt:**
```bash
# Execute directly on the VPS
docker exec titan-nats nats pub system.halt '{"active": true, "reason": "Manual Operator Halt"}'
```

**Verify Halt Status:**
Check `titan-execution` logs:
```bash
docker logs titan-execution --tail 100 | grep "Halt"
```

**Resume Trading:**
```bash
docker exec titan-nats nats pub system.halt '{"active": false, "reason": "Manual Resume"}'
```

### System Crash Recovery
If `titan-brain` or `titan-execution` crashes:
1. **Check Logs:** `docker compose logs --tail 200 <service_name>`
2. **Restart Service:** `docker compose restart <service_name>`
3. **Verify Health:** `curl localhost:3100/health` (Brain) or `curl localhost:3002/health` (Execution)

---

## 2. Rollback Procedure

### Code Rollback
If a new deployment introduces critical bugs:

1. **Revert Git Commit:**
   ```bash
   git revert HEAD
   git push origin main
   ```
2. **Re-deploy:**
   Run the standard deployment script:
   ```bash
   ./scripts/deploy-vps.sh
   ```

### Database Rollback
If a migration corrupts data:

1. **Stop Services:**
   ```bash
   docker compose stop titan-brain titan-execution
   ```
2. **Restore from Backup:**
   Use the `restore-db.sh` script with the latest valid backup file.
   ```bash
   # List backups
   ls -l /backup/location # (Verify location in scripts/backup-db.sh)
   
   # Restore
   ./scripts/restore-db.sh <backup_file_path>
   ```
3. **Restart Services:**
   ```bash
   docker compose up -d
   ```

---

## 3. Secret Rotation

### Rotating API Keys (Binance/Exchange)
1. **Update .env:**
   Edit the `.env` file on the VPS (or locally if using `deploy-secrets.sh`).
   ```bash
   nano .env
   # Update BINANCE_API_KEY and BINANCE_API_SECRET
   ```
2. **Recreate Containers:**
   Force recreation to pick up new env vars.
   ```bash
   docker compose up -d --force-recreate titan-execution titan-sentinel
   ```

### Rotating Database Credentials
> [!WARNING]
> This requires downtime as all services connecting to DB must be updated.

1. **Update Postgres User/Pass:**
   Update `docker-compose.prod.yml` or `.env` with new `TITAN_DB_PASSWORD`.
2. **Update Service Configs:**
   Update `TITAN_DB_PASSWORD` in `.env`.
3. **Redeploy All:**
   ```bash
   docker compose down
   docker compose up -d
   ```

---

## 🚨 EMERGENCY: "Oh Shit" Button

> [!CAUTION]
> Use these commands ONLY in genuine emergencies. They bypass normal controls.

### Immediate Full Stop (Fastest)

Create the halt lock file directly on the execution container:
```bash
# NUCLEAR OPTION: Creates system.halt file → Engine stops immediately
docker exec titan-execution sh -c 'echo "EMERGENCY $(date)" > system.halt'
```

Verify halt is active:
```bash
docker exec titan-execution ls -la system.halt
```

### NATS Halt Command (Standard)

```bash
# Standard halt via NATS messaging
docker exec titan-nats nats pub titan.cmd.sys.halt.v1 \
  '{"state":"HARD_HALT","reason":"OPERATOR EMERGENCY","source":"manual"}'
```

### Flatten All Positions (Close Everything)

> [!WARNING]
> This will immediately close ALL open positions at market price.

```bash
docker exec titan-nats nats pub titan.cmd.risk.flatten '{}'
```

### Kill Switch (Last Resort)

If messaging is unresponsive, stop containers directly:
```bash
# Stop execution first to prevent new orders
docker stop titan-execution

# Then stop brain
docker stop titan-brain

# Verify
docker ps | grep titan
```

### Recovery from Emergency Halt

1. **Clear the halt file:**
   ```bash
   docker exec titan-execution rm -f system.halt
   ```

2. **Resume via NATS:**
   ```bash
   docker exec titan-nats nats pub titan.cmd.sys.halt.v1 \
     '{"state":"NORMAL","reason":"Emergency cleared","source":"manual"}'
   ```

3. **Verify system state:**
   ```bash
   docker logs titan-execution --tail 20 | grep -E "(HALT|NORMAL)"
   docker logs titan-brain --tail 20 | grep -E "(Breaker|Resume)"
   ```

4. **Reset Circuit Breaker (if triggered):**
   Use the Console UI Armed Mode panel, or:
   ```bash
   curl -X POST http://localhost:3100/api/breaker/reset \
     -H "Content-Type: application/json" \
     -d '{"operatorId": "YOUR_NAME"}'
   ```

