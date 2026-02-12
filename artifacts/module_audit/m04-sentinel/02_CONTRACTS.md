# M04 Contracts

## 1. NATS Subjects

### Inbound (Subscribed)
- `market.data.*` (Market Data)
- `system.regime.update` (Regime Changes)
- `budget.update` (Capital Allocation)

### Outbound (Published)
- `execution.order.new` (Order Submission)
- `system.phase.posture.sentinel` (Heartbeat/Status)
- `system.phase.diagnostics.sentinel` (Health/Metrics)

## 2. API Entities

### SentinelConfig
```typescript
interface SentinelConfig {
  updateIntervalMs: number;
  symbol: string;
  initialCapital: number;
  riskLimits: {
    maxDrawdown: number;
    maxLeverage: number;
    maxDelta: number;
  };
}
```

### SentinelState
```typescript
interface SentinelState {
  health: HealthReport;
  metrics: PerformanceMetrics;
  signals: Signal[];
  prices: { spot: number; perp: number; basis: number };
}
```

## 3. External Dependencies
- **Binance/Bybit**: Exchange Gateways via `IExchangeGateway`
- **Polymarket**: Prediction market data
- **NATS**: Messaging backbone
