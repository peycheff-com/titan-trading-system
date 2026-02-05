# Titan Connectivity Layer - Schemas

## Overview

All schemas live in `packages/shared/src/schemas/` and are validated with Zod.

---

## VenueStatusV1

**Location**: `venue-status.ts`

```typescript
interface VenueStatusV1 {
  venue: VenueId;
  state: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';
  timestamp: number;
  lastMessageTime: number;
  messageCount: number;
  latencyP50Ms?: number;
  latencyP99Ms?: number;
  errorCount: number;
  parseErrors: number;
}
```

---

## MarketTradeV1

**Location**: `market-trade.ts`

```typescript
interface MarketTradeV1 {
  venue: VenueId;
  symbol: string;      // Canonical format: BTC/USDT
  side: 'buy' | 'sell';
  price: string;       // Decimal string
  quantity: string;    // Decimal string
  timestamp: number;   // Epoch ms
  tradeId: string;
  exchange_ts?: number;
}
```

---

## Symbol Normalization

**Location**: `normalize-symbol.ts`

| Function | Purpose |
|----------|---------|
| `normalizeSymbol(venue, raw)` | Raw → Canonical (e.g., `BTCUSDT` → `BTC/USDT`) |
| `denormalizeSymbol(venue, canonical)` | Canonical → Exchange-native |

Tested with 33 unit tests covering all supported venues.
