# Project Structure

## Titan Trading System Organization

```
titan/
├── services/
│   ├── shared/                           # Shared infrastructure
│   │   ├── WebSocketManager.ts
│   │   ├── ExecutionService.ts
│   │   ├── TelemetryService.ts
│   │   ├── ConfigManager.ts
│   │   └── RateLimiter.ts
│   ├── titan-brain/                      # Phase 5 - Orchestrator
│   │   ├── BrainOrchestrator.ts
│   │   ├── CapitalAllocator.ts
│   │   ├── GlobalRiskManager.ts
│   │   └── PhaseTransitioner.ts
│   ├── titan-phase1-scavenger/           # Phase 1 - Trap system
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   ├── calculators/
│   │   │   ├── detectors/
│   │   │   └── console/
│   │   ├── tests/
│   │   └── package.json
│   ├── titan-phase2-hunter/              # Phase 2 - Holographic
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   ├── calculators/
│   │   │   └── console/
│   │   ├── tests/
│   │   └── package.json
│   ├── titan-phase3-sentinel/            # Phase 3 - Basis arb
│   │   └── [To be implemented]
│   └── titan-phase4-ai-quant/            # Phase 4 - Optimizer
│       └── [Python implementation]
├── config/
│   ├── brain.config.json                 # Global config
│   ├── phase1.config.json
│   ├── phase2.config.json
│   └── phase3.config.json
├── logs/
│   └── trades.jsonl                      # Centralized logging
├── .kiro/                                # Kiro configuration
│   ├── steering/                         # Steering rules
│   │   ├── titan-architecture.md
│   │   ├── titan-integration-fixes.md
│   │   ├── workflow.md
│   │   ├── structure.md
│   │   ├── tech.md
│   │   └── product.md
│   └── specs/                            # Feature specifications
│       ├── titan-phase1-scavenger/
│       ├── titan-phase2-hunter/
│       ├── titan-phase3-sentinel/
│       ├── titan-phase4-ai-quant/
│       ├── titan-phase5-brain/
│       └── titan-system-integration/
├── archive/                              # Archived projects
│   └── pine-script-studio/              # Pine Script validator (archived)
├── package.json
└── README.md
```

## Phase Structure

Each Titan phase follows this pattern:

### Standard Phase Structure (TypeScript)
```
services/titan-phaseX-name/
├── src/
│   ├── engine/              # Core logic engines
│   ├── calculators/         # Pure math functions
│   ├── detectors/           # Signal detection
│   ├── validators/          # Validation logic
│   ├── exchanges/           # Exchange clients
│   ├── config/              # Configuration
│   ├── console/             # UI components (Ink + React)
│   ├── events/              # Event emitters
│   └── logging/             # Logging utilities
├── tests/
│   ├── unit/                # Unit tests
│   ├── property/            # Property-based tests
│   └── integration/         # Integration tests
├── package.json
├── tsconfig.json
└── README.md
```

### Shared Infrastructure
```
services/shared/
├── WebSocketManager.ts      # Centralized WebSocket connections
├── ExecutionService.ts      # Unified order execution
├── TelemetryService.ts      # Centralized logging
├── ConfigManager.ts         # Hierarchical configuration
└── RateLimiter.ts          # Global rate limiting
```

### Brain Orchestrator
```
services/titan-brain/
├── BrainOrchestrator.ts     # Master state machine
├── CapitalAllocator.ts      # Phase-based allocation
├── GlobalRiskManager.ts     # System-wide risk
├── PhaseTransitioner.ts     # Automatic phase switching
└── TelemetryAggregator.ts   # Unified metrics
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
- Automatic reconnection

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

**Exchanges** (Exchange Clients):
- REST API clients
- WebSocket clients (deprecated - use WebSocketManager)
- HMAC signature generation
- Rate limiting (deprecated - use ExecutionService)

**Console** (UI Components):
- Ink + React components
- Terminal dashboard
- Keyboard input handling
- Real-time updates

## File Organization Rules

### All Titan components go in titan/
- NEVER create Titan files in the root directory
- Each phase gets its own subdirectory under `services/`
- Shared infrastructure goes in `services/shared/`
- Brain goes in `services/titan-brain/`

### Standard file structure
```
services/titan-phaseX-name/
├── src/
│   ├── engine/
│   │   └── MainEngine.ts
│   ├── calculators/
│   │   ├── Calculator1.ts
│   │   └── Calculator2.ts
│   ├── detectors/
│   │   ├── Detector1.ts
│   │   └── Detector2.ts
│   └── console/
│       └── Dashboard.tsx
├── tests/
│   ├── unit/
│   │   ├── Calculator1.test.ts
│   │   └── Calculator2.test.ts
│   ├── property/
│   │   └── Calculator1.property.test.ts
│   └── integration/
│       └── EndToEnd.integration.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

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
