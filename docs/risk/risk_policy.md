# Titan Risk Policy

> **Status**: Canonical
> **Source Definitions**: `packages/shared/risk_policy.json`
> **Enforcement**: Brain (Strategic) & Execution (Transactional)

## 1. The Constitution

The Risk Policy is the immutable constitution of the organism. It defines the boundaries that **cannot** be crossed, regardless of profit potential.

**Invariant**: The Policy Hash (`policy_hash`) must match between Brain and Execution at handshake. If it differs, the system **Halts**.

## 2. Global Limits

| Parameter | Value | Meaning |
| :--- | :--- | :--- |
| **Max Account Leverage** | `10.0x` | Hard cap on total notion / total equity. |
| **Max Position Notional** | `$50,000` | Max size of any single position. |
| **Max Daily Loss** | `-$1,000` | Kill switch trigger level. |
| **Max Open Orders** | `5` | per Symbol. Prevents order spam/runaway. |
| **Max Slippage** | `100 bps` | (1%) Execution bounds for market orders. |

## 3. The "Immune System" Layers

### Layer 1: Strategic (Brain)

- **Allocation**: Brain will not allocate capital to a Phase if the budget is exhausted.
- **Correlation**: Brain checks portfolio correlation. If `Corr(BTC, ETH) > 0.7`, it imposes a `correlationPenalty` (0.5x sizing).

### Layer 2: Transactional (Execution RiskGuard)

Situated in Rust `services/titan-execution-rs/src/risk_guard.rs`.

- **Pre-Flight Check**: Every command is simulated against the "Shadow State".
- **Rejection**: If `NewLeverage > MaxLeverage`, the command is rejected with `RISK_VIOLATION`.

### Layer 3: Reflexive (Circuit Breakers)

See [Circuit Breakers](circuit_breakers.md).

## 4. Policy Update Protocol

Changing the policy is a **Nuclear Operation**.

1. **Edit**: Modify `packages/shared/risk_policy.json` on `main`.
2. **Deploy**:
   - Both Brain and Execution must be redeployed.
   - They will compute the new SHA256 hash on boot.
   - Handshake will verify the new hash match.
3. **Audit**: The change is logged in the `config_history` table.

## 5. Approved Instruments

**Whitelist Only**:

- `BTC/USDT`
- `ETH/USDT`
- `SOL/USDT`

Trading any other symbol results in immediate command rejection.
