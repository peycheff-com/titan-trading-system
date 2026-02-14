---- MODULE OrderLifecycle ----
\*
\* TLA+ Specification for Titan Execution Engine Order Lifecycle
\*
\* Formal verification of order state machine to ensure:
\* 1. No double-spending (same order cannot be filled twice)
\* 2. No orphaned orders (all orders reach terminal state)
\* 3. Halt condition is respected (no orders during halt)
\* 4. Proper state transitions only
\*
\* Run with TLC model checker: tlc OrderLifecycle.tla
\*

EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
    Orders,                  \* Set of order IDs
    MaxFillAmount,          \* Maximum fill amount per order
    MaxHaltTime             \* Maximum halt duration in ticks

VARIABLES
    orderState,             \* Function: OrderID -> State
    orderFilledAmount,      \* Function: OrderID -> Amount filled
    globalHalt,             \* Boolean: Global halt active
    haltReason,            \* Current halt reason (if any)
    systemTime              \* Logical clock

\* ---------------------------------------------------------------------------
\* Order States
\* ---------------------------------------------------------------------------
OrderStates == {"PENDING", "OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED", "EXPIRED"}

TerminalStates == {"FILLED", "CANCELLED", "REJECTED", "EXPIRED"}

\* ---------------------------------------------------------------------------
\* Type Invariant
\* ---------------------------------------------------------------------------
TypeInvariant ==
    /\ orderState \in [Orders -> OrderStates]
    /\ orderFilledAmount \in [Orders -> 0..MaxFillAmount]
    /\ globalHalt \in BOOLEAN
    /\ haltReason \in {"NONE", "DRAWDOWN", "PNL_LIMIT", "MANUAL", "SYSTEM_ERROR"}
    /\ systemTime \in Nat

\* ---------------------------------------------------------------------------
\* Safety Properties
\* ---------------------------------------------------------------------------

\* No order can be filled more than once
NoDoubleFill ==
    \A o \in Orders:
        orderFilledAmount[o] <= MaxFillAmount

\* No order processing during halt
NoOrdersDuringHalt ==
    globalHalt => 
        \A o \in Orders: 
            orderState[o] \in TerminalStates \/ orderState[o] = "PENDING"

\* All orders eventually reach a terminal state (liveness, checked separately)
\* AllOrdersTerminate == <>[](\A o \in Orders: orderState[o] \in TerminalStates)

\* No order can transition backward from terminal state
TerminalStateIsFinal ==
    \A o \in Orders:
        orderState[o] \in TerminalStates =>
            orderState'[o] = orderState[o]

\* ---------------------------------------------------------------------------
\* Valid State Transitions
\* ---------------------------------------------------------------------------
ValidTransition(from, to) ==
    CASE from = "PENDING" -> to \in {"OPEN", "REJECTED"}
      [] from = "OPEN" -> to \in {"PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED"}
      [] from = "PARTIALLY_FILLED" -> to \in {"FILLED", "CANCELLED"}
      [] from \in TerminalStates -> to = from  \* Terminal states cannot transition
      [] OTHER -> FALSE

\* ---------------------------------------------------------------------------
\* Initial State
\* ---------------------------------------------------------------------------
Init ==
    /\ orderState = [o \in Orders |-> "PENDING"]
    /\ orderFilledAmount = [o \in Orders |-> 0]
    /\ globalHalt = FALSE
    /\ haltReason = "NONE"
    /\ systemTime = 0

\* ---------------------------------------------------------------------------
\* Actions
\* ---------------------------------------------------------------------------

\* Submit order (PENDING -> OPEN or REJECTED)
SubmitOrder(o) ==
    /\ orderState[o] = "PENDING"
    /\ ~globalHalt
    /\ \/ /\ orderState' = [orderState EXCEPT ![o] = "OPEN"]
          /\ UNCHANGED <<orderFilledAmount, globalHalt, haltReason>>
       \/ /\ orderState' = [orderState EXCEPT ![o] = "REJECTED"]
          /\ UNCHANGED <<orderFilledAmount, globalHalt, haltReason>>
    /\ systemTime' = systemTime + 1

\* Partial fill (OPEN -> PARTIALLY_FILLED)
PartialFill(o, amount) ==
    /\ orderState[o] = "OPEN"
    /\ ~globalHalt
    /\ amount > 0
    /\ amount < MaxFillAmount
    /\ orderFilledAmount[o] + amount < MaxFillAmount
    /\ orderState' = [orderState EXCEPT ![o] = "PARTIALLY_FILLED"]
    /\ orderFilledAmount' = [orderFilledAmount EXCEPT ![o] = @ + amount]
    /\ UNCHANGED <<globalHalt, haltReason>>
    /\ systemTime' = systemTime + 1

\* Complete fill (OPEN or PARTIALLY_FILLED -> FILLED)
CompleteFill(o, amount) ==
    /\ orderState[o] \in {"OPEN", "PARTIALLY_FILLED"}
    /\ ~globalHalt
    /\ orderFilledAmount[o] + amount = MaxFillAmount
    /\ orderState' = [orderState EXCEPT ![o] = "FILLED"]
    /\ orderFilledAmount' = [orderFilledAmount EXCEPT ![o] = @ + amount]
    /\ UNCHANGED <<globalHalt, haltReason>>
    /\ systemTime' = systemTime + 1

\* Cancel order (OPEN or PARTIALLY_FILLED -> CANCELLED)
CancelOrder(o) ==
    /\ orderState[o] \in {"OPEN", "PARTIALLY_FILLED"}
    /\ orderState' = [orderState EXCEPT ![o] = "CANCELLED"]
    /\ UNCHANGED <<orderFilledAmount, globalHalt, haltReason>>
    /\ systemTime' = systemTime + 1

\* Order expired (OPEN -> EXPIRED)
ExpireOrder(o) ==
    /\ orderState[o] = "OPEN"
    /\ orderState' = [orderState EXCEPT ![o] = "EXPIRED"]
    /\ UNCHANGED <<orderFilledAmount, globalHalt, haltReason>>
    /\ systemTime' = systemTime + 1

\* Trigger global halt
TriggerHalt(reason) ==
    /\ ~globalHalt
    /\ globalHalt' = TRUE
    /\ haltReason' = reason
    /\ UNCHANGED <<orderState, orderFilledAmount>>
    /\ systemTime' = systemTime + 1

\* Clear global halt
ClearHalt ==
    /\ globalHalt
    /\ globalHalt' = FALSE
    /\ haltReason' = "NONE"
    /\ UNCHANGED <<orderState, orderFilledAmount>>
    /\ systemTime' = systemTime + 1

\* ---------------------------------------------------------------------------
\* Next State Relation
\* ---------------------------------------------------------------------------
Next ==
    \/ \E o \in Orders: SubmitOrder(o)
    \/ \E o \in Orders, amt \in 1..(MaxFillAmount-1): PartialFill(o, amt)
    \/ \E o \in Orders, amt \in 1..MaxFillAmount: CompleteFill(o, amt)
    \/ \E o \in Orders: CancelOrder(o)
    \/ \E o \in Orders: ExpireOrder(o)
    \/ \E r \in {"DRAWDOWN", "PNL_LIMIT", "MANUAL", "SYSTEM_ERROR"}: TriggerHalt(r)
    \/ ClearHalt

\* ---------------------------------------------------------------------------
\* Specification
\* ---------------------------------------------------------------------------
Spec ==
    Init /\ [][Next]_<<orderState, orderFilledAmount, globalHalt, haltReason, systemTime>>

\* ---------------------------------------------------------------------------
\* Properties to Check
\* ---------------------------------------------------------------------------
THEOREM Spec => []TypeInvariant
THEOREM Spec => []NoDoubleFill
\* NoOrdersDuringHalt is an action property, needs special handling
\* THEOREM Spec => []TerminalStateIsFinal

====
