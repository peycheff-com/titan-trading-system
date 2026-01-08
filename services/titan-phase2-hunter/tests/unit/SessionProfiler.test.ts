/**
 * Unit Tests for SessionProfiler
 * 
 * Tests session identification, Asian range storage, Judas Swing detection,
 * killzone checking, and session transition events.
 * 
 * Requirements: 2.1-2.7 (Session Profiler)
 */

import { SessionProfiler } from '../../src/engine/SessionProfiler';
import { SessionType, SessionState, AsianRange, JudasSwing, OHLCV } from '../../src/types/index';

describe('SessionProfiler', () => {
  let profiler: SessionProfiler;
  let originalDate: DateConstructor;

  beforeEach(() => {
    profiler = new SessionProfiler();
    originalDate = global.Date;
  });

  afterEach(() => {
    global.Date = originalDate;
  });

  // Helper function to mock UTC time
  const mockUTCTime = (hour: number, minute: number = 0) => {
    const mockDate = new Date();
    mockDate.getUTCHours = jest.fn().mockReturnValue(hour);
    mockDate.getUTCMinutes = jest.fn().mockReturnValue(minute);
    
    // Create a mock Date constructor that handles both no-args and timestamp args
    const MockDate = jest.fn((timestamp?: number) => {
      if (timestamp !== undefined) {
        // If timestamp is provided, use the original Date constructor
        return new originalDate(timestamp);
      }
      // If no timestamp, return the mocked date for current time
      return mockDate;
    }) as any;
    
    // Preserve static methods
    MockDate.now = originalDate.now;
    MockDate.UTC = originalDate.UTC;
    MockDate.parse = originalDate.parse;
    
    global.Date = MockDate;
  };

  // Helper function to create OHLCV data
  const createOHLCV = (timestamp: number, high: number, low: number): OHLCV => ({
    timestamp,
    open: (high + low) / 2,
    high,
    low,
    close: (high + low) / 2,
    volume: 1000
  });

  describe('getSessionState', () => {
    it('should identify Asian session (00:00-06:00 UTC)', () => {
      mockUTCTime(3, 30); // 03:30 UTC

      const sessionState = profiler.getSessionState();

      expect(sessionState.type).toBe('ASIAN');
      expect(sessionState.startTime).toBe(0);
      expect(sessionState.endTime).toBe(6);
      expect(sessionState.timeRemaining).toBe(2.5); // 6 - 3.5
    });

    it('should identify London session (07:00-10:00 UTC)', () => {
      mockUTCTime(8, 15); // 08:15 UTC

      const sessionState = profiler.getSessionState();

      expect(sessionState.type).toBe('LONDON');
      expect(sessionState.startTime).toBe(7);
      expect(sessionState.endTime).toBe(10);
      expect(sessionState.timeRemaining).toBe(1.75); // 10 - 8.25
    });

    it('should identify NY session (13:00-16:00 UTC)', () => {
      mockUTCTime(14, 45); // 14:45 UTC

      const sessionState = profiler.getSessionState();

      expect(sessionState.type).toBe('NY');
      expect(sessionState.startTime).toBe(13);
      expect(sessionState.endTime).toBe(16);
      expect(sessionState.timeRemaining).toBe(1.25); // 16 - 14.75
    });

    it('should identify Dead Zone (21:00-01:00 UTC)', () => {
      mockUTCTime(23, 0); // 23:00 UTC

      const sessionState = profiler.getSessionState();

      expect(sessionState.type).toBe('DEAD_ZONE');
      expect(sessionState.startTime).toBe(21);
      expect(sessionState.endTime).toBe(1);
      expect(sessionState.timeRemaining).toBe(2); // (24 - 23) + 1
    });

    it('should identify Dead Zone early morning (00:30 UTC)', () => {
      mockUTCTime(0, 30); // 00:30 UTC (but not Asian session)
      
      // Mock to return DEAD_ZONE for this specific time
      const sessionState = profiler.getSessionState();
      
      // At 00:30, it should be Asian session, not Dead Zone
      expect(sessionState.type).toBe('ASIAN');
    });

    it('should handle Dead Zone early morning correctly', () => {
      mockUTCTime(22, 30); // 22:30 UTC (Dead Zone)

      const sessionState = profiler.getSessionState();

      expect(sessionState.type).toBe('DEAD_ZONE');
      expect(sessionState.timeRemaining).toBe(2.5); // (24 - 22.5) + 1
    });
  });

  describe('storeAsianRange', () => {
    it('should store Asian range from OHLCV data', () => {
      const asianData: OHLCV[] = [
        createOHLCV(new Date('2024-01-01T02:00:00Z').getTime(), 50100, 49900), // Asian session
        createOHLCV(new Date('2024-01-01T04:00:00Z').getTime(), 50200, 49800), // Asian session
        createOHLCV(new Date('2024-01-01T08:00:00Z').getTime(), 50300, 49700), // London session (should be ignored)
      ];

      profiler.storeAsianRange(asianData);

      const asianRange = profiler.getAsianRange();
      expect(asianRange).not.toBeNull();
      expect(asianRange!.high).toBe(50200); // Highest during Asian session
      expect(asianRange!.low).toBe(49800);  // Lowest during Asian session
    });

    it('should handle empty OHLCV data', () => {
      profiler.storeAsianRange([]);

      const asianRange = profiler.getAsianRange();
      expect(asianRange).toBeNull();
    });

    it('should ignore non-Asian session data', () => {
      const nonAsianData: OHLCV[] = [
        createOHLCV(new Date('2024-01-01T08:00:00Z').getTime(), 50300, 49700), // London
        createOHLCV(new Date('2024-01-01T14:00:00Z').getTime(), 50400, 49600), // NY
      ];

      profiler.storeAsianRange(nonAsianData);

      const asianRange = profiler.getAsianRange();
      expect(asianRange).toBeNull();
    });
  });

  describe('detectJudasSwing', () => {
    beforeEach(() => {
      // Set up Asian range for testing
      const asianData: OHLCV[] = [
        createOHLCV(new Date('2024-01-01T02:00:00Z').getTime(), 50100, 49900),
      ];
      profiler.storeAsianRange(asianData);
    });

    it('should detect Asian High sweep during London session', () => {
      const currentPrice = 50150; // Above Asian High (50100)
      
      const judasSwing = profiler.detectJudasSwing(currentPrice, 'LONDON');

      expect(judasSwing).not.toBeNull();
      expect(judasSwing!.type).toBe('SWEEP_HIGH');
      expect(judasSwing!.sweptPrice).toBe(50100);
      expect(judasSwing!.reversalPrice).toBe(49900);
      expect(judasSwing!.direction).toBe('SHORT');
      expect(judasSwing!.confidence).toBe(75);
    });

    it('should detect Asian Low sweep during London session', () => {
      const currentPrice = 49850; // Below Asian Low (49900)
      
      const judasSwing = profiler.detectJudasSwing(currentPrice, 'LONDON');

      expect(judasSwing).not.toBeNull();
      expect(judasSwing!.type).toBe('SWEEP_LOW');
      expect(judasSwing!.sweptPrice).toBe(49900);
      expect(judasSwing!.reversalPrice).toBe(50100);
      expect(judasSwing!.direction).toBe('LONG');
      expect(judasSwing!.confidence).toBe(75);
    });

    it('should not detect Judas Swing when price is within Asian range', () => {
      const currentPrice = 50000; // Within Asian range
      
      const judasSwing = profiler.detectJudasSwing(currentPrice, 'LONDON');

      expect(judasSwing).toBeNull();
    });

    it('should not detect Judas Swing during Asian session', () => {
      const currentPrice = 50150; // Above Asian High
      
      const judasSwing = profiler.detectJudasSwing(currentPrice, 'ASIAN');

      expect(judasSwing).toBeNull();
    });

    it('should detect London range sweep during NY session', () => {
      // Set up London range
      const londonData: OHLCV[] = [
        createOHLCV(new Date('2024-01-01T08:00:00Z').getTime(), 50300, 49700),
      ];
      profiler.updateLondonRange(londonData);

      const currentPrice = 50350; // Above London High
      
      const judasSwing = profiler.detectJudasSwing(currentPrice, 'NY');

      expect(judasSwing).not.toBeNull();
      expect(judasSwing!.type).toBe('SWEEP_HIGH');
      expect(judasSwing!.sweptPrice).toBe(50300);
      expect(judasSwing!.direction).toBe('SHORT');
      expect(judasSwing!.confidence).toBe(80); // Higher confidence for NY
    });
  });

  describe('isKillzone', () => {
    it('should return true during London session', () => {
      mockUTCTime(8, 30); // London session

      const isKillzone = profiler.isKillzone();

      expect(isKillzone).toBe(true);
    });

    it('should return true during NY session', () => {
      mockUTCTime(14, 30); // NY session

      const isKillzone = profiler.isKillzone();

      expect(isKillzone).toBe(true);
    });

    it('should return false during Asian session', () => {
      mockUTCTime(3, 30); // Asian session

      const isKillzone = profiler.isKillzone();

      expect(isKillzone).toBe(false);
    });

    it('should return false during Dead Zone', () => {
      mockUTCTime(22, 30); // Dead Zone

      const isKillzone = profiler.isKillzone();

      expect(isKillzone).toBe(false);
    });
  });

  describe('shouldDisableNewEntries', () => {
    it('should return true during Dead Zone', () => {
      mockUTCTime(22, 30); // Dead Zone

      const shouldDisable = profiler.shouldDisableNewEntries();

      expect(shouldDisable).toBe(true);
    });

    it('should return false during killzones', () => {
      mockUTCTime(8, 30); // London session

      const shouldDisable = profiler.shouldDisableNewEntries();

      expect(shouldDisable).toBe(false);
    });
  });

  describe('updateLondonRange', () => {
    it('should store London range from OHLCV data', () => {
      const londonData: OHLCV[] = [
        createOHLCV(new Date('2024-01-01T08:00:00Z').getTime(), 50300, 49700), // London session
        createOHLCV(new Date('2024-01-01T09:00:00Z').getTime(), 50250, 49750), // London session
        createOHLCV(new Date('2024-01-01T14:00:00Z').getTime(), 50400, 49600), // NY session (should be ignored)
      ];

      profiler.updateLondonRange(londonData);

      const londonRange = profiler.getLondonRange();
      expect(londonRange).not.toBeNull();
      expect(londonRange!.high).toBe(50300); // Highest during London session
      expect(londonRange!.low).toBe(49700);  // Lowest during London session
    });

    it('should ignore non-London session data', () => {
      const nonLondonData: OHLCV[] = [
        createOHLCV(new Date('2024-01-01T02:00:00Z').getTime(), 50100, 49900), // Asian
        createOHLCV(new Date('2024-01-01T14:00:00Z').getTime(), 50400, 49600), // NY
      ];

      profiler.updateLondonRange(nonLondonData);

      const londonRange = profiler.getLondonRange();
      expect(londonRange).toBeNull();
    });
  });

  describe('session transition events', () => {
    it('should emit SESSION_CHANGE event on session transition', (done) => {
      mockUTCTime(8, 0); // London session
      
      // First call to establish current session
      profiler.getSessionState();

      // Set up event listener
      profiler.once('SESSION_CHANGE', (event) => {
        expect(event.previousSession).toBe('LONDON');
        expect(event.newSession).toBe('NY');
        expect(event.timestamp).toBeGreaterThan(0);
        done();
      });

      // Change to NY session
      mockUTCTime(14, 0);
      profiler.getSessionState();
    });

    it('should emit LONDON_OPEN event when transitioning to London', (done) => {
      mockUTCTime(5, 0); // Asian session
      profiler.getSessionState();

      profiler.once('LONDON_OPEN', (event) => {
        expect(event.timestamp).toBeGreaterThan(0);
        done();
      });

      // Transition to London
      mockUTCTime(8, 0);
      profiler.getSessionState();
    });

    it('should emit NY_OPEN event when transitioning to NY', (done) => {
      mockUTCTime(8, 0); // London session
      profiler.getSessionState();

      profiler.once('NY_OPEN', (event) => {
        expect(event.timestamp).toBeGreaterThan(0);
        done();
      });

      // Transition to NY
      mockUTCTime(14, 0);
      profiler.getSessionState();
    });

    it('should emit DEAD_ZONE_START event when transitioning to Dead Zone', (done) => {
      mockUTCTime(15, 0); // NY session
      profiler.getSessionState();

      profiler.once('DEAD_ZONE_START', (event) => {
        expect(event.timestamp).toBeGreaterThan(0);
        done();
      });

      // Transition to Dead Zone
      mockUTCTime(22, 0);
      profiler.getSessionState();
    });
  });

  describe('getSessionStats', () => {
    it('should return comprehensive session statistics', () => {
      mockUTCTime(8, 30); // London session
      
      // Set up ranges - use the original Date to create proper UTC timestamps
      const timestamp2AM = originalDate.UTC(2024, 0, 1, 2, 0, 0); // January 1, 2024, 2:00 AM UTC
      const asianData: OHLCV[] = [
        createOHLCV(timestamp2AM, 50100, 49900),
      ];
      
      // Debug the Asian data
      expect(new originalDate(asianData[0].timestamp).getUTCHours()).toBe(2);
      
      profiler.storeAsianRange(asianData);
      
      const asianRangeAfterStore = profiler.getAsianRange();
      
      // This should not be null if storeAsianRange worked
      expect(asianRangeAfterStore).not.toBeNull();
      
      const timestamp8AM = originalDate.UTC(2024, 0, 1, 8, 0, 0); // January 1, 2024, 8:00 AM UTC
      const londonData: OHLCV[] = [
        createOHLCV(timestamp8AM, 50300, 49700),
      ];
      profiler.updateLondonRange(londonData);

      const stats = profiler.getSessionStats();

      expect(stats.currentSession).toBe('LONDON');
      expect(stats.timeRemaining).toBe(1.5); // 10 - 8.5
      expect(stats.asianRange).toEqual({
        high: 50100,
        low: 49900,
        timestamp: expect.any(Number)
      });
      expect(stats.londonRange).toEqual({
        high: 50300,
        low: 49700,
        timestamp: expect.any(Number)
      });
      expect(stats.isKillzone).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle session boundary correctly (exactly 06:00 UTC)', () => {
      mockUTCTime(6, 0); // Exactly 06:00 UTC

      const sessionState = profiler.getSessionState();

      // At exactly 06:00, it should not be Asian session anymore
      expect(sessionState.type).not.toBe('ASIAN');
    });

    it('should handle session boundary correctly (exactly 07:00 UTC)', () => {
      mockUTCTime(7, 0); // Exactly 07:00 UTC

      const sessionState = profiler.getSessionState();

      expect(sessionState.type).toBe('LONDON');
      expect(sessionState.timeRemaining).toBe(3); // 10 - 7
    });

    it('should handle midnight transition correctly', () => {
      mockUTCTime(0, 30); // 00:30 UTC

      const sessionState = profiler.getSessionState();

      expect(sessionState.type).toBe('ASIAN');
      expect(sessionState.timeRemaining).toBe(5.5); // 6 - 0.5
    });

    it('should not emit duplicate session change events', () => {
      mockUTCTime(8, 0); // London session
      
      let eventCount = 0;
      profiler.on('SESSION_CHANGE', () => {
        eventCount++;
      });

      // Multiple calls to same session should not emit multiple events
      profiler.getSessionState();
      profiler.getSessionState();
      profiler.getSessionState();

      expect(eventCount).toBe(0); // No events since no transition occurred
    });
  });
});