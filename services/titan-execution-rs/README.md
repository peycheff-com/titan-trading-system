# Titan Execution Engine (Rust)

High-performance order execution microservice for the Titan Trading System.

## Features

- **Sub-millisecond latency** — <1ms P99 order execution
- **NATS JetStream** — Event-driven architecture for trade events
- **FastPath IPC** — Unix Domain Socket communication with HMAC signing
- **Shadow State** — Real-time position tracking with exchange reconciliation
- **Multi-Exchange** — Bybit, Binance, MEXC adapter support

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

### Run

```bash
# Development
cargo run

# Production
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

## Performance

| Metric      | Target      | Achieved |
| ----------- | ----------- | -------- |
| P50 Latency | <0.5ms      | ✅       |
| P99 Latency | <1ms        | ✅       |
| Throughput  | >1000 msg/s | ✅       |

## Development

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
