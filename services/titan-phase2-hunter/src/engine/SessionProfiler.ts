/**
 * SessionProfiler - Time & Price Dynamics Engine
 *
 * Exploits the "Judas Swing" (false moves) at London/NY opens to catch
 * manipulation-to-distribution transitions. Identifies session-based
 * trading opportunities and manages time-based logic.
 *
 * Requirements: 2.1-2.7 (Session Profiler)
 */

import { EventEmitter } from 'events';
import { SessionType, SessionState, AsianRange, JudasSwing, OHLCV } from '../types';

export class SessionProfiler extends EventEmitter {
  private asianRange: AsianRange | null = null;
  private londonRange: { high: number; low: number; timestamp: number } | null = null;
  private currentSession: SessionState | null = null;

  constructor() {
    super();
  }

  /**
   * Get current session state based on UTC time
   * Requirements: 2.1 (Session identification)
   */
  getSessionState(): SessionState {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    const currentTime = utcHour + utcMinute / 60;

    let sessionType: SessionType;
    let startTime: number;
    let endTime: number;

    // Asian session: 00:00 - 06:00 UTC (Accumulation phase)
    if (currentTime >= 0 && currentTime < 6) {
      sessionType = 'ASIAN';
      startTime = 0;
      endTime = 6;
    }
    // London session: 07:00 - 10:00 UTC (Manipulation phase)
    else if (currentTime >= 7 && currentTime < 10) {
      sessionType = 'LONDON';
      startTime = 7;
      endTime = 10;
    }
    // NY session: 13:00 - 16:00 UTC (Distribution phase)
    else if (currentTime >= 13 && currentTime < 16) {
      sessionType = 'NY';
      startTime = 13;
      endTime = 16;
    }
    // Dead Zone: 21:00 - 01:00 UTC (Low volume)
    else {
      sessionType = 'DEAD_ZONE';
      startTime = 21;
      endTime = 1; // Next day
    }

    // Calculate time remaining in current session
    let timeRemaining: number;
    if (sessionType === 'DEAD_ZONE') {
      // Handle overnight session
      if (currentTime >= 21) {
        timeRemaining = 24 - currentTime + 1; // Until 01:00 next day
      } else {
        timeRemaining = 1 - currentTime; // Until 01:00
      }
    } else {
      timeRemaining = endTime - currentTime;
    }

    const sessionState: SessionState = {
      type: sessionType,
      startTime,
      endTime,
      timeRemaining: Math.max(0, timeRemaining),
    };

    // Check for session transition
    if (!this.currentSession || this.currentSession.type !== sessionType) {
      // Only emit transition events if we had a previous session
      if (this.currentSession) {
        this.handleSessionTransition(sessionState);
      }
    }

    this.currentSession = sessionState;
    return sessionState;
  }

  /**
   * Check if current time is within tradeable killzone
   * Requirements: 2.6 (Killzone checking)
   */
  isKillzone(): boolean {
    const sessionState = this.getSessionState();

    // Only London and NY sessions are killzones
    return sessionState.type === 'LONDON' || sessionState.type === 'NY';
  }

  /**
   * Store Asian range as reference levels for London manipulation
   * Requirements: 2.2 (Asian range storage)
   */
  storeAsianRange(ohlcvData: OHLCV[]): void {
    if (ohlcvData.length === 0) {
      return;
    }

    // Find high and low during Asian session (00:00-06:00 UTC)
    let high = -Infinity;
    let low = Infinity;
    let timestamp = 0;

    for (const candle of ohlcvData) {
      const candleDate = new Date(candle.timestamp);
      const utcHour = candleDate.getUTCHours();

      // Check if candle is within Asian session
      if (utcHour >= 0 && utcHour < 6) {
        if (candle.high > high) {
          high = candle.high;
        }
        if (candle.low < low) {
          low = candle.low;
        }
        timestamp = Math.max(timestamp, candle.timestamp);
      }
    }

    if (high !== -Infinity && low !== Infinity) {
      this.asianRange = {
        high,
        low,
        timestamp,
      };
    }
  }

  /**
   * Detect Judas Swing at session opens
   * Requirements: 2.3, 2.4, 2.5 (Judas Swing detection)
   */
  detectJudasSwing(currentPrice: number, sessionType: SessionType): JudasSwing | null {
    // London session: Hunt for Asian range sweep
    if (sessionType === 'LONDON' && this.asianRange) {
      // Check for sweep of Asian High
      if (currentPrice > this.asianRange.high) {
        return {
          type: 'SWEEP_HIGH',
          sweptPrice: this.asianRange.high,
          reversalPrice: this.asianRange.low,
          direction: 'SHORT', // Expect reversal down after sweep
          confidence: 75,
        };
      }

      // Check for sweep of Asian Low
      if (currentPrice < this.asianRange.low) {
        return {
          type: 'SWEEP_LOW',
          sweptPrice: this.asianRange.low,
          reversalPrice: this.asianRange.high,
          direction: 'LONG', // Expect reversal up after sweep
          confidence: 75,
        };
      }
    }

    // NY session: Hunt for London range sweep
    if (sessionType === 'NY' && this.londonRange) {
      // Check for sweep of London High
      if (currentPrice > this.londonRange.high) {
        return {
          type: 'SWEEP_HIGH',
          sweptPrice: this.londonRange.high,
          reversalPrice: this.londonRange.low,
          direction: 'SHORT',
          confidence: 80, // Higher confidence for NY session
        };
      }

      // Check for sweep of London Low
      if (currentPrice < this.londonRange.low) {
        return {
          type: 'SWEEP_LOW',
          sweptPrice: this.londonRange.low,
          reversalPrice: this.londonRange.high,
          direction: 'LONG',
          confidence: 80,
        };
      }
    }

    return null;
  }

  /**
   * Get stored Asian range
   */
  getAsianRange(): AsianRange | null {
    return this.asianRange;
  }

  /**
   * Get stored London range
   */
  getLondonRange(): { high: number; low: number; timestamp: number } | null {
    return this.londonRange;
  }

  /**
   * Update London range during London session
   */
  updateLondonRange(ohlcvData: OHLCV[]): void {
    if (ohlcvData.length === 0) {
      return;
    }

    // Find high and low during London session (07:00-10:00 UTC)
    let high = -Infinity;
    let low = Infinity;
    let timestamp = 0;

    for (const candle of ohlcvData) {
      const candleDate = new Date(candle.timestamp);
      const utcHour = candleDate.getUTCHours();

      // Check if candle is within London session
      if (utcHour >= 7 && utcHour < 10) {
        if (candle.high > high) {
          high = candle.high;
        }
        if (candle.low < low) {
          low = candle.low;
        }
        timestamp = Math.max(timestamp, candle.timestamp);
      }
    }

    if (high !== -Infinity && low !== Infinity) {
      this.londonRange = {
        high,
        low,
        timestamp,
      };
    }
  }

  /**
   * Check if we should disable new entries (Dead Zone)
   * Requirements: 2.6 (Dead zone restrictions)
   */
  shouldDisableNewEntries(): boolean {
    const sessionState = this.getSessionState();
    return sessionState.type === 'DEAD_ZONE';
  }

  /**
   * Get session statistics for display
   */
  getSessionStats(): {
    currentSession: SessionType;
    timeRemaining: number;
    asianRange: AsianRange | null;
    londonRange: { high: number; low: number; timestamp: number } | null;
    isKillzone: boolean;
  } {
    const sessionState = this.getSessionState();

    return {
      currentSession: sessionState.type,
      timeRemaining: sessionState.timeRemaining,
      asianRange: this.asianRange,
      londonRange: this.londonRange,
      isKillzone: this.isKillzone(),
    };
  }

  /**
   * Handle session transition and emit events
   * Requirements: 2.7 (Session transition events)
   */
  private handleSessionTransition(newSession: SessionState): void {
    const previousSession = this.currentSession?.type;

    // Emit session change event with reference levels
    this.emit('SESSION_CHANGE', {
      previousSession,
      newSession: newSession.type,
      asianRange: this.asianRange,
      londonRange: this.londonRange,
      timestamp: Date.now(),
    });

    // Special handling for session-specific logic
    if (newSession.type === 'LONDON' && previousSession === 'ASIAN') {
      // London opening - prepare for Asian range manipulation
      this.emit('LONDON_OPEN', {
        asianRange: this.asianRange,
        timestamp: Date.now(),
      });
    }

    if (newSession.type === 'NY' && previousSession === 'LONDON') {
      // NY opening - prepare for London range manipulation
      this.emit('NY_OPEN', {
        londonRange: this.londonRange,
        timestamp: Date.now(),
      });
    }

    if (newSession.type === 'DEAD_ZONE') {
      // Dead zone - disable new entries
      this.emit('DEAD_ZONE_START', {
        timestamp: Date.now(),
      });
    }
  }
}
