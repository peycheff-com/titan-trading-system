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
export class EventEmitter {
    listeners = new Map();
    /**
     * Register an event listener
     */
    on(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(handler);
    }
    /**
     * Unregister an event listener
     */
    off(event, handler) {
        const handlers = this.listeners.get(event);
        if (!handlers)
            return;
        const index = handlers.indexOf(handler);
        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }
    /**
     * Emit an event
     */
    emit(event, data) {
        const handlers = this.listeners.get(event);
        if (!handlers)
            return;
        for (const handler of handlers) {
            try {
                handler(data);
            }
            catch (error) {
                console.error(`❌ Event handler error (${event}):`, error);
            }
        }
    }
    /**
     * Remove all listeners for an event
     */
    removeAllListeners(event) {
        if (event) {
            this.listeners.delete(event);
        }
        else {
            this.listeners.clear();
        }
    }
}
//# sourceMappingURL=EventEmitter.js.map