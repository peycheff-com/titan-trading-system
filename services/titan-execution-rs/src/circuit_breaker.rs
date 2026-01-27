use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tracing::{info, warn};

/// Global system halt state.
/// When true, the system is in HALT mode and should reject orders.
#[derive(Clone, Debug)]
pub struct GlobalHalt {
    is_halted: Arc<AtomicBool>,
    file_path: std::path::PathBuf,
}

impl Default for GlobalHalt {
    fn default() -> Self {
        Self::new()
    }
}

impl GlobalHalt {
    pub fn new() -> Self {
        let file_path = std::path::PathBuf::from("system.halt");
        let exists = file_path.exists();

        if exists {
            warn!("⚠️ System initialized in HALTED state (system.halt file found)");
        }

        Self {
            is_halted: Arc::new(AtomicBool::new(exists)),
            file_path,
        }
    }

    /// Check if the system is currently halted.
    pub fn is_halted(&self) -> bool {
        self.is_halted.load(Ordering::SeqCst)
    }

    /// Set the halt state.
    pub fn set_halt(&self, active: bool, reason: &str) {
        let prev = self.is_halted.swap(active, Ordering::SeqCst);

        // Sync to disk
        if active {
            if let Err(e) = std::fs::write(&self.file_path, reason) {
                warn!("Failed to persist halt lockfile: {}", e);
            }
        } else if self.file_path.exists() {
            if let Err(e) = std::fs::remove_file(&self.file_path) {
                warn!("Failed to remove halt lockfile: {}", e);
            }
        }

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
        let _ = std::fs::remove_file("system.halt");
        let breaker = GlobalHalt::new();
        assert!(!breaker.is_halted(), "Should default to false");

        breaker.set_halt(true, "Test Reason");
        assert!(breaker.is_halted(), "Should be halted");

        breaker.set_halt(false, "Test Resume");
        assert!(!breaker.is_halted(), "Should be resumed");
    }
}
