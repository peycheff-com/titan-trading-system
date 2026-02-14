//! High-Performance Optimization Module
//!
//! Provides low-latency optimizations for the execution engine:
//! - CPU core affinity/pinning for hot paths
//! - Lock-free command queues
//! - Batched processing utilities
//!
//! Phase 4 implementation - January 2026

use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};
use crossbeam_queue::SegQueue;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tracing::{info, warn};

// ============================================================================
// CPU Affinity Management
// ============================================================================

/// Configuration for CPU core pinning
#[derive(Debug, Clone, Default)]
pub struct CoreAffinityConfig {
    /// Pin the main NATS consumer to this core
    pub nats_consumer_core: Option<usize>,
    /// Pin order execution to this core
    pub order_executor_core: Option<usize>,
    /// Pin market data processing to this core
    pub market_data_core: Option<usize>,
    /// Enable NUMA-aware allocation (future)
    pub numa_aware: bool,
}

impl CoreAffinityConfig {
    /// Production configuration for DigitalOcean GPU Droplet (8 cores typical)
    /// Core 0: System/OS
    /// Core 1: NATS consumer (hot path)
    /// Core 2: Order executor
    /// Core 3: Market data
    /// Cores 4-7: Tokio worker pool
    pub fn production() -> Self {
        Self {
            nats_consumer_core: Some(1),
            order_executor_core: Some(2),
            market_data_core: Some(3),
            numa_aware: false,
        }
    }
}

/// Pin the current thread to a specific CPU core
pub fn pin_to_core(core_id: usize) -> Result<(), String> {
    let core_ids = core_affinity::get_core_ids().ok_or("Failed to get core IDs")?;

    if core_id >= core_ids.len() {
        return Err(format!(
            "Core {} not available (system has {} cores)",
            core_id,
            core_ids.len()
        ));
    }

    let success = core_affinity::set_for_current(core_ids[core_id]);
    if success {
        info!("Pinned thread to core {}", core_id);
        Ok(())
    } else {
        Err(format!("Failed to pin to core {}", core_id))
    }
}

/// Get the number of available CPU cores
pub fn available_cores() -> usize {
    core_affinity::get_core_ids()
        .map(|ids| ids.len())
        .unwrap_or(1)
}

// ============================================================================
// Lock-Free Command Queue
// ============================================================================

/// A command to be processed by the execution engine
#[derive(Debug, Clone)]
pub struct ExecutionCommand {
    pub id: u64,
    pub command_type: CommandType,
    pub payload: Vec<u8>,
    pub timestamp_ns: u64,
}

#[derive(Debug, Clone, Copy)]
pub enum CommandType {
    PlaceOrder,
    CancelOrder,
    ModifyOrder,
    Halt,
    SyncRequest,
}

/// High-performance lock-free command queue
pub struct CommandQueue {
    /// Lock-free queue for commands
    queue: Arc<SegQueue<ExecutionCommand>>,
    /// Counter for queue depth monitoring
    depth: AtomicU64,
    /// High-water mark for queue depth
    high_water_mark: AtomicU64,
    /// Flag indicating queue is being drained
    draining: AtomicBool,
}

impl CommandQueue {
    pub fn new() -> Self {
        Self {
            queue: Arc::new(SegQueue::new()),
            depth: AtomicU64::new(0),
            high_water_mark: AtomicU64::new(0),
            draining: AtomicBool::new(false),
        }
    }

    /// Push a command to the queue (lock-free)
    pub fn push(&self, cmd: ExecutionCommand) {
        self.queue.push(cmd);
        let new_depth = self.depth.fetch_add(1, Ordering::Relaxed) + 1;

        // Update high water mark if needed
        let mut current_hwm = self.high_water_mark.load(Ordering::Relaxed);
        while new_depth > current_hwm {
            match self.high_water_mark.compare_exchange_weak(
                current_hwm,
                new_depth,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(x) => current_hwm = x,
            }
        }
    }

    /// Pop a command from the queue (lock-free)
    pub fn pop(&self) -> Option<ExecutionCommand> {
        self.queue.pop().inspect(|_| {
            self.depth.fetch_sub(1, Ordering::Relaxed);
        })
    }

    /// Try to pop up to `max` commands in a batch
    pub fn pop_batch(&self, max: usize) -> Vec<ExecutionCommand> {
        let mut batch = Vec::with_capacity(max);
        for _ in 0..max {
            match self.pop() {
                Some(cmd) => batch.push(cmd),
                None => break,
            }
        }
        batch
    }

    /// Current queue depth
    pub fn depth(&self) -> u64 {
        self.depth.load(Ordering::Relaxed)
    }

    /// High water mark (maximum depth seen)
    pub fn high_water_mark(&self) -> u64 {
        self.high_water_mark.load(Ordering::Relaxed)
    }

    /// Check if queue is empty
    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    /// Signal that queue is being drained (for shutdown)
    pub fn start_drain(&self) {
        self.draining.store(true, Ordering::SeqCst);
    }

    /// Check if queue is draining
    pub fn is_draining(&self) -> bool {
        self.draining.load(Ordering::SeqCst)
    }
}

impl Default for CommandQueue {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Bounded Channel for Backpressure
// ============================================================================

/// Creates a bounded channel with backpressure support
pub fn bounded_channel<T>(capacity: usize) -> (BoundedSender<T>, BoundedReceiver<T>) {
    let (tx, rx) = bounded(capacity);
    (
        BoundedSender {
            inner: tx,
            drops: AtomicU64::new(0),
        },
        BoundedReceiver { inner: rx },
    )
}

pub struct BoundedSender<T> {
    inner: Sender<T>,
    drops: AtomicU64,
}

impl<T> BoundedSender<T> {
    /// Try to send, dropping if channel is full
    pub fn try_send_or_drop(&self, value: T) -> bool {
        match self.inner.try_send(value) {
            Ok(()) => true,
            Err(TrySendError::Full(_)) => {
                self.drops.fetch_add(1, Ordering::Relaxed);
                warn!("Channel full, dropping message");
                false
            }
            Err(TrySendError::Disconnected(_)) => {
                warn!("Channel disconnected");
                false
            }
        }
    }

    /// Number of dropped messages due to backpressure
    pub fn drop_count(&self) -> u64 {
        self.drops.load(Ordering::Relaxed)
    }

    /// Blocking send
    pub fn send(&self, value: T) -> Result<(), crossbeam_channel::SendError<T>> {
        self.inner.send(value)
    }
}

impl<T> Clone for BoundedSender<T> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            drops: AtomicU64::new(0),
        }
    }
}

pub struct BoundedReceiver<T> {
    inner: Receiver<T>,
}

impl<T> BoundedReceiver<T> {
    pub fn recv(&self) -> Result<T, crossbeam_channel::RecvError> {
        self.inner.recv()
    }

    pub fn try_recv(&self) -> Result<T, crossbeam_channel::TryRecvError> {
        self.inner.try_recv()
    }

    /// Receive up to `max` items without blocking
    pub fn recv_batch(&self, max: usize) -> Vec<T> {
        let mut batch = Vec::with_capacity(max);
        for _ in 0..max {
            match self.try_recv() {
                Ok(v) => batch.push(v),
                Err(_) => break,
            }
        }
        batch
    }
}

// ============================================================================
// Latency Tracking
// ============================================================================

/// Lightweight latency histogram (lock-free)
pub struct LatencyTracker {
    /// Buckets: 0-10μs, 10-50μs, 50-100μs, 100-500μs, 500-1000μs, >1000μs
    buckets: [AtomicU64; 6],
    total_samples: AtomicU64,
    total_latency_ns: AtomicU64,
    min_latency_ns: AtomicU64,
    max_latency_ns: AtomicU64,
}

impl LatencyTracker {
    pub fn new() -> Self {
        Self {
            buckets: Default::default(),
            total_samples: AtomicU64::new(0),
            total_latency_ns: AtomicU64::new(0),
            min_latency_ns: AtomicU64::new(u64::MAX),
            max_latency_ns: AtomicU64::new(0),
        }
    }

    /// Record a latency sample in nanoseconds
    pub fn record(&self, latency_ns: u64) {
        // Bucket selection
        let bucket = match latency_ns {
            0..=10_000 => 0,          // 0-10μs
            10_001..=50_000 => 1,     // 10-50μs
            50_001..=100_000 => 2,    // 50-100μs
            100_001..=500_000 => 3,   // 100-500μs
            500_001..=1_000_000 => 4, // 500-1000μs
            _ => 5,                   // >1ms
        };

        self.buckets[bucket].fetch_add(1, Ordering::Relaxed);
        self.total_samples.fetch_add(1, Ordering::Relaxed);
        self.total_latency_ns
            .fetch_add(latency_ns, Ordering::Relaxed);

        // Update min
        let mut current_min = self.min_latency_ns.load(Ordering::Relaxed);
        while latency_ns < current_min {
            match self.min_latency_ns.compare_exchange_weak(
                current_min,
                latency_ns,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(x) => current_min = x,
            }
        }

        // Update max
        let mut current_max = self.max_latency_ns.load(Ordering::Relaxed);
        while latency_ns > current_max {
            match self.max_latency_ns.compare_exchange_weak(
                current_max,
                latency_ns,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(x) => current_max = x,
            }
        }
    }

    /// Record a latency sample in microseconds
    pub fn record_us(&self, latency_us: u64) {
        self.record(latency_us * 1000);
    }

    /// Get average latency in nanoseconds
    pub fn avg_ns(&self) -> u64 {
        let total = self.total_latency_ns.load(Ordering::Relaxed);
        let samples = self.total_samples.load(Ordering::Relaxed);
        if samples == 0 {
            0
        } else {
            total / samples
        }
    }

    /// Get p99 bucket (rough approximation)
    pub fn p99_bucket_label(&self) -> &'static str {
        let total = self.total_samples.load(Ordering::Relaxed);
        if total == 0 {
            return "N/A";
        }

        let p99_target = (total as f64 * 0.99) as u64;
        let mut cumulative = 0u64;

        for (i, bucket) in self.buckets.iter().enumerate() {
            cumulative += bucket.load(Ordering::Relaxed);
            if cumulative >= p99_target {
                return match i {
                    0 => "<10μs",
                    1 => "10-50μs",
                    2 => "50-100μs",
                    3 => "100-500μs",
                    4 => "500-1000μs",
                    _ => ">1ms",
                };
            }
        }

        ">1ms"
    }

    /// Summary for logging
    pub fn summary(&self) -> String {
        let samples = self.total_samples.load(Ordering::Relaxed);
        let avg = self.avg_ns();
        let min = self.min_latency_ns.load(Ordering::Relaxed);
        let max = self.max_latency_ns.load(Ordering::Relaxed);

        format!(
            "samples={} avg={}μs min={}μs max={}μs p99={}",
            samples,
            avg / 1000,
            if min == u64::MAX { 0 } else { min / 1000 },
            max / 1000,
            self.p99_bucket_label()
        )
    }
}

impl Default for LatencyTracker {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_queue_basic_ops() {
        let queue = CommandQueue::new();

        assert!(queue.is_empty());
        assert_eq!(queue.depth(), 0);

        queue.push(ExecutionCommand {
            id: 1,
            command_type: CommandType::PlaceOrder,
            payload: vec![1, 2, 3],
            timestamp_ns: 1000,
        });

        assert!(!queue.is_empty());
        assert_eq!(queue.depth(), 1);

        let cmd = queue.pop().unwrap();
        assert_eq!(cmd.id, 1);
        assert!(queue.is_empty());
    }

    #[test]
    fn test_command_queue_batch_pop() {
        let queue = CommandQueue::new();

        for i in 0..10 {
            queue.push(ExecutionCommand {
                id: i,
                command_type: CommandType::PlaceOrder,
                payload: vec![],
                timestamp_ns: i * 100,
            });
        }

        let batch = queue.pop_batch(5);
        assert_eq!(batch.len(), 5);
        assert_eq!(queue.depth(), 5);
    }

    #[test]
    fn test_latency_tracker() {
        let tracker = LatencyTracker::new();

        // Record some samples
        tracker.record(5_000); // 5μs
        tracker.record(25_000); // 25μs
        tracker.record(75_000); // 75μs

        assert_eq!(tracker.total_samples.load(Ordering::Relaxed), 3);
        assert!(tracker.avg_ns() > 0);
    }

    #[test]
    fn test_bounded_channel() {
        let (tx, rx) = bounded_channel::<u32>(2);

        assert!(tx.try_send_or_drop(1));
        assert!(tx.try_send_or_drop(2));
        assert!(!tx.try_send_or_drop(3)); // Should drop

        assert_eq!(tx.drop_count(), 1);
        assert_eq!(rx.recv().unwrap(), 1);
    }

    #[test]
    fn test_available_cores() {
        let cores = available_cores();
        assert!(cores >= 1);
    }
}
