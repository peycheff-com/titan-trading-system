/**
 * Console Client for Titan Scavenger
 *
 * Pushes real-time updates to the Titan Console via HTTP POST.
 *
 * Requirements: 12.1-12.4
 * - Push trap_map_updated messages
 * - Push sensor_status_updated messages
 * - Push trap_sprung events
 * - Push execution_complete events
 */
import fetch from 'node-fetch';
/**
 * Console Client
 *
 * Sends real-time updates to the Titan Console.
 */
export class ConsoleClient {
    config;
    isConnected = false;
    constructor(config) {
        this.config = {
            retryAttempts: 3,
            retryDelayMs: 1000,
            ...config
        };
    }
    /**
     * Test connection to Console
     */
    async connect() {
        if (!this.config.enabled) {
            console.log('📡 Console Client disabled (set CONSOLE_URL to enable)');
            return false;
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${this.config.consoleUrl}/health`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                this.isConnected = true;
                console.log(`✅ Connected to Console at ${this.config.consoleUrl}`);
                return true;
            }
            else {
                console.warn(`⚠️  Console health check failed: ${response.status}`);
                return false;
            }
        }
        catch (error) {
            console.warn(`⚠️  Failed to connect to Console: ${error}`);
            return false;
        }
    }
    /**
     * Push trap map update to Console
     * Requirements: 12.1
     */
    async pushTrapMapUpdate(update) {
        if (!this.config.enabled)
            return;
        await this.sendEvent('trap_map_updated', update);
    }
    /**
     * Push sensor status update to Console
     * Requirements: 12.2
     */
    async pushSensorStatusUpdate(update) {
        if (!this.config.enabled)
            return;
        await this.sendEvent('sensor_status_updated', update);
    }
    /**
     * Push trap sprung event to Console
     * Requirements: 12.3
     */
    async pushTrapSprung(event) {
        if (!this.config.enabled)
            return;
        await this.sendEvent('trap_sprung', event);
    }
    /**
     * Push execution complete event to Console
     * Requirements: 12.3
     */
    async pushExecutionComplete(event) {
        if (!this.config.enabled)
            return;
        await this.sendEvent('execution_complete', event);
    }
    /**
     * Send event to Console with retry logic
     */
    async sendEvent(eventType, data) {
        let lastError = null;
        for (let attempt = 1; attempt <= (this.config.retryAttempts || 3); attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(`${this.config.consoleUrl}/api/scavenger/events`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        event_type: eventType,
                        data,
                        source: 'scavenger',
                        timestamp: Date.now()
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (response.ok) {
                    // Success
                    return;
                }
                else {
                    lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
            catch (error) {
                lastError = error;
            }
            // Retry with exponential backoff
            if (attempt < (this.config.retryAttempts || 3)) {
                const delay = (this.config.retryDelayMs || 1000) * Math.pow(2, attempt - 1);
                await this.sleep(delay);
            }
        }
        // All retries failed
        console.warn(`⚠️  Failed to send ${eventType} to Console after ${this.config.retryAttempts} attempts: ${lastError?.message}`);
    }
    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Check if connected to Console
     */
    isConnectedToConsole() {
        return this.isConnected;
    }
}
//# sourceMappingURL=ConsoleClient.js.map