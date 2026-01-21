# Titan Console

The command center for the Titan Trading System. Provides real-time visibility into Brain decisions, Execution status, and Phase operations.

## Features

- **Real-time Dashboard**: WebSocket-based updates on system health and active trades.
- **Trap Monitor**: Visualization of Scavenger traps and Hunter structures.
- **Circuit Breakers**: Manual override controls for emergency stops.
- **Logs**: Centralized log viewer for all services.

## Quick Start

### Full System (Recommended)

The console is automatically deployed with the full stack:

```bash
cd ../..
docker compose -f docker-compose.dev.yml up -d
```

Access the console at: **http://localhost:5173**

### Local Development

If you need to edit the UI:

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
```

## Tech Stack

- **Framework**: React + Vite
- **UI**: Shadcn UI + Tailwind CSS
- **State**: TanStack Query
- **Charts**: Recharts

## Operator Access Control (RBAC)

The Console exposes high-impact controls (circuit breaker, overrides, logs). In production,
these controls must be gated by role-based access control and audited.

Recommended roles:
- **Viewer**: Read-only dashboards and metrics.
- **Operator**: Can acknowledge alerts and initiate safe-mode actions.
- **Admin**: Can reset circuit breakers, apply overrides, and change risk limits.

Guard rails for high-risk actions:
- Admin-only controls require re-authentication and explicit confirmation.
- Circuit breaker reset requires two-person approval (admin + operator) or a change ticket ID.
- All overrides and log access must be audit-logged with actor, time, and reason.

Implementation note: enforce RBAC at the API gateway or reverse proxy and integrate with the Console
for UI guard rails. See `docs/operations/monitoring-alerting.md` and `docs/operations/legal-and-compliance.md`.
