/**
 * InMemorySignalQueue - In-memory signal queue with priority ordering
 * Drop-in replacement for Redis-based SignalQueue when Redis is unavailable
 *
 * Requirements: 7.1, 7.4
 */

import { IntentSignal, PhaseId } from '../types/index.js';

/**
 * Phase priority for signal processing
 * Requirement 7.1: P3 > P2 > P1
 */
const PHASE_PRIORITY: Record<PhaseId, number> = {
  phase3: 3,
  phase2: 2,
  phase1: 1,
  manual: 4,
};

/**
 * Queued signal with metadata
 */
interface QueuedSignalEntry {
  signal: IntentSignal;
  priority: number;
  enqueuedAt: number;
  score: number;
}

/**
 * InMemorySignalQueue configuration
 */
export interface InMemorySignalQueueConfig {
  /** Idempotency key TTL in milliseconds */
  idempotencyTTL: number;
  /** Maximum queue size */
  maxQueueSize: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: InMemorySignalQueueConfig = {
  idempotencyTTL: 3600000, // 1 hour in ms
  maxQueueSize: 1000,
};

/**
 * InMemorySignalQueue manages signal queuing without Redis
 */
export class InMemorySignalQueue {
  private readonly config: InMemorySignalQueueConfig;

  /** Priority queue (sorted by score) */
  private queue: QueuedSignalEntry[] = [];

  /** Idempotency map: signalId -> expiresAt */
  private idempotencyMap: Map<string, number> = new Map();

  /** Processed signals map: signalId -> processedAt */
  private processedMap: Map<string, number> = new Map();

  /** Cleanup interval */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<InMemorySignalQueueConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the queue with cleanup interval
   */
  async connect(): Promise<void> {
    // Start cleanup interval for expired idempotency keys
    // eslint-disable-next-line functional/immutable-data
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Every minute

    console.log('✅ Signal queue initialized (in-memory mode)');
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      // eslint-disable-next-line functional/immutable-data
      this.cleanupInterval = null;
    }
    console.log('🛑 Signal queue disconnected (in-memory mode)');
  }

  /**
   * Check if "connected" (always true for in-memory)
   */
  isConnected(): boolean {
    return true;
  }

  /**
   * Clean up expired idempotency keys
   */
  private cleanupExpired(): void {
    const now = Date.now();

    for (const [signalId, expiresAt] of this.idempotencyMap.entries()) {
      if (expiresAt <= now) {
        // eslint-disable-next-line functional/immutable-data
        this.idempotencyMap.delete(signalId);
      }
    }
  }

  /**
   * Enqueue a signal with priority
   * Requirement 7.4: Maintain signal queue with timestamps and phase source
   *
   * @param signal - Intent signal to enqueue
   * @returns True if enqueued, false if duplicate or queue full
   */
  async enqueue(signal: IntentSignal): Promise<boolean> {
    // Check idempotency
    const isDuplicate = await this.isDuplicate(signal.signalId);
    if (isDuplicate) {
      return false;
    }

    // Check queue size and evict oldest if necessary
    if (this.queue.length >= this.config.maxQueueSize) {
      // Remove lowest priority (lowest score) signal
      // eslint-disable-next-line functional/immutable-data
      this.queue.sort((a, b) => a.score - b.score);
      // eslint-disable-next-line functional/immutable-data
      this.queue.shift();
    }

    // Create queue entry
    const now = Date.now();
    const priority = PHASE_PRIORITY[signal.phaseId];

    // Calculate score: priority * 1e15 + (MAX_TIMESTAMP - timestamp)
    const maxTimestamp = 9999999999999;
    const score = priority * 1e15 + (maxTimestamp - now);

    const entry: QueuedSignalEntry = {
      signal,
      priority,
      enqueuedAt: now,
      score,
    };

    // Add to queue
    // eslint-disable-next-line functional/immutable-data
    this.queue.push(entry);

    // Sort by score (descending - highest priority first)
    // eslint-disable-next-line functional/immutable-data
    this.queue.sort((a, b) => b.score - a.score);

    // Mark signal ID as seen for idempotency
    // eslint-disable-next-line functional/immutable-data
    this.idempotencyMap.set(signal.signalId, now + this.config.idempotencyTTL);

    return true;
  }

  /**
   * Dequeue the highest priority signal
   * Requirement 7.1: Process in priority order (P3 > P2 > P1)
   *
   * @returns The highest priority signal, or null if queue is empty
   */
  async dequeue(): Promise<IntentSignal | null> {
    if (this.queue.length === 0) {
      return null;
    }

    // Remove and return highest priority (first element)
    // eslint-disable-next-line functional/immutable-data
    const entry = this.queue.shift();
    return entry ? entry.signal : null;
  }

  /**
   * Peek at the highest priority signal without removing it
   *
   * @returns The highest priority signal, or null if queue is empty
   */
  async peek(): Promise<IntentSignal | null> {
    if (this.queue.length === 0) {
      return null;
    }

    return this.queue[0].signal;
  }

  /**
   * Check if a signal ID is a duplicate
   * Requirement 7.4: Implement idempotency check using signal IDs
   *
   * @param signalId - Signal ID to check
   * @returns True if duplicate, false otherwise
   */
  async isDuplicate(signalId: string): Promise<boolean> {
    const expiresAt = this.idempotencyMap.get(signalId);
    if (!expiresAt) {
      return false;
    }

    // Check if expired
    if (expiresAt <= Date.now()) {
      // eslint-disable-next-line functional/immutable-data
      this.idempotencyMap.delete(signalId);
      return false;
    }

    return true;
  }

  /**
   * Mark a signal as processed
   *
   * @param signalId - Signal ID to mark as processed
   */
  async markProcessed(signalId: string): Promise<void> {
    // eslint-disable-next-line functional/immutable-data
    this.processedMap.set(signalId, Date.now());

    // Extend idempotency TTL
    const expiresAt = this.idempotencyMap.get(signalId);
    if (expiresAt) {
      // eslint-disable-next-line functional/immutable-data
      this.idempotencyMap.set(signalId, Date.now() + this.config.idempotencyTTL);
    }
  }

  /**
   * Check if a signal was processed
   *
   * @param signalId - Signal ID to check
   * @returns True if processed, false otherwise
   */
  async wasProcessed(signalId: string): Promise<boolean> {
    return this.processedMap.has(signalId);
  }

  /**
   * Get the current queue size
   *
   * @returns Number of signals in queue
   */
  async size(): Promise<number> {
    return this.queue.length;
  }

  /**
   * Get all queued signals (for debugging/monitoring)
   *
   * @returns Array of queued signals with metadata
   */
  async getAll(): Promise<Array<{ signal: IntentSignal; priority: number; enqueuedAt: number }>> {
    return this.queue.map((entry) => ({
      signal: entry.signal,
      priority: entry.priority,
      enqueuedAt: entry.enqueuedAt,
    }));
  }

  /**
   * Clear the queue
   */
  async clear(): Promise<void> {
    // eslint-disable-next-line functional/immutable-data
    this.queue = [];
  }

  /**
   * Clear idempotency records
   */
  async clearIdempotency(): Promise<void> {
    // eslint-disable-next-line functional/immutable-data
    this.idempotencyMap.clear();
  }

  /**
   * Clear processed records
   */
  async clearProcessed(): Promise<void> {
    // eslint-disable-next-line functional/immutable-data
    this.processedMap.clear();
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    queueSize: number;
    processedCount: number;
    oldestSignalAge: number | null;
  }> {
    const queueSize = this.queue.length;
    const processedCount = this.processedMap.size;

    // Get oldest signal age
    // eslint-disable-next-line functional/no-let
    let oldestSignalAge: number | null = null;
    if (this.queue.length > 0) {
      // Find oldest by enqueuedAt
      const oldest = this.queue.reduce((min, entry) =>
        entry.enqueuedAt < min.enqueuedAt ? entry : min,
      );
      oldestSignalAge = Date.now() - oldest.enqueuedAt;
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
    const signals: IntentSignal[] = [];

    // eslint-disable-next-line functional/no-let
    for (let i = 0; i < limit; i++) {
      const signal = await this.dequeue();
      if (!signal) break;
      // eslint-disable-next-line functional/immutable-data
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
    return this.queue
      .filter((entry) => entry.signal.phaseId === phaseId)
      .map((entry) => entry.signal);
  }
}
