# M07 Tests: AI Quant

> **Module**: `titan-ai-quant`
> **Date**: 2026-02-11

## 1. Test Strategy
### Unit Tests
-   **Framework**: Jest.
-   **Coverage**: Core logic (`TitanAnalyst`, `OptimizationWorkflow`, `Backtester`, `Guardrails`).
-   **Mocking**:
    -   `GeminiClient` mocked to prevent API costs/rate limits.
    -   `DataLoader` mocked for deterministic data.
    -   `NatsAdapter` mocked for isolation.

### Integration Tests
-   **Workflow**: `OptimizationWorkflow.test.ts` runs the full cycle (Analyze -> Propose -> Validate -> Apply) with in-memory data.
-   **NATS**: `NatsAdapter.test.ts` verifies subject mapping and connectivity (requires running NATS locally or mocked).

## 2. Evidence
-   **Status**: **PASS**
-   **Suites**: 17 passed.
-   **Tests**: 257 passed.
-   **Snapshots**: 0.

### Key Test Suites
-   `tests/unit/OptimizationWorkflow.test.ts`: Verifies end-to-end optimization loop.
-   `tests/unit/Guardrails.test.ts`: Verifies safety bounds rejecting dangerous configs.
-   `tests/unit/Backtester.test.ts`: Verifies simulation math and logic.

## 3. Coverage Gaps
-   **Live Integration**: No true end-to-end test with a live NATS broker and Google Gemini API (cost trade-off). This is acceptable for Gate A provided Gatekeeper (backtesting) is robust.
