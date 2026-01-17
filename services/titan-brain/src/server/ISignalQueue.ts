/**
 * ISignalQueue - Common interface for signal queue implementations
 *
 * Allows interchangeable use of Redis-based and in-memory queues.
 */

import { IntentSignal, PhaseId } from '../types/index.js';

/**
 * Common interface for signal queue implementations
 */
export interface ISignalQueue {
  /** Connect to the queue */
  connect(): Promise<void>;

  /** Disconnect from the queue */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** Enqueue a signal - returns true if successful */
  enqueue(signal: IntentSignal): Promise<boolean>;

  /** Dequeue the highest priority signal */
  dequeue(): Promise<IntentSignal | null>;

  /** Peek at the highest priority signal without removing */
  peek(): Promise<IntentSignal | null>;

  /** Check if a signal ID is a duplicate */
  isDuplicate(signalId: string): Promise<boolean>;

  /** Mark a signal as processed */
  markProcessed(signalId: string): Promise<void>;

  /** Check if a signal was processed */
  wasProcessed(signalId: string): Promise<boolean>;

  /** Get the current queue size */
  size(): Promise<number>;

  /** Clear the queue */
  clear(): Promise<void>;

  /** Get queue statistics */
  getStats(): Promise<{
    queueSize: number;
    processedCount: number;
    oldestSignalAge: number | null;
  }>;

  /** Dequeue multiple signals up to a limit */
  dequeueBatch(limit: number): Promise<IntentSignal[]>;

  /** Get signals by phase */
  getByPhase(phaseId: PhaseId): Promise<IntentSignal[]>;
}
