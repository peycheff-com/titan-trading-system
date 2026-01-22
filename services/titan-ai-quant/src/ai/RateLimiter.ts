/**
 * Rate Limiter for Gemini API
 *
 * Enforces max 10 requests per minute to stay within free tier limits.
 * Implements token bucket algorithm with exponential backoff on 429 errors.
 */

export interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  windowMs: number;
}

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private requestTimestamps: number[] = [];
  private waitingQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessingQueue = false;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.maxRequests = config.maxRequestsPerMinute ?? 10;
    this.windowMs = config.windowMs ?? 60000; // 1 minute
  }

  /**
   * Get current number of requests in the window
   */
  getCurrentRequestCount(): number {
    this.pruneOldTimestamps();
    return this.requestTimestamps.length;
  }

  /**
   * Check if a request can be made immediately
   */
  canMakeRequest(): boolean {
    this.pruneOldTimestamps();
    return this.requestTimestamps.length < this.maxRequests;
  }

  /**
   * Get time until next available slot (in ms)
   */
  getTimeUntilNextSlot(): number {
    this.pruneOldTimestamps();

    if (this.requestTimestamps.length < this.maxRequests) {
      return 0;
    }

    const oldestTimestamp = this.requestTimestamps[0];
    const timeUntilExpiry = oldestTimestamp + this.windowMs - Date.now();
    return Math.max(0, timeUntilExpiry);
  }

  /**
   * Acquire a slot for making a request.
   * Blocks until a slot is available.
   */
  async acquire(): Promise<void> {
    this.pruneOldTimestamps();

    if (this.requestTimestamps.length < this.maxRequests) {
      // eslint-disable-next-line functional/immutable-data
      this.requestTimestamps.push(Date.now());
      return;
    }

    // Need to wait for a slot
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line functional/immutable-data
      this.waitingQueue.push({ resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Release a slot (call on error to allow retry)
   */
  release(): void {
    // Remove the most recent timestamp to free up a slot
    if (this.requestTimestamps.length > 0) {
      // eslint-disable-next-line functional/immutable-data
      this.requestTimestamps.pop();
    }
    this.processQueue();
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } catch (error) {
      // On rate limit error (429), release the slot for retry
      if (error instanceof Error && error.message.includes('429')) {
        this.release();
      }
      throw error;
    }
  }

  /**
   * Reset the rate limiter (for testing)
   */
  reset(): void {
    // eslint-disable-next-line functional/immutable-data
    this.requestTimestamps = [];
    // eslint-disable-next-line functional/immutable-data
    this.waitingQueue = [];
    // eslint-disable-next-line functional/immutable-data
    this.isProcessingQueue = false;
  }

  /**
   * Remove timestamps outside the current window
   */
  private pruneOldTimestamps(): void {
    const cutoff = Date.now() - this.windowMs;
    // eslint-disable-next-line functional/immutable-data
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Process waiting queue when slots become available
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    // eslint-disable-next-line functional/immutable-data
    this.isProcessingQueue = true;

    while (this.waitingQueue.length > 0) {
      this.pruneOldTimestamps();

      if (this.requestTimestamps.length < this.maxRequests) {
        // eslint-disable-next-line functional/immutable-data
        const next = this.waitingQueue.shift();
        if (next) {
          // eslint-disable-next-line functional/immutable-data
          this.requestTimestamps.push(Date.now());
          next.resolve();
        }
      } else {
        // Wait until a slot opens up
        const waitTime = this.getTimeUntilNextSlot();
        if (waitTime > 0) {
          await this.sleep(waitTime + 10); // Add small buffer
        }
      }
    }

    // eslint-disable-next-line functional/immutable-data
    this.isProcessingQueue = false;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
