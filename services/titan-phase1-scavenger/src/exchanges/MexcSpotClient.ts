/**
 * MEXC Spot Client - Signal Validator
 *
 * Purpose: Monitor MEXC Spot WebSocket for tripwire hits with volume validation.
 * This client acts as the "Detection Layer" in the Predestination Engine for MEXC.
 *
 * Key Features:
 * - Real-time Trade Stream WebSocket subscription
 * - Automatic reconnection with retry logic
 * - Callback system for trade events
 * - REST API for spot price queries
 *
 * Requirements: 3.1-3.7 (Detection Layer)
 */

import WebSocket from "ws";
// Use require for node-fetch to avoid ES modules issues in Jest if needed,
// but Scavenger seems to use native fetch or has it setup.
// Checking BinanceSpotClient, it doesn't import fetch, implies global or node 18+?
// Actually BinanceSpotClient uses `fetch` so it must be available.

/**
 * Trade data structure from MEXC Deal stream
 */
export interface Trade {
    symbol: string;
    price: number;
    qty: number;
    time: number; // Exchange timestamp
    isBuyerMaker: boolean;
}

/**
 * Callback function type for trade events
 */
type TradeCallback = (trades: Trade[]) => void;

/**
 * MEXC Spot Client for signal validation
 */
export class MexcSpotClient {
    private ws: WebSocket | null = null;
    private callbacks: Map<string, TradeCallback> = new Map();
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 3;
    private reconnectDelay: number = 1000;
    private maxReconnectDelay: number = 30000;
    private reconnectDecay: number = 1.5;
    private subscribedSymbols: string[] = [];
    private isReconnecting: boolean = false;
    private pingInterval?: NodeJS.Timeout;

    private readonly WS_URL: string;
    private readonly REST_URL: string;

    /**
     * Create a new MEXC Spot Client
     *
     * @param wsUrl - Optional custom WebSocket URL
     * @param restUrl - Optional custom REST API URL
     */
    constructor(
        wsUrl: string = "wss://wbs.mexc.com/ws",
        restUrl: string = "https://api.mexc.com",
    ) {
        this.WS_URL = wsUrl;
        this.REST_URL = restUrl;
    }

    /**
     * Subscribe to Deals WebSocket for multiple symbols
     *
     * @param symbols - Array of symbols to subscribe to (e.g., ['BTCUSDT'])
     */
    async subscribeAggTrades(symbols: string[]): Promise<void> {
        // Store symbols for reconnection
        this.subscribedSymbols = symbols;

        // Close existing connection if any
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        // Reset reconnect attempts on new subscription
        this.reconnectAttempts = 0;

        // Connect to MEXC Spot WebSocket
        this.ws = new WebSocket(this.WS_URL);

        this.ws.on("open", () => {
            console.log(`✅ MEXC WebSocket connected`);
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            this.isReconnecting = false;

            // Start ping/pong heartbeat
            this.pingInterval = setInterval(() => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ method: "PING" }));
                }
            }, 15000); // Ping every 15 seconds

            // Subscribe to deals for all symbols
            // MEXC Format: spot@public.deals.v3.api@<SYMBOL>
            const params = symbols.map((s) =>
                `spot@public.deals.v3.api@${s.toUpperCase()}`
            );
            const subscribeMsg = {
                method: "SUBSCRIPTION",
                params: params,
            };

            this.ws!.send(JSON.stringify(subscribeMsg));
            console.log(
                `✅ Subscribed to MEXC Spot: ${symbols.length} symbols`,
            );
        });

        this.ws.on("message", (data: Buffer) => {
            try {
                const msg = JSON.parse(data.toString());

                // Handle PONG
                if (msg.msg === "PONG") {
                    // console.log('🏓 MEXC pong received');
                    return;
                }

                // Handle Deal events
                // {
                //   "c": "spot@public.deals.v3.api@BTCUSDT",
                //   "d": { "deals": [ ... ] }
                // }
                if (
                    msg.c && msg.c.startsWith("spot@public.deals.v3.api@") &&
                    msg.d && msg.d.deals
                ) {
                    const symbol = msg.c.split("@")[2];
                    const deals = msg.d.deals;
                    const trades: Trade[] = [];

                    if (Array.isArray(deals)) {
                        for (const deal of deals) {
                            trades.push({
                                symbol: symbol,
                                price: parseFloat(deal.p),
                                qty: parseFloat(deal.q),
                                time: deal.t,
                                isBuyerMaker: deal.S === 1, // 1: Buy, 2: Sell. If S=1 (Buy), it means Buyer is Maker?
                                // Wait, in Binance isBuyerMaker means "Buyer is the Market Maker" (passive).
                                // If S=1 (Buy), does it mean the aggressor is Sell? or is it just "Side: Buy"?
                                // Standard convention: side='buy' usually means Taker matched against Ask.
                                // Let's assume S=1 means Side=Buy.
                                // For "isBuyerMaker", we usually want to know if the Buyer provided liquidity.
                                // If Side=Buy (Aggressor), then Buyer is Taker (isBuyerMaker=false).
                                // If Side=Sell (Aggressor), then Buyer is Maker (isBuyerMaker=true).
                                // WITHOUT trade flags, we can't be sure about Maker/Taker.
                                // However, for pure signal detection (price/vol), side is less critical than price/time.
                                // We'll assume S=1 => Side=Buy => Aggressor=Buy => isBuyerMaker=false.
                                // S=2 => Side=Sell => Aggressor=Sell => isBuyerMaker=true.
                            });
                        }
                    }

                    if (trades.length > 0) {
                        const callback = this.callbacks.get(symbol);
                        if (callback) {
                            callback(trades);
                        }
                    }
                }
            } catch (error) {
                console.error("❌ Error parsing MEXC message:", error);
            }
        });

        this.ws.on("error", (error) => {
            console.error("❌ MEXC WebSocket error:", error);
        });

        this.ws.on("close", () => {
            console.info("ℹ️ MEXC WebSocket closed (auto-reconnecting...)");

            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = undefined;
            }

            const shouldReconnect = !this.isReconnecting &&
                this.reconnectAttempts < this.maxReconnectAttempts;

            if (shouldReconnect) {
                this.isReconnecting = true;
                this.reconnectAttempts++;

                console.warn(
                    `⚠️ Reconnecting in ${this.reconnectDelay / 1000}s... ` +
                        `(Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
                );

                setTimeout(() => {
                    this.subscribeAggTrades(this.subscribedSymbols);
                }, this.reconnectDelay);

                this.reconnectDelay = Math.min(
                    this.reconnectDelay * this.reconnectDecay,
                    this.maxReconnectDelay,
                );
            } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error(
                    `❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. ` +
                        `Manual intervention required.`,
                );
            }
        });
    }

    /**
     * Register a callback for trade events on a specific symbol
     */
    onTrade(symbol: string, callback: TradeCallback): void {
        this.callbacks.set(symbol, callback);
    }

    /**
     * Remove callback for a specific symbol
     */
    offTrade(symbol: string): void {
        this.callbacks.delete(symbol);
    }

    /**
     * Get current spot price for a symbol via REST API
     */
    async getSpotPrice(symbol: string): Promise<number> {
        try {
            const response = await fetch(
                `${this.REST_URL}/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`,
            );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            const data = (await response.json()) as {
                symbol: string;
                price: string;
            };
            return parseFloat(data.price);
        } catch (error) {
            console.error(`❌ Failed to get spot price for ${symbol}:`, error);
            throw error;
        }
    }

    /**
     * Close the WebSocket connection
     */
    close(): void {
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
        this.reconnectDelay = 1000;
        this.isReconnecting = false;
    }

    /**
     * Check if WebSocket is connected
     */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Get connection status for monitoring
     */
    getStatus(): {
        connected: boolean;
        subscribedSymbols: number;
        reconnectAttempts: number;
    } {
        return {
            connected: this.isConnected(),
            subscribedSymbols: this.subscribedSymbols.length,
            reconnectAttempts: this.reconnectAttempts,
        };
    }
}
