# Logger Integration Example

## Integration with TitanTrap Engine

Here's how the Logger integrates with the TitanTrap engine for complete signal and execution tracking:

```typescript
import { TitanTrap } from './engine/TitanTrap';
import { Logger } from './logging/Logger';
import { BinanceSpotClient } from './exchanges/BinanceSpotClient';
import { BybitPerpsClient } from './exchanges/BybitPerpsClient';

// Initialize logger
const logger = new Logger();

// Initialize TitanTrap with logger
const titanTrap = new TitanTrap({
  binanceClient,
  bybitClient,
  logger
});

// Example: TitanTrap fire() method with logging
class TitanTrap {
  private logger: Logger;
  
  async fire(trap: Tripwire): Promise<void> {
    trap.activated = true;
    trap.activatedAt = Date.now();
    
    try {
      // Calculate execution parameters
      const bybitPrice = await this.bybitClient.getCurrentPrice(trap.symbol);
      const velocity = await this.calcVelocity(trap.symbol);
      const orderType = this.determineOrderType(velocity);
      const positionSize = this.calcPositionSize(this.cachedEquity, trap.confidence, trap.leverage);
      
      // LOG SIGNAL
      this.logger.logSignal({
        symbol: trap.symbol,
        trapType: trap.trapType,
        direction: trap.direction,
        entry: bybitPrice,
        stop: trap.direction === 'LONG' ? bybitPrice * 0.99 : bybitPrice * 1.01,
        target: trap.direction === 'LONG' ? bybitPrice * 1.03 : bybitPrice * 0.97,
        confidence: trap.confidence,
        leverage: trap.leverage,
        orderType,
        velocity,
        positionSize
      });
      
      // Execute order
      const order = await this.bybitClient.placeOrder({
        symbol: trap.symbol,
        side: trap.direction === 'LONG' ? 'Buy' : 'Sell',
        type: orderType,
        qty: positionSize,
        leverage: trap.leverage
      });
      
      // LOG EXECUTION
      if (order.result && order.result.orderId) {
        this.logger.logExecution({
          symbol: trap.symbol,
          trapType: trap.trapType,
          direction: trap.direction,
          fillPrice: order.result.avgPrice || bybitPrice,
          fillTimestamp: Date.now(),
          orderType,
          positionSize,
          leverage: trap.leverage
        });
      }
      
      // Set stop loss and target
      await this.bybitClient.setStopLoss(trap.symbol, stopLoss);
      await this.bybitClient.setTakeProfit(trap.symbol, target);
      
    } catch (error) {
      // LOG ERROR
      this.logger.logError(error, {
        symbol: trap.symbol,
        trapType: trap.trapType,
        direction: trap.direction,
        phase: 'execution'
      });
      
      throw error;
    }
  }
  
  // Position close handler
  async onPositionClose(symbol: string, exitPrice: number, entryPrice: number, closeReason: string): Promise<void> {
    const profitPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
    
    // LOG CLOSE
    this.logger.logClose({
      symbol,
      exitPrice,
      exitTimestamp: Date.now(),
      profitPercent,
      closeReason,
      entry: entryPrice
    });
  }
}
```

## Event-Driven Logging

Integration with the EventEmitter for automatic logging:

```typescript
import { EventEmitter } from './events/EventEmitter';
import { Logger } from './logging/Logger';

const eventEmitter = new EventEmitter();
const logger = new Logger();

// Log TRAP_SPRUNG events
eventEmitter.on('TRAP_SPRUNG', (data) => {
  logger.logSignal({
    symbol: data.symbol,
    trapType: data.trapType,
    direction: data.direction,
    entry: data.entry,
    stop: data.stop,
    target: data.target,
    confidence: data.confidence,
    leverage: data.leverage
  });
});

// Log EXECUTION_COMPLETE events
eventEmitter.on('EXECUTION_COMPLETE', (data) => {
  logger.logExecution({
    symbol: data.symbol,
    trapType: data.trapType,
    direction: data.direction,
    fillPrice: data.fillPrice,
    fillTimestamp: data.fillTimestamp,
    orderType: data.orderType,
    positionSize: data.positionSize,
    leverage: data.leverage
  });
});

// Log ERROR events
eventEmitter.on('ERROR', (data) => {
  logger.logError(data.error, data.context);
});
```

## Analysis Queries

### Win Rate Analysis

```typescript
const logger = new Logger();

// Get all closed positions
const closedPositions = logger.queryLogs(entry => entry.type === 'close');

// Calculate win rate
const winners = closedPositions.filter(p => p.profitPercent > 0);
const winRate = (winners.length / closedPositions.length) * 100;

console.log(`Win Rate: ${winRate.toFixed(2)}%`);
console.log(`Total Trades: ${closedPositions.length}`);
console.log(`Winners: ${winners.length}`);
console.log(`Losers: ${closedPositions.length - winners.length}`);
```

### Performance by Trap Type

```typescript
const closedPositions = logger.queryLogs(entry => entry.type === 'close');

// Group by trap type
const byTrapType = closedPositions.reduce((acc, entry) => {
  const type = entry.trapType || 'UNKNOWN';
  if (!acc[type]) {
    acc[type] = { trades: [], totalProfit: 0 };
  }
  acc[type].trades.push(entry);
  acc[type].totalProfit += entry.profitPercent || 0;
  return acc;
}, {});

// Calculate stats per trap type
Object.entries(byTrapType).forEach(([type, data]) => {
  const avgProfit = data.totalProfit / data.trades.length;
  const winRate = (data.trades.filter(t => t.profitPercent > 0).length / data.trades.length) * 100;
  
  console.log(`\n${type}:`);
  console.log(`  Trades: ${data.trades.length}`);
  console.log(`  Avg Profit: ${avgProfit.toFixed(2)}%`);
  console.log(`  Win Rate: ${winRate.toFixed(2)}%`);
});
```

### Error Analysis

```typescript
const errors = logger.queryLogs(entry => entry.type === 'error');

// Group by error type
const errorsByType = errors.reduce((acc, entry) => {
  const errorMsg = entry.error || 'Unknown';
  acc[errorMsg] = (acc[errorMsg] || 0) + 1;
  return acc;
}, {});

console.log('Error Summary:');
Object.entries(errorsByType)
  .sort((a, b) => b[1] - a[1])
  .forEach(([error, count]) => {
    console.log(`  ${error}: ${count} occurrences`);
  });
```

## Command-Line Monitoring

### Real-time Log Monitoring

```bash
# Watch for new signals
tail -f ~/.titan-scanner/logs/trades.jsonl | jq 'select(.type == "signal")'

# Watch for executions
tail -f ~/.titan-scanner/logs/trades.jsonl | jq 'select(.type == "execution")'

# Watch for errors
tail -f ~/.titan-scanner/logs/trades.jsonl | jq 'select(.type == "error")'

# Watch for closes with profit > 2%
tail -f ~/.titan-scanner/logs/trades.jsonl | jq 'select(.type == "close" and .profitPercent > 2)'
```

### Daily Performance Report

```bash
#!/bin/bash
# daily-report.sh

LOG_FILE=~/.titan-scanner/logs/trades.jsonl
TODAY=$(date +%Y-%m-%d)

echo "=== Titan Scavenger Daily Report: $TODAY ==="
echo ""

# Total signals
SIGNALS=$(cat $LOG_FILE | jq -s "map(select(.type == \"signal\" and (.timestamp / 1000 | strftime(\"%Y-%m-%d\")) == \"$TODAY\")) | length")
echo "Signals Generated: $SIGNALS"

# Total executions
EXECUTIONS=$(cat $LOG_FILE | jq -s "map(select(.type == \"execution\" and (.timestamp / 1000 | strftime(\"%Y-%m-%d\")) == \"$TODAY\")) | length")
echo "Orders Executed: $EXECUTIONS"

# Closed positions
CLOSES=$(cat $LOG_FILE | jq -s "map(select(.type == \"close\" and (.timestamp / 1000 | strftime(\"%Y-%m-%d\")) == \"$TODAY\"))")
TOTAL_CLOSES=$(echo $CLOSES | jq 'length')
echo "Positions Closed: $TOTAL_CLOSES"

# Win rate
if [ $TOTAL_CLOSES -gt 0 ]; then
  WINNERS=$(echo $CLOSES | jq 'map(select(.profitPercent > 0)) | length')
  WIN_RATE=$(echo "scale=2; $WINNERS * 100 / $TOTAL_CLOSES" | bc)
  echo "Win Rate: $WIN_RATE%"
  
  # Average profit
  AVG_PROFIT=$(echo $CLOSES | jq '[.[].profitPercent] | add / length')
  echo "Average Profit: $AVG_PROFIT%"
fi

# Errors
ERRORS=$(cat $LOG_FILE | jq -s "map(select(.type == \"error\" and (.timestamp / 1000 | strftime(\"%Y-%m-%d\")) == \"$TODAY\")) | length")
echo "Errors: $ERRORS"
```

## Production Monitoring

### PM2 Integration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'titan-scavenger',
    script: './src/index.ts',
    interpreter: 'node',
    interpreter_args: '--loader ts-node/esm',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '~/.titan-scanner/logs/pm2-error.log',
    out_file: '~/.titan-scanner/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

### Log Rotation with Logrotate

```bash
# /etc/logrotate.d/titan-scavenger
~/.titan-scanner/logs/trades.jsonl {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0644 user user
    postrotate
        # Optional: trigger analysis script
        /path/to/daily-report.sh
    endscript
}
```

This integration ensures complete observability of the Titan Scavenger system with queryable logs for performance analysis and debugging.
