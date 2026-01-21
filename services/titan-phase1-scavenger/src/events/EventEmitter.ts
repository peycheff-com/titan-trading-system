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

export type EventType =
  | 'TRAP_MAP_UPDATED'
  | 'TRAP_SPRUNG'
  | 'EXECUTION_COMPLETE'
  | 'RESOURCE_WARNING'
  | 'ERROR'
  | 'IPC_CONNECTED'
  | 'IPC_DISCONNECTED'
  | 'IPC_RECONNECTING'
  | 'IPC_ERROR'
  | 'IPC_MAX_RECONNECT_ATTEMPTS'
  | 'IPC_CONNECTION_FAILED'
  | 'TRAP_ABORTED'
  | 'IPC_EXECUTION_FAILED'
  | 'IPC_FORCE_RECONNECT_SUCCESS'
  | 'IPC_FORCE_RECONNECT_FAILED'
  | 'CONFIG_UPDATED_IPC'
  | 'SYMBOL_BLACKLISTED';

export type EventHandler = (data: any) => void;

export class EventEmitter {
  private listeners: Map<EventType, EventHandler[]> = new Map();

  /**
   * Register an event listener
   */
  on(event: EventType, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)!.push(handler);
  }

  /**
   * Unregister an event listener
   */
  off(event: EventType, handler: EventHandler): void {
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
  emit(event: EventType, data?: any): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(`❌ Event handler error (${event}):`, error);
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
