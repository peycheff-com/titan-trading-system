# Titan Trading System - Operational Documentation

This directory contains comprehensive operational documentation for deploying, configuring, monitoring, and maintaining the Titan Trading System in production environments (DigitalOcean VPS).

## Documentation Structure

```
docs/operations/
├── README.md                         # This file - Operations overview
├── legal-and-compliance.md           # Intended use, compliance posture
├── configuration-governance.md       # Config validation and change control
├── execution-routing.md              # Exchange routing & fan-out configuration
├── research-workflow.md              # Research to production promotion
├── data-governance.md                # Migrations and retention policy
├── secrets-management.md             # Docker secrets / Vault guidance
├── ha-strategy.md                    # HA and multi-node roadmap
├── monitoring-alerting.md            # SLOs, alerts, dashboards
├── ci-quality-gates.md               # CI matrix and merge gates
├── runbooks.md                       # Operational runbooks index
└── troubleshooting/                  # Troubleshooting and incident response
```

## Quick Start (Production)

### Prerequisites

All production deployments run on **DigitalOcean Droplets (VPS)** using Docker Compose.

1. **Infrastructure**:
   - DigitalOcean Droplet (Docker image recommended)
   - Minimum: 4GB RAM (8GB recommended for full Brain/AI stack)
   - Firewall: Allow only ports 22 (SSH), 80/443 (HTTP/S), and 5173 (Console if public)

2. **Dependencies (Pre-installed on Docker Droplet)**:
   - Docker Engine
   - Docker Compose v2+
   - Git

### Basic Deployment Trigger

In production, deployment is typically triggered via git pull + docker compose rebuild.

```bash
# 1. Access Server
ssh deploy@<droplet-ip>

# 2. Update Code
cd /opt/titan
git pull origin main

# 3. Rebuild & Restart
docker compose -f docker-compose.prod.yml up -d --build
```

## Service Architecture

The Titan Trading System consists of interconnected microservices managed by Docker:

### Core Services

1. **Titan Brain** (Port 3100)
   - Master orchestrator and decision maker
   - **Critical**: System cannot function without Brain

2. **Titan Execution** (Port 3002)
   - Order execution and position tracking
   - **Critical**: Required for all trading operations

3. **Titan Console** (Port 5173 usually)
   - Web-based monitoring dashboard
   - **Important**: Required for operational visibility

### Trading Phases

4. **Titan Scavenger** (Phase 1)
   - Trap detection & scalping
   - Runs as independent container

5. **Titan Hunter** (Phase 2)
   - Holographic market structure
   - Runs as independent container

6. **Titan Sentinel** (Phase 3)
   - Arb & Basis strategies

### Supporting Infrastructure

- **PostgreSQL**: Data persistence (Volume mapped)
- **NATS JetStream**: Event bus
- **Redis**: Caching (optional/status)

## Operational Responsibilities

### Daily Operations Team

**Trading Operations Manager**:
- Monitor system performanc via Console
- Manage risk parameters in `.env` or via Console overrides

**System Administrator**:
- Monitor Docker container health (`docker compose ps`)
- Ensure disk space for logs/DB is sufficient
- Manage `.env` secrets

### Key Performance Indicators (KPIs)

**System Reliability**:
- Uptime: >99.9%
- Signal processing latency: <100ms
- Database query response: <10ms

## Monitoring and Alerting

### Critical Alerts (Immediate Response Required)

1. **System Down**: Any core container exited (Brain, Execution, Postgres)
2. **Circuit Breaker Activated**: Trading halted due to risk limits
3. **Database Failure**: Postgres connection refused

### Warning Alerts

1. **High Latency**: Signal processing >200ms
2. **Disk Space**: <20% free space (Docker logs/volumes)

## Security Considerations

### Access Control

1. **SSH Hardening**: Key-based auth only, disable root login.
2. **Firewall**: UFW enable, allow specific ports only.
3. **Secrets**: `.env` file must be 600 permissions, owned by deploy user.

### Data Protection

1. **Backups**: Regular `pg_dump` of the postgres container.
2. **Logs**: Docker logging driver configured for rotation (max-size 10m).

## Disaster Recovery

### Recovery Time Objectives (RTO)
- **Critical Services**: 15 minutes (Container restart/rebuild)

### Backup Strategy
1. **Database**: Nightly `pg_dump` to external storage (e.g. Spaces).
2. **Config**: Git repository is the source of truth for code; `.env` is critical state.

## Getting Started

1. **Read the Root README**: [../../README.md](../../README.md)
2. **Review Environment**: Check `.env.example` versus production `.env`
3. **Check Logs**: `docker compose logs -f --tail=100`

## Further Reading

- `docs/operations/legal-and-compliance.md`
- `docs/operations/configuration-governance.md`
- `docs/operations/monitoring-alerting.md`
- `docs/operations/ha-strategy.md`

---

This operational documentation is maintained by the Titan Operations Team.
