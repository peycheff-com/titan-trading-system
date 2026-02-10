# Titan Phase 3 - The Sentinel

> **Context**: Service > Strategy (Sentinel)
> **Parent**: [Architecture](../architecture.md)
> **Knowledge Graph**: [Map](../knowledge-graph.md)


Market-neutral hedge fund system for basis arbitrage, funding rate collection, and vacuum arbitrage during liquidation events.

## Overview

The Sentinel is an institutional-grade market-neutral hedge fund system that treats the basis (the spread between spot and perpetual futures prices) as a tradable asset class. Unlike passive funding rate arbitrage bots that simply hold positions, The Sentinel actively scalps basis expansion and contraction while maintaining delta neutrality.

### Three Distinct Edges

1. **Passive Edge**: Collecting funding rates (the "carry")
2. **Active Edge**: Scalping basis fluctuations (the "basis trade")
3. **Structural Edge**: Absorbing liquidations neutrally (the "vacuum arb")

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Titan Sentinel Core                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Statistical │  │  Execution   │  │  Portfolio   │          │
│  │    Engine    │──│    Engine    │──│   Manager    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                  │                  │                  │
│         │          ┌──────────────┐           │                  │
│         │          │  Polymarket  │           │                  │
│         └──────────│  Arb Engine  │───────────┘                  │
│                    └──────────────┘                              │
│                            │                                     │
├────────────────────────────┼─────────────────────────────────────┤
│                            │                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Exchange   │  │   Exchange   │  │  Prediction  │          │
│  │   Gateway    │  │   Gateway    │  │   Market     │          │
│  │  (Binance)   │  │   (Bybit)    │  │ (Polymarket) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start (Production)

Run as part of the full Titan stack:

**Production Ready (Jan 2026)**.


```bash
cd ../..
cd ../..
docker compose up -d titan-phase3-sentinel
```

### Docker Configuration
Uses multi-stage build (Alpine Linux) for minimal footprint.
- **Image**: `node:22-alpine` → `titan/phase3-sentinel:latest`
- **Healthcheck**: `wget --no-verbose --tries=1 --spider http://localhost:8084/health`

## Manual Installation

```bash
cd services/titan-phase3-sentinel
npm install
```

## Development

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Run specific test suites
npm run test:unit
npm run test:property
npm run test:integration

# Watch mode
npm run test:watch
```

## Project Structure

```
titan-phase3-sentinel/
├── src/
│   ├── types/           # TypeScript interfaces and types
│   ├── engine/          # Statistical engine (basis analysis, Z-Score)
│   ├── execution/       # Atomic execution, TWAP slicing
│   ├── portfolio/       # Portfolio management, rebalancing
│   ├── exchanges/       # Exchange gateways, routing
│   ├── polymarket/      # Polymarket arbitrage engine
│   └── console/         # Terminal dashboard (Ink/React)
├── tests/
│   ├── unit/            # Unit tests
│   ├── property/        # Property-based tests (fast-check)
│   └── integration/     # Integration tests
├── package.json
├── tsconfig.json
└── jest.config.cjs
```

## Key Components

### Statistical Engine
- Rolling statistics with Welford's algorithm
- Z-Score calculation for basis classification
- Depth-weighted basis calculation

### Execution Engine
- Atomic spot/perpetual execution
- TWAP order slicing for large orders
- Abort handling for partial fills

### Portfolio Manager
- Position tracking (CORE, SATELLITE, VACUUM)
- Automated rebalancing (Tier 1, Tier 2, Compounding)
- Risk management with delta limits

### Polymarket Arbitrage Engine
- Latency arbitrage between Binance and Polymarket
- Real-time price velocity detection
- CTF Exchange integration

## Configuration

Environment variables:
- `BINANCE_API_KEY` - Binance API key
- `BINANCE_API_SECRET` - Binance API secret
- `BYBIT_API_KEY` - Bybit API key
- `BYBIT_API_SECRET` - Bybit API secret
- `POLYGON_RPC_URL` - Polygon RPC endpoint for Polymarket
- `POLYMARKET_PRIVATE_KEY` - Private key for Polymarket signing
- `TITAN_URL` - Titan Brain URL (internal)
- `PROMETHEUS_METRICS` - Enable metrics (default: true)

## Risk Parameters

Default risk limits:
- Maximum delta: 2% (warning), 5% (critical)
- Maximum position size: $50,000
- Maximum leverage: 3x
- Daily drawdown limit: 5% (phase-specific; global system limit is -$1,000 per [risk_policy](../risk/risk_policy.md))
- Critical drawdown: 10% (phase-specific override)

## License

MIT
