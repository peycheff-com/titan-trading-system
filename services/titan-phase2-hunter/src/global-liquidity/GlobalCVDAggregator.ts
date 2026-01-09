/**
 * GlobalCVDAggregator - Volume-Weighted CVD Aggregation Engine
 * 
 * Aggregates Cumulative Volume Delta from multiple exchanges using
 * volume-weighted averaging for accurate global flow analysis.
 * 
 * Requirements: 4.2 (Global CVD Calculation)
 */

import { EventEmitter } from 'events';
import { ExchangeTrade } from './ExchangeWebSocketClient';
import { 
  ConnectionStatus, 
  ExchangeFlow, 
  GlobalCVDData,
  ManipulationAnalysis 
} from '../types';

/**
 * CVD calculation window configuration
 */
export interface CVDWindowConfig {
  shortWindow: number;  // 1 minute
  mediumWindow: number; // 5 minutes
  longWindow: number;   // 15 minutes
}

/**
 * Exchange weight configuration
 */
export interface ExchangeWeightConfig {
  binance: number;
  coinbase: number;
  kraken: number;
}

/**
 * Global CVD aggregator configuration
 */
export interface GlobalCVDAggregatorConfig {
  exchangeWeights: ExchangeWeightConfig;
  weightingMethod: 'volume' | 'liquidity' | 'hybrid' | 'fixed';
  updateInterval: number; // milliseconds
  tradeHistoryWindow: number; // milliseconds
  cvdWindows: CVDWindowConfig;
}

/**
 * Trade history entry with CVD contribution
 */
interface TradeHistoryEntry {
  exchange: 'binance' | 'coinbase' | 'kraken';
  symbol: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
  cvdContribution: number; // positive for buy, negative for sell
}

/**
 * Exchange CVD state
 */
interface ExchangeCVDState {
  exchange: 'binance' | 'coinbase' | 'kraken';
  cvd: number;
  volume: number;
  trades: number;
  lastUpdate: number;
  status: ConnectionStatus;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: GlobalCVDAggregatorConfig = {
  exchangeWeights: {
    binance: 40,
    coinbase: 35,
    kraken: 25
  },
  weightingMethod: 'volume',
  updateInterval: 1000, // 1 second
  tradeHistoryWindow: 15 * 60 * 1000, // 15 minutes
  cvdWindows: {
    shortWindow: 60 * 1000,      // 1 minute
    mediumWindow: 5 * 60 * 1000, // 5 minutes
    longWindow: 15 * 60 * 1000   // 15 minutes
  }
};

/**
 * GlobalCVDAggregator - Aggregates CVD from multiple exchanges
 * 
 * Requirement 4.2: Aggregate buy/sell volume from all three exchanges
 * with volume-weighted averaging
 * 
 * Emits events:
 * - 'cvdUpdate': GlobalCVDData - CVD data updated
 * - 'exchangeUpdate': ExchangeFlow - Single exchange CVD updated
 */
export class GlobalCVDAggregator extends EventEmitter {
  private config: GlobalCVDAggregatorConfig;
  private tradeHistory: Map<string, TradeHistoryEntry[]> = new Map();
  private exchangeStates: Map<'binance' | 'coinbase' | 'kraken', ExchangeCVDState> = new Map();
  private dynamicWeights: ExchangeWeightConfig;
  private updateTimer: NodeJS.Timeout | null = null;
  private lastGlobalCVD: GlobalCVDData | null = null;

  constructor(config: Partial<GlobalCVDAggregatorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dynamicWeights = { ...this.config.exchangeWeights };
    this.initializeExchangeStates();
  }

  /**
   * Initialize exchange states
   */
  private initializeExchangeStates(): void {
    const exchanges: ('binance' | 'coinbase' | 'kraken')[] = ['binance', 'coinbase', 'kraken'];
    
    for (const exchange of exchanges) {
      this.exchangeStates.set(exchange, {
        exchange,
        cvd: 0,
        volume: 0,
        trades: 0,
        lastUpdate: 0,
        status: ConnectionStatus.DISCONNECTED
      });
    }
  }

  /**
   * Start the aggregation engine
   */
  start(): void {
    if (this.updateTimer) return;

    this.updateTimer = setInterval(() => {
      this.calculateAndEmitGlobalCVD();
    }, this.config.updateInterval);

    console.log('📊 Global CVD Aggregator started');
  }

  /**
   * Stop the aggregation engine
   */
  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    console.log('📊 Global CVD Aggregator stopped');
  }

  /**
   * Process incoming trade from an exchange
   * Requirement 4.2: Aggregate buy/sell volume from all three exchanges
   */
  processTrade(trade: ExchangeTrade): void {
    const symbol = trade.symbol;
    
    // Calculate CVD contribution (positive for buy, negative for sell)
    const cvdContribution = trade.side === 'buy' 
      ? trade.quantity * trade.price 
      : -trade.quantity * trade.price;

    // Create history entry
    const entry: TradeHistoryEntry = {
      exchange: trade.exchange,
      symbol,
      price: trade.price,
      quantity: trade.quantity,
      side: trade.side,
      timestamp: trade.timestamp,
      cvdContribution
    };

    // Add to trade history
    if (!this.tradeHistory.has(symbol)) {
      this.tradeHistory.set(symbol, []);
    }
    this.tradeHistory.get(symbol)!.push(entry);

    // Update exchange state
    const state = this.exchangeStates.get(trade.exchange);
    if (state) {
      state.cvd += cvdContribution;
      state.volume += trade.quantity * trade.price;
      state.trades++;
      state.lastUpdate = Date.now();
      state.status = ConnectionStatus.CONNECTED;
    }

    // Cleanup old trades
    this.cleanupOldTrades(symbol);
  }

  /**
   * Update exchange connection status
   */
  updateExchangeStatus(exchange: 'binance' | 'coinbase' | 'kraken', status: ConnectionStatus): void {
    const state = this.exchangeStates.get(exchange);
    if (state) {
      state.status = status;
    }

    // Recalculate weights if using dynamic weighting
    if (this.config.weightingMethod !== 'fixed') {
      this.recalculateDynamicWeights();
    }
  }

  /**
   * Calculate Global CVD with volume-weighted averaging
   * Requirement 4.2: Volume-weighted CVD calculation across exchanges
   */
  calculateGlobalCVD(symbol: string, windowMs: number = this.config.cvdWindows.mediumWindow): GlobalCVDData {
    const now = Date.now();
    const cutoff = now - windowMs;
    const trades = this.tradeHistory.get(symbol) || [];
    const recentTrades = trades.filter(t => t.timestamp > cutoff);

    // Calculate per-exchange CVD and volume
    const exchangeFlows: ExchangeFlow[] = [];
    const exchangeCVDs: Map<'binance' | 'coinbase' | 'kraken', { cvd: number; volume: number; trades: number }> = new Map();

    // Initialize
    for (const exchange of ['binance', 'coinbase', 'kraken'] as const) {
      exchangeCVDs.set(exchange, { cvd: 0, volume: 0, trades: 0 });
    }

    // Aggregate trades by exchange
    for (const trade of recentTrades) {
      const data = exchangeCVDs.get(trade.exchange)!;
      data.cvd += trade.cvdContribution;
      data.volume += Math.abs(trade.cvdContribution);
      data.trades++;
    }

    // Calculate total volume for weighting
    let totalVolume = 0;
    for (const data of exchangeCVDs.values()) {
      totalVolume += data.volume;
    }

    // Build exchange flows and calculate weighted CVD
    let weightedCVD = 0;
    let totalWeight = 0;

    for (const [exchange, data] of exchangeCVDs) {
      const state = this.exchangeStates.get(exchange)!;
      
      // Calculate weight based on method
      let weight: number;
      if (this.config.weightingMethod === 'volume' && totalVolume > 0) {
        weight = data.volume / totalVolume;
      } else if (this.config.weightingMethod === 'fixed') {
        weight = this.config.exchangeWeights[exchange] / 100;
      } else {
        weight = this.dynamicWeights[exchange] / 100;
      }

      // Only include connected exchanges in weighted calculation
      if (state.status === ConnectionStatus.CONNECTED && data.trades > 0) {
        weightedCVD += data.cvd * weight;
        totalWeight += weight;
      }

      exchangeFlows.push({
        exchange,
        cvd: data.cvd,
        volume: data.volume,
        trades: data.trades,
        weight,
        timestamp: new Date(state.lastUpdate),
        status: state.status
      });
    }

    // Normalize weighted CVD
    const aggregatedCVD = totalWeight > 0 ? weightedCVD / totalWeight : 0;

    // Determine consensus
    const consensus = this.determineConsensus(exchangeFlows);

    // Calculate confidence based on exchange agreement and volume
    const confidence = this.calculateConfidence(exchangeFlows, totalVolume);

    // Detect manipulation
    const manipulation = this.detectManipulation(exchangeFlows);

    const globalCVD: GlobalCVDData = {
      aggregatedCVD,
      exchangeFlows,
      consensus,
      confidence,
      manipulation,
      timestamp: new Date()
    };

    this.lastGlobalCVD = globalCVD;
    return globalCVD;
  }

  /**
   * Get current Global CVD for a symbol
   */
  getCurrentGlobalCVD(symbol: string): GlobalCVDData {
    return this.calculateGlobalCVD(symbol);
  }

  /**
   * Get Global CVD for different time windows
   */
  getGlobalCVDMultiWindow(symbol: string): {
    short: GlobalCVDData;
    medium: GlobalCVDData;
    long: GlobalCVDData;
  } {
    return {
      short: this.calculateGlobalCVD(symbol, this.config.cvdWindows.shortWindow),
      medium: this.calculateGlobalCVD(symbol, this.config.cvdWindows.mediumWindow),
      long: this.calculateGlobalCVD(symbol, this.config.cvdWindows.longWindow)
    };
  }

  /**
   * Get exchange flow for a specific exchange
   */
  getExchangeFlow(exchange: 'binance' | 'coinbase' | 'kraken', symbol: string): ExchangeFlow | null {
    const globalCVD = this.calculateGlobalCVD(symbol);
    return globalCVD.exchangeFlows.find(f => f.exchange === exchange) || null;
  }

  /**
   * Determine consensus direction from exchange flows
   */
  private determineConsensus(flows: ExchangeFlow[]): 'bullish' | 'bearish' | 'neutral' | 'conflicted' {
    const connectedFlows = flows.filter(f => f.status === ConnectionStatus.CONNECTED && f.trades > 0);
    
    if (connectedFlows.length === 0) {
      return 'neutral';
    }

    let bullishCount = 0;
    let bearishCount = 0;

    for (const flow of connectedFlows) {
      if (flow.cvd > 0) bullishCount++;
      else if (flow.cvd < 0) bearishCount++;
    }

    // Check for consensus (2 out of 3 or all agree)
    if (bullishCount >= 2) return 'bullish';
    if (bearishCount >= 2) return 'bearish';
    if (bullishCount === 1 && bearishCount === 1) return 'conflicted';
    
    return 'neutral';
  }

  /**
   * Calculate confidence score based on exchange agreement and volume
   */
  private calculateConfidence(flows: ExchangeFlow[], totalVolume: number): number {
    const connectedFlows = flows.filter(f => f.status === ConnectionStatus.CONNECTED && f.trades > 0);
    
    if (connectedFlows.length === 0) return 0;

    // Factor 1: Exchange agreement (0-50 points)
    const directions = connectedFlows.map(f => Math.sign(f.cvd));
    const agreementCount = directions.filter(d => d === directions[0]).length;
    const agreementScore = (agreementCount / connectedFlows.length) * 50;

    // Factor 2: Volume significance (0-30 points)
    const volumeScore = Math.min(30, (totalVolume / 1000000) * 30); // Scale to $1M

    // Factor 3: Exchange coverage (0-20 points)
    const coverageScore = (connectedFlows.length / 3) * 20;

    return Math.min(100, agreementScore + volumeScore + coverageScore);
  }

  /**
   * Detect potential manipulation patterns
   */
  private detectManipulation(flows: ExchangeFlow[]): ManipulationAnalysis {
    const connectedFlows = flows.filter(f => f.status === ConnectionStatus.CONNECTED && f.trades > 0);
    
    if (connectedFlows.length < 2) {
      return {
        detected: false,
        suspectExchange: null,
        divergenceScore: 0,
        pattern: 'none'
      };
    }

    // Calculate average CVD
    const avgCVD = connectedFlows.reduce((sum, f) => sum + f.cvd, 0) / connectedFlows.length;
    
    // Find outliers (CVD significantly different from average)
    let maxDivergence = 0;
    let suspectExchange: string | null = null;

    for (const flow of connectedFlows) {
      const divergence = Math.abs(flow.cvd - avgCVD);
      const normalizedDivergence = avgCVD !== 0 ? divergence / Math.abs(avgCVD) : 0;
      
      if (normalizedDivergence > maxDivergence) {
        maxDivergence = normalizedDivergence;
        suspectExchange = flow.exchange;
      }
    }

    // Detect manipulation if one exchange diverges significantly (>50% from average)
    const divergenceScore = Math.min(100, maxDivergence * 100);
    const detected = divergenceScore > 50;

    return {
      detected,
      suspectExchange: detected ? suspectExchange : null,
      divergenceScore,
      pattern: detected ? 'single_exchange_outlier' : 'none'
    };
  }

  /**
   * Recalculate dynamic weights based on volume and connectivity
   */
  private recalculateDynamicWeights(): void {
    let totalVolume = 0;
    const volumes: Map<'binance' | 'coinbase' | 'kraken', number> = new Map();

    for (const [exchange, state] of this.exchangeStates) {
      if (state.status === ConnectionStatus.CONNECTED) {
        volumes.set(exchange, state.volume);
        totalVolume += state.volume;
      } else {
        volumes.set(exchange, 0);
      }
    }

    // Calculate new weights
    if (totalVolume > 0) {
      for (const [exchange, volume] of volumes) {
        this.dynamicWeights[exchange] = (volume / totalVolume) * 100;
      }
    } else {
      // Fall back to configured weights
      this.dynamicWeights = { ...this.config.exchangeWeights };
    }
  }

  /**
   * Cleanup old trades from history
   */
  private cleanupOldTrades(symbol: string): void {
    const trades = this.tradeHistory.get(symbol);
    if (!trades) return;

    const cutoff = Date.now() - this.config.tradeHistoryWindow;
    const filtered = trades.filter(t => t.timestamp > cutoff);
    this.tradeHistory.set(symbol, filtered);
  }

  /**
   * Calculate and emit Global CVD update
   */
  private calculateAndEmitGlobalCVD(): void {
    // Calculate for all tracked symbols
    for (const symbol of this.tradeHistory.keys()) {
      const globalCVD = this.calculateGlobalCVD(symbol);
      this.emit('cvdUpdate', { symbol, data: globalCVD });
    }
  }

  /**
   * Get current exchange weights
   */
  getExchangeWeights(): ExchangeWeightConfig {
    return this.config.weightingMethod === 'fixed' 
      ? { ...this.config.exchangeWeights }
      : { ...this.dynamicWeights };
  }

  /**
   * Update exchange weights configuration
   */
  updateExchangeWeights(weights: Partial<ExchangeWeightConfig>): void {
    this.config.exchangeWeights = { ...this.config.exchangeWeights, ...weights };
    
    // Validate weights sum to 100
    const total = Object.values(this.config.exchangeWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 0.1) {
      console.warn(`⚠️ Exchange weights sum to ${total}%, should be 100%`);
    }
  }

  /**
   * Get last calculated Global CVD
   */
  getLastGlobalCVD(): GlobalCVDData | null {
    return this.lastGlobalCVD;
  }

  /**
   * Get trade history statistics
   */
  getTradeHistoryStats(): { symbols: number; totalTrades: number; memoryEstimate: string } {
    let totalTrades = 0;
    for (const trades of this.tradeHistory.values()) {
      totalTrades += trades.length;
    }

    return {
      symbols: this.tradeHistory.size,
      totalTrades,
      memoryEstimate: `${(totalTrades * 100 / 1024).toFixed(1)} KB`
    };
  }

  /**
   * Clear all trade history
   */
  clearHistory(): void {
    this.tradeHistory.clear();
    this.initializeExchangeStates();
  }

  /**
   * Get configuration
   */
  getConfig(): GlobalCVDAggregatorConfig {
    return { ...this.config };
  }
}
