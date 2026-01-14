import { EventEmitter } from 'events';

export class Guardrails extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Global bounds
    this.globalBounds = {
      maxLeverage: options.maxLeverage || 20,
      maxStopLossPct: options.maxStopLossPct || 5,
      maxRiskPerTrade: options.maxRiskPerTrade || 5,
      maxPositionSizePct: options.maxPositionSizePct || 50,
      maxDailyDrawdownPct: options.maxDailyDrawdownPct || 10,
      maxTotalDrawdownPct: options.maxTotalDrawdownPct || 20,
      minConfidenceScore: options.minConfidenceScore || 0.5,
      maxConsecutiveLosses: options.maxConsecutiveLosses || 10
    };
    
    // Phase-specific bounds
    this.phaseBounds = {
      1: { // Scavenger
        maxLeverage: 20,
        maxRiskPerTrade: 10,
        maxPositionSizePct: 50,
        allowedTrapTypes: ['LIQUIDATION', 'OI_WIPEOUT', 'FUNDING_SQUEEZE', 'BASIS_ARB', 'DAILY_LEVEL', 'BOLLINGER']
      },
      2: { // Hunter
        maxLeverage: 5,
        maxRiskPerTrade: 5,
        maxPositionSizePct: 25,
        allowedSignalTypes: ['swing', 'day']
      },
      3: { // Sentinel
        maxLeverage: 2,
        maxRiskPerTrade: 2,
        maxPositionSizePct: 100, // Delta-neutral allows full allocation
        allowedSignalTypes: ['funding_arb', 'stat_arb', 'rebalance']
      }
    };
    
    this.databaseManager = null;
    this.logger = options.logger || console;
  }

  /**
   * Initialize with dependencies
   */
  initialize(dependencies) {
    this.databaseManager = dependencies.databaseManager;
    this.log('info', 'Guardrails initialized');
  }

  /**
   * Validate a configuration against bounds
   */
  validateConfig(config, phase = null) {
    const violations = [];
    const bounds = phase ? { ...this.globalBounds, ...this.phaseBounds[phase] } : this.globalBounds;
    
    // Check leverage
    if (config.leverage !== undefined && config.leverage > bounds.maxLeverage) {
      violations.push({
        field: 'leverage',
        value: config.leverage,
        limit: bounds.maxLeverage,
        message: `Leverage ${config.leverage}x exceeds maximum ${bounds.maxLeverage}x`
      });
    }
    
    // Check stop loss
    if (config.stopLossPct !== undefined && config.stopLossPct > bounds.maxStopLossPct) {
      violations.push({
        field: 'stopLossPct',
        value: config.stopLossPct,
        limit: bounds.maxStopLossPct,
        message: `Stop loss ${config.stopLossPct}% exceeds maximum ${bounds.maxStopLossPct}%`
      });
    }
    
    // Check risk per trade
    if (config.riskPerTrade !== undefined && config.riskPerTrade > bounds.maxRiskPerTrade) {
      violations.push({
        field: 'riskPerTrade',
        value: config.riskPerTrade,
        limit: bounds.maxRiskPerTrade,
        message: `Risk per trade ${config.riskPerTrade}% exceeds maximum ${bounds.maxRiskPerTrade}%`
      });
    }
    
    // Check position size
    if (config.positionSizePct !== undefined && config.positionSizePct > bounds.maxPositionSizePct) {
      violations.push({
        field: 'positionSizePct',
        value: config.positionSizePct,
        limit: bounds.maxPositionSizePct,
        message: `Position size ${config.positionSizePct}% exceeds maximum ${bounds.maxPositionSizePct}%`
      });
    }
    
    // Check daily drawdown
    if (config.dailyDrawdownLimit !== undefined && config.dailyDrawdownLimit > bounds.maxDailyDrawdownPct) {
      violations.push({
        field: 'dailyDrawdownLimit',
        value: config.dailyDrawdownLimit,
        limit: bounds.maxDailyDrawdownPct,
        message: `Daily drawdown limit ${config.dailyDrawdownLimit}% exceeds maximum ${bounds.maxDailyDrawdownPct}%`
      });
    }
    
    // Check total drawdown
    if (config.totalDrawdownLimit !== undefined && config.totalDrawdownLimit > bounds.maxTotalDrawdownPct) {
      violations.push({
        field: 'totalDrawdownLimit',
        value: config.totalDrawdownLimit,
        limit: bounds.maxTotalDrawdownPct,
        message: `Total drawdown limit ${config.totalDrawdownLimit}% exceeds maximum ${bounds.maxTotalDrawdownPct}%`
      });
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Validate a proposal against bounds
   */
  async validateProposal(proposal) {
    const violations = [];
    
    // Check confidence score
    if (proposal.confidence < this.globalBounds.minConfidenceScore) {
      violations.push({
        field: 'confidence',
        value: proposal.confidence,
        limit: this.globalBounds.minConfidenceScore,
        message: `Confidence ${proposal.confidence} below minimum ${this.globalBounds.minConfidenceScore}`
      });
    }
    
    // Validate new config
    if (proposal.newConfig) {
      const configValidation = this.validateConfig(proposal.newConfig);
      violations.push(...configValidation.violations);
    }
    
    // Check for dangerous changes
    const dangerousChanges = this.checkDangerousChanges(proposal);
    violations.push(...dangerousChanges);
    
    if (violations.length > 0) {
      // Log rejection
      await this.logGuardrailReject(proposal, violations);
      
      this.emit('proposalRejected', {
        proposal,
        violations
      });
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Check for dangerous configuration changes
   */
  checkDangerousChanges(proposal) {
    const violations = [];
    
    if (!proposal.oldConfig || !proposal.newConfig) {
      return violations;
    }
    
    // Check for leverage increase > 50%
    if (proposal.newConfig.leverage && proposal.oldConfig.leverage) {
      const increase = (proposal.newConfig.leverage - proposal.oldConfig.leverage) / proposal.oldConfig.leverage;
      if (increase > 0.5) {
        violations.push({
          field: 'leverage',
          value: proposal.newConfig.leverage,
          message: `Leverage increase of ${(increase * 100).toFixed(0)}% is too aggressive`
        });
      }
    }
    
    // Check for risk increase > 100%
    if (proposal.newConfig.riskPerTrade && proposal.oldConfig.riskPerTrade) {
      const increase = (proposal.newConfig.riskPerTrade - proposal.oldConfig.riskPerTrade) / proposal.oldConfig.riskPerTrade;
      if (increase > 1.0) {
        violations.push({
          field: 'riskPerTrade',
          value: proposal.newConfig.riskPerTrade,
          message: `Risk per trade increase of ${(increase * 100).toFixed(0)}% is too aggressive`
        });
      }
    }
    
    // Check for disabling too many safety features
    const safetyFeatures = ['circuitBreaker', 'maxDrawdown', 'dailyLossLimit', 'killSwitch'];
    let disabledCount = 0;
    
    for (const feature of safetyFeatures) {
      if (proposal.oldConfig[feature] === true && proposal.newConfig[feature] === false) {
        disabledCount++;
      }
    }
    
    if (disabledCount >= 2) {
      violations.push({
        field: 'safetyFeatures',
        value: disabledCount,
        message: `Disabling ${disabledCount} safety features is not allowed`
      });
    }
    
    return violations;
  }

  /**
   * Validate a signal against phase bounds
   */
  validateSignal(signal, phase, equity) {
    const violations = [];
    const bounds = this.phaseBounds[phase] || this.globalBounds;
    
    // Check leverage
    if (signal.leverage > bounds.maxLeverage) {
      violations.push({
        field: 'leverage',
        value: signal.leverage,
        limit: bounds.maxLeverage,
        message: `Signal leverage ${signal.leverage}x exceeds phase ${phase} limit ${bounds.maxLeverage}x`
      });
    }
    
    // Check position size
    const positionValue = signal.qty * signal.entry_price;
    const positionPct = (positionValue / equity) * 100;
    
    if (positionPct > bounds.maxPositionSizePct) {
      violations.push({
        field: 'positionSize',
        value: positionPct,
        limit: bounds.maxPositionSizePct,
        message: `Position size ${positionPct.toFixed(1)}% exceeds phase ${phase} limit ${bounds.maxPositionSizePct}%`
      });
    }
    
    // Check trap type (Phase 1)
    if (phase === 1 && signal.trap_type && bounds.allowedTrapTypes) {
      if (!bounds.allowedTrapTypes.includes(signal.trap_type)) {
        violations.push({
          field: 'trapType',
          value: signal.trap_type,
          message: `Trap type ${signal.trap_type} not allowed in phase ${phase}`
        });
      }
    }
    
    // Check signal type (Phase 2/3)
    if ((phase === 2 || phase === 3) && signal.signal_type && bounds.allowedSignalTypes) {
      if (!bounds.allowedSignalTypes.includes(signal.signal_type)) {
        violations.push({
          field: 'signalType',
          value: signal.signal_type,
          message: `Signal type ${signal.signal_type} not allowed in phase ${phase}`
        });
      }
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Apply guardrails to a config (clamp values to bounds)
   */
  applyGuardrails(config, phase = null) {
    const bounds = phase ? { ...this.globalBounds, ...this.phaseBounds[phase] } : this.globalBounds;
    const clamped = { ...config };
    const changes = [];
    
    if (clamped.leverage !== undefined && clamped.leverage > bounds.maxLeverage) {
      changes.push(`leverage: ${clamped.leverage} → ${bounds.maxLeverage}`);
      clamped.leverage = bounds.maxLeverage;
    }
    
    if (clamped.stopLossPct !== undefined && clamped.stopLossPct > bounds.maxStopLossPct) {
      changes.push(`stopLossPct: ${clamped.stopLossPct} → ${bounds.maxStopLossPct}`);
      clamped.stopLossPct = bounds.maxStopLossPct;
    }
    
    if (clamped.riskPerTrade !== undefined && clamped.riskPerTrade > bounds.maxRiskPerTrade) {
      changes.push(`riskPerTrade: ${clamped.riskPerTrade} → ${bounds.maxRiskPerTrade}`);
      clamped.riskPerTrade = bounds.maxRiskPerTrade;
    }
    
    if (clamped.positionSizePct !== undefined && clamped.positionSizePct > bounds.maxPositionSizePct) {
      changes.push(`positionSizePct: ${clamped.positionSizePct} → ${bounds.maxPositionSizePct}`);
      clamped.positionSizePct = bounds.maxPositionSizePct;
    }
    
    if (changes.length > 0) {
      this.log('warn', `Guardrails applied: ${changes.join(', ')}`);
    }
    
    return {
      config: clamped,
      changes
    };
  }

  /**
   * Log guardrail rejection
   */
  async logGuardrailReject(proposal, violations) {
    if (this.databaseManager) {
      await this.databaseManager.run(`
        INSERT INTO system_events (event_type, severity, service, message, context)
        VALUES (?, ?, 'guardrails', ?, ?)
      `, [
        'GUARDRAIL_REJECT',
        'warn',
        `Proposal rejected: ${proposal.topic}`,
        JSON.stringify({ proposal, violations })
      ]);
    }
    
    this.log('warn', `Guardrail rejection: ${proposal.topic}`, { violations });
  }

  /**
   * Get current bounds
   */
  getBounds(phase = null) {
    if (phase) {
      return { ...this.globalBounds, ...this.phaseBounds[phase] };
    }
    return this.globalBounds;
  }

  /**
   * Update bounds (with validation)
   */
  updateBounds(newBounds, phase = null) {
    // Validate new bounds are not more permissive than hardcoded limits
    const hardLimits = {
      maxLeverage: 50,
      maxStopLossPct: 10,
      maxRiskPerTrade: 10,
      maxPositionSizePct: 100,
      maxDailyDrawdownPct: 20,
      maxTotalDrawdownPct: 30
    };
    
    for (const [key, value] of Object.entries(newBounds)) {
      if (hardLimits[key] !== undefined && value > hardLimits[key]) {
        throw new Error(`Cannot set ${key} above hard limit ${hardLimits[key]}`);
      }
    }
    
    if (phase) {
      this.phaseBounds[phase] = { ...this.phaseBounds[phase], ...newBounds };
    } else {
      this.globalBounds = { ...this.globalBounds, ...newBounds };
    }
    
    this.log('info', `Bounds updated`, { phase, newBounds });
  }

  /**
   * Logging helper
   */
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'guardrails',
      level,
      message,
      ...context
    };
    
    if (this.logger && typeof this.logger.log === 'function') {
      this.logger.log(level, message, context);
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
}
