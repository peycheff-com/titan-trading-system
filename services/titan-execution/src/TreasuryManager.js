/**
 * Titan Treasury Manager
 * 
 * Multi-wallet management with automatic profit sweeps:
 * - Tracks Futures Wallet and Spot Wallet separately
 * - Calculates total NAV (Futures + Spot + Unrealized PnL)
 * - Sweeps excess profits to Spot Wallet for safety
 * - Maintains reserve limit in Futures Wallet
 */

const EventEmitter = require('events');

class TreasuryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      reserveLimit: options.reserveLimit || 200, // Never sweep below $200
      sweepThreshold: options.sweepThreshold || 1.2, // Sweep when > 120% of target
      targetAllocation: options.targetAllocation || 0.8, // 80% in Futures
      maxRetries: options.maxRetries || 3,
      retryDelayMs: options.retryDelayMs || 5000,
      ...options
    };
    
    this.brokerGateway = null;
    this.databaseManager = null;
    this.logger = options.logger || console;
    
    // Wallet state
    this.wallets = {
      futures: 0,
      spot: 0,
      unrealizedPnl: 0
    };
    
    // Sweep state
    this.lastSweepAt = null;
    this.sweepInProgress = false;
  }

  /**
   * Initialize with dependencies
   */
  initialize(dependencies) {
    this.brokerGateway = dependencies.brokerGateway;
    this.databaseManager = dependencies.databaseManager;
    this.log('info', 'Treasury Manager initialized');
  }

  /**
   * Update wallet balances from exchange
   */
  async updateBalances() {
    try {
      if (!this.brokerGateway) {
        this.log('warn', 'BrokerGateway not available');
        return null;
      }
      
      // Get balances from exchange
      const balances = await this.brokerGateway.getWalletBalances();
      
      this.wallets.futures = balances.futures || 0;
      this.wallets.spot = balances.spot || 0;
      this.wallets.unrealizedPnl = balances.unrealizedPnl || 0;
      
      // Update database
      if (this.databaseManager) {
        await this.databaseManager.run(`
          UPDATE system_state SET
            futures_wallet = ?,
            spot_wallet = ?,
            unrealized_pnl = ?,
            nav = ?
          WHERE id = 1
        `, [
          this.wallets.futures,
          this.wallets.spot,
          this.wallets.unrealizedPnl,
          this.getTotalNAV()
        ]);
      }
      
      this.log('info', `Balances updated: Futures=$${this.wallets.futures.toFixed(2)}, Spot=$${this.wallets.spot.toFixed(2)}, Unrealized=$${this.wallets.unrealizedPnl.toFixed(2)}`);
      
      this.emit('balancesUpdated', this.wallets);
      
      return this.wallets;
      
    } catch (error) {
      this.log('error', `Failed to update balances: ${error.message}`);
      return null;
    }
  }

  /**
   * Get total NAV (Net Asset Value)
   */
  getTotalNAV() {
    return this.wallets.futures + this.wallets.spot + this.wallets.unrealizedPnl;
  }

  /**
   * Check if sweep is needed
   */
  shouldSweep() {
    const targetFutures = this.getTotalNAV() * this.options.targetAllocation;
    const threshold = targetFutures * this.options.sweepThreshold;
    
    // Sweep if Futures Wallet exceeds threshold
    return this.wallets.futures > threshold;
  }

  /**
   * Calculate sweep amount
   */
  calculateSweepAmount() {
    const totalNAV = this.getTotalNAV();
    const targetFutures = totalNAV * this.options.targetAllocation;
    const excessAmount = this.wallets.futures - targetFutures;
    
    // Ensure we don't sweep below reserve limit
    const maxSweep = this.wallets.futures - this.options.reserveLimit;
    
    if (maxSweep <= 0) {
      return 0;
    }
    
    return Math.min(excessAmount, maxSweep);
  }

  /**
   * Execute profit sweep
   */
  async executeSweep(reason = 'scheduled') {
    if (this.sweepInProgress) {
      this.log('warn', 'Sweep already in progress');
      return { success: false, error: 'Sweep in progress' };
    }
    
    this.sweepInProgress = true;
    
    try {
      // Update balances first
      await this.updateBalances();
      
      // Check if sweep is needed
      if (!this.shouldSweep()) {
        this.log('info', 'No sweep needed');
        return { success: true, swept: false, reason: 'Below threshold' };
      }
      
      const sweepAmount = this.calculateSweepAmount();
      
      if (sweepAmount <= 0) {
        this.log('info', 'Sweep amount is zero or negative');
        return { success: true, swept: false, reason: 'Amount too small' };
      }
      
      this.log('info', `Initiating sweep of $${sweepAmount.toFixed(2)} (${reason})`);
      
      // Execute transfer with retry logic
      const result = await this.executeTransferWithRetry(sweepAmount);
      
      if (result.success) {
        this.lastSweepAt = new Date();
        
        // Update balances after sweep
        await this.updateBalances();
        
        // Log event
        await this.logSystemEvent('PROFIT_SWEEP', 'info', {
          message: `Swept $${sweepAmount.toFixed(2)} from Futures to Spot`,
          amount: sweepAmount,
          reason,
          newFuturesBalance: this.wallets.futures,
          newSpotBalance: this.wallets.spot
        });
        
        // Update database
        if (this.databaseManager) {
          await this.databaseManager.run(
            'UPDATE system_state SET last_sweep_at = datetime("now") WHERE id = 1'
          );
        }
        
        this.emit('sweepCompleted', {
          amount: sweepAmount,
          reason,
          wallets: this.wallets
        });
        
        return {
          success: true,
          swept: true,
          amount: sweepAmount,
          newBalances: this.wallets
        };
        
      } else {
        // Log failure
        await this.logSystemEvent('SWEEP_FAILED', 'error', {
          message: `Sweep failed: ${result.error}`,
          amount: sweepAmount,
          reason,
          error: result.error
        });
        
        this.emit('sweepFailed', {
          amount: sweepAmount,
          reason,
          error: result.error
        });
        
        return {
          success: false,
          error: result.error
        };
      }
      
    } catch (error) {
      this.log('error', `Sweep failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
      
    } finally {
      this.sweepInProgress = false;
    }
  }

  /**
   * Execute transfer with retry logic
   */
  async executeTransferWithRetry(amount) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        this.log('info', `Transfer attempt ${attempt}/${this.options.maxRetries}`);
        
        // Execute internal transfer via Bybit API
        const result = await this.brokerGateway.internalTransfer({
          coin: 'USDT',
          amount: amount.toString(),
          fromAccountType: 'CONTRACT', // Futures
          toAccountType: 'SPOT'
        });
        
        if (result.success) {
          this.log('info', `Transfer successful: $${amount.toFixed(2)}`);
          return { success: true };
        }
        
        lastError = result.error || 'Unknown error';
        
      } catch (error) {
        lastError = error.message;
        this.log('warn', `Transfer attempt ${attempt} failed: ${lastError}`);
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < this.options.maxRetries) {
        const delay = this.options.retryDelayMs * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }
    
    return { success: false, error: lastError };
  }

  /**
   * Check if sweep should trigger after trade
   */
  async checkPostTradeSwee(tradePnl, preTradeEquity) {
    // Sweep if trade increased equity by > 10%
    const pnlPercent = (tradePnl / preTradeEquity) * 100;
    
    if (pnlPercent > 10) {
      this.log('info', `Trade increased equity by ${pnlPercent.toFixed(1)}%, triggering sweep`);
      return await this.executeSweep('post_trade_profit');
    }
    
    return { success: true, swept: false, reason: 'Below 10% threshold' };
  }

  /**
   * Schedule daily sweep (called by cron or PM2)
   */
  async scheduledSweep() {
    this.log('info', 'Running scheduled daily sweep');
    return await this.executeSweep('daily_scheduled');
  }

  /**
   * Get treasury status
   */
  getStatus() {
    const totalNAV = this.getTotalNAV();
    const targetFutures = totalNAV * this.options.targetAllocation;
    
    return {
      wallets: this.wallets,
      totalNAV,
      targetFuturesAllocation: this.options.targetAllocation,
      targetFuturesAmount: targetFutures,
      currentFuturesPercent: totalNAV > 0 ? (this.wallets.futures / totalNAV) * 100 : 0,
      sweepNeeded: this.shouldSweep(),
      potentialSweepAmount: this.calculateSweepAmount(),
      reserveLimit: this.options.reserveLimit,
      lastSweepAt: this.lastSweepAt,
      sweepInProgress: this.sweepInProgress
    };
  }

  /**
   * Log system event
   */
  async logSystemEvent(eventType, severity, context) {
    if (this.databaseManager) {
      try {
        await this.databaseManager.run(`
          INSERT INTO system_events (event_type, severity, service, message, context)
          VALUES (?, ?, 'treasury', ?, ?)
        `, [eventType, severity, context.message, JSON.stringify(context)]);
      } catch (error) {
        this.log('error', `Failed to log system event: ${error.message}`);
      }
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logging helper
   */
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'treasury-manager',
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

module.exports = TreasuryManager;
