# M01 — Observability

## Logging
- **Format**: JSON Structured Logs
- **Levels**: INFO (Default), DEBUG (Dev), WARN/ERROR (Alerts)
- **Context**: Correlation ID, Signal ID, User ID

## Metrics (Prometheus)
- **Endpoint**: `/metrics`
- **Key Metrics**:
    - `titan_brain_equity` (Gauge)
    - `titan_brain_positions_count` (Gauge)
    - `titan_brain_signal_latency` (Histogram)
    - `titan_brain_circuit_breaker_status` (Gauge: 0/1)
    - `titan_brain_risk_confidence` (Gauge: 0-1)

## Dashboard
- Real-time WebSocket feed (`WebSocketService`) broadcasts:
    - Equity
    - Allocation
    - Active Positions
    - Risk State
- **Health Checks**: `/health` endpoint checks DB, Redis, NATS, Memory.

## Tracing
- **OpenTelemetry**: Hooks present in `index.ts` (commented out by default) and `tracing.js`.
