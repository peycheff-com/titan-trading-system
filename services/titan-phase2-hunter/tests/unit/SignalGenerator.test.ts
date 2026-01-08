/**
 * Unit tests for SignalGenerator
 */

import { SignalGenerator, SignalGeneratorConfig, SignalContext } from '../../src/execution/SignalGenerator';
import { HologramEngine } from '../../src/engine/HologramEngine';
import { SessionProfiler } from '../../src/engine/SessionProfiler';
import { InefficiencyMapper } from '../../src/engine/InefficiencyMapper';
import { CVDValidator } from '../../src/engine/CVDValidator';
import { 
  HologramState, 
  SessionState, 
  POI, 
  FVG, 
  OrderBlock, 
  LiquidityPool,
  Absorption,
  SignalData
} from '../../src/types';

// Mock implementations
class MockHologramEngine {
  async analyze(symbol: string): Promise<HologramState> {
    return {
      symbol,
      timestamp: Date.now(),
      daily: {
        timeframe: '1D',
        trend: 'BULL',
        dealingRange: { high: 52000, low: 48000, midpoint: 50000, premiumThreshold: 50000, discountThreshold: 50000, range: 4000 },
        currentPrice: 49000,
        location: 'DISCOUNT',
        fractals: [],
        bos: [],
        mss: null
      },
      h4: {
        timeframe: '4H',
        trend: 'BULL',
        dealingRange: { high: 50500, low: 49000, midpoint: 49750, premiumThreshold: 49750, discountThreshold: 49750, range: 1500 },
        currentPrice: 49000,
        location: 'DISCOUNT',
        fractals: [],
        bos: [],
        mss: null
      },
      m15: {
        timeframe: '15m',
        trend: 'BULL',
        dealingRange: { high: 49200, low: 48800, midpoint: 49000, premiumThreshold: 49000, discountThreshold: 49000, range: 400 },
        currentPrice: 49000,
        location: 'EQUILIBRIUM',
        fractals: [],
        bos: [],
        mss: { direction: 'BULLISH', price: 49000, barIndex: 10, timestamp: Date.now(), significance: 80 }
      },
      alignmentScore: 85,
      status: 'A+',
      veto: { vetoed: false, reason: null, direction: null },
      rsScore: 0.03
    };
  }
}

class MockSessionProfiler {
  getSessionState(): SessionState {
    return {
      type: 'LONDON',
      startTime: 7,
      endTime: 10,
      timeRemaining: 2.5
    };
  }

  isKillzone(): boolean {
    return true;
  }
}

class MockInefficiencyMapper {
  // Mock implementation - not used directly in SignalGenerator
}

class MockCVDValidator {
  // Mock implementation - not used directly in SignalGenerator
}

describe('SignalGenerator', () => {
  let signalGenerator: SignalGenerator;
  let mockHologramEngine: MockHologramEngine;
  let mockSessionProfiler: MockSessionProfiler;
  let mockInefficiencyMapper: MockInefficiencyMapper;
  let mockCVDValidator: MockCVDValidator;

  beforeEach(() => {
    mockHologramEngine = new MockHologramEngine();
    mockSessionProfiler = new MockSessionProfiler();
    mockInefficiencyMapper = new MockInefficiencyMapper();
    mockCVDValidator = new MockCVDValidator();

    signalGenerator = new SignalGenerator(
      mockHologramEngine as any,
      mockSessionProfiler as any,
      mockInefficiencyMapper as any,
      mockCVDValidator as any
    );
  });

  describe('checkHologramStatus', () => {
    it('should return true for A+ status with no veto', () => {
      const hologram: HologramState = {
        symbol: 'BTCUSDT',
        timestamp: Date.now(),
        daily: {} as any,
        h4: {} as any,
        m15: {} as any,
        alignmentScore: 85,
        status: 'A+',
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.03
      };

      const result = signalGenerator.checkHologramStatus(hologram);
      expect(result).toBe(true);
    });

    it('should return true for B status with sufficient alignment score', () => {
      const hologram: HologramState = {
        symbol: 'BTCUSDT',
        timestamp: Date.now(),
        daily: {} as any,
        h4: {} as any,
        m15: {} as any,
        alignmentScore: 70,
        status: 'B',
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.03
      };

      const result = signalGenerator.checkHologramStatus(hologram);
      expect(result).toBe(true);
    });

    it('should return false for B status with insufficient alignment score', () => {
      const hologram: HologramState = {
        symbol: 'BTCUSDT',
        timestamp: Date.now(),
        daily: {} as any,
        h4: {} as any,
        m15: {} as any,
        alignmentScore: 50,
        status: 'B',
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.03
      };

      const result = signalGenerator.checkHologramStatus(hologram);
      expect(result).toBe(false);
    });

    it('should return false for CONFLICT status', () => {
      const hologram: HologramState = {
        symbol: 'BTCUSDT',
        timestamp: Date.now(),
        daily: {} as any,
        h4: {} as any,
        m15: {} as any,
        alignmentScore: 85,
        status: 'CONFLICT',
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.03
      };

      const result = signalGenerator.checkHologramStatus(hologram);
      expect(result).toBe(false);
    });

    it('should return false when veto is active', () => {
      const hologram: HologramState = {
        symbol: 'BTCUSDT',
        timestamp: Date.now(),
        daily: {} as any,
        h4: {} as any,
        m15: {} as any,
        alignmentScore: 85,
        status: 'A+',
        veto: { vetoed: true, reason: 'Premium veto', direction: 'LONG' },
        rsScore: 0.03
      };

      const result = signalGenerator.checkHologramStatus(hologram);
      expect(result).toBe(false);
    });
  });

  describe('checkSession', () => {
    it('should return true when in killzone', () => {
      const session: SessionState = {
        type: 'LONDON',
        startTime: 7,
        endTime: 10,
        timeRemaining: 2.5
      };

      const result = signalGenerator.checkSession(session);
      expect(result).toBe(true);
    });

    it('should return false when not in killzone', () => {
      // Mock the session profiler to return false for killzone
      jest.spyOn(mockSessionProfiler, 'isKillzone').mockReturnValue(false);

      const session: SessionState = {
        type: 'DEAD_ZONE',
        startTime: 21,
        endTime: 1,
        timeRemaining: 4
      };

      const result = signalGenerator.checkSession(session);
      expect(result).toBe(false);
    });
  });

  describe('checkRSScore', () => {
    it('should return true for LONG direction with positive RS above threshold', () => {
      const result = signalGenerator.checkRSScore(0.03, 'LONG');
      expect(result).toBe(true);
    });

    it('should return false for LONG direction with RS below threshold', () => {
      const result = signalGenerator.checkRSScore(0.005, 'LONG');
      expect(result).toBe(false);
    });

    it('should return true for SHORT direction with negative RS below threshold', () => {
      const result = signalGenerator.checkRSScore(-0.03, 'SHORT');
      expect(result).toBe(true);
    });

    it('should return false for SHORT direction with RS above threshold', () => {
      const result = signalGenerator.checkRSScore(-0.005, 'SHORT');
      expect(result).toBe(false);
    });
  });

  describe('checkPOIProximity', () => {
    it('should return true when price is within proximity of bullish FVG for LONG', () => {
      const currentPrice = 49000;
      const fvg: FVG = {
        type: 'BULLISH',
        top: 49100,
        bottom: 48900,
        midpoint: 49000,
        barIndex: 10,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };

      const result = signalGenerator.checkPOIProximity(currentPrice, [fvg], 'LONG');
      expect(result.valid).toBe(true);
      expect(result.poi).toBe(fvg);
    });

    it('should return true when price is within proximity of bullish Order Block for LONG', () => {
      const currentPrice = 49000;
      const ob: OrderBlock = {
        type: 'BULLISH',
        high: 49100,
        low: 48950,
        barIndex: 10,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };

      const result = signalGenerator.checkPOIProximity(currentPrice, [ob], 'LONG');
      expect(result.valid).toBe(true);
      expect(result.poi).toBe(ob);
    });

    it('should return false when price is too far from POI', () => {
      const currentPrice = 49000;
      const fvg: FVG = {
        type: 'BULLISH',
        top: 50000,
        bottom: 49800,
        midpoint: 49900,
        barIndex: 10,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };

      const result = signalGenerator.checkPOIProximity(currentPrice, [fvg], 'LONG');
      expect(result.valid).toBe(false);
      expect(result.poi).toBe(null);
    });

    it('should return false when POI is mitigated', () => {
      const currentPrice = 49000;
      const fvg: FVG = {
        type: 'BULLISH',
        top: 49100,
        bottom: 48900,
        midpoint: 49000,
        barIndex: 10,
        timestamp: Date.now(),
        mitigated: true,
        fillPercent: 100
      };

      const result = signalGenerator.checkPOIProximity(currentPrice, [fvg], 'LONG');
      expect(result.valid).toBe(false);
      expect(result.poi).toBe(null);
    });
  });

  describe('checkCVDAbsorption', () => {
    it('should return true when CVD confirmation is not required', () => {
      const config: Partial<SignalGeneratorConfig> = {
        requireCVDConfirmation: false
      };
      
      const generator = new SignalGenerator(
        mockHologramEngine as any,
        mockSessionProfiler as any,
        mockInefficiencyMapper as any,
        mockCVDValidator as any,
        config
      );

      const result = generator.checkCVDAbsorption(null, 'LONG');
      expect(result).toBe(true);
    });

    it('should return true when absorption has sufficient confidence', () => {
      const absorption: Absorption = {
        price: 49000,
        cvdValue: 1000000,
        timestamp: Date.now(),
        confidence: 85
      };

      const result = signalGenerator.checkCVDAbsorption(absorption, 'LONG');
      expect(result).toBe(true);
    });

    it('should return false when absorption confidence is too low', () => {
      const absorption: Absorption = {
        price: 49000,
        cvdValue: 1000000,
        timestamp: Date.now(),
        confidence: 50
      };

      const result = signalGenerator.checkCVDAbsorption(absorption, 'LONG');
      expect(result).toBe(false);
    });

    it('should return false when no absorption is provided and CVD is required', () => {
      const result = signalGenerator.checkCVDAbsorption(null, 'LONG');
      expect(result).toBe(false);
    });
  });

  describe('validateSignal', () => {
    it('should return valid signal when all conditions are met', () => {
      const context: SignalContext = {
        hologram: {
          symbol: 'BTCUSDT',
          timestamp: Date.now(),
          daily: {} as any,
          h4: {} as any,
          m15: {} as any,
          alignmentScore: 85,
          status: 'A+',
          veto: { vetoed: false, reason: null, direction: null },
          rsScore: 0.03
        },
        session: {
          type: 'LONDON',
          startTime: 7,
          endTime: 10,
          timeRemaining: 2.5
        },
        currentPrice: 49000,
        nearbyPOIs: [{
          type: 'BULLISH',
          top: 49100,
          bottom: 48900,
          midpoint: 49000,
          barIndex: 10,
          timestamp: Date.now(),
          mitigated: false,
          fillPercent: 0
        } as FVG],
        absorption: {
          price: 49000,
          cvdValue: 1000000,
          timestamp: Date.now(),
          confidence: 85
        },
        atr: 0.02
      };

      const result = signalGenerator.validateSignal(context, 'LONG');
      expect(result.valid).toBe(true);
      expect(result.reason).toBe('All conditions met');
      expect(result.hologramValid).toBe(true);
      expect(result.sessionValid).toBe(true);
      expect(result.rsValid).toBe(true);
      expect(result.poiValid).toBe(true);
      expect(result.cvdValid).toBe(true);
    });

    it('should return invalid signal when hologram status is insufficient', () => {
      const context: SignalContext = {
        hologram: {
          symbol: 'BTCUSDT',
          timestamp: Date.now(),
          daily: {} as any,
          h4: {} as any,
          m15: {} as any,
          alignmentScore: 85,
          status: 'CONFLICT',
          veto: { vetoed: false, reason: null, direction: null },
          rsScore: 0.03
        },
        session: {
          type: 'LONDON',
          startTime: 7,
          endTime: 10,
          timeRemaining: 2.5
        },
        currentPrice: 49000,
        nearbyPOIs: [],
        absorption: null,
        atr: 0.02
      };

      const result = signalGenerator.validateSignal(context, 'LONG');
      expect(result.valid).toBe(false);
      expect(result.hologramValid).toBe(false);
      expect(result.reason).toContain('Hologram status invalid');
    });
  });

  describe('configuration management', () => {
    it('should update configuration correctly', () => {
      const newConfig: Partial<SignalGeneratorConfig> = {
        minAlignmentScore: 70,
        rsThreshold: 0.02
      };

      signalGenerator.updateConfig(newConfig);
      const config = signalGenerator.getConfig();

      expect(config.minAlignmentScore).toBe(70);
      expect(config.rsThreshold).toBe(0.02);
      expect(config.poiProximityPercent).toBe(0.5); // Should retain default
    });

    it('should return current configuration', () => {
      const config = signalGenerator.getConfig();
      
      expect(config.minAlignmentScore).toBe(60);
      expect(config.rsThreshold).toBe(0.01);
      expect(config.poiProximityPercent).toBe(0.5);
      expect(config.minCVDConfidence).toBe(70);
      expect(config.requireCVDConfirmation).toBe(true);
    });
  });
});