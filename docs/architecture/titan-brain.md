# Titan Brain Architecture

> **Status**: Verified against Codebase (Jan 26, 2026)
> **Role**: Master Orchestrator, Risk Guardian, and Truth Arbiter.

Titan Brain (`services/titan-brain`) is the central nervous system of the Titan Trading System. It is responsible for global state management, risk gating, and the reconciliation of all trading activities.

## 1. Core Engines

The Brain is composed of specialized "Engines" that run in a unified Fastify process (Port 3100).

### Active Inference Engine ("Amygdala")
**Source**: `src/engine/ActiveInferenceEngine.ts`

Implements a biological "Surprise" metric to modulate system aggression.
- **Concept**: Minimization of Variational Free Energy (VFE).
- **Mechanism**:
  - Maintains a rolling window of market returns.
  - Compares observed returns against an "Expected Distribution" (Gaussian).
  - Calculates **KL Divergence** (Surprise).
  - Maps Surprise to a **Cortisol Level** (0.0 to 1.0) using a Sigmoid activation function.
- **Effect**: High Cortisol triggers "Freeze" or defensive modes, reducing allocation leverage.

### Governance Engine ("Prefrontal Cortex")
**Source**: `src/engine/GovernanceEngine.ts`

Enforces policy and structural rules.
- Manages global "Defcon" levels.
- Validates all outgoing Intents against the Global Risk Policy.
- Interlocks with the "Manual Override Service" to allow operator intervention.

### Accounting Service (Phase 4)
**Source**: `src/services/accounting/AccountingService.ts`

The "Truth Arbiter" responsible for reconciling Intents (Plans) with Fills (Reality).
- **Ingress Tracking**: Subscribes to `titan.cmd.exec.place.v1.>` to mark when an Intent was broadcast.
- **Fill Reconciliation**: Matches fills from `titan.evt.exec.fill.v1.>` against active Intents.
- **Shadow Fills**: Subscribes to `titan.execution.shadow_fill.>` to compare "Simulation" vs "Reality".
- **Drift Detection**:
  - Calculates `driftPct` between Real Price and Shadow Price.
  - Aleters `titan.alert.drift` if deviation > 0.1%.
- **Ledger Posting**: Posts normalized transactions to the General Ledger (Postgres).

## 2. Event Loop & Integration

Titan Brain uses a **NATS-First** architecture.

| Subject | Direction | Purpose |
| :--- | :--- | :--- |
| `titan.cmd.exec.place.v1.>` | Outbound | Validated Intents sent to Execution Engine. |
| `titan.signal.submit` | Inbound | Strategies (Hunter/Sentinel) submitting proposals. |
| `titan.evt.exec.fill.v1.>` | Inbound | Confirmation of trades from Execution. |
| `titan.alert.drift` | Outbound | Critical alerts for pricing deviations. |

## 3. Data Persistence

- **PostgreSQL**: Primary store for configuration, risk state, and ledgers.
- **Redis (Optional)**: Used for signal queues and hot configuration. If disabled, falls back to in-memory queues (verified in `src/index.ts`).

## 4. Startup & Safety

**StartupManager**:
- Enforces a deterministic initialization sequence (Env -> Config -> DB -> NATS -> Engine -> Server).
- Enforces a **5-minute (300s)** maximum startup time window (`maxStartupTime`).
- Registers graceful shutdown handlers for all components (Worker, WebSocket, NATS).
