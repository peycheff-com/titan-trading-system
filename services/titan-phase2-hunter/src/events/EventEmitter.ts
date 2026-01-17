/**
 * Event System for Titan Phase 2 - The Hunter
 *
 * Provides a centralized event-driven architecture for communication
 * between different components of the Hunter system.
 */

import { EventEmitter as NodeEventEmitter } from 'events';
import {
  HologramState,
  SessionState,
  Absorption,
  Distribution,
  SignalData,
  ExecutionData,
  AsianRange,
  JudasSwing,
} from '../types';

// Event type definitions
export interface EventMap {
  // Hologram events
  HOLOGRAM_UPDATED: HologramUpdatedEvent;

  // Session events
  SESSION_CHANGE: SessionChangeEvent;

  // CVD events
  CVD_ABSORPTION: CVDAbsorptionEvent;
  CVD_DISTRIBUTION: CVDDistributionEvent;

  // Signal events
  SIGNAL_GENERATED: SignalGeneratedEvent;

  // Execution events
  EXECUTION_COMPLETE: ExecutionCompleteEvent;

  // Error events
  ERROR: ErrorEvent;

  // Additional system events
  SCAN_COMPLETE: ScanCompleteEvent;
  JUDAS_SWING_DETECTED: JudasSwingEvent;
  POI_DETECTED: POIDetectedEvent;
  RISK_WARNING: RiskWarningEvent;
}

// Event payload interfaces
export interface HologramUpdatedEvent {
  symbol: string;
  hologramState: HologramState;
  previousStatus?: string;
  timestamp: number;
}

export interface SessionChangeEvent {
  previousSession: SessionState;
  currentSession: SessionState;
  asianRange?: AsianRange;
  timestamp: number;
}

export interface CVDAbsorptionEvent {
  symbol: string;
  absorption: Absorption;
  poiPrice: number;
  confidence: number;
  timestamp: number;
}

export interface CVDDistributionEvent {
  symbol: string;
  distribution: Distribution;
  poiPrice: number;
  confidence: number;
  timestamp: number;
}

export interface SignalGeneratedEvent {
  signal: SignalData;
  hologramState: HologramState;
  sessionState: SessionState;
  cvdConfirmation: boolean;
  timestamp: number;
}

export interface ExecutionCompleteEvent {
  execution: ExecutionData;
  signal: SignalData;
  success: boolean;
  slippage: number;
  timestamp: number;
}

export interface ErrorEvent {
  component: string;
  error: Error;
  context?: Record<string, any>;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: number;
}

export interface ScanCompleteEvent {
  symbolsScanned: number;
  aPlus: number;
  bAlignment: number;
  conflicts: number;
  duration: number;
  timestamp: number;
}

export interface JudasSwingEvent {
  judasSwing: JudasSwing;
  sessionType: 'LONDON' | 'NY';
  asianRange: AsianRange;
  timestamp: number;
}

export interface POIDetectedEvent {
  symbol: string;
  poiType: 'FVG' | 'ORDER_BLOCK' | 'LIQUIDITY_POOL';
  price: number;
  confidence: number;
  distance: number; // Distance from current price in %
  timestamp: number;
}

export interface RiskWarningEvent {
  type: 'DRAWDOWN' | 'CORRELATION' | 'PORTFOLIO_HEAT' | 'CONSECUTIVE_LOSSES';
  severity: 'WARNING' | 'CRITICAL';
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
}

/**
 * Centralized Event Emitter for the Hunter system
 *
 * This class provides a type-safe event system that allows different
 * components to communicate without tight coupling.
 */
export class HunterEventEmitter extends NodeEventEmitter {
  private static instance: HunterEventEmitter;

  constructor() {
    super();
    // Set max listeners to handle multiple subscribers
    this.setMaxListeners(50);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): HunterEventEmitter {
    if (!HunterEventEmitter.instance) {
      HunterEventEmitter.instance = new HunterEventEmitter();
    }
    return HunterEventEmitter.instance;
  }

  /**
   * Emit a typed event
   */
  emitEvent<K extends keyof EventMap>(event: K, payload: EventMap[K]): boolean {
    return this.emit(event, payload);
  }

  /**
   * Subscribe to a typed event
   */
  onEvent<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return this.on(event, listener);
  }

  /**
   * Subscribe to a typed event (once)
   */
  onceEvent<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return this.once(event, listener);
  }

  /**
   * Unsubscribe from a typed event
   */
  offEvent<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return this.off(event, listener);
  }

  // Convenience methods for common events

  /**
   * Emit hologram updated event
   */
  emitHologramUpdated(symbol: string, hologramState: HologramState, previousStatus?: string): void {
    this.emitEvent('HOLOGRAM_UPDATED', {
      symbol,
      hologramState,
      previousStatus,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit session change event
   */
  emitSessionChange(
    previousSession: SessionState,
    currentSession: SessionState,
    asianRange?: AsianRange
  ): void {
    this.emitEvent('SESSION_CHANGE', {
      previousSession,
      currentSession,
      asianRange,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit CVD absorption event
   */
  emitCVDAbsorption(
    symbol: string,
    absorption: Absorption,
    poiPrice: number,
    confidence: number
  ): void {
    this.emitEvent('CVD_ABSORPTION', {
      symbol,
      absorption,
      poiPrice,
      confidence,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit CVD distribution event
   */
  emitCVDDistribution(
    symbol: string,
    distribution: Distribution,
    poiPrice: number,
    confidence: number
  ): void {
    this.emitEvent('CVD_DISTRIBUTION', {
      symbol,
      distribution,
      poiPrice,
      confidence,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit signal generated event
   */
  emitSignalGenerated(
    signal: SignalData,
    hologramState: HologramState,
    sessionState: SessionState,
    cvdConfirmation: boolean
  ): void {
    this.emitEvent('SIGNAL_GENERATED', {
      signal,
      hologramState,
      sessionState,
      cvdConfirmation,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit execution complete event
   */
  emitExecutionComplete(
    execution: ExecutionData,
    signal: SignalData,
    success: boolean,
    slippage: number
  ): void {
    this.emitEvent('EXECUTION_COMPLETE', {
      execution,
      signal,
      success,
      slippage,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit error event
   */
  emitError(
    component: string,
    error: Error,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM',
    context?: Record<string, any>
  ): void {
    this.emitEvent('ERROR', {
      component,
      error,
      context,
      severity,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit scan complete event
   */
  emitScanComplete(
    symbolsScanned: number,
    aPlus: number,
    bAlignment: number,
    conflicts: number,
    duration: number
  ): void {
    this.emitEvent('SCAN_COMPLETE', {
      symbolsScanned,
      aPlus,
      bAlignment,
      conflicts,
      duration,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit Judas swing detected event
   */
  emitJudasSwing(
    judasSwing: JudasSwing,
    sessionType: 'LONDON' | 'NY',
    asianRange: AsianRange
  ): void {
    this.emitEvent('JUDAS_SWING_DETECTED', {
      judasSwing,
      sessionType,
      asianRange,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit POI detected event
   */
  emitPOIDetected(
    symbol: string,
    poiType: 'FVG' | 'ORDER_BLOCK' | 'LIQUIDITY_POOL',
    price: number,
    confidence: number,
    distance: number
  ): void {
    this.emitEvent('POI_DETECTED', {
      symbol,
      poiType,
      price,
      confidence,
      distance,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit risk warning event
   */
  emitRiskWarning(
    type: 'DRAWDOWN' | 'CORRELATION' | 'PORTFOLIO_HEAT' | 'CONSECUTIVE_LOSSES',
    severity: 'WARNING' | 'CRITICAL',
    value: number,
    threshold: number,
    message: string
  ): void {
    this.emitEvent('RISK_WARNING', {
      type,
      severity,
      value,
      threshold,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Get event statistics
   */
  getEventStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    const events = this.eventNames();

    for (const event of events) {
      stats[event.toString()] = this.listenerCount(event);
    }

    return stats;
  }

  /**
   * Clear all listeners (useful for testing)
   */
  clearAllListeners(): void {
    this.removeAllListeners();
  }
}

// Export singleton instance
export const hunterEvents = HunterEventEmitter.getInstance();
