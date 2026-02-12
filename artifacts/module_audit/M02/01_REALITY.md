# M02 — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Transpiles Cleanly (`tsc -b`)
- [x] Unit Tests Exist (`npm test`)
- [x] CLI UI Works (`ink` based)

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|-------------------|-------------|------|
| "3-Layer Trap Architecture" | `TitanTrap` orchestrates Generator/Detector/Executor | ✅ |
| "Regime Detection" | `TrapGenerator` identifies BREAKOUT/RANGE/TREND | ✅ |
| "Micro-CVD Confirmation" | `TrapDetector` checks 100ms accumulation + CVD | ✅ |
| "Brain Integration" | `TrapExecutor` dispatches `IntentSignal` to Brain | ✅ |
| "Safety Cooldowns" | `TrapExecutor` enforces 5min cooldown per trap | ✅ |

## Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| Binance Spot | REST/WS | `BinanceSpotClient.ts` | ✅ |
| Bybit Perps | REST/WS | `BybitPerpsClient.ts` | ✅ |

## Logic Flow
1. **Generator**: Scans top 20 symbols every minute for structure (Support/Resistance).
2. **Detector**: Watches Binance AggTrades; accumulates volume in 100ms buckets.
3. **Trigger**: If price hits trap + Volume Spike + CVD confirms -> Wait 200ms.
4. **Executor**: If price holds, dispatch to Brain for execution.
