use crate::model::Side;
use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderState {
    New,             // Just received
    PendingNew,      // Validated, sent to exchange
    Open,            // Acked by exchange
    PartiallyFilled, // Partial fill
    Filled,          // Fully filled
    PendingCancel,   // Cancel sent
    Canceled,        // Cancel acked
    Rejected,        // Rejected by exchange or internal validation
    Expired,         // Time based expiry
    Failed,          // Critical failure
}

impl fmt::Display for OrderState {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderSnapshot {
    pub signal_id: String,
    pub symbol: String,
    pub state: OrderState,
    pub side: Side,
    pub size: rust_decimal::Decimal,
    pub filled_qty: rust_decimal::Decimal,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Error)]
pub enum StateError {
    #[error("Invalid transition from {0} to {1}")]
    InvalidTransition(OrderState, OrderState),
}

pub struct OrderStateMachine;

impl OrderStateMachine {
    pub fn transition(current: OrderState, next: OrderState) -> Result<OrderState, StateError> {
        match (current, next) {
            // Initial
            (OrderState::New, OrderState::PendingNew) => Ok(next),
            (OrderState::New, OrderState::Rejected) => Ok(next), // Validation fail
            (OrderState::New, OrderState::Expired) => Ok(next),

            // PendingNew
            (OrderState::PendingNew, OrderState::Open) => Ok(next),
            (OrderState::PendingNew, OrderState::Rejected) => Ok(next),
            (OrderState::PendingNew, OrderState::Filled) => Ok(next), // IOC/Market potential immediate fill

            // Open
            (OrderState::Open, OrderState::PartiallyFilled) => Ok(next),
            (OrderState::Open, OrderState::Filled) => Ok(next),
            (OrderState::Open, OrderState::PendingCancel) => Ok(next),
            (OrderState::Open, OrderState::Canceled) => Ok(next), // unsolicited cancel

            // Partial
            (OrderState::PartiallyFilled, OrderState::PartiallyFilled) => Ok(next),
            (OrderState::PartiallyFilled, OrderState::Filled) => Ok(next),
            (OrderState::PartiallyFilled, OrderState::PendingCancel) => Ok(next),
            (OrderState::PartiallyFilled, OrderState::Canceled) => Ok(next),

            // Cancelling
            (OrderState::PendingCancel, OrderState::Canceled) => Ok(next),
            (OrderState::PendingCancel, OrderState::Open) => Ok(next), // Cancel reject?

            // Terminal states (No exit)
            (OrderState::Filled, _) => Err(StateError::InvalidTransition(current, next)),
            (OrderState::Canceled, _) => Err(StateError::InvalidTransition(current, next)),
            (OrderState::Rejected, _) => Err(StateError::InvalidTransition(current, next)),
            (OrderState::Expired, _) => Err(StateError::InvalidTransition(current, next)),
            (OrderState::Failed, _) => Err(StateError::InvalidTransition(current, next)),

            _ => Err(StateError::InvalidTransition(current, next)),
        }
    }
}
