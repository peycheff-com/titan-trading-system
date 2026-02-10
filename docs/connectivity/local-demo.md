# Titan Connectivity Layer - Local Demo

## Prerequisites

- Docker with `docker compose`
- Node.js 20+
- NATS CLI (optional, for debugging)

## Quick Start

```bash
# Terminal 1: Start NATS
docker compose up nats -d

# Terminal 2: Start Hunter
cd services/titan-phase2-hunter && npm run dev

# Terminal 3: Start Brain
cd services/titan-brain && npm run dev

# Terminal 4: Verify
curl http://localhost:3000/venues | jq
curl http://localhost:3000/venues/summary | jq
curl http://localhost:3000/health | jq
```

## Expected Output

### /venues/summary

```json
{
  "connected": 4,
  "total": 8,
  "stale": 0,
  "lastUpdate": "2026-02-05T15:30:00Z"
}
```

### /venues

Returns array of venue status objects with:

- `venue`: Venue identifier
- `state`: CONNECTED, DEGRADED, or DISCONNECTED
- `latencyP50Ms`, `latencyP99Ms`: Latency percentiles
- `messageCount`: Total messages received
- `stale`: Boolean flag if no update in 5 seconds

## Staleness Test

1. Stop Hunter process
2. Wait 5 seconds
3. `curl /venues` shows `"stale": true` for all venues
