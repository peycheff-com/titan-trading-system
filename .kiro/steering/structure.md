# Project Structure

## Titan Trading System Organization

```
titan/
├── services/
│   ├── shared/                           # Shared infrastructure
│   │   ├── src/
│   │   │   ├── WebSocketManager.ts       # Centralized WebSocket connections
│   │   │   ├── ExecutionService.ts       # Unified order execution
│   │   │   ├── TelemetryService.ts       # Centralized logging
│   │   │   ├── ConfigManager.ts          # Hierarchical configuration
│   │   │   ├── AdvancedOrderRouter.ts    # Smart order routing
│   │   │   ├── DistributedStateManager.ts # Distributed state management
│   │   │   ├── HighFrequencyProcessor.ts # High-frequency data processing
│   │   │   ├── LoadBalancer.ts           # Load balancing across services
│   │   │   ├── NetworkOptimizer.ts       # Network optimization
│   │   │   ├── PerformanceMonitor.ts     # Performance monitoring
│   │   │   ├── ResourceOptimizer.ts      # Resource optimization
│   │   │   ├── ServiceDiscovery.ts       # Service discovery
│   │   │   └── index.ts                  # Module exports
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── titan-brain/                      # Phase 5 - Master Orchestrator
│   │   ├── src/
│   │   │   ├── engine/                   # Core orchestration logic
│   │   │   ├── server/                   # Fastify HTTP server
│   │   │   ├── db/                       # PostgreSQL database layer
│   │   │   └── cache/                    # In-memory caching
│   │   ├── tests/
│   │   ├── monitoring/                   # Prometheus/Grafana configs
│   │   ├── scripts/                      # Utility scripts
│   │   ├── Dockerfile
│   │   ├── railway.json
│   │   └── README.md
│   ├── titan-execution/                  # Execution Microservice
│   │   ├── src/
│   │   │   ├── adapters/                 # Exchange adapters (Bybit, MEXC, Binance)
│   │   │   ├── handlers/                 # Request handlers
│   │   │   └── routes/                   # API routes
│   │   ├── tests/
│   │   ├── migrations/                   # Database migrations
│   │   ├── docs/                         # API documentation
│   │   ├── Dockerfile
│   │   ├── railway.json
│   │   └── README.md
│   ├── titan-console/                    # Web Dashboard
│   │   ├── src/
│   │   │   ├── components/               # React components
│   │   │   ├── pages/                    # Page components
│   │   │   ├── hooks/                    # Custom React hooks
│   │   │   └── lib/                      # Utility functions
│   │   ├── public/                       # Static assets
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── railway.json
│   │   └── README.md
│   ├── titan-ai-quant/                   # Phase 4 - AI Optimizer
│   │   ├── src/
│   │   │   ├── engine/                   # AI analysis engine
│   │   │   ├── memory/                   # Strategic memory (SQLite)
│   │   │   ├── backtester/               # Proposal validation
│   │   │   └── guardrails/               # Safety validation
│   │   ├── tests/
│   │   ├── railway.json
│   │   └── README.md
│   ├── titan-phase1-scavenger/           # Phase 1 - Trap System
│   │   ├── src/
│   │   │   ├── engine/                   # TitanTrap core engine
│   │   │   ├── calculators/              # Tripwire calculations
│   │   │   ├── detectors/                # OI Wipeout, Funding Squeeze, Basis Arb
│   │   │   └── console/                  # Ink terminal UI
│   │   ├── tests/
│   │   ├── railway.json
│   │   └── README.md
│   ├── titan-phase2-hunter/              # Phase 2 - Holographic Structure
│   │   ├── src/
│   │   │   ├── engine/                   # HologramEngine
│   │   │   ├── calculators/              # FractalMath, CVD
│   │   │   ├── detectors/                # POI, Session, Bot Trap
│   │   │   └── console/                  # Ink terminal UI
│   │   ├── tests/
│   │   ├── config/                       # Phase-specific configs
│   │   ├── railway.json
│   │   └── README.md
│   └── titan-phase3-sentinel/            # Phase 3 - Basis Arbitrage
│       ├── src/
│       │   ├── engine/                   # SentinelCore
│       │   ├── executors/                # Atomic, TWAP executors
│       │   ├── portfolio/                # Portfolio management
│       │   └── monitors/                 # Vacuum, rebalancing
│       ├── tests/
│       └── README.md
├── config/
│   ├── brain.config.json                 # Brain global config
│   ├── phase1.config.json                # Phase 1 config
│   ├── infrastructure.config.json        # Infrastructure config
│   ├── disaster-recovery.config.json     # DR config
│   ├── hot-standby.config.json           # Hot standby config
│   └── redis-secure.conf                 # Redis configuration
├── monitoring/                           # Monitoring stack
│   ├── prometheus/
│   ├── grafana/
│   └── alertmanager/
├── scripts/                              # Utility scripts
├── logs/                                 # Centralized logs
├── backups/                              # Backup storage
│   ├── development/
│   └── disaster-recovery/
├── docs/                                 # Documentation
├── .kiro/                                # Kiro configuration
│   ├── steering/                         # Steering rules
│   │   ├── titan-architecture.md
│   │   ├── workflow.md
│   │   ├── structure.md
│   │   ├── tech.md
│   │   └── product.md
│   └── specs/                            # Feature specifications
├── ecosystem.config.js                   # PM2 configuration
├── start-titan.sh                        # Start all services
├── stop-titan.sh                         # Stop all services
├── package.json
└── README.md
```

## Service Structure Patterns

### Trading Phase Structure (TypeScript)
```
services/titan-phaseX-name/
├── src/
│   ├── engine/              # Core logic engines
│   ├── calculators/         # Pure math functions
│   ├── detectors/           # Signal detection
│   ├── validators/          # Validation logic
│   ├── console/             # Ink terminal UI (React)
│   └── index.ts             # Entry point
├── tests/
│   ├── unit/                # Unit tests
│   ├── property/            # Property-based tests
│   └── integration/         # Integration tests
├── dist/                    # Compiled output
├── package.json
├── tsconfig.json
├── jest.config.js
├── railway.json             # Railway deployment config
└── README.md
```

### Shared Infrastructure
```
services/shared/
├── src/
│   ├── WebSocketManager.ts      # Centralized WebSocket connections
│   ├── ExecutionService.ts      # Unified order execution
│   ├── TelemetryService.ts      # Centralized logging
│   ├── ConfigManager.ts         # Hierarchical configuration
│   ├── AdvancedOrderRouter.ts   # Smart order routing
│   ├── DistributedStateManager.ts # Distributed state
│   ├── HighFrequencyProcessor.ts # HFT data processing
│   ├── LoadBalancer.ts          # Service load balancing
│   ├── NetworkOptimizer.ts      # Network optimization
│   ├── PerformanceMonitor.ts    # Performance metrics
│   ├── ResourceOptimizer.ts     # Resource management
│   ├── ServiceDiscovery.ts      # Service discovery
│   └── index.ts                 # Module exports
├── tests/
├── package.json
└── tsconfig.json
```

### Brain Orchestrator
```
services/titan-brain/
├── src/
│   ├── engine/
│   │   ├── TitanBrain.ts        # Master orchestrator
│   │   ├── AllocationEngine.ts  # Sigmoid-based allocation
│   │   ├── PerformanceTracker.ts # Rolling Sharpe ratios
│   │   ├── RiskGuardian.ts      # Correlation & leverage
│   │   ├── CapitalFlowManager.ts # Profit sweeper
│   │   ├── CircuitBreaker.ts    # Emergency halt
│   │   └── SignalQueue.ts       # Priority processing
│   ├── server/
│   │   └── WebhookServer.ts     # Fastify HTTP server
│   ├── db/
│   │   └── DatabaseManager.ts   # PostgreSQL persistence
│   └── cache/
│       └── CacheManager.ts      # In-memory caching
├── monitoring/
│   ├── prometheus/
│   └── grafana/
├── tests/
├── Dockerfile
├── railway.json
└── README.md
```

### Execution Microservice
```
services/titan-execution/
├── src/
│   ├── adapters/
│   │   ├── BybitAdapter.js      # Bybit USDT Perpetuals
│   │   ├── MexcAdapter.js       # MEXC Futures
│   │   └── BinanceAdapter.js    # Binance integration
│   ├── handlers/
│   │   ├── ShadowState.js       # Position state tracker
│   │   ├── L2Validator.js       # Order book validation
│   │   ├── BrokerGateway.js     # Order execution
│   │   ├── Reconciliation.js    # Broker state sync
│   │   ├── Heartbeat.js         # Dead man's switch
│   │   ├── LimitChaser.js       # Aggressive limit algorithm
│   │   ├── WebSocketCache.js    # L2 order book cache
│   │   ├── GlobalRateLimiter.js # API rate limiting
│   │   ├── SignalRouter.js      # Signal routing
│   │   └── PhaseManager.js      # Phase coordination
│   └── routes/
│       └── api.js               # REST API routes
├── migrations/                  # Database migrations
├── tests/
├── Dockerfile
├── railway.json
└── README.md
```

### Web Dashboard (Console)
```
services/titan-console/
├── src/
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── Overview.tsx         # System overview
│   │   ├── LiveOps.tsx          # Live operations
│   │   └── Settings.tsx         # Configuration
│   ├── pages/
│   ├── hooks/
│   │   ├── useTitanData.ts      # Data hooks
│   │   └── useWebSocket.ts      # WebSocket connection
│   ├── lib/
│   │   └── utils.ts             # Utility functions
│   ├── App.tsx                  # Main application
│   └── main.tsx                 # Entry point
├── public/                      # Static assets
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json              # shadcn/ui config
├── railway.json
└── README.md
```

### AI Quant (Phase 4)
```
services/titan-ai-quant/
├── src/
│   ├── engine/
│   │   ├── TitanAnalyst.ts      # AI analysis engine
│   │   ├── GeminiClient.ts      # Gemini API client
│   │   └── RealTimeOptimizer.ts # Real-time optimization
│   ├── memory/
│   │   └── StrategicMemory.ts   # SQLite-based learning
│   ├── backtester/
│   │   └── Backtester.ts        # Proposal validation
│   ├── guardrails/
│   │   ├── Guardrails.ts        # Safety validation
│   │   └── ApprovalWorkflow.ts  # Human-in-the-loop
│   └── analytics/
│       ├── Journal.ts           # Trade log parser
│       └── PredictiveAnalytics.ts # Predictive analysis
├── tests/
├── railway.json
└── README.md
```

## Naming Conventions

### Directory Names
- Use kebab-case: `titan-phase1-scavenger`
- Be descriptive: `titan-brain`, `shared`
- No spaces or special characters

### TypeScript Files
- Classes: PascalCase (`TitanTrap.ts`, `WebSocketManager.ts`)
- Interfaces: PascalCase with `I` prefix (`IConfig.ts`, `ISignal.ts`)
- Types: PascalCase (`OrderParams.ts`, `SignalData.ts`)
- Utilities: camelCase (`rateLimiter.ts`, `logger.ts`)

### TypeScript Code
- Variables: camelCase (`currentPrice`, `trapMap`)
- Constants: UPPER_SNAKE_CASE (`MAX_LEVERAGE`, `API_TIMEOUT`)
- Functions: camelCase (`calcVelocity`, `detectFVG`)
- Classes: PascalCase (`TitanTrap`, `HologramEngine`)
- Interfaces: PascalCase (`Tripwire`, `HologramState`)
- Types: PascalCase (`TrendState`, `SessionType`)
- Private methods: underscore prefix (`_stripComments`, `_reconnect`)

### Configuration Files
- Use kebab-case: `brain.config.json`, `phase1.config.json`
- Always `.json` extension
- Store in `config/` directory

### Log Files
- Use kebab-case: `trades.jsonl`, `errors.log`
- Always `.jsonl` for structured logs
- Store in `logs/` directory

## Component Organization

### Shared Infrastructure Components

**WebSocketManager**:
- Manages all WebSocket connections
- Single connection per exchange
- Message routing to subscribers
- Automatic reconnection with exponential backoff

**ExecutionService**:
- Unified order execution
- Rate limiting (10 req/s per exchange)
- Retry logic with exponential backoff
- Fill confirmation

**TelemetryService**:
- Centralized logging to `trades.jsonl`
- Phase-specific log tagging
- Metrics aggregation
- Log rotation and compression

**ConfigManager**:
- Hierarchical configuration (Brain → Phase)
- Hot-reload support
- Config validation
- Merge logic with precedence

**AdvancedOrderRouter**:
- Smart order routing across exchanges
- Best execution logic
- Slippage optimization

**DistributedStateManager**:
- Distributed state management
- Cross-service state synchronization
- Conflict resolution

**HighFrequencyProcessor**:
- High-frequency data processing
- Low-latency message handling
- Buffer management

**LoadBalancer**:
- Load balancing across services
- Health check integration
- Failover handling

**NetworkOptimizer**:
- Network optimization
- Connection pooling
- Latency reduction

**PerformanceMonitor**:
- Performance metrics collection
- Latency tracking
- Resource utilization

**ResourceOptimizer**:
- Resource management
- Memory optimization
- CPU utilization

**ServiceDiscovery**:
- Service discovery
- Health monitoring
- Dynamic routing

### Phase Components

**Engine** (Core Logic):
- Main orchestration class
- State management
- Event emission
- Integration with shared infrastructure

**Calculators** (Pure Math):
- Pure functions with no side effects
- Use TypedArrays for performance
- Comprehensive unit tests
- Property-based tests

**Detectors** (Signal Detection):
- Pattern recognition
- Structural analysis
- Signal generation
- Confidence scoring

**Validators** (Validation Logic):
- Input validation
- Signal validation
- Risk validation
- CVD validation

**Console** (UI Components):
- Ink + React components (terminal phases)
- React + Vite + Tailwind (web dashboard)
- Real-time updates
- Keyboard input handling

## File Organization Rules

### All Titan components go in services/
- NEVER create Titan files in the root directory
- Each phase gets its own subdirectory under `services/`
- Shared infrastructure goes in `services/shared/`
- Brain goes in `services/titan-brain/`

### Directory naming
- Use kebab-case: `titan-phase1-scavenger`
- Be descriptive and meaningful
- No spaces or special characters

## TypeScript Requirements

### Every file should have:
1. Proper TypeScript types and interfaces
2. JSDoc comments for public methods
3. Error handling with try-catch
4. Logging via TelemetryService

### Import syntax
```typescript
// Shared infrastructure
import { WebSocketManager } from '../shared/WebSocketManager';
import { ExecutionService } from '../shared/ExecutionService';
import { TelemetryService } from '../shared/TelemetryService';
import { ConfigManager } from '../shared/ConfigManager';

// Phase-specific
import { TitanTrap } from './engine/TitanTrap';
import { TripwireCalculators } from './calculators/TripwireCalculators';
```

## Configuration Structure

### Brain Global Config
```json
{
  "maxTotalLeverage": 50,
  "maxGlobalDrawdown": 0.15,
  "emergencyFlattenThreshold": 0.15,
  "phaseTransitionRules": {
    "phase1ToPhase2": 5000,
    "phase2ToPhase3": 50000
  }
}
```

### Phase-Specific Config
```json
{
  "maxLeverage": 20,
  "maxDrawdown": 0.07,
  "maxPositionSize": 0.5,
  "riskPerTrade": 0.02,
  "exchanges": {
    "bybit": { "enabled": true, "executeOn": true },
    "mexc": { "enabled": false, "executeOn": false }
  }
}
```

## Logging Structure

### Centralized Logging Format
```jsonl
{"timestamp":1234567890,"phase":"phase1","type":"signal","symbol":"BTCUSDT","trapType":"LIQUIDATION","confidence":95}
{"timestamp":1234567891,"phase":"phase1","type":"execution","symbol":"BTCUSDT","side":"Buy","qty":0.1,"fillPrice":50000}
{"timestamp":1234567892,"phase":"phase2","type":"signal","symbol":"ETHUSDT","hologramStatus":"A+","rsScore":0.05}
```

### Log Rotation
- Rotate when size exceeds 10MB
- Compress old logs to `.gz`
- Keep last 30 days of logs

## Error Codes

### Shared Infrastructure
- `WEBSOCKET_DISCONNECTED`
- `EXECUTION_FAILED`
- `RATE_LIMIT_EXCEEDED`
- `CONFIG_CORRUPTED`

### Phase-Specific
- `TRAP_ACTIVATION_FAILED` (Phase 1)
- `HOLOGRAM_SCAN_SLOW` (Phase 2)
- `BASIS_CALCULATION_ERROR` (Phase 3)

### Brain
- `EMERGENCY_FLATTEN_TRIGGERED`
- `GLOBAL_DRAWDOWN_EXCEEDED`
- `PHASE_TRANSITION_FAILED`

## Integration Points

### Phase → Shared Infrastructure
```typescript
// WebSocket subscription
this.wsManager.subscribe('binance', 'BTCUSDT', (data) => {
  this.onBinanceTick('BTCUSDT', data.price, data.trades);
});

// Order execution
const result = await this.executionService.placeOrder({
  phase: 'phase1',
  symbol: 'BTCUSDT',
  side: 'Buy',
  type: 'MARKET',
  qty: 0.1,
  leverage: 20
});

// Logging
this.telemetry.logSignal('phase1', {
  symbol: 'BTCUSDT',
  trapType: 'LIQUIDATION',
  confidence: 95
});

// Configuration
const config = this.configManager.loadConfig('phase1');
```

### Phase → Brain
```typescript
// Report risk event
this.brain.reportRiskEvent({
  phase: 'phase1',
  type: 'DRAWDOWN_WARNING',
  drawdown: 0.05
});

// Request execution approval
const approved = await this.brain.approveOrder({
  phase: 'phase1',
  symbol: 'BTCUSDT',
  notional: 1000
});
```

### Brain → Phase
```typescript
// Emergency flatten
await this.phase1.emergencyFlatten();
await this.phase2.emergencyFlatten();
await this.phase3.emergencyFlatten();

// Update configuration
await this.phase1.updateConfig(newConfig);
```
