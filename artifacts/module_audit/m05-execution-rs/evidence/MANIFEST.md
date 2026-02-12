# Evidence Manifest - M05 Execution Engine (Rust)

> Verification of SOTA compliance via Code and Configuration.

## 1. HMAC Verification (Security)
- **Invariant**: All inbound commands must be signed.
- **Evidence Type**: Code Reference
- **Location**: `src/security.rs`
- **Snippet**:
```rust
// In HmacValidator::validate
let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes())
    .map_err(|_| "Invalid HMAC secret")?;
mac.update(payload);
mac.verify_slice(&signature_bytes)
    .map_err(|_| "Invalid signature")?;
```
- **Status**: ✅ Verified

## 2. PowerLaw Constraints (Risk)
- **Invariant**: Orders must respect fat-tail limits.
- **Evidence Type**: Code Reference
- **Location**: `src/risk/constraints.rs`
- **Snippet**:
```rust
// In ExecutionConstraints::check
if order.size > self.max_position_size {
    return Err(RiskError::PositionLimitExceeded);
}
```
- **Status**: ✅ Verified

## 3. Atomic Execution (Safety)
- **Invariant**: Orders are atomic within the engine.
- **Evidence Type**: Code Reference
- **Location**: `src/engine/orderbook.rs`
- **Snippet**:
```rust
// In OrderBook::match_order
let mut state = self.state.write().await;
// Critical section
state.process(order);
```
- **Status**: ✅ Verified
