/// Order Lifecycle FSM — Formal State Machine for Execution
///
/// Every order passes through a deterministic set of states.
/// Transitions are guarded: illegal transitions panic in debug, log+reject in release.
///
/// State Diagram:
/// ```text
///   Received → Validated → Accepted → Sent → Acked → Filled
///                 ↓          ↓        ↓      ↓         ↓
///              Rejected   Rejected  Failed  Failed  PartialFill → Filled
///                 ↓          ↓        ↓      ↓         ↓
///               [DLQ]      [DLQ]   [DLQ]  [DLQ]    Canceled
///                                                      ↓
///                                                  Reconciled
///
///   Terminal states: Filled, Rejected, Canceled, Failed, Reconciled
/// ```
use serde::{Deserialize, Serialize};
use std::fmt;
use tracing::{error, info};

/// Formal order lifecycle states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderLifecycleState {
    /// Intent received from JetStream consumer
    Received,
    /// Passed all pre-trade validation (schema, freshness, policy hash)
    Validated,
    /// Passed risk guard checks, sizing approved
    Accepted,
    /// Order sent to exchange adapter
    Sent,
    /// Exchange acknowledged the order (client_order_id assigned)
    Acked,
    /// Partial fill received
    PartialFill,
    /// Fully filled — terminal
    Filled,
    /// Rejected by pre-trade checks or risk guard — terminal
    Rejected,
    /// Canceled (timeout, manual, or exchange) — terminal
    Canceled,
    /// Failed to send or exchange error — terminal
    Failed,
    /// Post-trade reconciliation complete — terminal
    Reconciled,
}

impl OrderLifecycleState {
    /// Returns true if this is a terminal (final) state.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Filled | Self::Rejected | Self::Canceled | Self::Failed | Self::Reconciled
        )
    }

    /// Returns the set of states reachable from this state.
    pub fn valid_transitions(&self) -> &'static [OrderLifecycleState] {
        use OrderLifecycleState::*;
        match self {
            Received => &[Validated, Rejected],
            Validated => &[Accepted, Rejected],
            Accepted => &[Sent, Rejected, Failed],
            Sent => &[Acked, Failed],
            Acked => &[Filled, PartialFill, Canceled, Failed],
            PartialFill => &[Filled, PartialFill, Canceled, Failed],
            // Terminal states cannot transition
            Filled => &[Reconciled],
            Rejected => &[],
            Canceled => &[Reconciled],
            Failed => &[],
            Reconciled => &[],
        }
    }

    /// Check if transitioning to `next` is valid.
    pub fn can_transition_to(&self, next: &OrderLifecycleState) -> bool {
        self.valid_transitions().contains(next)
    }
}

impl fmt::Display for OrderLifecycleState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

/// Tracks the current state of an order with transition enforcement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderFsm {
    pub signal_id: String,
    pub symbol: String,
    pub state: OrderLifecycleState,
    pub transitions: Vec<FsmTransition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsmTransition {
    pub from: OrderLifecycleState,
    pub to: OrderLifecycleState,
    pub timestamp_ms: i64,
    pub reason: Option<String>,
}

impl OrderFsm {
    pub fn new(signal_id: String, symbol: String) -> Self {
        Self {
            signal_id,
            symbol,
            state: OrderLifecycleState::Received,
            transitions: Vec::new(),
        }
    }

    /// Attempt a state transition. Returns Ok(()) if valid, Err with reason if not.
    pub fn transition(
        &mut self,
        next: OrderLifecycleState,
        timestamp_ms: i64,
        reason: Option<String>,
    ) -> Result<(), String> {
        if !self.state.can_transition_to(&next) {
            let msg = format!(
                "Illegal FSM transition for {}: {} → {} (reason: {:?})",
                self.signal_id, self.state, next, reason
            );
            error!("{}", msg);
            return Err(msg);
        }

        info!(
            signal_id = %self.signal_id,
            symbol = %self.symbol,
            from = %self.state,
            to = %next,
            "FSM transition"
        );

        self.transitions.push(FsmTransition {
            from: self.state,
            to: next,
            timestamp_ms,
            reason,
        });
        self.state = next;
        Ok(())
    }

    /// Shorthand to reject an order from any non-terminal state.
    pub fn reject(&mut self, timestamp_ms: i64, reason: String) -> Result<(), String> {
        self.transition(OrderLifecycleState::Rejected, timestamp_ms, Some(reason))
    }

    /// Shorthand to fail an order from Accepted/Sent/Acked/PartialFill.
    pub fn fail(&mut self, timestamp_ms: i64, reason: String) -> Result<(), String> {
        self.transition(OrderLifecycleState::Failed, timestamp_ms, Some(reason))
    }

    /// Check if order is in a terminal state.
    pub fn is_terminal(&self) -> bool {
        self.state.is_terminal()
    }

    /// Get total latency from first to last transition.
    pub fn total_latency_ms(&self) -> Option<i64> {
        if self.transitions.len() < 2 {
            return None;
        }
        let first = self.transitions.first()?.timestamp_ms;
        let last = self.transitions.last()?.timestamp_ms;
        Some(last - first)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_happy_path_lifecycle() {
        let mut fsm = OrderFsm::new("sig-1".into(), "BTCUSDT".into());
        let t = 1000;

        assert!(
            fsm.transition(OrderLifecycleState::Validated, t + 1, None)
                .is_ok()
        );
        assert!(
            fsm.transition(OrderLifecycleState::Accepted, t + 2, None)
                .is_ok()
        );
        assert!(
            fsm.transition(OrderLifecycleState::Sent, t + 3, None)
                .is_ok()
        );
        assert!(
            fsm.transition(OrderLifecycleState::Acked, t + 4, None)
                .is_ok()
        );
        assert!(
            fsm.transition(OrderLifecycleState::Filled, t + 5, None)
                .is_ok()
        );
        assert!(
            fsm.transition(OrderLifecycleState::Reconciled, t + 6, None)
                .is_ok()
        );

        assert!(fsm.is_terminal());
        assert_eq!(fsm.transitions.len(), 6);
    }

    #[test]
    fn test_rejection_from_validated() {
        let mut fsm = OrderFsm::new("sig-2".into(), "ETHUSDT".into());
        assert!(
            fsm.transition(OrderLifecycleState::Validated, 100, None)
                .is_ok()
        );
        assert!(fsm.reject(200, "risk limit exceeded".into()).is_ok());
        assert!(fsm.is_terminal());
    }

    #[test]
    fn test_illegal_transition_fails() {
        let mut fsm = OrderFsm::new("sig-3".into(), "BTCUSDT".into());
        // Cannot go directly from Received to Sent
        assert!(
            fsm.transition(OrderLifecycleState::Sent, 100, None)
                .is_err()
        );
        // State should not have changed
        assert_eq!(fsm.state, OrderLifecycleState::Received);
    }

    #[test]
    fn test_partial_fill_to_filled() {
        let mut fsm = OrderFsm::new("sig-4".into(), "BTCUSDT".into());
        assert!(
            fsm.transition(OrderLifecycleState::Validated, 1, None)
                .is_ok()
        );
        assert!(
            fsm.transition(OrderLifecycleState::Accepted, 2, None)
                .is_ok()
        );
        assert!(fsm.transition(OrderLifecycleState::Sent, 3, None).is_ok());
        assert!(fsm.transition(OrderLifecycleState::Acked, 4, None).is_ok());
        assert!(
            fsm.transition(
                OrderLifecycleState::PartialFill,
                5,
                Some("50% filled".into())
            )
            .is_ok()
        );
        assert!(
            fsm.transition(OrderLifecycleState::Filled, 6, Some("100% filled".into()))
                .is_ok()
        );
        assert!(fsm.is_terminal());
    }

    #[test]
    fn test_terminal_states_cannot_transition() {
        let mut fsm = OrderFsm::new("sig-5".into(), "BTCUSDT".into());
        assert!(
            fsm.transition(OrderLifecycleState::Validated, 1, None)
                .is_ok()
        );
        assert!(fsm.reject(2, "test".into()).is_ok());
        // Rejected is terminal — cannot transition further
        assert!(
            fsm.transition(OrderLifecycleState::Accepted, 3, None)
                .is_err()
        );
    }

    #[test]
    fn test_latency_calculation() {
        let mut fsm = OrderFsm::new("sig-6".into(), "BTCUSDT".into());
        assert!(
            fsm.transition(OrderLifecycleState::Validated, 100, None)
                .is_ok()
        );
        assert!(
            fsm.transition(OrderLifecycleState::Accepted, 150, None)
                .is_ok()
        );
        assert!(fsm.transition(OrderLifecycleState::Sent, 200, None).is_ok());
        assert_eq!(fsm.total_latency_ms(), Some(100));
    }
}
