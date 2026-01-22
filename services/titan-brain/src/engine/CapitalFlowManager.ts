/**
 * CapitalFlowManager - Manages profit sweeping from futures to spot wallet
 * Implements ratchet mechanism to lock in profits
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {
  SweepDecision,
  SweepResult,
  TreasuryStatus,
  TreasuryOperation,
  CapitalFlowConfig,
} from '../types/index.js';
import { DatabaseManager } from '../db/DatabaseManager.js';

/**
 * Exchange API interface for wallet operations
 * This interface should be implemented by the actual exchange adapter
 */
export interface ExchangeWalletAPI {
  /** Get futures wallet balance */
  getFuturesBalance(): Promise<number>;
  /** Get spot wallet balance */
  getSpotBalance(): Promise<number>;
  /** Transfer funds from futures to spot wallet */
  transferToSpot(
    amount: number,
  ): Promise<{ success: boolean; transactionId?: string; error?: string }>;
}

/**
 * Interface for sweep notification callback
 */
export interface SweepNotifier {
  sendSweepNotification(
    amount: number,
    fromWallet: string,
    toWallet: string,
    reason: string,
    newBalance: number,
  ): Promise<void>;
}

/**
 * CapitalFlowManager manages profit sweeping from the risky futures wallet
 * to the safe spot wallet using a ratchet mechanism.
 */
export class CapitalFlowManager {
  private readonly config: CapitalFlowConfig;
  private readonly db: DatabaseManager | null;
  private readonly exchangeAPI: ExchangeWalletAPI | null;

  /** Cached high watermark value */
  private highWatermark: number = 0;
  /** Cached total swept amount */
  private totalSwept: number = 0;
  /** Target allocation for futures wallet (set externally) */
  private targetAllocation: number = 0;
  /** Sweep notifier */
  private sweepNotifier: SweepNotifier | null = null;

  constructor(config: CapitalFlowConfig, db?: DatabaseManager, exchangeAPI?: ExchangeWalletAPI) {
    this.config = config;
    this.db = db ?? null;
    this.exchangeAPI = exchangeAPI ?? null;
  }

  /**
   * Set the sweep notifier
   */
  setSweepNotifier(notifier: SweepNotifier): void {
    // eslint-disable-next-line functional/immutable-data
    this.sweepNotifier = notifier;
  }

  /**
   * Initialize the manager by loading state from database
   */
  async initialize(): Promise<void> {
    if (this.db) {
      await this.loadHighWatermark();
      await this.loadTotalSwept();
    }
  }

  /**
   * Load high watermark from database
   */
  private async loadHighWatermark(): Promise<void> {
    if (!this.db) return;

    const result = await this.db.query<{ value: string }>(
      `SELECT value FROM high_watermark ORDER BY updated_at DESC LIMIT 1`,
    );

    if (result.rows.length > 0) {
      // eslint-disable-next-line functional/immutable-data
      this.highWatermark = parseFloat(result.rows[0].value);
    }
  }

  /**
   * Load total swept amount from database
   */
  private async loadTotalSwept(): Promise<void> {
    if (!this.db) return;

    const result = await this.db.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM treasury_operations 
       WHERE operation_type = 'SWEEP' AND to_wallet = 'SPOT'`,
    );

    if (result.rows.length > 0) {
      // eslint-disable-next-line functional/immutable-data
      this.totalSwept = parseFloat(result.rows[0].total);
    }
  }

  /**
   * Set the target allocation for futures wallet
   * This is typically set by the Brain based on current equity and allocation
   *
   * @param amount - Target allocation in USD
   */
  setTargetAllocation(amount: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.targetAllocation = Math.max(0, amount);
  }

  /**
   * Get the current high watermark
   *
   * @returns High watermark value in USD
   */
  getHighWatermark(): number {
    return this.highWatermark;
  }

  /**
   * Set high watermark value (for state recovery)
   *
   * @param value - High watermark value in USD
   */
  async setHighWatermark(value: number): Promise<void> {
    if (value <= 0) {
      console.warn(`Invalid high watermark value: ${value}`);
      return;
    }

    // eslint-disable-next-line functional/immutable-data
    this.highWatermark = value;

    // Persist to database
    if (this.db) {
      await this.db.query(`INSERT INTO high_watermark (value, updated_at) VALUES ($1, $2)`, [
        value,
        Date.now(),
      ]);
    }

    console.log(`High watermark set to $${value}`);
  }

  /**
   * Update the high watermark if equity exceeds current watermark
   * Requirement 4.1: Track High Watermark for Futures Wallet balance
   *
   * Property 10: High Watermark Monotonicity - watermark should never decrease
   *
   * @param equity - Current equity in USD
   * @returns true if watermark was updated
   */
  async updateHighWatermark(equity: number): Promise<boolean> {
    // Only update if new equity exceeds current watermark
    if (equity <= this.highWatermark) {
      return false;
    }

    const previousWatermark = this.highWatermark;
    // eslint-disable-next-line functional/immutable-data
    this.highWatermark = equity;

    // Persist to database
    if (this.db) {
      await this.db.query(`INSERT INTO high_watermark (value, updated_at) VALUES ($1, $2)`, [
        equity,
        Date.now(),
      ]);
    }

    return true;
  }

  /**
   * Check if sweep conditions are met
   * Requirement 4.2: Sweep when Futures Wallet exceeds Target Allocation by 20%
   *
   * @returns SweepDecision with sweep details
   */
  async checkSweepConditions(): Promise<SweepDecision> {
    // Get current futures balance
    const futuresBalance = await this.getFuturesBalance();

    // Calculate threshold (target allocation * sweep threshold)
    const sweepTriggerLevel = this.targetAllocation * this.config.sweepThreshold;

    // Check if we exceed the threshold
    if (futuresBalance <= sweepTriggerLevel) {
      return {
        shouldSweep: false,
        amount: 0,
        reason: 'Futures balance does not exceed sweep threshold',
        futuresBalance,
        targetAllocation: this.targetAllocation,
      };
    }

    // Requirement 4.3: Calculate excess profit
    const excessAmount = futuresBalance - sweepTriggerLevel;

    // Requirement 4.5: Ensure reserve limit is maintained
    // Property 5: Reserve Limit Protection - remaining balance >= reserveLimit
    const maxSweepable = futuresBalance - this.config.reserveLimit;

    if (maxSweepable <= 0) {
      return {
        shouldSweep: false,
        amount: 0,
        reason: `Cannot sweep: would violate reserve limit of $${this.config.reserveLimit}`,
        futuresBalance,
        targetAllocation: this.targetAllocation,
      };
    }

    // Sweep amount is the minimum of excess and max sweepable
    const sweepAmount = Math.min(excessAmount, maxSweepable);

    if (sweepAmount <= 0) {
      return {
        shouldSweep: false,
        amount: 0,
        reason: 'No excess to sweep after reserve limit',
        futuresBalance,
        targetAllocation: this.targetAllocation,
      };
    }

    return {
      shouldSweep: true,
      amount: sweepAmount,
      reason: `Excess of $${sweepAmount.toFixed(2)} detected (${((futuresBalance / this.targetAllocation - 1) * 100).toFixed(1)}% over target)`,
      futuresBalance,
      targetAllocation: this.targetAllocation,
    };
  }

  /**
   * Execute a profit sweep from futures to spot wallet
   * Requirement 4.4: Transfer excess USDT to Spot Wallet
   * Requirement 4.8: Retry up to 3 times with exponential backoff
   *
   * Property 4: Sweep Monotonicity - totalSwept should only increase
   *
   * @param amount - Amount to sweep in USD
   * @returns SweepResult with transaction details
   */
  async executeSweep(amount: number): Promise<SweepResult> {
    const timestamp = Date.now();

    // Validate amount
    if (amount <= 0) {
      return {
        success: false,
        amount: 0,
        error: 'Invalid sweep amount: must be positive',
        timestamp,
      };
    }

    // Check reserve limit before sweep
    const futuresBalance = await this.getFuturesBalance();
    const remainingAfterSweep = futuresBalance - amount;

    if (remainingAfterSweep < this.config.reserveLimit) {
      return {
        success: false,
        amount: 0,
        error: `Sweep would violate reserve limit: $${remainingAfterSweep.toFixed(2)} < $${this.config.reserveLimit}`,
        timestamp,
      };
    }

    // Execute transfer with retry logic
    // eslint-disable-next-line functional/no-let
    let lastError: string | undefined;

    // eslint-disable-next-line functional/no-let
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.executeTransfer(amount);

        if (result.success) {
          // Update total swept (monotonically increasing)
          // eslint-disable-next-line functional/immutable-data
          this.totalSwept += amount;

          // Log the operation
          await this.logTreasuryOperation({
            timestamp,
            operationType: 'SWEEP',
            amount,
            fromWallet: 'FUTURES',
            toWallet: 'SPOT',
            reason: `Automated profit sweep (attempt ${attempt})`,
            highWatermark: this.highWatermark,
          });

          // Send sweep notification
          if (this.sweepNotifier) {
            try {
              const newBalance = await this.getFuturesBalance();
              await this.sweepNotifier.sendSweepNotification(
                amount,
                'FUTURES',
                'SPOT',
                `Automated profit sweep (attempt ${attempt})`,
                newBalance,
              );
            } catch (error) {
              console.error('Failed to send sweep notification:', error);
            }
          }

          return {
            success: true,
            amount,
            transactionId: result.transactionId,
            timestamp,
          };
        }

        lastError = result.error;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }

      // Exponential backoff before retry
      if (attempt < this.config.maxRetries) {
        const delay = this.config.retryBaseDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      amount: 0,
      error: `Sweep failed after ${this.config.maxRetries} attempts: ${lastError}`,
      timestamp,
    };
  }

  /**
   * Execute the actual transfer via exchange API
   */
  private async executeTransfer(
    amount: number,
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    if (!this.exchangeAPI) {
      // Mock success for testing without exchange API
      return {
        success: true,
        transactionId: `mock-${Date.now()}`,
      };
    }

    return this.exchangeAPI.transferToSpot(amount);
  }

  /**
   * Get current treasury status
   * Requirement 8.1-8.7: Treasury management visibility
   *
   * @returns TreasuryStatus with all wallet balances and metrics
   */
  async getTreasuryStatus(): Promise<TreasuryStatus> {
    const futuresWallet = await this.getFuturesBalance();
    const spotWallet = await this.getSpotBalance();

    return {
      futuresWallet,
      spotWallet,
      totalSwept: this.totalSwept,
      highWatermark: this.highWatermark,
      lockedProfit: this.totalSwept, // Locked profit equals total swept
      riskCapital: futuresWallet, // Risk capital is futures balance
    };
  }

  /**
   * Get futures wallet balance
   */
  private async getFuturesBalance(): Promise<number> {
    if (!this.exchangeAPI) {
      // Return 0 if no exchange API configured
      return 0;
    }
    return this.exchangeAPI.getFuturesBalance();
  }

  /**
   * Get spot wallet balance
   */
  private async getSpotBalance(): Promise<number> {
    if (!this.exchangeAPI) {
      // Return 0 if no exchange API configured
      return 0;
    }
    return this.exchangeAPI.getSpotBalance();
  }

  /**
   * Log a treasury operation to the database
   * Requirement 4.7: Log all sweep transactions
   */
  private async logTreasuryOperation(operation: TreasuryOperation): Promise<void> {
    if (!this.db) return;

    await this.db.query(
      `INSERT INTO treasury_operations 
       (timestamp, operation_type, amount, from_wallet, to_wallet, reason, high_watermark)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        operation.timestamp,
        operation.operationType,
        operation.amount,
        operation.fromWallet,
        operation.toWallet,
        operation.reason ?? null,
        operation.highWatermark,
      ],
    );
  }

  /**
   * Get sweep history from database
   *
   * @param limit - Maximum number of records to return
   * @returns Array of treasury operations
   */
  async getSweepHistory(limit: number = 100): Promise<TreasuryOperation[]> {
    if (!this.db) return [];

    const result = await this.db.query<{
      id: number;
      timestamp: string;
      operation_type: string;
      amount: string;
      from_wallet: string;
      to_wallet: string;
      reason: string | null;
      high_watermark: string;
    }>(
      `SELECT id, timestamp, operation_type, amount, from_wallet, to_wallet, reason, high_watermark
       FROM treasury_operations
       WHERE operation_type = 'SWEEP'
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      timestamp: parseInt(row.timestamp, 10),
      operationType: row.operation_type as 'SWEEP' | 'MANUAL_TRANSFER',
      amount: parseFloat(row.amount),
      fromWallet: row.from_wallet as 'FUTURES' | 'SPOT',
      toWallet: row.to_wallet as 'FUTURES' | 'SPOT',
      reason: row.reason ?? undefined,
      highWatermark: parseFloat(row.high_watermark),
    }));
  }

  /**
   * Calculate the next sweep trigger level
   *
   * @returns The futures balance level that would trigger a sweep
   */
  getNextSweepTriggerLevel(): number {
    return this.targetAllocation * this.config.sweepThreshold;
  }

  /**
   * Get the total amount swept since inception
   *
   * @returns Total swept amount in USD
   */
  getTotalSwept(): number {
    return this.totalSwept;
  }

  /**
   * Get the current target allocation
   *
   * @returns Target allocation in USD
   */
  getTargetAllocation(): number {
    return this.targetAllocation;
  }

  /**
   * Get the reserve limit
   *
   * @returns Reserve limit in USD
   */
  getReserveLimit(): number {
    return this.config.reserveLimit;
  }

  /**
   * Get configuration
   */
  getConfig(): CapitalFlowConfig {
    return { ...this.config };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if a sweep should be triggered based on equity increase
   * Requirement 4.6: Sweep after trades that increase equity by > 10%
   *
   * @param previousEquity - Equity before the trade
   * @param currentEquity - Equity after the trade
   * @returns true if equity increased by more than 10%
   */
  shouldTriggerSweepOnEquityIncrease(previousEquity: number, currentEquity: number): boolean {
    if (previousEquity <= 0) return false;

    const percentIncrease = (currentEquity - previousEquity) / previousEquity;
    return percentIncrease > 0.1; // 10% threshold
  }

  /**
   * Perform a full sweep check and execution if conditions are met
   * Convenience method that combines checkSweepConditions and executeSweep
   *
   * @returns SweepResult if sweep was attempted, null if conditions not met
   */
  async performSweepIfNeeded(): Promise<SweepResult | null> {
    const decision = await this.checkSweepConditions();

    if (!decision.shouldSweep) {
      return null;
    }

    return this.executeSweep(decision.amount);
  }
}
