/**
 * Unit Tests for HunterEventEmitter
 *
 * Tests the event system functionality including event emission,
 * subscription, unsubscription, and type safety.
 */

import {
  HunterEventEmitter,
  hunterEvents,
} from "../../src/events/EventEmitter";
import {
  Absorption,
  AsianRange,
  ExecutionData,
  HologramState,
  JudasSwing,
  SessionState,
  SignalData,
} from "../../src/types";

describe("HunterEventEmitter", () => {
  let eventEmitter: HunterEventEmitter;

  beforeEach(() => {
    // Create a fresh instance for each test
    eventEmitter = new HunterEventEmitter();
  });

  afterEach(() => {
    // Clean up listeners after each test
    eventEmitter.clearAllListeners();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = HunterEventEmitter.getInstance();
      const instance2 = HunterEventEmitter.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(hunterEvents);
    });
  });

  describe("Basic Event Operations", () => {
    it("should emit and receive events", (done) => {
      const testPayload = {
        symbol: "BTCUSDT",
        hologramState: createMockHologramState(),
        timestamp: Date.now(),
      };

      eventEmitter.onEvent("HOLOGRAM_UPDATED", (payload) => {
        expect(payload.symbol).toBe("BTCUSDT");
        expect(payload.hologramState).toBeDefined();
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitEvent("HOLOGRAM_UPDATED", testPayload);
    });

    it("should handle multiple listeners for the same event", () => {
      let listener1Called = false;
      let listener2Called = false;

      const testPayload = {
        symbol: "ETHUSDT",
        hologramState: createMockHologramState(),
        timestamp: Date.now(),
      };

      eventEmitter.onEvent("HOLOGRAM_UPDATED", () => {
        listener1Called = true;
      });

      eventEmitter.onEvent("HOLOGRAM_UPDATED", () => {
        listener2Called = true;
      });

      eventEmitter.emitEvent("HOLOGRAM_UPDATED", testPayload);

      expect(listener1Called).toBe(true);
      expect(listener2Called).toBe(true);
    });

    it("should handle once listeners correctly", () => {
      let callCount = 0;

      const testPayload = {
        symbol: "ADAUSDT",
        hologramState: createMockHologramState(),
        timestamp: Date.now(),
      };

      eventEmitter.onceEvent("HOLOGRAM_UPDATED", () => {
        callCount++;
      });

      // Emit twice
      eventEmitter.emitEvent("HOLOGRAM_UPDATED", testPayload);
      eventEmitter.emitEvent("HOLOGRAM_UPDATED", testPayload);

      expect(callCount).toBe(1);
    });

    it("should remove listeners correctly", () => {
      let callCount = 0;

      const testPayload = {
        symbol: "SOLUSDT",
        hologramState: createMockHologramState(),
        timestamp: Date.now(),
      };

      const listener = () => {
        callCount++;
      };

      eventEmitter.onEvent("HOLOGRAM_UPDATED", listener);
      eventEmitter.emitEvent("HOLOGRAM_UPDATED", testPayload);

      expect(callCount).toBe(1);

      eventEmitter.offEvent("HOLOGRAM_UPDATED", listener);
      eventEmitter.emitEvent("HOLOGRAM_UPDATED", testPayload);

      expect(callCount).toBe(1); // Should not increase
    });
  });

  describe("Convenience Methods", () => {
    it("should emit hologram updated event", (done) => {
      const hologramState = createMockHologramState();

      eventEmitter.onEvent("HOLOGRAM_UPDATED", (payload) => {
        expect(payload.symbol).toBe("BTCUSDT");
        expect(payload.hologramState).toBe(hologramState);
        expect(payload.previousStatus).toBe("NO_PLAY");
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitHologramUpdated("BTCUSDT", hologramState, "NO_PLAY");
    });

    it("should emit session change event", (done) => {
      const previousSession = createMockSessionState("ASIAN");
      const currentSession = createMockSessionState("LONDON");
      const asianRange: AsianRange = {
        high: 50000,
        low: 49000,
        timestamp: Date.now(),
      };

      eventEmitter.onEvent("SESSION_CHANGE", (payload) => {
        expect(payload.previousSession).toBe(previousSession);
        expect(payload.currentSession).toBe(currentSession);
        expect(payload.asianRange).toBe(asianRange);
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitSessionChange(
        previousSession,
        currentSession,
        asianRange,
      );
    });

    it("should emit CVD absorption event", (done) => {
      const absorption: Absorption = {
        price: 50000,
        cvdValue: 1000,
        timestamp: Date.now(),
        confidence: 85,
      };

      eventEmitter.onEvent("CVD_ABSORPTION", (payload) => {
        expect(payload.symbol).toBe("BTCUSDT");
        expect(payload.absorption).toBe(absorption);
        expect(payload.poiPrice).toBe(49950);
        expect(payload.confidence).toBe(85);
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitCVDAbsorption("BTCUSDT", absorption, 49950, 85);
    });

    it("should emit signal generated event", (done) => {
      const signal = createMockSignalData();
      const hologramState = createMockHologramState();
      const sessionState = createMockSessionState("LONDON");

      eventEmitter.onEvent("SIGNAL_GENERATED", (payload) => {
        expect(payload.signal).toBe(signal);
        expect(payload.hologramState).toBe(hologramState);
        expect(payload.sessionState).toBe(sessionState);
        expect(payload.cvdConfirmation).toBe(true);
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitSignalGenerated(
        signal,
        hologramState,
        sessionState,
        true,
      );
    });

    it("should emit execution complete event", (done) => {
      const execution = createMockExecutionData();
      const signal = createMockSignalData();

      eventEmitter.onEvent("EXECUTION_COMPLETE", (payload) => {
        expect(payload.execution).toBe(execution);
        expect(payload.signal).toBe(signal);
        expect(payload.success).toBe(true);
        expect(payload.slippage).toBe(0.05);
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitExecutionComplete(execution, signal, true, 0.05);
    });

    it("should emit error event", (done) => {
      const error = new Error("Test error");
      const context = { symbol: "BTCUSDT", operation: "fetchData" };

      eventEmitter.onEvent("ERROR", (payload) => {
        expect(payload.component).toBe("HologramEngine");
        expect(payload.error).toBe(error);
        expect(payload.severity).toBe("HIGH");
        expect(payload.context).toBe(context);
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitError("HologramEngine", error, "HIGH", context);
    });

    it("should emit scan complete event", (done) => {
      eventEmitter.onEvent("SCAN_COMPLETE", (payload) => {
        expect(payload.symbolsScanned).toBe(100);
        expect(payload.aPlus).toBe(5);
        expect(payload.bAlignment).toBe(15);
        expect(payload.conflicts).toBe(20);
        expect(payload.duration).toBe(25000);
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitScanComplete(100, 5, 15, 20, 25000);
    });

    it("should emit Judas swing event", (done) => {
      const judasSwing: JudasSwing = {
        type: "SWEEP_HIGH",
        sweptPrice: 50100,
        reversalPrice: 49950,
        direction: "SHORT",
        confidence: 90,
      };

      const asianRange: AsianRange = {
        high: 50000,
        low: 49000,
        timestamp: Date.now(),
      };

      eventEmitter.onEvent("JUDAS_SWING_DETECTED", (payload) => {
        expect(payload.judasSwing).toBe(judasSwing);
        expect(payload.sessionType).toBe("LONDON");
        expect(payload.asianRange).toBe(asianRange);
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitJudasSwing(judasSwing, "LONDON", asianRange);
    });

    it("should emit POI detected event", (done) => {
      eventEmitter.onEvent("POI_DETECTED", (payload) => {
        expect(payload.symbol).toBe("ETHUSDT");
        expect(payload.poiType).toBe("ORDER_BLOCK");
        expect(payload.price).toBe(3500);
        expect(payload.confidence).toBe(95);
        expect(payload.distance).toBe(0.5);
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitPOIDetected("ETHUSDT", "ORDER_BLOCK", 3500, 95, 0.5);
    });

    it("should emit risk warning event", (done) => {
      eventEmitter.onEvent("RISK_WARNING", (payload) => {
        expect(payload.type).toBe("DRAWDOWN");
        expect(payload.severity).toBe("WARNING");
        expect(payload.value).toBe(0.04);
        expect(payload.threshold).toBe(0.03);
        expect(payload.message).toBe("Daily drawdown approaching limit");
        expect(payload.timestamp).toBeGreaterThan(0);
        done();
      });

      eventEmitter.emitRiskWarning(
        "DRAWDOWN",
        "WARNING",
        0.04,
        0.03,
        "Daily drawdown approaching limit",
      );
    });
  });

  describe("Event Statistics", () => {
    it("should return correct event statistics", () => {
      const listener1 = () => {};
      const listener2 = () => {};

      eventEmitter.onEvent("HOLOGRAM_UPDATED", listener1);
      eventEmitter.onEvent("HOLOGRAM_UPDATED", listener2);
      eventEmitter.onEvent("SESSION_CHANGE", listener1);

      const stats = eventEmitter.getEventStats();

      expect(stats["HOLOGRAM_UPDATED"]).toBe(2);
      expect(stats["SESSION_CHANGE"]).toBe(1);
    });

    it("should clear all listeners", () => {
      const listener = () => {};

      eventEmitter.onEvent("HOLOGRAM_UPDATED", listener);
      eventEmitter.onEvent("SESSION_CHANGE", listener);

      let stats = eventEmitter.getEventStats();
      expect(Object.keys(stats)).toHaveLength(2);

      eventEmitter.clearAllListeners();

      stats = eventEmitter.getEventStats();
      expect(Object.keys(stats)).toHaveLength(0);
    });
  });

  describe("Error Handling", () => {
    it("should propagate listener errors as expected", () => {
      const errorListener = () => {
        throw new Error("Listener error");
      };

      eventEmitter.onEvent("HOLOGRAM_UPDATED", errorListener);

      const testPayload = {
        symbol: "BTCUSDT",
        hologramState: createMockHologramState(),
        timestamp: Date.now(),
      };

      // EventEmitter propagates errors from listeners
      expect(() => {
        eventEmitter.emitEvent("HOLOGRAM_UPDATED", testPayload);
      }).toThrow("Listener error");
    });

    it("should handle multiple listeners where some throw errors", () => {
      const errorListener = () => {
        throw new Error("Listener error");
      };

      const goodListener = jest.fn();

      // Add good listener first
      eventEmitter.onEvent("HOLOGRAM_UPDATED", goodListener);
      // Add error listener second
      eventEmitter.onEvent("HOLOGRAM_UPDATED", errorListener);

      const testPayload = {
        symbol: "BTCUSDT",
        hologramState: createMockHologramState(),
        timestamp: Date.now(),
      };

      // The good listener should be called before the error is thrown
      expect(() => {
        eventEmitter.emitEvent("HOLOGRAM_UPDATED", testPayload);
      }).toThrow("Listener error");

      expect(goodListener).toHaveBeenCalled();
    });
  });

  // Helper functions to create mock data
  function createMockHologramState(): HologramState {
    return {
      symbol: "BTCUSDT",
      timestamp: Date.now(),
      daily: {
        timeframe: "1D",
        trend: "BULL",
        dealingRange: {
          high: 51000,
          low: 49000,
          midpoint: 50000,
          premiumThreshold: 50000,
          discountThreshold: 50000,
          range: 2000,
        },
        currentPrice: 50500,
        location: "PREMIUM",
        fractals: [],
        bos: [],
        mss: null,
      },
      h4: {
        timeframe: "4H",
        trend: "BULL",
        dealingRange: {
          high: 50800,
          low: 49800,
          midpoint: 50300,
          premiumThreshold: 50300,
          discountThreshold: 50300,
          range: 1000,
        },
        currentPrice: 50500,
        location: "PREMIUM",
        fractals: [],
        bos: [],
        mss: null,
      },
      m15: {
        timeframe: "15m",
        trend: "BULL",
        dealingRange: {
          high: 50600,
          low: 50400,
          midpoint: 50500,
          premiumThreshold: 50500,
          discountThreshold: 50500,
          range: 200,
        },
        currentPrice: 50500,
        location: "EQUILIBRIUM",
        fractals: [],
        bos: [],
        mss: null,
      },
      alignmentScore: 85,
      status: "A+",
      veto: {
        vetoed: false,
        reason: null,
        direction: null,
      },
      rsScore: 0.05,
      direction: null,
    };
  }

  function createMockSessionState(
    type: "ASIAN" | "LONDON" | "NY" | "DEAD_ZONE",
  ): SessionState {
    const now = Date.now();
    return {
      type,
      startTime: now - 3600000, // 1 hour ago
      endTime: now + 3600000, // 1 hour from now
      timeRemaining: 3600000, // 1 hour remaining
    };
  }

  function createMockSignalData(): SignalData {
    return {
      symbol: "BTCUSDT",
      direction: "LONG",
      hologramStatus: "A+",
      alignmentScore: 85,
      rsScore: 0.05,
      sessionType: "LONDON",
      poiType: "ORDER_BLOCK",
      cvdConfirmation: true,
      confidence: 90,
      entryPrice: 50000,
      stopLoss: 49250,
      takeProfit: 52250,
      positionSize: 0.1,
      leverage: 3,
      timestamp: Date.now(),
    };
  }

  function createMockExecutionData(): ExecutionData {
    return {
      signalId: "signal-123",
      orderId: "order-456",
      symbol: "BTCUSDT",
      side: "Buy",
      qty: 0.1,
      fillPrice: 50025,
      slippage: 0.05,
      fees: 2.5,
      timestamp: Date.now(),
    };
  }
});
