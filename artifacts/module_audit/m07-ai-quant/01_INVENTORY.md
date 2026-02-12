# M07 Inventory: AI Quant

> **Module**: `titan-ai-quant`
> **Path**: `services/titan-ai-quant`

## 1. File Manifest

### Configuration
- `package.json`
- `tsconfig.json`
- `eslint.config.mjs`
- `jest.config.cjs`
- `src/config/ConfigManager.ts`
- `src/config/ConfigSchema.ts`

### Core Logic (AI & Optimization)
- `src/ai/AIIntegration.ts`
- `src/ai/ApprovalWorkflow.ts`
- `src/ai/EnhancedAIIntegration.ts`
- `src/ai/GeminiClient.ts`
- `src/ai/Guardrails.ts`
- `src/ai/Journal.ts`
- `src/ai/OptimizationWorkflow.ts`
- `src/ai/PredictiveAnalytics.ts`
- `src/ai/RateLimiter.ts`
- `src/ai/RealTimeOptimizer.ts`
- `src/ai/StrategicMemory.ts`
- `src/ai/TitanAnalyst.ts`

### Simulation
- `src/simulation/Backtester.ts`
- `src/simulation/DataLoader.ts`
- `src/simulation/LatencyModel.ts`

### Messaging & Server
- `src/index.ts`
- `src/server.ts`
- `src/messaging/NatsAdapter.ts`

### Utilities & Types
- `src/types/index.ts`
- `src/utils/ErrorHandler.ts`
- `src/cron/NightlyOptimize.ts`

### Prompts
- `src/ai/prompts/analysis.txt`
- `src/ai/prompts/optimization.txt`

## 2. Key Structures
-   **Class**: `OptimizationWorkflow` (Orchestrates the optimization loop)
-   **Class**: `GeminiClient` (Handles Google AI interactions)
-   **Class**: `Backtester` (Runs simulations)

## 3. Observations
-   High concentration of logic in `src/ai/`.
-   Uses `better-sqlite3` which implies local state.
-   Relies on `node-schedule` for cron jobs (`NightlyOptimize.ts`).
