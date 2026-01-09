/**
 * EmergencyProtocolManager - Emergency Protocols and Failsafe Systems
 * 
 * Implements comprehensive emergency protocols for the 2026 modernization:
 * - Prediction market emergency protocols (Requirement 14.1, 10.6)
 * - Multi-system failure detection and response (Requirement 14.2, 14.4, 14.5)
 * - Graceful degradation system (Requirement 14.6)
 * - Emergency notification and logging (Requirement 14.7)
 * 
 * Task 8: Emergency Protocols and Failsafe Systems
 */

import { EventEmitter } from 'events';
import {
  EmergencyType,
  EmergencyState,
  DegradationLevel,
  OracleScore,
  GlobalCVDData,
  BotTrapAnalysis,
  ConnectionStatus,
  ImpactLevel
} from '../types/enhanced-2026';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Emergency Protocol Manager Configuration
 */
export interface EmergencyProtocolConfig {
  // Prediction market emergency (Requirement 14.1)
  extremeEventProbabilityThreshold: number; // Default: 90%
  predictionDataStaleThreshold: number; // Default: 300000ms (5 minutes)
  
  // Multi-exchange failure (Requirement 14.2)
  minExchangesForTrading: number; // Default: 2
  exchangeOfflineGracePeriod: number; // Default: 30000ms (30 seconds)
  
  // Flow emergency (Requirement 14.4)
  extremeCVDDivergenceThreshold: number; // Default: 80
  
  // Trap saturation (Requirement 14.5)
  trapSaturationThreshold: number; // Default: 0.8 (80%)
  
  // Graceful degradation (Requirement 14.6)
  enableGracefulDegradation: boolean;
  degradationCheckInterval: number; // Default: 5000ms
  
  // Notification settings (Requirement 14.7)
  enableNotifications: boolean;
  notificationCooldown: number; // Default: 60000ms (1 minute)
}

/**
 * Emergency trigger result
 */
export interface EmergencyTriggerResult {
  triggered: boolean;
  type: EmergencyType | null;
  reason: string;
  severity: 'warning' | 'critical' | 'emergency';
  actions: EmergencyAction[];
  timestamp: Date;
}

/**
 * Emergency action to take
 */
export interface EmergencyAction {
  action: 'flatten_positions' | 'halt_trading' | 'reduce_positions' | 'switch_to_fallback' | 'notify_user';
  description: string;
  priority: number; // 1 = highest
  executed: boolean;
  executedAt?: Date;
}

/**
 * System component health status
 */
export interface ComponentHealth {
  component: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastUpdate: Date;
  errorCount: number;
  details: string;
}

/**
 * System health assessment
 */
export interface SystemHealthAssessment {
  overallHealth: 'healthy' | 'degraded' | 'critical' | 'emergency';
  components: ComponentHealth[];
  degradationLevel: DegradationLevel;
  activeEmergencies: EmergencyState[];
  recommendations: string[];
  timestamp: Date;
}

/**
 * Emergency notification
 */
export interface EmergencyNotification {
  id: string;
  type: EmergencyType;
  severity: 'warning' | 'critical' | 'emergency';
  title: string;
  message: string;
  actions: string[];
  timestamp: Date;
  acknowledged: boolean;
}

/**
 * Emergency log entry
 */
export interface EmergencyLogEntry {
  timestamp: Date;
  type: 'TRIGGER' | 'ACTION' | 'CLEAR' | 'DEGRADATION' | 'NOTIFICATION';
  emergencyType: EmergencyType | null;
  severity: string;
  message: string;
  systemState: Partial<SystemHealthAssessment>;
  metadata: Record<string, unknown>;
}

/**
 * Events emitted by EmergencyProtocolManager
 */
export interface EmergencyProtocolEvents {
  'emergency:triggered': (state: EmergencyState) => void;
  'emergency:cleared': (type: EmergencyType) => void;
  'emergency:action': (action: EmergencyAction) => void;
  'degradation:changed': (level: DegradationLevel) => void;
  'notification:sent': (notification: EmergencyNotification) => void;
  'health:updated': (assessment: SystemHealthAssessment) => void;
  'log:entry': (entry: EmergencyLogEntry) => void;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_EMERGENCY_CONFIG: EmergencyProtocolConfig = {
  // Prediction market emergency
  extremeEventProbabilityThreshold: 90,
  predictionDataStaleThreshold: 300000, // 5 minutes
  
  // Multi-exchange failure
  minExchangesForTrading: 2,
  exchangeOfflineGracePeriod: 30000, // 30 seconds
  
  // Flow emergency
  extremeCVDDivergenceThreshold: 80,
  
  // Trap saturation
  trapSaturationThreshold: 0.8,
  
  // Graceful degradation
  enableGracefulDegradation: true,
  degradationCheckInterval: 5000,
  
  // Notifications
  enableNotifications: true,
  notificationCooldown: 60000
};

// ============================================================================
// EMERGENCY PROTOCOL MANAGER CLASS
// ============================================================================

/**
 * EmergencyProtocolManager
 * 
 * Manages all emergency protocols and failsafe systems for the 2026 modernization.
 * Monitors system health, detects emergency conditions, and coordinates responses.
 */
export class EmergencyProtocolManager extends EventEmitter {
  private config: EmergencyProtocolConfig;
  private activeEmergencies: Map<EmergencyType, EmergencyState> = new Map();
  private componentHealth: Map<string, ComponentHealth> = new Map();
  private currentDegradation: DegradationLevel;
  private emergencyLog: EmergencyLogEntry[] = [];
  private notificationHistory: EmergencyNotification[] = [];
  private lastNotificationTime: Map<EmergencyType, number> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  // Tracking for data staleness
  private lastOracleUpdate: Date | null = null;
  private lastGlobalCVDUpdate: Date | null = null;
  
  // Exchange status tracking
  private exchangeStatuses: Map<string, { status: ConnectionStatus; lastSeen: Date }> = new Map();

  constructor(config?: Partial<EmergencyProtocolConfig>) {
    super();
    this.config = { ...DEFAULT_EMERGENCY_CONFIG, ...config };
    
    this.currentDegradation = {
      level: 'none',
      affectedComponents: [],
      fallbackStrategy: 'none',
      performanceImpact: 0
    };
    
    this.initializeComponentHealth();
    this.initializeExchangeStatuses();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the Emergency Protocol Manager
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.config.enableGracefulDegradation) {
        this.startHealthChecks();
      }
      
      this.logEmergencyEvent('TRIGGER', null, 'info', 'Emergency Protocol Manager initialized');
      console.log('🚨 Emergency Protocol Manager: Initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize EmergencyProtocolManager:', error);
      return false;
    }
  }

  /**
   * Initialize component health tracking
   */
  private initializeComponentHealth(): void {
    const components = ['oracle', 'global_cvd', 'bot_trap', 'flow_validator', 'hologram_engine'];
    
    for (const component of components) {
      this.componentHealth.set(component, {
        component,
        status: 'healthy',
        lastUpdate: new Date(),
        errorCount: 0,
        details: 'Initialized'
      });
    }
  }

  /**
   * Initialize exchange status tracking
   */
  private initializeExchangeStatuses(): void {
    const exchanges = ['binance', 'coinbase', 'kraken'];
    
    for (const exchange of exchanges) {
      this.exchangeStatuses.set(exchange, {
        status: ConnectionStatus.DISCONNECTED,
        lastSeen: new Date()
      });
    }
  }

  // ============================================================================
  // PREDICTION MARKET EMERGENCY (Requirement 14.1, 10.6)
  // ============================================================================

  /**
   * Check for prediction market emergency conditions
   * Requirement 14.1: Trigger PREDICTION_EMERGENCY when extreme event probability > 90%
   */
  checkPredictionEmergency(oracleScore: OracleScore | null): EmergencyTriggerResult {
    // Update last oracle update time
    if (oracleScore) {
      this.lastOracleUpdate = new Date();
      this.updateComponentHealth('oracle', 'healthy', 'Data received');
    }

    // Check for data staleness (Requirement 10.6)
    if (this.isPredictionDataStale()) {
      return this.handlePredictionDataStale();
    }

    if (!oracleScore || oracleScore.events.length === 0) {
      return this.createNoTriggerResult();
    }

    // Check for extreme event probability
    const extremeEvents = oracleScore.events.filter(event => 
      (event.impact === ImpactLevel.EXTREME || event.impact === ImpactLevel.HIGH) &&
      event.probability >= this.config.extremeEventProbabilityThreshold
    );

    if (extremeEvents.length > 0) {
      const mostExtreme = extremeEvents.reduce((max, event) => 
        event.probability > max.probability ? event : max
      );

      return this.triggerPredictionEmergency(mostExtreme.title, mostExtreme.probability);
    }

    // Clear prediction emergency if conditions no longer met
    if (this.activeEmergencies.has(EmergencyType.PREDICTION_EMERGENCY)) {
      this.clearEmergency(EmergencyType.PREDICTION_EMERGENCY);
    }

    return this.createNoTriggerResult();
  }

  /**
   * Handle prediction data staleness
   * Requirement 10.6: Fall back to technical analysis when prediction data is stale
   */
  private handlePredictionDataStale(): EmergencyTriggerResult {
    const staleDuration = this.lastOracleUpdate 
      ? Date.now() - this.lastOracleUpdate.getTime()
      : Infinity;

    this.updateComponentHealth('oracle', 'degraded', `Data stale for ${Math.round(staleDuration / 1000)}s`);

    // Don't trigger full emergency, but log and degrade
    this.logEmergencyEvent(
      'DEGRADATION',
      null,
      'warning',
      `Prediction market data stale (${Math.round(staleDuration / 1000)}s)`
    );

    return {
      triggered: false,
      type: null,
      reason: 'Prediction data stale - falling back to technical analysis',
      severity: 'warning',
      actions: [{
        action: 'switch_to_fallback',
        description: 'Switch to technical analysis only mode',
        priority: 2,
        executed: false
      }],
      timestamp: new Date()
    };
  }

  /**
   * Check if prediction data is stale
   */
  private isPredictionDataStale(): boolean {
    if (!this.lastOracleUpdate) return true;
    
    const staleDuration = Date.now() - this.lastOracleUpdate.getTime();
    return staleDuration > this.config.predictionDataStaleThreshold;
  }

  /**
   * Trigger prediction emergency
   */
  private triggerPredictionEmergency(eventTitle: string, probability: number): EmergencyTriggerResult {
    const emergencyState: EmergencyState = {
      active: true,
      type: EmergencyType.PREDICTION_EMERGENCY,
      triggeredAt: new Date(),
      reason: `Extreme event "${eventTitle}" has ${probability.toFixed(1)}% probability`,
      actions: ['Flatten all positions', 'Halt new entries']
    };

    this.activateEmergency(emergencyState);

    const actions: EmergencyAction[] = [
      {
        action: 'flatten_positions',
        description: 'Flatten all open positions immediately',
        priority: 1,
        executed: false
      },
      {
        action: 'halt_trading',
        description: 'Halt all new trading activity',
        priority: 1,
        executed: false
      },
      {
        action: 'notify_user',
        description: 'Send immediate notification to user',
        priority: 1,
        executed: false
      }
    ];

    this.sendEmergencyNotification(
      EmergencyType.PREDICTION_EMERGENCY,
      'emergency',
      'PREDICTION EMERGENCY',
      `Extreme event "${eventTitle}" detected with ${probability.toFixed(1)}% probability. All positions being flattened.`,
      ['Positions flattened', 'Trading halted', 'Monitor situation']
    );

    return {
      triggered: true,
      type: EmergencyType.PREDICTION_EMERGENCY,
      reason: emergencyState.reason!,
      severity: 'emergency',
      actions,
      timestamp: new Date()
    };
  }


  // ============================================================================
  // MULTI-SYSTEM FAILURE DETECTION (Requirement 14.2, 14.4, 14.5)
  // ============================================================================

  /**
   * Check for liquidity emergency (multiple exchange failures)
   * Requirement 14.2: Trigger LIQUIDITY_EMERGENCY when 2+ exchanges go offline
   */
  checkLiquidityEmergency(): EmergencyTriggerResult {
    const statuses = Array.from(this.exchangeStatuses.values());
    const onlineCount = statuses.filter(s => s.status === ConnectionStatus.CONNECTED).length;
    const offlineExchanges = Array.from(this.exchangeStatuses.entries())
      .filter(([_, s]) => s.status !== ConnectionStatus.CONNECTED)
      .map(([name, _]) => name);

    if (onlineCount < this.config.minExchangesForTrading) {
      const emergencyState: EmergencyState = {
        active: true,
        type: EmergencyType.LIQUIDITY_EMERGENCY,
        triggeredAt: new Date(),
        reason: `Only ${onlineCount} exchange(s) online. Offline: ${offlineExchanges.join(', ')}`,
        actions: ['Halt all trading', 'Manage existing positions with remaining exchanges']
      };

      this.activateEmergency(emergencyState);

      const actions: EmergencyAction[] = [
        {
          action: 'halt_trading',
          description: 'Halt all new trading activity',
          priority: 1,
          executed: false
        },
        {
          action: 'notify_user',
          description: 'Notify user of exchange connectivity issues',
          priority: 1,
          executed: false
        }
      ];

      this.sendEmergencyNotification(
        EmergencyType.LIQUIDITY_EMERGENCY,
        'critical',
        'LIQUIDITY EMERGENCY',
        `Multiple exchanges offline (${offlineExchanges.join(', ')}). Trading halted.`,
        ['Trading halted', 'Monitor exchange status', 'Manage existing positions manually']
      );

      return {
        triggered: true,
        type: EmergencyType.LIQUIDITY_EMERGENCY,
        reason: emergencyState.reason!,
        severity: 'critical',
        actions,
        timestamp: new Date()
      };
    }

    // Clear liquidity emergency if conditions no longer met
    if (this.activeEmergencies.has(EmergencyType.LIQUIDITY_EMERGENCY)) {
      this.clearEmergency(EmergencyType.LIQUIDITY_EMERGENCY);
    }

    return this.createNoTriggerResult();
  }

  /**
   * Check for flow emergency (extreme CVD divergence)
   * Requirement 14.4: Trigger FLOW_EMERGENCY for extreme CVD divergence
   */
  checkFlowEmergency(globalCVD: GlobalCVDData | null): EmergencyTriggerResult {
    // Update last CVD update time
    if (globalCVD) {
      this.lastGlobalCVDUpdate = new Date();
      this.updateComponentHealth('global_cvd', 'healthy', 'Data received');
    }

    if (!globalCVD) {
      return this.createNoTriggerResult();
    }

    const divergenceScore = globalCVD.manipulation.divergenceScore;

    if (divergenceScore >= this.config.extremeCVDDivergenceThreshold) {
      const emergencyState: EmergencyState = {
        active: true,
        type: EmergencyType.FLOW_EMERGENCY,
        triggeredAt: new Date(),
        reason: `Extreme CVD divergence detected: ${divergenceScore.toFixed(1)} (threshold: ${this.config.extremeCVDDivergenceThreshold})`,
        actions: ['Investigate for market manipulation', 'Halt pattern-based trading']
      };

      this.activateEmergency(emergencyState);

      const actions: EmergencyAction[] = [
        {
          action: 'halt_trading',
          description: 'Halt pattern-based trading',
          priority: 1,
          executed: false
        },
        {
          action: 'notify_user',
          description: 'Alert user to potential market manipulation',
          priority: 1,
          executed: false
        }
      ];

      this.sendEmergencyNotification(
        EmergencyType.FLOW_EMERGENCY,
        'critical',
        'FLOW EMERGENCY',
        `Extreme CVD divergence (${divergenceScore.toFixed(1)}) detected across exchanges. Possible market manipulation.`,
        ['Trading halted', 'Investigate divergence', 'Wait for normalization']
      );

      return {
        triggered: true,
        type: EmergencyType.FLOW_EMERGENCY,
        reason: emergencyState.reason!,
        severity: 'critical',
        actions,
        timestamp: new Date()
      };
    }

    // Clear flow emergency if conditions no longer met
    if (this.activeEmergencies.has(EmergencyType.FLOW_EMERGENCY)) {
      this.clearEmergency(EmergencyType.FLOW_EMERGENCY);
    }

    return this.createNoTriggerResult();
  }

  /**
   * Check for trap saturation emergency
   * Requirement 14.5: Trigger TRAP_SATURATION when bot trap detection rate > 80%
   */
  checkTrapSaturationEmergency(botTrapAnalysis: BotTrapAnalysis | null, trapDetectionRate: number): EmergencyTriggerResult {
    // Update component health
    if (botTrapAnalysis) {
      this.updateComponentHealth('bot_trap', 'healthy', 'Analysis received');
    }

    if (trapDetectionRate >= this.config.trapSaturationThreshold) {
      const emergencyState: EmergencyState = {
        active: true,
        type: EmergencyType.TRAP_SATURATION,
        triggeredAt: new Date(),
        reason: `Bot trap detection rate: ${(trapDetectionRate * 100).toFixed(1)}% (threshold: ${this.config.trapSaturationThreshold * 100}%)`,
        actions: ['Pause pattern-based trading', 'Wait for market conditions to normalize']
      };

      this.activateEmergency(emergencyState);

      const actions: EmergencyAction[] = [
        {
          action: 'halt_trading',
          description: 'Pause pattern-based trading',
          priority: 2,
          executed: false
        },
        {
          action: 'notify_user',
          description: 'Alert user to high bot trap saturation',
          priority: 2,
          executed: false
        }
      ];

      this.sendEmergencyNotification(
        EmergencyType.TRAP_SATURATION,
        'warning',
        'TRAP SATURATION WARNING',
        `${(trapDetectionRate * 100).toFixed(1)}% of signals flagged as bot traps. Pattern-based trading paused.`,
        ['Pattern trading paused', 'Monitor market conditions', 'Consider manual trading only']
      );

      return {
        triggered: true,
        type: EmergencyType.TRAP_SATURATION,
        reason: emergencyState.reason!,
        severity: 'warning',
        actions,
        timestamp: new Date()
      };
    }

    // Clear trap saturation emergency if conditions no longer met
    if (this.activeEmergencies.has(EmergencyType.TRAP_SATURATION)) {
      this.clearEmergency(EmergencyType.TRAP_SATURATION);
    }

    return this.createNoTriggerResult();
  }

  /**
   * Update exchange status
   */
  updateExchangeStatus(exchange: string, status: ConnectionStatus): void {
    this.exchangeStatuses.set(exchange, {
      status,
      lastSeen: new Date()
    });

    // Check for liquidity emergency after status update
    this.checkLiquidityEmergency();
  }

  // ============================================================================
  // GRACEFUL DEGRADATION (Requirement 14.6)
  // ============================================================================

  /**
   * Assess system health and calculate degradation level
   * Requirement 14.6: Fall back to classic Phase 2 logic when multiple systems fail
   */
  assessSystemHealth(): SystemHealthAssessment {
    const components = Array.from(this.componentHealth.values());
    const activeEmergencies = Array.from(this.activeEmergencies.values());
    
    // Count component statuses
    const healthyCount = components.filter(c => c.status === 'healthy').length;
    const degradedCount = components.filter(c => c.status === 'degraded').length;
    const failedCount = components.filter(c => c.status === 'failed').length;

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'critical' | 'emergency';
    
    if (activeEmergencies.length > 0) {
      overallHealth = 'emergency';
    } else if (failedCount >= 2 || (failedCount >= 1 && degradedCount >= 2)) {
      overallHealth = 'critical';
    } else if (failedCount >= 1 || degradedCount >= 2) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'healthy';
    }

    // Calculate degradation level
    const degradationLevel = this.calculateDegradationLevel(components, activeEmergencies);
    this.updateDegradationLevel(degradationLevel);

    // Generate recommendations
    const recommendations = this.generateRecommendations(components, activeEmergencies);

    const assessment: SystemHealthAssessment = {
      overallHealth,
      components,
      degradationLevel,
      activeEmergencies,
      recommendations,
      timestamp: new Date()
    };

    this.emit('health:updated', assessment);
    return assessment;
  }

  /**
   * Calculate degradation level based on component health
   */
  private calculateDegradationLevel(
    components: ComponentHealth[],
    emergencies: EmergencyState[]
  ): DegradationLevel {
    const failedComponents = components.filter(c => c.status === 'failed').map(c => c.component);
    const degradedComponents = components.filter(c => c.status === 'degraded').map(c => c.component);
    const affectedComponents = [...failedComponents, ...degradedComponents];

    // Emergency level
    if (emergencies.length > 0) {
      return {
        level: 'emergency',
        affectedComponents,
        fallbackStrategy: 'Halt all trading, flatten positions if PREDICTION_EMERGENCY',
        performanceImpact: 100
      };
    }

    // Significant degradation
    if (failedComponents.length >= 2) {
      return {
        level: 'significant',
        affectedComponents,
        fallbackStrategy: 'Fall back to classic Phase 2 logic',
        performanceImpact: 60
      };
    }

    // Partial degradation
    if (failedComponents.length >= 1 || degradedComponents.length >= 2) {
      return {
        level: 'partial',
        affectedComponents,
        fallbackStrategy: 'Disable non-critical enhancements',
        performanceImpact: 30
      };
    }

    // No degradation
    return {
      level: 'none',
      affectedComponents: [],
      fallbackStrategy: 'none',
      performanceImpact: 0
    };
  }

  /**
   * Update degradation level and emit event if changed
   */
  private updateDegradationLevel(newLevel: DegradationLevel): void {
    if (this.currentDegradation.level !== newLevel.level) {
      const oldLevel = this.currentDegradation;
      this.currentDegradation = newLevel;
      
      this.emit('degradation:changed', newLevel);
      
      this.logEmergencyEvent(
        'DEGRADATION',
        null,
        newLevel.level === 'emergency' ? 'critical' : 'warning',
        `Degradation level changed: ${oldLevel.level} -> ${newLevel.level}`,
        { oldLevel, newLevel }
      );
    }
  }

  /**
   * Generate recommendations based on system state
   */
  private generateRecommendations(
    components: ComponentHealth[],
    emergencies: EmergencyState[]
  ): string[] {
    const recommendations: string[] = [];

    // Emergency recommendations
    for (const emergency of emergencies) {
      switch (emergency.type) {
        case EmergencyType.PREDICTION_EMERGENCY:
          recommendations.push('Flatten all positions immediately');
          recommendations.push('Wait for extreme event to resolve');
          break;
        case EmergencyType.LIQUIDITY_EMERGENCY:
          recommendations.push('Monitor exchange connectivity');
          recommendations.push('Manage existing positions manually');
          break;
        case EmergencyType.FLOW_EMERGENCY:
          recommendations.push('Investigate CVD divergence source');
          recommendations.push('Wait for market normalization');
          break;
        case EmergencyType.TRAP_SATURATION:
          recommendations.push('Avoid pattern-based entries');
          recommendations.push('Consider manual trading only');
          break;
      }
    }

    // Component-specific recommendations
    for (const component of components) {
      if (component.status === 'failed') {
        recommendations.push(`Restart ${component.component} component`);
      } else if (component.status === 'degraded') {
        recommendations.push(`Monitor ${component.component} for further degradation`);
      }
    }

    // Degradation recommendations
    if (this.currentDegradation.level === 'significant') {
      recommendations.push('Consider switching to classic Phase 2 mode');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Check if system should fall back to classic Phase 2
   */
  shouldFallbackToClassic(): boolean {
    return this.currentDegradation.level === 'significant' || 
           this.currentDegradation.level === 'emergency';
  }

  /**
   * Get current degradation level
   */
  getDegradationLevel(): DegradationLevel {
    return { ...this.currentDegradation };
  }


  // ============================================================================
  // EMERGENCY NOTIFICATION AND LOGGING (Requirement 14.7)
  // ============================================================================

  /**
   * Send emergency notification to user
   * Requirement 14.7: Notify user immediately when emergency protocol activates
   */
  private sendEmergencyNotification(
    type: EmergencyType,
    severity: 'warning' | 'critical' | 'emergency',
    title: string,
    message: string,
    actions: string[]
  ): void {
    if (!this.config.enableNotifications) return;

    // Check cooldown
    const lastNotification = this.lastNotificationTime.get(type);
    if (lastNotification && Date.now() - lastNotification < this.config.notificationCooldown) {
      return; // Skip notification due to cooldown
    }

    const notification: EmergencyNotification = {
      id: `${type}_${Date.now()}`,
      type,
      severity,
      title,
      message,
      actions,
      timestamp: new Date(),
      acknowledged: false
    };

    this.notificationHistory.push(notification);
    this.lastNotificationTime.set(type, Date.now());

    // Emit notification event
    this.emit('notification:sent', notification);

    // Log notification
    this.logEmergencyEvent(
      'NOTIFICATION',
      type,
      severity,
      `Notification sent: ${title}`,
      { notification }
    );

    // Console output for immediate visibility
    const severityEmoji = severity === 'emergency' ? '🚨' : severity === 'critical' ? '⚠️' : '⚡';
    console.log(`${severityEmoji} EMERGENCY NOTIFICATION: ${title}`);
    console.log(`   ${message}`);
    console.log(`   Actions: ${actions.join(', ')}`);
  }

  /**
   * Log emergency event with detailed system state
   * Requirement 14.7: Log detailed system state for emergency analysis
   */
  private logEmergencyEvent(
    type: EmergencyLogEntry['type'],
    emergencyType: EmergencyType | null,
    severity: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    const entry: EmergencyLogEntry = {
      timestamp: new Date(),
      type,
      emergencyType,
      severity,
      message,
      systemState: {
        overallHealth: this.getOverallHealth(),
        degradationLevel: this.currentDegradation,
        activeEmergencies: Array.from(this.activeEmergencies.values())
      },
      metadata
    };

    this.emergencyLog.push(entry);

    // Keep log size manageable (last 1000 entries)
    if (this.emergencyLog.length > 1000) {
      this.emergencyLog = this.emergencyLog.slice(-1000);
    }

    // Emit log event
    this.emit('log:entry', entry);

    // Console output
    const timestamp = entry.timestamp.toISOString();
    console.log(`🚨 [${timestamp}] ${type}: ${message}`);
  }

  /**
   * Get overall health status
   */
  private getOverallHealth(): 'healthy' | 'degraded' | 'critical' | 'emergency' {
    if (this.activeEmergencies.size > 0) return 'emergency';
    if (this.currentDegradation.level === 'significant') return 'critical';
    if (this.currentDegradation.level === 'partial') return 'degraded';
    return 'healthy';
  }

  /**
   * Get emergency log entries
   */
  getEmergencyLog(limit?: number): EmergencyLogEntry[] {
    const entries = [...this.emergencyLog];
    return limit ? entries.slice(-limit) : entries;
  }

  /**
   * Get notification history
   */
  getNotificationHistory(limit?: number): EmergencyNotification[] {
    const notifications = [...this.notificationHistory];
    return limit ? notifications.slice(-limit) : notifications;
  }

  /**
   * Acknowledge notification
   */
  acknowledgeNotification(notificationId: string): boolean {
    const notification = this.notificationHistory.find(n => n.id === notificationId);
    if (notification) {
      notification.acknowledged = true;
      return true;
    }
    return false;
  }

  // ============================================================================
  // EMERGENCY STATE MANAGEMENT
  // ============================================================================

  /**
   * Activate an emergency
   */
  private activateEmergency(state: EmergencyState): void {
    if (!state.type) return;

    // Check if already active
    if (this.activeEmergencies.has(state.type)) {
      return; // Already active
    }

    this.activeEmergencies.set(state.type, state);
    this.emit('emergency:triggered', state);

    this.logEmergencyEvent(
      'TRIGGER',
      state.type,
      'critical',
      `Emergency activated: ${state.type} - ${state.reason}`,
      { state }
    );
  }

  /**
   * Clear an emergency
   */
  clearEmergency(type: EmergencyType): void {
    if (!this.activeEmergencies.has(type)) return;

    this.activeEmergencies.delete(type);
    this.emit('emergency:cleared', type);

    this.logEmergencyEvent(
      'CLEAR',
      type,
      'info',
      `Emergency cleared: ${type}`
    );

    // Reassess system health after clearing
    this.assessSystemHealth();
  }

  /**
   * Get active emergencies
   */
  getActiveEmergencies(): EmergencyState[] {
    return Array.from(this.activeEmergencies.values());
  }

  /**
   * Check if any emergency is active
   */
  hasActiveEmergency(): boolean {
    return this.activeEmergencies.size > 0;
  }

  /**
   * Check if specific emergency type is active
   */
  isEmergencyActive(type: EmergencyType): boolean {
    return this.activeEmergencies.has(type);
  }

  /**
   * Get emergency state for specific type
   */
  getEmergencyState(type: EmergencyType): EmergencyState | null {
    return this.activeEmergencies.get(type) || null;
  }

  // ============================================================================
  // COMPONENT HEALTH MANAGEMENT
  // ============================================================================

  /**
   * Update component health status
   */
  updateComponentHealth(
    component: string,
    status: 'healthy' | 'degraded' | 'failed',
    details: string
  ): void {
    const current = this.componentHealth.get(component);
    
    if (current) {
      const wasHealthy = current.status === 'healthy';
      const isNowFailed = status === 'failed';

      current.status = status;
      current.lastUpdate = new Date();
      current.details = details;

      if (isNowFailed && wasHealthy) {
        current.errorCount++;
      } else if (status === 'healthy') {
        current.errorCount = 0;
      }

      this.componentHealth.set(component, current);
    }

    // Reassess system health after component update
    if (this.config.enableGracefulDegradation) {
      this.assessSystemHealth();
    }
  }

  /**
   * Record component error
   */
  recordComponentError(component: string, error: string): void {
    const current = this.componentHealth.get(component);
    
    if (current) {
      current.errorCount++;
      current.details = error;
      
      // Degrade or fail based on error count
      if (current.errorCount >= 5) {
        current.status = 'failed';
      } else if (current.errorCount >= 3) {
        current.status = 'degraded';
      }

      current.lastUpdate = new Date();
      this.componentHealth.set(component, current);
    }

    // Reassess system health
    if (this.config.enableGracefulDegradation) {
      this.assessSystemHealth();
    }
  }

  /**
   * Get component health
   */
  getComponentHealth(component: string): ComponentHealth | null {
    return this.componentHealth.get(component) || null;
  }

  /**
   * Get all component health statuses
   */
  getAllComponentHealth(): ComponentHealth[] {
    return Array.from(this.componentHealth.values());
  }

  // ============================================================================
  // COMPREHENSIVE EVALUATION
  // ============================================================================

  /**
   * Perform comprehensive emergency evaluation
   * Checks all emergency conditions and returns combined result
   */
  evaluateAllConditions(
    oracleScore: OracleScore | null,
    globalCVD: GlobalCVDData | null,
    botTrapAnalysis: BotTrapAnalysis | null,
    trapDetectionRate: number
  ): {
    hasEmergency: boolean;
    emergencies: EmergencyTriggerResult[];
    systemHealth: SystemHealthAssessment;
    shouldHaltTrading: boolean;
    shouldFlattenPositions: boolean;
  } {
    const emergencies: EmergencyTriggerResult[] = [];

    // Check all emergency conditions
    const predictionResult = this.checkPredictionEmergency(oracleScore);
    if (predictionResult.triggered) emergencies.push(predictionResult);

    const liquidityResult = this.checkLiquidityEmergency();
    if (liquidityResult.triggered) emergencies.push(liquidityResult);

    const flowResult = this.checkFlowEmergency(globalCVD);
    if (flowResult.triggered) emergencies.push(flowResult);

    const trapResult = this.checkTrapSaturationEmergency(botTrapAnalysis, trapDetectionRate);
    if (trapResult.triggered) emergencies.push(trapResult);

    // Assess system health
    const systemHealth = this.assessSystemHealth();

    // Determine actions
    const shouldHaltTrading = emergencies.some(e => 
      e.actions.some(a => a.action === 'halt_trading')
    );

    const shouldFlattenPositions = emergencies.some(e => 
      e.actions.some(a => a.action === 'flatten_positions')
    );

    return {
      hasEmergency: emergencies.length > 0,
      emergencies,
      systemHealth,
      shouldHaltTrading,
      shouldFlattenPositions
    };
  }

  // ============================================================================
  // HEALTH CHECK MONITORING
  // ============================================================================

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.assessSystemHealth();
    }, this.config.degradationCheckInterval);

    console.log(`🚨 Emergency Protocol Manager: Started health checks (${this.config.degradationCheckInterval}ms interval)`);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Create no-trigger result
   */
  private createNoTriggerResult(): EmergencyTriggerResult {
    return {
      triggered: false,
      type: null,
      reason: '',
      severity: 'warning',
      actions: [],
      timestamp: new Date()
    };
  }

  /**
   * Get configuration
   */
  getConfig(): EmergencyProtocolConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EmergencyProtocolConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart health checks if interval changed
    if (config.degradationCheckInterval && this.healthCheckInterval) {
      this.stopHealthChecks();
      this.startHealthChecks();
    }

    console.log('🚨 Emergency Protocol Manager: Configuration updated');
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeEmergencyCount: number;
    totalEmergenciesTriggered: number;
    totalNotificationsSent: number;
    currentDegradationLevel: string;
    componentHealthSummary: Record<string, number>;
  } {
    const componentHealthSummary: Record<string, number> = {
      healthy: 0,
      degraded: 0,
      failed: 0
    };

    for (const health of this.componentHealth.values()) {
      componentHealthSummary[health.status]++;
    }

    return {
      activeEmergencyCount: this.activeEmergencies.size,
      totalEmergenciesTriggered: this.emergencyLog.filter(e => e.type === 'TRIGGER').length,
      totalNotificationsSent: this.notificationHistory.length,
      currentDegradationLevel: this.currentDegradation.level,
      componentHealthSummary
    };
  }

  /**
   * Reset state (for testing)
   */
  resetState(): void {
    this.activeEmergencies.clear();
    this.emergencyLog = [];
    this.notificationHistory = [];
    this.lastNotificationTime.clear();
    this.lastOracleUpdate = null;
    this.lastGlobalCVDUpdate = null;
    
    this.currentDegradation = {
      level: 'none',
      affectedComponents: [],
      fallbackStrategy: 'none',
      performanceImpact: 0
    };

    this.initializeComponentHealth();
    this.initializeExchangeStatuses();

    console.log('🚨 Emergency Protocol Manager: State reset');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHealthChecks();
    this.removeAllListeners();
    console.log('🚨 Emergency Protocol Manager: Destroyed');
  }
}

// Export event interface for TypeScript
export declare interface EmergencyProtocolManager {
  on<U extends keyof EmergencyProtocolEvents>(event: U, listener: EmergencyProtocolEvents[U]): this;
  emit<U extends keyof EmergencyProtocolEvents>(event: U, ...args: Parameters<EmergencyProtocolEvents[U]>): boolean;
}
