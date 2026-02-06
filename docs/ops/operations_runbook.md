# Operations Runbook

> **Status**: Canonical
> **Authority**: Titan Ops
> **Scope**: Day-2 Operations (Monitoring, Maintenance, Incident Response)

This document dictates routine and emergency operational procedures for the Titan Trading System.

## 1. Service Management

Target: DigitalOcean Droplet (`titan-prod`). All commands run from `/opt/titan`.

### 1.1 Start / Stop / Restart
```bash
# Start Stack (Production)
docker compose -f docker-compose.prod.yml up -d

# Stop Stack
docker compose -f docker-compose.prod.yml stop

# Restart Specific Service (e.g., Brain)
docker compose -f docker-compose.prod.yml restart titan-brain

# Force Recreation (if config changed)
docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps titan-brain
```

### 1.2 Status Checks
```bash
# Docker Status
docker compose -f docker-compose.prod.yml ps

# NATS Connectivity
docker exec titan-nats nats stream ls

# Database Connectivity
docker exec titan-postgres pg_isready
```

## 2. Observability & Logs

### 2.1 Live Logs (Tail)
```bash
# Tail all services
docker compose -f docker-compose.prod.yml logs -f --tail=100

# Focus on Brain (Orchestrator)
docker compose -f docker-compose.prod.yml logs -f --tail=200 titan-brain

# Focus on Execution (Rust Engine)
docker compose -f docker-compose.prod.yml logs -f --tail=200 titan-execution
```

### 2.2 Metrics
- **Prometheus**: Internal port `9090`.
- **Grafana**: Internal port `3000`. Access via SSH Tunnel:
  ```bash
  ssh -L 3000:localhost:3000 deploy@<DROPLET_IP>
  # Open http://localhost:3000
  ```

### 2.3 Health Endpoints
| Service | Endpoint | Internal URL | Note |
| :--- | :--- | :--- | :--- |
| Brain | `/health` | `http://localhost:3100/health` | Deep checks DB/NATS |
| Execution | `/health` | `http://localhost:3002/health` | Checks internal state |
| NATS | `/healthz` | `http://localhost:8222/healthz` | Cluster status |

## 3. Secrets & Rotation

**Storage**: `/opt/titan/compose/.env.prod` (Owner: `root`, Mode: `0600`).

### 3.1 Rotate Database Password
1. **Stop Services**: `docker compose -f docker-compose.prod.yml stop titan-brain titan-execution`
2. **Update Postgres**:
   - Edit `.env.prod`: Update `TITAN_DB_PASSWORD`.
   - Start Postgres: `docker compose -f docker-compose.prod.yml up -d titan-postgres`
   - Access container: `docker exec -it titan-postgres psql -U titan -d titan_brain`
   - SQL: `ALTER USER titan WITH PASSWORD 'new_password';`
3. **Restart Services**: `docker compose -f docker-compose.prod.yml up -d`

### 3.2 Rotate HMAC Secret (Critical)
**Impact**: Invalidates all in-flight signatures. Requires simultaneous restart.

1. Generate new secret: `openssl rand -hex 32`
2. Update `HMAC_SECRET` in `.env.prod`.
3. Atomic Restart:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --force-recreate titan-brain titan-execution
   ```

## 4. Backups & Restore

### 4.1 Automated Backups
Cron job configured on host at `/etc/cron.d/titan-backup`:
```cron
0 2 * * * root /opt/titan/scripts/ops/backup_db.sh > /var/log/titan-backup.log 2>&1
```
Location: `/opt/titan/backups/db/`

### 4.2 Manual Backup
```bash
./scripts/ops/backup_db.sh verification_snapshot
```

### 4.3 Database Restore
**Warning**: Destructive action.
```bash
# 1. Stop Brain to prevent writes
docker stop titan-brain

# 2. Restore
cat backups/db/titan_brain_2026-02-06.sql | docker exec -i titan-postgres psql -U titan -d titan_brain

# 3. Restart Brain
docker start titan-brain
```

## 5. Maintenance / Routine

### 5.1 Disk Space Cleanup
Run weekly to prevent log explosion.
```bash
docker system prune -f --volumes
# Check usage
df -h
```

### 5.2 OS Updates
DigitalOcean managed, but manual check recommended monthly:
```bash
sudo apt update && sudo apt upgrade
```

## 6. Self-Hosted AI (Kimi-k2.5)

To connect to private GPU infrastructure:
1. Verify GPU Droplet IP.
2. Update `.env.prod`:
   ```bash
   AI_PROVIDER=kimi-local
   KIMI_LOCAL_ENDPOINT=http://<GPU_IP>:8000/v1
   ```
3. Restart `titan-ai-quant` and `titan-brain`.
