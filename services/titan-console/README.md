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
docker compose up -d
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
