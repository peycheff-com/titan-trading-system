# Module: M12

## Identity
- **Name**: M12 — Console API
- **Purpose**: Backend-for-Frontend (BFF), Auth Proxy, NATS Gateway
- **Architectural plane**: Interface (Spinal Cord)

## Code Packages (exhaustive)
- `services/titan-console-api/`
- `package.json`

## Owner Surfaces
- **Human-facing**:
    - None (Backend Service)
- **Machine-facing**:
    - NATS Publisher: `titan.cmd.>` (proxied from UI)
    - HTTP API (Port 3000)

## Boundaries
- **Inputs**:
    - HTTP Requests (from M11)
- **Outputs**:
    - NATS Commands
    - DB Queries (Auth?)
- **Dependencies** (other modules):
    - `M06` (NATS), `M10` (Shared)
    - `M08` (Postgres - if used for user data)
- **Non-goals**:
    - Heavy Processing
    - Direct Trading
