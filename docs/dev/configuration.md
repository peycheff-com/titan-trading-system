# Configuration & Environment Variables

> **Status**: Canonical
> **Scope**: Development & Production

This document catalogs all configuration switches, environment variables, and file-based configs for the Titan Trading System.

## 1. Hierarchy

Titan uses a tiered configuration strategy:

1. **Code Defaults**: Hardcoded safe defaults (fail-closed).
2. **Configuration Files**: `config/*.conf`, `risk_policy.json` (Structured data).
3. **Environment Variables**: `.env` (Overrides and Secrets).
4. **CLI Arguments**: Runtime flags (highest precedence).

## 2. Environment Variables (`.env`)

Source of Truth: `.env.example` in repo root.

### 2.1 Core System

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `development` | `production` enables optimizations and strict security. |
| `TITAN_MODE` | Yes | `DISARMED` | `ARMED` allows live execution. Default is Disarmed. |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error`. |

### 2.2 Orchestration (Ports)

| Variable | Service | Default |
| :--- | :--- | :--- |
| `BRAIN_PORT` | titan-brain | `3100` |
| `EXECUTION_PORT` | titan-execution | `3002` |
| `CONSOLE_PORT` | titan-console | `8080` (Internal) |

### 2.3 Databases & Bus

| Variable | Description | Example / Production Note |
| :--- | :--- | :--- |
| `DATABASE_URL` | Postgres Connection | `postgresql://titan:secret@localhost:5432/titan_brain` |
| `REDIS_URL` | Redis Connection | `redis://localhost:6379` |
| `NATS_URL` | NATS JetStream | `nats://localhost:4222` |

### 2.4 Security (Secrets)

**Never commit these.** Use Vault or `.env.prod` (chmod 600).

| Variable | Criticality | Usage |
| :--- | :--- | :--- |
| `HMAC_SECRET` | **CRITICAL** | Signs all IPC commands. Fail-closed if missing. |
| `TITAN_MASTER_PASSWORD` | High | Auth for Console and Operator actions. |
| `JWT_SECRET` | High | Signs operator session tokens. |
| `BYBIT_API_KEY` | High | Exchange API Key. |
| `BYBIT_API_SECRET` | High | Exchange API Secret. |

## 3. Configuration Files

### 3.1 NATS Configuration (`config/nats.conf`)

- Defines JetStream limits (Storage: File, max_mem).
- Defines ACLs (Access Control Lists) for users (`brain`, `execution`, `scavenger`, etc.).
- **Invariant**: Users are isolated. `execution` cannot publish to `titan.cmd.*` (unless reacting).

### 3.2 Risk Policy (`packages/shared/risk_policy.json`)

- **Canonical definitions** of risk limits.
- Loaded by both Brain (TS) and Execution (Rust).
- **Invariant**: Both services verify SHA256 of this file at boot.

### 3.3 Docker Compose Overrides

- `docker-compose.yml`: Base (Dev).
- `docker-compose.prod.yml`: Production overlays (restart policies, logging, networks).
- `docker-compose.secrets.yml`: Local dev injection of real secrets (optional, git-ignored).

## 4. Secret Management Best Practices

1. **Production**:
    - Mount `.env.prod` as a readonly file if possible.
    - Or inject via Orchestrator Secrets (Docker Swarm/K8s).
    - **Verify Permissions**: `chmod 600 config/.env.prod`.

2. **Development**:
    - Copy `.env.example` to `.env`.
    - Fill in `HMAC_SECRET` (generate with `openssl rand -hex 32`).

3. **Rotation**:
    - Secrets are static at boot.
    - Rotation requires **Restart** of affected services.

## 5. Runtime Configuration (ConfigRegistry)

> **Source**: `services/titan-brain/src/services/config/ConfigRegistry.ts`

The `ConfigRegistry` provides a runtime-configurable overlay on top of environment variables and code defaults. It is the **single source of truth** for all tunable trading, risk, and operational parameters.

### 5.1 Provenance Hierarchy

Values are resolved in priority order (highest first):

1. **Override** — Applied via UI or API (`POST /config/override`). Stored in PostgreSQL.
2. **Environment** — `.env.production` variables.
3. **Default** — Hardcoded in `CONFIG_CATALOG`.

Each effective value carries a `provenance` tag (`override`, `env`, or `default`) so operators always know the source.

### 5.2 Safety Tiers

Every config item has a `safety` level enforcing directional constraints:

| Safety | Behavior |
| :--- | :--- |
| `immutable` | Cannot be changed at runtime. Requires signed deploy. |
| `tighten_only` | Can only be moved in the safer direction (reduce risk). |
| `raise_only` | Can only be increased (raise limits). |
| `append_only` | Items can be added but not removed. |
| `tunable` | Free to change in any direction. |

### 5.3 Catalog Categories

All runtime-tunable parameters are organized into categories:

| Category | Example Keys | Description |
| :--- | :--- | :--- |
| Capital | `capital.initialEquity`, `capital.reserveLimit` | Equity and capital reserves |
| Risk | `risk.maxRiskPct`, `risk.maxPositionSizePct`, `risk.maxTotalLeverage` | Per-trade and aggregate risk limits |
| Circuit Breaker | `breaker.maxDailyDrawdown`, `breaker.minEquity`, `breaker.emergencyStopLoss` | Automated halt triggers |
| Safety | `safety.zscoreThreshold`, `safety.drawdownVelocityThreshold` | Statistical anomaly detection |
| Trading Limits | `trading.minTradeIntervalMs`, `trading.maxTradesPerHour` | Frequency throttling |
| Market Sentiment | `market.fundingGreedThreshold`, `market.fundingFearThreshold` | Funding rate signal thresholds |
| Execution | `execution.maxSpreadPct`, `execution.maxSlippagePct` | Fill quality constraints |

Full catalog: see `CONFIG_CATALOG` in `ConfigRegistry.ts`.

### 5.4 Preset Profiles

Three pre-defined risk profiles can be applied via `POST /config/preset/:name`:

| Preset | Description |
| :--- | :--- |
| `conservative` | Lower risk, tighter limits — capital preservation mode |
| `balanced` | Default production profile — moderate risk, standard limits |
| `aggressive` | Higher risk tolerance — for strong conviction periods |

Each preset applies a coordinated set of overrides atomically.

### 5.5 API Endpoints

| Endpoint | Method | Guard | Description |
| :--- | :--- | :--- | :--- |
| `/config/catalog` | GET | operator | List all config items with metadata |
| `/config/effective` | GET | operator | Get current effective values with provenance |
| `/config/override` | POST | admin | Create or update a runtime override |
| `/config/override` | DELETE | admin | Rollback an override to previous value |
| `/config/presets` | GET | operator | List available preset profiles |
| `/config/preset/:name` | POST | admin | Apply a named preset profile |
| `/config/receipts` | GET | operator | Audit log of all config changes |

### 5.6 UI (Titan Console)

The **Settings** page (`apps/titan-console/src/pages/Settings.tsx`) provides a UI for all catalog items:

- **Dynamic rendering**: Each item renders the appropriate widget (slider, input, toggle, select) based on its catalog definition.
- **Provenance badges**: Shows whether each value comes from default, env, or override.
- **Save with reason**: Every override requires a text reason for the audit trail.
- **Rollback**: One-click rollback for any active override.
- **Preset buttons**: Quick-apply Conservative/Balanced/Aggressive profiles.

