# Phase 2: Architecture Decisions

**Date**: 2026-02-06  
**Decision Status**: LOCKED

---

## Decision A: Deployment Model

### Choice: GHCR + SSH (Keep Existing)

**Decision**: Build images in GitHub Actions, push to GHCR with SHA tags, deploy via SSH to Droplet.

**Rationale**:
- Existing CI/CD pipeline already implements this pattern well
- Provenance signing and digest verification in place
- Atomic symlink switching works correctly
- No need to change what works

**Implementation**:
- Image tags: `ghcr.io/peycheff-com/titan-trading-system/<service>:<git_sha>`
- Also push `:latest` for convenience (but deploy uses SHA)
- Droplet pulls from GHCR (public images, no auth needed)

---

## Decision B: TLS Method

### Choice: HTTP-01 Challenge

**Decision**: Use Let's Encrypt HTTP-01 challenge via Traefik.

**Rationale**:
- Already configured in docker-compose.prod.yml
- No DNS provider API needed
- Simpler to manage
- Works for single domain (titan.peycheff.com)

**Implementation**:
- Traefik listens on 80/443
- ACME email: `admin@peycheff.com` (via ACME_EMAIL env var)
- Certificate storage: `traefik-certs` Docker volume
- Automatic HTTP→HTTPS redirect

**Not Using DNS-01 Because**:
- No wildcard certificates needed
- Would require DNS provider API token
- Additional complexity not justified

---

## Decision C: Routing Strategy

### Choice: Single Domain, Path-Based API

**Decision**: Route everything through `titan.peycheff.com`.

| Path | Target | Notes |
|------|--------|-------|
| `/` | titan-console:8080 | UI (SPA) |
| `/api/*` | Proxied by Console API | BFF pattern |
| `/health` (internal) | Service health endpoints | Not exposed |

**Rationale**:
- Console is the user-facing entry point
- API is accessed via BFF (titan-console-api)
- No need for separate API subdomain
- Simplifies TLS (single cert)

**Current Configuration** (already correct):
```yaml
titan-console:
  labels:
    - traefik.http.routers.console.rule=Host(`${DOMAIN:-localhost}`)
```

---

## Decision D: Secret Management

### Choice: Host-Level .env.prod (Operator-Managed)

**Decision**: Production secrets live in `/opt/titan/compose/.env.prod` on the Droplet, managed by operator (not CI).

**Rationale**:
- Secrets never transit through GitHub Actions logs
- CI only provides deployment package (no secrets)
- Operator responsible for secret lifecycle
- deploy.sh already symlinks to this file

**Layout**:
```
/opt/titan/
├── compose/
│   └── .env.prod          # Secrets (chmod 600, root-only)
├── current/               # Symlink to active release
├── releases/
│   └── <release-id>/      # Immutable release directories
├── scripts/               # Shared ops scripts
├── logs/                  # Deploy logs
└── state/                 # Lock files, state
```

**GitHub Secrets** (for CI/CD only):
| Secret | Purpose |
|--------|---------|
| `PROD_SSH_HOST` | Droplet IP |
| `PROD_SSH_USER` | Deploy user |
| `PROD_SSH_KEY` | SSH private key |
| `TITAN_RELEASE_KEY` | Release signing key (Ed25519) |

---

## Decision E: Droplet Specification

### Choice: s-4vcpu-8gb in AMS3

**Decision**: 
- **Size**: s-4vcpu-8gb (8GB RAM, 4 vCPUs, 160GB SSD)
- **Image**: Ubuntu 24.04 LTS
- **Region**: AMS3 (Amsterdam)
- **Features**: Monitoring enabled

**Rationale**:
- 15 services with resource limits (docker-compose.prod.yml)
- Total memory budget: ~6GB (with headroom)
- Amsterdam = low latency to European exchanges
- Ubuntu 24.04 = LTS, Docker support, security updates

---

## Decision F: Firewall Strategy

### Choice: DO Cloud Firewall (Primary) + UFW (Defense-in-Depth)

**Decision**: Use DigitalOcean Cloud Firewall as primary, UFW on host as backup.

**Inbound Rules**:
| Port | Protocol | Source | Service |
|------|----------|--------|---------|
| 22 | TCP | Operator IPs | SSH |
| 80 | TCP | All | HTTP (ACME) |
| 443 | TCP | All | HTTPS |

**Blocked**:
- All other ports (default deny)
- No exposure of: NATS (4222), Postgres (5432), Redis (6379), Grafana (3000), Prometheus (9090)

**Rationale**:
- Cloud Firewall = network edge, blocks before traffic hits VM
- UFW = host-level, defense in depth
- No legitimate reason for external access to internal services

---

## Decision G: Port Exposure Hardening

### Choice: Only Traefik Exposes Host Ports

**Current Issue**: docker-compose.prod.yml exposes:
- 6379:6379 (Redis)
- 5432:5432 (Postgres)
- 9090:9090 (Prometheus)
- 3000:3000 (Grafana)

**Decision**: Remove host port exposures for internal services.

**Before**:
```yaml
redis:
  ports:
    - '6379:6379'
```

**After**:
```yaml
redis:
  # No ports section - internal network only
```

**Services to Harden**:
- Redis: Remove port exposure
- Postgres: Remove port exposure  
- Prometheus: Remove port exposure (or add Traefik auth)
- Grafana: Add Traefik auth OR remove port exposure

**Rationale**:
- All Titan services communicate via Docker network (titan-network)
- No external access needed to these services
- Reduces attack surface significantly

---

## Decision H: Disarmed-by-Default

### Choice: TITAN_MODE=DISARMED (Already Implemented)

**Decision**: Keep existing implementation.

**Implementation** (scripts/ci/deploy.sh:124):
```bash
echo "TITAN_MODE=DISARMED" >> "$NEW_RELEASE/.env.deploy"
```

**Arming Procedure** (to be documented):
1. Verify all acceptance tests pass
2. Console API call to change mode
3. OR manual env update and restart

---

## Summary Table

| Decision | Choice | Status |
|----------|--------|--------|
| A: Deployment Model | GHCR + SSH | ✅ Locked |
| B: TLS Method | HTTP-01 | ✅ Locked |
| C: Routing | Single domain, path-based | ✅ Locked |
| D: Secrets | Host-level .env.prod | ✅ Locked |
| E: Droplet Spec | s-4vcpu-8gb, AMS3, Ubuntu 24.04 | ✅ Locked |
| F: Firewall | DO Cloud Firewall + UFW | ✅ Locked |
| G: Port Hardening | Internal-only for infra services | ✅ Locked |
| H: Disarmed Default | TITAN_MODE=DISARMED | ✅ Already done |

---

## Next Step

Phase 3: Implementation - Create provisioning scripts and apply port hardening.
