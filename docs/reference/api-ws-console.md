# Console WebSocket Protocol

The Console WebSocket provides real-time updates for the Titan Console dashboard. It delivers live data for equity changes, position updates, signal notifications, and system status changes.

## Connection Details

- **URL**: `ws://localhost:3101/ws/console` (development)
- **URL**: `wss://titan-brain.yourdomain.com/ws/console` (production)
- **Protocol**: WebSocket (RFC 6455)
- **Authentication**: None (internal service communication)
- **Reconnection**: Automatic with exponential backoff

## Message Format

All messages follow a consistent JSON format:

```json
{
  "type": "MESSAGE_TYPE",
  "timestamp": 1702500000000,
  "data": {}
}
```

### Message Types

#### 1. EQUITY_UPDATE

Real-time equity and P&L updates.

```json
{
  "type": "EQUITY_UPDATE",
  "timestamp": 1702500000000,
  "data": {
    "equity": 2450.00,
    "daily_pnl": 125.50,
    "daily_pnl_pct": 5.4,
    "weekly_pnl": 245.75,
    "weekly_pnl_pct": 11.2,
    "total_pnl": 1450.00,
    "high_watermark": 2500.00,
    "drawdown": -2.0,
    "drawdown_pct": -2.0
  }
}
```

**Fields:**

- `equity`: Current account equity in USD
- `daily_pnl`: Daily profit/loss in USD
- `daily_pnl_pct`: Daily P&L as percentage
- `weekly_pnl`: Weekly profit/loss in USD
- `weekly_pnl_pct`: Weekly P&L as percentage
- `total_pnl`: Total profit/loss since inception
- `high_watermark`: Highest equity reached
- `drawdown`: Current drawdown in USD
- `drawdown_pct`: Current drawdown as percentage

#### 2. POSITION_UPDATE

Position changes and updates.

```json
{
  "type": "POSITION_UPDATE",
  "timestamp": 1702500000000,
  "data": {
    "action": "OPENED",
    "symbol": "BTCUSDT",
    "position": {
      "symbol": "BTCUSDT",
      "side": "LONG",
      "size": 0.1,
      "entry_price": 43250.50,
      "current_price": 43300.00,
      "unrealized_pnl": 4.95,
      "unrealized_pnl_pct": 0.11,
      "liquidation_price": 41500.00,
      "stop_loss": 42800.00,
      "take_profit": 44000.00,
      "leverage": 15,
      "margin_used": 288.34,
      "timestamp": "2024-12-18T10:30:00.000Z"
    }
  }
}
```

**Actions:**

- `OPENED`: New position opened
- `UPDATED`: Position size or price updated
- `CLOSED`: Position closed
- `LIQUIDATED`: Position liquidated

#### 3. SIGNAL_NOTIFICATION

Signal processing notifications.

```json
{
  "type": "SIGNAL_NOTIFICATION",
  "timestamp": 1702500000000,
  "data": {
    "signal_id": "titan_BTCUSDT_12345_1",
    "type": "CONFIRM",
    "symbol": "BTCUSDT",
    "direction": "LONG",
    "status": "FILLED",
    "entry_price": 43250.50,
    "size": 0.1,
    "phase": "PHASE_1_KICKSTARTER",
    "regime_state": 1,
    "confidence": 95,
    "processing_time_ms": 45
  }
}
```

**Signal Types:**

- `PREPARE`: Signal preparation
- `CONFIRM`: Signal confirmation and execution
- `ABORT`: Signal abortion
- `HEARTBEAT`: System heartbeat

**Status Values:**

- `PENDING`: Signal received, processing
- `FILLED`: Order filled successfully
- `REJECTED`: Signal rejected by safety gates
- `CANCELLED`: Signal cancelled or aborted
- `ERROR`: Processing error occurred

#### 4. MASTER_ARM_CHANGE

Master Arm status changes.

```json
{
  "type": "MASTER_ARM_CHANGE",
  "timestamp": 1702500000000,
  "data": {
    "master_arm": true,
    "previous_state": false,
    "changed_by": "admin",
    "reason": "Manual enable by operator",
    "auto_disabled": false
  }
}
```

**Fields:**

- `master_arm`: New Master Arm state (true/false)
- `previous_state`: Previous Master Arm state
- `changed_by`: Operator who made the change
- `reason`: Reason for the change
- `auto_disabled`: Whether change was automatic (e.g., circuit breaker)

#### 5. CIRCUIT_BREAKER_UPDATE

Circuit breaker status changes.

```json
{
  "type": "CIRCUIT_BREAKER_UPDATE",
  "timestamp": 1702500000000,
  "data": {
    "active": true,
    "type": "SOFT",
    "reason": "Daily drawdown exceeded 5%",
    "triggered_at": 1702499800000,
    "daily_drawdown": -5.2,
    "consecutive_losses": 3,
    "equity_level": 2326.00,
    "cooldown_ends_at": 1702514400000
  }
}
```

**Circuit Breaker Types:**

- `SOFT`: Warning level, reduced position sizes
- `HARD`: Trading halted, positions may be closed

#### 6. CONFIG_CHANGE

Configuration updates.

```json
{
  "type": "CONFIG_CHANGE",
  "timestamp": 1702500000000,
  "data": {
    "updates": [
      {
        "type": "risk_tuner",
        "updated": true
      },
      {
        "type": "asset_whitelist",
        "updated": true,
        "disabled_assets": ["DOGEUSDT"]
      }
    ],
    "operator_id": "admin"
  }
}
```

#### 7. SYSTEM_STATUS_UPDATE

System component status changes.

```json
{
  "type": "SYSTEM_STATUS_UPDATE",
  "timestamp": 1702500000000,
  "data": {
    "component": "broker",
    "status": "connected",
    "previous_status": "disconnected",
    "details": {
      "broker": "BYBIT",
      "reconnected_at": 1702500000000,
      "connection_attempts": 3
    }
  }
}
```

**Components:**

- `broker`: Broker connection status
- `database`: Database connection status
- `l2_cache`: Level 2 data cache status
- `websocket`: WebSocket server status
- `heartbeat`: System heartbeat status

#### 8. EMERGENCY_FLATTEN

Emergency flatten notifications.

```json
{
  "type": "EMERGENCY_FLATTEN",
  "timestamp": 1702500000000,
  "data": {
    "action": "FLATTEN_ALL",
    "closed_count": 3,
    "reason": "PANIC_FLATTEN_ALL",
    "operator_id": "admin",
    "positions_closed": [
      {
        "symbol": "BTCUSDT",
        "side": "LONG",
        "size": 0.1,
        "exit_price": 43200.00,
        "pnl": -5.05
      },
      {
        "symbol": "ETHUSDT",
        "side": "SHORT",
        "size": 2.5,
        "exit_price": 2285.00,
        "pnl": 12.50
      }
    ]
  }
}
```

#### 9. PERFORMANCE_UPDATE

Performance metrics updates.

```json
{
  "type": "PERFORMANCE_UPDATE",
  "timestamp": 1702500000000,
  "data": {
    "timeframe": "1D",
    "win_rate": 68.5,
    "profit_factor": 2.15,
    "sharpe_ratio": 1.85,
    "total_trades": 12,
    "winning_trades": 8,
    "losing_trades": 4,
    "avg_win": 45.20,
    "avg_loss": -21.05,
    "largest_win": 125.50,
    "largest_loss": -35.75,
    "expectancy": 23.45
  }
}
```

#### 10. PHASE_TRANSITION

Phase transition notifications.

```json
{
  "type": "PHASE_TRANSITION",
  "timestamp": 1702500000000,
  "data": {
    "from_phase": "PHASE_1_KICKSTARTER",
    "to_phase": "PHASE_2_TREND_RIDER",
    "equity": 5250.00,
    "threshold": 5000.00,
    "reason": "Equity threshold exceeded",
    "new_risk_pct": 2.0,
    "new_max_leverage": 5
  }
}
```

## Connection Management

### Connection Lifecycle

1. **Connect**: Client establishes WebSocket connection
2. **Subscribe**: Automatic subscription to all message types
3. **Receive**: Real-time message delivery
4. **Disconnect**: Graceful or unexpected disconnection
5. **Reconnect**: Automatic reconnection with backoff

### Reconnection Strategy

The client should implement automatic reconnection with exponential backoff:

```javascript
class ConsoleWebSocket {
  constructor(url) {
    this.url = url;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectInterval = 1000; // Start with 1 second
    this.maxReconnectInterval = 30000; // Max 30 seconds
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      console.log('Console WebSocket connected');
      this.reconnectAttempts = 0;
      this.reconnectInterval = 1000;
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
    
    this.ws.onclose = () => {
      console.log('Console WebSocket disconnected');
      this.scheduleReconnect();
    };
    
    this.ws.onerror = (error) => {
      console.error('Console WebSocket error:', error);
    };
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
        this.connect();
      }, this.reconnectInterval);
      
      // Exponential backoff
      this.reconnectInterval = Math.min(
        this.reconnectInterval * 2,
        this.maxReconnectInterval
      );
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'EQUITY_UPDATE':
        this.updateEquityDisplay(message.data);
        break;
      case 'POSITION_UPDATE':
        this.updatePositionDisplay(message.data);
        break;
      case 'SIGNAL_NOTIFICATION':
        this.showSignalNotification(message.data);
        break;
      // ... handle other message types
    }
  }
}
```

### Error Handling

Handle WebSocket errors gracefully:

```javascript
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
  
  // Show user notification
  showNotification('Connection error - attempting to reconnect...', 'warning');
  
  // Update UI to show disconnected state
  updateConnectionStatus('disconnected');
};

ws.onclose = (event) => {
  if (event.wasClean) {
    console.log('WebSocket closed cleanly');
  } else {
    console.log('WebSocket connection lost');
    showNotification('Connection lost - reconnecting...', 'error');
  }
  
  updateConnectionStatus('reconnecting');
};
```

## Message Filtering

Clients can filter messages based on type or content:

```javascript
class MessageFilter {
  constructor() {
    this.filters = new Set();
  }

  addFilter(type) {
    this.filters.add(type);
  }

  removeFilter(type) {
    this.filters.delete(type);
  }

  shouldProcess(message) {
    if (this.filters.size === 0) return true;
    return this.filters.has(message.type);
  }
}

// Usage
const filter = new MessageFilter();
filter.addFilter('EQUITY_UPDATE');
filter.addFilter('POSITION_UPDATE');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (filter.shouldProcess(message)) {
    handleMessage(message);
  }
};
```

## Rate Limiting

The WebSocket server implements rate limiting to prevent abuse:

- **Message Rate**: Maximum 100 messages per second per connection
- **Connection Rate**: Maximum 10 connections per minute per IP
- **Burst Allowance**: Up to 200 messages in a 2-second burst

## Security Considerations

1. **Origin Validation**: Server validates WebSocket origin headers
2. **Rate Limiting**: Prevents DoS attacks via message flooding
3. **Message Validation**: All incoming messages are validated
4. **Connection Limits**: Maximum concurrent connections per IP
5. **Heartbeat**: Regular ping/pong to detect dead connections

## Testing

### WebSocket Testing Tool

```javascript
// Simple WebSocket test client
const testClient = new WebSocket('ws://localhost:3002/ws/console');

testClient.onopen = () => {
  console.log('Test client connected');
};

testClient.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message.type, message.data);
};

testClient.onclose = () => {
  console.log('Test client disconnected');
};
```

### Message Validation

```javascript
function validateMessage(message) {
  if (!message.type || !message.timestamp) {
    throw new Error('Invalid message format');
  }
  
  if (typeof message.timestamp !== 'number') {
    throw new Error('Invalid timestamp');
  }
  
  if (!message.data || typeof message.data !== 'object') {
    throw new Error('Invalid message data');
  }
  
  return true;
}
```

## Performance Considerations

1. **Message Batching**: Server batches rapid updates to prevent flooding
2. **Compression**: WebSocket compression enabled for large messages
3. **Delta Updates**: Only changed fields sent for position updates
4. **Throttling**: High-frequency updates throttled to reasonable rates
5. **Buffer Management**: Client should implement message buffering for UI updates

## Troubleshooting

### Common Issues

1. **Connection Refused**: Check if Execution service is running on port 3002
2. **Frequent Disconnections**: Check network stability and firewall settings
3. **Missing Messages**: Verify message filtering and error handling
4. **High Latency**: Check server load and network conditions

### Debug Mode

Enable debug logging for troubleshooting:

```javascript
const DEBUG = true;

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (DEBUG) {
    console.log(`[${new Date().toISOString()}] Received:`, message);
  }
  
  handleMessage(message);
};
```

---

This protocol ensures reliable, real-time communication between the Titan Execution service and Console dashboard, providing operators with immediate visibility into system status and trading activity.
