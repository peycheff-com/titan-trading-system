# M04 Security

## 1. Secrets Management
- **Exchange Keys**: Loaded via `@titan/shared` `loadSecretsFromFiles`.
    - `BINANCE_API_KEY`
    - `BINANCE_API_SECRET`
    - `BYBIT_API_KEY`
    - `BYBIT_API_SECRET`
- **Policy**: Secrets must never be logged or exposed in NATS payloads.

## 2. Permissions
- **NATS**:
    - Subscribe: `market.data.*`, `system.regime.*`
    - Publish: `execution.order.*`
    - *Constraint*: Sentinel should NOT have permission to withdraw funds (only `TransferManager` which should be a separate privileged service, but currently embedded).

## 3. Attack Surface
- **Input Validation**:
    - Market Data: Validated by schema? (Currently implicit).
    - Config: Validated on startup.
- **Dependency Trust**:
    - NPM packages audited? (Knip/Audits required).
