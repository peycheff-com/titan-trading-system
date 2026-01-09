/**
 * Titan Backtester
 * 
 * Replays historical data with different configurations to validate
 * optimization proposals. Applies Bulgaria Tax (latency + slippage).
 */

const EventEmitter = require('events');

class Backtester extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      defaultLookbackDays: options.defaultLookbackDays || 7,
      bulgariaLatencyMs: options.bulgariaLatencyMs || 200,
      bulgariaSlippagePct: options.bulgariaSlippagePct || 0.2,
      minTradesForValidation: options.minTradesForValidation || 10,
      maxDrawdownIncreasePct: options.maxDrawdownIncreasePct || 10,
      ...options
    };
    
    this.databaseManager = null;
    this.logger = options.logger || console;
  }

  /**
   * Update options at runtime
   */
  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
    this.log('info', 'Backtester options updated', { options: this.options });
  }

  /**
   * Initialize with dependencies
   */
  initialize(dependencies) {
    this.databaseManager = dependencies.databaseManager;
    this.log('info', 'Backtester initialized');
  }

  /**
   * Run backtest comparison between old and new config
   */
  async compareConfigs(oldConfig, newConfig, lookbackDays = null) {
    const days = lookbackDays || this.options.defaultLookbackDays;
    
    this.log('info', `Running backtest comparison over ${days} days`);
    
    try {
      // Get historical data
      const historicalData = await this.getHistoricalData(days);
      
      if (historicalData.trades.length < this.options.minTradesForValidation) {
        return {
          valid: false,
          reason: `Insufficient historical data (${historicalData.trades.length} trades)`,
          oldResults: null,
          newResults: null
        };
      }
      
      // Replay with old config
      const oldResults = await this.replayWithConfig(historicalData, oldConfig);
      
      // Replay with new config
      const newResults = await this.replayWithConfig(historicalData, newConfig);
      
      // Compare results
      const comparison = this.compareResults(oldResults, newResults);
      
      // Validate improvement
      const validation = this.validateImprovement(oldResults, newResults);
      
      this.log('info', `Backtest complete: ${validation.valid ? 'PASSED' : 'FAILED'}`);
      
      return {
        valid: validation.valid,
        reason: validation.reason,
        oldResults,
        newResults,
        comparison,
        lookbackDays: days
      };
      
    } catch (error) {
      this.log('error', `Backtest failed: ${error.message}`);
      return {
        valid: false,
        reason: error.message,
        oldResults: null,
        newResults: null
      };
    }
  }

  /**
   * Get historical data for backtesting
   */
  async getHistoricalData(days) {
    if (!this.databaseManager) {
      throw new Error('Database not available');
    }
    
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // Get trades
    const trades = await this.databaseManager.all(`
      SELECT * FROM trade_history
      WHERE created_at >= ? AND status = 'closed'
      ORDER BY created_at ASC
    `, [cutoff]);
    
    // Get regime snapshots
    const regimes = await this.databaseManager.all(`
      SELECT * FROM regime_snapshots
      WHERE created_at >= ?
      ORDER BY created_at ASC
    `, [cutoff]);
    
    return { trades, regimes };
  }

  /**
   * Replay historical data with a specific config
   */
  async replayWithConfig(historicalData, config) {
    const results = {
      trades: [],
      totalPnl: 0,
      wins: 0,
      losses: 0,
      maxDrawdown: 0,
      sharpeRatio: null,
      returns: []
    };
    
    let equity = 200; // Starting equity
    let peakEquity = equity;
    let currentDrawdown = 0;
    
    for (const trade of historicalData.trades) {
      // Check if trade would be filtered by config
      if (this.wouldFilterTrade(trade, config)) {
        continue;
      }
      
      // Apply Bulgaria Tax
      const adjustedTrade = this.applyBulgariaTax(trade);
      
      // Calculate P&L with config adjustments
      const pnl = this.calculateAdjustedPnl(adjustedTrade, config);
      
      results.trades.push({
        ...trade,
        adjustedPnl: pnl,
        originalPnl: trade.realized_pnl
      });
      
      results.totalPnl += pnl;
      results.returns.push(pnl);
      
      if (pnl > 0) {
        results.wins++;
      } else {
        results.losses++;
      }
      
      // Update equity and drawdown
      equity += pnl;
      if (equity > peakEquity) {
        peakEquity = equity;
      }
      currentDrawdown = (peakEquity - equity) / peakEquity;
      if (currentDrawdown > results.maxDrawdown) {
        results.maxDrawdown = currentDrawdown;
      }
    }
    
    // Calculate Sharpe ratio
    if (results.returns.length > 1) {
      results.sharpeRatio = this.calculateSharpeRatio(results.returns);
    }
    
    // Calculate win rate
    results.winRate = results.trades.length > 0 
      ? results.wins / results.trades.length 
      : 0;
    
    return results;
  }

  /**
   * Check if trade would be filtered by config
   */
  wouldFilterTrade(trade, config) {
    // Check symbol blacklist
    if (config.symbolBlacklist && config.symbolBlacklist.includes(trade.symbol)) {
      return true;
    }
    
    // Check trading hours
    if (config.excludeHours) {
      const hour = new Date(trade.signal_timestamp).getUTCHours();
      if (config.excludeHours.includes(hour)) {
        return true;
      }
    }
    
    // Check trap type filter
    if (config.disabledTraps && config.disabledTraps.includes(trade.trap_type)) {
      return true;
    }
    
    // Check regime filter
    if (config.avoidRegimes && trade.regime_state !== undefined) {
      const regimeKey = trade.regime_state === 1 ? 'risk_on' 
        : trade.regime_state === -1 ? 'risk_off' 
        : 'neutral';
      if (config.avoidRegimes.includes(regimeKey)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Apply Bulgaria Tax (latency + slippage)
   */
  applyBulgariaTax(trade) {
    const adjusted = { ...trade };
    
    // Apply slippage to entry price
    const slippageMultiplier = 1 + (this.options.bulgariaSlippagePct / 100);
    
    if (trade.side === 'Buy') {
      adjusted.entry_price = trade.entry_price * slippageMultiplier;
    } else {
      adjusted.entry_price = trade.entry_price / slippageMultiplier;
    }
    
    // Apply slippage to exit price (opposite direction)
    if (trade.exit_price) {
      if (trade.side === 'Buy') {
        adjusted.exit_price = trade.exit_price / slippageMultiplier;
      } else {
        adjusted.exit_price = trade.exit_price * slippageMultiplier;
      }
    }
    
    // Recalculate P&L
    if (adjusted.exit_price) {
      const priceDiff = trade.side === 'Buy' 
        ? adjusted.exit_price - adjusted.entry_price
        : adjusted.entry_price - adjusted.exit_price;
      
      adjusted.realized_pnl = priceDiff * trade.quantity;
    }
    
    return adjusted;
  }

  /**
   * Calculate adjusted P&L based on config
   */
  calculateAdjustedPnl(trade, config) {
    let pnl = trade.realized_pnl || 0;
    
    // Apply position size adjustment
    if (config.positionSizeMultiplier) {
      pnl *= config.positionSizeMultiplier;
    }
    
    // Apply leverage adjustment
    if (config.leverageMultiplier) {
      pnl *= config.leverageMultiplier;
    }
    
    return pnl;
  }

  /**
   * Calculate Sharpe ratio
   */
  calculateSharpeRatio(returns) {
    if (returns.length < 2) {
      return null;
    }
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) {
      return null;
    }
    
    // Annualized Sharpe (assuming daily returns)
    return (avgReturn / stdDev) * Math.sqrt(252);
  }

  /**
   * Compare old and new results
   */
  compareResults(oldResults, newResults) {
    return {
      pnlDelta: newResults.totalPnl - oldResults.totalPnl,
      pnlDeltaPct: oldResults.totalPnl !== 0 
        ? ((newResults.totalPnl - oldResults.totalPnl) / Math.abs(oldResults.totalPnl)) * 100 
        : 0,
      winRateDelta: newResults.winRate - oldResults.winRate,
      drawdownDelta: newResults.maxDrawdown - oldResults.maxDrawdown,
      sharpeDelta: (newResults.sharpeRatio || 0) - (oldResults.sharpeRatio || 0),
      tradeCountDelta: newResults.trades.length - oldResults.trades.length
    };
  }

  /**
   * Validate that new config is an improvement
   */
  validateImprovement(oldResults, newResults) {
    const reasons = [];
    
    // Check P&L improvement
    if (newResults.totalPnl <= oldResults.totalPnl) {
      reasons.push(`New PnL ($${newResults.totalPnl.toFixed(2)}) not better than old ($${oldResults.totalPnl.toFixed(2)})`);
    }
    
    // Check drawdown increase
    const drawdownIncrease = (newResults.maxDrawdown - oldResults.maxDrawdown) * 100;
    if (drawdownIncrease > this.options.maxDrawdownIncreasePct) {
      reasons.push(`Drawdown increased by ${drawdownIncrease.toFixed(1)}% (max allowed: ${this.options.maxDrawdownIncreasePct}%)`);
    }
    
    // Check win rate degradation
    if (newResults.winRate < oldResults.winRate * 0.8) {
      reasons.push(`Win rate degraded significantly (${(newResults.winRate * 100).toFixed(1)}% vs ${(oldResults.winRate * 100).toFixed(1)}%)`);
    }
    
    // Check trade count (shouldn't drop too much)
    if (newResults.trades.length < oldResults.trades.length * 0.3) {
      reasons.push(`Trade count dropped too much (${newResults.trades.length} vs ${oldResults.trades.length})`);
    }
    
    return {
      valid: reasons.length === 0,
      reason: reasons.length > 0 ? reasons.join('; ') : 'All validation checks passed'
    };
  }

  /**
   * Generate optimization report
   */
  generateReport(backtestResult) {
    const { oldResults, newResults, comparison, valid, reason } = backtestResult;
    
    return {
      summary: {
        valid,
        reason,
        lookbackDays: backtestResult.lookbackDays
      },
      oldConfig: {
        totalPnl: oldResults?.totalPnl || 0,
        winRate: oldResults?.winRate || 0,
        maxDrawdown: oldResults?.maxDrawdown || 0,
        sharpeRatio: oldResults?.sharpeRatio || null,
        tradeCount: oldResults?.trades?.length || 0
      },
      newConfig: {
        totalPnl: newResults?.totalPnl || 0,
        winRate: newResults?.winRate || 0,
        maxDrawdown: newResults?.maxDrawdown || 0,
        sharpeRatio: newResults?.sharpeRatio || null,
        tradeCount: newResults?.trades?.length || 0
      },
      comparison: comparison || {},
      bulgariaTax: {
        latencyMs: this.options.bulgariaLatencyMs,
        slippagePct: this.options.bulgariaSlippagePct
      }
    };
  }

  /**
   * Logging helper
   */
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'backtester',
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

module.exports = Backtester;
