# Titan System - Developer Guide

This guide provides technical documentation for developers working on the Titan Trading System.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Signal Protocol](#signal-protocol)
- [Adding New Detectors](#adding-new-detectors)
- [Database Schema](#database-schema)
- [Testing Guide](#testing-guide)
- [Code Standards](#code-standards)

---

## Architecture Overview

### Hub-and-Spoke Model

The Titan system uses a **Hub-and-Spoke** architecture where the Execution Service (Hub) receives signals from multiple signal generators (Spokes).

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SIGNAL GENERATORS (Spokes)                        │
├─────────────────────────────────────────────────────────────────────┤
│  Phase 1: Scavenger    Phase 2: Hunter       Phase 3: Sentinel      │
│  (Trap-based)          (MTF Alignment)       (Yield/Arb)            │
│       │                      │                      │                │
│       │ ZeroMQ               │ HTTP                 │ HTTP           │
│       │ (<0.1ms)             │ (~5ms)               │ (~5ms)         │
│       ▼                      ▼                      ▼                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EXECUTION SERVICE (Hub)                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ Signal      │  │ Shadow      │  │ Risk        │                  │
│  │ Router      │  │ State       │  │ Overlay     │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ Phase       │  │ Broker      │  │ Database    │                  │
│  │ Manager     │  │ Gateway     │  │ Manager     │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| SignalRouter | `SignalRouter.js` | Routes signals to appropriate handlers |
| ShadowState | `ShadowState.js` | Position tracking (Master of Truth) |
| PhaseManager | `PhaseManager.js` | Equity-based phase transitions |
| BrokerGateway | `BrokerGateway.js` | Exchange API abstraction |
| CircuitBreaker | `CircuitBreaker.js` | Safety gates and kill switch |
| DatabaseManager | `DatabaseManager.js` | SQLite persistence layer |

---

## Signal Protocol

### Intent Signal Format

All signal generators must send signals in this format:


```javascript
const intentSignal = {
  // Required fields
  signal_id: "scav_BTCUSDT_1702500000000",  // Unique identifier
  signal_type: "PREPARE" | "CONFIRM" | "ABORT",
  source: "scavenger" | "hunter" | "sentinel",
  symbol: "BTCUSDT",
  direction: "LONG" | "SHORT",
  timestamp: 1702500000000,  // Unix timestamp in ms
  
  // Entry/Exit parameters
  entry_zone: {
    min: 42000,
    max: 42100
  },
  stop_loss: 41500,
  take_profits: [43000, 44000, 45000],
  
  // Risk parameters
  confidence: 85,  // 0-100
  leverage: 20,
  
  // Phase-specific metadata
  trap_type: "LIQUIDATION",  // Phase 1
  hologram_state: "A+",      // Phase 2
  funding_rate: 0.001,       // Phase 3
  
  // Regime context
  regime_vector: {
    trend_state: 1,
    vol_state: 1,
    liquidity_state: 2,
    regime_state: 1
  }
};
```

### Signal Flow

```
1. PREPARE (5 seconds before execution)
   ├── Signal Router receives signal
   ├── Phase filter checks source matches active phase
   ├── Risk Overlay validates against limits
   ├── L2 data pre-fetched
   ├── Position size calculated
   └── Signal stored in preparedIntents map

2. CONFIRM (on trigger)
   ├── Signal Router retrieves prepared intent
   ├── Final validation (staleness, regime)
   ├── Broker Gateway executes order
   ├── Shadow State updated
   ├── Database persisted
   └── WebSocket broadcast to Console

3. ABORT (if signal invalidated)
   ├── Signal Router retrieves prepared intent
   ├── Intent removed from preparedIntents
   └── Log SIGNAL_ABORTED event
```

### HMAC Signature

All signals must be signed with HMAC-SHA256:

```javascript
const crypto = require('crypto');

function signSignal(signal, secret) {
  const payload = JSON.stringify(signal);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature;
}

// Usage
const signature = signSignal(intentSignal, process.env.HMAC_SECRET);

// Send with signature
fetch('/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Signature': signature
  },
  body: JSON.stringify({ signal: intentSignal, signature })
});
```

---

## Adding New Detectors

### Detector Interface

All detectors must implement this interface:

```javascript
class BaseDetector {
  constructor(config) {
    this.config = config;
    this.name = 'base';
  }

  /**
   * Detect trading opportunity
   * @param {string} symbol - Trading pair (e.g., "BTCUSDT")
   * @param {object} marketData - Current market data
   * @returns {object|null} - Signal if detected, null otherwise
   */
  async detect(symbol, marketData) {
    throw new Error('detect() must be implemented');
  }

  /**
   * Get detector configuration
   * @returns {object} - Current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Update detector configuration
   * @param {object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}
```

### Example: Creating a New Detector

```javascript
// detectors/MyNewDetector.js

class MyNewDetector {
  constructor(config = {}) {
    this.name = 'my_new_detector';
    this.config = {
      threshold: config.threshold || 0.5,
      minConfidence: config.minConfidence || 70,
      ...config
    };
  }

  async detect(symbol, marketData) {
    // 1. Extract relevant data
    const { price, volume, orderBook } = marketData;
    
    // 2. Calculate your signal logic
    const signalStrength = this.calculateSignalStrength(price, volume);
    
    // 3. Check threshold
    if (signalStrength < this.config.threshold) {
      return null;
    }
    
    // 4. Determine direction
    const direction = this.determineDirection(orderBook);
    
    // 5. Calculate entry/exit levels
    const entryZone = this.calculateEntryZone(price);
    const stopLoss = this.calculateStopLoss(price, direction);
    const takeProfits = this.calculateTakeProfits(price, direction);
    
    // 6. Return signal
    return {
      signal: true,
      direction,
      entry_zone: entryZone,
      stop_loss: stopLoss,
      take_profits: takeProfits,
      confidence: Math.round(signalStrength * 100),
      metadata: {
        detector: this.name,
        signal_strength: signalStrength
      }
    };
  }

  calculateSignalStrength(price, volume) {
    // Your logic here
    return 0.75;
  }

  determineDirection(orderBook) {
    // Your logic here
    return 'LONG';
  }

  calculateEntryZone(price) {
    return {
      min: price * 0.999,
      max: price * 1.001
    };
  }

  calculateStopLoss(price, direction) {
    const stopPct = direction === 'LONG' ? 0.98 : 1.02;
    return price * stopPct;
  }

  calculateTakeProfits(price, direction) {
    const multipliers = direction === 'LONG' 
      ? [1.02, 1.04, 1.06] 
      : [0.98, 0.96, 0.94];
    return multipliers.map(m => price * m);
  }
}

module.exports = MyNewDetector;
```

### Registering the Detector

```javascript
// In server.js or initialization code

const DetectorRegistry = require('./detectors/DetectorRegistry');
const MyNewDetector = require('./detectors/MyNewDetector');

// Create registry
const registry = new DetectorRegistry();

// Register detector
registry.register('my_new_detector', new MyNewDetector({
  threshold: 0.6,
  minConfidence: 75
}));

// Use in signal handler
const results = await registry.runAll('BTCUSDT', marketData);
```

### Testing Your Detector

```javascript
// detectors/MyNewDetector.test.js

const MyNewDetector = require('./MyNewDetector');

describe('MyNewDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new MyNewDetector({ threshold: 0.5 });
  });

  test('should return null when signal strength below threshold', async () => {
    const marketData = {
      price: 50000,
      volume: 100,
      orderBook: { bids: [], asks: [] }
    };
    
    const result = await detector.detect('BTCUSDT', marketData);
    expect(result).toBeNull();
  });

  test('should return signal when conditions met', async () => {
    const marketData = {
      price: 50000,
      volume: 10000,  // High volume
      orderBook: { bids: [[49900, 100]], asks: [[50100, 50]] }
    };
    
    const result = await detector.detect('BTCUSDT', marketData);
    expect(result).not.toBeNull();
    expect(result.signal).toBe(true);
    expect(result.direction).toBeDefined();
  });
});
```

---

## Database Schema

### Tables Overview

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `system_state` | Global system state | nav, active_phase, master_arm |
| `trade_history` | Complete trade records | symbol, side, entry_price, exit_price, pnl |
| `positions` | Shadow State persistence | symbol, side, size, entry_price |
| `active_traps` | Persisted tripwires | symbol, trigger_price, trap_type |
| `regime_snapshots` | Historical regime context | timestamp, regime_vector |
| `system_events` | Audit trail | event_type, details, timestamp |
| `config_versions` | Configuration rollback | version_tag, config_json |
| `strategic_insights` | AI Quant knowledge | topic, insight, confidence |

### Schema Definition

```sql
-- System State (single row)
CREATE TABLE system_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nav REAL NOT NULL DEFAULT 200.0,
  active_phase INTEGER NOT NULL DEFAULT 1,
  high_watermark REAL NOT NULL DEFAULT 200.0,
  master_arm BOOLEAN NOT NULL DEFAULT FALSE,
  circuit_breaker_active BOOLEAN NOT NULL DEFAULT FALSE,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trade History
CREATE TABLE trade_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT UNIQUE NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price REAL NOT NULL,
  exit_price REAL,
  size REAL NOT NULL,
  leverage INTEGER NOT NULL,
  pnl REAL,
  pnl_pct REAL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  source TEXT NOT NULL,
  trap_type TEXT,
  regime_state INTEGER,
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  config_version TEXT
);

-- Positions (Shadow State)
CREATE TABLE positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT UNIQUE NOT NULL,
  side TEXT NOT NULL,
  size REAL NOT NULL,
  entry_price REAL NOT NULL,
  stop_loss REAL,
  take_profit_1 REAL,
  take_profit_2 REAL,
  take_profit_3 REAL,
  leverage INTEGER NOT NULL,
  unrealized_pnl REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- System Events (Audit Trail)
CREATE TABLE system_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  details TEXT,
  signal_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_trade_history_symbol ON trade_history(symbol);
CREATE INDEX idx_trade_history_status ON trade_history(status);
CREATE INDEX idx_system_events_type ON system_events(event_type);
CREATE INDEX idx_system_events_created ON system_events(created_at);
```

### Database Access Patterns

```javascript
// Read system state
const state = db.prepare('SELECT * FROM system_state WHERE id = 1').get();

// Insert trade
const insertTrade = db.prepare(`
  INSERT INTO trade_history (signal_id, symbol, side, entry_price, size, leverage, source)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
insertTrade.run(signalId, symbol, side, entryPrice, size, leverage, source);

// Update position
const updatePosition = db.prepare(`
  UPDATE positions 
  SET unrealized_pnl = ?, updated_at = CURRENT_TIMESTAMP
  WHERE symbol = ?
`);
updatePosition.run(unrealizedPnl, symbol);

// Log event
const logEvent = db.prepare(`
  INSERT INTO system_events (event_type, severity, details, signal_id)
  VALUES (?, ?, ?, ?)
`);
logEvent.run('TRADE_EXECUTED', 'INFO', JSON.stringify(details), signalId);
```

---

## Testing Guide

### Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── SignalRouter.test.js
│   ├── ShadowState.test.js
│   └── PhaseManager.test.js
├── integration/             # Integration tests
│   ├── signal-flow.test.js
│   └── phase-transition.test.js
├── property/                # Property-based tests
│   └── position-sizing.property.test.js
└── setup.js                 # Test setup
```

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Property tests
npm run test:property

# Coverage report
npm run test:coverage
```

### Writing Unit Tests

```javascript
// tests/unit/SignalRouter.test.js

const SignalRouter = require('../../SignalRouter');
const PhaseManager = require('../../PhaseManager');

describe('SignalRouter', () => {
  let router;
  let mockPhaseManager;

  beforeEach(() => {
    mockPhaseManager = {
      getCurrentPhase: jest.fn().mockReturnValue(1)
    };
    router = new SignalRouter(mockPhaseManager);
  });

  describe('route()', () => {
    test('should accept scavenger signals in Phase 1', async () => {
      const signal = {
        source: 'scavenger',
        signal_type: 'PREPARE',
        symbol: 'BTCUSDT'
      };

      const result = await router.route(signal);
      expect(result.rejected).toBeFalsy();
    });

    test('should reject hunter signals in Phase 1', async () => {
      const signal = {
        source: 'hunter',
        signal_type: 'PREPARE',
        symbol: 'BTCUSDT'
      };

      const result = await router.route(signal);
      expect(result.rejected).toBe(true);
      expect(result.reason).toBe('PHASE_MISMATCH');
    });
  });
});
```

### Writing Property Tests

```javascript
// tests/property/position-sizing.property.test.js

const fc = require('fast-check');
const PositionSizeCalculator = require('../../calculators/PositionSizeCalculator');

describe('PositionSizeCalculator Properties', () => {
  const calculator = new PositionSizeCalculator();

  test('position size should never exceed max risk', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 100, max: 100000 }),  // equity
        fc.float({ min: 0.01, max: 0.1 }),    // riskPct
        fc.float({ min: 10000, max: 100000 }), // entryPrice
        fc.float({ min: 0.01, max: 0.05 }),   // stopPct
        (equity, riskPct, entryPrice, stopPct) => {
          const stopLoss = entryPrice * (1 - stopPct);
          const size = calculator.calculate(equity, riskPct, entryPrice, stopLoss);
          
          const maxLoss = size * (entryPrice - stopLoss);
          const maxRisk = equity * riskPct;
          
          return maxLoss <= maxRisk * 1.001; // Allow 0.1% tolerance
        }
      ),
      { numRuns: 1000 }
    );
  });

  test('position size should be positive', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 100, max: 100000 }),
        fc.float({ min: 0.01, max: 0.1 }),
        fc.float({ min: 10000, max: 100000 }),
        fc.float({ min: 0.01, max: 0.05 }),
        (equity, riskPct, entryPrice, stopPct) => {
          const stopLoss = entryPrice * (1 - stopPct);
          const size = calculator.calculate(equity, riskPct, entryPrice, stopLoss);
          return size > 0;
        }
      )
    );
  });
});
```

---

## Code Standards

### File Structure

```javascript
/**
 * @fileoverview Brief description of the file
 * @module ModuleName
 */

'use strict';

// 1. External dependencies
const express = require('express');
const crypto = require('crypto');

// 2. Internal dependencies
const { logger } = require('./utils/logger');
const { validateSignal } = require('./validators');

// 3. Constants
const MAX_RETRIES = 3;
const TIMEOUT_MS = 5000;

// 4. Class/Function definitions
class MyClass {
  // ...
}

// 5. Exports
module.exports = MyClass;
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | PascalCase | `SignalRouter.js` |
| Classes | PascalCase | `class SignalRouter` |
| Functions | camelCase | `function processSignal()` |
| Constants | UPPER_SNAKE | `const MAX_LEVERAGE = 50` |
| Variables | camelCase | `let currentPhase = 1` |
| Private methods | underscore prefix | `_validateInternal()` |

### Error Handling

```javascript
// Always use try-catch for async operations
async function processSignal(signal) {
  try {
    const result = await executeOrder(signal);
    return { success: true, result };
  } catch (error) {
    logger.error('Signal processing failed', {
      signal_id: signal.signal_id,
      error: error.message,
      stack: error.stack
    });
    
    // Re-throw for caller to handle
    throw new SignalProcessingError(error.message, signal.signal_id);
  }
}

// Custom error classes
class SignalProcessingError extends Error {
  constructor(message, signalId) {
    super(message);
    this.name = 'SignalProcessingError';
    this.signalId = signalId;
  }
}
```

### Logging Standards

```javascript
const { logger } = require('./utils/StructuredLogger');

// Use structured logging
logger.info('Signal received', {
  signal_id: signal.signal_id,
  symbol: signal.symbol,
  source: signal.source
});

logger.error('Order execution failed', {
  signal_id: signal.signal_id,
  error: error.message,
  exchange: 'bybit'
});

// Log levels
// - debug: Detailed debugging info
// - info: Normal operations
// - warn: Potential issues
// - error: Errors that need attention
```

### JSDoc Comments

```javascript
/**
 * Calculate position size based on risk parameters
 * @param {number} equity - Current account equity in USD
 * @param {number} riskPct - Risk percentage (0-1)
 * @param {number} entryPrice - Entry price
 * @param {number} stopLoss - Stop loss price
 * @returns {number} Position size in base currency
 * @throws {Error} If parameters are invalid
 * @example
 * const size = calculatePositionSize(1000, 0.02, 50000, 49000);
 * // Returns: 0.02 (BTC)
 */
function calculatePositionSize(equity, riskPct, entryPrice, stopLoss) {
  // Implementation
}
```

---

## Contributing

### Pull Request Process

1. Create feature branch: `git checkout -b feature/my-feature`
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Update documentation if needed
5. Submit PR with clear description

### Code Review Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] Logging added for important operations
- [ ] No hardcoded values (use config)

---

*Last updated: December 2024*
