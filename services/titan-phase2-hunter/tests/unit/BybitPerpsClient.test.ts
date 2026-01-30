/**
 * Unit tests for BybitPerpsClient
 */

import { BybitPerpsClient } from "../../src/exchanges/BybitPerpsClient";
import { OrderParams, OrderStatus } from "../../src/types";

// Mock global fetch (Node.js 18+ native fetch)
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("BybitPerpsClient", () => {
  let client: BybitPerpsClient;
  const mockApiKey = "test-api-key";
  const mockApiSecret = "test-api-secret";

  beforeEach(() => {
    jest.clearAllMocks();
    client = new BybitPerpsClient(mockApiKey, mockApiSecret);
  });

  afterEach(() => {
    client.clearCache();
  });

  // Enabled: Fixed by mocking global fetch instead of node-fetch
  describe("fetchTopSymbols", () => {
    it("should fetch and return top 100 symbols by volume", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              symbol: "BTCUSDT",
              turnover24h: "1000000000",
              lastPrice: "50000",
            },
            {
              symbol: "ETHUSDT",
              turnover24h: "500000000",
              lastPrice: "3000",
            },
            {
              symbol: "ADAUSDT",
              turnover24h: "100000000",
              lastPrice: "0.5",
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const symbols = await client.fetchTopSymbols();

      expect(symbols).toEqual(["BTCUSDT", "ETHUSDT", "ADAUSDT"]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v5/market/tickers"),
        expect.objectContaining({
          method: "GET",
        }),
      );
    });

    it("should return cached data on subsequent calls", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              symbol: "BTCUSDT",
              turnover24h: "1000000000",
              lastPrice: "50000",
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      // First call
      const symbols1 = await client.fetchTopSymbols();

      // Second call (should use cache)
      const symbols2 = await client.fetchTopSymbols();

      expect(symbols1).toEqual(symbols2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should handle API errors", async () => {
      const mockResponse = {
        retCode: 10001,
        retMsg: "Invalid API key",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      await expect(client.fetchTopSymbols()).rejects.toThrow(
        "Bybit API error: Invalid API key",
      );
    });
  });

  // Enabled: Fixed by mocking global fetch instead of node-fetch
  describe("fetchOHLCV", () => {
    it("should fetch OHLCV data and convert to standard format", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          symbol: "BTCUSDT",
          category: "linear",
          list: [
            ["1640995200000", "50000", "51000", "49000", "50500", "100"],
            ["1640995260000", "50500", "52000", "50000", "51500", "150"],
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const ohlcv = await client.fetchOHLCV("BTCUSDT", "1m", 2);

      expect(ohlcv).toHaveLength(2);
      expect(ohlcv[0]).toEqual({
        timestamp: 1640995200000,
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 100,
      });
      expect(ohlcv[1]).toEqual({
        timestamp: 1640995260000,
        open: 50500,
        high: 52000,
        low: 50000,
        close: 51500,
        volume: 150,
      });
    });

    it("should convert intervals correctly", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          symbol: "BTCUSDT",
          category: "linear",
          list: [],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      await client.fetchOHLCV("BTCUSDT", "4h", 100);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("interval=240"),
        expect.any(Object),
      );
    });

    it("should cache OHLCV data", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          symbol: "BTCUSDT",
          category: "linear",
          list: [
            ["1640995200000", "50000", "51000", "49000", "50500", "100"],
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      // First call
      const ohlcv1 = await client.fetchOHLCV("BTCUSDT", "1m", 1);

      // Second call (should use cache)
      const ohlcv2 = await client.fetchOHLCV("BTCUSDT", "1m", 1);

      expect(ohlcv1).toEqual(ohlcv2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // Enabled: Fixed by mocking global fetch instead of node-fetch
  describe("getCurrentPrice", () => {
    it("should fetch current price for symbol", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              symbol: "BTCUSDT",
              lastPrice: "50000.50",
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const price = await client.getCurrentPrice("BTCUSDT");

      expect(price).toBe(50000.50);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("symbol=BTCUSDT"),
        expect.any(Object),
      );
    });

    it("should handle missing ticker data", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      await expect(client.getCurrentPrice("INVALID")).rejects.toThrow(
        "No ticker data found",
      );
    });
  });

  // Enabled: Fixed by mocking global fetch instead of node-fetch
  describe("getEquity", () => {
    it("should fetch account equity", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              totalEquity: "10000.50",
              totalWalletBalance: "9500.00",
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const equity = await client.getEquity();

      expect(equity).toBe(10000.50);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v5/account/wallet-balance"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-BAPI-API-KEY": mockApiKey,
            "X-BAPI-SIGN": expect.any(String),
          }),
        }),
      );
    });
  });

  // Enabled: Fixed by mocking global fetch instead of node-fetch
  describe("placeOrder", () => {
    it("should place market order successfully", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          orderId: "12345",
          orderLinkId: "",
          symbol: "BTCUSDT",
          createTime: "1640995200000",
          side: "Buy",
          orderType: "Market",
          qty: "0.1",
          price: "",
          avgPrice: "50000",
          orderStatus: "Filled",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const orderParams: OrderParams = {
        phase: "phase2",
        symbol: "BTCUSDT",
        side: "Buy",
        type: "MARKET",
        qty: 0.1,
        leverage: 5,
      };

      const result = await client.placeOrder(orderParams);

      expect(result).toEqual({
        orderId: "12345",
        symbol: "BTCUSDT",
        side: "Buy",
        qty: 0.1,
        price: 50000,
        status: "FILLED",
        timestamp: 1640995200000,
      });
    });

    it("should place limit order with price", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          orderId: "12346",
          symbol: "BTCUSDT",
          createTime: "1640995200000",
          side: "Buy",
          orderType: "Limit",
          qty: "0.1",
          price: "49000",
          orderStatus: "New",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const orderParams: OrderParams = {
        phase: "phase2",
        symbol: "BTCUSDT",
        side: "Buy",
        type: "LIMIT",
        price: 49000,
        qty: 0.1,
        leverage: 5,
      };

      const result = await client.placeOrder(orderParams);

      expect(result.status).toBe("NEW");
      expect(result.price).toBe(49000);
    });

    it("should place post-only order", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          orderId: "12347",
          symbol: "BTCUSDT",
          createTime: "1640995200000",
          side: "Buy",
          orderType: "Limit",
          qty: "0.1",
          price: "49000",
          orderStatus: "New",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const orderParams: OrderParams = {
        phase: "phase2",
        symbol: "BTCUSDT",
        side: "Buy",
        type: "POST_ONLY",
        price: 49000,
        qty: 0.1,
        leverage: 5,
      };

      await client.placeOrder(orderParams);

      // Verify POST_ONLY is converted to Limit with PostOnly timeInForce
      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]!.body as string,
      );
      expect(requestBody.orderType).toBe("Limit");
      expect(requestBody.timeInForce).toBe("PostOnly");
    });

    it("should include stop loss and take profit", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          orderId: "12348",
          symbol: "BTCUSDT",
          createTime: "1640995200000",
          side: "Buy",
          orderType: "Market",
          qty: "0.1",
          orderStatus: "Filled",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const orderParams: OrderParams = {
        phase: "phase2",
        symbol: "BTCUSDT",
        side: "Buy",
        type: "MARKET",
        qty: 0.1,
        leverage: 5,
        stopLoss: 48000,
        takeProfit: 52000,
      };

      await client.placeOrder(orderParams);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]!.body as string,
      );
      expect(requestBody.stopLoss).toBe("48000");
      expect(requestBody.takeProfit).toBe("52000");
    });

    it("should throw error for limit order without price", async () => {
      const orderParams: OrderParams = {
        phase: "phase2",
        symbol: "BTCUSDT",
        side: "Buy",
        type: "LIMIT",
        qty: 0.1,
        leverage: 5,
      };

      await expect(client.placeOrder(orderParams)).rejects.toThrow(
        "Price is required for limit orders",
      );
    });
  });

  // Enabled: Fixed by mocking global fetch instead of node-fetch
  describe("placeOrderWithRetry", () => {
    it("should retry failed orders", async () => {
      // First call fails
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      // Second call succeeds
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          orderId: "12349",
          symbol: "BTCUSDT",
          createTime: "1640995200000",
          side: "Buy",
          orderType: "Market",
          qty: "0.1",
          orderStatus: "Filled",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const orderParams: OrderParams = {
        phase: "phase2",
        symbol: "BTCUSDT",
        side: "Buy",
        type: "MARKET",
        qty: 0.1,
        leverage: 5,
      };

      const result = await client.placeOrderWithRetry(orderParams, 1);

      expect(result.orderId).toBe("12349");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should fail after max retries", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const orderParams: OrderParams = {
        phase: "phase2",
        symbol: "BTCUSDT",
        side: "Buy",
        type: "MARKET",
        qty: 0.1,
        leverage: 5,
      };

      await expect(client.placeOrderWithRetry(orderParams, 1)).rejects.toThrow(
        "Order failed after 2 attempts",
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // Enabled: Fixed by mocking global fetch instead of node-fetch
  describe("setLeverage", () => {
    it("should set leverage for symbol", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await client.setLeverage("BTCUSDT", 10);

      expect(result).toBe(true);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]!.body as string,
      );
      expect(requestBody.symbol).toBe("BTCUSDT");
      expect(requestBody.buyLeverage).toBe("10");
      expect(requestBody.sellLeverage).toBe("10");
    });
  });

  // Enabled: Fixed by mocking global fetch instead of node-fetch
  describe("setStopLoss", () => {
    it("should set stop loss for position", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await client.setStopLoss("BTCUSDT", 48000);

      expect(result).toBe(true);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]!.body as string,
      );
      expect(requestBody.symbol).toBe("BTCUSDT");
      expect(requestBody.stopLoss).toBe("48000");
      expect(requestBody.positionIdx).toBe("0");
    });
  });

  // Enabled: Fixed by mocking global fetch instead of node-fetch
  describe("setTakeProfit", () => {
    it("should set take profit for position", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await client.setTakeProfit("BTCUSDT", 52000);

      expect(result).toBe(true);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]!.body as string,
      );
      expect(requestBody.symbol).toBe("BTCUSDT");
      expect(requestBody.takeProfit).toBe("52000");
      expect(requestBody.positionIdx).toBe("0");
    });
  });

  // SKIPPED: Mock fetch issues - response not properly mocked for async flow
  describe("getOrderStatus", () => {
    it("should get order status", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              orderId: "12345",
              orderStatus: "Filled",
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const status = await client.getOrderStatus("12345", "BTCUSDT");

      expect(status).toBe("FILLED");
    });

    it("should handle order not found", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      await expect(client.getOrderStatus("invalid", "BTCUSDT")).rejects.toThrow(
        "Order invalid not found",
      );
    });
  });

  // SKIPPED: Mock fetch issues - response not properly mocked for async flow
  describe("cancelOrder", () => {
    it("should cancel order successfully", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const result = await client.cancelOrder("12345", "BTCUSDT");

      expect(result).toBe(true);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]!.body as string,
      );
      expect(requestBody.orderId).toBe("12345");
      expect(requestBody.symbol).toBe("BTCUSDT");
    });
  });

  // SKIPPED: Mock fetch issues - response not properly mocked for async flow
  describe("getPositionInfo", () => {
    it("should get position info", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              symbol: "BTCUSDT",
              side: "Buy",
              size: "0.1",
              avgPrice: "50000",
              unrealisedPnl: "100",
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const position = await client.getPositionInfo("BTCUSDT");

      expect(position).toEqual({
        symbol: "BTCUSDT",
        side: "Buy",
        size: "0.1",
        avgPrice: "50000",
        unrealisedPnl: "100",
      });
    });

    it("should return null for no position", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const position = await client.getPositionInfo("BTCUSDT");

      expect(position).toBeNull();
    });
  });

  // SKIPPED: Mock fetch issues - mockResolvedValue persists across tests incorrectly
  describe("cache management", () => {
    it("should clear cache", () => {
      client.clearCache();
      expect(client.getCacheSize()).toBe(0);
    });

    it("should track cache size", async () => {
      const mockResponse = {
        retCode: 0,
        retMsg: "OK",
        result: { list: [] },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as any);

      await client.fetchTopSymbols();
      expect(client.getCacheSize()).toBe(1);

      await client.fetchOHLCV("BTCUSDT", "1m");
      expect(client.getCacheSize()).toBe(2);
    });
  });

  // SKIPPED: Error handling mock expectations don't match actual error message wrapping
  // The client wraps errors with "Failed to get current price" prefix which breaks expectations
  describe("error handling", () => {
    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      await expect(client.getCurrentPrice("BTCUSDT")).rejects.toThrow(
        "HTTP 500: Internal Server Error",
      );
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.getCurrentPrice("BTCUSDT")).rejects.toThrow(
        "Request failed: Network error",
      );
    });

    it("should handle API errors", async () => {
      const mockResponse = {
        retCode: 10001,
        retMsg: "Invalid API key",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      await expect(client.getCurrentPrice("BTCUSDT")).rejects.toThrow(
        "Bybit API error: Invalid API key",
      );
    });
  });
});
