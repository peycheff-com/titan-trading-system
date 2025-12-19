# Technical Stack

## Titan Trading System

This is a comprehensive algorithmic trading system with 5 operational phases orchestrated by a central Brain.

## Languages

- **TypeScript (Node.js v18+)**: All trading phases, Brain orchestrator, and shared infrastructure
- **Python (3.10+)**: Phase 4 AI Quant (ML optimization)

## Development Commands

```bash
# Install dependencies for a phase
cd titan/services/titan-phaseX-name
npm install

# Run tests
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# Build TypeScript
npm run build            # Compile to JavaScript

# Lint and format
npm run lint:check       # Check linting
npm run lint:fix         # Fix linting
npm run format:check     # Check formatting
npm run format:write     # Fix formatting
```

## Dependencies

### Production (TypeScript/Node.js)
- `ws` (^8.14.0): WebSocket client
- `node-fetch` (^3.3.0): HTTP client
- `chalk` (^5.3.0): Colored terminal output
- `ink` (^4.4.0): Terminal UI framework
- `react` (^18.2.0): UI components for Ink
- `crypto` (built-in): HMAC signature generation
- `redis` (^4.6.0): Inter-process communication

### Development (TypeScript/Node.js)
- `typescript` (^5.3.0): TypeScript compiler
- `@types/node` (^20.10.0): Node.js type definitions
- `@types/react` (^18.2.0): React type definitions
- `jest` (^29.7.0): Testing framework
- `ts-jest` (^29.1.0): TypeScript support for Jest
- `fast-check` (^3.15.0): Property-based testing
- `eslint` (^8.54.0): Linting
- `prettier` (^3.1.0): Formatting

### Production (Python)
- `scikit-learn` (^1.3.0): Machine learning
- `optuna` (^3.4.0): Hyperparameter optimization
- `pandas` (^2.1.0): Data manipulation
- `numpy` (^1.26.0): Numerical computing

## TypeScript Configuration

### tsconfig.json (Standard)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Jest Configuration
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.property.test.ts', '**/*.integration.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

## Shared Infrastructure Reference

### WebSocket Manager
```typescript
class WebSocketManager {
  // Subscribe to symbol updates
  subscribe(exchange: 'binance' | 'bybit', symbol: string, callback: (data: any) => void): void
  
  // Unsubscribe from symbol updates
  unsubscribe(exchange: 'binance' | 'bybit', symbol: string, callback: (data: any) => void): void
  
  // Get connection status
  getStatus(exchange: 'binance' | 'bybit'): 'connected' | 'disconnected' | 'reconnecting'
}
```

### Execution Service
```typescript
class ExecutionService {
  // Place order with Brain approval
  async placeOrder(params: {
    phase: 'phase1' | 'phase2' | 'phase3';
    symbol: string;
    side: 'Buy' | 'Sell';
    type: 'MARKET' | 'LIMIT' | 'POST_ONLY';
    price?: number;
    qty: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<OrderResult>
  
  // Cancel order
  async cancelOrder(orderId: string, exchange: 'bybit' | 'mexc'): Promise<void>
  
  // Get order status
  async getOrderStatus(orderId: string, exchange: 'bybit' | 'mexc'): Promise<OrderStatus>
}
```

### Telemetry Service
```typescript
class TelemetryService {
  // Log signal with phase tag
  logSignal(phase: 'phase1' | 'phase2' | 'phase3', signal: SignalData): void
  
  // Log execution with phase tag
  logExecution(phase: 'phase1' | 'phase2' | 'phase3', execution: ExecutionData): void
  
  // Aggregate metrics for Brain
  getMetrics(phase: 'phase1' | 'phase2' | 'phase3', timeRange: TimeRange): Metrics
}
```

### Config Manager
```typescript
class ConfigManager {
  // Load config with Brain hierarchy
  loadConfig(phase: 'phase1' | 'phase2' | 'phase3'): PhaseConfig
  
  // Save config
  saveConfig(phase: 'phase1' | 'phase2' | 'phase3', config: PhaseConfig): void
  
  // Hot-reload config
  async reloadConfig(phase: 'phase1' | 'phase2' | 'phase3'): Promise<void>
}
```

## Best Practices

### TypeScript Development
- Use strict mode (`"strict": true`)
- Define explicit types for all function parameters and return values
- Use interfaces for data structures
- Use enums for fixed sets of values
- Add JSDoc comments for public methods
- Handle errors with try-catch
- Log all errors via TelemetryService

### Testing
- Write unit tests for all pure functions
- Write property-based tests for correctness properties
- Write integration tests for end-to-end flows
- Aim for 80%+ code coverage
- Use descriptive test names
- Mock external dependencies (exchanges, WebSockets)

### Performance
- Use TypedArrays (Float64Array) for numerical calculations
- Cache expensive computations
- Batch API requests where possible
- Use connection pooling for WebSockets
- Implement rate limiting to avoid API bans

### Security
- Never commit API keys or secrets
- Use environment variables for sensitive data
- Encrypt credentials with AES-256-GCM
- Validate all user inputs
- Use HMAC signatures for exchange APIs

### Error Handling
- Always use try-catch for async operations
- Log errors with context (symbol, phase, timestamp)
- Implement retry logic with exponential backoff
- Fail gracefully (don't crash the entire system)
- Report critical errors to Brain

## Deployment

### Production Setup (PM2)
```bash
# Install PM2
npm install -g pm2

# Start all services
pm2 start ecosystem.config.js

# Monitor services
pm2 monit

# View logs
pm2 logs

# Restart services
pm2 restart all

# Stop services
pm2 stop all
```

### ecosystem.config.js
```javascript
module.exports = {
  apps: [
    {
      name: 'titan-brain',
      script: './services/titan-brain/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'titan-shared',
      script: './services/shared/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'titan-phase1',
      script: './services/titan-phase1-scavenger/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M'
    },
    {
      name: 'titan-phase2',
      script: './services/titan-phase2-hunter/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M'
    }
  ]
};
```

### Redis Setup
```bash
# Install Redis
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis

# Enable Redis on boot
sudo systemctl enable redis

# Test Redis
redis-cli ping
```

### Environment Variables
```bash
# .env file
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret
BYBIT_API_KEY=your_bybit_key
BYBIT_API_SECRET=your_bybit_secret
MEXC_API_KEY=your_mexc_key
MEXC_API_SECRET=your_mexc_secret
TITAN_MASTER_PASSWORD=your_master_password
REDIS_URL=redis://localhost:6379
NODE_ENV=production
```

## MCP Servers Available

The following MCP servers are configured and can be used during development:

### Context7 (Documentation Lookup)
Use for looking up library documentation and API references:
```
mcp_Context7_resolve_library_id - Find library IDs
mcp_Context7_get_library_docs - Get documentation for a library
```
**When to use**: When you need to look up TypeScript, Node.js, or framework documentation.

### Chrome DevTools (Browser Testing)
Use for testing web UIs or debugging WebSocket connections:
```
mcp_chrome_devtools_navigate_page - Navigate to URL
mcp_chrome_devtools_take_snapshot - Get page state
mcp_chrome_devtools_list_console_messages - Check for errors
```
**When to use**: When testing exchange websites, monitoring WebSocket traffic, or debugging API responses.

### Firecrawl (Web Research)
Use for researching trading concepts or market structure:
```
mcp_firecrawl_firecrawl_search - Search the web
mcp_firecrawl_firecrawl_scrape - Scrape a webpage
```
**When to use**: When researching trading strategies, market structure concepts, or looking up exchange API documentation.

### Shadcn (UI Components)
Use for building terminal dashboards or web UIs:
```
mcp_shadcn_search_items_in_registries - Find UI components
mcp_shadcn_view_items_in_registries - View component details
```
**When to use**: When building the Ink terminal dashboard for phases.

## Technology Stack Summary

| Component | Language | Framework | Purpose |
|-----------|----------|-----------|---------|
| Phase 1 - Scavenger | TypeScript | Node.js | Trap system |
| Phase 2 - Hunter | TypeScript | Node.js | Holographic engine |
| Phase 3 - Sentinel | TypeScript | Node.js | Basis arbitrage |
| Phase 4 - AI Quant | Python | scikit-learn, optuna | Parameter optimization |
| Phase 5 - Brain | TypeScript | Node.js | Orchestration |
| Shared Infrastructure | TypeScript | Node.js | WebSocket, Execution, Telemetry |
| Console UI | TypeScript | Ink + React | Terminal dashboard |
| Inter-Process Comm | Redis | Pub/Sub | Phase coordination |
| Process Management | PM2 | - | Production deployment |

## Performance Benchmarks

### Target Performance
- WebSocket message processing: < 1ms
- Order execution: < 100ms (including network)
- Config hot-reload: < 50ms
- Metrics aggregation: < 1s
- Memory usage per phase: < 500MB
- CPU usage per phase: < 50% (single core)

### Optimization Techniques
- Use TypedArrays for numerical calculations
- Cache expensive computations (5-minute TTL)
- Batch API requests where possible
- Use connection pooling for WebSockets
- Implement rate limiting to avoid API bans
- Use Redis for inter-process communication
- Minimize garbage collection with object pooling
