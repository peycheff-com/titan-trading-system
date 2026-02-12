# M06 — Remediation Plan

> **Status**: **RESOLVED**
> **Gate**: **A**

## 1. Findings & Resolutions

| # | Finding | Impact | Fix Policy | Proposed Change | Status | Gate |
|---|---------|--------|------------|-----------------|--------|------|
| 1 | `check_nats.js` is trivial | Low | F0 | Replace with `scripts/ops/verify_nats.ts` (Planned) | Deferred | B |
| 2 | Subject Canonicalization Mismatch | Med | F0 | Verified `titan.data.market` vs `titan.data.venues` usage. Mapped correctly in ACLs. | ✅ Verified | A |
| 3 | Retention Policy (1M msgs) | High | F1 | Increased to 10M messages for `TITAN_MARKET_TRADES`. | ✅ Done | A |
| 4 | Single Replica | Med | F2 | Accept single node for current phase. Cluster plan for Gate A+ | ✅ Accepted | A |

## 2. Verification

- **Config**: `nats.conf` validates with `nats-server --config`.
- **Streams**: Verified via `nats stream info`.
