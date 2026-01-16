# SOTA Modernization Research Plan

## Phase 1: Benchmark Identification & Metrics
- [ ] **Define SOTA Baselines:**
    - [ ] Research current top-performing HFT/Algo execution speeds (target: <5ms tick-to-trade).
    - [ ] Identify benchmarks for Event-Driven Microservices (throughput, latency, jitter).
    - [ ] Define AI Model inference latency targets for real-time vs. offline loops.
- [ ] **Select Comparison Frameworks:**
    - [ ] Identify leading open-source trading engines (e.g., Hummingbot, Freqtrade) for feature parity checks.
    - [ ] Research modern backtesting engines (e.g., VectorBT, Lean) for performance comparison.

## Phase 2: Architectural Gap Analysis
- [ ] **Execution Service Analysis:**
    - [ ] Profile `titan-execution` (Fastify/Node.js) vs. Rust/Go alternatives for critical hot paths.
    - [ ] Analyze the overhead of the "Shadow State" persistence (SQLite) during high-load bursts.
    - [ ] Evaluate the latency cost of the Brain <-> Execution IPC/Redis loop.
- [ ] **Data Pipeline Audit:**
    - [ ] Review `WebSocketManager` for head-of-line blocking or event loop lag.
    - [ ] Analyze `TitanTrap` pre-computation efficiency (1-minute intervals vs. stream processing).
- [ ] **Infrastructure Review:**
    - [ ] Assess Railway vs. dedicated bare-metal/Kubernetes for co-location latency benefits.
    - [ ] Evaluate Supabase (Postgres) connection pooling limits for high-frequency signal logging.

## Phase 3: Algorithm & Strategy Research
- [ ] **Market Microstructure Models:**
    - [ ] Research SOTA Order Flow Imbalance (OFI) and VPIN metrics for Phase 1 (Scavenger).
    - [ ] Investigate Transformer-based Time-Series Forecasting (e.g., TimeGPT, Lag-Llama) for Phase 2 (Hunter).
- [ ] **Reinforcement Learning (RL):**
    - [ ] Explore Deep Q-Network (DQN) or PPO agents for dynamic Phase allocation (replacing the sigmoid logic in Brain).
    - [ ] Research "Safe RL" techniques for constrained execution (inventory risk, drawdown limits).
- [ ] **Execution Algorithms:**
    - [ ] Research TWAP/VWAP variants with alpha-seeking logic (Adaptive Execution).
    - [ ] Investigate Almgren-Chriss optimal execution models for Phase 3 (Sentinel).

## Phase 4: Library & Framework Evaluation
- [ ] **Language/Runtime:**
    - [ ] Evaluate **Rust** (actix-web, tokio) for rewriting `titan-execution` (Safety + Speed).
    - [ ] Evaluate **Go** (Goroutines) for highly concurrent WebSocket management.
- [ ] **Data Processing:**
    - [ ] Assess **Polars** (Rust-based DataFrame) vs. standard JS Arrays for `TitanTrap` calculations.
    - [ ] Explore **Redpanda** or **NATS JetStream** to replace/augment Redis for lower latency messaging.
- [ ] **AI/ML:**
    - [ ] Evaluate **TensorFlow.js** (WASM backend) for running lightweight inference directly in Node.js.
    - [ ] Research **ONNX Runtime** for cross-platform model deployment.

## Phase 5: AI Integration Models (API & Local)
- [ ] **LLM Integration (Gemini 2.0 / Flash):**
    - [ ] Evaluate Gemini 2.0 Flash for lower latency "reasoning" in the loop.
    - [ ] Research function calling capabilities for autonomous parameter tuning (Phase 4).
- [ ] **Local Inference (Small Language Models):**
    - [ ] Benchmark **Gemma 2 (2b/9b)** or **Llama 3.2 (1b/3b)** for local sentiment/news analysis without API latency.
    - [ ] Test quantization (GGUF/AWQ) trade-offs for running on consumer hardware (if local).
- [ ] **Hybrid Architectures:**
    - [ ] Design a "Fast/Slow" system: Local SLM for sub-second triggers, API LLM for deep strategic reviews.

## Phase 6: Performance Benchmarking & Prototype
- [ ] **Latency Micro-benchmarks:**
    - [ ] Create a benchmark suite for the critical path: Tick -> Trap Detect -> Signal -> Brain -> Execution -> API.
- [ ] **Throughput Stress Testing:**
    - [ ] Simulate high-volatility events (1000+ signals/sec) to test `SignalQueue` and `IdempotencyStore`.
- [ ] **Integration Complexity Assessment:**
    - [ ] Estimate effort to rewrite `titan-execution` in Rust vs. optimizing Node.js.
    - [ ] Assess the operational complexity of adding NATS/Kafka vs. sticking with Redis.
