# Design Document: Titan Phase 5 - The Brain Orchestrator

## Overview

The Titan Brain is the master control system that orchestrates capital allocation, risk management, and strategy coordination across all Titan phases. It implements a hierarchical decision-making architecture where phases generate intent signals, and the Brain grants or denies permission based on portfolio-level risk metrics, performance data, and equity tier rules.

The Brain operates as a "man-in-the-middle" intercepting all signals before they reach the Execution Engine, applying dynamic allocation rules, performance-based throttling, correlation guards, and circuit breakers to ensure the system maximizes geometric growth while maintaining ruin probability below 0.1%.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TITAN BRAIN                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Allocation Engine (Sigmoid Transitions)        │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │      Performance Tracker (Rolling Sharpe Ratios)       │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Risk Guardian (Correlation & Leverage)         │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          Capital Flow Manager (Profit Sweeper)         │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Circuit Breaker (Emergency Halt)             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           ▲                                    │
           │ Intent Signals                     │ Authorized Signals
           │                                    ▼
┌──────────┴──────────┐              ┌─────────────────────┐
│  Phase 1: Scavenger │              │  Execution Engine   │
│  Phase 2: Hunter    │              │  (Existing Service) │
│  Phase 3: Sentinel  │              └─────────────────────┘
└─────────────────────┘
```

### Signal Flow

```
1. Phase generates Intent Signal
   ↓
2. Brain receives signal via webhook/queue
   ↓
3. Allocation Engine determines phase weight
   ↓
4. Performance Tracker applies modifiers
   ↓
5. Risk Guardian checks correlation & leverage
   ↓
6. Brain calculates authorized position size
   ↓
7. Signal forwarded to Execution Engine (or vetoed)
   ↓
8. Execution confirms fill
   ↓
9. Brain updates performance metrics
   ↓
10. Capital Flow Manager checks sweep conditions
```

## Components and Interfaces

### 1. AllocationEngine

**Purpose:** Calculates base allocation weights for each phase based on current equity using sigmoid transition functions.

**Interface:**
```typescript
interface AllocationEngine {
  getWeights(equity: number): AllocationVector;
  getEquityTier(equity: number): EquityTier;
  getMaxLeverage(equity: number): number;
}

interface AllocationVector {
  w1: number; // Phase 1 weight (0-1)
  w2: number; // Phase 2 weight (0-1)
  w3: number; // Phase 3 weight (0-1)
  timestamp: number;
}

enum EquityTier {
  MICRO = 'MICRO',      // < $1,500
  SMALL = 'SMALL',      // $1,500 - $5,000
  MEDIUM = 'MEDIUM',    // $5,000 - $25,000
  LARGE = 'LARGE',      // $25,000 - $50,000
  INSTITUTIONAL = 'INSTITUTIONAL' // > $50,000
}
```

**Key Methods:**
- `getWeights(equity)`: Returns allocation vector using sigmoid transitions
- `getEquityTier(equity)`: Determines current tier for leverage caps
- `getMaxLeverage(equity)`: Returns maximum allowed leverage for tier

### 2. PerformanceTracker

**Purpose:** Tracks PnL and calculates rolling Sharpe Ratios for each phase to enable performance-based throttling.

**Interface:**
```typescript
interface PerformanceTracker {
  recordTrade(phaseId: string, pnl: number, timestamp: number): void;
  getSharpeRatio(phaseId: string, windowDays: number): number;
  getPerformanceModifier(phaseId: string): number;
  getTradeCount(phaseId: string, windowDays: number): number;
}

interface PhasePerformance {
  phaseId: string;
  sharpeRatio: number;
  totalPnL: number;
  tradeCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  modifier: number; // 0.5x (malus) to 1.2x (bonus)
}
```

**Key Methods:**
- `recordTrade(phaseId, pnl, timestamp)`: Logs trade result for phase
- `getSharpeRatio(phaseId, windowDays)`: Calculates rolling Sharpe
- `getPerformanceModifier(phaseId)`: Returns weight adjustment multiplier
- `getTradeCount(phaseId, windowDays)`: Returns number of trades in window

### 3. RiskGuardian

**Purpose:** Monitors portfolio-level risk metrics and enforces correlation guards and leverage limits.

**Interface:**
```typescript
interface RiskGuardian {
  checkSignal(signal: IntentSignal, currentPositions: Position[]): RiskDecision;
  calculatePortfolioDelta(): number;
  calculateCombinedLeverage(): number;
  calculateCorrelation(assetA: string, assetB: string): number;
  getPortfolioBeta(): number;
}

interface RiskDecision {
  approved: boolean;
  reason: string;
  adjustedSize?: number; // If approved with size reduction
  riskMetrics: {
    currentLeverage: number;
    projectedLeverage: number;
    correlation: number;
    portfolioDelta: number;
  };
}

interface IntentSignal {
  signalId: string;
  phaseId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  requestedSize: number; // USD notional
  timestamp: number;
}
```

**Key Methods:**
- `checkSignal(signal, positions)`: Validates signal against risk rules
- `calculatePortfolioDelta()`: Returns net directional exposure
- `calculateCombinedLeverage()`: Returns total leverage ratio
- `calculateCorrelation(assetA, assetB)`: Returns correlation coefficient
- `getPortfolioBeta()`: Returns portfolio correlation to BTC

### 4. CapitalFlowManager

**Purpose:** Manages profit sweeping from futures wallet to spot wallet with ratchet mechanism.

**Interface:**
```typescript
interface CapitalFlowManager {
  checkSweepConditions(): SweepDecision;
  executeSweep(amount: number): Promise<SweepResult>;
  getHighWatermark(): number;
  updateHighWatermark(equity: number): void;
  getTreasuryStatus(): TreasuryStatus;
}

interface SweepDecision {
  shouldSweep: boolean;
  amount: number;
  reason: string;
  futuresBalance: number;
  targetAllocation: number;
}

interface TreasuryStatus {
  futuresWallet: number;
  spotWallet: number;
  totalSwept: number;
  highWatermark: number;
  lockedProfit: number;
  riskCapital: number;
}
```

**Key Methods:**
- `checkSweepConditions()`: Determines if sweep should occur
- `executeSweep(amount)`: Performs internal transfer
- `getHighWatermark()`: Returns highest recorded equity
- `updateHighWatermark(equity)`: Updates watermark if new high
- `getTreasuryStatus()`: Returns current treasury state

### 5. CircuitBreaker

**Purpose:** Monitors for extreme conditions and triggers emergency halt when thresholds are breached.

**Interface:**
```typescript
interface CircuitBreaker {
  checkConditions(equity: number, positions: Position[]): BreakerStatus;
  trigger(reason: string): void;
  reset(operatorId: string): void;
  isActive(): boolean;
  getStatus(): BreakerStatus;
}

interface BreakerStatus {
  active: boolean;
  reason?: string;
  triggeredAt?: number;
  dailyDrawdown: number;
  consecutiveLosses: number;
  equityLevel: number;
}

enum BreakerType {
  HARD = 'HARD',  // Immediate close all + halt
  SOFT = 'SOFT'   // Cooldown period
}
```

**Key Methods:**
- `checkConditions(equity, positions)`: Evaluates breaker conditions
- `trigger(reason)`: Activates circuit breaker
- `reset(operatorId)`: Manually resets breaker (requires auth)
- `isActive()`: Returns current breaker state
- `getStatus()`: Returns detailed breaker status

### 6. TitanBrain (Main Orchestrator)

**Purpose:** Main coordinator that integrates all components and processes signals.

**Interface:**
```typescript
interface TitanBrain {
  processSignal(signal: IntentSignal): Promise<BrainDecision>;
  updateMetrics(): void;
  getDashboardData(): DashboardData;
  getHealthStatus(): HealthStatus;
}

interface BrainDecision {
  approved: boolean;
  authorizedSize: number;
  reason: string;
  allocation: AllocationVector;
  performance: PhasePerformance;
  risk: RiskDecision;
}

interface DashboardData {
  nav: number;
  allocation: AllocationVector;
  phaseEquity: { [phaseId: string]: number };
  riskMetrics: {
    globalLeverage: number;
    netDelta: number;
    correlationScore: number;
    portfolioBeta: number;
  };
  treasury: TreasuryStatus;
  circuitBreaker: BreakerStatus;
  recentDecisions: BrainDecision[];
}
```

**Key Methods:**
- `processSignal(signal)`: Main signal processing pipeline
- `updateMetrics()`: Recalculates all metrics (called every 1 min)
- `getDashboardData()`: Returns data for dashboard display
- `getHealthStatus()`: Returns system health indicators

## Data Models

### Database Schema

```sql
-- Allocation history
CREATE TABLE allocation_history (
  id SERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  equity DECIMAL(18, 2) NOT NULL,
  w1 DECIMAL(5, 4) NOT NULL,
  w2 DECIMAL(5, 4) NOT NULL,
  w3 DECIMAL(5, 4) NOT NULL,
  tier VARCHAR(20) NOT NULL
);

-- Phase performance
CREATE TABLE phase_performance (
  id SERIAL PRIMARY KEY,
  phase_id VARCHAR(20) NOT NULL,
  timestamp BIGINT NOT NULL,
  pnl DECIMAL(18, 2) NOT NULL,
  trade_count INTEGER NOT NULL,
  sharpe_ratio DECIMAL(10, 4),
  modifier DECIMAL(5, 2) NOT NULL
);

-- Brain decisions
CREATE TABLE brain_decisions (
  id SERIAL PRIMARY KEY,
  signal_id VARCHAR(100) NOT NULL UNIQUE,
  phase_id VARCHAR(20) NOT NULL,
  timestamp BIGINT NOT NULL,
  approved BOOLEAN NOT NULL,
  requested_size DECIMAL(18, 2) NOT NULL,
  authorized_size DECIMAL(18, 2),
  reason TEXT NOT NULL,
  risk_metrics JSONB
);

-- Treasury operations
CREATE TABLE treasury_operations (
  id SERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  operation_type VARCHAR(20) NOT NULL, -- 'SWEEP', 'MANUAL_TRANSFER'
  amount DECIMAL(18, 2) NOT NULL,
  from_wallet VARCHAR(20) NOT NULL,
  to_wallet VARCHAR(20) NOT NULL,
  reason TEXT,
  high_watermark DECIMAL(18, 2) NOT NULL
);

-- Circuit breaker events
CREATE TABLE circuit_breaker_events (
  id SERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  event_type VARCHAR(20) NOT NULL, -- 'TRIGGER', 'RESET'
  reason TEXT NOT NULL,
  equity DECIMAL(18, 2) NOT NULL,
  operator_id VARCHAR(50),
  metadata JSONB
);

-- Risk snapshots
CREATE TABLE risk_snapshots (
  id SERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  global_leverage DECIMAL(10, 2) NOT NULL,
  net_delta DECIMAL(18, 2) NOT NULL,
  correlation_score DECIMAL(5, 4) NOT NULL,
  portfolio_beta DECIMAL(5, 4) NOT NULL,
  var_95 DECIMAL(18, 2) NOT NULL
);
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Allocation Vector Sum Invariant

*For any* equity level, the sum of all phase weights in the allocation vector should always equal 1.0 (100% capital allocation).

**Validates: Requirements 1.6**

### Property 2: Leverage Cap Enforcement

*For any* signal and current equity, if the signal is approved, the resulting combined leverage should not exceed the maximum leverage for the current equity tier.

**Validates: Requirements 3.4**

### Property 3: Performance Modifier Bounds

*For any* phase performance data, the calculated performance modifier should be between 0.5 (malus) and 1.2 (bonus), inclusive.

**Validates: Requirements 2.3, 2.4**

### Property 4: Sweep Monotonicity

*For any* sequence of sweep operations, the total amount swept to spot wallet should be monotonically increasing (never decreases).

**Validates: Requirements 4.4**

### Property 5: Reserve Limit Protection

*For any* sweep operation, the remaining futures wallet balance should never drop below the reserve limit ($200).

**Validates: Requirements 4.5**

### Property 6: Circuit Breaker Idempotence

*For any* circuit breaker state, triggering the breaker multiple times while already active should not change the state or create duplicate events.

**Validates: Requirements 5.4, 5.5**

### Property 7: Signal Processing Latency

*For any* valid intent signal, the brain should produce a decision within 100ms.

**Validates: Requirements 7.5**

### Property 8: Position Size Consistency

*For any* approved signal, the authorized position size should be less than or equal to the requested size multiplied by the phase's adjusted weight.

**Validates: Requirements 1.7**

### Property 9: Correlation Veto Consistency

*For any* two signals with correlation > 0.8 in the same direction, if the first is approved, the second should either be vetoed or have reduced size.

**Validates: Requirements 3.7**

### Property 10: High Watermark Monotonicity

*For any* sequence of equity updates, the high watermark should be monotonically non-decreasing.

**Validates: Requirements 4.1**

### Property 11: Phase Priority Ordering

*For any* set of simultaneous signals, they should be processed in priority order: Phase 3 > Phase 2 > Phase 1.

**Validates: Requirements 7.1**

### Property 12: Equity Tier Consistency

*For any* equity value, the assigned equity tier should match the tier boundaries defined in the allocation engine.

**Validates: Requirements 1.2, 1.3, 1.4, 1.5**

## Error Handling

### Error Categories

1. **Signal Processing Errors**
   - Invalid signal format
   - Missing required fields
   - Unknown phase ID
   - **Recovery:** Reject signal, log error, notify phase

2. **Risk Calculation Errors**
   - Unable to fetch current positions
   - Correlation data unavailable
   - **Recovery:** Use cached data if < 5 min old, otherwise veto signal

3. **Database Errors**
   - Connection failure
   - Write timeout
   - **Recovery:** Retry 3x with exponential backoff, cache in memory

4. **Exchange API Errors**
   - Transfer API failure (sweep)
   - Balance fetch failure
   - **Recovery:** Retry with backoff, alert operator if persistent

5. **Circuit Breaker Errors**
   - Unable to close positions
   - **Recovery:** Escalate to emergency protocol, manual intervention

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: number;
  };
}
```

### Fallback Behaviors

- **If AllocationEngine fails:** Use last known allocation vector
- **If PerformanceTracker fails:** Use base weights without modifiers
- **If RiskGuardian fails:** Veto all signals (fail-safe)
- **If CapitalFlowManager fails:** Skip sweep, alert operator
- **If CircuitBreaker fails:** Assume active (fail-safe)

## Testing Strategy

### Unit Testing

Unit tests will verify individual component behavior:

- **AllocationEngine:** Test sigmoid transitions at boundary points
- **PerformanceTracker:** Test Sharpe ratio calculations with known data
- **RiskGuardian:** Test correlation calculations and leverage caps
- **CapitalFlowManager:** Test sweep condition logic
- **CircuitBreaker:** Test threshold detection

### Property-Based Testing

Property-based tests will use fast-check to verify correctness properties across random inputs:

- Generate random equity values and verify allocation sum = 1.0
- Generate random signal sequences and verify leverage caps
- Generate random performance data and verify modifier bounds
- Generate random sweep scenarios and verify monotonicity
- Generate random breaker conditions and verify idempotence

Each property test should run a minimum of 100 iterations.

### Integration Testing

Integration tests will verify component interactions:

- End-to-end signal processing pipeline
- Database persistence and recovery
- Exchange API integration (sweep operations)
- Dashboard data aggregation
- Circuit breaker triggering and position closure

### Performance Testing

- Signal processing latency (target: < 100ms)
- Metric calculation overhead (target: < 50ms)
- Database query performance
- Concurrent signal handling

### Testing Framework

- **Unit Tests:** Jest
- **Property Tests:** fast-check
- **Integration Tests:** Jest with test database
- **Load Tests:** Artillery or k6

## Performance Considerations

### Optimization Strategies

1. **Caching:**
   - Cache allocation vectors (1 min TTL)
   - Cache correlation matrix (5 min TTL)
   - Cache performance metrics (1 min TTL)

2. **Database:**
   - Index on timestamp columns
   - Partition large tables by date
   - Use connection pooling

3. **Computation:**
   - Pre-calculate sigmoid values for common equity levels
   - Use incremental Sharpe ratio updates
   - Batch database writes

4. **Concurrency:**
   - Process signals asynchronously
   - Use queue for signal ordering
   - Parallel risk calculations

### Monitoring Metrics

- Signal processing latency (p50, p95, p99)
- Decision approval rate per phase
- Database query times
- Memory usage
- CPU usage
- Cache hit rates

## Security Considerations

### Authentication

- Operator authentication required for:
  - Circuit breaker reset
  - Manual allocation override
  - Treasury withdrawals

### Authorization

- Role-based access control:
  - **Operator:** Can reset breakers, view all data
  - **Viewer:** Read-only dashboard access
  - **System:** Automated operations only

### Audit Trail

- Log all brain decisions with full context
- Log all allocation changes
- Log all treasury operations
- Log all circuit breaker events
- Immutable audit log (append-only)

### Data Protection

- Encrypt sensitive data at rest
- Use secure connections for exchange APIs
- Sanitize logs (no API keys)

## Deployment Considerations

### Infrastructure

- Deploy as separate service from Execution Engine
- Use message queue (Redis) for signal communication
- PostgreSQL for persistent storage
- Prometheus + Grafana for monitoring

### Configuration

```typescript
interface BrainConfig {
  allocationEngine: {
    transitionPoints: {
      startP2: number;
      fullP2: number;
      startP3: number;
    };
    leverageCaps: {
      [tier: string]: number;
    };
  };
  performanceTracker: {
    windowDays: number;
    minTradeCount: number;
    malusMultiplier: number;
    bonusMultiplier: number;
  };
  riskGuardian: {
    maxCorrelation: number;
    correlationPenalty: number;
    betaUpdateInterval: number;
  };
  capitalFlow: {
    sweepThreshold: number; // 1.2 = 20% excess
    reserveLimit: number;
    sweepSchedule: string; // cron expression
  };
  circuitBreaker: {
    maxDailyDrawdown: number;
    minEquity: number;
    consecutiveLossLimit: number;
    cooldownMinutes: number;
  };
}
```

### Scaling

- Horizontal scaling not required (single instance sufficient)
- Vertical scaling for increased signal volume
- Database read replicas for dashboard queries

## Integration Points

### Upstream (Signal Sources)

- Phase 1 Scavenger webhook
- Phase 2 Hunter webhook
- Phase 3 Sentinel webhook

### Downstream (Execution)

- Execution Engine signal forwarding
- Exchange API (balance, transfers)

### Monitoring

- Prometheus metrics endpoint
- Grafana dashboard
- Alert manager integration

### External Systems

- Notification service (Telegram, email)
- Logging aggregation (ELK stack)
- Backup service (database snapshots)
