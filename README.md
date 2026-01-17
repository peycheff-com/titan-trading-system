# Titan Trading System

**Bio-Mimetic Trading Organism** — A 5-phase algorithmic trading system that
evolves with capital growth.

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

| Phase | Name      | Capital Range | Strategy                     | Leverage |
| ----- | --------- | ------------- | ---------------------------- | -------- |
| 1     | Scavenger | $200 – $5K    | Predestination trap system   | 15-20x   |
| 2     | Hunter    | $2.5K – $50K  | Holographic market structure | 3-5x     |
| 3     | Sentinel  | $50K+         | Market-neutral basis arb     | 1-3x     |
| 4     | AI Quant  | —             | Gemini AI parameter tuning   | —        |
| 5     | Brain     | All           | Master orchestrator          | —        |

## Services

| Service                  | Description                            | Technology                      |
| ------------------------ | -------------------------------------- | ------------------------------- |
| `titan-brain`            | Central orchestrator & risk management | TypeScript, Fastify, PostgreSQL |
| `titan-execution-rs`     | High-performance order execution       | **Rust**, Actix, NATS           |
| `titan-phase1-scavenger` | Trap detection & signal generation     | TypeScript                      |
| `titan-phase2-hunter`    | Holographic analysis engine            | TypeScript                      |
| `titan-phase3-sentinel`  | Basis arbitrage engine                 | TypeScript                      |
| `titan-ai-quant`         | AI parameter optimization              | TypeScript, Gemini AI           |
| `titan-console`          | Web monitoring dashboard               | React, Vite, TailwindCSS        |
| `@titan/shared`          | Common infrastructure library          | TypeScript                      |

## Technology Stack

| Layer                | Technology                                  |
| -------------------- | ------------------------------------------- |
| **Execution Engine** | Rust (sub-millisecond latency)              |
| **Backend Services** | Node.js 22+, TypeScript, Fastify            |
| **Event Bus**        | NATS JetStream                              |
| **Database**         | PostgreSQL (Supabase)                       |
| **Frontend**         | React, Vite, TailwindCSS                    |
| **AI/ML**            | Google Gemini 2.0 Flash                     |
| **Deployment**       | DigitalOcean Droplet (VPS) + Docker Compose |
| **IPC**              | Unix Domain Sockets (FastPath)              |

## Quick Start

### Prerequisites

- Node.js 22+
- Rust 1.75+ (for execution engine)
- PostgreSQL or Supabase account
- NATS Server (optional, for event streaming)

### Installation

```bash
# Clone repository
git clone https://github.com/peycheff-com/titan-trading-system.git
cd titan-trading-system

# Install all dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials
```

### Development

```bash
# Start all services locally
./start-titan.sh

# Or start individual services
npm run start:brain      # Titan Brain on :3100
npm run start:execution  # Rust Engine on :3002
npm run start:console    # Dashboard on :5173
```

### Build

```bash
# Build all TypeScript services
npm run build --workspaces

# Build Rust execution engine
cd services/titan-execution-rs && cargo build --release
```

## Configuration

### Environment Variables

```bash
# Core
NODE_ENV=production
DEPLOYMENT_ENVIRONMENT=production

# Database
DATABASE_URL=postgresql://user:pass@host:5432/titan

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
- **Circuit Breakers** — Automatic failsafes on error thresholds

## Monitoring

| Endpoint   | Description            |
| ---------- | ---------------------- |
| `/health`  | Service health status  |
| `/metrics` | Prometheus metrics     |
| `/status`  | Detailed system status |

## Deployment

Deployment is managed manually via SSH on a DigitalOcean Droplet.

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

Configuration is managed via `.env` file and `docker-compose.prod.yml` on the
server.

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
