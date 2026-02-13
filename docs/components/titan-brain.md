# Titan Brain (Orchestrator)

**Context**: Backend Service (TypeScript)
**Port**: 3100
**Role**: Orchestration, Risk Management, Phase Coordination.
**Status**: Verified against Codebase (Jan 26, 2026)

## Key Files

- `src/index.ts`: Entry point. Starts Fastify and NATS.
- `src/flow/Signalprocessor.ts`: Core logic for handling incoming phase signals.
- `src/risk/CircuitBreaker.ts`: System-wide safety switch.
- `src/services/config/ConfigRegistry.ts`: Runtime configuration catalog with safety enforcement, overrides, and audit receipts.
- `src/server/controllers/ConfigController.ts`: REST API for configuration management (catalog, overrides, presets).
- `src/db/`: Database schema and migrations (PostgreSQL).

## Configuration Management

The Brain hosts the `ConfigRegistry` — a catalog-based runtime configuration system. See [Configuration](../dev/configuration.md#5-runtime-configuration-configregistry) for full details.

- **Catalog**: All tunable parameters defined in `CONFIG_CATALOG` with safety constraints and schemas.
- **Overrides**: Runtime overrides via `POST /config/override` with tighten-only / raise-only enforcement.
- **Presets**: Three built-in profiles (Conservative, Balanced, Aggressive) via `POST /config/preset/:name`.
- **Receipts**: HMAC-signed audit trail for all configuration changes.

## Dependencies

- **Upstream**: Receives signals from `titan-phase*` services.
- **Downstream**: Sends commands to `titan-execution-rs`.
- **Database**: Connects to `postgres` (primary) and `redis` (cache).

## Documentation

- [**API Reference**](../reference/api-brain.md) — Detailed request/response examples.

---

## Architecture Deep Dive

> **Note**: This section was merged from `docs/architecture/titan-brain.md`.

### Core Engines

The Brain is composed of specialized "Engines" that run in a unified Fastify process.

#### Active Inference Engine ("Amygdala")

**Source**: `src/engine/ActiveInferenceEngine.ts`

Implements a biological "Surprise" metric to modulate system aggression.

- **Concept**: Minimization of Variational Free Energy (VFE).
- **Mechanism**:
  - Maintains a rolling window of market returns.
  - Compares observed returns against an "Expected Distribution" (Gaussian).
  - Calculates **KL Divergence** (Surprise).
  - Maps Surprise to a **Cortisol Level** (0.0 to 1.0) using a Sigmoid activation function.
- **Effect**: High Cortisol triggers "Freeze" or defensive modes, reducing allocation leverage.

#### Governance Engine ("Prefrontal Cortex")

**Source**: `src/engine/GovernanceEngine.ts`

Enforces policy and structural rules.

- Manages global "Defcon" levels.
- Validates all outgoing Intents against the Global Risk Policy.
- Interlocks with the "Manual Override Service" to allow operator intervention.

#### Accounting Service (Phase 4)

**Source**: `src/services/accounting/AccountingService.ts`

The "Truth Arbiter" responsible for reconciling Intents (Plans) with Fills (Reality).

- **Ingress Tracking**: Subscribes to `titan.cmd.execution.place.v1.>` to mark when an Intent was broadcast.
- **Fill Reconciliation**: Matches fills from `titan.evt.execution.fill.v1` against active Intents.
- **Shadow Fills**: Subscribes to `titan.evt.execution.shadow_fill.v1` to compare "Simulation" vs "Reality".
- **Drift Detection**:
  - Calculates `driftPct` between Real Price and Shadow Price.
  - Alerts `titan.evt.alert.drift.v1` if deviation > 0.1%.
- **Ledger Posting**: Posts normalized transactions to the General Ledger (Postgres).

### Event Loop & Integration

Titan Brain uses a **NATS-First** architecture.

| Subject | Direction | Purpose |
| :--- | :--- | :--- |
| `titan.cmd.execution.place.v1.>` | Outbound | Validated Intents sent to Execution Engine. |
| `titan.evt.{phase}.signal.v1` | Inbound | Strategies (Scavenger/Hunter/Sentinel) submitting signals. |
| `titan.evt.execution.fill.v1` | Inbound | Confirmation of trades from Execution. |
| `titan.evt.alert.drift.v1` | Outbound | Critical alerts for pricing deviations. |

### Data Persistence

- **PostgreSQL**: Primary store for configuration, risk state, and ledgers.
- **Redis (Optional)**: Used for signal queues and hot configuration. If disabled, falls back to in-memory queues (verified in `src/index.ts`).

### Startup & Safety

**StartupManager**:

- Enforces a deterministic initialization sequence (Env -> Config -> DB -> NATS -> Engine -> Server).
- Enforces a **5-minute (300s)** maximum startup time window (`maxStartupTime`).
- Registers graceful shutdown handlers for all components (Worker, WebSocket, NATS).
