# Observability & Metrics

> **Status**: Canonical
> **Stack**: Prometheus / Grafana / Loki

## 1. Key Performance Indicators (SLOs)

| Metric | Threshold | Consequence |
| :--- | :--- | :--- |
| **Execution Latency** | < 100ms (p99) | Warning |
| **Execution Latency** | > 500ms (p99) | SEV-2 (Pause High Freq) |
| **Brain Tick Rate** | > 0.5Hz | Warning (Brain is lagging) |
| **Error Rate** | > 1% | SEV-2 |

## 2. Dashboards (Grafana)

### 2.1 "The Cockpit" (Home)
- **Equity Curve** (Real-time).
- **Active Positions** (with PnL).
- **Risk Gauge**: Total Exposure vs Limit.
- **Circuit Breaker Status**: NORMAL / HALTED.

### 2.2 "The Engine Room" (Technical)
- **NATS Lag**: Pending messages in stream.
- **Postgres Connections**.
- **Container CPU/RAM**.

## 3. Alerts (Alertmanager)

- **Critical**: `InstanceDown`, `HighDrift`, `LowBalance`.
- **Warning**: `HighLatency`, `MissingHeartbeat`.

## 4. Log Standards
Services must log in JSON format (Production).
```json
{"level":"info","ts":1700000000,"msg":"order_submitted","order_id":"123"}
```
**Invariant**: No PII/Secrets in logs.
