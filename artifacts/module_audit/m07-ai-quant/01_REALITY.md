# M07 Reality: AI Quant

> **Module**: `titan-ai-quant`
> **Date**: 2026-02-11

## 1. Physical Layout
The module is a Node.js/TypeScript service located in `services/titan-ai-quant`.

### Directory Structure
-   `src/index.ts`: Entry point exports.
-   `src/server.ts`: HTTP status server and process lifecycle manager.
-   `src/ai/`: Core intelligence logic.
    -   `TitanAnalyst.ts`: Main AI coordinator (Gemini + Guardrails).
    -   `OptimizationWorkflow.ts`: Orchestrates analysis -> proposal -> validation -> application.
    -   `GeminiClient.ts`: Wrapper for Google Generative AI with rate limiting.
-   `src/simulation/`: Backtesting engine.
    -   `Backtester.ts`: Replays trades against history.
    -   `LatencyModel.ts`: Simulates market impact.
-   `src/messaging/`: NATS integration.
    -   `NatsAdapter.ts`: Handles pub/sub.
-   `src/cron/`: Scheduling.
    -   `NightlyOptimize.ts`: Triggers the workflow.

## 2. Process Model
-   **Main Process**: Single Node.js process.
-   **Concurrency**:
    -   HTTP Server (Express-like raw Node http) for health checks.
    -   NATS subscription processing.
    -   Cron job (node-schedule) for nightly runs.
-   **State**: Mostly stateless, but holds `InMemoryDataCache` during backtesting runs. Persists changes to `config/*.json` on disk.

## 3. Interfaces
-   **NATS**: Primary control plane (commands and events).
-   **HTTP**: Observability (health/status) and manual triggers.
-   **File System**: Reads/Writes shared configuration files.
