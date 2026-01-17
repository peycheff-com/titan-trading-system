# Titan Trading System

## Project Overview

Titan is a **Bio-Mimetic Trading Organism** — a 5-phase algorithmic trading
system that evolves its behavior based on available capital. The system is
orchestrated by a central "Brain" and executed via specialized microservices
with sub-millisecond latency.

### Trading Phases

| Phase | Name      | Description                                 |
| ----- | --------- | ------------------------------------------- |
| 1     | Scavenger | High leverage trap system for small capital |
| 2     | Hunter    | Medium leverage holographic market analysis |
| 3     | Sentinel  | Low leverage market-neutral basis arbitrage |
| 4     | AI Quant  | Gemini AI parameter optimization            |
| 5     | Brain     | Master orchestrator for capital & risk      |

## Architecture

The system follows a microservices architecture within a monorepo:

| Service                  | Technology                   | Purpose                               |
| ------------------------ | ---------------------------- | ------------------------------------- |
| `titan-brain`            | Node.js, Fastify, PostgreSQL | Central orchestrator, risk management |
| `titan-execution-rs`     | **Rust**, Actix, NATS        | High-performance order execution      |
| `titan-phase1-scavenger` | TypeScript                   | Trap detection & signals              |
| `titan-phase2-hunter`    | TypeScript                   | Holographic analysis                  |
| `titan-phase3-sentinel`  | TypeScript                   | Basis arbitrage                       |
| `titan-ai-quant`         | TypeScript, Gemini AI        | Parameter optimization                |
| `titan-console`          | React, Vite                  | Web monitoring dashboard              |
| `@titan/shared`          | TypeScript                   | Common infrastructure                 |

## Prerequisites

- **Node.js:** v22+
- **Rust:** 1.75+ (for execution engine)
- **PostgreSQL:** Supabase or local instance
- **NATS:** JetStream for event streaming (optional locally)

## Quick Start

```bash
# Start all services
./start-titan.sh

# Or start individually
npm run start:brain       # Port 3100
npm run start:execution   # Port 3002
npm run start:console     # Port 5173
```

## Key Directories

| Path          | Description                      |
| ------------- | -------------------------------- |
| `services/`   | All microservice source code     |
| `config/`     | Centralized configuration        |
| `scripts/`    | Operational & deployment scripts |
| `docs/`       | Technical documentation          |
| `monitoring/` | Prometheus & Grafana configs     |
| `.do/`        | _Legacy_ App Platform configs    |

## Development

- **Monorepo:** npm workspaces, shared code in `services/shared`
- **IPC:** FastPath via Unix Domain Sockets with HMAC signing
- **Event Bus:** NATS JetStream for async communication
- **Database:** PostgreSQL (Supabase in production)

## Deployment

Deployment is managed manualy on a DigitalOcean Droplet (VPS) using Docker
Compose.

```bash
# SSH into the VPS
ssh user@titan-vps-ip

# Navigate to the project directory
cd /opt/titan

# Pull latest changes
git pull origin main

# Rebuild and restart services
docker-compose -f docker-compose.prod.yml up -d --build
```
