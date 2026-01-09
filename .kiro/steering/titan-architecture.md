# Titan Trading System - Unified Architecture

## System Overview

Titan is a **Bio-Mimetic Trading Organism** that evolves its behavior based on available capital. It consists of 5 operational phases orchestrated by a central Brain, with each phase optimized for specific capital ranges and market conditions.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TITAN BRAIN (Phase 5)                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Capital Allocation | Risk Management | Phase Transitions         │   │
│  │ Signal Queue | Circuit Breaker | Performance Tracking            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    TITAN EXECUTION (Microservice)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ Shadow State │  │ L2 Validator │  │   Exchange Adapters          │  │
│  │ (Position    │  │ (Order Book  │  │   (Bybit/MEXC/Binance)       │  │
│  │  Tracking)   │  │  Validation) │  │                              │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SHARED INFRASTRUCTURE                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ WebSocket    │  │ Execution    │  │   Telemetry & Logging        │  │
│  │ Manager      │  │ Service      │  │   (Centralized)              │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ Load         │  │ Service      │  │   Performance Monitor        │  │
│  │ Balancer     │  │ Discovery    │  │   & Resource Optimizer       │  │
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
│ 15-20x Lev   │    │ 3-5x Lev     │    │ Market-Neut  │    │ (Gemini AI)  │
│ Trap System  │    │ Holographic  │    │ Basis Arb    │    │ Param Tuning │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    TITAN CONSOLE (Web Dashboard)                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ React + Vite + Tailwind + shadcn/ui                              │   │
│  │ Real-time WebSocket Updates | Phase Monitoring | Settings        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
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
- `BybitPerpsClient.ts`: Execution
- `OIWipeoutDetector.ts`, `FundingSqueezeDetector.ts`, `BasisArbDetector.ts`: Strategy detectors
- `UltimateBulgariaProtocol.ts`: Combined strategy
- `TrapMonitor.tsx`: Ink React dashboard

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
- `BotTrapDetector.ts`: Bot manipulation detection
- `GlobalLiquidityAggregator.ts`: Multi-exchange liquidity
- `EnhancedRiskManager.ts`: Advanced risk management

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
- Vacuum arbitrage during liquidation events
- Systematic position sizing
- Portfolio management

**Key Components**:
- `SentinelCore.ts`: Core engine
- `StatEngine.ts`: Statistical analysis with Welford's algorithm
- `AtomicExecutor.ts`: Atomic spot/perpetual execution
- `TwapExecutor.ts`: TWAP order slicing
- `PortfolioManager.ts`: Multi-asset management
- `PositionTracker.ts`: Position tracking (CORE, SATELLITE, VACUUM)
- `Rebalancer.ts`: Automated rebalancing
- `VacuumMonitor.ts`: Liquidation event detection
- `ExchangeRouter.ts`: Multi-exchange routing

### Phase 4: The AI Quant (Offline Optimizer)
**Capital Range**: N/A (advises Phase 1 & 2)  
**Strategy**: AI-Powered Parameter Optimization  
**Technology**: TypeScript (Node.js) + Gemini AI

**Core Logic**:
- Analyzes last 24 hours of market microstructure
- Uses Gemini 1.5 Flash for pattern recognition
- Predicts optimal parameter configurations
- Runs offline (zero latency impact)
- Advises Phase 1 & 2 on parameter adjustments
- Backtests proposals before applying

**Key Components**:
- `TitanAnalyst.ts`: AI analysis engine (Gemini API)
- `GeminiClient.ts`: Gemini API client
- `Guardrails.ts`: Safety validation for AI proposals
- `Journal.ts`: Trade log parser
- `StrategicMemory.ts`: SQLite-based learning system
- `Backtester.ts`: Proposal validation
- `ApprovalWorkflow.ts`: Human-in-the-loop approval
- `RealTimeOptimizer.ts`: Real-time optimization
- `PredictiveAnalytics.ts`: Predictive analysis

### Phase 5: The Brain (Master Orchestrator)
**Capital Range**: All phases  
**Strategy**: Hierarchical Decision-Making  
**Technology**: TypeScript (Node.js) + PostgreSQL

**Core Logic**:
- Capital allocation across phases (sigmoid transitions)
- Global risk management with circuit breakers
- Phase transition logic based on equity tiers
- Emergency controls (panic button)
- Performance tracking with Sharpe-based modifiers
- Signal queue with idempotency

**Key Components**:
- `TitanBrain.ts`: Master orchestrator
- `AllocationEngine.ts`: Sigmoid-based phase allocation
- `PerformanceTracker.ts`: Rolling Sharpe ratios
- `RiskGuardian.ts`: Correlation & leverage monitoring
- `CapitalFlowManager.ts`: Profit sweeper
- `CircuitBreaker.ts`: Emergency halt system
- `WebhookServer.ts`: Signal reception
- `SignalQueue.ts`: Priority-based processing
- `DatabaseManager.ts`: PostgreSQL persistence
- `CacheManager.ts`: In-memory caching layer

## Titan Execution Microservice

The Execution service is a critical component that handles all order execution:

**Key Features**:
- HMAC webhook authentication
- Shadow State position tracking (Master of Truth)
- L2 order book validation via WebSocket cache
- Client-side triggering for low-latency execution
- Multi-exchange adapters (Bybit, MEXC, Binance)
- Idempotency via Redis
- Reconciliation with broker state

**Key Components**:
- `ShadowState.js`: Position state tracker
- `L2Validator.js`: Order book validation
- `BrokerGateway.js`: Order execution
- `Reconciliation.js`: Broker state sync
- `Heartbeat.js`: Dead man's switch
- `LimitChaser.js`: Aggressive limit order algorithm
- `WebSocketCache.js`: L2 order book cache
- `GlobalRateLimiter.js`: API rate limiting
- `SignalRouter.js`: Signal routing
- `PhaseManager.js`: Phase coordination

**Exchange Adapters**:
- `BybitAdapter.js`: Bybit USDT Perpetuals
- `MexcAdapter.js`: MEXC Futures
- `BinanceAdapter.js`: Binance integration

## Titan Console (Web Dashboard)

Modern web-based dashboard for monitoring and control:

**Technology Stack**:
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui
- Real-time WebSocket updates

**Key Features**:
- Live operations monitoring
- Phase status and metrics
- Settings management
- Scavenger-specific views
- Responsive design

**Key Components**:
- `App.tsx`: Main application
- `Overview.tsx`: System overview
- `LiveOps.tsx`: Live operations
- `Settings.tsx`: Configuration
- `useTitanData.ts`: Data hooks
- `useWebSocket.ts`: WebSocket connection

## Shared Infrastructure

### Implemented Components

**WebSocketManager.ts**:
- Centralized WebSocket connections
- Multi-exchange support (Binance, Bybit)
- Automatic reconnection with exponential backoff
- Message routing to subscribers

**ExecutionService.ts**:
- Unified order execution
- Rate limiting
- Retry logic with exponential backoff
- Fill confirmation

**TelemetryService.ts**:
- Centralized logging
- Phase-specific log tagging
- Metrics aggregation

**ConfigManager.ts**:
- Hierarchical configuration (Brain → Phase)
- Hot-reload support
- Config validation

**Additional Components**:
- `AdvancedOrderRouter.ts`: Smart order routing
- `DistributedStateManager.ts`: Distributed state management
- `HighFrequencyProcessor.ts`: High-frequency data processing
- `LoadBalancer.ts`: Load balancing across services
- `NetworkOptimizer.ts`: Network optimization
- `PerformanceMonitor.ts`: Performance monitoring
- `ResourceOptimizer.ts`: Resource optimization
- `ServiceDiscovery.ts`: Service discovery

## Configuration Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Brain Global Config                          │
│  - Max total leverage across all phases                        │
│  - Global drawdown limits (15% emergency flatten)              │
│  - Emergency flatten thresholds                                 │
│  - Phase transition rules (equity-based)                        │
│  - Correlation limits (0.8 max between phases)                  │
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
│   (20x max)  │    │ - Risk mgmt  │    │   targets    │
│ - Targets    │    │ - Session    │    │ - Delta      │
│              │    │   filters    │    │   limits     │
└──────────────┘    └──────────────┘    └──────────────┘
```

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
┌─────────────────────────────────────────────────────────────────┐
│                    Brain Risk Manager                           │
│  - Total portfolio drawdown: 15% → Emergency Flatten            │
│  - Total leverage: 50x max across all phases                    │
│  - Correlation limits: 0.8 max between phases                   │
│  - Circuit Breaker: HARD (15% DD) / SOFT (3 losses)            │
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
│ - Max pos:   │    │ - Max pos:   │    │ - Max delta: │
│   50% equity │    │   25% equity │    │   2%/5%      │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Technology Stack

| Component | Language | Framework | Database |
|-----------|----------|-----------|----------|
| Phase 1 - Scavenger | TypeScript | Node.js + Ink | - |
| Phase 2 - Hunter | TypeScript | Node.js + Ink | - |
| Phase 3 - Sentinel | TypeScript | Node.js + Ink | - |
| Phase 4 - AI Quant | TypeScript | Node.js + Gemini AI | SQLite |
| Phase 5 - Brain | TypeScript | Node.js + Fastify | PostgreSQL |
| Titan Execution | JavaScript | Node.js + Fastify | SQLite/PostgreSQL |
| Titan Console | TypeScript | React + Vite | - |
| Shared Infrastructure | TypeScript | Node.js | Redis |

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Production (Railway)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Services (Auto-deployed from main branch)                │   │
│  │  - titan-brain (API: 3100)                               │   │
│  │  - titan-execution (API: 3002)                           │   │
│  │  - titan-console (Web: 8080)                             │   │
│  │  - titan-ai-quant (API: 3200)                            │   │
│  │  - titan-phase1-scavenger                                │   │
│  │  - titan-phase2-hunter                                   │   │
│  │  - titan-phase3-sentinel                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Database (Supabase PostgreSQL - Seoul region)            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Monitoring & Alerting

**Prometheus Metrics** (available at `/metrics`):
- `titan_brain_signals_total`: Total signals processed
- `titan_brain_signals_approved`: Approved signals
- `titan_brain_signals_vetoed`: Vetoed signals
- `titan_brain_signal_latency_ms`: Processing latency
- `titan_brain_equity_usd`: Current equity
- `titan_brain_allocation_w1/w2/w3`: Phase weights
- `titan_brain_circuit_breaker_active`: Breaker status

**Grafana Dashboards**:
- Comprehensive system dashboard
- Per-phase performance metrics
- Risk monitoring

**Alertmanager**:
- Drawdown alerts (10% warning, 15% critical)
- Win rate alerts (< 40% over 20 trades)
- Exchange API error alerts
- WebSocket disconnection alerts

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

## File Structure

```
titan/
├── services/
│   ├── shared/                    # Shared infrastructure
│   │   ├── src/
│   │   │   ├── WebSocketManager.ts
│   │   │   ├── ExecutionService.ts
│   │   │   ├── TelemetryService.ts
│   │   │   ├── ConfigManager.ts
│   │   │   ├── LoadBalancer.ts
│   │   │   ├── ServiceDiscovery.ts
│   │   │   └── ...
│   │   └── tests/
│   ├── titan-brain/               # Phase 5 - Orchestrator
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   ├── server/
│   │   │   ├── db/
│   │   │   ├── cache/
│   │   │   └── ...
│   │   └── tests/
│   ├── titan-execution/           # Execution Microservice
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   ├── handlers/
│   │   │   ├── routes/
│   │   │   └── ...
│   │   └── tests/
│   ├── titan-console/             # Web Dashboard
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   └── ...
│   ├── titan-phase1-scavenger/    # Phase 1
│   ├── titan-phase2-hunter/       # Phase 2
│   ├── titan-phase3-sentinel/     # Phase 3
│   └── titan-ai-quant/            # Phase 4
├── config/
│   ├── brain.config.json
│   ├── phase1.config.json
│   └── ...
├── monitoring/
│   ├── prometheus/
│   ├── grafana/
│   ├── alertmanager/
│   └── ...
├── logs/
├── docs/
└── README.md
```
