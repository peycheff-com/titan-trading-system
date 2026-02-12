# Observability: M06 NATS JetStream

## 1. Metrics (NATS Server)
NATS exposes metrics on port `8222` (`/metrics` endpoint if exporter attached, or `/varz`, `/subsz` JSON).

### Key Metrics to Watch
- `gnatsd_varz_connections`: Active connections.
- `gnatsd_jetstream_storage_duration_seconds`: Disk write latency.
- `nats_stream_state_messages`: Depth of streams.
- `nats_consumer_num_pending_pull`: Consumer lag.

## 2. Distributed Tracing
- **Context Propagation**: `NatsClient.ts` supports OpenTelemetry context propagation (commented out code observed, needs enabling).
- **Correlation IDs**: `correlation_id` field in standard Envelope allows tracing requests across microservices.

## 3. Alerts (Proposed)
- **Disk Usage**: Alert if `/data/jetstream` > 80%.
- **Stream Full**: Alert if `TITAN_MARKET_TRADES` usage > 90% of `max_bytes`.
- **Consumer Lag**: Alert if `pending` messages > 1000 for critical consumers (Brain, Execution).
- **DLQ Activity**: Alert on ANY message to `titan.dlq.>`.

## 4. Logs
- **Server Logs**: NATS server logs (startup, auth failures, cluster events).
- **Client Logs**: `NatsClient` logs connection patterns, errors, and DLQ events.
