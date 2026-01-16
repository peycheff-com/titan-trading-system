# Titan Trading System

## Project Overview

Titan is a **Bio-Mimetic Trading Organism** designed as a 5-phase algorithmic trading system. It evolves its behavior based on available capital, orchestrated by a central "Brain" and executed via specialized microservices.

**Key Phases:**
*   **Phase 1 (Scavenger):** High leverage, small capital trap system.
*   **Phase 2 (Hunter):** Medium leverage, holographic market structure analysis.
*   **Phase 3 (Sentinel):** Low leverage, market-neutral basis arbitrage.
*   **Phase 4 (AI Quant):** Offline parameter optimization using Gemini AI.
*   **Phase 5 (Brain):** Master orchestrator managing capital allocation and risk.

## Architecture

The system follows a microservices architecture within a monorepo structure:

*   **Titan Brain (`services/titan-brain`):** The central decision maker (Node.js/Fastify, PostgreSQL). Orchestrates phases and manages global risk.
*   **Titan Execution (`services/titan-execution`):** Handles order execution, position tracking (Shadow State), and exchange connections (Node.js/Fastify, SQLite/Postgres).
*   **Titan Console (`services/titan-console`):** Web-based monitoring dashboard (React/Vite).
*   **Titan AI Quant (`services/titan-ai-quant`):** AI optimization engine using Google's Gemini models.
*   **Shared Infrastructure (`services/shared`):** Common code for logging, config, and events.

## Prerequisites

*   **Node.js:** v20+ (Required by root `package.json`).
*   **PostgreSQL:** Required for Titan Brain.
*   **Redis:** Required for caching and communication.
*   **Package Manager:** npm (Workspaces enabled).

## Building and Running

### Quick Start (All Services)

The recommended way to start the entire system locally is using the provided shell script:

```bash
./start-titan.sh
```

This script:
1.  Validates the environment (Node, disk space, memory).
2.  Starts PostgreSQL and Redis (if installed via Homebrew).
3.  Builds and starts **Titan Brain**, **Titan Execution**, and **Titan Scavenger** (headless).
4.  Performs health checks on all services.

### Running Individual Services

You can run specific services using npm workspaces from the root directory:

```bash
# Install dependencies for all workspaces
npm install

# Start Titan Brain
npm run start:brain

# Start Titan Execution
npm run start:execution

# Start Titan Console (Frontend)
npm run start:console

# Start AI Quant
npm run start:ai-quant
```

### Deployment Logic

The project uses `dispatch-start.js` for Railway deployments. It detects the service to run based on the `RAILWAY_SERVICE_NAME` environment variable.
*   **Default:** Titan Console (if no env var is set).
*   **Supported Names:** "Titan Brain", "Titan Execution", "Titan AI Quant", etc.

## Key Files & Directories

*   **`start-titan.sh`**: The master startup script for local development.
*   **`.kiro/steering/titan-architecture.md`**: Detailed architectural documentation. **Read this for deep system understanding.**
*   **`services/`**: Contains the source code for all microservices.
*   **`config/`**: Centralized configuration files (e.g., `brain.config.json`).
*   **`dispatch-start.js`**: Entry point for cloud deployments.
*   **`README.md`**: General project info and quick start guide.

## Development Conventions

*   **Monorepo:** Code is organized in `services/*`. Shared code is in `services/shared`.
*   **Environment Variables:** Service-specific `.env` files (e.g., `services/titan-execution/.env`). Use `.env.example` as a template.
*   **Database:** Titan Brain uses PostgreSQL (Supabase in prod). Titan Execution uses SQLite or Postgres.
*   **AI Integration:** Phase 4 uses `@google/generative-ai` for parameter optimization. **Target:** Upgrade to Gemini 3 Flash (Dec 2025 release) for real-time reasoning.

## Modernization Roadmap (2026)

Based on the [SOTA Upgrade Analysis](reports/SOTA_Upgrade_Analysis_2026.md), the following upgrades are planned:
1.  **Execution Engine:** Rewrite `titan-execution` in **Rust** (Actix/Tokio) to eliminate GC jitter and achieve <1ms P99 latency.
2.  **Event Bus:** Migrate from Redis to **NATS JetStream** for deterministic low-latency messaging.
3.  **AI Core:** Upgrade from Gemini 1.5 to **Gemini 3 Flash** & **Deep Think** for superior reasoning capabilities.

