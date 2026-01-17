
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time::sleep;

/// Token Bucket Rate Limiter
/// Thread-safe implementation of a token bucket algorithm.
#[derive(Clone)]
pub struct TokenBucket {
    capacity: usize,
    tokens: Arc<Mutex<f64>>,
    fill_rate_per_sec: f64,
    last_update: Arc<Mutex<Instant>>,
}

impl TokenBucket {
    pub fn new(capacity: usize, fill_rate_per_sec: f64) -> Self {
        Self {
            capacity,
            tokens: Arc::new(Mutex::new(capacity as f64)),
            fill_rate_per_sec,
            last_update: Arc::new(Mutex::new(Instant::now())),
        }
    }

    /// Try to acquire a token. Returns true if successful.
    pub fn try_acquire(&self, amount: usize) -> bool {
        let mut tokens = self.tokens.lock().unwrap();
        let mut last = self.last_update.lock().unwrap();
        
        self.refill(&mut tokens, &mut last);

        if *tokens >= amount as f64 {
            *tokens -= amount as f64;
            true
        } else {
            false
        }
    }

    /// Acquire tokens, waiting if necessary.
    pub async fn acquire(&self, amount: usize) {
        loop {
            if self.try_acquire(amount) {
                return;
            }
            // Wait a small amount of time before retrying
            // Calculate time to wait based on missing tokens could be better, but simple poll is robust
            sleep(Duration::from_millis(50)).await;
        }
    }

    fn refill(&self, tokens: &mut f64, last_update: &mut Instant) {
        let now = Instant::now();
        let elapsed = now.duration_since(*last_update).as_secs_f64();
        
        let new_tokens = elapsed * self.fill_rate_per_sec;
        if new_tokens > 0.0 {
            *tokens = (*tokens + new_tokens).min(self.capacity as f64);
            *last_update = now;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_bucket_capacity() {
        let bucket = TokenBucket::new(10, 1.0);
        assert!(bucket.try_acquire(10));
        assert!(!bucket.try_acquire(1));
    }

    #[test]
    fn test_token_bucket_refill() {
        let bucket = TokenBucket::new(10, 10.0); // 10 tokens per second
        assert!(bucket.try_acquire(10));
        assert!(!bucket.try_acquire(1));
        
        // Sleep 110ms -> should gain ~1.1 tokens -> 1 token available
        std::thread::sleep(Duration::from_millis(110)); 
        assert!(bucket.try_acquire(1));
    }

    #[tokio::test]
    async fn test_token_bucket_async_acquire() {
        let bucket = TokenBucket::new(1, 10.0); // 10 tokens/sec, cap 1
        assert!(bucket.try_acquire(1));
        
        let start = Instant::now();
        bucket.acquire(1).await; // Should wait ~100ms
        let elapsed = start.elapsed();
        
        assert!(elapsed.as_millis() >= 90);
    }
}
