# Contracts: M06 NATS JetStream

## 1. Interface Contracts

### Command Protocols
- **Brain → Execution**: Defined in `docs/contracts/nats-intent.md`.
    - Subject: `titan.cmd.execution.place.v1.>`
    - Schema: `nats-intent.v1.schema.json`
    - Payload: JSON (Intent)

### Stream Definitions (Infrastructure Contracts)
Defined in `packages/shared/src/messaging/nats-streams.ts`.

| Stream Name | Subject Pattern | Storage | Retention | Consumers |
|-------------|-----------------|---------|-----------|-----------|
| `TITAN_VENUE_STATUS` | `titan.data.venues.status.v1` | Memory | Limits (1k msgs) | Brain (Durable) |
| `TITAN_MARKET_TRADES` | `titan.data.venues.trades.v1.>` | File | Limits (7 days) | Analytics (Durable) |
| `TITAN_ORDERBOOKS` | `titan.data.venues.orderbooks.v1.>` | File | Limits (24h) | - |
| `TITAN_EXECUTION_EVENTS` | `titan.evt.execution.>` | File | Limits (30 days) | - |

### KV Stores
| Bucket | Scope | Global? |
|--------|-------|---------|
| `titan-venue-status` | Last-known status of venues | Yes |
| `titan-config` | Dynamic runtime configuration | Yes |
| `titan-instruments` | Instrument definitions | Yes |

## 2. System Guarantees
- **At-Least-Once Delivery**: Guaranteed for JetStream consumers (explicit ack required).
- **Ordering**: Per-subject ordering is guaranteed within a stream. Global ordering across subjects is NOT guaranteed unless in the same stream.
- **Persistence**: File-backed streams survive restarts. Memory-backed streams do not.
- **Deduplication**: NATS handles deduplication if `Msg-Id` header is set (window based).

## 3. Client Requirements (Implicit)
- Clients **MUST** use the shared `NatsClient` (or equivalent restricted wrapper).
- Clients **MUST NOT** create dynamic streams at runtime (only consumers).
- Clients **MUST** authentiate using the user credentials provided in environment variables.
