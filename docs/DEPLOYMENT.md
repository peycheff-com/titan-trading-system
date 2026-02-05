# Production Deployment Standard

> **Status**: Canonical
> **Authority**: Titan Ops

## 1. The Deployment Contract

Deployment to Titan Production is a **manual, high-assurance event**. We rarely deploy. When we do, it is a deliberate act of sovereignty.

**Constraint**: All production changes must be performed by an authorized operator.
**Target**: DigitalOcean Droplet (`titan-core-vps`) via Docker Compose.

## 2. Pre-Flight Checklist

### Security
- [ ] `TITAN_MASTER_PASSWORD` is set (min 32 chars).
- [ ] `HMAC_SECRET` is consistent across opsd, brain, and console-api.
- [ ] Network: Only Docker socket is mounted to OpsD (root).
- [ ] Firewall: only 80/443 (Traefik) open. 3100 (Brain) is internal-only.

### Application Health
- [ ] Console UI loads at `https://titan.peycheff.com`.
- [ ] Dashboard shows 'Connected' state.
- [ ] 'Live Ops' stream is active (heartbeats visible).
- [ ] 'Export Evidence' triggers a download.

### Operations
- [ ] Backups for Postgres (`titan_brain`) are scheduled.
- [ ] Logs are draining to Loki/Prometheus (if configured).

## 3. Deploy Procedure

### Step 1: Connect
```bash
ssh deploy@<droplet-ip>
cd /opt/titan
```

### Step 2: Update Code
```bash
git pull origin main
```

### Step 3: Atomic Drift-Correction
We use `docker-compose.prod.yml` as the single source of truth.

```bash
# Pull new images
docker compose -f docker-compose.prod.yml pull

# Atomic Switch (Zero Downtime for stateless, briefly for Brain)
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

### Step 4: Verification
Run the verification script (if available) or manual check:
```bash
# Check status
docker compose -f docker-compose.prod.yml ps

# Tail logs for errors
docker compose -f docker-compose.prod.yml logs -f --tail=100 titan-brain
```

## 4. Rollback
If health checks fail within 5 minutes of deploy:

```bash
# Revert to previous hash
git checkout HEAD~1

# Redeploy
docker compose -f docker-compose.prod.yml up -d --build
```

## 5. Secrets Management
Secrets are injected via environment variables in `.env` or Docker Swarm secrets (future).
For now, we use a `.env.prod` file on the host, safeguarded by file permissions (`600`).

**Never commit `.env` files to git.**

---

## 6. Advanced: Policy Change Protocol

> **Critical**: Policy changes require synchronized deployment across Brain and Execution to maintain the `policy_hash` invariant.

### Invariants
1. **Policy Hash Parity**: Brain and Execution MUST have identical `policy_hash` values.
2. **Fail-Closed**: Brain fails handshake if hashes mismatch.

### Procedure

1. **DISARM Execution**:
   ```bash
   nats pub titan.cmd.operator.disarm.v1 "Pre-deployment disarm"
   ```

2. **Deploy Execution**:
   - Verify startup logs: `[INFO] Loaded RiskPolicy (hash: abc...)`
   - Verify responder: `nats req titan.req.exec.policy_hash.v1 "{}"`

3. **Deploy Brain**:
   - Verify handshake: `✅ Policy hash handshake OK`

4. **ARM Execution**:
   ```bash
   nats pub titan.cmd.operator.arm.v1 "Post-deployment arm"
   ```

5. **Rollback**: If mismatch occurs, DISARM immediately, revert both services, and Redeploy.

