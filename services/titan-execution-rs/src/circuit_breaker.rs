use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tracing::{info, warn};

/// Global system halt state.
/// When true, the system is in HALT mode and should reject orders.
#[derive(Clone, Debug)]
pub struct GlobalHalt {
    is_halted: Arc<AtomicBool>,
}

impl GlobalHalt {
    pub fn new() -> Self {
        // Default to NOT halted (false)
        Self {
            is_halted: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Check if the system is currently halted.
    pub fn is_halted(&self) -> bool {
        self.is_halted.load(Ordering::SeqCst)
    }

    /// Set the halt state.
    pub fn set_halt(&self, active: bool, reason: &str) {
        let prev = self.is_halted.swap(active, Ordering::SeqCst);
        if prev != active {
            if active {
                warn!("🚨 SYSTEM HALT ACTIVATED: {}", reason);
            } else {
                info!("✅ SYSTEM HALT LIFTED: {}", reason);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_halt_logic() {
        let breaker = GlobalHalt::new();
        assert!(!breaker.is_halted(), "Should default to false");

        breaker.set_halt(true, "Test Reason");
        assert!(breaker.is_halted(), "Should be halted");

        breaker.set_halt(false, "Test Resume");
        assert!(!breaker.is_halted(), "Should be resumed");
    }
}
