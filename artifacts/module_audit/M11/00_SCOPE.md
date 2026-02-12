# Module: M11

## Identity
- **Name**: M11 — Titan Console
- **Purpose**: Operator UI, Manual Override, System Observability
- **Architectural plane**: Interface (Motor Cortex)

## Code Packages (exhaustive)
- `apps/titan-console/`
- `package.json`

## Owner Surfaces
- **Human-facing**:
    - Web UI (Port 8080)
- **Machine-facing**:
    - Calls `M12` (Console API)

## Boundaries
- **Inputs**:
    - User Actions (Clicks, Keys)
    - API Data (Rest/WS)
- **Outputs**:
    - API Calls
    - Visuals
- **Dependencies** (other modules):
    - `M12` (API)
    - `M10` (Shared)
- **Non-goals**:
    - Direct DB Access
    - Direct NATS Access (proxied via API)
