# NATS JetStream Reference

> **Status**: Canonical
> **Authority**: `@titan/shared`
> **Auto-Generated**: Partially (via `SOTA_QUALITY.md`)

## 1. Subject Taxonomy

Titan uses a strict hierarchical subject space: `titan.<type>.<domain>.<action>.<version>`.

- **CMD** (`titan.cmd.>`): Commands. Actions that mutate state. 1-to-1 (Queue Group).
- **EVT** (`titan.evt.>`): Events. Facts that happened. 1-to-Many (Broadcast).
- **DATA** (`titan.data.>`): Ephemeral high-frequency data (Tickers).

## 2. Stream Definitions

| Stream | Description | Retention | Subjects |
| :--- | :--- | :--- | :--- |
| `TITAN_COMMANDS` | Critical Registry | WorkQueue | `titan.cmd.>` |
| `TITAN_EVENTS` | Audit Log | Limits (Age/Size) | `titan.evt.>` |
| `TITAN_DATA` | Telemetry | Limits (Interest) | `titan.data.>` |

## 3. Subject Catalog

### 3.1 Commands (Critical)

| Subject Pattern | Payload | Description |
| :--- | :--- | :--- |
| `titan.cmd.execution.place.v1` | `IntentEnvelope` | **Brain → Execution**. The only way to trade. |
| `titan.cmd.risk.halt.v1` | `HaltPayload` | **Operator → System**. Instant Kill Switch. |
| `titan.cmd.operator.arm.v1` | `ArmPayload` | **Operator → System**. Re-enable trading. |
| `titan.cmd.operator.disarm.v1` | `DisarmPayload` | **Operator → System**. Pause trading safely. |
| `titan.cmd.ai.optimize.v1` | `OptimizePayload` | **Brain → AI Quant**. Request new parameters. |

### 3.2 Events (Signals & Fills)

| Subject Pattern | Payload | Description |
| :--- | :--- | :--- |
| `titan.evt.execution.fill.v1` | `FillEvent` | **Execution → Brain**. Trade confirmed. |
| `titan.evt.execution.reject.v1` | `RejectEvent` | **Execution → Brain**. Order failed validation. |
| `titan.evt.scavenger.signal.v1` | `SignalPayload` | **Scavenger → Brain**. Trap detected. |
| `titan.evt.hunter.signal.v1` | `SignalPayload` | **Hunter → Brain**. Structure detected. |
| `titan.evt.sentinel.signal.v1` | `SignalPayload` | **Sentinel → Brain**. Arb opportunity. |
| `titan.evt.phase.diagnostics.v1` | `PhasePosture` | **All Phases → Brain**. Heartbeat/Health. |

### 3.3 Data (Metrics)

| Subject Pattern | Description |
| :--- | :--- |
| `titan.data.market.ticker.v1` | Normalized ticker updates (from Execution/Feed). |
| `titan.data.powerlaw.metrics.v1` | Real-time Power Law deviation metrics. |
| `titan.data.dashboard.update.v1` | Aggregated view for Console UI. |

## 4. Message Envelopes

All critical messages (`CMD`, `EVT`) must be wrapped in the **Intent Envelope**.

```typescript
interface IntentEnvelope<T> {
  id: string;         // UUID v4
  source: string;     // e.g., "titan-brain"
  ts: number;         // Unix ms
  payload: T;         // Similar to Body
  sig?: string;       // HMAC-SHA256 (Required for Commands)
}
```
