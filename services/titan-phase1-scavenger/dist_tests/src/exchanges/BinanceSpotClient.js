/**
 * Binance Spot Client - Signal Validator
 *
 * Purpose: Monitor Binance Spot WebSocket for tripwire hits with volume validation.
 * This client acts as the "Detection Layer" in the Predestination Engine.
 *
 * Key Features:
 * - Real-time AggTrades WebSocket subscription
 * - Automatic reconnection with retry logic (3 retries, 2s delay)
 * - Callback system for trade events
 * - REST API for spot price queries
 *
 * Requirements: 3.1-3.7 (Detection Layer)
 */
import WebSocket from "ws";
/**
 * Binance Spot Client for signal validation
 */
export class BinanceSpotClient {
    ws = null;
    callbacks = new Map();
    reconnectAttempts = 0;
    maxReconnectAttempts = 3;
    reconnectDelay = 1000; // Start at 1 second
    maxReconnectDelay = 30000; // Cap at 30 seconds
    reconnectDecay = 1.5; // Exponential backoff factor
    subscribedSymbols = [];
    isReconnecting = false;
    pingInterval;
    WS_URL;
    REST_URL;
    /**
     * Create a new Binance Spot Client
     *
     * @param wsUrl - Optional custom WebSocket URL (for testing)
     * @param restUrl - Optional custom REST API URL (for testing)
     */
    constructor(wsUrl = "wss://stream.binance.com:9443/ws", restUrl = "https://api.binance.com") {
        this.WS_URL = wsUrl;
        this.REST_URL = restUrl;
    }
    /**
     * Subscribe to AggTrades WebSocket for multiple symbols
     *
     * @param symbols - Array of symbols to subscribe to (e.g., ['BTCUSDT', 'ETHUSDT'])
     *
     * Requirements:
     * - 3.1: Subscribe to Binance Spot AggTrades WebSocket for all symbols in Trap Map
     * - 3.7: Attempt reconnection with maximum 3 retries and 2-second delay between attempts
     */
    async subscribeAggTrades(symbols) {
        // Store symbols for reconnection
        this.subscribedSymbols = symbols;
        // Close existing connection if any
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        // Reset reconnect attempts on new subscription
        this.reconnectAttempts = 0;
        // Connect to Binance Spot WebSocket
        this.ws = new WebSocket(this.WS_URL);
        this.ws.on("open", () => {
            console.log(`✅ Binance WebSocket connected`);
            this.reconnectAttempts = 0; // Reset on successful connection
            this.reconnectDelay = 1000; // Reset delay on successful connection
            this.isReconnecting = false;
            // Start ping/pong heartbeat to detect dead connections
            this.pingInterval = setInterval(() => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.ping();
                }
            }, 30000); // Ping every 30 seconds
            // Subscribe to aggregate trades for all symbols
            const subscribeMsg = {
                method: "SUBSCRIBE",
                params: symbols.map((s) => `${s.toLowerCase()}@aggTrade`),
                id: 1,
            };
            this.ws.send(JSON.stringify(subscribeMsg));
            console.log(`✅ Subscribed to Binance Spot: ${symbols.length} symbols`);
        });
        this.ws.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                // Handle aggregate trade events
                if (msg.e === "aggTrade") {
                    const trade = {
                        symbol: msg.s,
                        price: parseFloat(msg.p),
                        qty: parseFloat(msg.q),
                        time: msg.T, // CRITICAL: Use exchange timestamp, not Date.now()
                        isBuyerMaker: msg.m,
                    };
                    // Trigger callback for this symbol
                    const callback = this.callbacks.get(msg.s);
                    if (callback) {
                        callback([trade]);
                    }
                }
            }
            catch (error) {
                console.error("❌ Error parsing Binance message:", error);
            }
        });
        this.ws.on("pong", () => {
            // Connection is alive
            console.log("🏓 Binance pong received");
        });
        this.ws.on("error", (error) => {
            console.error("❌ Binance WebSocket error:", error);
        });
        this.ws.on("close", () => {
            console.info("ℹ️ Binance WebSocket closed (auto-reconnecting...)");
            // Clear ping interval
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = undefined;
            }
            // Attempt reconnection if not already reconnecting
            if (!this.isReconnecting &&
                this.reconnectAttempts < this.maxReconnectAttempts) {
                this.isReconnecting = true;
                this.reconnectAttempts++;
                console.warn(`⚠️ Reconnecting in ${this.reconnectDelay / 1000}s... ` +
                    `(Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                setTimeout(() => {
                    this.subscribeAggTrades(this.subscribedSymbols);
                }, this.reconnectDelay);
                // Exponential backoff: increase delay for next attempt
                this.reconnectDelay = Math.min(this.reconnectDelay * this.reconnectDecay, this.maxReconnectDelay);
            }
            else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. ` +
                    `Manual intervention required.`);
            }
        });
    }
    /**
     * Register a callback for trade events on a specific symbol
     *
     * @param symbol - Symbol to listen for (e.g., 'BTCUSDT')
     * @param callback - Function to call when trades are received
     *
     * Requirements:
     * - 3.2: Check if current price is within 0.1% of any active tripwire price
     * - 3.3: Start volume accumulation counter for 100ms window
     */
    onTrade(symbol, callback) {
        this.callbacks.set(symbol, callback);
    }
    /**
     * Remove callback for a specific symbol
     *
     * @param symbol - Symbol to stop listening for
     */
    offTrade(symbol) {
        this.callbacks.delete(symbol);
    }
    /**
     * Get current spot price for a symbol via REST API
     *
     * @param symbol - Symbol to query (e.g., 'BTCUSDT')
     * @returns Current spot price
     *
     * Requirements:
     * - Used for basis arbitrage detection (Spot vs Perp price comparison)
     */
    async getSpotPrice(symbol) {
        try {
            const response = await fetch(`${this.REST_URL}/api/v3/ticker/price?symbol=${symbol}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            return parseFloat(data.price);
        }
        catch (error) {
            console.error(`❌ Failed to get spot price for ${symbol}:`, error);
            throw error;
        }
    }
    /**
     * Close the WebSocket connection
     */
    close() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = undefined;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.callbacks.clear();
        this.subscribedSymbols = [];
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay
        this.isReconnecting = false;
    }
    /**
     * Check if WebSocket is connected
     */
    isConnected() {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
    /**
     * Get connection status for monitoring
     */
    getStatus() {
        return {
            connected: this.isConnected(),
            subscribedSymbols: this.subscribedSymbols.length,
            reconnectAttempts: this.reconnectAttempts,
        };
    }
}
//# sourceMappingURL=BinanceSpotClient.js.map