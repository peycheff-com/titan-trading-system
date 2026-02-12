# M08P — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Tests exist (`tail-estimators.test.ts`)
- [x] Docker build: Standard Node.js

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Fat Tail Estimation" | `tail-estimators.ts` implements Hill estimator | ✅ |
| "Volatility Clustering" | `volatility-cluster.ts` exists | ✅ |
| "NATS Integration" | Listens to `market.ticker` in `service.ts` | ✅ |

## Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

