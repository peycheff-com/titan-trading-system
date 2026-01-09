# Titan Trading System Development Workflow

## Spec-Driven Development Approach

When the user asks to create a new trading system phase or component, follow the spec-driven approach:

### Phase 1: Requirements (System Specification)

Before writing any code, create a requirements document that defines:

1. **Trading Logic Requirements**
   - Entry conditions (what triggers a buy/sell)
   - Exit conditions (take profit, stop loss, trailing stops)
   - Position sizing rules
   - Risk management parameters

2. **System Components**
   - Core engines and calculators
   - Data sources and WebSocket connections
   - Execution logic
   - Risk management modules

3. **Market Conditions**
   - Timeframes supported
   - Asset types (crypto perpetuals, spot)
   - Volatility considerations
   - Market structure requirements

4. **Configuration Parameters**
   - Configurable parameters
   - Default values and ranges
   - Config hierarchy (Brain vs Phase)

**Ask user to review requirements before proceeding to design.**

### Phase 2: Design (Architecture)

Create a design document that specifies:

1. **Component Design**
   - TypeScript classes and interfaces
   - Data structures (types, interfaces)
   - Core algorithms
   - Integration points with shared infrastructure

2. **Execution Flow**
   - Signal generation logic
   - Order execution logic
   - Position management
   - Risk escalation paths

3. **Data Models**
   - State interfaces
   - Event types
   - Configuration schemas

4. **Error Handling**
   - WebSocket disconnections
   - Order failures
   - API rate limits

5. **Testing Strategy**
   - Unit tests for pure functions
   - Property-based tests for correctness properties
   - Integration tests for end-to-end flows

**Ask user to review design before proceeding to implementation.**

### Phase 3: Implementation (with Testing)

Now implement following the validated workflow:

#### Step 1: Create Directory Structure
```bash
mkdir -p services/<phase-name>
cd services/<phase-name>
npm init -y
```

#### Step 2: Install Dependencies
```bash
npm install ws node-fetch chalk ink react crypto fast-check
npm install --save-dev @types/node @types/react typescript jest ts-jest
```

#### Step 3: Implement Core Components
- Create TypeScript classes for engines and calculators
- Implement data structures and interfaces
- Add integration with shared infrastructure
- Write unit tests alongside implementation

#### Step 4: Implement Integration Points
- Connect to WebSocketManager for real-time data
- Connect to ExecutionService for order placement
- Connect to TelemetryService for logging
- Connect to ConfigManager for configuration

#### Step 5: Test Integration
- Test with mock data
- Test with testnet APIs
- Verify all tests pass

#### Step 6: Create Documentation (README.md)
- Document the phase/component purpose
- Document installation steps
- Document configuration options
- Create troubleshooting guide

#### Step 7: Railway Deployment Config
- Create `railway.json` for deployment
- Configure environment variables
- Test deployment

---

## Quick Mode (Skip Specs)

If user wants to skip the spec process and go straight to implementation:
- User says "just create it" or "skip specs"
- Proceed directly to implementation phase
- Still MUST write tests for all components

---

## Creating a New Titan Phase (Summary)

When the user asks to create a new phase or component:

1. **Requirements Phase** - Define what the system does (get user approval)
2. **Design Phase** - Define how it's built (get user approval)
3. **Implementation Phase** - Build with testing at each step
4. **Documentation** - Create README.md
5. **Integration Testing** - Ensure it works with shared infrastructure
6. **Deployment Config** - Create railway.json

## File Organization Rules

### All Titan components go in services/
```
services/
├── shared/                    # Shared infrastructure
├── titan-brain/               # Phase 5 - Orchestrator
├── titan-execution/           # Execution Microservice
├── titan-console/             # Web Dashboard
├── titan-ai-quant/            # Phase 4 - AI Optimizer
├── titan-phase1-scavenger/    # Phase 1
├── titan-phase2-hunter/       # Phase 2
└── titan-phase3-sentinel/     # Phase 3
```

### Standard file structure for each phase
```
services/titan-phaseX-name/
├── src/
│   ├── engine/          # Core logic
│   ├── calculators/     # Pure math functions
│   ├── detectors/       # Signal detection
│   ├── validators/      # Validation logic
│   ├── console/         # UI components (Ink + React for terminal)
│   └── index.ts         # Entry point
├── tests/
│   ├── unit/            # Unit tests
│   ├── property/        # Property-based tests
│   └── integration/     # Integration tests
├── dist/                # Compiled output
├── package.json
├── tsconfig.json
├── jest.config.js
├── railway.json         # Railway deployment config
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
```

## Common Patterns to Follow

### 1. Use Shared Infrastructure
```typescript
// DON'T create your own WebSocket connection
const ws = new WebSocket('wss://stream.binance.com');

// DO use WebSocketManager
this.wsManager.subscribe('binance', 'BTCUSDT', (data) => {
  // Handle data
});
```

### 2. Use ExecutionService for Orders
```typescript
// DON'T call exchange APIs directly
await bybitClient.placeOrder(...);

// DO use ExecutionService
await this.executionService.placeOrder({
  phase: 'phase1',
  symbol: 'BTCUSDT',
  side: 'Buy',
  type: 'MARKET',
  qty: 0.1,
  leverage: 20
});
```

### 3. Use TelemetryService for Logging
```typescript
// DON'T write to files directly
fs.appendFileSync('trades.jsonl', JSON.stringify(signal));

// DO use TelemetryService
this.telemetry.logSignal('phase1', signal);
```

### 4. Use ConfigManager for Configuration
```typescript
// DON'T load config files directly
const config = JSON.parse(fs.readFileSync('config.json'));

// DO use ConfigManager
const config = this.configManager.loadConfig('phase1');
```

## Testing Requirements

### Unit Tests
- Test pure functions with known inputs/outputs
- Test edge cases (empty inputs, boundary values)
- Use descriptive test names
- Co-locate tests with source files using `.test.ts` suffix

### Property-Based Tests
- Test universal properties that should hold across all inputs
- Use fast-check for property generation
- Annotate with requirement references
- Run minimum 100 iterations per property

### Integration Tests
- Test full signal generation → execution flow
- Test WebSocket reconnection
- Test emergency flatten
- Use mock data for reproducibility

## Example Workflow

User: "Create Phase 3 - The Sentinel (basis arbitrage system)"

### Phase 1: Requirements
1. Define basis arbitrage strategy
2. Define delta-neutral hedging logic
3. Define funding rate exploitation
4. Define portfolio management
5. **Ask user: "Do these requirements look good?"**

### Phase 2: Design
1. Design SentinelCore.ts: core engine
2. Design AtomicExecutor.ts: atomic spot/perp execution
3. Design TwapExecutor.ts: TWAP order slicing
4. Design PortfolioManager.ts: multi-asset management
5. **Ask user: "Does this design look good?"**

### Phase 3: Implementation
1. Create directory: `services/titan-phase3-sentinel/`
2. Create `SentinelCore.ts` → **Test**
3. Create `AtomicExecutor.ts` → **Test**
4. Create `TwapExecutor.ts` → **Test**
5. Create `PortfolioManager.ts` → **Test**
6. Create `README.md`
7. Create `railway.json`
8. **Integration testing with shared infrastructure**
9. Report completion to user

---

## Spec Files Location

For complex phases, create formal specs in:
```
.kiro/specs/<phase-name>/
├── requirements.md    # Trading logic requirements
├── design.md          # Architecture and component design
└── tasks.md           # Implementation checklist
```

This allows tracking progress and maintaining documentation for sophisticated systems.

---

## Service-Specific Development Patterns

### Trading Phases (1, 2, 3)
- TypeScript + Node.js
- Ink + React for terminal UI
- Integration with shared infrastructure
- Railway deployment

### AI Quant (Phase 4)
- TypeScript + Node.js + Gemini AI
- SQLite for Strategic Memory
- Human-in-the-loop approval workflow
- Runs offline (no real-time latency impact)

### Brain (Phase 5)
- TypeScript + Fastify + PostgreSQL
- Prometheus metrics
- WebSocket status monitoring
- Signal queue with idempotency

### Execution Microservice
- JavaScript + Fastify
- Shadow State position tracking
- L2 order book validation
- Multi-exchange adapters

### Console (Web Dashboard)
- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Real-time WebSocket updates
- Responsive design

---

## Key Safety Patterns

1. **Intent Signals**: Phases send signals, ExecutionService handles execution
2. **Shadow State**: Brain maintains global position state
3. **Heartbeat**: Emergency flatten if no heartbeat for 5+ minutes
4. **Risk Escalation**: Phase → Brain → Emergency Flatten
5. **Config Hierarchy**: Brain can override any phase-level setting

---

## MCP Server Usage Guide

Use these MCP servers during development:

### Context7 - Documentation Lookup
**When**: Looking up TypeScript, Node.js, or framework docs
```
mcp_Context7_resolve_library_id → mcp_Context7_query_docs
```

### Chrome DevTools - Browser Testing
**When**: Testing web UIs or debugging WebSocket connections
- Navigate to exchange websites
- Monitor WebSocket traffic
- Debug API responses

### Firecrawl - Web Research
**When**: Researching trading strategies or market structure concepts
```
mcp_firecrawl_firecrawl_search - Quick web search
mcp_firecrawl_firecrawl_scrape - Deep page scrape
```

### Shadcn - UI Components
**When**: Building web dashboards with shadcn/ui components

---

## Deployment Workflow

### Railway Deployment (Production)

1. **Create railway.json** in service directory:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
```

2. **Configure environment variables** in Railway dashboard

3. **Auto-deploy** from main branch

### Local Development

1. **Start services** with PM2:
```bash
./start-titan.sh
```

2. **Or start individually**:
```bash
cd services/titan-brain && npm run dev
cd services/titan-execution && npm run dev
```

3. **Monitor with PM2**:
```bash
pm2 monit
pm2 logs
```

---

## Keeping System Updated

When discovering new patterns or improvements:

1. **Update Architecture Docs**: Add to `.kiro/steering/titan-architecture.md`
2. **Update Workflow**: Add to this file
3. **Update Tech Stack**: Add to `.kiro/steering/tech.md`
4. **Document in README**: Add to service-specific README.md
