# Titan Execution (Motor)

**Context**: Backend Service (Rust)
**Port**: 3002
**Role**: Order Execution, Exchange Connectivity, HMAC Verification.

## Key Files

- `src/main.rs`: Entry point.
- `src/nats_engine.rs`: NATS event loop and command processing.
- `src/risk_guard.rs`: Final risk check before exchange submission.
- `src/security.rs`: HMAC signature verification logic.

## Dependencies

- **Upstream**: Receives commands from `titan-brain`.
- **Downstream**: Connects to Exchange APIs (Bybit/Binance).
- **Safety**: ENFORCES `risk_policy.json` (compiled in).
