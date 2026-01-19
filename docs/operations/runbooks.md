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
