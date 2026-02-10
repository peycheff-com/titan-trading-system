# Logger Module

## Overview

The Logger module provides JSONL (JSON Lines) logging for the Titan Phase 1 Scavenger system. All signals, executions, position closes, and errors are logged to `~/.titan-scanner/logs/trades.jsonl` for queryable analysis.

## Features

✅ **JSONL Format**: One JSON object per line for easy parsing with `jq` or other tools  
✅ **Signal Logging**: Logs all trap details (type, confidence, leverage, entry/stop/target)  
✅ **Execution Logging**: Logs fill prices, timestamps, and order types  
✅ **Error Logging**: Logs errors with full context and stack traces  
✅ **Automatic Rotation**: Rotates logs when file size exceeds 10MB  
✅ **Automatic Compression**: Compresses logs older than 30 days using gzip  
✅ **Query Support**: Built-in query method for filtering logs  

## Usage

### Basic Initialization

```typescript
import { Logger } from './logging/Logger';

// Use default directory (~/.titan-scanner/logs/)
const logger = new Logger();

// Or specify custom directory
const logger = new Logger('/path/to/logs');
```

### Logging Signals

```typescript
logger.logSignal({
  symbol: 'BTCUSDT',
  trapType: 'OI_WIPEOUT',
  direction: 'LONG',
  entry: 50000,
  stop: 49500,
  target: 51500,
  confidence: 95,
  leverage: 20,
  orderType: 'MARKET',
  velocity: 0.006,
  positionSize: 0.1
});
```

### Logging Executions

```typescript
logger.logExecution({
  symbol: 'BTCUSDT',
  trapType: 'OI_WIPEOUT',
  direction: 'LONG',
  fillPrice: 50050,
  fillTimestamp: Date.now(),
  orderType: 'MARKET',
  positionSize: 0.1,
  leverage: 20
});
```

### Logging Position Closes

```typescript
logger.logClose({
  symbol: 'BTCUSDT',
  exitPrice: 51500,
  exitTimestamp: Date.now(),
  profitPercent: 3.0,
  closeReason: 'TARGET_HIT',
  entry: 50000
});
```

### Logging Errors

```typescript
// With Error object
try {
  await bybitClient.placeOrder(...);
} catch (error) {
  logger.logError(error, { symbol: 'BTCUSDT', orderType: 'MARKET' });
}

// With string message
logger.logError('Connection timeout', { exchange: 'Bybit' });
```

### Querying Logs

```typescript
// Get all entries
const allEntries = logger.queryLogs();

// Filter by type
const signals = logger.queryLogs(entry => entry.type === 'signal');

// Filter by trap type
const oiWipeouts = logger.queryLogs(entry => entry.trapType === 'OI_WIPEOUT');

// Filter by symbol
const btcTrades = logger.queryLogs(entry => entry.symbol === 'BTCUSDT');
```

## Log Entry Types

### Signal Entry
```json
{
  "timestamp": 1704067200000,
  "type": "signal",
  "symbol": "BTCUSDT",
  "trapType": "OI_WIPEOUT",
  "direction": "LONG",
  "entry": 50000,
  "stop": 49500,
  "target": 51500,
  "confidence": 95,
  "leverage": 20,
  "orderType": "MARKET",
  "velocity": 0.006,
  "positionSize": 0.1
}
```

### Execution Entry
```json
{
  "timestamp": 1704067205000,
  "type": "execution",
  "symbol": "BTCUSDT",
  "trapType": "OI_WIPEOUT",
  "direction": "LONG",
  "fillPrice": 50050,
  "fillTimestamp": 1704067205000,
  "orderType": "MARKET",
  "positionSize": 0.1,
  "leverage": 20
}
```

### Close Entry
```json
{
  "timestamp": 1704067800000,
  "type": "close",
  "symbol": "BTCUSDT",
  "exitPrice": 51500,
  "exitTimestamp": 1704067800000,
  "profitPercent": 3.0,
  "closeReason": "TARGET_HIT",
  "entry": 50000
}
```

### Error Entry
```json
{
  "timestamp": 1704067210000,
  "type": "error",
  "symbol": "BTCUSDT",
  "error": "Order placement failed",
  "errorStack": "Error: Order placement failed\n    at ...",
  "context": {
    "orderType": "MARKET",
    "reason": "Insufficient balance"
  }
}
```

## Command-Line Analysis

### Using jq

```bash
# Show all OI_WIPEOUT signals
cat ~/.titan-scanner/logs/trades.jsonl | jq 'select(.trapType == "OI_WIPEOUT")'

# Calculate win rate
cat ~/.titan-scanner/logs/trades.jsonl | jq -s '
  map(select(.type == "close")) | 
  group_by(.profitPercent > 0) | 
  map({profitable: .[0].profitPercent > 0, count: length})
'

# Show all errors
cat ~/.titan-scanner/logs/trades.jsonl | jq 'select(.type == "error")'

# Show signals by confidence
cat ~/.titan-scanner/logs/trades.jsonl | jq 'select(.type == "signal") | {symbol, trapType, confidence}'

# Calculate average profit per trap type
cat ~/.titan-scanner/logs/trades.jsonl | jq -s '
  map(select(.type == "close")) | 
  group_by(.trapType) | 
  map({
    trapType: .[0].trapType, 
    avgProfit: (map(.profitPercent) | add / length)
  })
'
```

### Using grep

```bash
# Find all BTCUSDT trades
grep "BTCUSDT" ~/.titan-scanner/logs/trades.jsonl

# Find all errors
grep '"type":"error"' ~/.titan-scanner/logs/trades.jsonl

# Find all executions
grep '"type":"execution"' ~/.titan-scanner/logs/trades.jsonl
```

## Log Rotation

Logs are automatically rotated when the file size exceeds 10MB:

```
~/.titan-scanner/logs/
├── trades.jsonl                    # Current log file
├── trades-2024-01-01T12-30-00.jsonl  # Rotated log
└── trades-2024-01-02T08-15-00.jsonl  # Rotated log
```

## Log Compression

Logs older than 30 days are automatically compressed using gzip:

```
~/.titan-scanner/logs/
├── trades.jsonl                          # Current log file
├── trades-2023-12-01T12-30-00.jsonl.gz  # Compressed old log
└── trades-2023-12-05T08-15-00.jsonl.gz  # Compressed old log
```

To read compressed logs:

```bash
# Decompress and view
gunzip -c ~/.titan-scanner/logs/trades-2023-12-01T12-30-00.jsonl.gz | jq

# Search in compressed logs
zgrep "BTCUSDT" ~/.titan-scanner/logs/trades-*.jsonl.gz
```

## Requirements Satisfied

✅ **11.1**: Append signal data to trades.jsonl file as single JSON object per line  
✅ **11.2**: Log signal with timestamp, symbol, strategy type, confidence, leverage, entry price, stop price, target price  
✅ **11.3**: Log execution with fill price, fill timestamp, and order type  
✅ **11.4**: Log close with exit price, exit timestamp, profit percentage, and close reason  
✅ **11.5**: Rotate log file when size exceeds 10 MB with timestamp suffix  
✅ **11.6**: Compress log files older than 30 days to gzip format  
✅ **11.7**: Support jq command-line tool for JSON filtering  

## Testing

Run the test suite:

```bash
npm test -- Logger.test.ts
```

All 16 tests pass, covering:
- Initialization
- Signal logging
- Execution logging
- Close logging
- Error logging
- Log rotation
- Log compression
- Query functionality
