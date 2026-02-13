import { Logger } from '@titan/shared';
/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
/**
 * EventEmitter
 *
 * Simple event emitter for system events.
 *
 * Events:
 * - TRAP_MAP_UPDATED: When trap map is recalculated
 * - TRAP_SPRUNG: When a tripwire is activated
 * - EXECUTION_COMPLETE: When an order is filled
 * - RESOURCE_WARNING: When memory usage exceeds threshold
 * - ERROR: When an error occurs
 *
 * Requirement 7.5: Emit TRAP_MAP_UPDATED event
 * Requirement 1.7: Emit RESOURCE_WARNING event
 */

const logger = Logger.getInstance('scavenger:EventEmitter');

export interface EventPayloads {
  TRAP_MAP_UPDATED: {
    symbolCount: number;
    duration: number;
    timestamp: number;
  };
  TRAP_SPRUNG: {
    symbol: string;
    price: number;
    trapType: string;
    direction: 'LONG' | 'SHORT';
    tradeCount: number;
    microCVD: number;
    elapsed: number;
  };
  EXECUTION_COMPLETE: {
    signal_id: string;
    symbol: string;
    trapType: string;
    fillPrice: number;
    routedTo: string;
  };
  RESOURCE_WARNING: {
    memoryUsageMB: number;
    heapTotalMB: number;
    rssMB: number;
    threshold: number;
    timestamp: number;
  };
  ERROR: { message: string; error?: Error; context?: string };
  IPC_CONNECTED: void;
  IPC_DISCONNECTED: void;
  IPC_RECONNECTING: void;
  IPC_ERROR: { error: Error };
  IPC_MAX_RECONNECT_ATTEMPTS: void;
  IPC_CONNECTION_FAILED: { error: Error };
  TRAP_ABORTED: {
    signal_id?: string;
    symbol: string;
    reason: string;
    timestamp?: number;
  };
  IPC_EXECUTION_FAILED: { error: Error; signalId?: string };
  IPC_FORCE_RECONNECT_SUCCESS: void;
  IPC_FORCE_RECONNECT_FAILED: { error: Error };
  CONFIG_UPDATED_IPC: { config: Record<string, unknown> };
  SYMBOL_BLACKLISTED: { symbol: string; reason: string; durationMs: number };
}

export type EventType = keyof EventPayloads;

export type EventHandler<K extends EventType> = (data: EventPayloads[K]) => void;

export class EventEmitter {
   
  private listeners: Map<EventType, EventHandler<any>[]> = new Map();

  /**
   * Register an event listener
   */
  on<K extends EventType>(event: K, handler: EventHandler<K>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)!.push(handler);
  }

  /**
   * Unregister an event listener
   */
  off<K extends EventType>(event: K, handler: EventHandler<K>): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit an event
   */
  emit<K extends EventType>(event: K, data: EventPayloads[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        logger.error(`❌ Event handler error (${event}):`, error);
      }
    }
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: EventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
