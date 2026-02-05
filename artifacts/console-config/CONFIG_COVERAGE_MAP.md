# Titan Config Coverage Map

**Generated**: 2026-02-05  
**Purpose**: Complete catalog of all configurable items with schema, scope, and safety rules.

## Legend

| Field | Description |
|-------|-------------|
| Key | Canonical config key |
| Safety | `immutable` / `tighten_only` / `raise_only` / `tunable` |
| Scope | `global` / `venue` / `symbol` / `phase` / `operator` |
| Owner | Service that enforces |
| Storage | `env` / `file` / `postgres` / `nats_kv` |
| Apply | `live` / `restart` / `deploy` |

---

## 1. Risk Parameters

| Key | Safety | Scope | Owner | Storage | Apply | Schema | UI Widget |
|-----|--------|-------|-------|---------|-------|--------|-----------|
| `risk.maxAccountLeverage` | tighten_only | global | Brain+Exec | file | restart | `{type:"number",min:1,max:50}` | slider |
| `risk.maxPositionNotional` | tighten_only | global | Brain+Exec | file | restart | `{type:"number",min:100,max:1000000}` | input |
| `risk.maxDailyLoss` | tighten_only | global | Brain+Exec | file | restart | `{type:"number",max:0}` | input |
| `risk.maxSlippageBps` | tighten_only | global | Exec | file | restart | `{type:"number",min:1,max:500}` | slider |
| `risk.maxCorrelation` | tighten_only | global | Brain | file | restart | `{type:"number",min:0,max:1}` | slider |
| `risk.minConfidenceScore` | raise_only | global | Brain | file | restart | `{type:"number",min:0,max:1}` | slider |
| `risk.maxOpenOrdersPerSymbol` | tunable | symbol | Brain | file | live | `{type:"number",min:1,max:50}` | input |

---

## 2. Phase Parameters

| Key | Safety | Scope | Owner | Storage | Apply | Schema | UI Widget |
|-----|--------|-------|-------|---------|-------|--------|-----------|
| `phase.p1.riskPct` | tunable | phase | Brain | env+file | live | `{type:"number",min:0,max:0.1}` | slider |
| `phase.p2.riskPct` | tunable | phase | Brain | env+file | live | `{type:"number",min:0,max:0.1}` | slider |
| `phase.p1.maxLeverage` | tighten_only | phase | Brain | file | restart | `{type:"number",min:1,max:50}` | slider |
| `phase.p2.maxLeverage` | tighten_only | phase | Brain | file | restart | `{type:"number",min:1,max:50}` | slider |
| `phase.p1.maxDrawdown` | tighten_only | phase | Brain | file | restart | `{type:"number",min:0,max:1}` | slider |
| `phase.p2.maxDrawdown` | tighten_only | phase | Brain | file | restart | `{type:"number",min:0,max:1}` | slider |
| `phase.transitionEquity.p1p2` | tunable | global | Brain | file | live | `{type:"number",min:1000}` | input |
| `phase.transitionEquity.p2p3` | tunable | global | Brain | file | live | `{type:"number",min:5000}` | input |

---

## 3. Circuit Breaker

| Key | Safety | Scope | Owner | Storage | Apply | Schema | UI Widget |
|-----|--------|-------|-------|---------|-------|--------|-----------|
| `breaker.maxDailyDrawdown` | tighten_only | global | Brain | env | live | `{type:"number",min:0,max:1}` | slider |
| `breaker.minEquity` | raise_only | global | Brain | env | live | `{type:"number",min:0}` | input |
| `breaker.consecutiveLossLimit` | tighten_only | global | Brain | env | live | `{type:"integer",min:1,max:10}` | input |
| `breaker.lossWindow` | tunable | global | Brain | env | live | `{type:"number",min:60000}` | input |
| `breaker.cooldownHours` | tunable | global | Brain | env | live | `{type:"number",min:0,max:168}` | input |

---

## 4. Fees

| Key | Safety | Scope | Owner | Storage | Apply | Schema | UI Widget |
|-----|--------|-------|-------|---------|-------|--------|-----------|
| `fees.maker` | tunable | venue | Brain | env | live | `{type:"number",min:0,max:0.01}` | input |
| `fees.taker` | tunable | venue | Brain | env | live | `{type:"number",min:0,max:0.01}` | input |

---

## 5. Venue Credentials

| Key | Safety | Scope | Owner | Storage | Apply | Schema | UI Widget |
|-----|--------|-------|-------|---------|-------|--------|-----------|
| `venue.binance.apiKey` | immutable | venue | Exec | env | deploy | `{type:"string",secret:true}` | secret |
| `venue.binance.apiSecret` | immutable | venue | Exec | env | deploy | `{type:"string",secret:true}` | secret |
| `venue.bybit.apiKey` | immutable | venue | Exec | env | deploy | `{type:"string",secret:true}` | secret |
| `venue.bybit.apiSecret` | immutable | venue | Exec | env | deploy | `{type:"string",secret:true}` | secret |
| `venue.bybit.testnet` | tunable | venue | Exec | env | restart | `{type:"boolean"}` | toggle |
| `venue.bybit.rateLimit` | tunable | venue | Exec | env | restart | `{type:"number",min:1,max:50}` | input |
| `venue.mexc.apiKey` | immutable | venue | Exec | env | deploy | `{type:"string",secret:true}` | secret |
| `venue.mexc.apiSecret` | immutable | venue | Exec | env | deploy | `{type:"string",secret:true}` | secret |

---

## 6. Infrastructure

| Key | Safety | Scope | Owner | Storage | Apply | Schema | UI Widget |
|-----|--------|-------|-------|---------|-------|--------|-----------|
| `infra.nats.url` | immutable | global | All | env | deploy | `{type:"string",format:"url"}` | readonly |
| `infra.postgres.url` | immutable | global | Brain | env | deploy | `{type:"string",secret:true}` | readonly |
| `infra.redis.url` | immutable | global | Brain | env | deploy | `{type:"string"}` | readonly |
| `infra.redis.disabled` | tunable | global | Brain | env | restart | `{type:"boolean"}` | toggle |

---

## 7. Symbol Whitelist

| Key | Safety | Scope | Owner | Storage | Apply | Schema | UI Widget |
|-----|--------|-------|-------|---------|-------|--------|-----------|
| `symbols.whitelist` | append_only | global | Brain+Exec | file | restart | `{type:"array",items:{type:"string"}}` | tag_list |

---

## 8. Runtime Overrides

| Key | Safety | Scope | Owner | Storage | Apply | Schema | UI Widget |
|-----|--------|-------|-------|---------|-------|--------|-----------|
| `override.allocation` | tunable | operator | Brain | postgres | live | `{type:"object"}` | json_editor |
| `override.halt` | tunable | global | Brain | nats_kv | live | `{type:"boolean"}` | big_button |

---

## Coverage Summary

| Category | Count | Immutable | Tighten | Tunable |
|----------|-------|-----------|---------|---------|
| Risk | 7 | 0 | 5 | 2 |
| Phase | 8 | 0 | 4 | 4 |
| Breaker | 5 | 0 | 2 | 3 |
| Fees | 2 | 0 | 0 | 2 |
| Venue | 8 | 6 | 0 | 2 |
| Infra | 4 | 3 | 0 | 1 |
| Symbols | 1 | 0 | 1 | 0 |
| Overrides | 2 | 0 | 0 | 2 |
| **Total** | **37** | **9** | **12** | **16** |

---

## Safety Enforcement Rules

### Tighten-Only Enforcement
```typescript
function canOverride(key: string, current: number, proposed: number): boolean {
  const item = catalog.get(key);
  if (item.safety === 'tighten_only') {
    // Can only reduce risk-increasing values
    if (item.riskDirection === 'higher_is_riskier') {
      return proposed <= current;
    }
    return proposed >= current;
  }
  if (item.safety === 'raise_only') {
    return proposed >= current;
  }
  if (item.safety === 'immutable') {
    return false;
  }
  return true; // tunable
}
```

### Receipt Generation
Every config change generates:
```typescript
interface ConfigReceipt {
  id: string;
  key: string;
  previousValue: unknown;
  newValue: unknown;
  operatorId: string;
  reason: string;
  expiresAt?: number;
  timestamp: number;
  signature: string;
}
```
