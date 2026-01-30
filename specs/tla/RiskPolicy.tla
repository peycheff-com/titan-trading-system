---- MODULE RiskPolicy ----
\*
\* TLA+ Specification for Titan Risk Policy Enforcement
\*
\* Models the RiskGuardian, CircuitBreaker, and risk policy enforcement
\* to formally verify:
\* 1. Positions never exceed capital limits
\* 2. Drawdown breaker activates correctly
\* 3. PnL limits are enforced
\* 4. No execution during breaker activation
\*
\* @see services/titan-brain/src/features/Risk/RiskGuardian.ts
\* @see services/shared/src/schemas/RiskPolicy.ts
\*

EXTENDS Integers, Reals, FiniteSets

CONSTANTS
    MaxCapital,              \* Total capital available
    MaxPositionPct,          \* Max position as % of capital (0-100)
    MaxDrawdownPct,          \* Max drawdown before halt (0-100)
    MaxDailyLossPct,         \* Max daily loss before halt (0-100)
    MaxLeverage              \* Maximum allowed leverage

VARIABLES
    capital,                 \* Current available capital
    positionValue,           \* Current total position value
    unrealizedPnL,           \* Current unrealized PnL
    realizedPnL,             \* Daily realized PnL
    peakCapital,             \* Peak capital (for drawdown)
    breakerTripped,          \* Circuit breaker status
    breakerReason            \* Reason for breaker (if any)

\* ---------------------------------------------------------------------------
\* Type Invariant
\* ---------------------------------------------------------------------------
TypeInvariant ==
    /\ capital \in Int
    /\ positionValue \in Int
    /\ unrealizedPnL \in Int
    /\ realizedPnL \in Int
    /\ peakCapital \in Int
    /\ breakerTripped \in BOOLEAN
    /\ breakerReason \in {"NONE", "DRAWDOWN", "DAILY_LOSS", "POSITION_LIMIT", "LEVERAGE"}

\* ---------------------------------------------------------------------------
\* Derived Values
\* ---------------------------------------------------------------------------
CurrentEquity == capital + unrealizedPnL

DrawdownPct ==
    IF peakCapital > 0
    THEN ((peakCapital - CurrentEquity) * 100) \div peakCapital
    ELSE 0

DailyLossPct ==
    IF MaxCapital > 0 /\ realizedPnL < 0
    THEN ((-realizedPnL) * 100) \div MaxCapital
    ELSE 0

PositionPct ==
    IF capital > 0
    THEN (positionValue * 100) \div capital
    ELSE 0

CurrentLeverage ==
    IF capital > 0
    THEN positionValue \div capital
    ELSE 0

\* ---------------------------------------------------------------------------
\* Safety Properties
\* ---------------------------------------------------------------------------

\* Position never exceeds limit
PositionWithinLimits ==
    positionValue <= (capital * MaxPositionPct) \div 100

\* Breaker trips on drawdown breach
DrawdownBreakerCorrect ==
    DrawdownPct > MaxDrawdownPct => breakerTripped

\* Breaker trips on daily loss breach
DailyLossBreakerCorrect ==
    DailyLossPct > MaxDailyLossPct => breakerTripped

\* No new positions during breaker
NoNewPositionsDuringBreaker ==
    breakerTripped => positionValue' <= positionValue

\* Leverage never exceeded
LeverageWithinLimits ==
    CurrentLeverage <= MaxLeverage

\* Combined safety invariant
SafetyInvariant ==
    /\ PositionWithinLimits
    /\ LeverageWithinLimits

\* ---------------------------------------------------------------------------
\* Initial State
\* ---------------------------------------------------------------------------
Init ==
    /\ capital = MaxCapital
    /\ positionValue = 0
    /\ unrealizedPnL = 0
    /\ realizedPnL = 0
    /\ peakCapital = MaxCapital
    /\ breakerTripped = FALSE
    /\ breakerReason = "NONE"

\* ---------------------------------------------------------------------------
\* Actions
\* ---------------------------------------------------------------------------

\* Open a position (respects limits)
OpenPosition(size) ==
    /\ ~breakerTripped
    /\ size > 0
    /\ positionValue + size <= (capital * MaxPositionPct) \div 100
    /\ (positionValue + size) \div capital <= MaxLeverage
    /\ positionValue' = positionValue + size
    /\ UNCHANGED <<capital, unrealizedPnL, realizedPnL, peakCapital, breakerTripped, breakerReason>>

\* Close a position
ClosePosition(size, pnl) ==
    /\ size > 0
    /\ size <= positionValue
    /\ positionValue' = positionValue - size
    /\ realizedPnL' = realizedPnL + pnl
    /\ capital' = capital + pnl
    /\ unrealizedPnL' = 0  \* Simplified: closing resets unrealized
    /\ IF capital' > peakCapital
       THEN peakCapital' = capital'
       ELSE UNCHANGED peakCapital
    /\ UNCHANGED <<breakerTripped, breakerReason>>

\* Mark-to-market update
UpdatePnL(delta) ==
    /\ unrealizedPnL' = unrealizedPnL + delta
    /\ IF CurrentEquity > peakCapital
       THEN peakCapital' = CurrentEquity
       ELSE UNCHANGED peakCapital
    /\ UNCHANGED <<capital, positionValue, realizedPnL, breakerTripped, breakerReason>>

\* Check and trip circuit breaker
CheckBreaker ==
    /\ ~breakerTripped
    /\ \/ /\ DrawdownPct > MaxDrawdownPct
          /\ breakerTripped' = TRUE
          /\ breakerReason' = "DRAWDOWN"
       \/ /\ DailyLossPct > MaxDailyLossPct
          /\ breakerTripped' = TRUE
          /\ breakerReason' = "DAILY_LOSS"
    /\ UNCHANGED <<capital, positionValue, unrealizedPnL, realizedPnL, peakCapital>>

\* Reset breaker (manual intervention)
ResetBreaker ==
    /\ breakerTripped
    /\ DrawdownPct <= MaxDrawdownPct
    /\ DailyLossPct <= MaxDailyLossPct
    /\ breakerTripped' = FALSE
    /\ breakerReason' = "NONE"
    /\ UNCHANGED <<capital, positionValue, unrealizedPnL, realizedPnL, peakCapital>>

\* New trading day (reset daily limits)
NewTradingDay ==
    /\ realizedPnL' = 0
    /\ IF ~breakerTripped \/ breakerReason = "DAILY_LOSS"
       THEN /\ breakerTripped' = FALSE
            /\ breakerReason' = "NONE"
       ELSE UNCHANGED <<breakerTripped, breakerReason>>
    /\ UNCHANGED <<capital, positionValue, unrealizedPnL, peakCapital>>

\* ---------------------------------------------------------------------------
\* Next State Relation
\* ---------------------------------------------------------------------------
Next ==
    \/ \E s \in 1..MaxCapital: OpenPosition(s)
    \/ \E s \in 1..MaxCapital, pnl \in -MaxCapital..MaxCapital: ClosePosition(s, pnl)
    \/ \E d \in -MaxCapital..MaxCapital: UpdatePnL(d)
    \/ CheckBreaker
    \/ ResetBreaker
    \/ NewTradingDay

\* ---------------------------------------------------------------------------
\* Specification
\* ---------------------------------------------------------------------------
Spec ==
    Init /\ [][Next]_<<capital, positionValue, unrealizedPnL, realizedPnL, peakCapital, breakerTripped, breakerReason>>

\* ---------------------------------------------------------------------------
\* Properties to Check
\* ---------------------------------------------------------------------------
THEOREM Spec => []TypeInvariant
THEOREM Spec => []SafetyInvariant
THEOREM Spec => []DrawdownBreakerCorrect
THEOREM Spec => []DailyLossBreakerCorrect

====
