# DigitalOcean Production Runbook

**Last Updated**: 2026-02-06  
**Target Environment**: DigitalOcean Droplet (titan-prod)

---

## Quick Reference

| Item | Value |
|------|-------|
| **Domain** | titan.peycheff.com |
| **Droplet** | titan-prod (s-4vcpu-8gb, AMS3) |
| **SSH User** | deploy |
| **Runtime Dir** | /opt/titan |
| **Compose Dir** | /opt/titan/compose |
| **Secrets** | /opt/titan/compose/.env.prod |

---

## Table of Contents

1. [Initial Deployment](#1-initial-deployment)
2. [Routine Operations](#2-routine-operations)
3. [Monitoring](#3-monitoring)
4. [Emergency Procedures](#4-emergency-procedures)
5. [Maintenance](#5-maintenance)

---

## 1. Initial Deployment

### Prerequisites
- [ ] Droplet created (see `scripts/ops/do/00_create_droplet.md`)
- [ ] Cloud Firewall applied (SSH/80/443 only)
- [ ] DNS A record for titan.peycheff.com pointing to Droplet IP
- [ ] GitHub secrets updated (PROD_SSH_HOST, PROD_SSH_USER, PROD_SSH_KEY)

### Step 1: Bootstrap Host
```bash
# From local machine
ssh root@<DROPLET_IP> 'bash -s' < scripts/ops/do/01_bootstrap_host.sh
```

### Step 2: Prepare Runtime
```bash
ssh deploy@<DROPLET_IP> 'bash -s' < scripts/ops/do/02_prepare_runtime.sh
```

### Step 3: Configure Production Secrets
```bash
# SSH to droplet
ssh deploy@<DROPLET_IP>

# Edit secrets (as root)
sudo nano /opt/titan/compose/.env.prod

# Replace ALL __CHANGE_ME__ values with production secrets
```

### Step 4: Copy Compose Files
```bash
# From local machine
scp docker-compose.prod.yml deploy@<DROPLET_IP>:/opt/titan/
scp -r config/ deploy@<DROPLET_IP>:/opt/titan/
scp -r monitoring/ deploy@<DROPLET_IP>:/opt/titan/
scp -r scripts/ deploy@<DROPLET_IP>:/opt/titan/
```

### Step 5: First Deploy
```bash
# On droplet
cd /opt/titan
./scripts/ops/do/03_deploy_release.sh latest
```

### Step 6: Verify
```bash
./scripts/ops/do/04_verify.sh
```

---

## 2. Routine Operations

### View Logs
```bash
# All services
docker compose -f /opt/titan/docker-compose.prod.yml logs -f

# Specific service
docker logs -f titan-brain
docker logs -f titan-execution
```

### Restart Service
```bash
docker restart titan-brain
docker restart titan-execution
```

### Check Status
```bash
docker ps
./scripts/ops/do/04_verify.sh
```

### Manual Backup
```bash
./scripts/ops/do/05_backup.sh full
```

---

## 3. Monitoring

### Health Endpoints (Internal)
```bash
curl http://localhost:3100/health   # Brain
curl http://localhost:3002/health   # Execution  
curl http://localhost:8222/healthz  # NATS
```

### Database Check
```bash
docker exec titan-postgres pg_isready
docker exec titan-redis redis-cli ping
```

### Resource Usage
```bash
docker stats --no-stream
htop
df -h
```

---

## 4. Emergency Procedures

### HALT Trading
```bash
docker exec titan-nats nats pub titan.cmd.sys.halt \
  '{"state":"HARD_HALT","reason":"Manual halt","timestamp":'$(date +%s)'}'
```

### Emergency Rollback
```bash
./scripts/ops/do/07_rollback.sh
```

### Stop All Services
```bash
cd /opt/titan
docker compose -f docker-compose.prod.yml down
```

### Start All Services
```bash
cd /opt/titan
docker compose -f docker-compose.prod.yml \
  --env-file /opt/titan/compose/.env.prod up -d
```

---

## 5. Maintenance

### Secret Rotation
1. Update secrets in `/opt/titan/compose/.env.prod`
2. Restart affected services:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --force-recreate
   ```

### TLS Certificate Renewal
Automatic via Traefik/Let's Encrypt. Verify:
```bash
echo | openssl s_client -connect titan.peycheff.com:443 2>/dev/null | \
  openssl x509 -noout -dates
```

### OS Updates
```bash
sudo apt update && sudo apt upgrade -y
```

### Docker Cleanup
```bash
docker system prune -af --volumes  # DANGER: Removes unused data
```

---

## File Structure Reference

```
/opt/titan/
├── compose/
│   ├── .env.prod          # Production secrets (chmod 600)
│   └── acme.json          # TLS certificates (chmod 600)
├── current/               # Symlink to active release
├── releases/              # Immutable release directories
│   └── <sha>/
├── scripts/               # Ops scripts
├── logs/                  # Deployment logs
├── state/                 # Lock files
├── docker-compose.prod.yml
├── config/
└── monitoring/
```

---

## Contact & Escalation

- **On-Call**: [Your contact here]
- **GitHub Repo**: github.com/peycheff-com/titan-trading-system
- **Monitoring**: Grafana at http://titan-grafana:3000 (internal)
