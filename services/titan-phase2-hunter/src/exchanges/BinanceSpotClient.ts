/**
 * Binance Spot Client for CVD Data Source
 *
 * Provides tick-level trade data via WebSocket for Cumulative Volume Delta calculation.
 * Includes reconnection logic and callback system for trade events.
 *
 * Requirements: 4.1 (CVD Monitoring)
 */

import WebSocket from "ws";
import { Trade } from "../types";

// Use require for node-fetch to avoid ES modules issues in Jest
import fetch from "node-fetch";

export interface BinanceAggTrade {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  a: number; // Aggregate trade ID
  p: string; // Price
  q: string; // Quantity
  f: number; // First trade ID
  l: number; // Last trade ID
  T: number; // Trade time
  m: boolean; // Is the buyer the market maker?
  M: boolean; // Ignore
}

export interface BinanceSpotPrice {
  symbol: string;
  price: string;
}

export type TradeCallback = (trade: Trade) => void;
export type ErrorCallback = (error: Error) => void;
export type ReconnectCallback = () => void;

export class BinanceSpotClient {
  private ws: WebSocket | null = null;
  private baseUrl = "https://api.binance.com";
  private wsUrl = "wss://stream.binance.com:9443/ws";
  private subscriptions = new Map<string, Set<TradeCallback>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000; // 2 seconds
  private isReconnecting = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastPongTime = 0;
  private isInitialized = false;

  // Callbacks
  private errorCallbacks = new Set<ErrorCallback>();
  private reconnectCallbacks = new Set<ReconnectCallback>();

  constructor() {
    this.setupHeartbeat();
  }

  /**
   * Initialize the Binance client
   * Tests connection and prepares WebSocket
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log("📡 Initializing Binance Spot Client...");

      // Test connection by fetching server time
      const response = await fetch(`${this.baseUrl}/api/v3/time`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // eslint-disable-next-line functional/immutable-data
      this.isInitialized = true;
      console.log("✅ Binance Spot Client initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Binance client:", error);
      throw error;
    }
  }

  /**
   * Disconnect and cleanup the Binance client
   */
  public async disconnect(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      console.log("📡 Disconnecting Binance Spot Client...");

      // Close WebSocket connection
      if (this.ws) {
        this.ws.close();
        // eslint-disable-next-line functional/immutable-data
        this.ws = null;
      }

      // Clear heartbeat interval
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        // eslint-disable-next-line functional/immutable-data
        this.heartbeatInterval = null;
      }

      // Clear subscriptions
      // eslint-disable-next-line functional/immutable-data
      this.subscriptions.clear();
      // eslint-disable-next-line functional/immutable-data
      this.errorCallbacks.clear();
      // eslint-disable-next-line functional/immutable-data
      this.reconnectCallbacks.clear();

      // eslint-disable-next-line functional/immutable-data
      this.isInitialized = false;
      console.log("✅ Binance Spot Client disconnected");
    } catch (error) {
      console.error("❌ Error disconnecting Binance client:", error);
      throw error;
    }
  }

  /**
   * Subscribe to aggregate trades for a symbol
   * @param symbol - Trading symbol (e.g., 'BTCUSDT')
   * @param callback - Callback function for trade events
   */
  public subscribeAggTrades(symbol: string, callback: TradeCallback): void {
    const normalizedSymbol = symbol.toLowerCase();

    // Add callback to subscriptions
    if (!this.subscriptions.has(normalizedSymbol)) {
      // eslint-disable-next-line functional/immutable-data
      this.subscriptions.set(normalizedSymbol, new Set());
    }
    // eslint-disable-next-line functional/immutable-data
    this.subscriptions.get(normalizedSymbol)!.add(callback);

    // Connect WebSocket if not already connected or connecting
    if (
      !this.ws ||
      (this.ws.readyState !== WebSocket.OPEN &&
        this.ws.readyState !== WebSocket.CONNECTING)
    ) {
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      // Subscribe to the stream if WebSocket is already open
      this.subscribeToStream(normalizedSymbol);
    }
    // If CONNECTING, the open handler will take care of subscriptions
  }

  /**
   * Subscribe to aggregate trades for multiple symbols in a batch
   * @param subscriptions - Array of { symbol, callback } objects
   */
  public subscribeAggTradesBatch(
    subscriptions: Array<{ symbol: string; callback: TradeCallback }>,
  ): void {
    const symbolsToSubscribe: string[] = [];

    subscriptions.forEach(({ symbol, callback }) => {
      const normalizedSymbol = symbol.toLowerCase();

      // Add callback to subscriptions
      if (!this.subscriptions.has(normalizedSymbol)) {
        // eslint-disable-next-line functional/immutable-data
        this.subscriptions.set(normalizedSymbol, new Set());
      }
      // eslint-disable-next-line functional/immutable-data
      this.subscriptions.get(normalizedSymbol)!.add(callback);
      symbolsToSubscribe.push(normalizedSymbol);
    });

    // Connect WebSocket if not already connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
      // Logic in connect() will subscribe to all existing subscriptions
    } else {
      // Subscribe to the streams if WebSocket is already open
      this.subscribeToStreams(symbolsToSubscribe);
    }
  }

  /**
   * Unsubscribe from aggregate trades for a symbol
   * @param symbol - Trading symbol
   * @param callback - Callback function to remove
   */
  public unsubscribeAggTrades(symbol: string, callback: TradeCallback): void {
    const normalizedSymbol = symbol.toLowerCase();
    const callbacks = this.subscriptions.get(normalizedSymbol);

    if (callbacks) {
      // eslint-disable-next-line functional/immutable-data
      callbacks.delete(callback);

      // If no more callbacks for this symbol, unsubscribe from stream
      if (callbacks.size === 0) {
        // eslint-disable-next-line functional/immutable-data
        this.subscriptions.delete(normalizedSymbol);
        this.unsubscribeFromStream(normalizedSymbol);
      }
    }
  }

  /**
   * Get current spot price for a symbol via REST API
   * @param symbol - Trading symbol (e.g., 'BTCUSDT')
   * @returns Promise with current price
   */
  public async getSpotPrice(symbol: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as BinanceSpotPrice;
      return parseFloat(data.price);
    } catch (error) {
      const errorMsg = `Failed to get spot price for ${symbol}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this.emitError(new Error(errorMsg));
      throw new Error(errorMsg);
    }
  }

  /**
   * Add error callback
   * @param callback - Error callback function
   */
  public onError(callback: ErrorCallback): void {
    // eslint-disable-next-line functional/immutable-data
    this.errorCallbacks.add(callback);
  }

  /**
   * Add reconnect callback
   * @param callback - Reconnect callback function
   */
  public onReconnect(callback: ReconnectCallback): void {
    // eslint-disable-next-line functional/immutable-data
    this.reconnectCallbacks.add(callback);
  }

  /**
   * Remove error callback
   * @param callback - Error callback function to remove
   */
  public removeErrorCallback(callback: ErrorCallback): void {
    // eslint-disable-next-line functional/immutable-data
    this.errorCallbacks.delete(callback);
  }

  /**
   * Remove reconnect callback
   * @param callback - Reconnect callback function to remove
   */
  public removeReconnectCallback(callback: ReconnectCallback): void {
    // eslint-disable-next-line functional/immutable-data
    this.reconnectCallbacks.delete(callback);
  }

  /**
   * Get connection status
   * @returns WebSocket ready state
   */
  public getConnectionStatus(): "CONNECTING" | "OPEN" | "CLOSING" | "CLOSED" {
    if (!this.ws) return "CLOSED";

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return "CONNECTING";
      case WebSocket.OPEN:
        return "OPEN";
      case WebSocket.CLOSING:
        return "CLOSING";
      case WebSocket.CLOSED:
        return "CLOSED";
      default:
        return "CLOSED";
    }
  }

  /**
   * Close WebSocket connection and cleanup
   */
  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      // eslint-disable-next-line functional/immutable-data
      this.heartbeatInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      // eslint-disable-next-line functional/immutable-data
      this.ws = null;
    }

    // eslint-disable-next-line functional/immutable-data
    this.subscriptions.clear();
    // eslint-disable-next-line functional/immutable-data
    this.errorCallbacks.clear();
    // eslint-disable-next-line functional/immutable-data
    this.reconnectCallbacks.clear();
    // eslint-disable-next-line functional/immutable-data
    this.reconnectAttempts = 0;
    // eslint-disable-next-line functional/immutable-data
    this.isReconnecting = false;
  }

  /**
   * Connect to Binance WebSocket
   */
  private connect(): void {
    if (this.isReconnecting) return;

    try {
      // eslint-disable-next-line functional/immutable-data
      this.ws = new WebSocket(this.wsUrl);
      // eslint-disable-next-line functional/immutable-data
      this.lastPongTime = Date.now();

      this.ws.on("open", () => {
        console.log("🔗 Binance WebSocket connected");
        // eslint-disable-next-line functional/immutable-data
        this.reconnectAttempts = 0;
        // eslint-disable-next-line functional/immutable-data
        this.isReconnecting = false;

        // Subscribe to all existing symbols in a single batch
        const symbols = Array.from(this.subscriptions.keys());
        if (symbols.length > 0) {
          this.subscribeToStreams(symbols);
        }
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.emitError(
            new Error(
              `Failed to parse WebSocket message: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            ),
          );
        }
      });

      this.ws.on("pong", () => {
        // eslint-disable-next-line functional/immutable-data
        this.lastPongTime = Date.now();
      });

      this.ws.on("error", (error: Error) => {
        console.error("❌ Binance WebSocket error:", error.message);
        this.emitError(error);
      });

      this.ws.on("close", (code: number, reason: Buffer) => {
        console.log(
          `🔌 Binance WebSocket closed: ${code} ${reason.toString()}`,
        );
        // eslint-disable-next-line functional/immutable-data
        this.ws = null;

        // Attempt reconnection if we have active subscriptions
        if (this.subscriptions.size > 0 && !this.isReconnecting) {
          this.attemptReconnect();
        }
      });
    } catch (error) {
      this.emitError(
        new Error(
          `Failed to connect to Binance WebSocket: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ),
      );
    }
  }

  /**
   * Subscribe to a specific stream (used when WebSocket is already open)
   */
  private subscribeToStream(symbol: string): void {
    this.subscribeToStreams([symbol]);
  }

  /**
   * Subscribe to multiple streams in a single request
   */
  private subscribeToStreams(symbols: string[]): void {
    if (
      !this.ws || this.ws.readyState !== WebSocket.OPEN || symbols.length === 0
    ) return;

    // Batch subscriptions in chunks of 50 to be safe (Binance allows more but good to be conservative)
    const CHUNK_SIZE = 50;
    for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
      const chunk = symbols.slice(i, i + CHUNK_SIZE);
      const params = chunk.map((s) => `${s}@aggTrade`);

      const subscribeMessage = {
        method: "SUBSCRIBE",
        params: params,
        id: Date.now(),
      };

      this.ws.send(JSON.stringify(subscribeMessage));
    }
  }

  /**
   * Unsubscribe from a specific stream
   */
  private unsubscribeFromStream(symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const unsubscribeMessage = {
      method: "UNSUBSCRIBE",
      params: [`${symbol}@aggTrade`],
      id: Date.now(),
    };

    this.ws.send(JSON.stringify(unsubscribeMessage));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: any): void {
    // Handle aggregate trade data
    if (message.e === "aggTrade") {
      const aggTrade = message as BinanceAggTrade;
      const trade: Trade = {
        price: parseFloat(aggTrade.p),
        quantity: parseFloat(aggTrade.q),
        side: aggTrade.m ? "SELL" : "BUY", // m=true means buyer is market maker (sell order filled)
        timestamp: aggTrade.T,
        isBuyerMaker: aggTrade.m, // true = sell order hit buy limit, false = buy order hit sell limit
      };

      // Emit to all callbacks for this symbol
      const callbacks = this.subscriptions.get(aggTrade.s.toLowerCase());
      if (callbacks) {
        callbacks.forEach((callback) => {
          try {
            callback(trade);
          } catch (error) {
            this.emitError(
              new Error(
                `Trade callback error: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              ),
            );
          }
        });
      }
    }

    // Handle subscription confirmations and errors
    if (message.result === null && message.id) {
      // Subscription successful
      console.log(`✅ Binance subscription confirmed: ${message.id}`);
    } else if (message.error) {
      this.emitError(
        new Error(`Binance WebSocket error: ${message.error.msg}`),
      );
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (
      this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emitError(
          new Error(
            `Max reconnection attempts (${this.maxReconnectAttempts}) reached`,
          ),
        );
      }
      return;
    }

    // eslint-disable-next-line functional/immutable-data
    this.isReconnecting = true;
    // eslint-disable-next-line functional/immutable-data
    this.reconnectAttempts++;

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    console.log(
      `🔄 Attempting to reconnect to Binance WebSocket (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`,
    );

    setTimeout(() => {
      this.connect();
      this.emitReconnect();
    }, delay);
  }

  /**
   * Setup heartbeat to detect connection issues
   */
  private setupHeartbeat(): void {
    // eslint-disable-next-line functional/immutable-data
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Check if we received a pong recently
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > 30000) {
          // 30 seconds timeout
          console.warn(
            "⚠️ Binance WebSocket heartbeat timeout, closing connection",
          );
          this.ws.close();
          return;
        }

        // Send ping
        this.ws.ping();
      }
    }, 20000); // Ping every 20 seconds
  }

  /**
   * Emit error to all error callbacks
   */
  private emitError(error: Error): void {
    this.errorCallbacks.forEach((callback) => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error("Error in error callback:", callbackError);
      }
    });
  }

  /**
   * Emit reconnect event to all reconnect callbacks
   */
  private emitReconnect(): void {
    this.reconnectCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (callbackError) {
        console.error("Error in reconnect callback:", callbackError);
      }
    });
  }
}
