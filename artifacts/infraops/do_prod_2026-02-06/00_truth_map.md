# Phase 0: Repository Reality Map

**Date**: 2026-02-06  
**Operator**: InfraOps Agent

---

## 1. Production Docker Compose Stack

**File**: `docker-compose.prod.yml` (506 lines)

### Services (15 total)

| Service | Image | Ports | Health Check | Notes |
|---------|-------|-------|--------------|-------|
| traefik | traefik:v3.0 | 80:80, 443:443 | - | Reverse proxy with Let's Encrypt |
| nats | nats:2.10.24-alpine | VPC:4222, VPC:8222 | `/healthz` | JetStream enabled |
| redis | redis:7.4-alpine | 6379:6379 | `redis-cli ping` | Cache |
| postgres | postgres:16-alpine | 5432:5432 | `pg_isready` | Primary persistence |
| prometheus | prom/prometheus:v2.54.1 | 9090:9090 | - | Metrics |
| grafana | grafana/grafana:11.2.0 | 3000:3000 | - | Dashboards |
| titan-tempo | grafana/tempo:2.6.0 | 14268,3200,4317,4318 | - | Tracing |
| titan-brain | GHCR/titan-brain | - | `/health:3100` | Master orchestrator |
| titan-execution | GHCR/titan-execution-rs | - | `/health:3002` | Rust exchange connector |
| titan-console | GHCR/titan-console | - | `/` | UI (routed via Traefik) |
| titan-console-api | GHCR/titan-console-api | - | `/health:3000` | Console BFF |
| titan-opsd | GHCR/titan-opsd | - | - | Ops daemon (Docker control) |
| titan-scavenger | GHCR/titan-phase1-scavenger | - | `/health:8081` | Phase 1 |
| titan-hunter | GHCR/titan-phase2-hunter | - | `/health:8083` | Phase 2 |
| titan-sentinel | GHCR/titan-phase3-sentinel | - | `/health:8084` | Phase 3 |
| titan-ai-quant | GHCR/titan-ai-quant | - | `/health:8082` | AI optimization |
| titan-powerlaw-lab | GHCR/titan-powerlaw-lab | - | - | Power law modeling |

### Network Architecture
- **Network**: `titan-network` (bridge driver)
- **IPC Volume**: `titan-ipc` (shared /tmp for Unix socket IPC)
- **External exposure**: Only Traefik exposes ports 80/443 to host
- **Internal exposure**: NATS binds to `${VPC_IP:-127.0.0.1}` (localhost by default)

### Volumes (9 total)
- `traefik-certs` - ACME certificates
- `titan-ipc` - IPC between services
- `titan-ai-data` - AI Quant data
- `titan-redis-data` - Redis persistence
- `titan-db-data` - PostgreSQL data
- `titan-prometheus-data` - Prometheus TSDB
- `titan-grafana-data` - Grafana state
- `titan-tempo-data` - Tempo traces
- `titan-jetstream-data` - NATS JetStream

### Traefik TLS Configuration
- **Method**: HTTP-01 challenge (port 80)
- **ACME Email**: `${ACME_EMAIL:-admin@example.com}`
- **Certificate Storage**: `/letsencrypt/acme.json`
- **HTTP→HTTPS Redirect**: Enabled
- **Domain Routing**: `Host(\`${DOMAIN:-localhost}\`)` → titan-console:8080

---

## 2. CI/CD Pipeline

### CI Workflow: `.github/workflows/ci.yml` (531 lines)

**Triggers**: push (main, develop, codex/**), PR, merge_group, nightly schedule

**Jobs**:
1. `changes` - Detect affected paths
2. `preflight` - Config validation, contract drift, hygiene checks
3. `node-services` - Build, lint, test Node services (Turbo)
4. `rust-services` - Build, lint, test Rust services
5. `security-scan` - npm audit, cargo audit
6. `nightly-security` - Full audits + SBOM generation
7. `status-check` - Aggregated gate

**Toolchain Versions**:
- Node: 22.19.0
- npm: 11.6.2
- Rust: 1.89.0

### Deploy Workflow: `.github/workflows/deploy-prod.yml` (269 lines)

**Trigger**: CI workflow success on main OR manual dispatch

**Jobs**:
1. `ci-check` - Verify CI passed
2. `readiness-gate` - Run `scripts/ci/gatekeeper.ts`
3. `build-and-push` - Build 8 Docker images → GHCR (SHA + latest tags)
4. `deploy-production` - SSH deploy to Droplet

**Built Images** (8):
- titan-brain
- titan-execution-rs
- titan-console
- titan-phase1-scavenger
- titan-phase2-hunter
- titan-phase3-sentinel
- titan-ai-quant
- titan-powerlaw-lab

**Deployment Method**:
1. Build images → GHCR with digest
2. Sign digest manifest with `TITAN_RELEASE_KEY`
3. SCP package to `/opt/titan/tmp_deploy_$SHA`
4. Execute `deploy.sh` via SSH
5. Verify with `verify.sh`

### Required GitHub Secrets
| Secret | Purpose | Status |
|--------|---------|--------|
| `PROD_SSH_HOST` | Droplet IP/hostname | ⚠️ Needs new value |
| `PROD_SSH_USER` | SSH user (e.g., deploy) | ⚠️ Needs new value |
| `PROD_SSH_KEY` | SSH private key | ⚠️ Needs new value |
| `TITAN_RELEASE_KEY` | Release signing key | ✅ Exists |
| `GITHUB_TOKEN` | GHCR push (auto) | ✅ Automatic |

---

## 3. Ops Scripts

### Deploy Script: `scripts/ci/deploy.sh` (179 lines)
- **Location on host**: Copied to `/opt/titan/tmp_deploy_$SHA/scripts/`
- **Features**:
  - Deployment locking (flock)
  - Provenance verification (signature check)
  - Digest override generation for immutable deploys
  - Database migrations
  - Atomic symlink switch (`/opt/titan/current`)
  - Post-deploy verification
  - Auto-rollback on failure
- **Disarm Safety**: Line 124 sets `TITAN_MODE=DISARMED`

### Verify Script: `scripts/ci/verify.sh` (121 lines)
- Container status check
- Health endpoint checks (NATS, Brain, Execution, Scavenger, Hunter)
- Policy hash parity verification

### Rollback Script: `scripts/ops/rollback.sh` (112 lines)
- HARD_HALT signal via NATS
- Orderly service shutdown/restart
- Optional version rollback

### Backup Script: `scripts/ops/backup-production.sh` (221 lines)
- JetStream volume snapshots (DO API)
- PostgreSQL pg_dump → gzip
- Redis RDB snapshot
- Upload to DO Spaces

---

## 4. Environment Configuration

### Production Env Files
- `.env.example` (177 lines) - Template with `__CHANGE_ME__` placeholders
- `production.env` (189 lines) - Production template (⚠️ contains placeholder secrets)
- `.env.prod` (884 bytes) - Actual production secrets (referenced in deploy)

### Required Secrets (Critical)
```
TITAN_MASTER_PASSWORD       # Console/Grafana admin
HMAC_SECRET                 # Command signing
JWT_SECRET                  # Console API auth
BINANCE_API_KEY/SECRET      # Exchange credentials
NATS_*_PASSWORD             # 9 NATS user passwords
TITAN_DB_PASSWORD           # Postgres password
ACME_EMAIL                  # Let's Encrypt contact
DOMAIN                      # titan.peycheff.com
```

### NATS Authentication
- Config template: `config/nats.conf.template`
- 9 users: sys, brain, execution, scavenger, hunter, sentinel, powerlaw, quant, console
- Passwords injected via environment at runtime

---

## 5. DNS and Domain Assumptions

**Target Domain**: `titan.peycheff.com`

**Expected Routes**:
- `https://titan.peycheff.com/` → Titan Console UI
- API routing: Currently via SPA proxy to `titan-console-api:3000` (internal)

**Traefik Labels** (docker-compose.prod.yml L293-298):
```yaml
- traefik.http.routers.console.rule=Host(`${DOMAIN:-localhost}`)
- traefik.http.routers.console.entrypoints=websecure
- traefik.http.routers.console.tls.certresolver=letsencrypt
- traefik.http.services.console.loadbalancer.server.port=8080
```

---

## 6. Gap Analysis

### Critical Gaps (Must Fix)

| ID | Gap | Impact | Resolution |
|----|-----|--------|------------|
| G1 | No host provisioning scripts | Cannot recreate Droplet from scratch | Create `scripts/ops/do/` scripts |
| G2 | No DO Firewall configuration | Security risk | Document/script firewall rules |
| G3 | No SSH hardening script | Security risk | Create bootstrap script |
| G4 | GitHub secrets need update | Deploy will fail | Configure new Droplet secrets |
| G5 | No DNS automation | Manual A record needed | Document in runbook |

### Already Present (Good)

| Feature | Status | File |
|---------|--------|------|
| Immutable deploys (digest pinning) | ✅ | deploy.sh |
| Provenance verification | ✅ | provenance.ts |
| Disarm-by-default | ✅ | deploy.sh L124 |
| Atomic rollback | ✅ | deploy.sh, rollback.sh |
| Database backups | ✅ | backup-production.sh |
| Health checks | ✅ | docker-compose.prod.yml |
| TLS via Let's Encrypt | ✅ | docker-compose.prod.yml |
| Restart policies | ✅ | All services have `restart: unless-stopped` |

### Hardening Opportunities

| ID | Item | Current | Recommended |
|----|------|---------|-------------|
| H1 | NATS ports | VPC_IP bind | ✅ Already localhost-bound |
| H2 | Postgres/Redis ports | Host-exposed | Move to internal-only |
| H3 | Prometheus/Grafana | Host-exposed | Move behind Traefik auth |
| H4 | Log rotation | Not configured | Add json-file limits |
| H5 | Console API image | Missing from build matrix | Add titan-console-api build |
| H6 | Opsd image | Missing from build matrix | Add titan-opsd build |

---

## 7. File Reference Index

| File | Purpose | Lines |
|------|---------|-------|
| `docker-compose.prod.yml` | Production stack | 506 |
| `.github/workflows/ci.yml` | CI pipeline | 531 |
| `.github/workflows/deploy-prod.yml` | Deploy pipeline | 269 |
| `scripts/ci/deploy.sh` | Atomic deploy | 179 |
| `scripts/ci/verify.sh` | Post-deploy checks | 121 |
| `scripts/ops/rollback.sh` | Emergency rollback | 112 |
| `scripts/ops/backup-production.sh` | Backup procedure | 221 |
| `config/nats.conf.template` | NATS auth config | 94 |
| `.env.example` | Env template | 177 |
| `production.env` | Production env template | 189 |
| `config/traefik_dynamic.yml` | Traefik middlewares | 23 |

---

## Conclusion

The repository has a **mature deployment system** with provenance verification, digest pinning, and atomic switching. The main gap is **host provisioning** - there are no scripts to create and configure a new DigitalOcean Droplet from scratch. The existing scripts assume the host is already prepared with:

- Docker + Docker Compose installed
- `/opt/titan` directory structure
- `.env.prod` with production secrets
- SSH access configured for deploy user

**Next Step**: Phase 1 - Research DigitalOcean provisioning and hardening best practices.
