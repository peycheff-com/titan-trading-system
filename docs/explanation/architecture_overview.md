# Architecture Overview

The Titan Trading System is an event-driven, autonomous trading organism.

## Core Components
- **Brain (Orchestrator)**: Node.js service managing state and risk.
- **Execution (Rust)**: High-performance order execution engine.
- **Strategy Phases**: Scavenger, Hunter, Sentinel.

## Event Bus
Titan uses NATS JetStream for all inter-service communication. See [Reference](../reference/index.md) for details.
