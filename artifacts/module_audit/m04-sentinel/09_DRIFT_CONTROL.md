# M04 Drift Control

## 1. Drift Types
- **Code Drift**: Discrepancies between `02_CONTRACTS.md` and actual code implementation.
- **Config Drift**: Environmental variables diverging from deployed secrets.
- **State Drift**: `PortfolioManager` internal state vs Exchange real balance.

## 2. Detection & Reconciliation
- **Reconciliation Loop**:
    - `PortfolioManager.update()` should query Exchange balances every 1m.
    - If `InternalBalance != ExchangeBalance`, alert `WARN_STATE_DRIFT`.
- **Contract Testing**:
    - `npm run test:property` checks invariant preservation.

## 3. Correction
- **Automatic**: Use Exchange Balance as Source of Truth. Overwrite internal state.
- **Manual**: Restart service to force re-initialization.
