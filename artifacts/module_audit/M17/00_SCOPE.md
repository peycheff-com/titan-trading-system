# Module: M17

## Identity
- **Name**: Deployment and Infrastructure
- **Purpose**: CI/CD pipelines, Docker Compose orchestration, VPS provisioning, deployment scripts, configuration management, posture controls
- **Architectural plane**: Infrastructure

## Code Packages (exhaustive)
- `docker-compose*.yml` (7 files) — base, dev, prod, test, micro, gpu, secrets overlay
- `scripts/deploy_prod.sh`, `scripts/rollback.sh`, `scripts/smoke_prod.sh`, `scripts/wait-for-health.sh`, `scripts/boot_prod_like.sh`, `scripts/setup-vps.sh` — deployment/ops scripts
- `scripts/validate-configs.ts` — configuration validation
- `.github/workflows/` — `ci.yml`, `deploy-prod.yml`, `quality-gate.yml`, `reusable-node.yml`, `reusable-rust.yml`, `autophagy.yml`, `chaos.yml`, `docs-lint.yml`, `deploy_docs.yml`, `ai-doc-regen.yml`
- `.github/actions/setup/action.yml` — composite setup action
- `config/deployment/` — `production.env`, `staging.env`, `development.env`, `infrastructure.env`
- `config/postures/` — `constrained_alpha.env`, `micro_capital.env`
- `config/nats.conf`, `config/nats.conf.template`, `config/nats-entrypoint.sh`, `config/redis-secure.conf`, `config/traefik_dynamic.yml`
- `infra/monitoring/prometheus.yml` — Prometheus scrape config
- `infra/cron/titan-backups.cron` — production backup schedule
- `.github/CODEOWNERS` — file ownership

## File Inventory

### Docker Compose (7 files)
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base development stack (NATS, PG, Redis, Brain, Monitoring) |
| `docker-compose.dev.yml` | Full dev stack with execution + console |
| `docker-compose.prod.yml` | Production stack with Traefik, image references |
| `docker-compose.test.yml` | Lightweight test infra (NATS + PG on tmpfs) |
| `docker-compose.micro.yml` | Micro-capital deployment with resource limits |
| `docker-compose.gpu.yml` | Self-hosted AI (vLLM + nginx) |
| `docker-compose.secrets.yml` | Docker Secrets overlay for prod |

### Deployment Scripts (6 files)
| File | Purpose |
|------|---------|
| `scripts/deploy_prod.sh` | Production deployment (pull → stop → migrate → start → smoke) |
| `scripts/rollback.sh` | Tag-based rollback |
| `scripts/smoke_prod.sh` | Post-deploy smoke tests |
| `scripts/wait-for-health.sh` | Healthcheck polling loop |
| `scripts/boot_prod_like.sh` | Posture-based prod-like boot |
| `scripts/setup-vps.sh` | Ubuntu 24.04 VPS provisioning |

### CI/CD Workflows (10 files)
| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Main CI: changes detection, preflight, node/rust build, security scan |
| `.github/workflows/deploy-prod.yml` | CD: build images, push to GHCR, SSH deploy to VPS |
| `.github/workflows/quality-gate.yml` | Quality OS plan/run/fix pipeline |
| `.github/workflows/reusable-node.yml` | Reusable Node.js CI job |
| `.github/workflows/reusable-rust.yml` | Reusable Rust CI job |
| `.github/workflows/autophagy.yml` | Self-test workflow |
| `.github/workflows/chaos.yml` | Chaos engineering drills |
| `.github/workflows/docs-lint.yml` | Documentation linting |
| `.github/workflows/deploy_docs.yml` | Docs site deployment |
| `.github/workflows/ai-doc-regen.yml` | AI doc regeneration |

### Configuration (12 files)
| File | Purpose |
|------|---------|
| `config/nats.conf` | NATS server config with ACLs per service |
| `config/nats.conf.template` | NATS config template |
| `config/redis-secure.conf` | Redis hardened config |
| `config/traefik_dynamic.yml` | Traefik routing rules |
| `config/deployment/*.env` (4) | Per-environment deploy configs |
| `config/postures/*.env` (2) | Risk posture definitions |

## Boundaries
- **Inputs**: Git push events, manual workflow dispatch, SSH credentials, Docker registry
- **Outputs**: Running containers, CI artifacts, deployment evidence, SBOM
- **Dependencies**: Docker, Docker Compose, GitHub Actions, DigitalOcean VPS, GHCR
- **Non-goals**: Application-level logic, exchange connectivity, strategy code
