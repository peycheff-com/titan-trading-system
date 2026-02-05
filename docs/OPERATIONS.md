# Operations Manual

> **Status**: Canonical
> **Area**: Ops & Infrastructure

## 1. Monitoring & Alerting

### Health Endpoints
- **Brain**: `http://localhost:3100/health` (Internal)
- **Console**: `https://titan.peycheff.com` (External)

### Logging
All services emit JSON structure logs to stdout. In production, these are captured by Docker logging drivers (and potentially forwarded to Loki).

## 2. Secrets Management

Secrets are managed via:
1.  **Environment Variables** (Dev/Staging)
2.  **Mounts** (Production) - preferred for `HMAC_SECRET` and Database passwords.
    - Path: `/run/secrets/titan_master_key`
    - Rotation: Manual rotation requires service restart.

## 3. Self-Hosted AI Infrastructure

We run Kimi K2.5 on a dedicated GPU droplet for sovereign inference.

### Architecture
- **Inference**: vLLM on NVIDIA L40S (AMS3 Region)
- **Model**: `moonshotai/Kimi-K2.5-Instruct` (INT4)
- **Endpoint**: `:80` (nginx proxy) -> `:8000` (vLLM)

### Usage
Configure Titan Brain to use the private IP of the GPU droplet:
```bash
export KIMI_LOCAL_ENDPOINT=http://10.110.0.x/v1
export AI_PROVIDER=kimi-local
```

### Management
Scripts located in `scripts/ops/deploy-gpu.sh`:
```bash
./scripts/ops/deploy-gpu.sh status   # Check health
./scripts/ops/deploy-gpu.sh provision # Provision infrastructure
```

## 4. Maintenance

### Database Backups
Scheduled via cron on the host:
```bash
0 2 * * * /opt/titan/scripts/backup-db.sh
```

### Updates
- **OS Patching**: Monthly via `apt upgrade`.
- **Docker**: Pin versions in `docker-compose.prod.yml`.
