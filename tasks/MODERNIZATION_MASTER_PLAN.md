# Titan System Modernization: Master Implementation Plan

**Objective:** Upgrade Titan Trading System to 2026 SOTA standards.
**Sources:** [SOTA Upgrade Analysis](../reports/SOTA_Upgrade_Analysis_2026.md), [Microservices Interaction Analysis](../reports/Microservices_Interaction_Analysis.md)

---

## Phase 1: Nervous System Upgrade (Messaging Architecture)
**Goal:** Decouple services, ensure message durability, and eliminate HTTP overhead for internal comms.

- [ ] **Infrastructure Setup**
    - [ ] Deploy **NATS JetStream** container (replacing/augmenting Redis).
    - [ ] Configure JetStream streams for `signals`, `execution_reports`, and `market_data`.
- [ ] **Shared Library (`@titan/messaging`)**
    - [ ] Create TypeScript NATS client wrapper with type-safe subjects.
    - [ ] Implement `publish(subject, data)` and `subscribe(subject, callback)` patterns.
- [ ] **Migration: Brain <-> Execution Feedback**
    - [ ] Modify `titan-execution` to publish `ExecutionReport` to NATS `execution.reports`.
    - [ ] Modify `titan-brain` to consume `execution.reports` from NATS instead of HTTP Webhook.
    - [ ] Remove `titan-execution/src/routes/webhook.js` (legacy HTTP).
- [ ] **Migration: Console Data Stream**
    - [ ] Update `titan-console` WebSocket server to subscribe to NATS `dashboard.updates` instead of Redis.

## Phase 2: The Iron Muscle (Rust Execution Engine)
**Goal:** Achieve <1ms P99 latency and type-safe memory management.

- [ ] **Scaffold New Service (`services/titan-execution-rs`)**
    - [ ] Initialize Cargo project with `actix-web`, `tokio`, `serde`, and `nats`.
    - [ ] Configure workspace members in root.
- [ ] **Core Components Porting**
    - [ ] **Broker Adapters:** Implement `ExchangeAdapter` trait (Bybit, Binance).
    - [ ] **Shadow State:** Port `ShadowState.js` logic to Rust using `DashMap` (in-memory) + `sqlx` (SQLite async persistence).
    - [ ] **L2 Validator:** Port order book validation logic (high CPU task, perfect for Rust).
- [ ] **IPC Integration**
    - [ ] Implement Unix Domain Socket listener in Rust (compatible with existing `FastPathClient`).
    - [ ] Ensure binary compatibility with existing JSON framing.
- [ ] **Testing & Validation**
    - [ ] Write unit tests for Order Management logic.
    - [ ] Benchmark Rust implementation against Node.js baseline (~8k RPS).

## Phase 3: The Brain Transplant (AI & Logic)
**Goal:** Integrate Gemini 3 Flash for real-time adaptive strategy.

- [ ] **AI Quant Upgrade**
    - [ ] Update `@google/generative-ai` SDK.
    - [ ] Refactor `GeminiClient.ts` to target model `gemini-3.0-flash`.
    - [ ] Implement "Deep Think" loop for `TitanAnalyst.ts` (multi-step reasoning before proposal).
- [ ] **Phase 4 Automation**
    - [ ] Create NATS topic `ai.optimization.requests`.
    - [ ] Enable Brain to trigger AI optimization automatically upon detecting regime change (via NATS).

## Phase 4: Standardization & Cleanup
**Goal:** Harden the system for production.

- [ ] **IPC Standardization**
    - [ ] Update `titan-phase2-hunter` and `titan-phase3-sentinel` to use `FastPathClient` (if not already).
    - [ ] Ensure all phases sign messages with the same HMAC secret.
- [ ] **Service Mesh (Optional/Advanced)**
    - [ ] Evaluate **Linkerd** sidecars for mTLS between Brain and Execution (if deploying to K8s).
- [ ] **Legacy Cleanup**
    - [ ] Deprecate and remove `services/titan-execution` (Node.js version) once Rust version is stable.
    - [ ] Remove Redis dependency if fully replaced by NATS (or keep for simple KV caching).

## Phase 5: Verification
- [ ] **End-to-End Latency Test:** Measure `Tick -> Trap -> IPC -> Rust Exec -> Exchange` latency.
- [ ] **Chaos Engineering:** Kill NATS, Kill Brain, Kill Execution - ensure `ShadowState` recovers correctly.
