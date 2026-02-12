# M01 — Invariants

## Core Invariants (Must ALWAYS be true)
1. **Capital Preservation**: Allocation weights must strictly sum to 1.0 (normalized).
2. **Fail-Closed Execution**: If Policy Hash handshake fails, Brain MUST NOT process signals.
3. **Risk Gating**: No signal can be approved if `RiskGuardian` confidence score < 0.8 (unless manual override).
4. **Leverage Cap**: Projected leverage must NEVER exceed `EquityTier` limit (Max 20x for Micro, 2x for Inst).
5. **Correlation Guard**: Signals increasing portfolio correlation above `maxCorrelation` (0.7) MUST be rejected or penalized.
6. **Tail Risk (APTR)**: System MUST enter `SURVIVAL_MODE` if APTR > Critical Threshold (50% max equity @ 20% crash).

## State Machine Invariants
- **Startup**: `StartupManager` must complete all steps (Config, DB, NATS) before serving traffic.
- **Leader Election**: Only ONE Brain instance can be LEADER (processing signals) at a time.
- **Circuit Breaker**: If Breaker is TRIPPED, all new "Open" signals are rejected; only "Close" signals allowed.
- **Regime**: `CRASH` regime forces 100% allocation to Phase 1 (Scavenger) or Cash.

## Calculation Invariants
- **Sigmoid Transition**: Phase transitions (P1->P2->P3) must follow smooth sigmoid curves to prevent oscillation.
- **Kelly Fraction**: Position sizing must be fractional Kelly (0.2x - 0.5x) adjusted by Alpha (Tail Index).
