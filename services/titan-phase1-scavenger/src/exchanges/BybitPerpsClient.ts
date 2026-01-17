/**
 * Bybit Perpetuals Client for Execution Target
 *
 * Provides REST API methods for order execution, data fetching, and account management.
 * Includes HMAC signature generation, caching, and retry logic.
 *
 * Requirements: 7.1-7.7 (Execution), 11.1-11.7 (Multi-Timeframe Data)
 */

import { createHmac } from "crypto";
// Force Rebuild 2026-01-08-01
import {
    OHLCV,
    OrderParams,
    OrderResult,
    OrderStatus,
} from "../types/index.js";

// Import fetch with proper typing for Jest compatibility
import fetch from "node-fetch";
import WebSocket from "ws";

export interface BybitTickerUpdate {
    topic: string;
    type: string;
    ts: number;
    data: {
        symbol: string;
        lastPrice: string;
        highPrice24h: string;
        lowPrice24h: string;
        prevPrice24h: string;
        volume24h: string;
        turnover24h: string;
    };
}

type TickerCallback = (
    symbol: string,
    price: number,
    timestamp: number,
) => void;

export interface BybitSymbolInfo {
    symbol: string;
    baseCoin: string;
    quoteCoin: string;
    status: string;
    marginTrading: string;
    lotSizeFilter: {
        basePrecision: string;
        quotePrecision: string;
        minOrderQty: string;
        maxOrderQty: string;
        minOrderAmt: string;
        maxOrderAmt: string;
    };
    priceFilter: {
        minPrice: string;
        maxPrice: string;
        tickSize: string;
    };
}

export interface BybitTickerInfo {
    symbol: string;
    bid1Price: string;
    bid1Size: string;
    ask1Price: string;
    ask1Size: string;
    lastPrice: string;
    prevPrice24h: string;
    price24hPcnt: string;
    highPrice24h: string;
    lowPrice24h: string;
    turnover24h: string;
    volume24h: string;
}

export interface BybitKlineData {
    symbol: string;
    category: string;
    list: string[][]; // [startTime, openPrice, highPrice, lowPrice, closePrice, volume, turnover]
}

export interface BybitOrderResponse {
    orderId: string;
    orderLinkId: string;
    symbol: string;
    createTime: string;
    updateTime: string;
    side: string;
    orderType: string;
    qty: string;
    price: string;
    orderStatus: string;
    timeInForce: string;
    avgPrice: string;
    leavesQty: string;
    leavesValue: string;
    cumExecQty: string;
    cumExecValue: string;
    cumExecFee: string;
    rejectReason: string;
}

export interface BybitAccountInfo {
    totalEquity: string;
    totalWalletBalance: string;
    totalMarginBalance: string;
    totalAvailableBalance: string;
    totalPerpUPL: string;
    totalInitialMargin: string;
    totalMaintenanceMargin: string;
    coin: Array<{
        coin: string;
        equity: string;
        usdValue: string;
        walletBalance: string;
        availableToWithdraw: string;
        availableToBorrow: string;
        borrowAmount: string;
        accruedInterest: string;
        totalOrderIM: string;
        totalPositionIM: string;
        totalPositionMM: string;
        unrealisedPnl: string;
        cumRealisedPnl: string;
    }>;
}

export interface BybitPositionInfo {
    symbol: string;
    leverage: string;
    avgPrice: string;
    liqPrice: string;
    riskLimitValue: string;
    takeProfit: string;
    stopLoss: string;
    trailingStop: string;
    unrealisedPnl: string;
    cumRealisedPnl: string;
    positionMM: string;
    positionIM: string;
    positionValue: string;
    positionBalance: string;
    size: string;
    side: string;
    positionStatus: string;
    markPrice: string;
    bustPrice: string;
    positionIdx: number;
    tradeMode: number;
}

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

export class BybitPerpsClient {
    private baseUrl = "https://api.bybit.com";
    private apiKey: string;
    private apiSecret: string;
    private cache = new Map<string, CacheEntry<any>>();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private readonly REQUEST_TIMEOUT = 10000; // 10 seconds
    private readonly RETRY_ATTEMPTS = 3;
    private readonly RETRY_DELAY = 1000; // 1 second

    // WebSocket support
    private ws: WebSocket | null = null;
    private tickerCallbacks: Map<string, TickerCallback> = new Map();
    private wsPingInterval?: NodeJS.Timeout;
    private readonly WS_URL = "wss://stream.bybit.com/v5/public/linear";

    constructor(apiKey: string, apiSecret: string) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
    }

    /**
     * Subscribe to real-time ticker updates
     * @param symbols - Array of symbols (e.g., ['BTCUSDT'])
     * @param callback - Callback for ticker updates
     */
    public subscribeTicker(symbols: string[], callback: TickerCallback): void {
        this.tickerCallbacks.clear();
        for (const symbol of symbols) {
            this.tickerCallbacks.set(symbol, callback);
        }

        if (this.ws) {
            this.ws.close();
        }

        this.connectWebSocket(symbols);
    }

    private connectWebSocket(symbols: string[]): void {
        this.ws = new WebSocket(this.WS_URL);

        this.ws.on("open", () => {
            console.log("✅ Bybit WebSocket connected");

            // Send subscription
            const args = symbols.map((s) => `tickers.${s.toUpperCase()}`);
            const msg = {
                op: "subscribe",
                args: args,
            };
            this.ws?.send(JSON.stringify(msg));

            // Start heartbeat
            this.wsPingInterval = setInterval(() => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ op: "ping" }));
                }
            }, 20000);
        });

        this.ws.on("message", (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());

                // Handle ticker update
                if (msg.topic && msg.topic.startsWith("tickers.") && msg.data) {
                    const symbol = msg.topic.split(".")[1];
                    const tickerData = msg.data;
                    const price = parseFloat(tickerData.lastPrice);
                    const ts = msg.ts; // Bybit timestamp (ms)

                    const callback = this.tickerCallbacks.get(symbol);
                    if (callback) {
                        callback(symbol, price, ts);
                    }
                }
            } catch (err) {
                console.error("❌ Error parsing Bybit WS message", err);
            }
        });

        this.ws.on("close", () => {
            console.warn("⚠️ Bybit WebSocket closed. Reconnecting...");
            if (this.wsPingInterval) clearInterval(this.wsPingInterval);
            setTimeout(() => this.connectWebSocket(symbols), 2000);
        });

        this.ws.on("error", (err) => {
            console.error("❌ Bybit WebSocket error:", err);
        });
    }

    public close(): void {
        if (this.wsPingInterval) clearInterval(this.wsPingInterval);
        if (this.ws) {
            this.ws.removeAllListeners(); // Prevent reconnect loop
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Fetch top symbols by 24h volume (top 100)
     * @returns Promise with array of symbol names
     */
    public async fetchTopSymbols(limit: number = 100): Promise<string[]> {
        const cacheKey = `top_symbols_${limit}`;
        const cached = this.getFromCache<string[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.makeRequest(
                "GET",
                "/v5/market/tickers",
                {
                    category: "linear",
                },
            );

            if (response.retCode !== 0) {
                throw new Error(`Bybit API error: ${response.retMsg}`);
            }

            // Sort by 24h volume and take top N
            const tickers = response.result.list as BybitTickerInfo[];
            const sortedSymbols = tickers
                .filter((ticker) => ticker.symbol.endsWith("USDT"))
                .sort((a, b) =>
                    parseFloat(b.turnover24h) - parseFloat(a.turnover24h)
                )
                .slice(0, limit)
                .map((ticker) => ticker.symbol);

            this.setCache(cacheKey, sortedSymbols, this.CACHE_TTL);
            return sortedSymbols;
        } catch (error) {
            throw new Error(
                `Failed to fetch top symbols: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Fetch OHLCV data with caching (5-minute TTL)
     * @param symbol - Trading symbol (e.g., 'BTCUSDT')
     * @param interval - Timeframe ('1', '5', '15', '30', '60', '240', '1440')
     * @param limit - Number of candles (max 1000)
     * @returns Promise with OHLCV array
     */
    public async fetchOHLCV(
        symbol: string,
        interval: string,
        limit: number = 200,
    ): Promise<OHLCV[]> {
        const cacheKey = `ohlcv_${symbol}_${interval}_${limit}`;
        const cached = this.getFromCache<OHLCV[]>(cacheKey);
        if (cached) return cached;

        try {
            // Convert interval to Bybit format
            const bybitInterval = this.convertInterval(interval);

            const response = await this.makeRequest("GET", "/v5/market/kline", {
                category: "linear",
                symbol: symbol.toUpperCase(),
                interval: bybitInterval,
                limit: Math.min(limit, 1000).toString(),
            });

            if (response.retCode !== 0) {
                throw new Error(`Bybit API error: ${response.retMsg}`);
            }

            const klineData = response.result as BybitKlineData;
            const ohlcv: OHLCV[] = klineData.list.map((candle) => ({
                timestamp: parseInt(candle[0]),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5]),
            }));

            // Sort by timestamp (oldest first)
            ohlcv.sort((a, b) => a.timestamp - b.timestamp);

            this.setCache(cacheKey, ohlcv, this.CACHE_TTL);
            return ohlcv;
        } catch (error) {
            throw new Error(
                `Failed to fetch OHLCV for ${symbol}: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Get current price for a symbol
     * @param symbol - Trading symbol (e.g., 'BTCUSDT')
     * @returns Promise with current price
     */
    public async getCurrentPrice(symbol: string): Promise<number> {
        try {
            const response = await this.makeRequest(
                "GET",
                "/v5/market/tickers",
                {
                    category: "linear",
                    symbol: symbol.toUpperCase(),
                },
            );

            if (response.retCode !== 0) {
                throw new Error(`Bybit API error: ${response.retMsg}`);
            }

            const ticker = response.result.list[0] as BybitTickerInfo;
            if (!ticker) {
                throw new Error(`No ticker data found for ${symbol}`);
            }

            return parseFloat(ticker.lastPrice);
        } catch (error) {
            throw new Error(
                `Failed to get current price for ${symbol}: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Get account equity
     * @returns Promise with total equity in USDT
     */
    public async getEquity(): Promise<number> {
        try {
            const response = await this.makeRequest(
                "GET",
                "/v5/account/wallet-balance",
                {
                    accountType: "UNIFIED",
                },
                true,
            );

            if (response.retCode !== 0) {
                throw new Error(`Bybit API error: ${response.retMsg}`);
            }

            const account = response.result.list[0] as BybitAccountInfo;
            if (!account) {
                throw new Error("No account data found");
            }

            return parseFloat(account.totalEquity);
        } catch (error) {
            throw new Error(
                `Failed to get equity: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Place order with HMAC signature and Post-Only support
     * @param params - Order parameters
     * @returns Promise with order result
     */
    public async placeOrder(params: OrderParams): Promise<OrderResult> {
        try {
            const orderParams: any = {
                category: "linear",
                symbol: params.symbol.toUpperCase(),
                side: params.side,
                orderType: params.type === "POST_ONLY"
                    ? "Limit"
                    : params.type === "LIMIT"
                    ? "Limit"
                    : "Market",
                qty: params.qty.toString(),
                timeInForce: params.type === "POST_ONLY" ? "PostOnly" : "GTC",
            };

            // Add price for limit orders
            if (params.type === "LIMIT" || params.type === "POST_ONLY") {
                if (!params.price) {
                    throw new Error("Price is required for limit orders");
                }
                orderParams.price = params.price.toString();
            }

            // Add stop loss and take profit if provided
            if (params.stopLoss) {
                orderParams.stopLoss = params.stopLoss.toString();
            }
            if (params.takeProfit) {
                orderParams.takeProfit = params.takeProfit.toString();
            }

            const response = await this.makeRequest(
                "POST",
                "/v5/order/create",
                orderParams,
                true,
            );

            if (response.retCode !== 0) {
                throw new Error(`Bybit API error: ${response.retMsg}`);
            }

            const orderData = response.result as BybitOrderResponse;

            return {
                orderId: orderData.orderId,
                symbol: orderData.symbol,
                side: orderData.side as "Buy" | "Sell",
                qty: parseFloat(orderData.qty),
                price: parseFloat(orderData.price || orderData.avgPrice || "0"),
                status: this.mapOrderStatus(orderData.orderStatus),
                timestamp: parseInt(orderData.createTime),
            };
        } catch (error) {
            throw new Error(
                `Failed to place order: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Place order with retry logic (2-second timeout)
     * @param params - Order parameters
     * @param maxRetries - Maximum retry attempts (default: 2)
     * @returns Promise with order result
     */
    public async placeOrderWithRetry(
        params: OrderParams,
        maxRetries: number = 2,
    ): Promise<OrderResult> {
        let lastError: Error;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Set timeout for each attempt
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(
                        () =>
                            reject(new Error("Order timeout after 2 seconds")),
                        2000,
                    );
                });

                const orderPromise = this.placeOrder(params);
                const result = await Promise.race([
                    orderPromise,
                    timeoutPromise,
                ]);

                return result;
            } catch (error) {
                lastError = error instanceof Error
                    ? error
                    : new Error("Unknown error");

                if (attempt < maxRetries) {
                    console.warn(
                        `⚠️ Order attempt ${
                            attempt + 1
                        } failed, retrying: ${lastError.message}`,
                    );
                    await this.sleep(this.RETRY_DELAY);
                }
            }
        }

        throw new Error(
            `Order failed after ${maxRetries + 1} attempts: ${
                lastError!.message
            }`,
        );
    }

    /**
     * Make authenticated or public API request
     * @param method - HTTP method
     * @param endpoint - API endpoint
     * @param params - Request parameters
     * @param signed - Whether to sign the request
     * @returns Promise with API response
     */
    private async makeRequest(
        method: "GET" | "POST",
        endpoint: string,
        params: any = {},
        signed: boolean = false,
    ): Promise<any> {
        const timestamp = Date.now().toString();
        let url = `${this.baseUrl}${endpoint}`;
        let body = "";

        // Prepare headers
        const headers: any = {
            "Content-Type": "application/json",
            "X-BAPI-TIMESTAMP": timestamp,
            "X-BAPI-RECV-WINDOW": "5000",
        };

        if (signed) {
            headers["X-BAPI-API-KEY"] = this.apiKey;
        }

        // Prepare request data
        if (method === "GET") {
            const queryString = new URLSearchParams(params).toString();
            if (queryString) {
                url += `?${queryString}`;
            }
        } else {
            body = JSON.stringify(params);
        }

        // Generate signature for authenticated requests
        if (signed) {
            const signaturePayload = timestamp + this.apiKey + "5000" +
                (method === "GET"
                    ? new URLSearchParams(params).toString()
                    : body);
            headers["X-BAPI-SIGN"] = createHmac("sha256", this.apiSecret)
                .update(signaturePayload).digest("hex");
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(
                () => controller.abort(),
                this.REQUEST_TIMEOUT,
            );

            const response = await fetch(url, {
                method,
                headers,
                body: method === "POST" ? body : undefined,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error("Request timeout");
            }
            throw new Error(
                `Request failed: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Convert interval to Bybit format
     * @param interval - Standard interval
     * @returns Bybit interval format
     */
    private convertInterval(interval: string): string {
        const intervalMap: { [key: string]: string } = {
            "1m": "1",
            "5m": "5",
            "15m": "15",
            "30m": "30",
            "1h": "60",
            "4h": "240",
            "1d": "D",
            "1D": "D",
            "1w": "W",
            "1W": "W",
        };

        return intervalMap[interval] || interval;
    }

    /**
     * Map Bybit order status to standard format
     * @param bybitStatus - Bybit order status
     * @returns Standard order status
     */
    private mapOrderStatus(bybitStatus: string): OrderStatus {
        const statusMap: { [key: string]: OrderStatus } = {
            "New": "NEW",
            "PartiallyFilled": "PARTIALLY_FILLED",
            "Filled": "FILLED",
            "Cancelled": "CANCELLED",
            "Rejected": "REJECTED",
            "PartiallyFilledCanceled": "CANCELLED",
            "Deactivated": "CANCELLED",
        };

        return statusMap[bybitStatus] || "NEW";
    }

    /**
     * Get data from cache if valid
     * @param key - Cache key
     * @returns Cached data or null
     */
    private getFromCache<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Set data in cache
     * @param key - Cache key
     * @param data - Data to cache
     * @param ttl - Time to live in milliseconds
     */
    private setCache<T>(key: string, data: T, ttl: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl,
        });
    }

    /**
     * Sleep for specified milliseconds
     * @param ms - Milliseconds to sleep
     * @returns Promise that resolves after delay
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Clear cache
     */
    public clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache size
     * @returns Number of cached entries
     */
    public getCacheSize(): number {
        return this.cache.size;
    }

    /**
     * Get funding rate for a symbol
     * @param symbol - Trading symbol
     * @returns Promise with funding rate (e.g., 0.0001 for 0.01%)
     */
    public async getFundingRate(symbol: string): Promise<number> {
        try {
            const response = await this.makeRequest(
                "GET",
                "/v5/market/tickers",
                {
                    category: "linear",
                    symbol: symbol.toUpperCase(),
                },
            );

            if (response.retCode !== 0) {
                throw new Error(`Bybit API error: ${response.retMsg}`);
            }

            const ticker = response.result.list[0];
            if (!ticker) {
                throw new Error(`No ticker data found for ${symbol}`);
            }

            return parseFloat(ticker.fundingRate);
        } catch (error) {
            throw new Error(
                `Failed to get funding rate for ${symbol}: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Get Open Interest for a symbol
     * @param symbol - Trading symbol
     * @returns Promise with open interest size
     */
    public async getOpenInterest(symbol: string): Promise<number> {
        try {
            const response = await this.makeRequest(
                "GET",
                "/v5/market/open-interest",
                {
                    category: "linear",
                    symbol: symbol.toUpperCase(),
                    intervalTime: "5min", // Required param, though latest is returned
                },
            );

            if (response.retCode !== 0) {
                throw new Error(`Bybit API error: ${response.retMsg}`);
            }

            // result.list is array of { openInterest: string, timestamp: string }
            const data = response.result.list[0];
            if (!data) {
                throw new Error(`No open interest data found for ${symbol}`);
            }

            return parseFloat(data.openInterest);
        } catch (error) {
            throw new Error(
                `Failed to get open interest for ${symbol}: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Get 24h Volume (Turnover)
     * @param symbol - Trading symbol
     * @returns Promise with 24h turnover in USDT
     */
    public async get24hVolume(symbol: string): Promise<number> {
        try {
            const response = await this.makeRequest(
                "GET",
                "/v5/market/tickers",
                {
                    category: "linear",
                    symbol: symbol.toUpperCase(),
                },
            );

            if (response.retCode !== 0) {
                throw new Error(`Bybit API error: ${response.retMsg}`);
            }

            const ticker = response.result.list[0] as BybitTickerInfo;
            if (!ticker) {
                throw new Error(`No ticker data found for ${symbol}`);
            }

            return parseFloat(ticker.turnover24h);
        } catch (error) {
            throw new Error(
                `Failed to get 24h volume for ${symbol}: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }
}
