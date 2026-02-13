/**
 * GlobalLiquidityAggregator - Main Integration Component
 *
 * Integrates multi-exchange WebSocket connections, CVD aggregation,
 * manipulation detection, and consensus validation into a unified
 * Global Liquidity analysis system.
 *
 * Requirements: 4.1-4.7, 6.1-6.7 (Global Liquidity Aggregation)
 */

import { EventEmitter } from 'events';
import { ExchangeStatusSummary, MultiExchangeManager } from './MultiExchangeManager';
import { ConnectionHealth, ExchangeId, ExchangeTrade } from './ExchangeWebSocketClient';
import { GlobalCVDAggregator } from './GlobalCVDAggregator';
import { ComprehensiveManipulationAnalysis, ManipulationDetector } from './ManipulationDetector';
import {
  ConsensusValidationResult,
  ConsensusValidator,
  SignalValidationResponse,
} from './ConsensusValidator';
import { ConnectionStatus, EnhancedErrorType, GlobalCVDData } from '../types';
import { Logger } from '../logging/Logger';
import { Logger as SharedLogger } from '@titan/shared';
const logger = SharedLogger.getInstance('hunter:GlobalLiquidityAggregator');

/**
 * Global Liquidity Aggregator configuration
 */
export interface GlobalLiquidityAggregatorConfig {
  enabled: boolean;
  symbols: string[];
  exchanges: ('binance' | 'coinbase' | 'kraken')[];
  exchangeWeights: {
    binance: number;
    coinbase: number;
    kraken: number;
  };
  weightingMethod: 'volume' | 'liquidity' | 'hybrid' | 'fixed';
  consensusThreshold: number;
  manipulationSensitivity: number;
  reconnectInterval: number;
  updateInterval: number;
  fallbackToSingleExchange: boolean;
}

/**
 * Global CVD update event
 */
export interface GlobalCVDUpdateEvent {
  symbol: string;
  globalCVD: GlobalCVDData;
  manipulation: ComprehensiveManipulationAnalysis;
  consensus: ConsensusValidationResult;
  timestamp: Date;
}

/**
 * Fallback state
 */
export interface FallbackState {
  active: boolean;
  reason: string;
  fallbackExchange: 'binance' | 'coinbase' | 'kraken' | null;
  activatedAt: Date | null;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: GlobalLiquidityAggregatorConfig = {
  enabled: true,
  symbols: ['BTCUSDT'],
  exchanges: ['binance', 'coinbase', 'kraken'],
  exchangeWeights: {
    binance: 40,
    coinbase: 35,
    kraken: 25,
  },
  weightingMethod: 'volume',
  consensusThreshold: 0.67,
  manipulationSensitivity: 70,
  reconnectInterval: 5000,
  updateInterval: 1000,
  fallbackToSingleExchange: true,
};

/**
 * GlobalLiquidityAggregator - Unified Global Liquidity Analysis System
 *
 * Requirements:
 * - 4.1: Establish WebSocket connections to Binance, Coinbase, and Kraken
 * - 4.2: Aggregate buy/sell volume with volume-weighted averaging
 * - 4.3: Flag FAKEOUT if one exchange sweeps but others hold steady
 * - 4.4: Require minimum 2 out of 3 exchanges showing same flow direction
 * - 4.5: Verify with other exchanges before confirming institutional flow
 * - 4.6: Continue with remaining exchanges on connection failure
 * - 4.7: Emit GLOBAL_FLOW_UPDATE with individual exchange CVD and aggregated score
 * - 6.1-6.7: Advanced CVD Validation with Multi-Exchange Confirmation
 *
 * Emits events:
 * - 'globalCVDUpdate': GlobalCVDUpdateEvent
 * - 'exchangeConnected': exchange
 * - 'exchangeDisconnected': exchange
 * - 'manipulationDetected': ComprehensiveManipulationAnalysis
 * - 'consensusReached': ConsensusValidationResult
 * - 'fallbackActivated': FallbackState
 * - 'fallbackDeactivated': void
 * - 'error': { type: EnhancedErrorType, message: string }
 */
export class GlobalLiquidityAggregator extends EventEmitter {
  private config: GlobalLiquidityAggregatorConfig;
  private exchangeManager: MultiExchangeManager;
  private cvdAggregator: GlobalCVDAggregator;
  private manipulationDetector: ManipulationDetector;
  private consensusValidator: ConsensusValidator;
  private logger: Logger;
  private isInitialized: boolean = false;
  private fallbackState: FallbackState = {
    active: false,
    reason: '',
    fallbackExchange: null,
    activatedAt: null,
  };
  private updateTimer: NodeJS.Timeout | null = null;
  private lastGlobalCVD: Map<string, GlobalCVDData> = new Map();

  constructor(config: Partial<GlobalLiquidityAggregatorConfig> = {}, logger?: Logger) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger || Logger.getInstance();

    // Initialize components
    this.exchangeManager = new MultiExchangeManager({
      symbols: this.config.symbols,
      exchanges: this.config.exchanges,
      reconnectInterval: this.config.reconnectInterval,
    });

    this.cvdAggregator = new GlobalCVDAggregator({
      exchangeWeights: this.config.exchangeWeights,
      weightingMethod: this.config.weightingMethod,
      updateInterval: this.config.updateInterval,
    });

    this.manipulationDetector = new ManipulationDetector({
      divergenceThreshold: this.config.manipulationSensitivity,
    });

    this.consensusValidator = new ConsensusValidator({
      consensusThreshold: this.config.consensusThreshold,
    });

    this.setupEventListeners();
  }

  /**
   * Initialize and start the Global Liquidity Aggregator
   * Requirement 4.1: Establish WebSocket connections to exchanges
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('⚠️ GlobalLiquidityAggregator already initialized');
      return;
    }

    if (!this.config.enabled) {
      logger.info('⚠️ GlobalLiquidityAggregator is disabled');
      return;
    }

    logger.info('🌐 Initializing Global Liquidity Aggregator...');
    this.logInfo('Initializing Global Liquidity Aggregator');

    try {
      // Initialize exchange connections
      await this.exchangeManager.initialize();

      // Start CVD aggregation
      this.cvdAggregator.start();

      // Start periodic updates
      this.startPeriodicUpdates();

      // eslint-disable-next-line functional/immutable-data
      this.isInitialized = true;
      logger.info('✅ Global Liquidity Aggregator initialized');
      this.logInfo('Global Liquidity Aggregator initialized successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to initialize Global Liquidity Aggregator:', errorMsg);
      this.logError('Failed to initialize Global Liquidity Aggregator', errorMsg);
      this.emit('error', {
        type: EnhancedErrorType.EXCHANGE_CONNECTION_LOST,
        message: errorMsg,
      });
      throw error;
    }
  }

  /**
   * Shutdown the Global Liquidity Aggregator
   */
  async shutdown(): Promise<void> {
    logger.info('🔌 Shutting down Global Liquidity Aggregator...');

    // Stop periodic updates
    this.stopPeriodicUpdates();

    // Stop CVD aggregation
    this.cvdAggregator.stop();

    // Disconnect from exchanges
    await this.exchangeManager.disconnect();

    // eslint-disable-next-line functional/immutable-data
    this.isInitialized = false;
    logger.info('✅ Global Liquidity Aggregator shutdown complete');
  }

  /**
   * Get current Global CVD for a symbol
   * Requirement 4.2: Aggregate buy/sell volume from all three exchanges
   */
  getGlobalCVD(symbol: string): GlobalCVDData | null {
    if (!this.isInitialized) return null;

    // Check for fallback mode
    if (this.fallbackState.active) {
      return this.getFallbackCVD(symbol);
    }

    return this.cvdAggregator.getCurrentGlobalCVD(symbol);
  }

  /**
   * Validate a trading signal with Global CVD
   * Requirement 6.1: Require Global CVD confirmation from minimum 2 out of 3 exchanges
   */
  validateSignal(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    technicalConfidence: number
  ): SignalValidationResponse | null {
    if (!this.isInitialized) return null;

    const globalCVD = this.getGlobalCVD(symbol);
    if (!globalCVD) {
      return {
        isValid: false,
        adjustedConfidence: technicalConfidence,
        consensusResult: {
          isValid: false,
          hasConsensus: false,
          consensusDirection: 'neutral',
          confidence: 0,
          votes: [],
          agreementRatio: 0,
          connectedExchanges: 0,
          reasoning: ['No Global CVD data available'],
          timestamp: new Date(),
        },
        recommendation: 'veto',
        reasoning: ['Global CVD data unavailable - cannot validate signal'],
      };
    }

    // Validate with consensus
    const response = this.consensusValidator.validateSignal({
      symbol,
      direction,
      globalCVD,
      technicalConfidence,
    });

    // Log validation result
    this.logValidation(symbol, direction, response);

    return response;
  }

  /**
   * Get manipulation analysis for a symbol
   * Requirement 4.3: Flag as FAKEOUT if one exchange sweeps but others hold steady
   */
  getManipulationAnalysis(symbol: string): ComprehensiveManipulationAnalysis | null {
    if (!this.isInitialized) return null;

    const globalCVD = this.getGlobalCVD(symbol);
    if (!globalCVD) return null;

    return this.manipulationDetector.analyzeManipulation(
      symbol,
      globalCVD.exchangeFlows,
      globalCVD.aggregatedCVD
    );
  }

  /**
   * Get consensus validation for current flows
   * Requirement 4.4: Require minimum 2 out of 3 exchanges showing same flow direction
   */
  getConsensusValidation(symbol: string): ConsensusValidationResult | null {
    if (!this.isInitialized) return null;

    const globalCVD = this.getGlobalCVD(symbol);
    if (!globalCVD) return null;

    return this.consensusValidator.validateConsensus(globalCVD.exchangeFlows);
  }

  /**
   * Get exchange status summary
   * Requirement 4.6: Continue with remaining exchanges on connection failure
   */
  getExchangeStatus(): ExchangeStatusSummary {
    return this.exchangeManager.getStatus();
  }

  /**
   * Get health metrics for all exchanges
   */
  getHealthMetrics(): Map<ExchangeId, ConnectionHealth> {
    return this.exchangeManager.getHealthMetrics();
  }

  /**
   * Check if Global CVD is available (enough exchanges connected)
   */
  isGlobalCVDAvailable(): boolean {
    const status = this.getExchangeStatus();
    return status.connectedCount >= 2;
  }

  /**
   * Get fallback state
   */
  getFallbackState(): FallbackState {
    return { ...this.fallbackState };
  }

  /**
   * Setup event listeners for components
   */
  private setupEventListeners(): void {
    // Exchange manager events
    this.exchangeManager.on('trade', (trade: ExchangeTrade) => {
      this.cvdAggregator.processTrade(trade);
    });

    this.exchangeManager.on('exchangeConnected', (exchange: string) => {
      this.cvdAggregator.updateExchangeStatus(
        exchange as 'binance' | 'coinbase' | 'kraken',
        ConnectionStatus.CONNECTED
      );
      this.emit('exchangeConnected', exchange);
      this.checkFallbackStatus();
    });

    this.exchangeManager.on('exchangeDisconnected', (exchange: string) => {
      this.cvdAggregator.updateExchangeStatus(
        exchange as 'binance' | 'coinbase' | 'kraken',
        ConnectionStatus.DISCONNECTED
      );
      this.emit('exchangeDisconnected', exchange);
      this.checkFallbackStatus();
      this.logWarning(`Exchange disconnected: ${exchange}`);
    });

    this.exchangeManager.on('statusChange', (status: ExchangeStatusSummary) => {
      this.handleStatusChange(status);
    });

    // CVD aggregator events
    this.cvdAggregator.on('cvdUpdate', (data: { symbol: string; data: GlobalCVDData }) => {
      this.handleCVDUpdate(data.symbol, data.data);
    });

    // Manipulation detector events
    this.manipulationDetector.on(
      'manipulationDetected',
      (analysis: ComprehensiveManipulationAnalysis) => {
        this.emit('manipulationDetected', analysis);
        this.logWarning(
          `Manipulation detected: ${analysis.pattern} on ${analysis.suspectExchange}`
        );
      }
    );

    // Consensus validator events
    this.consensusValidator.on('consensusReached', (result: ConsensusValidationResult) => {
      this.emit('consensusReached', result);
    });
  }

  /**
   * Handle CVD update and emit global event
   * Requirement 4.7: Emit GLOBAL_FLOW_UPDATE with individual exchange CVD and aggregated score
   */
  private handleCVDUpdate(symbol: string, globalCVD: GlobalCVDData): void {
    // Store last CVD
    // eslint-disable-next-line functional/immutable-data
    this.lastGlobalCVD.set(symbol, globalCVD);

    // Analyze for manipulation
    const manipulation = this.manipulationDetector.analyzeManipulation(
      symbol,
      globalCVD.exchangeFlows,
      globalCVD.aggregatedCVD
    );

    // Validate consensus
    const consensus = this.consensusValidator.validateConsensus(globalCVD.exchangeFlows);

    // Emit comprehensive update event
    const updateEvent: GlobalCVDUpdateEvent = {
      symbol,
      globalCVD,
      manipulation,
      consensus,
      timestamp: new Date(),
    };

    this.emit('globalCVDUpdate', updateEvent);
  }

  /**
   * Handle exchange status change
   */
  private handleStatusChange(status: ExchangeStatusSummary): void {
    // Log status change
    logger.info(`📊 Exchange status: ${status.connectedCount}/${status.totalExchanges} connected`);

    // Check if we need to activate fallback
    if (status.connectedCount < 2 && this.config.fallbackToSingleExchange) {
      this.activateFallback(status);
    } else if (status.connectedCount >= 2 && this.fallbackState.active) {
      this.deactivateFallback();
    }
  }

  /**
   * Activate fallback to single exchange
   * Requirement 4.6: Continue with remaining exchanges on connection failure
   */
  private activateFallback(status: ExchangeStatusSummary): void {
    if (this.fallbackState.active) return;

    // Find the connected exchange
    // eslint-disable-next-line functional/no-let
    let fallbackExchange: 'binance' | 'coinbase' | 'kraken' | null = null;

    if (status.binance === ConnectionStatus.CONNECTED) {
      fallbackExchange = 'binance';
    } else if (status.coinbase === ConnectionStatus.CONNECTED) {
      fallbackExchange = 'coinbase';
    } else if (status.kraken === ConnectionStatus.CONNECTED) {
      fallbackExchange = 'kraken';
    }

    // eslint-disable-next-line functional/immutable-data
    this.fallbackState = {
      active: true,
      reason: `Only ${status.connectedCount} exchange(s) connected`,
      fallbackExchange,
      activatedAt: new Date(),
    };

    this.emit('fallbackActivated', this.fallbackState);
    this.logWarning(`Fallback activated: using ${fallbackExchange || 'none'} only`);

    this.emit('error', {
      type: EnhancedErrorType.EXCHANGE_CONNECTION_LOST,
      message: `Multiple exchanges offline, falling back to ${fallbackExchange}`,
    });
  }

  /**
   * Deactivate fallback mode
   */
  private deactivateFallback(): void {
    if (!this.fallbackState.active) return;

    // eslint-disable-next-line functional/immutable-data
    this.fallbackState = {
      active: false,
      reason: '',
      fallbackExchange: null,
      activatedAt: null,
    };

    this.emit('fallbackDeactivated');
    this.logInfo('Fallback deactivated: multiple exchanges restored');
  }

  /**
   * Check and update fallback status
   */
  private checkFallbackStatus(): void {
    const status = this.getExchangeStatus();
    this.handleStatusChange(status);
  }

  /**
   * Get fallback CVD (single exchange)
   */
  private getFallbackCVD(symbol: string): GlobalCVDData | null {
    if (!this.fallbackState.fallbackExchange) return null;

    const globalCVD = this.cvdAggregator.getCurrentGlobalCVD(symbol);
    if (!globalCVD) return null;

    // Return with reduced confidence due to fallback
    return {
      ...globalCVD,
      confidence: Math.max(0, globalCVD.confidence - 30), // Reduce confidence in fallback mode
      consensus: 'neutral', // Cannot determine consensus with single exchange
    };
  }

  /**
   * Start periodic updates
   */
  private startPeriodicUpdates(): void {
    if (this.updateTimer) return;

    // eslint-disable-next-line functional/immutable-data
    this.updateTimer = setInterval(() => {
      // Emit updates for all tracked symbols
      for (const symbol of this.config.symbols) {
        const globalCVD = this.getGlobalCVD(symbol);
        if (globalCVD) {
          this.handleCVDUpdate(symbol, globalCVD);
        }
      }
    }, this.config.updateInterval);
  }

  /**
   * Stop periodic updates
   */
  private stopPeriodicUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      // eslint-disable-next-line functional/immutable-data
      this.updateTimer = null;
    }
  }

  /**
   * Log info message
   */
  private logInfo(message: string): void {
    this.logger.logError('WARNING', message, {
      component: 'GlobalLiquidityAggregator',
    });
  }

  /**
   * Log warning message
   */
  private logWarning(message: string): void {
    this.logger.logError('WARNING', message, {
      component: 'GlobalLiquidityAggregator',
    });
  }

  /**
   * Log error message
   */
  private logError(message: string, details: string): void {
    this.logger.logError('ERROR', `${message}: ${details}`, {
      component: 'GlobalLiquidityAggregator',
    });
  }

  /**
   * Log validation result
   * Requirement 6.7: Log validation result with individual exchange scores and final consensus
   */
  private logValidation(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    response: SignalValidationResponse
  ): void {
    const { consensusResult, recommendation, adjustedConfidence } = response;

    logger.info(`📊 Global CVD Validation: ${symbol} ${direction}`);
    logger.info(
      `   Consensus: ${consensusResult.consensusDirection} (${consensusResult.confidence.toFixed(
        0
      )}%)`
    );
    logger.info(`   Agreement: ${(consensusResult.agreementRatio * 100).toFixed(0)}%`);
    logger.info(`   Recommendation: ${recommendation}`);
    logger.info(`   Adjusted Confidence: ${adjustedConfidence.toFixed(0)}%`);

    // Log individual exchange votes
    for (const vote of consensusResult.votes) {
      logger.info(`   ${vote.exchange}: ${vote.direction} (CVD: ${vote.cvd.toFixed(0)})`);
    }
  }

  /**
   * Update symbols to track
   */
  updateSymbols(symbols: string[]): void {
    // eslint-disable-next-line functional/immutable-data
    this.config.symbols = symbols;
    this.exchangeManager.updateSymbols(symbols);
  }

  /**
   * Get configuration
   */
  getConfig(): GlobalLiquidityAggregatorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GlobalLiquidityAggregatorConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };

    // Update component configs
    if (config.exchangeWeights) {
      this.cvdAggregator.updateExchangeWeights(config.exchangeWeights);
    }
    if (config.consensusThreshold !== undefined) {
      this.consensusValidator.updateConfig({
        consensusThreshold: config.consensusThreshold,
      });
    }
    if (config.manipulationSensitivity !== undefined) {
      this.manipulationDetector.updateConfig({
        divergenceThreshold: config.manipulationSensitivity,
      });
    }
  }

  /**
   * Check if aggregator is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get last Global CVD for a symbol
   */
  getLastGlobalCVD(symbol: string): GlobalCVDData | null {
    return this.lastGlobalCVD.get(symbol) || null;
  }
}
