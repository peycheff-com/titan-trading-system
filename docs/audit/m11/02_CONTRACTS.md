# Contracts: M11 (Titan Console)

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## API Contracts (Consumed)

### Titan Brain API (Operator Plane)
| Endpoint | Method | Purpose | Protocol |
|----------|--------|---------|----------|
| `/operator/intents` | POST | Submit new operator intent | HTTP |
| `/operator/intents` | GET | Query intent history | HTTP |
| `/operator/intents/:id` | GET | Get specific intent details | HTTP |
| `/operator/intents/preview` | POST | Dry-run intent to see risk impact | HTTP |
| `/operator/intents/:id/approve` | POST | Approve pending intent | HTTP |
| `/operator/intents/:id/reject` | POST | Reject pending intent | HTTP |
| `/operator/state` | GET | Get operator state (OCC hash) | HTTP |
| `/operator/intents/stream` | GET | Real-time intent updates | SSE |

### Console API (System Control)
| Endpoint | Method | Purpose | Protocol |
|----------|--------|---------|----------|
| `/api/status` | GET | Get general system status | HTTP |
| `/api/auto-exec/enable` | POST | ARM system (Enable auto-exec) | HTTP |
| `/api/auto-exec/disable` | POST | DISARM system (Disable auto-exec) | HTTP |
| `/api/emergency-flatten` | POST | Emergency liquidation | HTTP |

## NATS Subjects
> M11 (Console UI) does not consume NATS directly. It relies on M12 (Console API) and M01 (Titan Brain) to bridge to the event bus.

## Config and Environment
| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `VITE_API_URL` | string | `/api` | Base URL for Console API |
| `VITE_WS_URL` | string | (inferred) | WebSocket URL for real-time data |
| `VITE_TITAN_BRAIN_URL` | string | `http://localhost:3000` | Direct link to Brain for operator intents |
| `API_PROXY_TARGET` | string | `http://localhost:3000` | Dev server proxy target |

## Error Taxonomy (Client-Side)
| Type | Handling | User Feedback |
|------|----------|---------------|
| `API Error` | Log to console, Toast notification | Red toast with status text |
| `Network Error` | Log to console, Toast notification | Red toast "Request failed" |
| `Validation Error` | Form feedback | Inline error message |
