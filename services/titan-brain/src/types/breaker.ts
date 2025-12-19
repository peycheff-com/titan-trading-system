/**
 * Circuit Breaker Types for Titan Brain
 * Defines types for emergency halt system
 */

import { Position } from './risk.js';

/**
 * Circuit breaker type
 */
export enum BreakerType {
  /** Immediate close all + halt */
  HARD = 'HARD',
  /** Cooldown period only */
  SOFT = 'SOFT'
}

/**
 * Circuit breaker status
 */
export interface BreakerStatus {
  active: boolean;
  type?: BreakerType;
  reason?: string;
  triggeredAt?: number;
  dailyDrawdown: number;
  consecutiveLosses: number;
  equityLevel: number;
  /** Cooldown end time for soft breakers */
  cooldownEndsAt?: number;
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
