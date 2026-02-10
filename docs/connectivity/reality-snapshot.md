# Titan Connectivity Layer - Reality Snapshot

## Project Context

**Date**: February 2026  
**Objective**: Eliminate simulated venue status in Brain; replace with live telemetry from Hunter via NATS.

## Pre-Implementation State

| Component | State |
|-----------|-------|
| Hunter | WebSocket clients for Binance, Bybit, OKX, Coinbase, Kraken, MEXC, Hyperliquid |
| Brain `/venues` | **Simulated data** - not connected to real telemetry |
| NATS | Existing infrastructure with streams TITAN_DATA, TITAN_EVENTS |
| @titan/shared | Venue registry, schema definitions present but incomplete |

## Key Findings

1. **Existing VenueId registry** in `@titan/shared/src/types/venues.ts` with 8 venues
2. **VenueStatusV1 schema** existed but lacked comprehensive validation
3. **MarketTradeV1 schema** existed for normalized trade messages
4. **Symbol normalization** needed enhancement (no timestamp-based cache-busting)
5. **KV bucket pattern** already established in Execution-RS codebase

## Implementation Scope

- **Hunter**: VenueStatusPublisher, MarketTradePublisher, KV snapshots
- **Brain**: VenueStatusStore (JetStream consumer), KV bootstrap, Prometheus metrics
- **Rust**: Verified existing ExchangeAdapter trait satisfies design requirements
