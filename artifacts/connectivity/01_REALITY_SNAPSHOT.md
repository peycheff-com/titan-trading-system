# Titan Connectivity Layer 2026 - Reality Snapshot (D10-01)

> Generated: 2026-02-05

## Current State Summary

| Component | Status | Location |
|-----------|--------|----------|
| VenueId enum | ✅ Done | `@titan/shared/src/types/venues.ts` |
| VenueCapabilities | ✅ Done | `@titan/shared/src/types/venues.ts` |
| VenueStatusV1 schema | ✅ Done | `@titan/shared/src/schemas/venue-status.ts` |
| MarketTradeV1 schema | ❌ Missing | (to create) |
| Symbol normalization | ❌ Missing | (to create) |
| NATS subject defined | ✅ Done | `titan.data.venues.status.v1` |
| NATS stream config | ❌ Missing | (to create) |
| Hunter VenueStatusPublisher | ✅ Done | `titan-phase2-hunter/src/telemetry/` |
| Brain VenueStatusStore | ✅ Done | `titan-brain/src/services/venues/` |
| VenuesController live wiring | ✅ Done | Feature flag: `VENUES_TELEMETRY_LIVE` |
| Rust ExchangeAdapter trait | ✅ Exists | `titan-execution-rs/src/exchange/adapter.rs` |
| Rust OrderRequest/Response | ✅ Exists | Same file |
| Rust IntentEnvelope | ✅ Exists | `titan-execution-rs/src/contracts.rs` |

---

## Venue Support Matrix

| Venue | Spot | Perps | Options | WS Client | Status |
|-------|------|-------|---------|-----------|--------|
| Binance | ✅ | ✅ | ⚪ | ✅ | Live in Hunter |
| Bybit | ✅ | ✅ | ✅ | ✅ | Live in Hunter |
| Coinbase | ✅ | ❌ | ❌ | ✅ | Live in Hunter |
| Kraken | ✅ | ✅ | ❌ | ✅ | Live in Hunter |
| MEXC | ✅ | ✅ | ❌ | ✅ | Live in Hunter |
| Hyperliquid | ❌ | ✅ | ❌ | ✅ | Live in Hunter |
| Deribit | ❌ | ✅ | ⏳ | ⏳ | In progress |
| OKX | ⚪ | ⚪ | ⚪ | ❌ | Planned |

Legend: ✅ Implemented | ⏳ In Progress | ⚪ Not Yet | ❌ Not Supported

---

## File Locations

### @titan/shared
```
packages/shared/src/
├── types/
│   └── venues.ts          # VenueId, VenueCapabilities, VenueWsState, VenueRecommendedAction
├── schemas/
│   └── venue-status.ts    # VenueStatusV1Schema, safeParseVenueStatusV1, staleness utils
└── messaging/
    └── titan_subjects.ts  # DATA.VENUES.STATUS subject
```

### Hunter (titan-phase2-hunter)
```
services/titan-phase2-hunter/src/
├── telemetry/
│   ├── VenueStatusPublisher.ts  # Publishes VenueStatusV1 to NATS
│   └── index.ts
└── global-liquidity/
    └── ExchangeWebSocketClient.ts  # WS connections per venue
```

### Brain (titan-brain)
```
services/titan-brain/src/
├── services/venues/
│   ├── VenueStatusStore.ts  # NATS consumer, caches status
│   └── index.ts
└── server/controllers/
    └── VenuesController.ts  # REST API with live/simulated toggle
```

### Rust Execution (titan-execution-rs)
```
services/titan-execution-rs/src/
├── exchange/
│   └── adapter.rs         # ExchangeAdapter trait, OrderRequest/Response
├── contracts.rs           # IntentEnvelope, Payload, Status enums
├── adapters/              # (to scaffold)
└── nats_engine.rs         # NATS integration
```

---

## Remaining Work

### Phase 1: Shared Schemas (HIGH PRIORITY)
- [ ] `MarketTradeV1` - Normalized trade event schema
- [ ] `normalizeSymbol(venue, rawSymbol, type)` - Symbol standardization

### Phase 2: NATS Topology
- [ ] Stream: `TITAN_VENUES_STATUS_V1` (max_age 30m)
- [ ] KV: `TITAN_KV_VENUES_STATUS_V1`
- [ ] Stream: `TITAN_MARKETDATA_V1`

### Phase 3: Hunter Enhancements
- [ ] Market trade publisher to NATS
- [ ] KV snapshot writes
- [ ] Prometheus metrics

### Phase 4: Brain Enhancements
- [ ] KV bootstrap on startup
- [ ] `/venues/summary` endpoint
- [ ] Prometheus metrics

### Phase 5: Rust Scaffolding
- [ ] Enhanced `ExchangeExecutionAdapter` trait
- [ ] `AccountStateV1` struct
- [ ] DEX determinism gates
- [ ] Stub adapter tests

### Phase 6: Integration Tests
- [ ] Local NATS + Hunter + Brain E2E
- [ ] Rust adapter unit tests
