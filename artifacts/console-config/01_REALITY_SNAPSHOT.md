# Titan Configuration Reality Snapshot

**Generated**: 2026-02-05

## 1. Console Pages and Components

### Current Pages (`apps/titan-console/src/pages/`)

| Page | Lines | Purpose |
|------|-------|---------|
| `Settings.tsx` | 988 | Main config page (RiskTuner, ApiKeys, Safety, Guardrails, Fees, System) |
| `LiveOps.tsx` | ~400 | Live operations dashboard |
| `Overview.tsx` | ~300 | System overview |
| `Login.tsx` | ~150 | Operator authentication |
| `NotFound.tsx` | ~30 | 404 page |

**Subdirectories**:
- `ops/` - 7 operational pages
- `organs/` - 4 organ pages (Phases, PowerLaw, AI)
- `phases/` - 3 phase-specific pages

### Key Components (`apps/titan-console/src/components/`)
- 65+ components in `titan/` namespace
- Uses shadcn/ui (`ui/` directory)

---

## 2. Brain API Endpoints

### Controllers (`services/titan-brain/src/server/controllers/`)

| Controller | Routes | Purpose |
|------------|--------|---------|
| `AdminController.ts` | 15 routes | Override, operator, risk, infra, audit |
| `DashboardController.ts` | 5 routes | Dashboard data aggregation |
| `SafetyController.ts` | 3 routes | Circuit breaker, halt |
| `SignalController.ts` | 4 routes | Signal management |
| `HealthController.ts` | 2 routes | Health checks |
| `AuditController.ts` | 2 routes | Audit log access |
| `LedgerController.ts` | 3 routes | Ledger operations |

### Key Admin Routes
- `POST /auth/login` - Operator login
- `POST /breaker/reset` - Reset circuit breaker
- `POST /risk/halt` - Emergency halt
- `POST /admin/override` - Create allocation override
- `DELETE /admin/override` - Deactivate override
- `GET /admin/override` - Get current override
- `POST /admin/operator` - Create operator
- `PATCH /risk/config` - Update risk config
- `POST /reconciliation/trigger` - Manual reconciliation
- `POST /admin/infra/failover` - Trigger failover
- `POST /admin/infra/restore` - Trigger restore

---

## 3. Configuration Sources

### Files
| File | Purpose |
|------|---------|
| `.env` / `.env.example` | Environment variables (177 vars) |
| `config/brain.config.json` | Brain config with env overrides |
| `config/nats.conf` | NATS ACL and JetStream config |
| `config/postures/*.env` | Posture-specific configs |
| `packages/shared/risk_policy.json` | Canonical risk policy |

### Database Tables (Config/Control)
| Table | Purpose |
|-------|---------|
| `operators` | Operator accounts, permissions |
| `manual_overrides` | Allocation overrides with expiry |
| `system_state` | JSONB state checkpointing |
| `circuit_breaker_events` | Breaker state changes |

### Runtime Sources
- Redis for caching and idempotency
- NATS KV for distributed state

---

## 4. Existing Config Types in Settings.tsx

```typescript
interface RiskTuner { phase1_risk_pct, phase2_risk_pct }
interface AssetWhitelist { enabled, assets, disabled_assets }
interface ApiKeys { broker, bybit_api_key, bybit_api_secret, mexc_api_key, mexc_api_secret, testnet, validated }
interface Fees { maker_fee_pct, taker_fee_pct }
interface Safety { max_consecutive_losses, max_daily_drawdown_pct, max_weekly_drawdown_pct, circuit_breaker_cooldown_hours }
interface System { rate_limit_per_sec }
interface Guardrails { maxLeverage, maxStopLossPct, maxRiskPerTrade, maxPositionSizePct, maxDailyDrawdownPct, maxTotalDrawdownPct, minConfidenceScore, maxConsecutiveLosses }
interface Backtester { bulgariaLatencyMs, bulgariaSlippagePct, minTradesForValidation, maxDrawdownIncreasePct }
interface StrategicMemory { maxRecords, archiveAfterDays, duplicateWindowDays, performanceTrackingDays, contextLimit }
```

---

## 5. Gaps Identified

1. **No central config catalog** - Settings are scattered across multiple sources
2. **No schema-driven forms** - Each setting manually coded in UI
3. **No receipts for config changes** - Audit trail incomplete
4. **No tighten-only enforcement** - Settings can be loosened without restriction
5. **No expiry on overrides** - Overrides stay active indefinitely unless deactivated
6. **No policy hash validation in UI** - Brain/Execution policy mismatch not surfaced
7. **No venue-scoped configuration** - All settings are global
