use chrono::{DateTime, TimeZone, Utc};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// Trait for providing the current time.
/// Decouples logic from `Utc::now()` to enable deterministic replay.
pub trait TimeProvider: Send + Sync {
    fn now_millis(&self) -> i64;
    fn now(&self) -> DateTime<Utc>;
}

/// Trait for generating unique IDs.
/// Decouples logic from `Uuid::new_v4()` to enable determinism.
pub trait IdProvider: Send + Sync {
    fn new_id(&self) -> String;
}

/// Context holding the providers.
/// Passed down to engines and state machines.
#[derive(Clone)]
pub struct ExecutionContext {
    pub time: Arc<dyn TimeProvider>,
    pub id: Arc<dyn IdProvider>,
}

impl ExecutionContext {
    pub fn new_system() -> Self {
        Self {
            time: Arc::new(SystemTimeProvider),
            id: Arc::new(RandomIdProvider),
        }
    }

    pub fn new_simulated(start_time_ms: i64) -> Self {
        Self {
            time: Arc::new(SimulatedTimeProvider::new(start_time_ms)),
            id: Arc::new(DeterministicIdProvider::new()),
        }
    }
}

// --- Live Implementations ---

pub struct SystemTimeProvider;

impl TimeProvider for SystemTimeProvider {
    fn now_millis(&self) -> i64 {
        Utc::now().timestamp_millis()
    }

    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

pub struct RandomIdProvider;

impl IdProvider for RandomIdProvider {
    fn new_id(&self) -> String {
        Uuid::new_v4().to_string()
    }
}

// --- Simulated Implementations ---

pub struct SimulatedTimeProvider {
    current_time_ms: AtomicI64,
}

impl SimulatedTimeProvider {
    pub fn new(start_time_ms: i64) -> Self {
        Self {
            current_time_ms: AtomicI64::new(start_time_ms),
        }
    }

    pub fn set_time(&self, time_ms: i64) {
        self.current_time_ms.store(time_ms, Ordering::SeqCst);
    }

    pub fn advance(&self, duration_ms: i64) {
        self.current_time_ms.fetch_add(duration_ms, Ordering::SeqCst);
    }
}

impl TimeProvider for SimulatedTimeProvider {
    fn now_millis(&self) -> i64 {
        self.current_time_ms.load(Ordering::SeqCst)
    }

    fn now(&self) -> DateTime<Utc> {
        let ms = self.now_millis();
        Utc.timestamp_millis_opt(ms).unwrap()
    }
}

pub struct DeterministicIdProvider {
    counter: Mutex<u64>,
}

impl DeterministicIdProvider {
    pub fn new() -> Self {
        Self {
            counter: Mutex::new(0),
        }
    }
}

impl IdProvider for DeterministicIdProvider {
    fn new_id(&self) -> String {
        let mut num = self.counter.lock().unwrap();
        *num += 1;
        // Generate a deterministic UUID-like string or just a sequence
        // For Replay, we might want a recognizable prefix
        format!("00000000-0000-0000-0000-{:012x}", *num)
    }
}
