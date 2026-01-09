# Titan Trading System

## Overview

Titan is a **Bio-Mimetic Trading Organism** - a 5-phase algorithmic trading system that evolves its behavior based on available capital. Each phase is optimized for specific capital ranges and market conditions, orchestrated by a central Brain that manages risk, capital allocation, and phase transitions.

## System Components

| Component | Description | Capital Range | Technology |
|-----------|-------------|---------------|------------|
| **Phase 1 - Scavenger** | Predestination trap system | $200 → $5K | TypeScript + Ink |
| **Phase 2 - Hunter** | Holographic market structure | $2.5K → $50K | TypeScript + Ink |
| **Phase 3 - Sentinel** | Market-neutral basis arbitrage | $50K+ | TypeScript + Ink |
| **Phase 4 - AI Quant** | AI-powered parameter optimization | N/A (advisor) | TypeScript + Gemini AI |
| **Phase 5 - Brain** | Master orchestrator | All phases | TypeScript + Fastify + PostgreSQL |
| **Titan Execution** | Order execution microservice | All phases | JavaScript + Fastify |
| **Titan Console** | Web monitoring dashboard | N/A | React + Vite + Tailwind |
| **Shared Infrastructure** | Common services | All phases | TypeScript |

## Phase Details

### Phase 1: The Scavenger ($200 → $5,000)

**Strategy**: Predestination Engine (Trap System)
- Pre-calculates structural breakout levels (liquidation clusters, daily levels, Bollinger bands)
- Monitors Binance Spot for validation signals
- Executes on Bybit Perps with Market/Aggressive Limit orders

**Key Features**:
- 15-20x leverage
- 2-5% targets per trade
- 10-20 trades/day frequency
- OI Wipeout, Funding Squeeze, Basis Arb detection

**Risk Management**:
- 2% risk per trade
- 7% daily drawdown limit
- 50% max position size

### Phase 2: The Hunter ($2,500 → $50,000)

**Strategy**: Holographic Market Structure Engine
- Multi-timeframe fractal analysis (Daily, 4H, 15m)
- Veto logic (Premium/Discount zones)
- Session profiling (Judas Swing at London/NY opens)
- POI detection (FVG, Order Blocks, Liquidity Pools)

**Key Features**:
- 3-5x leverage
- 3:1 R:R (1.5% stop, 4.5% target)
- 2-5 trades/day frequency
- Post-Only Limit Orders for maker rebates

**Risk Management**:
- 1.5% risk per trade
- 5% daily drawdown limit
- 25% max position size

### Phase 3: The Sentinel ($50,000+)

**Strategy**: Market-Neutral Basis Arbitrage
- Delta-neutral hedging (Spot + Perps)
- Basis expansion/contraction scalping
- Funding rate arbitrage
- Vacuum arbitrage during liquidation events

**Key Features**:
- 1-3x leverage
- 0.5-2% targets per trade
- Continuous trading (basis scalping)
- Systematic position sizing

**Risk Management**:
- 0.5% risk per trade
- 3% daily drawdown limit
- 100% max position (delta-neutral)

### Phase 4: The AI Quant (Offline Optimizer)

**Strategy**: AI-Powered Parameter Optimization
- Analyzes last 24 hours of market microstructure
- Uses Gemini 1.5 Flash for pattern recognition
- Predicts optimal parameter configurations
- Backtests proposals before applying

**Key Features**:
- TypeScript + Gemini AI (NOT Python)
- SQLite-based Strategic Memory
- Human-in-the-loop approval workflow
- Zero latency impact (runs offline)

**Components**:
- TitanAnalyst: AI analysis engine
- GeminiClient: Gemini API integration
- Guardrails: Safety validation
- Backtester: Proposal validation
- StrategicMemory: Learning system

### Phase 5: The Brain (Master Orchestrator)

**Strategy**: Hierarchical Decision-Making
- Capital allocation across phases (sigmoid transitions)
- Global risk management with circuit breakers
- Phase transition logic based on equity tiers
- Emergency controls (panic button)

**Key Features**:
- TypeScript + Fastify + PostgreSQL
- Prometheus metrics
- WebSocket status monitoring
- Signal queue with idempotency

**Components**:
- TitanBrain: Master orchestrator
- AllocationEngine: Sigmoid-based allocation
- PerformanceTracker: Rolling Sharpe ratios
- RiskGuardian: Correlation & leverage monitoring
- CircuitBreaker: Emergency halt system

## Supporting Services

### Titan Execution (Microservice)

**Purpose**: Centralized order execution with safety features

**Key Features**:
- HMAC webhook authentication
- Shadow State position tracking (Master of Truth)
- L2 order book validation via WebSocket cache
- Multi-exchange adapters (Bybit, MEXC, Binance)
- Limit Chaser algorithm for aggressive fills

**Components**:
- ShadowState: Position state tracker
- L2Validator: Order book validation
- BrokerGateway: Order execution
- Reconciliation: Broker state sync
- Heartbeat: Dead man's switch

### Titan Console (Web Dashboard)

**Purpose**: Real-time monitoring and control

**Technology Stack**:
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui
- Real-time WebSocket updates

**Features**:
- Live operations monitoring
- Phase status and metrics
- Settings management
- Responsive design

### Shared Infrastructure

**Purpose**: Common services used by all phases

**Components**:
- WebSocketManager: Centralized WebSocket connections
- ExecutionService: Unified order execution
- TelemetryService: Centralized logging
- ConfigManager: Hierarchical configuration
- AdvancedOrderRouter: Smart order routing
- DistributedStateManager: Distributed state
- HighFrequencyProcessor: HFT data processing
- LoadBalancer: Service load balancing
- NetworkOptimizer: Network optimization
- PerformanceMonitor: Performance metrics
- ResourceOptimizer: Resource management
- ServiceDiscovery: Service discovery

## Equity Tiers & Allocation

| Tier | Equity Range | Phase 1 | Phase 2 | Phase 3 | Max Leverage |
|------|--------------|---------|---------|---------|--------------|
| MICRO | < $1,500 | 100% | 0% | 0% | 20x |
| SMALL | $1,500 - $5,000 | 80% → 20% | 20% → 80% | 0% | 10x |
| MEDIUM | $5,000 - $25,000 | 20% | 80% | 0% | 5x |
| LARGE | $25,000 - $50,000 | 20% | 60% → 40% | 20% → 40% | 3x |
| INSTITUTIONAL | > $50,000 | 10% | 40% | 50% | 2x |

## Risk Management Hierarchy

```
Brain Risk Manager
├── Total portfolio drawdown: 15% → Emergency Flatten
├── Total leverage: 50x max across all phases
└── Correlation limits: 0.8 max between phases
    │
    ├── Phase 1 Risk Manager
    │   ├── Daily drawdown: 3%/5%/7%
    │   └── Max position: 50% equity
    │
    ├── Phase 2 Risk Manager
    │   ├── Daily drawdown: 3%/5%/7%
    │   └── Max position: 25% equity
    │
    └── Phase 3 Risk Manager
        ├── Daily drawdown: 2%/4%/6%
        └── Max position: 100% equity (delta-neutral)
```

## Configuration Hierarchy

```
Brain Global Config (highest priority)
├── Phase 1 Config
├── Phase 2 Config
└── Phase 3 Config (lowest priority)
```

**Precedence Rules**:
- Brain can override any phase-level setting
- Brain enforces global limits (max leverage, drawdown)
- Phases cannot exceed Brain's global constraints

## Emergency Controls

**Circuit Breaker Types**:
- **HARD Trigger**: 15% daily drawdown OR equity < $150 → Immediate halt + close all
- **SOFT Trigger**: 3 consecutive losses → 30-minute cooldown

**Panic Button** (Brain-triggered):
1. Halt all new entries across all phases
2. Close all open positions with Market Orders
3. Disable all phases
4. Send alert to user
5. Log emergency event

## Deployment

**Production Setup**:
- Railway for backend services (auto-deployed from main branch)
- Supabase PostgreSQL (Seoul region)
- PM2 for local/VPS process management

**Services**:
- titan-brain (API: 3100)
- titan-execution (API: 3002)
- titan-console (Web: 8080)
- titan-ai-quant (API: 3200)
- titan-phase1-scavenger
- titan-phase2-hunter
- titan-phase3-sentinel

## Key Design Principles

1. **Separation of Concerns**: Each phase is independent but coordinated by Brain
2. **Shared Infrastructure**: Avoid duplicate WebSocket connections and execution logic
3. **Hierarchical Risk**: Brain can override any phase-level risk decision
4. **Centralized Logging**: All phases log to single `trades.jsonl` with phase tags
5. **Hot-Reload Config**: All phases support runtime configuration updates
6. **Emergency Controls**: Brain can flatten all positions across all phases instantly
7. **Intent Signals**: Phases send signals, ExecutionService handles execution
8. **Shadow State**: Brain maintains global position state as Master of Truth

## Integration Points

**Phase → Shared Infrastructure**:
- WebSocketManager for real-time data
- ExecutionService for order placement
- TelemetryService for logging
- ConfigManager for configuration

**Phase → Brain**:
- Report risk events
- Request execution approval
- Receive configuration updates

**Brain → Phase**:
- Emergency flatten commands
- Configuration updates
- Phase enable/disable

**Phase 4 → Brain**:
- Outputs optimized parameters to config files
- Brain reads and applies parameter updates
