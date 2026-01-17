/**
 * Unit tests for CVDCalculator
 */

import { CVDCalculator } from "../../src/calculators/CVDCalculator";
import { Trade } from "../../src/types/index";

describe("CVDCalculator", () => {
  let calculator: CVDCalculator;
  const baseTime = 1700000000000; // Fixed timestamp for testing

  beforeEach(() => {
    calculator = new CVDCalculator();
  });

  describe("recordTrade", () => {
    it("should record a buy trade correctly", () => {
      const trade: Trade = {
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.5,
        time: baseTime,
        isBuyerMaker: false, // Buyer is aggressor = buy
      };

      calculator.recordTrade(trade);

      const history = calculator.getTradeHistory("BTCUSDT");
      expect(history).toHaveLength(1);
      expect(history[0].qty).toBe(1.5);
      expect(history[0].isBuy).toBe(true);
    });

    it("should record a sell trade correctly", () => {
      const trade: Trade = {
        symbol: "BTCUSDT",
        price: 50000,
        qty: 2.0,
        time: baseTime,
        isBuyerMaker: true, // Seller is aggressor = sell
      };

      calculator.recordTrade(trade);

      const history = calculator.getTradeHistory("BTCUSDT");
      expect(history).toHaveLength(1);
      expect(history[0].qty).toBe(2.0);
      expect(history[0].isBuy).toBe(false);
    });

    it("should maintain separate history for different symbols", () => {
      const btcTrade: Trade = {
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime,
        isBuyerMaker: false,
      };

      const ethTrade: Trade = {
        symbol: "ETHUSDT",
        price: 3000,
        qty: 5.0,
        time: baseTime,
        isBuyerMaker: true,
      };

      calculator.recordTrade(btcTrade);
      calculator.recordTrade(ethTrade);

      expect(calculator.getTradeHistory("BTCUSDT")).toHaveLength(1);
      expect(calculator.getTradeHistory("ETHUSDT")).toHaveLength(1);
    });

    it("should remove trades older than 10 minutes", () => {
      // Add old trade
      const oldTrade: Trade = {
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime,
        isBuyerMaker: false,
      };
      calculator.recordTrade(oldTrade);

      // Add new trade 11 minutes later
      const newTrade: Trade = {
        symbol: "BTCUSDT",
        price: 50100,
        qty: 1.5,
        time: baseTime + 11 * 60 * 1000, // 11 minutes later
        isBuyerMaker: false,
      };
      calculator.recordTrade(newTrade);

      // Old trade should be removed
      const history = calculator.getTradeHistory("BTCUSDT");
      expect(history).toHaveLength(1);
      expect(history[0].qty).toBe(1.5);
    });
  });

  describe("calcCVD", () => {
    it("should return 0 for symbol with no history", async () => {
      const cvd = await calculator.calcCVD("BTCUSDT", 60);
      expect(cvd).toBe(0);
    });

    it("should calculate positive CVD for net buying", async () => {
      // Add 3 buy trades
      for (let i = 0; i < 3; i++) {
        calculator.recordTrade({
          symbol: "BTCUSDT",
          price: 50000,
          qty: 1.0,
          time: baseTime + i * 1000,
          isBuyerMaker: false, // Buy
        });
      }

      // Add 1 sell trade
      calculator.recordTrade({
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime + 3000,
        isBuyerMaker: true, // Sell
      });

      const cvd = await calculator.calcCVD("BTCUSDT", 60);
      // All 4 trades are within 60 seconds: 3 buys - 1 sell = +2
      expect(cvd).toBe(2.0);
    });

    it("should calculate negative CVD for net selling", async () => {
      // Add 1 buy trade
      calculator.recordTrade({
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime,
        isBuyerMaker: false, // Buy
      });

      // Add 3 sell trades
      for (let i = 1; i < 4; i++) {
        calculator.recordTrade({
          symbol: "BTCUSDT",
          price: 50000,
          qty: 1.0,
          time: baseTime + i * 1000,
          isBuyerMaker: true, // Sell
        });
      }

      const cvd = await calculator.calcCVD("BTCUSDT", 60);
      expect(cvd).toBe(-2.0); // 1 buy - 3 sells = -2
    });

    it("should respect time window boundaries", async () => {
      // Add trades at different times
      calculator.recordTrade({
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime, // 0 seconds
        isBuyerMaker: false, // Buy
      });

      calculator.recordTrade({
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime + 30 * 1000, // 30 seconds
        isBuyerMaker: false, // Buy
      });

      calculator.recordTrade({
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime + 90 * 1000, // 90 seconds
        isBuyerMaker: false, // Buy
      });

      // Calculate CVD for last 60 seconds (should only include last 2 trades)
      const cvd = await calculator.calcCVD("BTCUSDT", 60);
      expect(cvd).toBe(2.0); // Only trades at 30s and 90s
    });

    it("should support offset for historical CVD comparison", async () => {
      // Add trades over 10 minutes
      // i=0: baseTime + 0 (minute 0) - isBuyerMaker=true (sell)
      // i=1: baseTime + 60s (minute 1) - isBuyerMaker=true (sell)
      // i=2: baseTime + 120s (minute 2) - isBuyerMaker=true (sell)
      // i=3: baseTime + 180s (minute 3) - isBuyerMaker=true (sell)
      // i=4: baseTime + 240s (minute 4) - isBuyerMaker=true (sell)
      // i=5: baseTime + 300s (minute 5) - isBuyerMaker=false (buy)
      // i=6: baseTime + 360s (minute 6) - isBuyerMaker=false (buy)
      // i=7: baseTime + 420s (minute 7) - isBuyerMaker=false (buy)
      // i=8: baseTime + 480s (minute 8) - isBuyerMaker=false (buy)
      // i=9: baseTime + 540s (minute 9) - isBuyerMaker=false (buy)
      for (let i = 0; i < 10; i++) {
        calculator.recordTrade({
          symbol: "BTCUSDT",
          price: 50000,
          qty: 1.0,
          time: baseTime + i * 60 * 1000, // Every minute
          isBuyerMaker: i < 5, // First 5 are sells, last 5 are buys
        });
      }

      // CVD for last 5 minutes (300s window from minute 9)
      // Window: [minute 4.5 to minute 9] = trades at minutes 5,6,7,8,9 = 5 buys
      // But actually, the window is from (baseTime + 540s - 300s) to (baseTime + 540s)
      // = from baseTime + 240s to baseTime + 540s
      // This includes trades at: 240s (sell), 300s (buy), 360s (buy), 420s (buy), 480s (buy), 540s (buy)
      // = 1 sell + 5 buys = CVD of 4
      const recentCVD = await calculator.calcCVD("BTCUSDT", 300);
      expect(recentCVD).toBe(4.0); // 5 buys - 1 sell = 4

      // CVD from 5-10 minutes ago (300s window, offset 300s)
      // Window: [minute 0 to minute 4.5] = trades at minutes 0,1,2,3,4 = 5 sells
      // Window is from (baseTime + 540s - 300s - 300s) to (baseTime + 540s - 300s)
      // = from baseTime - 60s to baseTime + 240s
      // This includes trades at: 0s (sell), 60s (sell), 120s (sell), 180s (sell), 240s (sell)
      // = 5 sells = CVD of -5
      const historicalCVD = await calculator.calcCVD("BTCUSDT", 300, 300);
      expect(historicalCVD).toBe(-5.0);
    });

    it("should handle different quantity sizes", async () => {
      calculator.recordTrade({
        symbol: "BTCUSDT",
        price: 50000,
        qty: 2.5,
        time: baseTime,
        isBuyerMaker: false, // Buy
      });

      calculator.recordTrade({
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime + 1000,
        isBuyerMaker: true, // Sell
      });

      const cvd = await calculator.calcCVD("BTCUSDT", 60);
      expect(cvd).toBe(1.5); // 2.5 buy - 1.0 sell = 1.5
    });

    it("should return 0 when no trades in window", async () => {
      // Add trade outside the window
      calculator.recordTrade({
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime,
        isBuyerMaker: false,
      });

      // Calculate CVD for last 60 seconds with 5 minute offset
      // (looking at 5-6 minutes ago, but trade is at 0 minutes)
      const cvd = await calculator.calcCVD("BTCUSDT", 60, 300);
      expect(cvd).toBe(0);
    });
  });

  describe("OI Wipeout use case", () => {
    it("should detect CVD flip from red to green", async () => {
      const symbol = "BTCUSDT";

      // Simulate selling pressure (red CVD)
      for (let i = 0; i < 5; i++) {
        calculator.recordTrade({
          symbol,
          price: 50000,
          qty: 1.0,
          time: baseTime + i * 1000,
          isBuyerMaker: true, // Sell
        });
      }

      // Check CVD is negative
      const redCVD = await calculator.calcCVD(symbol, 60);
      expect(redCVD).toBeLessThan(0);

      // Simulate buying pressure returning (green CVD)
      for (let i = 5; i < 10; i++) {
        calculator.recordTrade({
          symbol,
          price: 50000,
          qty: 1.5,
          time: baseTime + i * 1000,
          isBuyerMaker: false, // Buy
        });
      }

      // Check CVD flipped to positive
      const greenCVD = await calculator.calcCVD(symbol, 60);
      expect(greenCVD).toBeGreaterThan(0);
    });
  });

  describe("Funding Squeeze use case", () => {
    it("should detect rising CVD", async () => {
      const symbol = "BTCUSDT";

      // Simulate weak buying 5-10 minutes ago
      for (let i = 0; i < 3; i++) {
        calculator.recordTrade({
          symbol,
          price: 50000,
          qty: 1.0,
          time: baseTime + i * 1000,
          isBuyerMaker: false, // Buy
        });
      }

      // Simulate stronger buying in last 5 minutes
      for (let i = 0; i < 8; i++) {
        calculator.recordTrade({
          symbol,
          price: 50000,
          qty: 1.0,
          time: baseTime + (300 + i) * 1000, // 5 minutes later
          isBuyerMaker: false, // Buy
        });
      }

      // Compare CVD
      const oldCVD = await calculator.calcCVD(symbol, 300, 300); // 5-10 min ago
      const newCVD = await calculator.calcCVD(symbol, 300); // Last 5 min

      expect(newCVD).toBeGreaterThan(oldCVD);
    });
  });

  describe("utility methods", () => {
    it("should clear trade history", () => {
      calculator.recordTrade({
        symbol: "BTCUSDT",
        price: 50000,
        qty: 1.0,
        time: baseTime,
        isBuyerMaker: false,
      });

      expect(calculator.getTradeCount("BTCUSDT")).toBe(1);

      calculator.clearTradeHistory("BTCUSDT");

      expect(calculator.getTradeCount("BTCUSDT")).toBe(0);
    });

    it("should return correct trade count", () => {
      expect(calculator.getTradeCount("BTCUSDT")).toBe(0);

      for (let i = 0; i < 5; i++) {
        calculator.recordTrade({
          symbol: "BTCUSDT",
          price: 50000,
          qty: 1.0,
          time: baseTime + i * 1000,
          isBuyerMaker: false,
        });
      }

      expect(calculator.getTradeCount("BTCUSDT")).toBe(5);
    });
  });
});
