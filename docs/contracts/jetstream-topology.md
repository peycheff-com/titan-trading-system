# TITAN JetStream Topology Reference

> Canonical reference for all NATS JetStream streams, consumers, and KV buckets.

## Streams

| Stream | Subjects | Retention | Storage | Max Age | Max Bytes | Duplicate Window | Purpose |
|--------|----------|-----------|---------|---------|-----------|-----------------|---------|
| `TITAN_CMD` | `titan.cmd.>` | WorkQueue | File | 7d | — | 60s | Commands — exactly-once delivery, deduped |
| `TITAN_EVT` | `titan.evt.>` | Limits | File | 30d | 10 GB | — | Events — durable audit trail |
| `TITAN_DATA` | `titan.data.>` | Limits | Memory | 15m | — | — | Market data — ephemeral, fast |
| `TITAN_SIGNAL` | `titan.signal.>` | Limits | File | 1d | 5 GB | — | Brain signals — short-lived |
| `TITAN_DLQ` | `titan.dlq.>` | Limits | File | 30d | 1 GB | — | Dead-letter queue — failed messages |
| `TITAN_VENUE_STATUS` | `titan.data.venues.status.v1` | Limits | Memory | 24h | — | — | Venue health telemetry |
| `TITAN_MARKET_TRADES` | `titan.data.venues.trades.v1.>` | Limits | File | 7d | 20 GB | — | Normalized market trades |
| `TITAN_ORDERBOOKS` | `titan.data.venues.orderbooks.v1.>` | Limits | File | 24h | 10 GB | — | Orderbook snapshots |
| `TITAN_EXECUTION_EVENTS` | `titan.evt.execution.{fill,shadow_fill,report,reject}.v1` | Limits | File | 30d | — | — | Execution audit trail |

## Durable Consumers

| Consumer | Stream | Filter | Ack Policy | Max Deliver | Ack Wait | Backoff | Owner |
|----------|--------|--------|-----------|-------------|----------|---------|-------|
| `EXECUTION_CORE` | `TITAN_CMD` | `titan.cmd.execution.>` | Explicit | 5 | 30s | 1s, 5s, 15s, 30s | `titan-execution-rs` |
| `brain-venue-status` | `TITAN_VENUE_STATUS` | `titan.data.venues.status.v1` | Explicit | 5 | 30s | — | `titan-brain` |
| `analytics-trades` | `TITAN_MARKET_TRADES` | `titan.data.venues.trades.v1.>` | Explicit | 3 | 60s | — | Analytics |

## KV Buckets

| Bucket | History | TTL | Storage | Purpose |
|--------|---------|-----|---------|---------|
| `titan-venue-status` | 5 | 5m | Memory | Live venue health state |
| `titan-config` | 10 | — | File | Runtime config overrides |
| `titan-instruments` | 3 | 24h | File | Cached instrument specs |

## Idempotency

Commands on `TITAN_CMD` use a 60s `duplicate_window`. Producers MUST set
the `Nats-Msg-Id` header to the envelope's `idempotency_key` (or `id` if
no idempotency\_key exists). This guarantees at-most-once delivery within
the dedup window.

```
┌──────────┐    Nats-Msg-Id: <idempotency_key>    ┌─────────────┐
│  Brain    │ ──────────────────────────────────►   │  TITAN_CMD  │
│ (TS)     │                                       │  (WorkQueue)│
└──────────┘                                       └──────┬──────┘
                                                          │ pull
                                                   ┌──────▼──────┐
                                                   │ EXECUTION_  │
                                                   │ CORE (Rust) │
                                                   └──────┬──────┘
                                                          │ ack/nak
                                                          ▼
                                                    DLQ after 5 retries
```

## DLQ Routing

When a message exceeds `max_deliver` retries, the consumer's advisory
event triggers DLQ routing. The execution engine also explicitly publishes
to `titan.dlq.>` for messages that fail validation.

## Canonical Sources

- **TS Stream Definitions**: `packages/shared/src/messaging/titan_streams.ts`
- **TS Advanced Config**: `packages/shared/src/messaging/nats-streams.ts`
- **Rust Stream Setup**: `services/titan-execution-rs/src/nats_engine.rs`
