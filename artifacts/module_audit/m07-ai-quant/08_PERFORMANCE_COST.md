# M07 Performance & Cost: AI Quant

> **Module**: `titan-ai-quant`
> **Date**: 2026-02-11

## 1. Performance Profile
### Compute Interaction
-   **Backtesting**: CPU-intensive. `Backtester.ts` runs imperative simulation loops.
    -   *Optimization*: Uses in-memory caching (`InMemoryDataCache`) to avoid repeated disk I/O.
    -   *Scalability*: Currently single-threaded. Could be parallelized via Worker Threads if dealing with massive datasets.

### Latency
-   **Optimization Path**: Async/Offline. Not on the hot path of trade execution.
-   **Inference**: Gemini Flash 1.5/3.0 is fast (~1s latency), suitable for nightly or hourly optimization, but not tick-level.

## 2. Cost Analysis
### AI Model Costs (Gemini)
-   **Model**: Gemini 1.5 Flash (Low cost, high speed).
-   **Volume**:
    -   ~10-20 tokens per trade narrative.
    -   ~2000 tokens per analysis prompt.
    -   ~1000 tokens per optimization proposal.
-   **Estimate**:
    -   Assuming 1 analysis per night + 3 proposals.
    -   Total input: ~5000 tokens. Output: ~1000 tokens.
    -   Daily Cost: < $0.01.
    -   Monthly Cost: < $0.30.

### Infrastructure
-   **Memory**: High RAM usage during backtesting (loading full OHLCV history).
    -   *Mitigation*: `Backtester.ts` has a `maxPeriodDays` check to prevent memory overflow.

## 3. Limits & Quotas
-   **Rate Limits**: `GeminiClient` caps requests at 10 RPM (configurable).
-   **Backtest Limits**: 30 day maximum lookback to preserve RAM.

## 4. Conclusion
The module is highly efficient cost-wise due to the use of "Flash" models and local backtesting. Performance is bounded by Node.js single-threaded CPU speed for backtests, which is acceptable for offline optimization tasks.
