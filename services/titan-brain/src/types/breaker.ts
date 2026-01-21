/**
 * Circuit Breaker Types for Titan Brain
 * Defines types for emergency halt system
 */

import { Position } from './risk.js';

/**
 * Circuit breaker type
 */
export enum BreakerType {
  /** Immediate close all + halt (Legacy HARD) */
  HARD = 'HARD',
  /** Cooldown period only (Legacy SOFT) */
  SOFT = 'SOFT',
  /** Freeze new entries only (allows closing/hedging) */
  ENTRY_FREEZE = 'ENTRY_FREEZE',
  /** Freeze all order submission */
  SYSTEM_FREEZE = 'SYSTEM_FREEZE',
  /** Flatten positions and shutdown */
  EMERGENCY_SHUTDOWN = 'EMERGENCY_SHUTDOWN',
}

/**
 * Action determined by breaker state
 */
export enum BreakerAction {
  /** Normal operation */
  NONE = 'NONE',
  /** Allow exits/hedges, block new risk */
  ENTRY_PAUSE = 'ENTRY_PAUSE',
  /** Close everything and stop */
  FULL_HALT = 'FULL_HALT',
}

/**
 * Circuit breaker status
 */
export interface BreakerStatus {
  active: boolean;
  type?: BreakerType;
  action: BreakerAction;
  reason?: string;
  triggeredAt?: number;
  dailyDrawdown: number;
  consecutiveLosses: number;
  equityLevel: number;
  /** Cooldown end time for soft breakers */
  cooldownEndsAt?: number;
  /** Total number of breaker trips since start */
  tripCount: number;
  /** Timestamp of the last breaker trip */
  lastTripTime?: number;
  /** Timestamp of the last breaker reset */
  lastReset?: number;
  /** Current daily PnL */
  dailyPnl?: number;
}

/**
 * Circuit breaker event for persistence
 */
export interface BreakerEvent {
  id?: number;
  timestamp: number;
  eventType: 'TRIGGER' | 'RESET';
  breakerType?: BreakerType;
  reason: string;
  equity: number;
  operatorId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Maximum daily drawdown before hard trigger (0.15 = 15%) */
  maxDailyDrawdown: number;
  /** Minimum equity before hard trigger */
  minEquity: number;
  /** Consecutive losses before soft trigger */
  consecutiveLossLimit: number;
  /** Time window for consecutive loss detection (ms) */
  consecutiveLossWindow: number;
  /** Cooldown duration for soft breakers (minutes) */
  cooldownMinutes: number;
}

/**
 * Breaker check input
 */
export interface BreakerCheckInput {
  equity: number;
  positions: Position[];
  dailyStartEquity: number;
  recentTrades: Array<{ pnl: number; timestamp: number }>;
}
