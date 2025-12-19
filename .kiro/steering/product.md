# Titan Trading System

## Overview

Titan is a **Bio-Mimetic Trading Organism** - a 5-phase algorithmic trading system that evolves its behavior based on available capital. Each phase is optimized for specific capital ranges and market conditions, orchestrated by a central Brain that manages risk, capital allocation, and phase transitions.

### System Components

- **Phase 1 - Scavenger** ($200→$5K): Predestination trap system with 15-20x leverage
- **Phase 2 - Hunter** ($2.5K→$50K): Holographic market structure with 3-5x leverage
- **Phase 3 - Sentinel** ($50K+): Market-neutral basis arbitrage
- **Phase 4 - AI Quant**: Offline parameter optimization engine
- **Phase 5 - Brain**: Master orchestrator for capital allocation and risk management
- **Shared Infrastructure**: Centralized WebSocket, Execution, and Telemetry services

## CRITICAL: Always Validate

**You MUST run the validator after creating or modifying ANY Pine Script file:**
```bash
node src/CLI.js <path-to-file.pine>
```

The validator is your primary tool. Use it constantly. Fix all errors before proceeding.

## Studio Workflow

When creating a new trading system:
1. Create a new directory under `trading-systems/<system-name>/`
2. Create `lib.pine` → **VALIDATE**
3. Create `strategy.pine` → **VALIDATE**
4. Create `indicator.pine` → **VALIDATE**
5. Create `README.md`
6. Final validation of all files
7. Ready for TradingView upload

## Directory Structure

```
pine-script-studio/
├── trading-systems/           # All trading system projects
│   ├── godmode-ultimate/      # Example: GodMode trading system
│   │   ├── lib.pine          # Reusable library functions
│   │   ├── strategy.pine     # Backtesting strategy
│   │   ├── indicator.pine    # Visual indicator
│   │   └── README.md         # System documentation
│   └── <new-system>/         # New systems go here
├── src/                       # Validator source code
├── tests/                     # Validator tests
├── knowledge-base/            # Pine Script v6 API reference
└── .kiro/                     # Kiro configuration
```

## Core Components

### Validator (Built-in Tool)
- **ValidatorCore**: Orchestrates validation in phases (syntax → library loading → function validation)
- **SyntaxValidator**: Validates Pine Script syntax, version declarations, scope consistency, v6 rules
- **FunctionValidator**: Verifies function calls against Pine Script v6 API and imported libraries
- **LibraryValidator**: Parses library files, extracts exported functions, resolves imports
- **KnowledgeBase**: Pine Script v6 API reference with built-in functions and namespaces
- **CLI**: Command-line interface for validation

### Trading System Files
Each trading system consists of three files:

1. **Library (`lib.pine`)**: Reusable functions and types
   - Type definitions (custom types for state, signals, etc.)
   - Utility functions (swing detection, calculations)
   - Core logic functions (signal generation, risk management)
   - Must use `library()` declaration and `export` keyword

2. **Strategy (`strategy.pine`)**: Backtesting implementation
   - Imports the library
   - Input parameters for configuration
   - Entry/exit signal generation
   - Position sizing and risk management
   - Order execution via `strategy.*` functions

3. **Indicator (`indicator.pine`)**: Visual analysis tool
   - Imports the library
   - Same input parameters as strategy
   - Visual overlays (boxes, lines, labels)
   - Signal markers and alerts
   - Dashboard/table displays

## Validation Workflow

Always validate before uploading to TradingView:

```bash
# Validate a single file
node src/CLI.js trading-systems/my-system/lib.pine

# Validate with strict mode (warnings as errors)
node src/CLI.js --strict trading-systems/my-system/strategy.pine

# Validate with JSON output (for automation)
node src/CLI.js --json trading-systems/my-system/indicator.pine

# Validate all files in a system
node src/CLI.js trading-systems/my-system/lib.pine
node src/CLI.js trading-systems/my-system/strategy.pine
node src/CLI.js trading-systems/my-system/indicator.pine
```

## Validation Capabilities

- **Version Declaration**: Checks for `//@version=6`, warns for older versions
- **Script Type**: Ensures correct declaration (indicator/strategy/library)
- **Library Functions**: Verifies imported library functions exist
- **Scope Consistency**: Warns about `ta.*` and `request.*` in conditional blocks
- **Syntax Errors**: Catches bracket mismatches, tuple errors, array access issues
- **v6 Rules**: Detects deprecated features, duplicate parameters, history on literals
- **Variable Order**: Detects variables used before declaration

## CLI Options

| Option | Description |
|--------|-------------|
| `<file>` | Pine Script file to validate |
| `-s, --strict` | Treat warnings as errors |
| `-j, --json` | Output results in JSON format |
| `--kb-status` | Display knowledge base status |
| `-h, --help` | Display help information |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Validation passed |
| 1 | Validation failed or error |

## Creating a New Trading System

When asked to create a new trading system:

1. **Create directory**: `trading-systems/<system-name>/`
2. **Create library first**: Define types and reusable functions
3. **Create strategy**: Import library, implement backtesting logic
4. **Create indicator**: Import library, implement visualizations
5. **Validate all files**: Run validator on each file
6. **Create README**: Document the system's purpose and usage

## Example Trading Systems

### GodMode Ultimate (included)
Located in `trading-systems/godmode-ultimate/`:
- Smart Money Concepts (FVG, Order Blocks, Liquidity Pools)
- Multi-timeframe analysis
- Volatility regime adaptation
- Risk management with ATR-based stops
- Partial profit-taking at multiple R:R levels

### Titan Regime Engine (institutional-grade)
Located in `titan/`:
- **Veto-Based Regime Logic**: Non-linear state vectors [Trend, Vol, Liquidity] with hard kill on extreme conditions
- **True Market Structure**: BOS/CHoCH, Order Blocks, FVGs, Liquidity Sweeps, Breaker Blocks (Inversion Model)
- **Advanced Metrics**: Fractal Dimension Index (FDI), VPIN, Shannon Entropy, Efficiency Ratio
- **Flow Toxicity Detection**: Absorption state analysis for fade signals
- **Execution Microservice**: Node.js webhook receiver with Shadow State, L2 validation, Limit Chaser algorithm
- **Safety Systems**: Heartbeat dead man's switch, Z-Score drift monitoring, Drawdown Velocity protection

## Institutional-Grade Trading Systems

For complex systems like Titan, the architecture extends beyond Pine Script:

```
titan/
├── lib.pine              # Pure calculation library (TitanLib)
├── strategy.pine         # Backtest with pessimistic execution
├── indicator.pine        # Dashboard (MICRO/FULL/SCREENER modes)
├── README.md             # Documentation
└── services/             # Execution microservice (Node.js)
    ├── server.js         # Fastify webhook receiver
    ├── ShadowState.js    # Position state tracker (Master of Truth)
    ├── L2Validator.js    # WebSocket order book validation
    ├── Reconciliation.js # Broker state reconciliation
    └── package.json      # Node.js dependencies
```

### Key Architectural Patterns

1. **Intent Signals**: Pine sends "BUY_SETUP" / "SELL_SETUP" intents, not position commands
2. **Shadow State**: Node.js maintains position state as Master of Truth (prevents ghost positions)
3. **Pre-Signal Alerts**: PREPARE (5s before bar close) → CONFIRM/ABORT (on bar close)
4. **Zero-IO Validation**: L2 data read from local WebSocket cache, not REST API
5. **Limit Chaser**: Place Limit at Ask, move to Ask+1 tick if not filled in 200ms


---

## Titan System Architecture

### Phase Progression
The Titan system is designed to evolve as capital grows:

1. **$200 - $5,000**: Phase 1 (Scavenger) - Aggressive scalping with trap system
2. **$2,500 - $50,000**: Phase 2 (Hunter) - Institutional-grade swing trading
3. **$50,000+**: Phase 3 (Sentinel) - Market-neutral basis arbitrage
4. **All Phases**: Phase 4 (AI Quant) - Offline parameter optimization
5. **Master Control**: Phase 5 (Brain) - Capital allocation and risk management

### Shared Infrastructure

**WebSocket Manager**:
- Single Binance Spot connection (shared by Phase 1 & 2)
- Single Bybit connection (shared by all phases)
- Automatic reconnection with exponential backoff
- Message routing to phase-specific handlers

**Execution Service**:
- Unified order execution on Bybit/MEXC
- Rate limiting (10 req/s per exchange)
- Retry logic with exponential backoff
- Fill confirmation and status tracking

**Telemetry Service**:
- Centralized `trades.jsonl` logging
- Phase-specific log tagging
- Metrics aggregation for Brain
- Log rotation and compression

### Configuration Hierarchy

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

### Risk Management Hierarchy

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

### Technology Stack

| Component | Language | Framework |
|-----------|----------|-----------|
| Phase 1 - Scavenger | TypeScript | Node.js |
| Phase 2 - Hunter | TypeScript | Node.js |
| Phase 3 - Sentinel | TypeScript | Node.js |
| Phase 4 - AI Quant | Python | scikit-learn, optuna |
| Phase 5 - Brain | TypeScript | Node.js |
| Shared Infrastructure | TypeScript | Node.js |
| Console UI | TypeScript | Ink + React |

### Deployment

**Production Setup**:
- PM2 process manager for all Node.js services
- Redis Pub/Sub for inter-process communication
- Cron job for AI Quant (runs every 6 hours)
- Centralized logging to `trades.jsonl`

**Emergency Controls**:
- Panic button (Brain-triggered)
- Automatic emergency flatten at 15% drawdown
- Manual override via keyboard shortcut

### File Structure

```
titan/
├── services/
│   ├── shared/                    # Shared infrastructure
│   │   ├── WebSocketManager.ts
│   │   ├── ExecutionService.ts
│   │   └── TelemetryService.ts
│   ├── titan-brain/               # Phase 5 - Orchestrator
│   ├── titan-phase1-scavenger/    # Phase 1 - Trap system
│   ├── titan-phase2-hunter/       # Phase 2 - Holographic
│   ├── titan-phase3-sentinel/     # Phase 3 - Basis arb
│   └── titan-phase4-ai-quant/     # Phase 4 - Optimizer
├── config/
│   ├── brain.config.json          # Global config
│   ├── phase1.config.json
│   ├── phase2.config.json
│   └── phase3.config.json
└── logs/
    └── trades.jsonl               # Centralized logging
```

### Key Design Principles

1. **Separation of Concerns**: Each phase is independent but coordinated by Brain
2. **Shared Infrastructure**: Avoid duplicate WebSocket connections and execution logic
3. **Hierarchical Risk**: Brain can override any phase-level risk decision
4. **Centralized Logging**: All phases log to single `trades.jsonl` with phase tags
5. **Hot-Reload Config**: All phases support runtime configuration updates
6. **Emergency Controls**: Brain can flatten all positions across all phases instantly

### Integration Points

**Phase 1 ↔ Shared Infrastructure**:
- Uses WebSocketManager for Binance Spot signal validation
- Uses ExecutionService for Bybit/MEXC order placement
- Uses TelemetryService for logging

**Phase 2 ↔ Shared Infrastructure**:
- Uses WebSocketManager for Binance CVD calculation
- Uses ExecutionService for Post-Only Limit Orders
- Uses TelemetryService for logging

**Phase 3 ↔ Shared Infrastructure**:
- Uses WebSocketManager for Bybit basis monitoring
- Uses ExecutionService for delta-neutral hedging
- Uses TelemetryService for logging

**Phase 4 ↔ Brain**:
- Runs offline (no real-time integration)
- Outputs optimized parameters to config files
- Brain reads and applies parameter updates

**Brain ↔ All Phases**:
- Monitors equity and drawdown across all phases
- Enforces global risk limits
- Triggers emergency flatten if needed
- Aggregates telemetry for performance reporting
