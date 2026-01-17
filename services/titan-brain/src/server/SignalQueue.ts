/**
 * SignalQueue - Redis-based signal queue with priority ordering
 * Implements idempotency checks and priority-based dequeuing
 *
 * Requirements: 7.1, 7.4
 */

import { createClient, RedisClientType } from 'redis';
import { IntentSignal, PhaseId, RedisConfig } from '../types/index.js';

/**
 * Phase priority for signal processing
 * Requirement 7.1: P3 > P2 > P1
 */
const PHASE_PRIORITY: Record<PhaseId, number> = {
  phase3: 3,
  phase2: 2,
  phase1: 1,
};

/**
 * Queued signal with metadata
 */
interface QueuedSignalEntry {
  signal: IntentSignal;
  priority: number;
  enqueuedAt: number;
}

/**
 * SignalQueue configuration
 */
export interface SignalQueueConfig extends RedisConfig {
  /** Queue key prefix */
  keyPrefix: string;
  /** Idempotency key TTL in seconds */
  idempotencyTTL: number;
  /** Maximum queue size */
  maxQueueSize: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<SignalQueueConfig> = {
  keyPrefix: 'titan:brain:signals',
  idempotencyTTL: 3600, // 1 hour
  maxQueueSize: 1000,
};

/**
 * SignalQueue manages signal queuing with Redis
 */
export class SignalQueue {
  private readonly config: SignalQueueConfig;
  private client: RedisClientType | null = null;
  private connected: boolean = false;

  /** Redis key names */
  private readonly queueKey: string;
  private readonly idempotencyKey: string;
  private readonly processedKey: string;

  constructor(config: SignalQueueConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as SignalQueueConfig;
    this.queueKey = `${this.config.keyPrefix}:queue`;
    this.idempotencyKey = `${this.config.keyPrefix}:idempotency`;
    this.processedKey = `${this.config.keyPrefix}:processed`;
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.client = createClient({
      url: this.config.url,
    });

    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
    });

    this.client.on('reconnecting', () => {
      console.log('Redis client reconnecting...');
    });

    await this.client.connect();
    this.connected = true;
    console.log('✅ Signal queue connected to Redis');
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
      this.client = null;
      console.log('🛑 Signal queue disconnected from Redis');
    }
  }

  /**
   * Check if connected to Redis
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Enqueue a signal with priority
   * Requirement 7.4: Maintain signal queue with timestamps and phase source
   *
   * @param signal - Intent signal to enqueue
   * @returns True if enqueued, false if duplicate or queue full
   */
  async enqueue(signal: IntentSignal): Promise<boolean> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    // Check idempotency
    const isDuplicate = await this.isDuplicate(signal.signalId);
    if (isDuplicate) {
      return false;
    }

    // Check queue size
    const queueSize = await this.client.zCard(this.queueKey);
    if (queueSize >= this.config.maxQueueSize) {
      // Remove oldest (lowest priority) signal
      await this.client.zPopMin(this.queueKey);
    }

    // Create queue entry
    const entry: QueuedSignalEntry = {
      signal,
      priority: PHASE_PRIORITY[signal.phaseId],
      enqueuedAt: Date.now(),
    };

    // Calculate score: priority * 1e15 + (MAX_TIMESTAMP - timestamp)
    // This ensures higher priority signals come first, and within same priority, older signals come first
    const maxTimestamp = 9999999999999; // Max 13-digit timestamp
    const score = entry.priority * 1e15 + (maxTimestamp - entry.enqueuedAt);

    // Add to sorted set
    await this.client.zAdd(this.queueKey, {
      score,
      value: JSON.stringify(entry),
    });

    // Mark signal ID as seen for idempotency
    await this.client.setEx(
      `${this.idempotencyKey}:${signal.signalId}`,
      this.config.idempotencyTTL,
      '1',
    );

    return true;
  }

  /**
   * Dequeue the highest priority signal
   * Requirement 7.1: Process in priority order (P3 > P2 > P1)
   *
   * @returns The highest priority signal, or null if queue is empty
   */
  async dequeue(): Promise<IntentSignal | null> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    // Get and remove highest score (highest priority)
    const result = await this.client.zPopMax(this.queueKey);

    if (!result) {
      return null;
    }

    try {
      const entry: QueuedSignalEntry = JSON.parse(result.value);
      return entry.signal;
    } catch (error) {
      console.error('Failed to parse queued signal:', error);
      return null;
    }
  }

  /**
   * Peek at the highest priority signal without removing it
   *
   * @returns The highest priority signal, or null if queue is empty
   */
  async peek(): Promise<IntentSignal | null> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    // Get highest score without removing
    const result = await this.client.zRange(this.queueKey, -1, -1);

    if (!result || result.length === 0) {
      return null;
    }

    try {
      const entry: QueuedSignalEntry = JSON.parse(result[0]);
      return entry.signal;
    } catch (error) {
      console.error('Failed to parse queued signal:', error);
      return null;
    }
  }

  /**
   * Check if a signal ID is a duplicate
   * Requirement 7.4: Implement idempotency check using signal IDs
   *
   * @param signalId - Signal ID to check
   * @returns True if duplicate, false otherwise
   */
  async isDuplicate(signalId: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    const exists = await this.client.exists(`${this.idempotencyKey}:${signalId}`);
    return exists === 1;
  }

  /**
   * Mark a signal as processed
   *
   * @param signalId - Signal ID to mark as processed
   */
  async markProcessed(signalId: string): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    // Add to processed set with timestamp
    await this.client.hSet(this.processedKey, signalId, Date.now().toString());

    // Extend idempotency TTL
    await this.client.expire(`${this.idempotencyKey}:${signalId}`, this.config.idempotencyTTL);
  }

  /**
   * Check if a signal was processed
   *
   * @param signalId - Signal ID to check
   * @returns True if processed, false otherwise
   */
  async wasProcessed(signalId: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    const exists = await this.client.hExists(this.processedKey, signalId);
    return exists;
  }

  /**
   * Get the current queue size
   *
   * @returns Number of signals in queue
   */
  async size(): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    return this.client.zCard(this.queueKey);
  }

  /**
   * Get all queued signals (for debugging/monitoring)
   *
   * @returns Array of queued signals with metadata
   */
  async getAll(): Promise<QueuedSignalEntry[]> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    const results = await this.client.zRange(this.queueKey, 0, -1);

    return results
      .map((value) => {
        try {
          return JSON.parse(value) as QueuedSignalEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is QueuedSignalEntry => entry !== null);
  }

  /**
   * Clear the queue
   */
  async clear(): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    await this.client.del(this.queueKey);
  }

  /**
   * Clear idempotency records
   */
  async clearIdempotency(): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    // Get all idempotency keys and delete them
    const keys = await this.client.keys(`${this.idempotencyKey}:*`);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  /**
   * Clear processed records
   */
  async clearProcessed(): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    await this.client.del(this.processedKey);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    queueSize: number;
    processedCount: number;
    oldestSignalAge: number | null;
  }> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    const queueSize = await this.client.zCard(this.queueKey);
    const processedCount = await this.client.hLen(this.processedKey);

    // Get oldest signal age
    let oldestSignalAge: number | null = null;
    const oldest = await this.client.zRange(this.queueKey, 0, 0);
    if (oldest && oldest.length > 0) {
      try {
        const entry: QueuedSignalEntry = JSON.parse(oldest[0]);
        oldestSignalAge = Date.now() - entry.enqueuedAt;
      } catch {
        // Ignore parse errors
      }
    }

    return {
      queueSize,
      processedCount,
      oldestSignalAge,
    };
  }

  /**
   * Dequeue multiple signals up to a limit
   *
   * @param limit - Maximum number of signals to dequeue
   * @returns Array of signals
   */
  async dequeueBatch(limit: number): Promise<IntentSignal[]> {
    if (!this.client || !this.connected) {
      throw new Error('Signal queue not connected');
    }

    const signals: IntentSignal[] = [];

    for (let i = 0; i < limit; i++) {
      const signal = await this.dequeue();
      if (!signal) break;
      signals.push(signal);
    }

    return signals;
  }

  /**
   * Get signals by phase
   *
   * @param phaseId - Phase to filter by
   * @returns Array of signals for the phase
   */
  async getByPhase(phaseId: PhaseId): Promise<IntentSignal[]> {
    const all = await this.getAll();
    return all.filter((entry) => entry.signal.phaseId === phaseId).map((entry) => entry.signal);
  }
}
