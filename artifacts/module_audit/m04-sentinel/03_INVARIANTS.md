# M04 Invariants

## 1. Risk Invariants
> **CRIT-001**: **No Naked Shorts**
> The system shall never open a short position without a corresponding long hedge, except during atomic execution where the delta is temporarily non-zero for < 100ms.

> **CRIT-002**: **Max Drawdown Cap**
> If `HealthReport.drawdown > RiskLimits.criticalDrawdown`, all new signal generation MUST cease immediately.

> **CRIT-003**: **Solvency Constraint**
> `TotalEquity` must always be > 0. If `TotalEquity <= 0`, the instance must transition to a `TERMINATED` state and panic.

## 2. Execution Invariants
> **EXEC-001**: **Order Atomicity**
> Verification of `Order.new` and `Order.fill` must occur within `ExecutionTimeoutMs`. If not, `Order.cancel` must be emitted.

> **EXEC-002**: **Positive Basis Entry**
> Basis Arb Entry strategies (EXPAND/CONTRACT) must only execute when `abs(ZScore) > Threshold`.

## 3. Data Invariants
> **DATA-001**: **Price Freshness**
> Market data used for signal generation must be younger than `MAX_DATA_LATENCY` (100ms).

> **DATA-002**: **Welford Stability**
> `RollingStatistics` stdDev must always be non-negative. (Mathematically true, but float precision must be guarded).
