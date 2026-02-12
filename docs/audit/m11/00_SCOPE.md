# Module: M11 (Titan Console)

## Identity
- **Name**: `titan-console`
- **Purpose**: Operator UI for the Titan Trading System. Provides real-time monitoring, command and control (ARM/DISARM/HALT), and system insights.
- **Architectural Plane**: Operator Plane
- **Type**: Web Application (SPA)

## Code Packages (exhaustive)
- `apps/titan-console/` (Main application)
- `packages/shared/` (Consumed for contracts and types)

## Owner Surfaces
- **Human-facing**:
    - Web UI (Port 3001/8080)
    - Dashboards: Trading Overview, Execution Health, System Status
- **Machine-facing**:
    - HTTP to `titan-console-api` (M12)
    - WebSocket (via proxy) to `titan-console-api` (M12)

## Boundaries
- **Inputs**:
    - User interactions (Clicks, Form submissions)
    - Real-time data feeds via React Query / WebSocket
- **Outputs**:
    - API commands (HTTP POST) to M12
    - Visual rendering of system state
- **Dependencies**:
    - M12 (Console API) - Backend
    - M10 (Shared) - Types and constants
- **Non-goals**:
    - Direct database access (must go through M12)
    - Direct NATS connection (must go through M12, though some architectures might allow it, current config proxies via API)

## Tech Stack
- **Core**: React 18, Vite, TypeScript
- **Styling**: TailwindCSS, Radix UI, Lucide React
- **State/Data**: TanStack Query (React Query)
- **AI Integration**: CopilotKit
