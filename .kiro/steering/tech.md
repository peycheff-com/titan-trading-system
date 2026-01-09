# Technical Stack

## Titan Trading System

This is a comprehensive algorithmic trading system with 5 operational phases orchestrated by a central Brain.

## Languages

- **TypeScript (Node.js v20+)**: All trading phases, Brain orchestrator, shared infrastructure, and AI Quant
- **JavaScript (Node.js)**: Titan Execution microservice

## Development Commands

```bash
# Install dependencies for a service
cd services/titan-<service-name>
npm install

# Run tests
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# Build TypeScript
npm run build            # Compile to JavaScript

# Development mode
npm run dev              # Start with auto-reload

# Lint and format
npm run lint:check       # Check linting
npm run lint:fix         # Fix linting
npm run format:check     # Check formatting
npm run format:write     # Fix formatting
```

## Core Dependencies

### Production (TypeScript/Node.js)
- `ws` (^8.x): WebSocket client
- `fastify` (^4.x): HTTP server framework
- `chalk` (^5.x): Colored terminal output
- `ink` (^4.x): Terminal UI framework (Phase 1, 2, 3)
- `react` (^18.x): UI components
- `redis` (^4.x): Inter-process communication
- `pg` (^8.x): PostgreSQL client (Brain)
- `better-sqlite3`: SQLite client (AI Quant, Execution)

### AI Integration (Phase 4)
- `@google/generative-ai`: Gemini AI client
- Custom rate limiting and guardrails

### Web Dashboard (Console)
- `react` (^18.x): UI framework
- `vite` (^5.x): Build tool
- `tailwindcss` (^3.x): CSS framework
- `@radix-ui/*`: UI primitives
- `shadcn/ui`: Component library

### Development
- `typescript` (^5.x): TypeScript compiler
- `@types/node` (^20.x): Node.js type definitions
- `jest` (^29.x): Testing framework
- `ts-jest` (^29.x): TypeScript support for Jest
- `fast-check` (^3.x): Property-based testing
- `eslint` (^8.x): Linting
- `prettier` (^3.x): Formatting

## Service-Specific Tech Stacks

### Titan Brain (Phase 5)
```
TypeScript + Node.js + Fastify
├── Database: PostgreSQL (Supabase)
├── Cache: In-memory + Redis
├── Metrics: Prometheus
├── Logging: Structured JSON
└── API: REST + WebSocket
```

### Titan Execution
```
JavaScript + Node.js + Fastify
├── Database: SQLite / PostgreSQL
├── Cache: Redis (idempotency)
├── WebSocket: Exchange connections
├── Adapters: Bybit, MEXC, Binance
└── API: REST webhooks
```

### Titan Console
```
TypeScript + React + Vite
├── UI: Tailwind CSS + shadcn/ui
├── State: React hooks
├── Real-time: WebSocket
└── Build: Vite
```

### Titan AI Quant (Phase 4)
```
TypeScript + Node.js
├── AI: Gemini 1.5 Flash
├── Database: SQLite (Strategic Memory)
├── Backtesting: Custom engine
└── UI: Ink + React (terminal)
```

### Trading Phases (1, 2, 3)
```
TypeScript + Node.js
├── UI: Ink + React (terminal)
├── WebSocket: Exchange streams
├── Execution: Via shared infrastructure
└── Config: JSON + hot-reload
```

## TypeScript Configuration

### tsconfig.json (Standard)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
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
  subscribe(exchange: 'binance' | 'bybit', symbol: string, callback: (data: any) => void): void
  unsubscribe(exchange: 'binance' | 'bybit', symbol: string, callback: (data: any) => void): void
  getStatus(exchange: 'binance' | 'bybit'): 'connected' | 'disconnected' | 'reconnecting'
}
```

### Execution Service
```typescript
class ExecutionService {
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
  
  async cancelOrder(orderId: string, exchange: 'bybit' | 'mexc'): Promise<void>
  async getOrderStatus(orderId: string, exchange: 'bybit' | 'mexc'): Promise<OrderStatus>
}
```

### Telemetry Service
```typescript
class TelemetryService {
  logSignal(phase: 'phase1' | 'phase2' | 'phase3', signal: SignalData): void
  logExecution(phase: 'phase1' | 'phase2' | 'phase3', execution: ExecutionData): void
  getMetrics(phase: 'phase1' | 'phase2' | 'phase3', timeRange: TimeRange): Metrics
}
```

### Config Manager
```typescript
class ConfigManager {
  loadConfig(phase: 'phase1' | 'phase2' | 'phase3'): PhaseConfig
  saveConfig(phase: 'phase1' | 'phase2' | 'phase3', config: PhaseConfig): void
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
- Use HMAC signatures for exchange APIs and webhooks

### Error Handling
- Always use try-catch for async operations
- Log errors with context (symbol, phase, timestamp)
- Implement retry logic with exponential backoff
- Fail gracefully (don't crash the entire system)
- Report critical errors to Brain

## Deployment

### Railway Deployment (Production)
```bash
# Services auto-deploy from main branch
# Configure via railway.json in each service

# Manual deployment
npm install -g @railway/cli
railway login
railway up
```

### PM2 Process Management (Local/VPS)
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
      max_memory_restart: '500M'
    },
    {
      name: 'titan-execution',
      script: './services/titan-execution/src/server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M'
    },
    {
      name: 'titan-phase1',
      script: './services/titan-phase1-scavenger/dist/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M'
    },
    {
      name: 'titan-phase2',
      script: './services/titan-phase2-hunter/dist/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M'
    }
  ]
};
```

### Environment Variables
```bash
# .env file
NODE_ENV=production

# Database
DB_HOST=your_postgres_host
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
DB_NAME=your_postgres_database

# Exchange APIs
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret
BYBIT_API_KEY=your_bybit_key
BYBIT_API_SECRET=your_bybit_secret
MEXC_API_KEY=your_mexc_key
MEXC_API_SECRET=your_mexc_secret

# Security
TITAN_MASTER_PASSWORD=your_master_password
HMAC_SECRET=your_webhook_secret

# AI (Phase 4)
GEMINI_API_KEY=your_gemini_api_key

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

## Technology Stack Summary

| Component | Language | Framework | Database |
|-----------|----------|-----------|----------|
| Phase 1 - Scavenger | TypeScript | Node.js + Ink | - |
| Phase 2 - Hunter | TypeScript | Node.js + Ink | - |
| Phase 3 - Sentinel | TypeScript | Node.js + Ink | - |
| Phase 4 - AI Quant | TypeScript | Node.js + Gemini | SQLite |
| Phase 5 - Brain | TypeScript | Node.js + Fastify | PostgreSQL |
| Titan Execution | JavaScript | Node.js + Fastify | SQLite/PostgreSQL |
| Titan Console | TypeScript | React + Vite | - |
| Shared Infrastructure | TypeScript | Node.js | Redis |

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
