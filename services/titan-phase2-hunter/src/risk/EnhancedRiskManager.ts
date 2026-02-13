/**
 * Enhanced Risk Manager for Titan Phase 2 - 2026 Modernization
 *
 * Implements prediction-aware risk management with:
 * - High-impact event detection and response (Requirement 8.1)
 * - Prediction market volatility assessment (Requirement 8.2)
 * - Time-based risk adjustments for scheduled events (Requirement 8.4, 8.5)
 * - Multi-exchange failure protocols (Requirement 8.6)
 * - Enhanced monitoring and alerting (Requirement 8.3, 8.7)
 *
 * Task 7: Enhanced Risk Management System
 */

import { EventEmitter } from 'events';
import {
  BotTrapAnalysis,
  ConnectionStatus,
  EmergencyState,
  GlobalCVDData,
  ImpactLevel,
  OracleScore,
} from '../types';
import { getLogger } from '../logging/Logger';
import { Logger } from '@titan/shared';
const logger = Logger.getInstance('hunter:EnhancedRiskManager');

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Enhanced Risk Manager Configuration
 */
export interface EnhancedRiskManagerConfig {
  // High-impact event thresholds (Requirement 8.1)
  highImpactEventThreshold: number; // Default: 70%
  highImpactPositionReduction: number; // Default: 0.5 (50% reduction)

  // Prediction market volatility (Requirement 8.2)
  extremeUncertaintyThreshold: number; // Default: 50% (probability near 50%)
  uncertaintyStopLossReduction: number; // Default: 0.01 (1% from 1.5%)

  // Time-based risk adjustments (Requirement 8.4, 8.5)
  scheduledEventHours: number; // Default: 24 hours
  scheduledEventPositionReduction: number; // Default: 0.3 (30% reduction)

  // Global CVD divergence monitoring (Requirement 8.3)
  cvdDivergenceThreshold: number; // Default: 50 (divergence score)
  cvdMonitoringFrequency: number; // Default: 5000ms (5 seconds)

  // Bot trap frequency monitoring (Requirement 8.3)
  botTrapFrequencyThreshold: number; // Default: 0.5 (50% of signals)
  botTrapPrecisionIncrease: number; // Default: 0.25 (25% increase)

  // Multi-exchange failure (Requirement 8.6)
  minExchangesRequired: number; // Default: 2
  exchangeOfflineGracePeriod: number; // Default: 30000ms (30 seconds)

  // Oracle connection stability (Requirement 8.5)
  oracleStabilityThreshold: number; // Default: 3 (failures before unstable)
  oracleUnstablePositionReduction: number; // Default: 0.5 (50% reduction)

  // Monitoring
  monitoringEnabled: boolean;
  monitoringInterval: number; // Default: 10000ms (10 seconds)
}

/**
 * Risk condition types
 */
export type RiskConditionType =
  | 'HIGH_IMPACT_EVENT'
  | 'EXTREME_UNCERTAINTY'
  | 'SCHEDULED_EVENT'
  | 'CVD_DIVERGENCE'
  | 'BOT_TRAP_FREQUENCY'
  | 'EXCHANGE_OFFLINE'
  | 'ORACLE_UNSTABLE'
  | 'MULTIPLE_EXCHANGE_FAILURE';

/**
 * Active risk condition
 */
export interface RiskCondition {
  type: RiskConditionType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  adjustments: RiskAdjustments;
  triggeredAt: Date;
  expiresAt?: Date;
}

/**
 * Risk adjustments to apply
 */
export interface RiskAdjustments {
  positionSizeMultiplier: number; // 0-1 (1 = no reduction)
  stopLossAdjustment: number; // Percentage adjustment
  leverageReduction: number; // Max leverage multiplier
  haltNewEntries: boolean;
  flattenPositions: boolean;
}

/**
 * Exchange status for multi-exchange monitoring
 */
export interface ExchangeStatus {
  exchange: string;
  status: ConnectionStatus;
  lastSeen: Date;
  failureCount: number;
}

/**
 * Enhanced risk state
 */
export interface EnhancedRiskState {
  activeConditions: RiskCondition[];
  exchangeStatuses: Map<string, ExchangeStatus>;
  oracleFailureCount: number;
  botTrapRate: number;
  lastCVDDivergence: number;
  aggregatedAdjustments: RiskAdjustments;
  isEmergencyMode: boolean;
  emergencyState: EmergencyState | null;
  lastUpdate: Date;
}

/**
 * Event types for EnhancedRiskManager
 */
export interface EnhancedRiskManagerEvents {
  'condition:activated': (condition: RiskCondition) => void;
  'condition:deactivated': (condition: RiskCondition) => void;
  'adjustments:updated': (adjustments: RiskAdjustments) => void;
  'exchange:offline': (exchange: string) => void;
  'exchange:online': (exchange: string) => void;
  'emergency:triggered': (state: EmergencyState) => void;
  'emergency:cleared': () => void;
  'monitoring:update': (state: EnhancedRiskState) => void;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_ENHANCED_RISK_CONFIG: EnhancedRiskManagerConfig = {
  // High-impact event thresholds
  highImpactEventThreshold: 70,
  highImpactPositionReduction: 0.5,

  // Prediction market volatility
  extremeUncertaintyThreshold: 50,
  uncertaintyStopLossReduction: 0.01,

  // Time-based risk adjustments
  scheduledEventHours: 24,
  scheduledEventPositionReduction: 0.3,

  // Global CVD divergence monitoring
  cvdDivergenceThreshold: 50,
  cvdMonitoringFrequency: 5000,

  // Bot trap frequency monitoring
  botTrapFrequencyThreshold: 0.5,
  botTrapPrecisionIncrease: 0.25,

  // Multi-exchange failure
  minExchangesRequired: 2,
  exchangeOfflineGracePeriod: 30000,

  // Oracle connection stability
  oracleStabilityThreshold: 3,
  oracleUnstablePositionReduction: 0.5,

  // Monitoring
  monitoringEnabled: true,
  monitoringInterval: 10000,
};

// ============================================================================
// ENHANCED RISK MANAGER CLASS
// ============================================================================

/**
 * Enhanced Risk Manager
 *
 * Provides prediction-aware risk management for the 2026 modernization.
 * Monitors prediction markets, exchange connectivity, and bot trap patterns
 * to dynamically adjust risk parameters.
 */
export class EnhancedRiskManager extends EventEmitter {
  private config: EnhancedRiskManagerConfig;
  private state: EnhancedRiskState;
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Tracking for bot trap rate calculation
  private recentSignals: { timestamp: number; isBotTrap: boolean }[] = [];
  private readonly SIGNAL_WINDOW = 20; // Last 20 signals for rate calculation

  constructor(config?: Partial<EnhancedRiskManagerConfig>) {
    super();
    this.config = { ...DEFAULT_ENHANCED_RISK_CONFIG, ...config };

    this.state = {
      activeConditions: [],
      exchangeStatuses: new Map(),
      oracleFailureCount: 0,
      botTrapRate: 0,
      lastCVDDivergence: 0,
      aggregatedAdjustments: this.getDefaultAdjustments(),
      isEmergencyMode: false,
      emergencyState: null,
      lastUpdate: new Date(),
    };

    // Initialize exchange statuses
    this.initializeExchangeStatuses();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the Enhanced Risk Manager
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.config.monitoringEnabled) {
        this.startMonitoring();
      }
      return true;
    } catch (error) {
      getLogger().error('Failed to initialize EnhancedRiskManager:', error as Error);
      return false;
    }
  }

  /**
   * Initialize exchange statuses
   */
  private initializeExchangeStatuses(): void {
    const exchanges = ['binance', 'coinbase', 'kraken'];
    for (const exchange of exchanges) {
      // eslint-disable-next-line functional/immutable-data
      this.state.exchangeStatuses.set(exchange, {
        exchange,
        status: ConnectionStatus.DISCONNECTED,
        lastSeen: new Date(),
        failureCount: 0,
      });
    }
  }

  /**
   * Get default risk adjustments (no modifications)
   */
  private getDefaultAdjustments(): RiskAdjustments {
    return {
      positionSizeMultiplier: 1.0,
      stopLossAdjustment: 0,
      leverageReduction: 1.0,
      haltNewEntries: false,
      flattenPositions: false,
    };
  }

  // ============================================================================
  // HIGH-IMPACT EVENT DETECTION (Requirement 8.1)
  // ============================================================================

  /**
   * Evaluate high-impact events from Oracle data
   * Requirement 8.1: When high-impact event probability exceeds 70%, reduce positions by 50%
   */
  evaluateHighImpactEvents(oracleScore: OracleScore | null): RiskCondition | null {
    if (!oracleScore || oracleScore.events.length === 0) {
      return null;
    }

    // Find high-impact events with probability above threshold
    const highImpactEvents = oracleScore.events.filter(
      event => event.impact === ImpactLevel.HIGH || event.impact === ImpactLevel.EXTREME
    );

    for (const event of highImpactEvents) {
      if (event.probability >= this.config.highImpactEventThreshold) {
        const condition: RiskCondition = {
          type: 'HIGH_IMPACT_EVENT',
          severity: event.impact === ImpactLevel.EXTREME ? 'critical' : 'high',
          description: `High-impact event "${event.title}" has ${event.probability.toFixed(
            1
          )}% probability`,
          adjustments: {
            positionSizeMultiplier: this.config.highImpactPositionReduction,
            stopLossAdjustment: 0,
            leverageReduction: 0.5,
            haltNewEntries: event.impact === ImpactLevel.EXTREME,
            flattenPositions: false,
          },
          triggeredAt: new Date(),
          expiresAt: event.resolution,
        };

        this.activateCondition(condition);
        return condition;
      }
    }

    return null;
  }

  // ============================================================================
  // PREDICTION MARKET VOLATILITY (Requirement 8.2)
  // ============================================================================

  /**
   * Evaluate prediction market uncertainty
   * Requirement 8.2: When prediction markets show extreme uncertainty, tighten stop losses
   */
  evaluatePredictionUncertainty(oracleScore: OracleScore | null): RiskCondition | null {
    if (!oracleScore || oracleScore.events.length === 0) {
      return null;
    }

    // Check for events with probability near 50% (high uncertainty)
    const uncertainEvents = oracleScore.events.filter(event => {
      const distanceFrom50 = Math.abs(event.probability - 50);
      return distanceFrom50 < 10; // Within 10% of 50%
    });

    // If multiple high-impact events are uncertain, trigger condition
    const highImpactUncertain = uncertainEvents.filter(
      e => e.impact === ImpactLevel.HIGH || e.impact === ImpactLevel.EXTREME
    );

    if (highImpactUncertain.length >= 2) {
      const condition: RiskCondition = {
        type: 'EXTREME_UNCERTAINTY',
        severity: 'high',
        description: `${highImpactUncertain.length} high-impact events showing extreme uncertainty (near 50%)`,
        adjustments: {
          positionSizeMultiplier: 1.0,
          stopLossAdjustment: -this.config.uncertaintyStopLossReduction,
          leverageReduction: 0.75,
          haltNewEntries: false,
          flattenPositions: false,
        },
        triggeredAt: new Date(),
      };

      this.activateCondition(condition);
      return condition;
    }

    return null;
  }

  // ============================================================================
  // TIME-BASED RISK ADJUSTMENTS (Requirements 8.4, 8.5)
  // ============================================================================

  /**
   * Evaluate scheduled events for time-based risk adjustments
   * Requirement 8.4, 8.5: Reduce positions 30% when macro event within 24 hours
   */
  evaluateScheduledEvents(oracleScore: OracleScore | null): RiskCondition | null {
    if (!oracleScore || oracleScore.events.length === 0) {
      return null;
    }

    const now = new Date();
    const thresholdTime = new Date(
      now.getTime() + this.config.scheduledEventHours * 60 * 60 * 1000
    );

    // Find high-impact events scheduled within threshold
    const imminentEvents = oracleScore.events.filter(event => {
      const isHighImpact =
        event.impact === ImpactLevel.HIGH || event.impact === ImpactLevel.EXTREME;
      const isImminent = event.resolution <= thresholdTime;
      return isHighImpact && isImminent;
    });

    if (imminentEvents.length > 0) {
      const nearestEvent = imminentEvents.reduce((nearest, event) =>
        event.resolution < nearest.resolution ? event : nearest
      );

      const hoursUntil = (nearestEvent.resolution.getTime() - now.getTime()) / (1000 * 60 * 60);

      const condition: RiskCondition = {
        type: 'SCHEDULED_EVENT',
        severity: hoursUntil < 6 ? 'high' : 'medium',
        description: `High-impact event "${nearestEvent.title}" scheduled in ${hoursUntil.toFixed(
          1
        )} hours`,
        adjustments: {
          positionSizeMultiplier: 1 - this.config.scheduledEventPositionReduction,
          stopLossAdjustment: 0,
          leverageReduction: hoursUntil < 6 ? 0.5 : 0.75,
          haltNewEntries: hoursUntil < 1,
          flattenPositions: false,
        },
        triggeredAt: new Date(),
        expiresAt: nearestEvent.resolution,
      };

      this.activateCondition(condition);
      return condition;
    }

    return null;
  }

  // ============================================================================
  // GLOBAL CVD DIVERGENCE MONITORING (Requirement 8.3)
  // ============================================================================

  /**
   * Evaluate Global CVD divergence
   * Requirement 8.3: When Global CVD shows divergence, increase monitoring frequency
   */
  evaluateCVDDivergence(globalCVD: GlobalCVDData | null): RiskCondition | null {
    if (!globalCVD) {
      return null;
    }

    // eslint-disable-next-line functional/immutable-data
    this.state.lastCVDDivergence = globalCVD.manipulation.divergenceScore;

    if (globalCVD.manipulation.divergenceScore >= this.config.cvdDivergenceThreshold) {
      const condition: RiskCondition = {
        type: 'CVD_DIVERGENCE',
        severity: globalCVD.manipulation.detected ? 'high' : 'medium',
        description: `Global CVD divergence score: ${globalCVD.manipulation.divergenceScore.toFixed(
          1
        )} (threshold: ${this.config.cvdDivergenceThreshold})`,
        adjustments: {
          positionSizeMultiplier: globalCVD.manipulation.detected ? 0.5 : 0.75,
          stopLossAdjustment: 0,
          leverageReduction: 0.75,
          haltNewEntries: globalCVD.manipulation.detected,
          flattenPositions: false,
        },
        triggeredAt: new Date(),
      };

      this.activateCondition(condition);
      return condition;
    }

    // Deactivate if divergence is below threshold
    this.deactivateConditionByType('CVD_DIVERGENCE');
    return null;
  }

  // ============================================================================
  // BOT TRAP FREQUENCY MONITORING (Requirement 8.3)
  // ============================================================================

  /**
   * Record a signal for bot trap rate calculation
   */
  recordSignal(isBotTrap: boolean): void {
    // eslint-disable-next-line functional/immutable-data
    this.recentSignals.push({
      timestamp: Date.now(),
      isBotTrap,
    });

    // Keep only last N signals
    if (this.recentSignals.length > this.SIGNAL_WINDOW) {
      // eslint-disable-next-line functional/immutable-data
      this.recentSignals = this.recentSignals.slice(-this.SIGNAL_WINDOW);
    }

    // Update bot trap rate
    this.updateBotTrapRate();
  }

  /**
   * Update bot trap rate and check threshold
   */
  private updateBotTrapRate(): void {
    if (this.recentSignals.length < 5) {
      return; // Not enough signals for meaningful rate
    }

    const trapCount = this.recentSignals.filter(s => s.isBotTrap).length;
    // eslint-disable-next-line functional/immutable-data
    this.state.botTrapRate = trapCount / this.recentSignals.length;
  }

  /**
   * Evaluate bot trap frequency
   * Requirement 8.3: When Bot Trap patterns increase, raise precision threshold by 25%
   */
  evaluateBotTrapFrequency(botTrapAnalysis: BotTrapAnalysis | null): RiskCondition | null {
    // Record this signal
    if (botTrapAnalysis) {
      this.recordSignal(botTrapAnalysis.isSuspect);
    }

    if (this.state.botTrapRate >= this.config.botTrapFrequencyThreshold) {
      const condition: RiskCondition = {
        type: 'BOT_TRAP_FREQUENCY',
        severity: this.state.botTrapRate >= 0.8 ? 'critical' : 'high',
        description: `Bot trap rate: ${(this.state.botTrapRate * 100).toFixed(
          1
        )}% (threshold: ${this.config.botTrapFrequencyThreshold * 100}%)`,
        adjustments: {
          positionSizeMultiplier: 0.5,
          stopLossAdjustment: -0.005, // Tighter stops
          leverageReduction: 0.5,
          haltNewEntries: this.state.botTrapRate >= 0.8,
          flattenPositions: false,
        },
        triggeredAt: new Date(),
      };

      this.activateCondition(condition);
      return condition;
    }

    // Deactivate if rate is below threshold
    this.deactivateConditionByType('BOT_TRAP_FREQUENCY');
    return null;
  }

  // ============================================================================
  // MULTI-EXCHANGE FAILURE PROTOCOLS (Requirement 8.6)
  // ============================================================================

  /**
   * Update exchange status
   */
  updateExchangeStatus(exchange: string, status: ConnectionStatus): void {
    const current = this.state.exchangeStatuses.get(exchange);

    if (current) {
      const wasOffline = current.status !== ConnectionStatus.CONNECTED;
      const isNowOffline = status !== ConnectionStatus.CONNECTED;

      current.status = status;
      current.lastSeen = new Date();

      if (isNowOffline && !wasOffline) {
        current.failureCount++;
        this.emit('exchange:offline', exchange);
      } else if (!isNowOffline && wasOffline) {
        this.emit('exchange:online', exchange);
      }

      // eslint-disable-next-line functional/immutable-data
      this.state.exchangeStatuses.set(exchange, current);
    }

    // Check for multi-exchange failure
    this.evaluateExchangeFailures();
  }

  /**
   * Evaluate exchange failures
   * Requirement 8.6: When multiple exchanges go offline, halt new entries
   */
  evaluateExchangeFailures(): RiskCondition | null {
    const statuses = Array.from(this.state.exchangeStatuses.values());
    const onlineCount = statuses.filter(s => s.status === ConnectionStatus.CONNECTED).length;
    const offlineExchanges = statuses.filter(s => s.status !== ConnectionStatus.CONNECTED);

    // Single exchange offline
    if (offlineExchanges.length === 1) {
      const condition: RiskCondition = {
        type: 'EXCHANGE_OFFLINE',
        severity: 'medium',
        description: `Exchange ${offlineExchanges[0].exchange} is offline`,
        adjustments: {
          positionSizeMultiplier: 0.75,
          stopLossAdjustment: 0,
          leverageReduction: 0.75,
          haltNewEntries: false,
          flattenPositions: false,
        },
        triggeredAt: new Date(),
      };

      this.activateCondition(condition);
      return condition;
    }

    // Multiple exchanges offline - critical
    if (onlineCount < this.config.minExchangesRequired) {
      const condition: RiskCondition = {
        type: 'MULTIPLE_EXCHANGE_FAILURE',
        severity: 'critical',
        description: `Only ${onlineCount} exchanges online (minimum required: ${this.config.minExchangesRequired})`,
        adjustments: {
          positionSizeMultiplier: 0,
          stopLossAdjustment: 0,
          leverageReduction: 0,
          haltNewEntries: true,
          flattenPositions: false, // Don't auto-flatten, just halt
        },
        triggeredAt: new Date(),
      };

      this.activateCondition(condition);
      return condition;
    }

    // All exchanges online - deactivate conditions
    this.deactivateConditionByType('EXCHANGE_OFFLINE');
    this.deactivateConditionByType('MULTIPLE_EXCHANGE_FAILURE');
    return null;
  }

  // ============================================================================
  // ORACLE CONNECTION STABILITY (Requirement 8.5)
  // ============================================================================

  /**
   * Record Oracle connection failure
   */
  recordOracleFailure(): void {
    // eslint-disable-next-line functional/immutable-data
    this.state.oracleFailureCount++;
    this.evaluateOracleStability();
  }

  /**
   * Record Oracle connection success
   */
  recordOracleSuccess(): void {
    // eslint-disable-next-line functional/immutable-data
    this.state.oracleFailureCount = Math.max(0, this.state.oracleFailureCount - 1);
    this.evaluateOracleStability();
  }

  /**
   * Evaluate Oracle connection stability
   * Requirement 8.5: When Oracle connection is unstable, disable Conviction Multipliers
   */
  evaluateOracleStability(): RiskCondition | null {
    if (this.state.oracleFailureCount >= this.config.oracleStabilityThreshold) {
      const condition: RiskCondition = {
        type: 'ORACLE_UNSTABLE',
        severity: 'medium',
        description: `Oracle connection unstable (${this.state.oracleFailureCount} failures)`,
        adjustments: {
          positionSizeMultiplier: this.config.oracleUnstablePositionReduction,
          stopLossAdjustment: 0,
          leverageReduction: 1.0, // No leverage change
          haltNewEntries: false,
          flattenPositions: false,
        },
        triggeredAt: new Date(),
      };

      this.activateCondition(condition);
      return condition;
    }

    // Oracle is stable - deactivate condition
    this.deactivateConditionByType('ORACLE_UNSTABLE');
    return null;
  }

  // ============================================================================
  // CONDITION MANAGEMENT
  // ============================================================================

  /**
   * Activate a risk condition
   */
  private activateCondition(condition: RiskCondition): void {
    // Check if condition of this type already exists
    const existingIndex = this.state.activeConditions.findIndex(c => c.type === condition.type);

    if (existingIndex >= 0) {
      // Update existing condition
      // eslint-disable-next-line functional/immutable-data
      this.state.activeConditions[existingIndex] = condition;
    } else {
      // Add new condition
      // eslint-disable-next-line functional/immutable-data
      this.state.activeConditions.push(condition);
      this.emit('condition:activated', condition);
      this.logRiskCondition(condition, 'ACTIVATED');
    }

    // Recalculate aggregated adjustments
    this.recalculateAggregatedAdjustments();
  }

  /**
   * Deactivate a risk condition by type
   */
  private deactivateConditionByType(type: RiskConditionType): void {
    const index = this.state.activeConditions.findIndex(c => c.type === type);

    if (index >= 0) {
      const condition = this.state.activeConditions[index];
      // eslint-disable-next-line functional/immutable-data
      this.state.activeConditions.splice(index, 1);
      this.emit('condition:deactivated', condition);
      this.logRiskCondition(condition, 'DEACTIVATED');

      // Recalculate aggregated adjustments
      this.recalculateAggregatedAdjustments();
    }
  }

  /**
   * Check and remove expired conditions
   */
  private cleanupExpiredConditions(): void {
    const now = new Date();
    const expiredConditions = this.state.activeConditions.filter(
      c => c.expiresAt && c.expiresAt <= now
    );

    for (const condition of expiredConditions) {
      this.deactivateConditionByType(condition.type);
    }
  }

  /**
   * Recalculate aggregated adjustments from all active conditions
   */
  private recalculateAggregatedAdjustments(): void {
    const adjustments = this.getDefaultAdjustments();

    for (const condition of this.state.activeConditions) {
      // Use most restrictive position size multiplier
      // eslint-disable-next-line functional/immutable-data
      adjustments.positionSizeMultiplier = Math.min(
        adjustments.positionSizeMultiplier,
        condition.adjustments.positionSizeMultiplier
      );

      // Use most restrictive stop loss adjustment (most negative)
      // eslint-disable-next-line functional/immutable-data
      adjustments.stopLossAdjustment = Math.min(
        adjustments.stopLossAdjustment,
        condition.adjustments.stopLossAdjustment
      );

      // Use most restrictive leverage reduction
      // eslint-disable-next-line functional/immutable-data
      adjustments.leverageReduction = Math.min(
        adjustments.leverageReduction,
        condition.adjustments.leverageReduction
      );

      // Halt if any condition requires it
      // eslint-disable-next-line functional/immutable-data
      adjustments.haltNewEntries =
        adjustments.haltNewEntries || condition.adjustments.haltNewEntries;

      // Flatten if any condition requires it
      // eslint-disable-next-line functional/immutable-data
      adjustments.flattenPositions =
        adjustments.flattenPositions || condition.adjustments.flattenPositions;
    }

    // eslint-disable-next-line functional/immutable-data
    this.state.aggregatedAdjustments = adjustments;
    this.emit('adjustments:updated', adjustments);
  }

  // ============================================================================
  // COMPREHENSIVE EVALUATION
  // ============================================================================

  /**
   * Perform comprehensive risk evaluation with all enhancement data
   * Requirement 8.7: Log enhanced risk conditions when activated
   */
  evaluateAllConditions(
    oracleScore: OracleScore | null,
    globalCVD: GlobalCVDData | null,
    botTrapAnalysis: BotTrapAnalysis | null
  ): EnhancedRiskState {
    // Clean up expired conditions first
    this.cleanupExpiredConditions();

    // Evaluate all condition types
    this.evaluateHighImpactEvents(oracleScore);
    this.evaluatePredictionUncertainty(oracleScore);
    this.evaluateScheduledEvents(oracleScore);
    this.evaluateCVDDivergence(globalCVD);
    this.evaluateBotTrapFrequency(botTrapAnalysis);
    this.evaluateOracleStability();
    this.evaluateExchangeFailures();

    // Update state timestamp
    // eslint-disable-next-line functional/immutable-data
    this.state.lastUpdate = new Date();

    return this.getState();
  }

  // ============================================================================
  // STATE AND MONITORING
  // ============================================================================

  /**
   * Get current risk state
   */
  getState(): EnhancedRiskState {
    return {
      ...this.state,
      exchangeStatuses: new Map(this.state.exchangeStatuses),
      activeConditions: [...this.state.activeConditions],
    };
  }

  /**
   * Get current aggregated adjustments
   */
  getAdjustments(): RiskAdjustments {
    return { ...this.state.aggregatedAdjustments };
  }

  /**
   * Check if new entries are allowed
   */
  canOpenNewPositions(): boolean {
    return !this.state.aggregatedAdjustments.haltNewEntries && !this.state.isEmergencyMode;
  }

  /**
   * Get adjusted position size
   */
  getAdjustedPositionSize(baseSize: number): number {
    return baseSize * this.state.aggregatedAdjustments.positionSizeMultiplier;
  }

  /**
   * Get adjusted stop loss percentage
   */
  getAdjustedStopLoss(baseStopLoss: number): number {
    return baseStopLoss + this.state.aggregatedAdjustments.stopLossAdjustment;
  }

  /**
   * Get adjusted max leverage
   */
  getAdjustedMaxLeverage(baseLeverage: number): number {
    return baseLeverage * this.state.aggregatedAdjustments.leverageReduction;
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // eslint-disable-next-line functional/immutable-data
    this.monitoringInterval = setInterval(() => {
      this.cleanupExpiredConditions();
      this.emit('monitoring:update', this.getState());
    }, this.config.monitoringInterval);

    getLogger().info(
      `🛡️ Enhanced Risk Manager: Started monitoring (${this.config.monitoringInterval}ms interval)`
    );
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      // eslint-disable-next-line functional/immutable-data
      this.monitoringInterval = null;
    }
    getLogger().info(`🛡️ Enhanced Risk Manager: Stopped monitoring`);
  }

  // ============================================================================
  // LOGGING (Requirement 8.7)
  // ============================================================================

  /**
   * Log risk condition activation/deactivation
   * Requirement 8.7: Log enhanced risk conditions when activated
   */
  private logRiskCondition(condition: RiskCondition, action: 'ACTIVATED' | 'DEACTIVATED'): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'ENHANCED_RISK_CONDITION',
      action,
      condition: {
        type: condition.type,
        severity: condition.severity,
        description: condition.description,
      },
      adjustments: condition.adjustments,
      activeConditionCount: this.state.activeConditions.length,
      aggregatedAdjustments: this.state.aggregatedAdjustments,
    };

    const message = `🛡️ ENHANCED_RISK_${action}: ${JSON.stringify(logEntry)}`;
    if (logEntry.condition.severity === 'critical') {
      getLogger().warn(message);
    } else {
      getLogger().info(message);
    }
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EnhancedRiskManagerConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };

    // Restart monitoring if interval changed
    if (config.monitoringInterval && this.monitoringInterval) {
      this.stopMonitoring();
      this.startMonitoring();
    }

    getLogger().info(`🛡️ Enhanced Risk Manager: Configuration updated`);
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedRiskManagerConfig {
    return { ...this.config };
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get risk statistics
   */
  getStatistics(): {
    activeConditionCount: number;
    conditionsByType: Record<RiskConditionType, number>;
    exchangeOnlineCount: number;
    oracleFailureCount: number;
    botTrapRate: number;
    lastCVDDivergence: number;
    positionSizeMultiplier: number;
    isHalted: boolean;
  } {
    const conditionsByType: Record<string, number> = {};
    for (const condition of this.state.activeConditions) {
      // eslint-disable-next-line functional/immutable-data
      conditionsByType[condition.type] = (conditionsByType[condition.type] || 0) + 1;
    }

    const exchangeOnlineCount = Array.from(this.state.exchangeStatuses.values()).filter(
      s => s.status === ConnectionStatus.CONNECTED
    ).length;

    return {
      activeConditionCount: this.state.activeConditions.length,
      conditionsByType: conditionsByType as Record<RiskConditionType, number>,
      exchangeOnlineCount,
      oracleFailureCount: this.state.oracleFailureCount,
      botTrapRate: this.state.botTrapRate,
      lastCVDDivergence: this.state.lastCVDDivergence,
      positionSizeMultiplier: this.state.aggregatedAdjustments.positionSizeMultiplier,
      isHalted: this.state.aggregatedAdjustments.haltNewEntries,
    };
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Reset state
   */
  resetState(): void {
    // eslint-disable-next-line functional/immutable-data
    this.state = {
      activeConditions: [],
      exchangeStatuses: new Map(),
      oracleFailureCount: 0,
      botTrapRate: 0,
      lastCVDDivergence: 0,
      aggregatedAdjustments: this.getDefaultAdjustments(),
      isEmergencyMode: false,
      emergencyState: null,
      lastUpdate: new Date(),
    };
    // eslint-disable-next-line functional/immutable-data
    this.recentSignals = [];
    this.initializeExchangeStatuses();
    logger.info(`🛡️ Enhanced Risk Manager: State reset`);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.removeAllListeners();
    logger.info(`🛡️ Enhanced Risk Manager: Destroyed`);
  }
}

// Export event interface for TypeScript
export declare interface EnhancedRiskManager {
  on<U extends keyof EnhancedRiskManagerEvents>(
    event: U,
    listener: EnhancedRiskManagerEvents[U]
  ): this;
  emit<U extends keyof EnhancedRiskManagerEvents>(
    event: U,
    ...args: Parameters<EnhancedRiskManagerEvents[U]>
  ): boolean;
}
