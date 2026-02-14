# Titan Execution (Motor)

**Context**: Backend Service (Rust)
**Port**: 3002
**Role**: Order Execution, Exchange Connectivity, HMAC Verification.

## Key Files

- `src/main.rs`: Entry point, adapter bootstrap.
- `src/nats_engine.rs`: NATS event loop and command processing.
- `src/risk_guard.rs`: Final risk check before exchange submission.
- `src/security.rs`: HMAC signature verification logic.
- `src/exchange/`: 17 exchange adapters (10 CEX + 7 DEX).

## Dependencies

- **Upstream**: Receives commands from `titan-brain`.
- **Downstream**: Connects to Exchange APIs:
  - **CEX**: Binance, Bybit, OKX, Coinbase, Kraken, KuCoin, Gate.io, MEXC, Crypto.com, dYdX
  - **DEX**: Uniswap, PancakeSwap, SushiSwap, Curve, Jupiter, GMX, Hyperliquid
- **Safety**: ENFORCES `risk_policy.json` (compiled in).

## Staging Deployment

- **Docker image**: Built from `rust:latest` (stable Rust 2021 edition).
- **Compose**: `docker-compose.micro.yml` — requires `HMAC_SECRET` env var.
