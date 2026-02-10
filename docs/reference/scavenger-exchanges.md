# Exchange Clients

This directory contains exchange client implementations for the Titan Phase 1 Scavenger (Predestination Engine).

## ⚠️ IMPORTANT: Execution Refactored (December 6, 2024)

**ExchangeGateway, BybitPerpsClient, and MEXCPerpsClient have been REMOVED** as part of the Hub-and-Spoke architecture integration (Task 1.7).

All order execution now goes through the **unified Execution Service** via Fast Path IPC (Unix Domain Socket).

## Overview

The Predestination Engine now uses a **Signal-Only** architecture:
- **Binance Spot** (Signal Validator): Confirms breakouts with volume - **KEPT**
- **Fast Path IPC** (Execution): Sends PREPARE/CONFIRM/ABORT signals to Execution Service - **NEW**
- **Execution Service** (Hub): Handles all order placement, position tracking, risk management - **CENTRALIZED**

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Detection Layer (The Spider)                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  BinanceSpotClient (Signal Validator)                    │   │
│  │  - WebSocket AggTrades subscription                      │   │
│  │  - Volume validation (50+ trades in 100ms)               │   │
│  │  - Reconnection logic (3 retries, 2s delay)              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│                      TRAP_SPRUNG event                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Execution Layer (The Bite)                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  BybitPerpsClient (Primary Execution)                    │   │
│  │  - Market data (OHLCV, OI, funding, volume)              │   │
│  │  - Order placement with HMAC signature                   │   │
│  │  - Leverage and risk management                          │   │
│  │  - 2-second timeout protection                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  MEXCPerpsClient (Alternative Execution)                 │   │
│  │  - Order placement with MEXC-specific format             │   │
│  │  - HMAC signature authentication                         │   │
│  │  - Rate limiting (10 req/s with queuing)                 │   │
│  │  - 2-second timeout protection                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Client Implementations

### BinanceSpotClient (KEPT)

**Purpose**: Signal validator using Binance Spot WebSocket

**Key Features**:
- Real-time AggTrades WebSocket subscription
- Volume validation (50+ trades in 100ms)
- Automatic reconnection (3 retries, 2s delay)
- Callback system for trade events

**Usage**:
```typescript
const client = new BinanceSpotClient();

// Subscribe to symbols
await client.subscribeAggTrades(['BTCUSDT', 'ETHUSDT']);

// Register callback for trade events
client.onTrade('BTCUSDT', (trades) => {
  console.log(`Received ${trades.length} trades`);
});
```

### BybitPerpsClient (REMOVED - Task 1.7)

**Reason**: Execution now handled by unified Execution Service

**Replacement**: Fast Path IPC → Execution Service → BrokerGateway → Bybit

### MEXCPerpsClient (REMOVED - Task 1.7)

**Reason**: Execution now handled by unified Execution Service

**Replacement**: Fast Path IPC → Execution Service → BrokerGateway → MEXC

### ExchangeGateway (REMOVED - Task 1.7)

**Reason**: Multi-exchange orchestration now handled by Execution Service

**Replacement**: Fast Path IPC sends PREPARE/CONFIRM/ABORT signals to Execution Service, which handles all execution logic

## Rate Limiting

### Binance Spot (KEPT)
- No explicit rate limiting (WebSocket)
- Automatic reconnection on disconnect

### Execution Service (NEW)
- Global rate limiting handled by Execution Service
- Bybit: 120 req/s per IP
- MEXC: 10 req/s with queuing
- All rate limiting centralized in BrokerGateway

## Error Handling

### BinanceSpotClient (KEPT)
- **Timeout Protection**: WebSocket reconnection
- **Error Logging**: Detailed error messages with context
- **Graceful Degradation**: Continue operating on disconnect

### Execution Service (NEW)
- **Timeout Protection**: 2-second timeout on order placement
- **Error Logging**: Centralized logging via TelemetryService
- **Graceful Degradation**: Shadow State prevents ghost positions

## Testing

Remaining tests:
- `BinanceSpotClient.test.ts`: WebSocket subscription, reconnection, callbacks

Removed tests (execution now in Execution Service):
- ~~`BybitPerpsClient.test.ts`~~ (REMOVED - Task 1.7)
- ~~`MEXCPerpsClient.test.ts`~~ (REMOVED - Task 1.7)
- ~~`ExchangeGateway.test.ts`~~ (REMOVED - Task 1.7)

Run tests:
```bash
npm test -- BinanceSpotClient.test.ts
```

## Requirements Coverage

### BinanceSpotClient (KEPT)
- ✅ 3.1-3.7: Detection Layer (WebSocket monitoring, volume validation)

### Execution Service (NEW - Task 1.7)
- ✅ 2.1: Fetch OHLCV data for tripwire calculation (via BrokerGateway)
- ✅ 4.1-4.7: Execution Layer (order placement, risk management)
- ✅ 10.1-10.7: Multi-Exchange support (via BrokerGateway)
- ✅ Robustness #5: Order timeout protection
- ✅ Rate limiting (10 req/s MEXC, 120 req/s Bybit)
- ✅ HMAC signature authentication
- ✅ Shadow State (prevents ghost positions)
- ✅ Phase Manager (automatic phase transitions)

## Next Steps

1. ✅ **Task 1.7**: Remove duplicate exchange execution from Scavenger (COMPLETED)
2. **Task 1.8-1.10**: Implement Fast Path IPC Client in Scavenger
3. **Task 1.11**: Add headless mode to Scavenger
4. **Task 1.12-1.14**: Console integration (Phase 1 Tab)
5. **Task 1.15-1.20**: Startup scripts and end-to-end testing
