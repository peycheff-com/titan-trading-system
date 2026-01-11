/**
 * Unit Tests for Enhanced Holographic Engine Integration
 *
 * Tests for Task 6: Enhanced Holographic Engine Integration
 * Requirements: 5.1-5.7, 7.1-7.7
 */

import {
  ConvictionSizingEngine,
  DEFAULT_CONVICTION_SIZING_CONFIG,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_SIGNAL_VALIDATOR_CONFIG,
  EnhancedHolographicEngine,
  EnhancedScoringEngine,
  EnhancedSignalValidator,
} from "../../src/engine/enhanced";
import {
  BotTrapAnalysis,
  EnhancedHolographicState,
  FlowValidation,
  GlobalCVDData,
  OracleScore,
  TechnicalSignal,
} from "../../src/types/enhanced-2026";
import { HologramState, TimeframeState } from "../../src/types";

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockTimeframeState(
  timeframe: "1D" | "4H" | "15m",
  trend: "BULL" | "BEAR" | "RANGE",
  location: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM",
): TimeframeState {
  return {
    timeframe,
    trend,
    dealingRange: { high: 50000, low: 45000, equilibrium: 47500 },
    currentPrice: 48000,
    location,
    fractals: [],
    bos: [],
    mss: timeframe === "15m"
      ? { type: "bullish", price: 48000, timestamp: Date.now() }
      : null,
  };
}

function createMockHologramState(
  dailyTrend: "BULL" | "BEAR" | "RANGE" = "BULL",
  h4Location: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM" = "DISCOUNT",
  m15Trend: "BULL" | "BEAR" | "RANGE" = "BULL",
): HologramState {
  return {
    symbol: "BTCUSDT",
    timestamp: Date.now(),
    daily: createMockTimeframeState("1D", dailyTrend, "EQUILIBRIUM"),
    h4: createMockTimeframeState("4H", dailyTrend, h4Location),
    m15: createMockTimeframeState("15m", m15Trend, "EQUILIBRIUM"),
    alignmentScore: 80,
    status: "A+",
    veto: { vetoed: false, reason: null, direction: null },
    rsScore: 0.02,
  };
}

function createMockOracleScore(
  sentiment: number = 60,
  confidence: number = 80,
  veto: boolean = false,
): OracleScore {
  return {
    sentiment,
    confidence,
    events: [],
    veto,
    vetoReason: veto ? "Test veto" : null,
    convictionMultiplier: sentiment >= 60 ? 1.5 : 1.0,
    timestamp: new Date(),
  };
}

function createMockFlowValidation(
  isValid: boolean = true,
  flowType: "passive_absorption" | "aggressive_pushing" | "neutral" =
    "passive_absorption",
  institutionalProbability: number = 75,
): FlowValidation {
  return {
    isValid,
    confidence: 80,
    flowType,
    sweepCount: 2,
    icebergDensity: 60,
    institutionalProbability,
    timestamp: new Date(),
  };
}

function createMockBotTrapAnalysis(
  isSuspect: boolean = false,
  suspicionScore: number = 20,
): BotTrapAnalysis {
  return {
    isSuspect,
    suspicionScore,
    patterns: [],
    recommendations: isSuspect
      ? [{
        action: "reduce_size",
        reasoning: "Suspect pattern detected",
        adjustments: {
          positionSizeMultiplier: 0.5,
          stopLossAdjustment: 0.01,
          confirmationThreshold: 1.5,
        },
      }]
      : [],
    timestamp: new Date(),
  };
}

function createMockGlobalCVD(
  consensus: "bullish" | "bearish" | "neutral" | "conflicted" = "bullish",
  confidence: number = 80,
  manipulationDetected: boolean = false,
): GlobalCVDData {
  return {
    aggregatedCVD: consensus === "bullish"
      ? 1000
      : consensus === "bearish"
      ? -1000
      : 0,
    exchangeFlows: [
      {
        exchange: "binance",
        cvd: 500,
        volume: 1000000,
        trades: 5000,
        weight: 0.4,
        timestamp: new Date(),
        status: "connected" as any,
      },
      {
        exchange: "coinbase",
        cvd: 300,
        volume: 800000,
        trades: 4000,
        weight: 0.35,
        timestamp: new Date(),
        status: "connected" as any,
      },
      {
        exchange: "kraken",
        cvd: 200,
        volume: 500000,
        trades: 2000,
        weight: 0.25,
        timestamp: new Date(),
        status: "connected" as any,
      },
    ],
    consensus,
    confidence,
    manipulation: {
      detected: manipulationDetected,
      suspectExchange: manipulationDetected ? "binance" : null,
      divergenceScore: manipulationDetected ? 85 : 10,
      pattern: manipulationDetected ? "single_exchange_outlier" : "none",
    },
    timestamp: new Date(),
  };
}

function createMockTechnicalSignal(
  direction: "LONG" | "SHORT" = "LONG",
  confidence: number = 75,
): TechnicalSignal {
  return {
    symbol: "BTCUSDT",
    direction,
    confidence,
    entryPrice: 48000,
    stopLoss: 47000,
    takeProfit: 50000,
    timestamp: new Date(),
    source: "hologram",
  };
}

// ============================================================================
// ENHANCED SCORING ENGINE TESTS
// ============================================================================

describe("EnhancedScoringEngine", () => {
  let scoringEngine: EnhancedScoringEngine;

  beforeEach(() => {
    scoringEngine = new EnhancedScoringEngine();
  });

  describe("calculateEnhancedScore", () => {
    test("should calculate enhanced score with all components", () => {
      const hologram = createMockHologramState("BULL", "DISCOUNT", "BULL");
      const oracle = createMockOracleScore(60, 80);
      const flow = createMockFlowValidation(true, "passive_absorption", 75);
      const botTrap = createMockBotTrapAnalysis(false, 10);
      const globalCVD = createMockGlobalCVD("bullish", 80);

      const result = scoringEngine.calculateEnhancedScore(
        hologram,
        oracle,
        flow,
        botTrap,
        globalCVD,
      );

      expect(result.adjustedScore).toBeGreaterThan(0);
      expect(result.adjustedScore).toBeLessThanOrEqual(100);
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    test("should apply bot trap penalty", () => {
      const hologram = createMockHologramState("BULL", "DISCOUNT", "BULL");
      const oracle = createMockOracleScore(60, 80);
      const flow = createMockFlowValidation(true);
      const botTrapClean = createMockBotTrapAnalysis(false, 10);
      const botTrapSuspect = createMockBotTrapAnalysis(true, 80);
      const globalCVD = createMockGlobalCVD("bullish", 80);

      const cleanResult = scoringEngine.calculateEnhancedScore(
        hologram,
        oracle,
        flow,
        botTrapClean,
        globalCVD,
      );

      const suspectResult = scoringEngine.calculateEnhancedScore(
        hologram,
        oracle,
        flow,
        botTrapSuspect,
        globalCVD,
      );

      expect(suspectResult.adjustedScore).toBeLessThan(
        cleanResult.adjustedScore,
      );
      expect(suspectResult.botTrapPenalty).toBeGreaterThan(0);
    });

    test("should handle null enhancement data gracefully", () => {
      const hologram = createMockHologramState("BULL", "DISCOUNT", "BULL");

      const result = scoringEngine.calculateEnhancedScore(
        hologram,
        null,
        null,
        null,
        null,
      );

      expect(result.adjustedScore).toBeGreaterThan(0);
      expect(result.oracleContribution).toBe(50); // Neutral
      expect(result.flowContribution).toBe(50); // Neutral
    });

    test("should apply weighted formula correctly (Requirement 5.1)", () => {
      const hologram = createMockHologramState("BULL", "DISCOUNT", "BULL");

      const result = scoringEngine.calculateEnhancedScore(
        hologram,
        null,
        null,
        null,
        null,
      );

      // Verify weights are applied
      const config = scoringEngine.getConfig();
      expect(config.weights.dailyBias).toBe(0.40);
      expect(config.weights.fourHourLocation).toBe(0.25);
      expect(config.weights.fifteenMinFlow).toBe(0.15);
      expect(config.weights.oracleScore).toBe(0.20);
    });
  });

  describe("determineAlignment", () => {
    test("should return A+ for high scores without veto", () => {
      const alignment = scoringEngine.determineAlignment(
        85,
        createMockOracleScore(60, 80, false),
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80, false),
        createMockFlowValidation(true),
      );

      expect(alignment).toBe("A+");
    });

    test("should return VETO when Oracle vetoes", () => {
      const alignment = scoringEngine.determineAlignment(
        85,
        createMockOracleScore(60, 80, true), // Veto = true
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80, false),
        createMockFlowValidation(true),
      );

      expect(alignment).toBe("VETO");
    });

    test("should return VETO for high bot trap suspicion", () => {
      const alignment = scoringEngine.determineAlignment(
        85,
        createMockOracleScore(60, 80, false),
        createMockBotTrapAnalysis(true, 85), // High suspicion
        createMockGlobalCVD("bullish", 80, false),
        createMockFlowValidation(true),
      );

      expect(alignment).toBe("VETO");
    });

    test("should return VETO when manipulation detected", () => {
      const alignment = scoringEngine.determineAlignment(
        85,
        createMockOracleScore(60, 80, false),
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80, true), // Manipulation detected
        createMockFlowValidation(true),
      );

      expect(alignment).toBe("VETO");
    });
  });

  describe("determineConvictionLevel", () => {
    test("should return extreme for high score with aligned enhancements", () => {
      const conviction = scoringEngine.determineConvictionLevel(
        95,
        createMockOracleScore(70, 80),
        createMockGlobalCVD("bullish", 80),
      );

      expect(conviction).toBe("extreme");
    });

    test("should return low for low score", () => {
      const conviction = scoringEngine.determineConvictionLevel(
        50,
        createMockOracleScore(20, 50),
        createMockGlobalCVD("neutral", 50),
      );

      expect(conviction).toBe("low");
    });
  });
});

// ============================================================================
// CONVICTION SIZING ENGINE TESTS
// ============================================================================

describe("ConvictionSizingEngine", () => {
  let sizingEngine: ConvictionSizingEngine;

  beforeEach(() => {
    sizingEngine = new ConvictionSizingEngine();
  });

  describe("calculatePositionSize", () => {
    test("should calculate position size with all factors", () => {
      const result = sizingEngine.calculatePositionSize(
        1000,
        createMockOracleScore(60, 80),
        createMockFlowValidation(true, "passive_absorption", 75),
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80),
      );

      expect(result.baseSize).toBe(1000);
      expect(result.finalSize).toBeGreaterThan(0);
      expect(result.cappedAt).toBe(2.0);
    });

    test("should cap multiplier at 2.0x (Requirement 7.5)", () => {
      // Create very bullish conditions
      const result = sizingEngine.calculatePositionSize(
        1000,
        createMockOracleScore(100, 100), // Max bullish
        createMockFlowValidation(true, "passive_absorption", 100),
        createMockBotTrapAnalysis(false, 0),
        createMockGlobalCVD("bullish", 100),
      );

      expect(result.finalSize).toBeLessThanOrEqual(1000 * 2.0);
    });

    test("should reduce size for bot trap (Requirement 3.5)", () => {
      const cleanResult = sizingEngine.calculatePositionSize(
        1000,
        createMockOracleScore(60, 80),
        createMockFlowValidation(true),
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80),
      );

      const trapResult = sizingEngine.calculatePositionSize(
        1000,
        createMockOracleScore(60, 80),
        createMockFlowValidation(true),
        createMockBotTrapAnalysis(true, 80), // Suspect trap
        createMockGlobalCVD("bullish", 80),
      );

      expect(trapResult.finalSize).toBeLessThan(cleanResult.finalSize);
      expect(trapResult.trapReduction).toBeLessThan(1.0);
    });

    test("should use conservative multiplier on conflicts (Requirement 7.6)", () => {
      const engine = new ConvictionSizingEngine({
        useConservativeSelection: true,
      });

      const result = engine.calculatePositionSize(
        1000,
        createMockOracleScore(-40, 80), // Bearish Oracle
        createMockFlowValidation(true, "passive_absorption", 75), // Bullish Flow
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80), // Bullish CVD
      );

      // Should use conservative (lower) multiplier
      expect(result.reasoning).toContain(
        "Using conservative multiplier selection",
      );
    });

    test("should handle null enhancement data", () => {
      const result = sizingEngine.calculatePositionSize(
        1000,
        null,
        null,
        null,
        null,
      );

      expect(result.baseSize).toBe(1000);
      expect(result.oracleMultiplier).toBe(1.0);
      expect(result.flowMultiplier).toBe(1.0);
      expect(result.trapReduction).toBe(1.0);
      expect(result.globalCVDMultiplier).toBe(1.0);
    });
  });
});

// ============================================================================
// ENHANCED SIGNAL VALIDATOR TESTS
// ============================================================================

describe("EnhancedSignalValidator", () => {
  let validator: EnhancedSignalValidator;

  beforeEach(() => {
    validator = new EnhancedSignalValidator();
  });

  describe("validateSignal", () => {
    test("should validate signal with all layers", () => {
      const signal = createMockTechnicalSignal("LONG", 75);

      const result = validator.validateSignal(
        signal,
        createMockOracleScore(60, 80),
        createMockFlowValidation(true),
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80),
      );

      expect(result.isValid).toBe(true);
      expect(result.layerValidations.length).toBe(4);
      expect(result.recommendation).toBe("proceed");
    });

    test("should veto when Oracle vetoes", () => {
      const signal = createMockTechnicalSignal("LONG", 75);

      const result = validator.validateSignal(
        signal,
        createMockOracleScore(60, 80, true), // Veto
        createMockFlowValidation(true),
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80),
      );

      expect(result.isValid).toBe(false);
      expect(result.recommendation).toBe("veto");
    });

    test("should veto when manipulation detected", () => {
      const signal = createMockTechnicalSignal("LONG", 75);

      const result = validator.validateSignal(
        signal,
        createMockOracleScore(60, 80),
        createMockFlowValidation(true),
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80, true), // Manipulation
      );

      expect(result.isValid).toBe(false);
      expect(result.recommendation).toBe("veto");
    });

    test("should recommend caution for conflicting signals", () => {
      const signal = createMockTechnicalSignal("LONG", 75);

      const result = validator.validateSignal(
        signal,
        createMockOracleScore(-50, 80), // Bearish Oracle
        createMockFlowValidation(true, "passive_absorption", 75), // Bullish Flow
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80), // Bullish CVD
      );

      expect(result.conflictAnalysis.hasConflict).toBe(true);
    });

    test("should adjust confidence based on layer validations", () => {
      const signal = createMockTechnicalSignal("LONG", 75);

      const goodResult = validator.validateSignal(
        signal,
        createMockOracleScore(60, 80),
        createMockFlowValidation(true),
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80),
      );

      const badResult = validator.validateSignal(
        signal,
        createMockOracleScore(-40, 80), // Conflicting
        createMockFlowValidation(false), // Invalid
        createMockBotTrapAnalysis(true, 60), // Suspect
        createMockGlobalCVD("conflicted", 50), // Conflicted
      );

      expect(badResult.adjustedConfidence).toBeLessThan(
        goodResult.adjustedConfidence,
      );
    });
  });

  describe("conflict resolution", () => {
    test("should use conservative strategy by default", () => {
      const config = validator.getConfig();
      expect(config.conflictResolutionStrategy).toBe("conservative");
    });

    test("should detect conflicts between layers", () => {
      const signal = createMockTechnicalSignal("LONG", 75);

      const result = validator.validateSignal(
        signal,
        createMockOracleScore(-60, 80), // Strong bearish
        createMockFlowValidation(true, "passive_absorption", 80), // Bullish
        createMockBotTrapAnalysis(false, 10),
        createMockGlobalCVD("bullish", 80), // Bullish
      );

      expect(result.conflictAnalysis.hasConflict).toBe(true);
      expect(result.conflictAnalysis.conflictingLayers.length).toBeGreaterThan(
        0,
      );
    });
  });
});

// ============================================================================
// ENHANCED HOLOGRAPHIC ENGINE TESTS
// ============================================================================

describe("EnhancedHolographicEngine", () => {
  let engine: EnhancedHolographicEngine;

  beforeEach(() => {
    engine = new EnhancedHolographicEngine({
      enabled: true,
      enableOracle: false, // Disable for unit tests
      enableFlowValidator: false,
      enableBotTrapDetector: false,
      enableGlobalCVD: false,
      fallbackToClassic: true,
    });
  });

  describe("initialization", () => {
    test("should initialize with default config", () => {
      const config = engine.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.fallbackToClassic).toBe(true);
    });

    test("should report not ready before initialization", () => {
      expect(engine.isReady()).toBe(false);
    });

    test("should initialize successfully", async () => {
      const result = await engine.initialize();
      expect(result).toBe(true);
      expect(engine.isReady()).toBe(true);
    });
  });

  describe("configuration", () => {
    test("should update configuration", () => {
      engine.updateConfig({ basePositionSize: 2000 });
      const config = engine.getConfig();
      expect(config.basePositionSize).toBe(2000);
    });
  });

  describe("events", () => {
    test("should emit initialized event", async () => {
      const initPromise = new Promise<void>((resolve) => {
        engine.on("initialized", () => resolve());
      });

      await engine.initialize();
      await initPromise;
    });

    test("should emit configUpdated event", () => {
      const configPromise = new Promise<void>((resolve) => {
        engine.on("configUpdated", () => resolve());
      });

      engine.updateConfig({ basePositionSize: 2000 });
      return configPromise;
    });
  });

  describe("shutdown", () => {
    test("should shutdown cleanly", async () => {
      await engine.initialize();
      await engine.shutdown();
      expect(engine.isReady()).toBe(false);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("Enhanced Hologram Integration", () => {
  test("should work end-to-end with all components", () => {
    const scoringEngine = new EnhancedScoringEngine();
    const sizingEngine = new ConvictionSizingEngine();
    const validator = new EnhancedSignalValidator();

    const hologram = createMockHologramState("BULL", "DISCOUNT", "BULL");
    const oracle = createMockOracleScore(60, 80);
    const flow = createMockFlowValidation(true);
    const botTrap = createMockBotTrapAnalysis(false, 10);
    const globalCVD = createMockGlobalCVD("bullish", 80);

    // Calculate enhanced score
    const scoring = scoringEngine.calculateEnhancedScore(
      hologram,
      oracle,
      flow,
      botTrap,
      globalCVD,
    );

    // Determine alignment
    const alignment = scoringEngine.determineAlignment(
      scoring.adjustedScore,
      oracle,
      botTrap,
      globalCVD,
      flow,
    );

    // Calculate position size
    const sizing = sizingEngine.calculatePositionSize(
      1000,
      oracle,
      flow,
      botTrap,
      globalCVD,
    );

    // Validate signal
    const signal = createMockTechnicalSignal("LONG", 75);
    const validation = validator.validateSignal(
      signal,
      oracle,
      flow,
      botTrap,
      globalCVD,
    );

    // Verify all components work together
    expect(scoring.adjustedScore).toBeGreaterThan(0);
    expect(["A+", "A", "B", "C", "VETO"]).toContain(alignment);
    expect(sizing.finalSize).toBeGreaterThan(0);
    expect(validation.layerValidations.length).toBe(4);
  });
});
