# Module Observability: M05 Execution Engine (Rust)

> **Generated**: 2026-02-11
> **Module**: M05 (titan-execution-rs)

## 1. Structured Logging

-   **Library**: `tracing` + `tracing-subscriber` + `tracing-opentelemetry`.
-   **Format**: JSON (stdout).
-   **Levels**:
    -   `INFO`: Startup, Mode changes (ARM/DISARM), Connection status.
    -   `WARN`: Non-critical rejections, drift warnings.
    -   `ERROR`: NATS disconnection, Persistence failures, Panic conditions.

## 2. Metrics (Prometheus)

The service exposes a `/metrics` endpoint on port `3002`.

| Metric | Type | Description |
| :--- | :--- | :--- |
| `process_cpu_seconds_total` | Counter | CPU usage. |
| `process_resident_memory_bytes` | Gauge | Memory usage. |
| `titan_execution_orders_total` | Counter | Total orders processed (tagged by status). |
| `titan_execution_latency_seconds` | Histogram | End-to-end processing latency. |
| `titan_risk_rejections_total` | Counter | Orders rejected by RiskGuard. |

## 3. Tracing (OpenTelemetry)

-   **Endpoint**: `http://tempo:4317` (gRPC).
-   **Service Name**: `titan-execution-rs`.
-   **Spans**:
    -   `order_processing`: Root span for a placement request.
    -   `risk_check`: Duration of risk validation.
    -   `persistence_write`: Duration of WAL write.

## 4. Health Checks

-   **Liveness**: `/health` endpoint checks NATS connection.
-   **Risk State**: `/status` endpoint exposes current `RiskState` (Normal/Emergency).
