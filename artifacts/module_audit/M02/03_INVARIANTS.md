# M02 — Invariants

> The non-negotiable rules this module must follow.

## 1. Safety & Risk
- [x] **Confirmation Delay**: Must wait 200ms after trigger to verify price hold (Anti-Wick).
  - _Verified_: `TrapDetector.ts:143` (`setTimeout(..., 200)`)
- [x] **Cooldowns**: Traps cannot fire twice within 5 minutes.
  - _Verified_: `TrapDetector.ts:84` (`timeSinceActivation < 300000`)
- [x] **Ghost Mode**: Must skip execution if `ghostMode: true`.
  - _Verified_: `TrapExecutor.ts:211`

## 2. Logic & State
- [x] **Volume Validation**: Must see `minTrades` in 100ms window.
  - _Verified_: `TrapDetector.ts:117`
- [x] **Brain Handshake**: Signals must be sent via `SignalClient` (NATS).
  - _Verified_: `TrapExecutor.ts:279` (`signalClient.sendPrepare`)

## 3. Data Integrity
- [x] **OFI Calculation**: Correctly handles first tick (returns 0).
  - _Verified_: `OrderFlowImbalanceCalculator.ts:35`
- [x] **Reconnection**: Binance Client must auto-reconnect on close.
  - _Verified_: `BinanceSpotClient.ts:160`
