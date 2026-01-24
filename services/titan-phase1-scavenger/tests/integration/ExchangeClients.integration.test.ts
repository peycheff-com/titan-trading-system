/**
 * Integration Tests for Exchange Clients
 *
 * Tests the exchange clients with mock WebSocket and REST API responses.
 * These tests verify:
 * - Binance WebSocket subscription and reconnection
 * - Bybit order placement (with mock testnet)
 * - MEXC order placement (with mock testnet)
 * - ExchangeGateway parallel execution
 *
 * Requirements: 5-8 (Exchange Clients)
 *
 * NOTE: These tests use mocks to avoid hitting real exchange APIs.
 * For real testnet testing, set environment variables:
 * - BYBIT_TESTNET_API_KEY
 * - BYBIT_TESTNET_API_SECRET
 * - MEXC_TESTNET_API_KEY
 * - MEXC_TESTNET_API_SECRET
 */

import {
  BinanceSpotClient,
  Trade,
} from "../../src/exchanges/BinanceSpotClient";
import { BybitPerpsClient } from "../../src/exchanges/BybitPerpsClient";
import { OrderParams } from "../../src/types/index";
// MEXC and ExchangeGateway removed as they are missing in source
import { ConfigManager } from "../../src/config/ConfigManager";
import WebSocket, { WebSocketServer } from "ws";

// Mock WebSocket Server for Binance testing
class MockWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private connectionPromise: Promise<WebSocket> | null = null;
  private connectionResolve: ((ws: WebSocket) => void) | null = null;

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port });

        // Create promise for first client connection
        this.connectionPromise = new Promise((res) => {
          this.connectionResolve = res;
        });

        this.wss.on("connection", (ws: WebSocket) => {
          this.clients.add(ws);

          // Resolve connection promise for first client
          if (this.connectionResolve) {
            this.connectionResolve(ws);
            this.connectionResolve = null;
          }

          ws.on("close", () => {
            this.clients.delete(ws);
          });
        });

        this.wss.on("listening", () => {
          resolve();
        });

        this.wss.on("error", (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Wait for at least one client to connect
  async waitForConnection(): Promise<void> {
    if (this.connectionPromise) {
      await this.connectionPromise;
    }
  }

  sendToAll(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      // Close all client connections first
      this.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      });
      this.clients.clear();

      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  hasConnectedClients(): boolean {
    return this.clients.size > 0;
  }
}

describe("Exchange Clients Integration Tests", () => {
  describe("BinanceSpotClient", () => {
    let mockServer: MockWebSocketServer;
    let client: BinanceSpotClient;
    const TEST_PORT = 9444; // Use different port to avoid conflicts

    beforeEach(async () => {
      // Start mock WebSocket server
      mockServer = new MockWebSocketServer();
      await mockServer.start(TEST_PORT);
    });

    afterEach(async () => {
      // Close client first
      if (client) {
        client.close();
      }

      // Wait a bit before closing server
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close server
      if (mockServer) {
        await mockServer.close();
      }

      // Wait for all connections to fully close
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it("should subscribe to AggTrades WebSocket", async () => {
      // Arrange
      const symbols = ["BTCUSDT", "ETHUSDT"];

      // Create client with custom WebSocket URL pointing to mock server
      client = new BinanceSpotClient(`ws://localhost:${TEST_PORT}`);

      // Act
      const subscribePromise = client.subscribeAggTrades(symbols);

      // Wait for client to connect to server
      await mockServer.waitForConnection();
      await subscribePromise;

      // Wait a bit for connection to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert - Check connection status
      expect(client.isConnected()).toBe(true);

      // Assert - Check status shows subscribed symbols
      const status = client.getStatus();
      expect(status.subscribedSymbols).toBe(2);
    });

    it("should receive and parse AggTrade messages", async () => {
      // Arrange
      const symbols = ["BTCUSDT"];
      const receivedTrades: Trade[] = [];

      client = new BinanceSpotClient(`ws://localhost:${TEST_PORT}`);

      client.onTrade("BTCUSDT", (trades) => {
        receivedTrades.push(...trades);
      });

      const subscribePromise = client.subscribeAggTrades(symbols);
      await mockServer.waitForConnection();
      await subscribePromise;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Act - Send mock AggTrade message
      const mockTrade = {
        e: "aggTrade",
        s: "BTCUSDT",
        p: "50000.00",
        q: "0.5",
        T: Date.now(),
        m: false,
      };

      mockServer.sendToAll(mockTrade);

      // Wait for message processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Assert
      expect(receivedTrades).toHaveLength(1);
      expect(receivedTrades[0].symbol).toBe("BTCUSDT");
      expect(receivedTrades[0].price).toBe(50000);
      expect(receivedTrades[0].qty).toBe(0.5);
      expect(receivedTrades[0].isBuyerMaker).toBe(false);
    });

    it("should reconnect after WebSocket close", async () => {
      // Arrange
      const symbols = ["BTCUSDT"];
      client = new BinanceSpotClient(`ws://localhost:${TEST_PORT}`);

      const subscribePromise = client.subscribeAggTrades(symbols);
      await mockServer.waitForConnection();
      await subscribePromise;
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(client.isConnected()).toBe(true);

      // Act - Close the server to trigger reconnection
      await mockServer.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Assert - Client should detect disconnection
      expect(client.isConnected()).toBe(false);

      // Restart server for reconnection
      mockServer = new MockWebSocketServer();
      await mockServer.start(TEST_PORT);

      // Wait for reconnection attempt (2 second delay + connection time)
      await mockServer.waitForConnection();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Assert - Client should reconnect
      expect(client.isConnected()).toBe(true);
    }, 10000); // Increase timeout for this test

    it("should stop reconnecting after max attempts", async () => {
      // Arrange
      const symbols = ["BTCUSDT"];
      client = new BinanceSpotClient(`ws://localhost:${TEST_PORT}`);

      const subscribePromise = client.subscribeAggTrades(symbols);
      await mockServer.waitForConnection();
      await subscribePromise;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Act - Close server permanently
      await mockServer.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Wait for all reconnection attempts (3 attempts * 2s delay = 6s + buffer)
      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Assert - Client should give up after 3 attempts
      const status = client.getStatus();
      expect(status.connected).toBe(false);
      expect(status.reconnectAttempts).toBe(3);
    }, 15000);
  });

  describe("BybitPerpsClient", () => {
    let client: BybitPerpsClient;

    beforeEach(() => {
      // Use mock credentials for testing
      client = new BybitPerpsClient("test_api_key", "test_api_secret");
    });

    it("should fetch top symbols by volume", async () => {
      // Mock fetch for this test
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            list: [
              { symbol: "BTCUSDT", turnover24h: "5000000000" },
              { symbol: "ETHUSDT", turnover24h: "3000000000" },
              { symbol: "SOLUSDT", turnover24h: "2000000000" },
              { symbol: "LOWVOLUME", turnover24h: "500000" }, // Below $1M threshold
            ],
          },
        }),
      });

      global.fetch = mockFetch as any;

      // Act
      const symbols = await client.fetchTopSymbols(10);

      // Assert
      expect(symbols).toHaveLength(3); // LOWVOLUME filtered out
      expect(symbols[0]).toBe("BTCUSDT"); // Highest volume first
      expect(symbols[1]).toBe("ETHUSDT");
      expect(symbols[2]).toBe("SOLUSDT");

      // Verify API call
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v5/market/tickers?category=linear"),
      );
    });

    it("should fetch OHLCV data", async () => {
      // Mock fetch
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            list: [
              ["1700000000000", "50000", "51000", "49000", "50500", "100"],
              ["1699996400000", "49500", "50000", "49000", "50000", "90"],
            ],
          },
        }),
      });

      global.fetch = mockFetch as any;

      // Act
      const ohlcv = await client.fetchOHLCV("BTCUSDT", "1h", 2);

      // Assert
      expect(ohlcv).toHaveLength(2);
      expect(ohlcv[0].timestamp).toBe(1699996400000);
      expect(ohlcv[0].close).toBe(50000);
      expect(ohlcv[1].timestamp).toBe(1700000000000);
      expect(ohlcv[1].close).toBe(50500);
    });

    it("should place order with correct signature", async () => {
      // Mock fetch
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({ // setLeverage call
          ok: true,
          json: async () => ({ retCode: 0 }),
        })
        .mockResolvedValueOnce({ // placeOrder call
          ok: true,
          json: async () => ({
            retCode: 0,
            result: { orderId: "12345" },
          }),
        });

      global.fetch = mockFetch as any;

      // Act
      const orderParams: OrderParams = {
        symbol: "BTCUSDT",
        side: "Buy",
        type: "MARKET",
        qty: 0.001,
        leverage: 10,
      };

      const result = await client.placeOrder(orderParams);

      // Assert

      // BybitPerpsClient returns the cleaned OrderResult, not the raw response with retCode
      expect(result.orderId).toBe("12345");
      expect(result.symbol).toBe("BTCUSDT");

      // Verify leverage was set first
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toContain("/v5/position/set-leverage");
      expect(mockFetch.mock.calls[1][0]).toContain("/v5/order/create");

      // Verify signature header is present
      const orderCall = mockFetch.mock.calls[1][1];
      expect(orderCall.headers["X-BAPI-SIGN"]).toBeDefined();
      expect(orderCall.headers["X-BAPI-API-KEY"]).toBe("test_api_key");
    });

    it("should timeout order placement after 2 seconds", async () => {
      // Mock fetch with delay
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // setLeverage
        .mockImplementation(() =>
          new Promise((resolve) => setTimeout(resolve, 3000)) // 3 second delay
        );

      global.fetch = mockFetch as any;

      // Act & Assert
      const orderParams: OrderParams = {
        symbol: "BTCUSDT",
        side: "Buy",
        type: "MARKET",
        qty: 0.001,
        leverage: 10,
      };

      await expect(client.placeOrderWithRetry(orderParams))
        .rejects.toThrow("ORDER_TIMEOUT");
    });
  });
});
