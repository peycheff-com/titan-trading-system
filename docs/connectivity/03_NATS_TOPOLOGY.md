# Titan Connectivity Layer - NATS Topology

## Subjects

| Subject | Purpose | Producer | Consumer |
|---------|---------|----------|----------|
| `titan.data.venues.status.v1` | Venue WebSocket health | Hunter | Brain |
| `titan.data.venues.trades.v1.{venue}.{symbol}` | Normalized trades | Hunter | Any |

## Streams

| Stream | Retention | Max Age | Storage |
|--------|-----------|---------|---------|
| `TITAN_VENUE_STATUS` | Limits | 15 min | Memory |
| `TITAN_MARKET_TRADES` | Limits | 1 hour | Memory |

## KV Buckets

| Bucket | Purpose | TTL |
|--------|---------|-----|
| `titan-venue-status` | Last-known venue state | 5 min |

## Consumer Configuration

```yaml
# Brain venue status consumer
name: BRAIN_VENUES_STATUS
durable: true
filter_subject: titan.data.venues.status.v1
deliver_policy: last_per_subject
ack_policy: explicit
max_ack_pending: 100
```

## NATS Client SDK

**Location**: `packages/shared/src/nats/NatsClient.ts`

Features:
- Automatic reconnection with exponential backoff
- JetStream publish/subscribe
- KV bucket operations
- Connection health monitoring
