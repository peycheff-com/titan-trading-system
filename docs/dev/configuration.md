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
