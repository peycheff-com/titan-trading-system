# Titan Trading System - Audit Evidence Pack

> [!NOTE]
> This document provides verifiable evidence for each safety-critical invariant implemented in the Titan system.

---

## 1. Policy Hash Injection & Enforcement

### 1.1 Canonical Risk Policy
**File**: [RiskPolicy.ts](../../packages/shared/src/schemas/RiskPolicy.ts)

- Policy loaded with strict validation (`getCanonicalRiskPolicy()`)
- Hash computed deterministically via `computePolicyHash()`
- Versioned with semantic versioning

### 1.2 Brain Policy Injection
**File**: [SignalProcessor.ts](../../services/titan-brain/src/engine/SignalProcessor.ts)

- Intents published via `publishEnvelope()` with policy_hash included
- Hash included INSIDE HMAC signature (tamper-proof)

### 1.3 Execution Policy Verification
**File**: [nats_engine.rs](../../services/titan-execution-rs/src/nats_engine.rs)

- Policy hash verified at boot
- Hash verified per-intent
- Rejection event published on mismatch

---

## 2. Execution Armed Gate (Physical Interlock)

### 2.1 Armed State Implementation
**File**: [armed_state.rs](../../services/titan-execution-rs/src/armed_state.rs)

- `ArmedState` struct with file-backed persistence
- Defaults to DISARMED on boot
- Requires explicit ARM command to enable trading

### 2.2 Intent Rejection Gate
**File**: [nats_engine.rs](../../services/titan-execution-rs/src/nats_engine.rs)

- All intents rejected if `!armed_state.is_armed()`
- Rejection event published with reason `NOT_ARMED`

---

## 3. Leader Election & Wiring

### 3.1 Leader Elector Implementation
**File**: [LeaderElector.ts](../../packages/shared/src/coordination/LeaderElector.ts)

- Monotonic `leaderTerm` (fencing token) increments on each promotion
- NATS disconnect triggers hard demotion
- `getLeaderTerm()` accessor for term queries

### 3.2 Brain Leadership Coupling
**File**: [TitanBrain.ts](../../services/titan-brain/src/engine/TitanBrain.ts)

- `handleLeadershipPromotion()` verifies policy handshake
- Brain refuses to process signals on handshake failure
- Signal processing disabled on demotion

---

## 4. Rejection Telemetry

### 4.1 Rejection Events
**File**: [nats_engine.rs](../../services/titan-execution-rs/src/nats_engine.rs)

Published on: `titan.evt.exec.reject.v1`

Payload includes:
- `reason`: POLICY_MISMATCH | NOT_ARMED | HMAC_INVALID
- `expected_hash` / `got_hash`
- `intent_id`
- `brain_instance_id`

### 4.2 Metrics
**File**: [metrics.rs](../../services/titan-execution-rs/src/metrics.rs)

- `titan_execution_rejection_events_total` counter with reason label

---

## 5. Test Evidence

### 5.1 Unit Tests
```bash
# Rust Execution tests
cargo test --package titan-execution-rs

# TypeScript tests
npm test --workspace=@titan/shared
npm test --workspace=titan-brain
npm test --workspace=titan-harness
```

### 5.2 Integration Harness
**File**: [GoldenPath.ts](../../packages/titan-harness/src/GoldenPath.ts)

- Full lifecycle: Signal → Brain → Execution → Fill → Accounting
- Accept/Reject scenarios tested
- Latency tracking (p50/p95/p99)

---

## 6. Build Verification

```bash
# TypeScript compilation
npm run build --workspaces

# Rust compilation
cargo build --release --package titan-execution-rs

# Docker images
docker build -t titan-brain:latest -f services/titan-brain/Dockerfile .
docker build -t titan-execution:latest -f services/titan-execution-rs/Dockerfile .
```

---

## 7. Key Configuration Files

| File | Purpose |
|------|---------|
| [risk_policy.json](../../packages/shared/risk_policy.json) | Canonical risk policy |
| [fee_schedule.json](../../packages/shared/fee_schedule.json) | Fee assumptions |
| [docker-compose.yml](../../docker-compose.yml) | Service orchestration |
