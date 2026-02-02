# Titan Trading System - Complete API Documentation

This directory contains comprehensive API documentation for all Titan Trading
System services, including REST APIs, WebSocket protocols, and interactive
examples.

## Documentation Structure

```
docs/api/
├── README.md                    # This file - API documentation overview
├── openapi/                     # OpenAPI 3.0 specifications
│   ├── titan-brain.yaml         # Brain orchestrator API
│   ├── titan-execution.yaml     # Execution service API
├── websockets/                  # WebSocket protocol documentation
│   ├── console-protocol.md      # Console WebSocket messages
│   ├── scavenger-protocol.md    # Scavenger WebSocket messages
│   ├── status-protocol.md       # Status channel protocol
│   └── brain-notifications.md   # Brain notification protocol
├── examples/                    # Interactive examples and testing tools
│   ├── signal-flow-example.js   # Complete signal flow demonstration
│   └── webhook-tester.js        # Webhook testing utility
├── authentication/              # Authentication and security
│   ├── hmac-signing.md          # HMAC signature implementation
│   ├── api-keys.md              # API key management
│   └── security-best-practices.md
└── integration/                 # Integration guides
    ├── getting-started.md       # Quick start guide
    ├── phase-integration.md     # Phase service integration
    ├── error-handling.md        # Error handling patterns
    └── rate-limiting.md         # Rate limiting guidelines
```

## Service Overview

The Titan Trading System consists of 5 main services with distinct APIs:

### 1. Titan Brain - Master Orchestrator

**For deployment topology and ports, see [SYSTEM_SOURCE_OF_TRUTH.md](../canonical/SYSTEM_SOURCE_OF_TRUTH.md).**

- **Purpose**: Capital allocation, risk management, phase coordination
- **API Type**: REST + WebSocket notifications
- **Key Endpoints**: Signal processing, dashboard data, circuit breaker control
- **Documentation**: [openapi/titan-brain.yaml](openapi/titan-brain.yaml)

### 2. Titan Execution (Port 3002) - Order Execution Engine

- **Purpose**: Order placement, position tracking, WebSocket communications
- **API Type**: REST + WebSocket (Console, Scavenger, Status channels)
- **Key Endpoints**: Webhook receiver, position management, emergency controls
- **Documentation**:
  [openapi/titan-execution.yaml](openapi/titan-execution.yaml)

### 4. Titan Scavenger (Port 8081) - Phase 1 Trading Engine

- **Purpose**: Predestination trap system for account building ($200-$5K)
- **API Type**: REST + WebSocket client
- **Key Features**: Trap detection, signal generation, console integration
- **Documentation**: *Coming Soon*

### 5. Titan AI Quant (Cron Job) - Offline Optimizer

- **Purpose**: Parameter optimization using Gemini AI
- **API Type**: REST (proposal submission and approval)
- **Key Features**: Backtesting, parameter optimization, approval workflow
- **Documentation**: *Coming Soon*

### 6. Shared Infrastructure - Centralized Services

- **Purpose**: WebSocket management, execution service, telemetry
- **API Type**: TypeScript modules with REST endpoints
- **Key Features**: Connection pooling, centralized logging, configuration
- **Documentation**: *Coming Soon*

## Quick Start

### 1. Health Check All Services

```bash
# Check all services are running
curl http://localhost:3100/health  # Brain
curl http://localhost:3002/health  # Execution

curl http://localhost:8081/health  # Scavenger
```

### 2. Send a Test Signal

```bash
# Send signal to Brain via Execution webhook
curl -X POST http://localhost:3002/webhook \
  -H "Content-Type: application/json" \
  -H "x-source: titan_dashboard" \
  -d '{
    "type": "PREPARE",
    "signal_id": "test_signal_' + Date.now() + '",
    "symbol": "BTCUSDT",
    "direction": "LONG",
    "size": 100,
    "timestamp": ' + Date.now() + '
  }'
```

### 3. Monitor Dashboard Data

```bash
# Get Brain dashboard data
curl http://localhost:3100/dashboard

# Get Execution positions
curl http://localhost:3002/positions

# Get system status
curl http://localhost:3002/api/console/system-status
```

## Authentication

### HMAC Signature Verification

All webhook endpoints require HMAC-SHA256 signature verification using the **raw request body**
and a timestamp header (`x-timestamp` by default). The signature is computed over
`${timestamp}.${rawBody}` to prevent replay attacks.

```javascript
const crypto = require("crypto");

function signRequest(rawBody, secret, timestamp) {
  const payload = `${timestamp}.${rawBody}`;
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

// Usage
const rawBody = JSON.stringify(requestBody);
const timestamp = Math.floor(Date.now() / 1000);
const signature = signRequest(rawBody, process.env.WEBHOOK_SECRET, timestamp);
// Include x-signature and x-timestamp headers
```

### API Key Management

Console endpoints require basic authentication or API keys:

```bash
# Using basic auth
curl -u admin:password http://localhost:3002/api/console/config

# Using API key (if configured)
curl -H "Authorization: Bearer your-api-key" http://localhost:3002/api/console/config
```

## WebSocket Protocols

### Scavenger WebSocket (ws://localhost:3002/ws/scavenger)

Phase 1 trap updates and execution confirmations:

```javascript
{
  "type": "TRAP_UPDATE",
  "data": {
    "symbol": "BTCUSDT",
    "trap_type": "LIQUIDATION",
    "confidence": 95,
    "entry_price": 43250.50,
    "timestamp": "2024-12-18T10:30:00.000Z"
  }
}
```

### Status WebSocket (ws://localhost:3002/ws/status)

System-wide status updates and alerts:

```javascript
{
  "type": "CIRCUIT_BREAKER",
  "data": {
    "active": true,
    "reason": "Daily drawdown exceeded 7%",
    "triggered_at": "2024-12-18T10:30:00.000Z"
  }
}
```

## Error Handling

### Standard Error Response Format

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-12-18T10:30:00.000Z",
  "details": {
    "field": "Additional context"
  }
}
```

### HTTP Status Codes

| Code | Description           | Usage                                    |
| ---- | --------------------- | ---------------------------------------- |
| 200  | Success               | Request completed successfully           |
| 400  | Bad Request           | Invalid input parameters                 |
| 401  | Unauthorized          | Invalid signature or credentials         |
| 403  | Forbidden             | Request blocked by safety gates          |
| 409  | Conflict              | Duplicate signal ID or resource conflict |
| 429  | Too Many Requests     | Rate limit exceeded                      |
| 500  | Internal Server Error | Unexpected server error                  |
| 503  | Service Unavailable   | Service unhealthy or maintenance         |

## Rate Limiting

### Default Limits

| Endpoint Category  | Limit       | Window       |
| ------------------ | ----------- | ------------ |
| Webhook endpoints  | 100 req/min | Per IP       |
| Dashboard APIs     | 60 req/min  | Per user     |
| Emergency controls | 10 req/min  | Per operator |
| Health checks      | 300 req/min | Per IP       |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Interactive Examples

### Complete Signal Flow

See [examples/signal-flow-example.js](examples/signal-flow-example.js) for a
complete demonstration of:

1. Signal generation from Phase 1
2. Brain approval/veto process
3. Execution via Execution service
4. Position tracking in Shadow State
5. Real-time updates via WebSocket

### Dashboard Integration

*Coming Soon*

### Webhook Testing

See [examples/webhook-tester.js](examples/webhook-tester.js) for:

1. HMAC signature generation
2. Signal payload validation
3. Response handling
4. Error scenario testing

## OpenAPI Specifications

Each service has a complete OpenAPI 3.0 specification:

- **Titan Brain**: [openapi/titan-brain.yaml](openapi/titan-brain.yaml)
- **Titan Execution**:
  [openapi/titan-execution.yaml](openapi/titan-execution.yaml)

These specifications can be used with:

- **Swagger UI**: Interactive API documentation
- **Postman**: API testing and collection generation
- **Code Generation**: Client SDK generation
- **API Gateways**: Route configuration and validation

## Testing Tools

### Postman Collection

*Coming Soon*

### WebSocket Testing

*Coming Soon*

## Integration Patterns

### Phase Service Integration

1. **Register with Brain**: Submit webhook URL for notifications
2. **Connect to Execution**: Use WebSocket for real-time updates
3. **Signal Generation**: Send signals via webhook with HMAC signature
4. **Position Monitoring**: Subscribe to position updates via WebSocket

### External System Integration

1. **Webhook Receiver**: Implement HMAC signature verification
2. **Rate Limiting**: Respect rate limits and implement backoff
3. **Error Handling**: Handle all error scenarios gracefully
4. **Health Monitoring**: Monitor service health endpoints

## Support and Troubleshooting

### Common Issues

1. **WebSocket Disconnections**: Implement automatic reconnection with
   exponential backoff
2. **HMAC Signature Failures**: Ensure consistent JSON serialization and UTF-8
   encoding
3. **Rate Limiting**: Implement proper backoff and retry logic
4. **Position Mismatches**: Use reconciliation endpoints to sync state

### Debug Endpoints

```bash
# Get detailed health information
curl http://localhost:3002/health/detailed

# Check WebSocket status
curl http://localhost:3002/api/console/system-status

# Validate configuration
curl http://localhost:3002/api/console/config
```

### Log Analysis

```bash
# View real-time logs
pm2 logs titan-execution

# Search for specific events
pm2 logs titan-execution | grep "SIGNAL_RECEIVED"
pm2 logs titan-execution | grep "ERROR"
```

## Version History

- **v1.0.0** (December 2024): Initial release with complete API documentation
- **v1.1.0** (Planned): Enhanced WebSocket protocols and batch operations
- **v2.0.0** (Planned): GraphQL API and advanced query capabilities

---

For detailed endpoint documentation, see the OpenAPI specifications in the
`openapi/` directory. For interactive examples, see the `examples/` directory.
For integration guides, see the `integration/` directory.
