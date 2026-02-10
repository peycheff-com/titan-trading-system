# HTTP Interfaces & Ports

> **Status**: Canonical
> **Scope**: Internal API Surfaces

Titan is primarily **Event-Driven (NATS)**. HTTP is used for:

1. Health Checks (Orchestration).
2. Metrics (Prometheus).
3. Console BFF (UI Data).
4. Legacy REST adapters (Exchange Proxy).

**Invariant**: Trading Commands NEVER go over HTTP (except internal adapter calls to exchange). All internal command and control is NATS.

## 1. Service Port Map

| Service | Port | Internal URL | Public? |
| :--- | :--- | :--- | :--- |
| `titan-brain` | **3100** | `http://titan-brain:3100` | ❌ NO |
| `titan-execution-rs`| **3002** | `http://titan-execution:3002`| ❌ NO |
| `titan-console-api` | **3000** | `http://titan-console-api:3000`| ❌ NO |
| `titan-console` | **8080** | N/A (Static Files via Traefik)| ✅ YES (443) |
| `titan-phase1` | **8081** | `http://titan-phase1-scavenger:8081` | ❌ NO |
| `titan-ai-quant`  | **8082** | `http://titan-ai-quant:8082` | ❌ NO |
| `titan-phase2` | **8083** | `http://titan-phase2-hunter:8083` | ❌ NO |
| `titan-phase3` | **8084** | `http://titan-phase3-sentinel:8084` | ❌ NO |

## 2. Standard Endpoints

All services MUST implement:

### 2.1 `/health` (GET)

Returns `200 OK` if the service is alive.

- **Brain**: Checks DB connection and NATS connection.
- **Execution**: Checks Redb connection.

### 2.2 `/metrics` (GET)

Returns Prometheus-formatted metrics.

- Scraped by Prometheus on port `9090`.

## 3. Console API (BFF)

Port: `3000`. Acts as the gateway for the Frontend.

- Authentication: JWT (Cookie).
- Routes:
  - `POST /auth/login`: Admin login.
  - `GET /api/status`: System-wide status aggregation.
  - `GET /api/history`: Trade history (from Postgres).

## 4. Execution-RS

Port: `3002`.

- **Note**: This HTTP server is minimal. Most action happens on NATS.
- `GET /state`: Admin-only dump of internal state (requires VPN/Localhost).
