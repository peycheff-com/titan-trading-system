# Titan Trading System

[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen)](https://github.com/peycheff-com/titan-trading-system/actions)
[![Coverage](https://img.shields.io/badge/Coverage-80%25%2B-brightgreen)](https://github.com/peycheff-com/titan-trading-system/actions)

**Bio-Mimetic Trading Organism** — A 5-phase algorithmic trading system.

> [!TIP]
> **New to Titan? Start Here:**
> 👉 [**docs/start-here.md**](docs/start-here.md) — Navigation hub for Devs, Operators, and Researchers.
> 
> *   [Canonical Source of Truth](docs/system-source-of-truth.md)
> *   [Incident Runbook](docs/runbooks/incident_response.md)
> *   [Deployment Standard](docs/deployment-standard.md)

---

## Intended Use & Legal Positioning

Titan is built primarily for **research, backtesting, and internal evaluation**. Live trading
is supported for **authorized operators** only when all applicable regulatory, risk, and security
requirements are satisfied. This repository does **not** provide legal advice or licensing.

Permitted use cases include:
- Research and simulation (offline)
- Paper trading / sandbox exchange testing
- Production trading by approved operators within compliant jurisdictions

See `docs/explanation/legal-and-compliance.md` for compliance posture, approvals, and jurisdictional considerations.

## Key Features

- **Holographic Market Analysis**: Real-time market structure scanning using `titan-phase2-hunter`.
- **Bio-Mimetic Orchestration**: Centralized "Brain" using Active Inference to manage risk and capital.
- **Sub-Millisecond Execution**: Rust-based engine (`titan-execution-rs`) for ultra-low latency order routing.
- **Genetic Optimization**: `titan-ai-quant` utilizing Google Gemini 2.0 Flash for parameter evolution.
- **Institutional-Grade Risk**: Real-time circuit breakers, drawdown protection, and "Truth Layer" verification.
- **Identity & Forensics**: RBAC-enforced operations, Time Travel debugging, and immutable audit logs.
- **Sovereign Infrastructure**: Self-hosted on DigitalOcean with full data ownership and zero external dependencies.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full system topology, bio-mimetic design, and data flow diagrams.

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
see `docs/research/workflow.md` for research → backtest → review → rollout
and AI Quant validation requirements.

## Services

| Service                   | Description                            | Technology                      | Status |
| ------------------------- | -------------------------------------- | ------------------------------- | ------ |
| `titan-brain`             | Master Orchestrator & Risk Guardian    | TS, Fastify, Active Inference   | 🟢 Prod | [Docs](docs/components/titan-brain.md) |
| `titan-execution-rs`      | High-performance Order Engine          | **Rust**, Actix, Redb, NATS     | 🟢 Prod | [Docs](docs/components/titan-execution-rs.md) |
| `titan-phase1-scavenger`  | Trap detection & Signal generation     | TypeScript                      | 🟢 Prod | [Docs](docs/components/titan-phase1-scavenger.md) |
| `titan-phase2-hunter`     | Holographic analysis engine            | TypeScript                      | 🟢 Prod | [Docs](docs/components/titan-phase2-hunter.md) |
| `titan-phase3-sentinel`   | Basis arbitrage & Market Neutral       | TypeScript                      | 🟢 Prod | [Docs](docs/components/titan-phase3-sentinel.md) |
| `titan-ai-quant`          | AI parameter optimization              | TypeScript, Gemini AI           | 🟢 Prod | [Docs](docs/components/titan-ai-quant.md) |
| `titan-console`           | Operator Control Plane                 | React, Vite, TailwindCSS        | 🟢 Prod | [Docs](docs/components/titan-console.md) |
| `titan-backtesting`       | Simulation & Strategy Validation       | TypeScript                      | 🟢 Prod | |
| `titan-powerlaw-lab`      | Power Law & Fractal Research           | TypeScript                      | 🟡 Beta | [Docs](docs/components/titan-powerlaw-lab.md) |
| `@titan/shared`           | Common infrastructure library          | TypeScript                      | 🟢 Prod | [Docs](docs/components/shared.md) |

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

See [docs/dev/configuration.md](docs/dev/configuration.md) for the full environment variable catalog, secret management, and config file reference.

## Security

See [docs/security.md](docs/security.md) for the full threat model, AuthZ policy, secrets management, and security controls.

## Contracts

- NATS Intent Schema (v1): `docs/contracts/nats-intent.v1.schema.json`
- Contract overview: `docs/contracts/nats-intent.md`

## Monitoring

See [docs/operations/README.md](docs/operations/README.md) for dashboards, metrics endpoints, alerting rules, and troubleshooting guides.

## Deployment

See [docs/deployment-standard.md](docs/deployment-standard.md) for production deployment procedures, platform support, and container configuration.

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
- [Integration Verification](docs/dev/integration-verification.md)

*Last hygiene audit: 2026-02-10*

## License

Proprietary software. All rights reserved.

## Disclaimer

This software is provided for educational and research purposes by default. Live trading
is only permitted for authorized operators who have completed legal and compliance review.
Trading cryptocurrencies involves substantial risk of loss. Past performance does not
guarantee future results. Nothing here is investment, legal, or tax advice.

---

**Built with ❤️ by the Mindburn Labs**
