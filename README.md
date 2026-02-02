# Titan Trading System

[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen)](https://github.com/peycheff-com/titan-trading-system/actions)
[![Coverage](https://img.shields.io/badge/Coverage-80%25%2B-brightgreen)](https://github.com/peycheff-com/titan-trading-system/actions)
[![Valuation](https://img.shields.io/badge/Valuation-%243.8M--%249.0M-blue)](artifacts/valuation/reports/titan_ip_valuation_report.md)

**Bio-Mimetic Trading Organism** — A 5-phase algorithmic trading system that
evolves its behavior based on available capital, orchestrated by a central "Brain"
and executed via specialized microservices with sub-millisecond latency.

---

## Intended Use & Legal Positioning

Titan is built primarily for **research, backtesting, and internal evaluation**. Live trading
is supported for **authorized operators** only when all applicable regulatory, risk, and security
requirements are satisfied. This repository does **not** provide legal advice or licensing.

Permitted use cases include:
- Research and simulation (offline)
- Paper trading / sandbox exchange testing
- Production trading by approved operators within compliant jurisdictions

See `docs/operations/legal-and-compliance.md` for compliance posture, approvals, and jurisdictional considerations.

## Key Features

- **Holographic Market Analysis**: Real-time market structure scanning using `titan-phase2-hunter`.
- **Bio-Mimetic Orchestration**: Centralized "Brain" using Active Inference to manage risk and capital.
- **Sub-Millisecond Execution**: Rust-based engine (`titan-execution-rs`) for ultra-low latency order routing.
- **Genetic Optimization**: `titan-ai-quant` utilizing Google Gemini 2.0 Flash for parameter evolution.
- **Institutional-Grade Risk**: Real-time circuit breakers, drawdown protection, and "Truth Layer" verification.
- **Sovereign Infrastructure**: Self-hosted on DigitalOcean with full data ownership and zero external dependencies.

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

## Research and Strategy Promotion

Strategy research, validation, and rollout follow a documented workflow:
see `docs/operations/research-workflow.md` for research → backtest → review → rollout
and AI Quant validation requirements.

## Services

| Service                   | Description                            | Technology                      | Status |
| ------------------------- | -------------------------------------- | ------------------------------- | ------ |
| `titan-brain`             | Master Orchestrator & Risk Guardian    | TS, Fastify, Active Inference   | 🟢 Prod |
| `titan-execution-rs`      | High-performance Order Engine          | **Rust**, Actix, Redb, NATS     | 🟢 Prod |
| `titan-phase1-scavenger`  | Trap detection & Signal generation     | TypeScript                      | 🟢 Prod |
| `titan-phase2-hunter`     | Holographic analysis engine            | TypeScript                      | 🟢 Prod |
| `titan-phase3-sentinel`   | Basis arbitrage & Market Neutral       | TypeScript                      | 🟢 Prod |
| `titan-ai-quant`          | AI parameter optimization              | TypeScript, Gemini AI           | 🟢 Prod |
| `titan-console`           | Operator Control Plane                 | React, Vite, TailwindCSS        | 🟢 Prod |
| `titan-backtesting`       | Simulation & Strategy Validation       | TypeScript                      | 🟢 Prod |
| `titan-powerlaw-lab`      | Power Law & Fractal Research           | TypeScript                      | 🟡 Beta |
| `@titan/shared`           | Common infrastructure library          | TypeScript                      | 🟢 Prod |

## Technology Stack

| Layer                | Technology                                  | Key Features |
| -------------------- | ------------------------------------------- | ------------ |
| **Execution Engine** | Rust (Actix-web, Tokio)                     | Redb Persistence, Shadow State, Sub-ms Latency |
| **Backend Services** | Node.js 22+, TypeScript, Fastify            | Active Inference, Hot Risk Reload, Zod Validation |
| **Event Bus**        | NATS JetStream                              | Persistent Streams, Request-Reply |
| **Database**         | PostgreSQL 16+                              | TimescaleDB (optional), Relational Data |
| **Frontend**         | React, Vite, TailwindCSS                    | Real-time WebSockets, Recharts |
| **AI/ML**            | Google Gemini 2.0 Flash                     | Parameter Optimization, Market Analysis |
| **Deployment**       | DigitalOcean Droplet (VPS) + Docker Compose | Secrets Management, Restart Policies |
| **IPC**              | Unix Domain Sockets (FastPath)              | Low-latency local comms |

## Quick Start

### Prerequisites

- **Node.js:** v22+
- **Rust:** 1.75+ (for execution engine)
- **PostgreSQL:** Local instance or VPS
- **NATS Server:** JetStream enabled (optional for local dev if using Docker)
- **Docker + Docker Compose:** Recommended for local stack parity

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
# Start the local development stack (parity with production topology)
# This spins up Postgres, Redis, NATS, Brain, Execution, Console
docker compose -f docker-compose.dev.yml up -d

# Or start individual services for development
npm run start:brain       # Titan Brain on :3100
npm run start:execution   # Rust Engine on :3002
npm run start:console     # Dashboard on :5173
```

Note: `docker-compose.yml` includes only NATS for lightweight local use. Use `docker-compose.dev.yml`
for full local stack parity.

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
For production, prefer Docker secrets or Vault and use `*_FILE` environment variables
to load secrets from mounted files (see `docs/operations/secrets-management.md`).

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

## Contracts

- NATS Intent Schema (v1): `docs/contracts/nats-intent.v1.schema.json`
- Contract overview: `docs/contracts/nats-intent.md`

## Monitoring

| Endpoint   | Description            |
| ---------- | ---------------------- |
| `/health`  | Service health status  |
| `/metrics` | Prometheus metrics     |
| `/status`  | Detailed system status |

## Deployment

Deployment is managed **manually** on a DigitalOcean Droplet (VPS) using Docker Compose. We have migrated away from DigitalOcean App Platform.
Production deployment is intended for **authorized operators** only. Ensure compliance review is completed
before going live (see `docs/operations/legal-and-compliance.md`).

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

Optional secrets overlay:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.secrets.yml up -d
```

## Project Structure

```
titan/
├── apps/
│   └── titan-console/         # React dashboard
├── services/
│   ├── titan-brain/           # Central orchestrator
│   ├── titan-execution-rs/    # Rust execution engine
│   ├── titan-phase1-scavenger/
│   ├── titan-phase2-hunter/
│   ├── titan-phase3-sentinel/
│   ├── titan-ai-quant/
│   ├── titan-powerlaw-lab/    # Power Law Research
│   └── canonical-powerlaw-service/
├── packages/
│   ├── shared/                # Common library (@titan/shared)
│   ├── titan-backtesting/     # Simulation engine
│   └── titan-harness/         # Test harness
├── config/                    # Configuration files
├── scripts/                   # Operational scripts
├── docs/                      # Documentation
└── monitoring/                # Prometheus/Grafana
```

## Repo Hygiene

This repository maintains Tier-1 production standards via automated enforcement:

| Gate | Status | Description |
|------|--------|-------------|
| Dead Code (knip) | ✅ | Zero unused files enforced in CI |
| Zombie Dependencies | ✅ | npm/cargo unused deps check |
| Security Scan | ✅ | npm audit + cargo audit |
| Contract Drift | ✅ | Schema validation gate |
| Config Validation | ✅ | Runtime config verification |

**Audit Reports:**
- [Repo Hygiene Report](docs/repo-hygiene-report.md)
- [Deletion Ledger](docs/deletion-ledger.md)
- [Integration Verification](docs/integration-verification.md)

*Last hygiene audit: 2026-02-02*

## License

Proprietary software. All rights reserved.

## Disclaimer

This software is provided for educational and research purposes by default. Live trading
is only permitted for authorized operators who have completed legal and compliance review.
Trading cryptocurrencies involves substantial risk of loss. Past performance does not
guarantee future results. Nothing here is investment, legal, or tax advice.

---

**Built with ❤️ by the Mindburn Labs**
