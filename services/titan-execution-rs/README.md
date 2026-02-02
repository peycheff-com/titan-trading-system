# Titan Execution (Rust)

**Owner:** @peycheff
**Lang:** Rust

High-performance execution engine handling secure order routing and risk guarding.

## Responsibilities
- HMAC Verification of Commands
- Exchange Connectivity (Bybit/Binance)
- Latency-Critical Risk Checks
- Rate Limiting (TokenBucket)

## Key Invariants
- **Memory Safety**: No unsafe code blocks without strict justification.
- **Zero-Allocation Hot Path**: Optimized for <1ms internal latency.

## Features

- **Sub-millisecond latency** — <1ms P99 order execution
- **NATS JetStream** — Event-driven architecture for trade events
- **FastPath IPC** — Unix Domain Socket communication with HMAC signing
- **Multi-Venue Routing** — Weighted splitting across multiple exchanges with aggregated state tracking
- **Shadow State** — Real-time position tracking with exchange reconciliation
- **Risk Guard** — Pre-trade validation (Leverage, Notional, Open Orders)
- **Drift Detection** — Post-trade reconciliation (Execution vs Intent)
- **Staleness Guard** — Market data freshness enforcement (<200ms)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TITAN EXECUTION-RS                       │
├─────────────────────────────────────────────────────────────┤
│  FastPath IPC Server (Unix Socket)                          │
│  ├── Signal Reception (PREPARE/CONFIRM/ABORT)               │
│  ├── HMAC Verification                                      │
│  └── Order Routing                                          │
├─────────────────────────────────────────────────────────────┤
│  Order Executor                                             │
│  ├── Exchange Adapters (Bybit, Binance, MEXC)               │
│  ├── Shadow State Position Tracking                         │
│  └── Error Handling & Retry Logic                           │
├─────────────────────────────────────────────────────────────┤
│  NATS Publisher                                             │
│  └── Trade Events → execution.trade.closed                  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Rust 1.75+
- NATS Server (optional, for event publishing)

### Build

```bash
cargo build --release
```

### Full System (Recommended)

To run as part of the full Titan stack:

```bash
cd ../..
docker compose -f docker-compose.dev.yml up -d
```

### Local Development (Service Only)

```bash
# Development (Auto-reloading with cargo-watch if installed, or just cargo run)
cargo run

# Production Build
cargo build --release
./target/release/titan-execution-rs
```

### Environment Variables

```bash
# Server
PORT=3002
RUST_LOG=info

# NATS
NATS_URL=nats://localhost:4222

# IPC
TITAN_IPC_SOCKET=/tmp/titan-execution.sock
TITAN_HMAC_SECRET=your_secret

# Exchange APIs
BYBIT_API_KEY=your_key
BYBIT_API_SECRET=your_secret
```

## API

### FastPath IPC Protocol

| Message   | Description                |
| --------- | -------------------------- |
| `PREPARE` | Validate and prepare order |
| `CONFIRM` | Execute prepared order     |
| `ABORT`   | Cancel prepared order      |

### NATS Subjects

| Subject                  | Description                    |
| ------------------------ | ------------------------------ |
| `execution.trade.closed` | Published when trade completes |

## Performance Targets

| Metric      | Target      |
| ----------- | ----------- |
| P50 Latency | <0.5ms      |
| P99 Latency | <1ms        |
| Throughput  | >1000 msg/s |

Targets are measured using the NATS shadow-fill benchmark (synthetic pipeline, no exchange latency).
See Benchmarking for a reproducible workflow.

## Benchmarking

The execution engine ships with a repeatable NATS shadow-fill benchmark that measures end-to-end
latency from intent publish → shadow fill emit. This isolates internal pipeline latency and excludes
exchange/network latency.

### Prerequisites

- NATS running (JetStream enabled)
- Titan Execution running
- Market data stream connected (shadow fills require a live ticker)

For local parity, use the dev compose stack:

```bash
cd ../..
docker compose -f docker-compose.dev.yml up -d
```

### Run the benchmark

```bash
node services/titan-execution-rs/scripts/benchmark_nats_latency.mjs --count=500 --symbol=BTCUSDT
```

Optional flags:
- `--nats=nats://localhost:4222`
- `--timeoutMs=30000`
- `--source=bench`

Record the reported P50/P99 and compare to the targets above.

If the benchmark exits early, confirm that the market data stream is connected
(shadow fills require a live ticker feed).

## Observability

### Metrics
Exposed via internal HTTP server (default port 3002).

- `titan_execution_orders_total`: Total orders processed
- `titan_execution_latency_us`: Order processing latency
- `titan_execution_active_connections`: Active exchange connections

### Health
- `/health`: Service health status
- `/Live`: Liveness probe

```bash
# Run tests
cargo test

# Run with logging
RUST_LOG=debug cargo run

# Build optimized
cargo build --release
```

## License

Proprietary. All rights reserved.
