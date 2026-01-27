use crate::risk_policy::RiskState;

use std::collections::VecDeque;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

pub struct RiskStateManager {
    current_state: RiskState,
    consecutive_errors: u32,
    drift_history: VecDeque<i64>, // Timestamps of drift events
    max_drift_events_window: usize,
    error_threshold: u32,
    drift_threshold: usize,
}

impl Default for RiskStateManager {
    fn default() -> Self {
        Self::new()
    }
}

impl RiskStateManager {
    pub fn new() -> Self {
        Self {
            current_state: RiskState::Normal,
            consecutive_errors: 0,
            drift_history: VecDeque::new(),
            max_drift_events_window: 10,
            error_threshold: 3,
            drift_threshold: 5,
        }
    }

    pub fn get_state(&self) -> &RiskState {
        &self.current_state
    }

    pub fn report_error(&mut self) -> Option<RiskState> {
        self.consecutive_errors += 1;
        self.check_transitions()
    }

    pub fn report_success(&mut self) {
        if self.consecutive_errors > 0 {
            self.consecutive_errors = 0;
            // Potentially heal state if automated recovery is enabled?
            // For now, manual intervention or time decay might be better for Emergency/Defensive.
            // But we can downgrade Cautious -> Normal.
            if self.current_state == RiskState::Cautious {
                self.current_state = RiskState::Normal;
                info!("RiskState healed to Normal");
            }
        }
    }

    pub fn report_drift(&mut self) -> Option<RiskState> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        self.drift_history.push_back(now);

        // Prune old events (e.g., older than 1 minute?)
        // Placeholder pruning logic or fixed size buffer
        if self.drift_history.len() > self.max_drift_events_window {
            self.drift_history.pop_front();
        }

        self.check_transitions()
    }

    fn check_transitions(&mut self) -> Option<RiskState> {
        let old_state = self.current_state;

        // 1. Check Emergency (Logic Errors)
        if self.consecutive_errors >= self.error_threshold {
            self.current_state = RiskState::Emergency;
        }
        // 2. Check Defensive (Drift Storm)
        else if self.drift_history.len() >= self.drift_threshold {
            // Only escalate, don't de-escalate if we are already Emergency
            if self.current_state != RiskState::Emergency {
                self.current_state = RiskState::Defensive;
            }
        }

        if self.current_state != old_state {
            warn!(
                "RISK STATE TRANSITION: {:?} -> {:?}",
                old_state, self.current_state
            );
            Some(self.current_state)
        } else {
            None
        }
    }
}
