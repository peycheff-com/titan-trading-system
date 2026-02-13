use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tracing::{info, warn};

/// Execution Armed State - Physical Interlock
///
/// When `armed=false` (default), the system REJECTS all place intents.
/// This is a physical interlock separate from Brain's armed state.
/// Even if Brain is armed, Execution will reject if not armed.
///
/// This prevents accidental order placement during:
/// - System startup/initialization
/// - Deployment/rollout phases
/// - Emergency scenarios
#[derive(Clone, Debug)]
pub struct ArmedState {
    is_armed: Arc<AtomicBool>,
    file_path: std::path::PathBuf,
}

impl Default for ArmedState {
    fn default() -> Self {
        Self::new()
    }
}

impl ArmedState {
    pub fn new() -> Self {
        let file_path = std::path::PathBuf::from("execution.armed");
        let exists = file_path.exists();

        if exists {
            info!("🔫 Execution initialized in ARMED state (execution.armed file found)");
        } else {
            warn!("🔒 Execution initialized DISARMED. Use ARM command to enable order placement.");
        }

        Self {
            is_armed: Arc::new(AtomicBool::new(exists)),
            file_path,
        }
    }

    /// Check if execution is currently armed and can process intents.
    pub fn is_armed(&self) -> bool {
        self.is_armed.load(Ordering::SeqCst)
    }

    /// Set the armed state. Only operators can arm the system.
    pub fn set_armed(&self, armed: bool, reason: &str) {
        let prev = self.is_armed.swap(armed, Ordering::SeqCst);

        // Sync to disk for persistence across restarts
        if armed {
            if let Err(e) = std::fs::write(&self.file_path, reason) {
                warn!("Failed to persist armed lockfile: {}", e);
            }
        } else if self.file_path.exists()
            && let Err(e) = std::fs::remove_file(&self.file_path) {
                warn!("Failed to remove armed lockfile: {}", e);
            }

        if prev != armed {
            if armed {
                info!("🔫 EXECUTION ARMED: {} - Order placement ENABLED", reason);
            } else {
                warn!(
                    "🔒 EXECUTION DISARMED: {} - Order placement DISABLED",
                    reason
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_armed_state_defaults_to_disarmed() {
        let _ = std::fs::remove_file("execution.armed");
        let state = ArmedState::new();
        assert!(!state.is_armed(), "Should default to disarmed");
    }

    #[test]
    fn test_armed_state_toggle() {
        let _ = std::fs::remove_file("execution.armed");
        let state = ArmedState::new();

        state.set_armed(true, "Test ARM");
        assert!(state.is_armed(), "Should be armed");

        state.set_armed(false, "Test DISARM");
        assert!(!state.is_armed(), "Should be disarmed");
    }
}
