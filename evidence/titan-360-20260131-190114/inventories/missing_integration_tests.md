# Missing Integration Tests

## Critical Tests Needed

### 1. HMAC Rejection Tests
- [ ] Unsigned intent rejected by Rust
- [ ] Invalid signature rejected
- [ ] Expired timestamp rejected

### 2. Risk Violation Tests
- [ ] Daily loss limit enforcement
- [ ] Position notional cap
- [ ] Leverage limit

### 3. E2E Order Lifecycle
- [ ] Intent -> NATS -> Execution -> Fill -> Brain

### 4. Circuit Breaker Tests
- [ ] HALT stops trading
- [ ] FLATTEN closes positions

### 5. Reconciliation Tests
- [ ] Drift detection
- [ ] Confidence decay
