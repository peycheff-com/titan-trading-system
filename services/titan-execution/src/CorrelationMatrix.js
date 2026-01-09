/**
 * Titan Correlation Matrix & Portfolio Beta Calculator
 * 
 * Calculates rolling correlations between positions, portfolio beta vs BTC,
 * and enforces leverage limits based on equity tier.
 */

const EventEmitter = require('events');

class CorrelationMatrix extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      windowHours: options.windowHours || 24,
      updateIntervalMs: options.updateIntervalMs || 5 * 60 * 1000, // 5 minutes
      leverageLimits: options.leverageLimits || {
        200: 20,    // $200 equity: max 20x
        5000: 5,    // $5,000 equity: max 5x
        50000: 2    // $50,000 equity: max 2x
      },
      ...options
    };
    
    this.databaseManager = null;
    this.shadowState = null;
    this.logger = options.logger || console;
    
    // Price history for correlation calculation
    this.priceHistory = new Map(); // symbol -> [{timestamp, price}]
    this.correlationCache = new Map(); // "symbolA:symbolB" -> correlation
    
    // Portfolio metrics
    this.portfolioBeta = 0;
    this.combinedLeverage = 0;
    
    this.updateInterval = null;
  }

  /**
   * Initialize with dependencies
   */
  initialize(dependencies) {
    this.databaseManager = dependencies.databaseManager;
    this.shadowState = dependencies.shadowState;
    this.log('info', 'Correlation Matrix initialized');
  }

  /**
   * Start periodic updates
   */
  startUpdates() {
    this.updateInterval = setInterval(
      () => this.updateCorrelations(),
      this.options.updateIntervalMs
    );
    this.log('info', 'Correlation updates started');
  }

  /**
   * Stop periodic updates
   */
  stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Record price tick for correlation calculation
   */
  recordPrice(symbol, price, timestamp = Date.now()) {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    
    const history = this.priceHistory.get(symbol);
    history.push({ timestamp, price });
    
    // Trim old data (keep only windowHours)
    const cutoff = timestamp - (this.options.windowHours * 60 * 60 * 1000);
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }
  }

  /**
   * Calculate correlation between two symbols
   */
  calculateCorrelation(symbolA, symbolB) {
    const historyA = this.priceHistory.get(symbolA);
    const historyB = this.priceHistory.get(symbolB);
    
    if (!historyA || !historyB || historyA.length < 10 || historyB.length < 10) {
      return null;
    }
    
    // Align timestamps and calculate returns
    const returnsA = this.calculateReturns(historyA);
    const returnsB = this.calculateReturns(historyB);
    
    // Need at least 10 data points
    const minLength = Math.min(returnsA.length, returnsB.length);
    if (minLength < 10) {
      return null;
    }
    
    // Use last minLength returns
    const rA = returnsA.slice(-minLength);
    const rB = returnsB.slice(-minLength);
    
    // Calculate Pearson correlation
    const meanA = rA.reduce((a, b) => a + b, 0) / rA.length;
    const meanB = rB.reduce((a, b) => a + b, 0) / rB.length;
    
    let numerator = 0;
    let denomA = 0;
    let denomB = 0;
    
    for (let i = 0; i < rA.length; i++) {
      const diffA = rA[i] - meanA;
      const diffB = rB[i] - meanB;
      numerator += diffA * diffB;
      denomA += diffA * diffA;
      denomB += diffB * diffB;
    }
    
    const denominator = Math.sqrt(denomA * denomB);
    
    if (denominator === 0) {
      return 0;
    }
    
    return numerator / denominator;
  }

  /**
   * Calculate returns from price history
   */
  calculateReturns(history) {
    const returns = [];
    for (let i = 1; i < history.length; i++) {
      const ret = (history[i].price - history[i - 1].price) / history[i - 1].price;
      returns.push(ret);
    }
    return returns;
  }

  /**
   * Update all correlations
   */
  async updateCorrelations() {
    try {
      const positions = this.shadowState ? this.shadowState.getAllPositions() : [];
      const symbols = [...new Set(positions.map(p => p.symbol))];
      
      // Always include BTC for beta calculation
      if (!symbols.includes('BTCUSDT')) {
        symbols.push('BTCUSDT');
      }
      
      // Calculate pairwise correlations
      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          const correlation = this.calculateCorrelation(symbols[i], symbols[j]);
          
          if (correlation !== null) {
            const key = `${symbols[i]}:${symbols[j]}`;
            this.correlationCache.set(key, correlation);
            
            // Store in database
            if (this.databaseManager) {
              await this.storeCorrelation(symbols[i], symbols[j], correlation);
            }
          }
        }
      }
      
      // Calculate portfolio beta
      this.portfolioBeta = this.calculatePortfolioBeta(positions);
      
      this.log('info', `Correlations updated: ${this.correlationCache.size} pairs, Beta: ${this.portfolioBeta.toFixed(3)}`);
      
      this.emit('correlationsUpdated', {
        correlations: Object.fromEntries(this.correlationCache),
        portfolioBeta: this.portfolioBeta
      });
      
    } catch (error) {
      this.log('error', `Failed to update correlations: ${error.message}`);
    }
  }

  /**
   * Calculate portfolio beta (correlation to BTC weighted by position size)
   */
  calculatePortfolioBeta(positions) {
    if (positions.length === 0) {
      return 0;
    }
    
    let totalNotional = 0;
    let weightedBeta = 0;
    
    for (const position of positions) {
      const notional = position.size * position.entry_price;
      totalNotional += notional;
      
      // Get correlation to BTC
      const correlation = this.getCorrelation(position.symbol, 'BTCUSDT');
      
      if (correlation !== null) {
        weightedBeta += correlation * notional;
      }
    }
    
    if (totalNotional === 0) {
      return 0;
    }
    
    return weightedBeta / totalNotional;
  }

  /**
   * Get correlation between two symbols
   */
  getCorrelation(symbolA, symbolB) {
    if (symbolA === symbolB) {
      return 1;
    }
    
    const key1 = `${symbolA}:${symbolB}`;
    const key2 = `${symbolB}:${symbolA}`;
    
    return this.correlationCache.get(key1) || this.correlationCache.get(key2) || null;
  }

  /**
   * Store correlation in database
   */
  async storeCorrelation(symbolA, symbolB, correlation) {
    if (!this.databaseManager) {
      return;
    }
    
    const sampleCount = Math.min(
      this.priceHistory.get(symbolA)?.length || 0,
      this.priceHistory.get(symbolB)?.length || 0
    );
    
    await this.databaseManager.run(`
      INSERT OR REPLACE INTO correlation_matrix (symbol_a, symbol_b, correlation, window_hours, sample_count, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [symbolA, symbolB, correlation, this.options.windowHours, sampleCount]);
  }

  /**
   * Calculate combined leverage
   */
  calculateCombinedLeverage(equity) {
    const positions = this.shadowState ? this.shadowState.getAllPositions() : [];
    
    let totalNotional = 0;
    for (const position of positions) {
      totalNotional += Math.abs(position.size * position.entry_price);
    }
    
    this.combinedLeverage = equity > 0 ? totalNotional / equity : 0;
    return this.combinedLeverage;
  }

  /**
   * Get max leverage for equity tier
   */
  getMaxLeverage(equity) {
    const tiers = Object.keys(this.options.leverageLimits)
      .map(Number)
      .sort((a, b) => b - a);
    
    for (const tier of tiers) {
      if (equity >= tier) {
        return this.options.leverageLimits[tier];
      }
    }
    
    // Default to highest leverage for smallest accounts
    return this.options.leverageLimits[tiers[tiers.length - 1]] || 20;
  }

  /**
   * Check if signal should be vetoed due to leverage limits
   */
  checkLeverageVeto(signal, equity) {
    const maxLeverage = this.getMaxLeverage(equity);
    const currentLeverage = this.calculateCombinedLeverage(equity);
    
    // Calculate new leverage if signal is executed
    const signalNotional = signal.qty * signal.entry_price;
    const newLeverage = (currentLeverage * equity + signalNotional) / equity;
    
    if (newLeverage > maxLeverage) {
      this.log('warn', `Leverage veto: ${newLeverage.toFixed(2)}x > ${maxLeverage}x limit`);
      
      return {
        vetoed: true,
        reason: 'LEVERAGE_LIMIT_EXCEEDED',
        currentLeverage,
        newLeverage,
        maxLeverage,
        equityTier: equity
      };
    }
    
    return { vetoed: false };
  }

  /**
   * Check if Phase 3 hedge should be auto-approved
   */
  checkHedgeException(signal, positions) {
    if (signal.source !== 'sentinel') {
      return false;
    }
    
    // Calculate current global delta
    let globalDelta = 0;
    for (const position of positions) {
      const delta = position.side === 'Buy' ? position.size : -position.size;
      globalDelta += delta * position.entry_price;
    }
    
    // Calculate delta after signal
    const signalDelta = signal.side === 'Buy' ? signal.qty : -signal.qty;
    const newGlobalDelta = globalDelta + (signalDelta * signal.entry_price);
    
    // Auto-approve if signal reduces global delta
    if (Math.abs(newGlobalDelta) < Math.abs(globalDelta)) {
      this.log('info', `Phase 3 hedge approved: reduces delta from ${globalDelta.toFixed(2)} to ${newGlobalDelta.toFixed(2)}`);
      return true;
    }
    
    return false;
  }

  /**
   * Get correlation matrix summary
   */
  getMatrixSummary() {
    const correlations = Object.fromEntries(this.correlationCache);
    const values = Array.from(this.correlationCache.values());
    
    return {
      pairCount: this.correlationCache.size,
      avgCorrelation: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      maxCorrelation: values.length > 0 ? Math.max(...values) : 0,
      minCorrelation: values.length > 0 ? Math.min(...values) : 0,
      portfolioBeta: this.portfolioBeta,
      combinedLeverage: this.combinedLeverage,
      correlations
    };
  }

  /**
   * Logging helper
   */
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'correlation-matrix',
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

module.exports = CorrelationMatrix;
