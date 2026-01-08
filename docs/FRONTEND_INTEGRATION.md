# Frontend Integration Guide for Titan Trading System

This guide details how to build and integrate a new frontend user interface with
the Titan Trading System backend.

## Architecture Overview

The Titan system operates as a "Headless" backend. The frontend connects to the
backend services via REST APIs and WebSockets.

**Core Services:**

1. **Titan Execution** (Port `8080`)
   - **Role**: Trade execution, order management, real-time market data
     processing.
   - **Base URL**: `http://localhost:8080`
2. **Titan Brain** (Port `3100`)
   - **Role**: Strategy orchestration, risk management, signal processing.
   - **Base URL**: `http://localhost:3100`

## Development Setup

### 1. CORS Configuration

The backend services are configured to accept requests from
`http://localhost:3000` (Next.js default) and `http://localhost:5173` (Vite
default) by default.

To add more origins, update the `CORS_ORIGINS` environment variable in your
`.env` file or `services/titan-execution/utils/constants.js`.

### 2. Authentication

- **API Endpoints**: Most control endpoints require HMAC authentication (if
  `HMAC_SECRET` is set).
  - Header: `x-titan-signature` (SHA256 HMAC of the request body/params signed
    with your secret).
- **WebSockets**: Currently open for local network/configured origins.

## API Integration Points

### 1. Titan Execution Service (`:8080`)

**REST Endpoints:**

- `GET /health`: Service health check.
- `GET /api/state`: Get current system state (positions, equity).
- `GET /api/orders`: List active orders.
- `POST /api/orders`: Submit a new order.
- `DELETE /api/orders/:id`: Cancel an order.

**WebSockets:**

- **System Status**: `ws://localhost:8080/ws/status`
  - Receives: Order fills, cancellations, errors, heartbeat.
- **Console Status**: `ws://localhost:8080/ws/console`
  - Receives: Real-time equity updates, PnL, active position summaries.
- **Scavenger Status**: `ws://localhost:8080/ws/scavenger`
  - Receives: Phase 1 high-frequency trading events.

### 2. Titan Brain Service (`:3100`)

**REST Endpoints:**

- `GET /status`: Brain service health.
- `GET /dashboard`: Aggregated dashboard data (allocation, risk metrics).
- `GET /allocation`: Current capital allocation across phases.
- `POST /signal`: Manual signal injection.
- `POST /webhook/phase{1,2,3}`: Webhook endpoints for external signal
  generators.

## Data Structures

### WebSocket: Console Update

```json
{
    "equity": 10500.50,
    "daily_pnl": 150.25,
    "daily_pnl_pct": 1.45,
    "active_positions": 2,
    "phase": "PHASE_1",
    "master_arm": true,
    "positions": [
        {
            "symbol": "BTCUSDT",
            "side": "Buy",
            "size": 0.5,
            "unrealized_pnl": 50.00
        }
    ]
}
```

### WebSocket: Order Event

```json
{
    "type": "ORDER_FILLED",
    "data": {
        "symbol": "ETHUSDT",
        "side": "Sell",
        "price": 2400.50,
        "size": 1.2
    }
}
```

## Best Practices

1. **Polling vs. Sockets**: Use WebSockets for real-time price/PnL components.
   Use REST for initial state loading or actionable commands (buttons).
2. **Error Handling**: Handle WebSocket disconnections gracefully with
   auto-reconnection logic.
3. **Type Safety**: Mirror the TypeScript interfaces found in
   `services/shared/src/types` for strict typing in your frontend.
