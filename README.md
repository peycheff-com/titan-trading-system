# Titan Trading System

**Bio-Mimetic Trading Organism** — A 5-phase algorithmic trading system that
evolves its behavior based on available capital, orchestrated by a central "Brain"
and executed via specialized microservices with sub-millisecond latency.

[![DigitalOcean](https://img.shields.io/badge/DigitalOcean-Droplet-0080FF)](https://digitalocean.com)
[![Node.js](https://img.shields.io/badge/Node.js-22+-43853D)](https://nodejs.org)
[![Rust](https://img.shields.io/badge/Rust-1.75+-000000)](https://rust-lang.org)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       TITAN BRAIN (Phase 5)                     │
│       Capital Allocation │ Risk Management │ Coordination       │
└─────────────────────────────────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│   PHASE 1      │    │   PHASE 2      │    │   PHASE 3      │
│   Scavenger    │    │   Hunter       │    │   Sentinel     │
│   Trap System  │    │   Holographic  │    │   Basis Arb    │
└────────────────┘    └────────────────┘    └────────────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               TITAN EXECUTION-RS (Rust Engine)                  │
│     Sub-ms Latency │ Order Routing │ Position Management        │
└─────────────────────────────────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│   AI QUANT     │    │   CONSOLE      │    │   NATS         │
│   Gemini AI    │    │   React/Vite   │    │   JetStream    │
│   Optimizer    │    │   Dashboard    │    │   Event Bus    │
└────────────────┘    └────────────────┘    └────────────────┘
```

## Trading Phases

| Phase | Name      | Capital Range | Description                                 | Leverage |
| ----- | --------- | ------------- | ------------------------------------------- | -------- |
| 1     | Scavenger | $200 – $5K    | High leverage trap system / Scalping        | 15-20x   |
| 2     | Hunter    | $2.5K – $50K  | Holographic market structure analysis       | 3-5x     |
| 3     | Sentinel  | $50K+         | Market-neutral basis arbitrage              | 1-3x     |
| 4     | AI Quant  | —             | Gemini AI parameter optimization & Research | —        |
| 5     | Brain     | All           | Master orchestrator & Risk Management       | —        |

## Services

| Service                   | Description                            | Technology                      |
| ------------------------- | -------------------------------------- | ------------------------------- |
| `titan-brain`             | Central orchestrator & risk management | TypeScript, Fastify, PostgreSQL |
| `titan-execution-rs`      | High-performance order execution       | **Rust**, Actix, NATS           |
| `titan-phase1-scavenger`  | Trap detection & signal generation     | TypeScript                      |
| `titan-phase2-hunter`     | Holographic analysis engine            | TypeScript                      |
| `titan-phase3-sentinel`   | Basis arbitrage engine                 | TypeScript                      |
| `titan-ai-quant`          | AI parameter optimization              | TypeScript, Gemini AI           |
| `titan-powerlaw-lab`      | Power Law research & fractal analysis  | TypeScript / Experimental       |
| `titan-console`           | Web monitoring dashboard               | React, Vite, TailwindCSS        |
| `@titan/shared`           | Common infrastructure library          | TypeScript                      |

## Technology Stack

| Layer                | Technology                                  |
| -------------------- | ------------------------------------------- |
| **Execution Engine** | Rust (sub-millisecond latency)              |
| **Backend Services** | Node.js 22+, TypeScript, Fastify            |
| **Event Bus**        | NATS JetStream                              |
| **Database**         | PostgreSQL (Self-hosted on VPS)             |
| **Frontend**         | React, Vite, TailwindCSS                    |
| **AI/ML**            | Google Gemini 2.0 Flash                     |
| **Deployment**       | DigitalOcean Droplet (VPS) + Docker Compose |
| **IPC**              | Unix Domain Sockets (FastPath)              |

## Quick Start

### Prerequisites

- **Node.js:** v22+
- **Rust:** 1.75+ (for execution engine)
- **PostgreSQL:** Local instance or VPS
- **NATS Server:** JetStream enabled (optional for local dev if using Docker)

### Installation

```bash
# Clone repository
git clone https://github.com/peycheff-com/titan-trading-system.git
cd titan-trading-system

# Install all dependencies (Monorepo)
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials (DB, NATS, Exchanges)
```

### Development

```bash
# Start all services locally (via Docker Compose)
# This spins up Postgres, NATS, Brain, Execution, Console, etc.
docker compose up -d

# Or start individual services for development
npm run start:brain       # Titan Brain on :3100
npm run start:execution   # Rust Engine on :3002
npm run start:console     # Dashboard on :5173
```

### Build

```bash
# Build all TypeScript services
npm run build --workspaces

# Build Rust execution engine
cd services/titan-execution-rs && cargo build --release

# Quality Checks
npm run lint:all    # Lint all services
npm run test:all    # Test all services
```

## Configuration

### Environment Variables

Configuration is primarily managed via `.env` files. Access is unified via `@titan/shared`.

```bash
# Core
NODE_ENV=production
DEPLOYMENT_ENVIRONMENT=production

# Database (Self-Hosted)
TITAN_DB_HOST=titan-postgres
TITAN_DB_PORT=5432
TITAN_DB_NAME=titan_brain
TITAN_DB_USER=titan
TITAN_DB_PASSWORD=titan_secret

# NATS
NATS_URL=nats://localhost:4222

# Security
HMAC_SECRET=your_webhook_secret
TITAN_HMAC_SECRET=your_ipc_secret

# Exchange APIs
BYBIT_API_KEY=your_key
BYBIT_API_SECRET=your_secret
```

## Security

- **HMAC Authentication** — All webhooks and IPC signed with HMAC-SHA256
- **Rate Limiting** — Adaptive rate limiting per IP
- **Input Validation** — Zod schema validation on all inputs
- **TLS Encryption** — All external traffic encrypted
- **Visual Confirmation** — "Truth Layer" verification of trade execution

## Monitoring

| Endpoint   | Description            |
| ---------- | ---------------------- |
| `/health`  | Service health status  |
| `/metrics` | Prometheus metrics     |
| `/status`  | Detailed system status |

## Deployment

Deployment is managed **manually** on a DigitalOcean Droplet (VPS) using Docker Compose. We have migrated away from DigitalOcean App Platform.

1. **SSH into the server**:
   ```bash
   ssh deploy@<droplet-ip>
   ```

2. **Navigate to project**:
   ```bash
   cd /opt/titan
   ```

3. **Update and Restart**:
   ```bash
   git pull origin main
   docker-compose -f docker-compose.prod.yml up -d --build --remove-orphans
   ```

## Project Structure

```
titan/
├── services/
│   ├── titan-brain/           # Central orchestrator
│   ├── titan-execution-rs/    # Rust execution engine
│   ├── titan-phase1-scavenger/
│   ├── titan-phase2-hunter/
│   ├── titan-phase3-sentinel/
│   ├── titan-ai-quant/
│   ├── titan-powerlaw-lab/    # Power Law Research & Experiments
│   ├── titan-console/         # React dashboard
│   └── shared/                # Common library
├── config/                    # Configuration files
├── scripts/                   # Operational scripts
├── docs/                      # Documentation
└── monitoring/                # Prometheus/Grafana
```

## License

Proprietary software. All rights reserved.

## Disclaimer

This software is for educational and research purposes only. Trading
cryptocurrencies involves substantial risk of loss. Past performance does not
guarantee future results.

---

**Built with ❤️ by the Mindburn Labs**
