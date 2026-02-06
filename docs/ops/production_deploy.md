# Production Deployment Runbook

> **Status**: Canonical
> **Authority**: Titan Ops
> **Target**: DigitalOcean Droplet (`titan-prod`)
> **Source**: `github.com/peycheff-com/titan-trading-system`

This document is the **single source of truth** for deploying the Titan Trading System to production. It replaces all legacy deployment guides.

## 1. The Deployment Contract

Deployment is a **manual, high-assurance event**. It must be performed by an authorized operator.
**Invariant**: Code only flows from `main` branch to Production.

### 1.1 Target Environment
| Component | Value | Notes |
| :--- | :--- | :--- |
| **Provider** | DigitalOcean | Droplet: `s-4vcpu-8gb-pcie` (AMS3) |
| **Domain** | `titan.peycheff.com` | SSL via Traefik (Let's Encrypt) |
| **SSH User** | `deploy` | Key-based auth only |
| **Path** | `/opt/titan` | Runtime directory |
| **Secrets** | `/opt/titan/compose/.env.prod` | **Protected (0600)** |

## 2. Pre-Flight Checklist

### Security
- [ ] SSH Access: `ssh deploy@<IP>` works.
- [ ] Secrets: `/opt/titan/compose/.env.prod` exists and is owned by `root`.
- [ ] Firewall: UFW allows ONLY ssh (22), http (80), https (443).

### Application State
- [ ] CI Status: GitHub Actions build for `main` is 🟢 PASSING.
- [ ] No formatting/linting errors in the commit to be deployed.
- [ ] Operator Disarm: If actively trading, issue a DISARM command first (see below).

## 3. Deployment Procedure

### Step 1: Connect and Prepare
```bash
ssh deploy@<DROPLET_IP>
cd /opt/titan
```

### Step 2: Update Codebase
```bash
# Fetch latest changes
git fetch origin main
git reset --hard origin/main

# Verify commit hash
git rev-parse HEAD
# Output MUST match your local CI-passing commit
```

### Step 3: Atomic Deployment
We use `docker-compose.prod.yml` as the definition of reality.

```bash
# 1. Pull new images (minimizes downtime)
docker compose -f docker-compose.prod.yml pull

# 2. Atomic Recreation (Zero-downtime for stateless, Restart for Brain/Exec)
# --remove-orphans ensures no zombie containers remain
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

### Step 4: Verification (The "Green" Signal)
Wait 30 seconds for specific health checks.

```bash
# 1. Check Container Status
docker compose -f docker-compose.prod.yml ps
# EXPECT: All services 'Up' (brain, execution, nats, postgres, redis, traefik)

# 2. Check Logs for Panic/Errors
docker compose -f docker-compose.prod.yml logs --tail=50 titan-brain titan-execution
# SEARCH FOR: "Panic", "Error", "Connection refused"

# 3. Verify HTTP Endpoints (Curl)
curl -f https://titan.peycheff.com/health || echo "❌ Console Down"
# Note: Brain/Execution ports are not exposed publically. Check internally if needed:
# docker exec titan-brain curl -f http://localhost:3100/health
```

## 4. Rollback Procedure (Emergency)

If verification fails or alerts trigger within 5 minutes:

### Fast Rollback (Previous Code)
```bash
# 1. Revert Git
git checkout HEAD@{1}

# 2. Redeploy
docker compose -f docker-compose.prod.yml up -d --build
```

### Nuclear Rollback (Restore from Backup)
If data corruption is suspected:
1. Stop services: `docker compose -f docker-compose.prod.yml down`
2. Restore Database (see `ops/backup_restore_dr.md`).
3. Redeploy `HEAD@{1}`.

## 5. Policy & Configuration Update Protocol

**Critical**: If changing `risk_policy.json` or `config/nats.conf`:

1. **Disarm Execution**:
   ```bash
   docker exec titan-nats nats pub titan.cmd.operator.disarm.v1 "Policy Update"
   ```
2. **Deploy** (Steps 1-3 above).
3. **Verify Policy Hash**:
   Check logs of `titan-execution` to ensure it loaded the exact hash present in `titan-brain`.
4. **Re-Arm**:
   ```bash
   docker exec titan-nats nats pub titan.cmd.operator.arm.v1 "Post-Deploy Arm"
   ```

## 6. Troubleshooting

- **502 Bad Gateway**: Traefik cannot reach the backend. Check `titan-console` and `titan-brain` container status.
- **Database Connection Error**: Verify `TITAN_DB_PASSWORD` in `.env.prod`.
- **NATS Connection Error**: Verify `NATS_USER`/`NATS_PASS` match in all services.
