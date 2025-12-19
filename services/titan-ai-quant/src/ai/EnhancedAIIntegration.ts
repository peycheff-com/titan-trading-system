/**
 * Enhanced AI Integration Orchestrator
 * 
 * Orchestrates real-time parameter optimization, predictive analytics,
 * adaptive risk management, and automated strategy selection.
 * 
 * Requirements: 10.5 - Enhanced AI integration with live trading data
 */

import { EventEmitter } from 'eventemitter3';
import { RealTimeOptimizer, RealTimeOptimizerConfig } from './RealTimeOptimizer';
import { PredictiveAnalytics, PredictiveAnalyticsConfig, MarketRegime, RiskAdjustment, StrategyPrediction } from './PredictiveAnalytics';
import { TitanAnalyst } from './TitanAnalyst';
import { getTelemetryService } from '../../../shared/src';
import { Trade, RegimeSnapshot, OHLCV, Config, OptimizationProposal } from '../types';

/**
 * Strategy selection criteria
 */
export interface StrategySelection {
  timestamp: number;
  symbol: string;
  regime: MarketRegime;
  selectedStrategies: Array<{
    strategy: string;
    allocation: number; // 0-1
    confidence: number;
    reasoning: string;
  }>;
  disabledStrategies: Array<{
    strategy: string;
    reasoning: string;
  }>;
  totalAllocation: number;
}

/**
 * Adaptive risk configuration
 */
export interface AdaptiveRiskConfig {
  timestamp: number;
  baseConfig: Config;
  adjustments: RiskAdjustment[];
  finalConfig: Config;
  riskScore: number;
  confidence: number;
}

/**
 * AI integration status
 */
export interface AIIntegrationStatus {
  timestamp: number;
  realTimeOptimizer: {
    isRunning: boolean;
    optimizationCount: number;
    activeABTests: number;
  };
  predictiveAnalytics: {
    isRunning: boolean;
    symbolsTracked: number;
    modelsActive: number;
  };
  currentRegimes: Record<string, MarketRegime>;
  activeStrategies: Record<string, number>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  performanceScore: number;
}

/**
 * Enhanced AI Integration configuration
 */
export interface EnhancedAIIntegrationConfig {
  realTimeOptimizer: Partial<RealTimeOptimizerConfig>;
  predictiveAnalytics: Partial<PredictiveAnalyticsConfig>;
  strategySelectionInterval: number; // milliseconds
  riskAdjustmentInterval: number; // milliseconds
  performanceEvaluationInterval: number; // milliseconds
  enableAutomatedStrategySelection: boolean;
  enableAdaptiveRiskManagement: boolean;
  maxRiskAdjustmentFrequency: number; // per hour
  strategyAllocationLimits: {
    maxSingleStrategy: number; // 0-1
    minDiversification: number; // minimum number of active strategies
  };
}

/**
 * Enhanced AI Integration Orchestrator
 */
export class EnhancedAIIntegration extends EventEmitter {
  private realTimeOptimizer: RealTimeOptimizer;
  private predictiveAnalytics: PredictiveAnalytics;
  private analyst: TitanAnalyst;
  private telemetry: ReturnType<typeof getTelemetryService>;
  private config: Required<EnhancedAIIntegrationConfig>;
  
  private strategySelectionTimer: NodeJS.Timeout | null = null;
  private riskAdjustmentTimer: NodeJS.Timeout | null = null;
  private performanceEvaluationTimer: NodeJS.Timeout | null = null;
  
  private currentStrategySelection = new Map<string, StrategySelection>();
  private currentRiskConfig: AdaptiveRiskConfig | null = null;
  private performanceHistory: Array<{ timestamp: number; score: number }> = [];
  private riskAdjustmentCount = 0;
  private lastRiskAdjustmentTime = 0;

  constructor(
    analyst?: TitanAnalyst,
    config: Partial<EnhancedAIIntegrationConfig> = {}
  ) {
    super();
    
    this.analyst = analyst || new TitanAnalyst();
    this.telemetry = getTelemetryService();
    
    this.config = {
      realTimeOptimizer: config.realTimeOptimizer || {},
      predictiveAnalytics: config.predictiveAnalytics || {},
      strategySelectionInterval: config.strategySelectionInterval ?? 300000, // 5 minutes
      riskAdjustmentInterval: config.riskAdjustmentInterval ?? 600000, // 10 minutes
      performanceEvaluationInterval: config.performanceEvaluationInterval ?? 900000, // 15 minutes
      enableAutomatedStrategySelection: config.enableAutomatedStrategySelection ?? true,
      enableAdaptiveRiskManagement: config.enableAdaptiveRiskManagement ?? true,
      maxRiskAdjustmentFrequency: config.maxRiskAdjustmentFrequency ?? 6,
      strategyAllocationLimits: {
        maxSingleStrategy: config.strategyAllocationLimits?.maxSingleStrategy ?? 0.6,
        minDiversification: config.strategyAllocationLimits?.minDiversification ?? 2,
        ...config.strategyAllocationLimits
      }
    };

    // Initialize components
    this.realTimeOptimizer = new RealTimeOptimizer(this.analyst, this.config.realTimeOptimizer);
    this.predictiveAnalytics = new PredictiveAnalytics(this.config.predictiveAnalytics);

    this.setupEventHandlers();
    this.telemetry.info('EnhancedAIIntegration', 'Enhanced AI integration initialized');
  }

  /**
   * Start enhanced AI integration
   */
  start(): void {
    this.telemetry.info('EnhancedAIIntegration', 'Starting enhanced AI integration');

    // Start core components
    this.realTimeOptimizer.start();
    this.predictiveAnalytics.start();

    // Start orchestration timers
    if (this.config.enableAutomatedStrategySelection) {
      this.strategySelectionTimer = setInterval(() => {
        this.runStrategySelection().catch(error => {
          this.telemetry.error('EnhancedAIIntegration', 'Strategy selection failed', error);
        });
      }, this.config.strategySelectionInterval);
    }

    if (this.config.enableAdaptiveRiskManagement) {
      this.riskAdjustmentTimer = setInterval(() => {
        this.runRiskAdjustment().catch(error => {
          this.telemetry.error('EnhancedAIIntegration', 'Risk adjustment failed', error);
        });
      }, this.config.riskAdjustmentInterval);
    }

    this.performanceEvaluationTimer = setInterval(() => {
      this.evaluatePerformance().catch(error => {
        this.telemetry.error('EnhancedAIIntegration', 'Performance evaluation failed', error);
      });
    }, this.config.performanceEvaluationInterval);

    this.emit('started');
  }

  /**
   * Stop enhanced AI integration
   */
  stop(): void {
    this.telemetry.info('EnhancedAIIntegration', 'Stopping enhanced AI integration');

    // Stop core components
    this.realTimeOptimizer.stop();
    this.predictiveAnalytics.stop();

    // Clear timers
    if (this.strategySelectionTimer) {
      clearInterval(this.strategySelectionTimer);
      this.strategySelectionTimer = null;
    }

    if (this.riskAdjustmentTimer) {
      clearInterval(this.riskAdjustmentTimer);
      this.riskAdjustmentTimer = null;
    }

    if (this.performanceEvaluationTimer) {
      clearInterval(this.performanceEvaluationTimer);
      this.performanceEvaluationTimer = null;
    }

    this.emit('stopped');
  }

  /**
   * Add market data to all components
   */
  addMarketData(symbol: string, ohlcv: OHLCV[]): void {
    this.predictiveAnalytics.addMarketData(symbol, ohlcv);
    this.emit('marketDataAdded', { symbol, dataPoints: ohlcv.length });
  }

  /**
   * Add regime snapshot
   */
  addRegimeSnapshot(snapshot: RegimeSnapshot): void {
    this.predictiveAnalytics.addRegimeSnapshot(snapshot);
    this.emit('regimeSnapshotAdded', snapshot);
  }

  /**
   * Add trade data
   */
  addTrade(trade: Trade): void {
    this.predictiveAnalytics.addTrade(trade);
    this.emit('tradeAdded', trade);
  }

  /**
   * Setup event handlers between components
   */
  private setupEventHandlers(): void {
    // Real-time optimizer events
    this.realTimeOptimizer.on('proposalApplied', (event) => {
      this.telemetry.info('EnhancedAIIntegration', 'Parameter optimization applied', {
        targetKey: event.proposal.targetKey
      });
      this.emit('parameterOptimized', event);
    });

    this.realTimeOptimizer.on('abTestCompleted', (event) => {
      this.telemetry.info('EnhancedAIIntegration', 'A/B test completed', {
        testId: event.test.id,
        recommendation: event.result.recommendation
      });
      this.emit('abTestCompleted', event);
    });

    // Predictive analytics events
    this.predictiveAnalytics.on('regimeUpdated', (event) => {
      this.handleRegimeChange(event.symbol, event.regime);
    });

    this.predictiveAnalytics.on('analyticsCycleCompleted', (event) => {
      this.handleAnalyticsUpdate(event);
    });
  }

  /**
   * Handle regime change
   */
  private handleRegimeChange(symbol: string, regime: MarketRegime): void {
    this.telemetry.info('EnhancedAIIntegration', `Regime change detected: ${symbol} -> ${regime}`);
    
    // Trigger immediate strategy reselection for this symbol
    if (this.config.enableAutomatedStrategySelection) {
      this.runStrategySelectionForSymbol(symbol).catch(error => {
        this.telemetry.error('EnhancedAIIntegration', 'Strategy reselection failed', error);
      });
    }

    this.emit('regimeChanged', { symbol, regime });
  }

  /**
   * Handle analytics update
   */
  private handleAnalyticsUpdate(event: any): void {
    // Check for significant volatility predictions
    for (const volPrediction of event.volatilityPredictions) {
      if (volPrediction.predictedVolatility > volPrediction.currentVolatility * 1.5) {
        this.telemetry.warn('EnhancedAIIntegration', `Volatility spike predicted for ${volPrediction.symbol}`, {
          current: volPrediction.currentVolatility,
          predicted: volPrediction.predictedVolatility
        });
        
        // Trigger immediate risk adjustment
        if (this.config.enableAdaptiveRiskManagement) {
          this.runRiskAdjustment().catch(error => {
            this.telemetry.error('EnhancedAIIntegration', 'Emergency risk adjustment failed', error);
          });
        }
      }
    }

    // Check correlation analysis
    if (event.correlationAnalysis.portfolioCorrelation > 0.8) {
      this.telemetry.warn('EnhancedAIIntegration', 'High portfolio correlation detected', {
        correlation: event.correlationAnalysis.portfolioCorrelation
      });
    }

    this.emit('analyticsUpdated', event);
  }

  /**
   * Run automated strategy selection
   */
  private async runStrategySelection(): Promise<void> {
    try {
      this.telemetry.debug('EnhancedAIIntegration', 'Running strategy selection');

      const regimes = this.predictiveAnalytics.getCurrentRegimes();
      
      for (const [symbol, regime] of regimes) {
        await this.runStrategySelectionForSymbol(symbol);
      }

      this.emit('strategySelectionCompleted');

    } catch (error) {
      this.telemetry.error('EnhancedAIIntegration', 'Strategy selection failed', error as Error);
    }
  }

  /**
   * Run strategy selection for specific symbol
   */
  private async runStrategySelectionForSymbol(symbol: string): Promise<void> {
    const regime = this.predictiveAnalytics.getCurrentRegimes().get(symbol);
    if (!regime) {
      return;
    }

    // Get strategy predictions
    const strategies = ['oi_wipeout', 'funding_spike', 'liquidity_sweep', 'volatility_spike'];
    const predictions: StrategyPrediction[] = [];

    for (const strategy of strategies) {
      const prediction = this.predictiveAnalytics.predictStrategyPerformance(strategy, symbol);
      if (prediction) {
        predictions.push(prediction);
      }
    }

    if (predictions.length === 0) {
      return;
    }

    // Select strategies based on predictions and regime
    const selection = this.selectOptimalStrategies(symbol, regime, predictions);
    
    this.currentStrategySelection.set(symbol, selection);
    
    this.telemetry.info('EnhancedAIIntegration', `Strategy selection updated for ${symbol}`, {
      regime,
      selectedStrategies: selection.selectedStrategies.length,
      totalAllocation: selection.totalAllocation
    });

    this.emit('strategySelectionUpdated', { symbol, selection });
  }

  /**
   * Select optimal strategies based on predictions
   */
  private selectOptimalStrategies(
    symbol: string,
    regime: MarketRegime,
    predictions: StrategyPrediction[]
  ): StrategySelection {
    // Sort strategies by expected performance
    const sortedPredictions = predictions
      .filter(p => p.predictedPerformance.expectedReturn > 0)
      .sort((a, b) => b.predictedPerformance.sharpeRatio - a.predictedPerformance.sharpeRatio);

    const selectedStrategies: StrategySelection['selectedStrategies'] = [];
    const disabledStrategies: StrategySelection['disabledStrategies'] = [];
    let totalAllocation = 0;

    // Apply regime-specific selection logic
    const maxStrategies = this.getMaxStrategiesForRegime(regime);
    const baseAllocation = 1 / Math.min(maxStrategies, sortedPredictions.length);

    for (let i = 0; i < Math.min(maxStrategies, sortedPredictions.length); i++) {
      const prediction = sortedPredictions[i];
      
      // Calculate allocation based on confidence and performance
      let allocation = baseAllocation * prediction.confidence;
      
      // Apply regime adjustments
      allocation *= this.getRegimeAllocationMultiplier(regime, prediction.strategy);
      
      // Ensure limits
      allocation = Math.min(allocation, this.config.strategyAllocationLimits.maxSingleStrategy);
      
      if (allocation > 0.1 && totalAllocation + allocation <= 1.0) {
        selectedStrategies.push({
          strategy: prediction.strategy,
          allocation,
          confidence: prediction.confidence,
          reasoning: `Expected Sharpe: ${prediction.predictedPerformance.sharpeRatio.toFixed(2)}, Win Rate: ${(prediction.predictedPerformance.winProbability * 100).toFixed(1)}%`
        });
        totalAllocation += allocation;
      }
    }

    // Mark remaining strategies as disabled
    for (const prediction of predictions) {
      if (!selectedStrategies.find(s => s.strategy === prediction.strategy)) {
        disabledStrategies.push({
          strategy: prediction.strategy,
          reasoning: prediction.predictedPerformance.expectedReturn <= 0 
            ? 'Negative expected return'
            : 'Lower priority in current regime'
        });
      }
    }

    // Ensure minimum diversification
    if (selectedStrategies.length < this.config.strategyAllocationLimits.minDiversification) {
      // Add more strategies if available
      for (const prediction of sortedPredictions) {
        if (selectedStrategies.length >= this.config.strategyAllocationLimits.minDiversification) {
          break;
        }
        
        if (!selectedStrategies.find(s => s.strategy === prediction.strategy)) {
          const allocation = Math.min(0.2, (1.0 - totalAllocation) / 2);
          if (allocation > 0.05) {
            selectedStrategies.push({
              strategy: prediction.strategy,
              allocation,
              confidence: prediction.confidence * 0.8, // Reduced confidence for forced diversification
              reasoning: 'Added for diversification'
            });
            totalAllocation += allocation;
          }
        }
      }
    }

    return {
      timestamp: Date.now(),
      symbol,
      regime,
      selectedStrategies,
      disabledStrategies,
      totalAllocation
    };
  }

  /**
   * Run adaptive risk adjustment
   */
  private async runRiskAdjustment(): Promise<void> {
    try {
      // Check rate limiting
      if (!this.canAdjustRisk()) {
        return;
      }

      this.telemetry.debug('EnhancedAIIntegration', 'Running risk adjustment');

      const currentConfig = await this.loadCurrentConfig();
      const riskAdjustments = this.predictiveAnalytics.generateRiskAdjustment(currentConfig);

      if (riskAdjustments.length === 0) {
        return;
      }

      // Apply risk adjustments
      const adjustedConfig = this.applyRiskAdjustments(currentConfig, riskAdjustments);
      const riskScore = this.calculateRiskScore(riskAdjustments);

      this.currentRiskConfig = {
        timestamp: Date.now(),
        baseConfig: currentConfig,
        adjustments: riskAdjustments,
        finalConfig: adjustedConfig,
        riskScore,
        confidence: this.calculateAdjustmentConfidence(riskAdjustments)
      };

      // Apply configuration if confidence is high enough
      if (this.currentRiskConfig.confidence >= 0.7) {
        await this.applyRiskConfiguration(adjustedConfig);
        
        this.telemetry.info('EnhancedAIIntegration', 'Risk configuration adjusted', {
          adjustments: riskAdjustments.length,
          riskScore,
          confidence: this.currentRiskConfig.confidence
        });
      }

      this.riskAdjustmentCount++;
      this.lastRiskAdjustmentTime = Date.now();

      this.emit('riskAdjusted', this.currentRiskConfig);

    } catch (error) {
      this.telemetry.error('EnhancedAIIntegration', 'Risk adjustment failed', error as Error);
    }
  }

  /**
   * Evaluate overall performance
   */
  private async evaluatePerformance(): Promise<void> {
    try {
      this.telemetry.debug('EnhancedAIIntegration', 'Evaluating performance');

      const optimizerStats = this.realTimeOptimizer.getStats();
      const analyticsStats = this.predictiveAnalytics.getStats();

      // Calculate performance score (0-100)
      let performanceScore = 50; // Base score

      // Optimizer contribution
      if (optimizerStats.isRunning) {
        performanceScore += 10;
        performanceScore += Math.min(20, optimizerStats.optimizationCount * 2);
      }

      // Analytics contribution
      if (analyticsStats.isRunning) {
        performanceScore += 10;
        performanceScore += Math.min(10, analyticsStats.symbolsTracked * 2);
      }

      // Data quality contribution
      const totalDataPoints = Object.values(analyticsStats.dataPoints).reduce((sum, count) => sum + count, 0);
      performanceScore += Math.min(10, totalDataPoints / 1000);

      performanceScore = Math.min(100, Math.max(0, performanceScore));

      this.performanceHistory.push({
        timestamp: Date.now(),
        score: performanceScore
      });

      // Keep only recent history
      if (this.performanceHistory.length > 100) {
        this.performanceHistory = this.performanceHistory.slice(-50);
      }

      this.emit('performanceEvaluated', { score: performanceScore });

    } catch (error) {
      this.telemetry.error('EnhancedAIIntegration', 'Performance evaluation failed', error as Error);
    }
  }

  /**
   * Get maximum strategies for regime
   */
  private getMaxStrategiesForRegime(regime: MarketRegime): number {
    switch (regime) {
      case 'high_volatility':
      case 'risk_off':
        return 2; // Conservative in volatile/risky conditions
      case 'bull_trending':
      case 'risk_on':
        return 4; // More aggressive in favorable conditions
      default:
        return 3; // Balanced approach
    }
  }

  /**
   * Get regime allocation multiplier
   */
  private getRegimeAllocationMultiplier(regime: MarketRegime, strategy: string): number {
    // Strategy-specific regime adjustments
    const adjustments: Record<string, Record<MarketRegime, number>> = {
      oi_wipeout: {
        high_volatility: 1.2,
        risk_off: 0.8,
        bull_trending: 1.0,
        bear_trending: 1.1,
        sideways: 0.9,
        low_volatility: 0.7,
        risk_on: 1.0
      },
      funding_spike: {
        high_volatility: 0.8,
        risk_off: 1.2,
        bull_trending: 1.1,
        bear_trending: 1.1,
        sideways: 1.0,
        low_volatility: 0.9,
        risk_on: 1.0
      },
      liquidity_sweep: {
        high_volatility: 1.3,
        risk_off: 0.7,
        bull_trending: 1.1,
        bear_trending: 1.1,
        sideways: 0.8,
        low_volatility: 0.6,
        risk_on: 1.2
      },
      volatility_spike: {
        high_volatility: 1.5,
        risk_off: 1.0,
        bull_trending: 0.8,
        bear_trending: 0.8,
        sideways: 0.5,
        low_volatility: 0.3,
        risk_on: 0.9
      }
    };

    return adjustments[strategy]?.[regime] ?? 1.0;
  }

  /**
   * Check if risk adjustment can run
   */
  private canAdjustRisk(): boolean {
    const hourAgo = Date.now() - 3600000;
    const timeSinceLastAdjustment = Date.now() - this.lastRiskAdjustmentTime;
    
    return this.riskAdjustmentCount < this.config.maxRiskAdjustmentFrequency &&
           timeSinceLastAdjustment >= this.config.riskAdjustmentInterval;
  }

  /**
   * Apply risk adjustments to configuration
   */
  private applyRiskAdjustments(baseConfig: Config, adjustments: RiskAdjustment[]): Config {
    const adjustedConfig = JSON.parse(JSON.stringify(baseConfig));

    for (const adjustment of adjustments) {
      switch (adjustment.trigger) {
        case 'volatility_spike':
          adjustedConfig.risk.max_daily_loss = adjustment.recommendedRisk;
          break;
        case 'correlation_increase':
          adjustedConfig.risk.max_position_size = adjustment.recommendedRisk;
          break;
        case 'regime_change':
          adjustedConfig.risk.max_open_positions = adjustment.recommendedRisk;
          break;
        case 'performance_degradation':
          adjustedConfig.risk.emergency_flatten_threshold = adjustment.recommendedRisk;
          break;
      }
    }

    return adjustedConfig;
  }

  /**
   * Calculate risk score from adjustments
   */
  private calculateRiskScore(adjustments: RiskAdjustment[]): number {
    if (adjustments.length === 0) {
      return 50; // Neutral risk
    }

    const urgencyWeights = { low: 1, medium: 2, high: 3, critical: 4 };
    let totalWeight = 0;
    let weightedUrgency = 0;

    for (const adjustment of adjustments) {
      const weight = urgencyWeights[adjustment.urgency];
      totalWeight += weight;
      weightedUrgency += weight * urgencyWeights[adjustment.urgency];
    }

    const avgUrgency = weightedUrgency / totalWeight;
    return Math.min(100, avgUrgency * 25); // Scale to 0-100
  }

  /**
   * Calculate adjustment confidence
   */
  private calculateAdjustmentConfidence(adjustments: RiskAdjustment[]): number {
    if (adjustments.length === 0) {
      return 1.0;
    }

    const avgConfidence = adjustments.reduce((sum, adj) => sum + adj.confidence, 0) / adjustments.length;
    return avgConfidence;
  }

  /**
   * Load current configuration
   */
  private async loadCurrentConfig(): Promise<Config> {
    // This would load from the actual config system
    return {
      traps: {
        oi_wipeout: {
          enabled: true,
          stop_loss: 0.015,
          take_profit: 0.03,
          risk_per_trade: 0.01,
          max_leverage: 15,
          min_confidence: 0.7,
          cooldown_period: 300
        }
      },
      risk: {
        max_daily_loss: 0.05,
        max_position_size: 0.5,
        max_open_positions: 3,
        emergency_flatten_threshold: 0.1
      },
      execution: {
        latency_penalty: 200,
        slippage_model: 'realistic',
        limit_chaser_enabled: true,
        max_fill_time: 1000
      }
    };
  }

  /**
   * Apply risk configuration
   */
  private async applyRiskConfiguration(config: Config): Promise<void> {
    // This would apply to the actual config system
    this.telemetry.info('EnhancedAIIntegration', 'Risk configuration applied');
  }

  /**
   * Get integration status
   */
  getStatus(): AIIntegrationStatus {
    const optimizerStats = this.realTimeOptimizer.getStats();
    const analyticsStats = this.predictiveAnalytics.getStats();
    const regimes = this.predictiveAnalytics.getCurrentRegimes();

    // Calculate active strategies
    const activeStrategies: Record<string, number> = {};
    for (const selection of this.currentStrategySelection.values()) {
      for (const strategy of selection.selectedStrategies) {
        activeStrategies[strategy.strategy] = (activeStrategies[strategy.strategy] || 0) + strategy.allocation;
      }
    }

    // Calculate risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (this.currentRiskConfig) {
      const score = this.currentRiskConfig.riskScore;
      if (score > 75) riskLevel = 'critical';
      else if (score > 50) riskLevel = 'high';
      else if (score > 25) riskLevel = 'medium';
    }

    // Calculate performance score
    const recentPerformance = this.performanceHistory.slice(-5);
    const performanceScore = recentPerformance.length > 0
      ? recentPerformance.reduce((sum, p) => sum + p.score, 0) / recentPerformance.length
      : 50;

    return {
      timestamp: Date.now(),
      realTimeOptimizer: {
        isRunning: optimizerStats.isRunning,
        optimizationCount: optimizerStats.optimizationCount,
        activeABTests: optimizerStats.activeABTests
      },
      predictiveAnalytics: {
        isRunning: analyticsStats.isRunning,
        symbolsTracked: analyticsStats.symbolsTracked,
        modelsActive: analyticsStats.modelsActive
      },
      currentRegimes: Object.fromEntries(regimes),
      activeStrategies,
      riskLevel,
      performanceScore
    };
  }

  /**
   * Get current strategy selections
   */
  getCurrentStrategySelections(): Map<string, StrategySelection> {
    return new Map(this.currentStrategySelection);
  }

  /**
   * Get current risk configuration
   */
  getCurrentRiskConfig(): AdaptiveRiskConfig | null {
    return this.currentRiskConfig;
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(): Array<{ timestamp: number; score: number }> {
    return [...this.performanceHistory];
  }

  /**
   * Shutdown enhanced AI integration
   */
  shutdown(): void {
    this.stop();
    this.realTimeOptimizer.shutdown();
    this.predictiveAnalytics.shutdown();
    this.removeAllListeners();
    this.telemetry.info('EnhancedAIIntegration', 'Enhanced AI integration shutdown');
  }
}