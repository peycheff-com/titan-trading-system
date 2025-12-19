# Titan Trading System - Unified Architecture

## System Overview

Titan is a **Bio-Mimetic Trading Organism** that evolves its behavior based on available capital. It consists of 5 operational phases orchestrated by a central Brain, with each phase optimized for specific capital ranges and market conditions.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TITAN BRAIN (Phase 5)                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Capital Allocation | Risk Management | Phase Transitions         │   │
│  │ Global Config | Telemetry Aggregation | Emergency Controls       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SHARED INFRASTRUCTURE                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ WebSocket    │  │ Execution    │  │   Telemetry & Logging        │  │
│  │ Manager      │  │ Service      │  │   (Centralized)              │  │
│  │ (Binance/    │  │ (Bybit/MEXC) │  │                              │  │
│  │  Bybit)      │  │              │  │                              │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┬──────────────────┐
        ▼                     ▼                     ▼                  ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  PHASE 1     │    │  PHASE 2     │    │  PHASE 3     │    │  PHASE 4     │
│  Scavenger   │    │  Hunter      │    │  Sentinel    │    │  AI Quant    │
│              │    │              │    │              │    │              │
│ $200-$5K     │    │ $2.5K-$50K   │    │ $50K+        │    │ Optimizer    │
│ 15-20x Lev   │    │ 3-5x Lev     │    │ Market-Neut  │    │ (Offline)    │
│ Trap System  │    │ Holographic  │    │ Basis Arb    │    │ Param Tuning │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

## Phase Breakdown

### Phase 1: The Scavenger ($200 → $5,000)
**Capital Range**: $200 - $5,000  
**Leverage**: 15-20x  
**Strategy**: Predestination Engine (Trap System)  
**Targets**: 2-5% per trade  
**Frequency**: 10-20 trades/day  
**Technology**: TypeScript (Node.js)

**Core Logic**:
- Pre-calculates structural breakout levels (liquidation clusters, daily levels, Bollinger bands)
- Monitors Binance Spot for validation signals
- Executes on Bybit Perps with Market/Aggressive Limit orders
- Exploits structural flaws: OI Wipeouts, Funding Squeezes, Basis Arb

**Key Components**:
- `TitanTrap.ts`: Core trap engine
- `TripwireCalculators.ts`: Structural level detection
- `BinanceSpotClient.ts`: Signal validation
- `BybitPerpsClient.ts` + `MEXCPerpsClient.ts`: Execution
- `ExchangeGateway.ts`: Multi-exchange orchestration

### Phase 2: The Hunter ($2,500 → $50,000)
**Capital Range**: $2,500 - $50,000  
**Leverage**: 3-5x  
**Strategy**: Holographic Market Structure Engine  
**Targets**: 3:1 R:R (1.5% stop, 4.5% target)  
**Frequency**: 2-5 trades/day  
**Technology**: TypeScript (Node.js)

**Core Logic**:
- Multi-timeframe fractal analysis (Daily, 4H, 15m)
- Veto logic (Premium/Discount zones)
- Session profiling (Judas Swing at London/NY opens)
- POI detection (FVG, Order Blocks, Liquidity Pools)
- CVD absorption validation
- Post-Only Limit Orders at Order Blocks (Maker rebates)

**Key Components**:
- `FractalMath.ts`: Bill Williams fractal detection
- `HologramEngine.ts`: Multi-timeframe state machine
- `SessionProfiler.ts`: Time-based logic
- `InefficiencyMapper.ts`: POI detection
- `CVDValidator.ts`: Order flow confirmation
- `LimitOrderExecutor.ts`: Passive execution

### Phase 3: The Sentinel ($50,000+)
**Capital Range**: $50,000+  
**Leverage**: 1-3x  
**Strategy**: Market-Neutral Basis Arbitrage  
**Targets**: 0.5-2% per trade  
**Frequency**: Continuous (basis scalping)  
**Technology**: TypeScript (Node.js)

**Core Logic**:
- Delta-neutral hedging (Spot + Perps)
- Basis expansion/contraction scalping
- Funding rate arbitrage
- Systematic position sizing
- Portfolio management

**Key Components**:
- `BasisScalper.ts`: Basis trading engine
- `DeltaHedger.ts`: Neutrality maintenance
- `FundingArbitrage.ts`: Funding rate exploitation
- `PortfolioManager.ts`: Multi-asset management

### Phase 4: The AI Quant (Offline Optimizer)
**Capital Range**: N/A (advises Phase 1 & 2)  
**Strategy**: Parameter Optimization Engine  
**Technology**: Python (scikit-learn, optuna)

**Core Logic**:
- Analyzes last 24 hours of market microstructure
- Predicts optimal parameter configurations
- Runs offline (zero latency impact)
- Advises Phase 1 & 2 on parameter adjustments

**Key Components**:
- `ParameterOptimizer.py`: ML-based optimization
- `MicrostructureAnalyzer.py`: Market feature extraction
- `BacktestValidator.py`: Configuration validation

### Phase 5: The Brain (Master Orchestrator)
**Capital Range**: All phases  
**Strategy**: Hierarchical State Machine  
**Technology**: TypeScript (Node.js)

**Core Logic**:
- Capital allocation across phases
- Global risk management
- Phase transition logic
- Emergency controls (panic button)
- Telemetry aggregation

**Key Components**:
- `BrainOrchestrator.ts`: Master state machine
- `CapitalAllocator.ts`: Phase-based allocation
- `GlobalRiskManager.ts`: System-wide risk
- `PhaseTransitioner.ts`: Automatic phase switching
- `TelemetryAggregator.ts`: Unified logging

## Shared Infrastructure

### 1. WebSocket Manager (Centralized)
**Purpose**: Manage all WebSocket connections to avoid duplicate streams

**Responsibilities**:
- Single Binance Spot WebSocket connection (shared by Phase 1 & 2)
- Single Bybit WebSocket connection (shared by all phases)
- Reconnection logic with exponential backoff
- Message routing to phase-specific handlers

**Implementation**:
```typescript
// services/shared/WebSocketManager.ts
class WebSocketManager {
  private binanceWS: WebSocket;
  private bybitWS: WebSocket;
  private subscribers: Map<string, Set<(data: any) => void>>;
  
  // Subscribe to symbol updates
  subscribe(exchange: 'binance' | 'bybit', symbol: string, callback: (data: any) => void): void
  
  // Unsubscribe from symbol updates
  unsubscribe(exchange: 'binance' | 'bybit', symbol: string, callback: (data: any) => void): void
  
  // Reconnection logic
  private reconnect(exchange: 'binance' | 'bybit'): void
}
```

### 2. Execution Service (Unified)
**Purpose**: Centralized order execution with rate limiting and error handling

**Responsibilities**:
- Order placement on Bybit/MEXC
- Rate limiting (10 req/s per exchange)
- Order status tracking
- Fill confirmation
- Retry logic with exponential backoff

**Implementation**:
```typescript
// services/shared/ExecutionService.ts
class ExecutionService {
  private bybitClient: BybitPerpsClient;
  private mexcClient: MEXCPerpsClient;
  private rateLimiter: RateLimiter;
  
  // Place order with automatic exchange selection
  async placeOrder(params: OrderParams): Promise<OrderResult>
  
  // Cancel order
  async cancelOrder(orderId: string, exchange: 'bybit' | 'mexc'): Promise<void>
  
  // Get order status
  async getOrderStatus(orderId: string, exchange: 'bybit' | 'mexc'): Promise<OrderStatus>
}
```

### 3. Telemetry & Logging (Centralized)
**Purpose**: Unified logging and metrics aggregation

**Responsibilities**:
- Centralized `trades.jsonl` logging
- Phase-specific log tagging
- Metrics aggregation for Brain
- Log rotation and compression

**Implementation**:
```typescript
// services/shared/TelemetryService.ts
class TelemetryService {
  private logStream: WriteStream;
  
  // Log signal with phase tag
  logSignal(phase: 'phase1' | 'phase2' | 'phase3', signal: SignalData): void
  
  // Log execution with phase tag
  logExecution(phase: 'phase1' | 'phase2' | 'phase3', execution: ExecutionData): void
  
  // Aggregate metrics for Brain
  getMetrics(phase: 'phase1' | 'phase2' | 'phase3', timeRange: TimeRange): Metrics
}
```

## Configuration Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Brain Global Config                          │
│  - Max total leverage across all phases                        │
│  - Global drawdown limits                                       │
│  - Emergency flatten thresholds                                 │
│  - Phase transition rules                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Phase 1     │    │  Phase 2     │    │  Phase 3     │
│  Config      │    │  Config      │    │  Config      │
│              │    │              │    │              │
│ - Trap       │    │ - Alignment  │    │ - Basis      │
│   params     │    │   weights    │    │   thresholds │
│ - Leverage   │    │ - RS thresh  │    │ - Funding    │
│ - Targets    │    │ - Risk mgmt  │    │   targets    │
└──────────────┘    └──────────────┘    └──────────────┘
```

**Config Precedence**:
1. Brain Global Config (highest priority)
2. Phase-Specific Config
3. Strategy-Specific Config (lowest priority)

**Example**:
- If Brain sets `maxTotalLeverage: 50x`, Phase 1 cannot exceed this even if its config says `maxLeverage: 20x`
- If Brain triggers emergency flatten, all phases must comply immediately

## Risk Management Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Brain Risk Manager                           │
│  - Total portfolio drawdown: 15% → Emergency Flatten            │
│  - Total leverage: 50x max across all phases                    │
│  - Correlation limits: 0.8 max between phases                   │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Phase 1     │    │  Phase 2     │    │  Phase 3     │
│  Risk Mgmt   │    │  Risk Mgmt   │    │  Risk Mgmt   │
│              │    │              │    │              │
│ - Daily DD:  │    │ - Daily DD:  │    │ - Daily DD:  │
│   3%/5%/7%   │    │   3%/5%/7%   │    │   2%/4%/6%   │
│ - Max pos:   │    │ - Max pos:   │    │ - Max pos:   │
│   50% equity │    │   25% equity │    │   100% equity│
└──────────────┘    └──────────────┘    └──────────────┘
```

**Risk Escalation**:
1. Phase-level risk manager detects issue → Reduces position sizes
2. If issue persists → Halts new entries
3. If issue escalates → Reports to Brain
4. Brain evaluates global impact → May trigger emergency flatten

## Data Flow

### Signal Generation Flow
```
1. Phase detects opportunity
2. Phase validates with local rules
3. Phase requests execution from ExecutionService
4. ExecutionService checks Brain approval
5. Brain validates against global limits
6. If approved, ExecutionService places order
7. Fill confirmation sent to Phase and Brain
8. TelemetryService logs execution
```

### WebSocket Data Flow
```
1. WebSocketManager receives tick from Binance/Bybit
2. WebSocketManager routes to subscribed phases
3. Phase 1 uses for trap detection
4. Phase 2 uses for CVD calculation
5. Phase 3 uses for basis monitoring
```

### Configuration Update Flow
```
1. User updates config via Brain UI
2. Brain validates config against global limits
3. Brain pushes config to affected phases
4. Phases apply config hot-reload
5. TelemetryService logs config change
```

## Technology Stack

| Component | Language | Framework | Purpose |
|-----------|----------|-----------|---------|
| Phase 1 - Scavenger | TypeScript | Node.js | Trap system |
| Phase 2 - Hunter | TypeScript | Node.js | Holographic engine |
| Phase 3 - Sentinel | TypeScript | Node.js | Basis arbitrage |
| Phase 4 - AI Quant | Python | scikit-learn, optuna | Parameter optimization |
| Phase 5 - Brain | TypeScript | Node.js | Orchestration |
| Shared Infrastructure | TypeScript | Node.js | WebSocket, Execution, Telemetry |
| Console UI | TypeScript | Ink + React | Terminal dashboard |

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Production Server (VPS)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ PM2 Process Manager                                      │   │
│  │  - titan-brain (master)                                  │   │
│  │  - titan-phase1 (child)                                  │   │
│  │  - titan-phase2 (child)                                  │   │
│  │  - titan-phase3 (child)                                  │   │
│  │  - titan-shared (WebSocket, Execution, Telemetry)       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Offline Optimizer (Cron Job)                             │   │
│  │  - titan-ai-quant (runs every 6 hours)                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Inter-Process Communication

**Method**: Redis Pub/Sub + Shared Memory

**Channels**:
- `titan:signals` - Signal generation events
- `titan:executions` - Order execution events
- `titan:risk` - Risk management events
- `titan:config` - Configuration updates
- `titan:telemetry` - Metrics and logging

**Shared Memory**:
- `titan:equity` - Current equity (updated every 5s)
- `titan:positions` - Open positions across all phases
- `titan:risk_state` - Current risk state (drawdown, leverage, etc.)

## Emergency Controls

**Panic Button** (Triggered by Brain):
1. Halt all new entries across all phases
2. Close all open positions with Market Orders
3. Disable all phases
4. Send alert to user
5. Log emergency event

**Triggers**:
- Total portfolio drawdown > 15%
- Unexpected API errors (exchange downtime)
- User manual trigger (keyboard shortcut)

## Monitoring & Alerting

**Metrics Tracked**:
- Equity curve (real-time)
- Drawdown (current, max)
- Win rate (per phase, global)
- Profit factor (per phase, global)
- Sharpe ratio (rolling 30-day)
- Open positions (count, notional)
- Leverage (per phase, global)
- Correlation (between phases)

**Alerts**:
- Drawdown > 10% (warning)
- Drawdown > 15% (critical)
- Win rate < 40% over 20 trades (warning)
- Exchange API errors (critical)
- WebSocket disconnections (warning)

## File Structure

```
titan/
├── services/
│   ├── shared/
│   │   ├── WebSocketManager.ts
│   │   ├── ExecutionService.ts
│   │   ├── TelemetryService.ts
│   │   └── RateLimiter.ts
│   ├── titan-brain/
│   │   ├── BrainOrchestrator.ts
│   │   ├── CapitalAllocator.ts
│   │   ├── GlobalRiskManager.ts
│   │   └── PhaseTransitioner.ts
│   ├── titan-phase1-scavenger/
│   │   └── [Phase 1 implementation]
│   ├── titan-phase2-hunter/
│   │   └── [Phase 2 implementation]
│   ├── titan-phase3-sentinel/
│   │   └── [Phase 3 implementation]
│   └── titan-phase4-ai-quant/
│       └── [Phase 4 implementation]
├── config/
│   ├── brain.config.json
│   ├── phase1.config.json
│   ├── phase2.config.json
│   └── phase3.config.json
├── logs/
│   └── trades.jsonl (centralized)
└── README.md
```

## Next Steps

1. **Implement Shared Infrastructure** (WebSocketManager, ExecutionService, TelemetryService)
2. **Refactor Phase 1 & 2** to use shared infrastructure
3. **Implement Brain Orchestrator** with capital allocation logic
4. **Implement Phase 3 (Sentinel)** for market-neutral strategies
5. **Implement Phase 4 (AI Quant)** for parameter optimization
6. **Integration Testing** across all phases
7. **Production Deployment** with PM2 process management
