# Titan Policy Surfaces

**Generated**: 2026-02-05  
**Sources**: `packages/shared/risk_policy.json`, `config/brain.config.json`

## Risk Policy Parameters

### Canonical Risk Policy (`packages/shared/risk_policy.json`)

| Parameter | Type | Default | Mutability | Description |
|-----------|------|---------|------------|-------------|
| `maxAccountLeverage` | number | 10.0 | Tighten-only | Max account-wide leverage |
| `maxPositionNotional` | number | 50000.0 | Tighten-only | Max position size USD |
| `maxDailyLoss` | number | -1000.0 | Tighten-only | Max daily loss USD |
| `maxOpenOrdersPerSymbol` | number | 5 | Tunable | Order limit per symbol |
| `symbolWhitelist` | string[] | ["BTC/USDT","ETH/USDT","SOL/USDT"] | Append-only | Allowed symbols |
| `maxSlippageBps` | number | 100 | Tighten-only | Max slippage bps |
| `maxStalenessMs` | number | 5000 | Tunable | Data staleness limit |
| `maxCorrelation` | number | 0.7 | Tighten-only | Max position correlation |
| `correlationPenalty` | number | 0.5 | Tunable | Size reduction factor |
| `minConfidenceScore` | number | 0.7 | Raise-only | Min signal confidence |
| `minStopDistanceMultiplier` | number | 1.5 | Tunable | Stop distance multiplier |
| `version` | number | 1 | Immutable | Policy version |
| `lastUpdated` | number | 0 | Auto | Update timestamp |

### Mutability Legend
- **Immutable**: Deploy-only, requires signed release
- **Tighten-only**: Can reduce risk, cannot increase
- **Raise-only**: Can raise threshold, cannot lower
- **Tunable**: Free to adjust at runtime
- **Append-only**: Can add items, cannot remove

---

## Brain Configuration (`config/brain.config.json`)

### Global Settings

| Parameter | Type | Default | Mutability |
|-----------|------|---------|------------|
| `maxTotalLeverage` | number | 50 | Tighten-only |
| `maxGlobalDrawdown` | number | 0.15 | Tighten-only |
| `emergencyFlattenThreshold` | number | 0.15 | Tighten-only |

### Phase Transition Rules

| Parameter | Type | Default | Mutability |
|-----------|------|---------|------------|
| `phase1ToPhase2` | number | 5000 | Tunable |
| `phase2ToPhase3` | number | 50000 | Tunable |

### Phase Overrides

| Phase | Parameter | Default | Mutability |
|-------|-----------|---------|------------|
| phase1 | maxLeverage | 20 | Tighten-only |
| phase1 | maxDrawdown | 0.07 | Tighten-only |
| phase2 | maxLeverage | 5 | Tighten-only |
| phase2 | maxDrawdown | 0.05 | Tighten-only |

### Environment-Specific Overrides

| Environment | maxTotalLeverage | maxGlobalDrawdown | emergencyFlattenThreshold |
|-------------|------------------|-------------------|---------------------------|
| development | 10 | 0.05 | 0.05 |
| staging | 25 | 0.10 | 0.10 |
| production | 50 | 0.15 | 0.15 |

---

## Posture Configurations

### Available Postures (`config/postures/`)

1. **constrained_alpha.env** (5.3 KB)
   - Capital-constrained, high-velocity approach
   - Lower leverage, tighter stops

2. **micro_capital.env** (4.4 KB)
   - Micro-account strategy
   - Very conservative limits

---

## Policy Hash Validation

Both Brain and Execution-RS compute policy hashes:
1. Brain loads `risk_policy.json` → computes SHA256
2. Execution-RS loads embedded policy → computes SHA256
3. On startup, hashes must match
4. Mismatch triggers startup failure

**Hash Validation Location**: `services/titan-execution-rs/src/config.rs`

---

## Console-Controllable vs Deploy-Only

### Console (Runtime)
- Circuit breaker reset
- Manual override create/deactivate
- Halt/Resume system
- Operator management

### Deploy-Only (CI/CD)
- Policy version changes
- Symbol whitelist removals
- Leverage ceiling increases
- Stop distance reductions
