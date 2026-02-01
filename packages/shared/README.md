# @titan/shared

Common infrastructure library for Titan Trading System microservices.

## Features

- **Configuration Management** — Hot-reload, encryption, validation
- **IPC Clients** — FastPath client for Rust execution engine
- **Logging** — Structured JSON logging with correlation IDs
- **Events** — NATS JetStream integration
- **Health Checks** — Standardized health monitoring

## Installation

```bash
npm install @titan/shared
```

## Usage

### FastPath IPC Client

```typescript
import { FastPathClient } from "@titan/shared/ipc";

const client = new FastPathClient({
    socketPath: "/tmp/titan-execution.sock",
    hmacSecret: process.env.TITAN_HMAC_SECRET,
});

await client.connect();

// Send order signal
const result = await client.send({
    type: "PREPARE",
    payload: { symbol: "BTCUSDT", side: "BUY", size: 0.01 },
});
```

### Configuration

```typescript
import { HotReloadConfigManager } from "@titan/shared/config";

const config = new HotReloadConfigManager({
    configDirectory: "./config",
    environment: "production",
});

await config.loadAndWatchBrainConfig();
```

### NATS Messaging

```typescript
import { NatsClient } from "@titan/shared/messaging";

const nats = new NatsClient({ url: "nats://localhost:4222" });
await nats.connect();

await nats.publish("execution.trade.closed", tradeData);
```

## Modules

| Module       | Description                |
| ------------ | -------------------------- |
| `config/`    | Configuration management   |
| `ipc/`       | FastPath IPC client        |
| `messaging/` | NATS JetStream integration |
| `logging/`   | Structured logging         |
| `health/`    | Health check utilities     |

## Development

```bash
# Build
npm run build

# Test
npm test
```

## License

Proprietary. All rights reserved.
