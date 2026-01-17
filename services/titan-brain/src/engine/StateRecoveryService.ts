/**
 * State Recovery Service
 * Handles loading and recovery of system state on startup
 *
 * Requirements: 9.4, 9.5
 */

import {
  AllocationVector,
  PhasePerformance,
  PhaseId,
  RiskMetrics,
  Position,
} from '../types/index.js';
import { AllocationRepository } from '../db/repositories/AllocationRepository.js';
import { PerformanceRepository } from '../db/repositories/PerformanceRepository.js';
import { TreasuryRepository } from '../db/repositories/TreasuryRepository.js';
import { RiskRepository } from '../db/repositories/RiskRepository.js';
import { DatabaseManager } from '../db/DatabaseManager.js';

export interface RecoveredState {
  allocation: AllocationVector | null;
  performance: Record<PhaseId, PhasePerformance>;
  highWatermark: number;
  riskMetrics: RiskMetrics | null;
}

export interface StateRecoveryConfig {
  performanceWindowDays: number;
  defaultAllocation: AllocationVector;
  defaultHighWatermark: number;
}

/**
 * Service for recovering system state on startup
 */
export class StateRecoveryService {
  private readonly allocationRepo: AllocationRepository;
  private readonly performanceRepo: PerformanceRepository;
  private readonly treasuryRepo: TreasuryRepository;
  private readonly riskRepo: RiskRepository;
  private readonly config: StateRecoveryConfig;

  constructor(db: DatabaseManager, config: StateRecoveryConfig) {
    this.allocationRepo = new AllocationRepository(db);
    this.performanceRepo = new PerformanceRepository(db);
    this.treasuryRepo = new TreasuryRepository(db);
    this.riskRepo = new RiskRepository(db);
    this.config = config;
  }

  /**
   * Recover complete system state on startup
   * Requirement 9.4: Load allocation vector, performance metrics, and high watermark
   *
   * @returns RecoveredState with all loaded data
   */
  async recoverState(): Promise<RecoveredState> {
    console.log('Starting state recovery...');

    // Load allocation vector
    const allocation = await this.loadAllocationVector();
    console.log('Loaded allocation vector:', allocation);

    // Load performance metrics for all phases
    const performance = await this.loadPerformanceMetrics();
    console.log('Loaded performance metrics for phases:', Object.keys(performance));

    // Load high watermark
    const highWatermark = await this.loadHighWatermark();
    console.log('Loaded high watermark:', highWatermark);

    // Load latest risk metrics (will be recalculated with current positions)
    const riskMetrics = await this.loadRiskMetrics();
    console.log('Loaded risk metrics:', riskMetrics ? 'available' : 'none');

    console.log('State recovery completed successfully');

    return {
      allocation,
      performance,
      highWatermark,
      riskMetrics,
    };
  }

  /**
   * Load the latest allocation vector from database
   * Requirement 9.4: Load allocation vector on startup
   *
   * @returns Latest allocation vector or default if none exists
   */
  async loadAllocationVector(): Promise<AllocationVector | null> {
    try {
      const latestAllocation = await this.allocationRepo.getLatestVector();

      if (latestAllocation) {
        // Validate allocation vector (weights should sum to 1.0)
        const sum = latestAllocation.w1 + latestAllocation.w2 + latestAllocation.w3;
        if (Math.abs(sum - 1.0) > 0.001) {
          console.warn(`Invalid allocation vector sum: ${sum}, using default`);
          return this.config.defaultAllocation;
        }

        return latestAllocation;
      }

      console.log('No allocation vector found in database, using default');
      return this.config.defaultAllocation;
    } catch (error) {
      console.error('Error loading allocation vector:', error);
      return this.config.defaultAllocation;
    }
  }

  /**
   * Load performance metrics for all phases
   * Requirement 9.4: Load performance metrics on startup
   *
   * @returns Performance metrics for each phase
   */
  async loadPerformanceMetrics(): Promise<Record<PhaseId, PhasePerformance>> {
    const performance: Record<PhaseId, PhasePerformance> = {
      phase1: this.createDefaultPerformance('phase1'),
      phase2: this.createDefaultPerformance('phase2'),
      phase3: this.createDefaultPerformance('phase3'),
    };

    const windowMs = this.config.performanceWindowDays * 24 * 60 * 60 * 1000;

    for (const phaseId of ['phase1', 'phase2', 'phase3'] as PhaseId[]) {
      try {
        // Get recent trades for the phase
        const trades = await this.performanceRepo.getTradesInWindow(phaseId, windowMs);

        if (trades.length === 0) {
          console.log(`No recent trades found for ${phaseId}, using defaults`);
          continue;
        }

        // Calculate performance metrics
        const totalPnL = trades.reduce((sum, trade) => sum + trade.pnl, 0);
        const winningTrades = trades.filter((trade) => trade.pnl > 0);
        const losingTrades = trades.filter((trade) => trade.pnl < 0);

        const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;
        const avgWin =
          winningTrades.length > 0
            ? winningTrades.reduce((sum, trade) => sum + trade.pnl, 0) / winningTrades.length
            : 0;
        const avgLoss =
          losingTrades.length > 0
            ? losingTrades.reduce((sum, trade) => sum + trade.pnl, 0) / losingTrades.length
            : 0;

        // Calculate Sharpe ratio (simplified)
        const returns = trades.map((trade) => trade.pnl);
        const sharpeRatio = this.calculateSharpeRatio(returns);

        // Calculate performance modifier
        const modifier = this.calculatePerformanceModifier(sharpeRatio, trades.length);

        performance[phaseId] = {
          phaseId,
          sharpeRatio,
          totalPnL,
          tradeCount: trades.length,
          winRate,
          avgWin,
          avgLoss,
          modifier,
        };

        console.log(
          `Loaded performance for ${phaseId}: Sharpe=${sharpeRatio.toFixed(2)}, Trades=${trades.length}, Modifier=${modifier.toFixed(2)}`,
        );
      } catch (error) {
        console.error(`Error loading performance for ${phaseId}:`, error);
        // Keep default performance for this phase
      }
    }

    return performance;
  }

  /**
   * Load the high watermark from database
   * Requirement 9.4: Load high watermark on startup
   *
   * @returns High watermark value
   */
  async loadHighWatermark(): Promise<number> {
    try {
      const highWatermark = await this.treasuryRepo.getHighWatermark();

      // Validate high watermark (should be positive)
      if (highWatermark <= 0) {
        console.warn(`Invalid high watermark: ${highWatermark}, using default`);
        return this.config.defaultHighWatermark;
      }

      return highWatermark;
    } catch (error) {
      console.error('Error loading high watermark:', error);
      return this.config.defaultHighWatermark;
    }
  }

  /**
   * Load the latest risk metrics snapshot
   * Note: Risk metrics will be recalculated with current positions
   *
   * @returns Latest risk metrics or null if none exist
   */
  async loadRiskMetrics(): Promise<RiskMetrics | null> {
    try {
      const latestSnapshot = await this.riskRepo.getLatest();
      return latestSnapshot
        ? {
            currentLeverage: latestSnapshot.globalLeverage,
            projectedLeverage: latestSnapshot.globalLeverage,
            correlation: latestSnapshot.correlationScore,
            portfolioDelta: latestSnapshot.netDelta,
            portfolioBeta: latestSnapshot.portfolioBeta,
          }
        : null;
    } catch (error) {
      console.error('Error loading risk metrics:', error);
      return null;
    }
  }

  /**
   * Recalculate risk metrics with current positions
   * Requirement 9.5: Recalculate risk metrics before accepting new signals
   *
   * @param positions - Current positions
   * @param equity - Current equity
   * @returns Recalculated risk metrics
   */
  recalculateRiskMetrics(positions: Position[], equity: number): RiskMetrics {
    // Calculate combined leverage
    const totalNotional = positions.reduce((sum, pos) => sum + Math.abs(pos.size), 0);
    const currentLeverage = equity > 0 ? totalNotional / equity : 0;

    // Calculate portfolio delta (net directional exposure)
    const portfolioDelta = positions.reduce((sum, pos) => {
      return sum + (pos.side === 'LONG' ? pos.size : -pos.size);
    }, 0);

    // Calculate correlation (simplified - would need price history for full calculation)
    const correlation = this.calculatePositionCorrelation(positions);

    // Calculate portfolio beta (correlation to BTC - simplified)
    const portfolioBeta = this.calculatePortfolioBeta(positions);

    const riskMetrics: RiskMetrics = {
      currentLeverage,
      projectedLeverage: currentLeverage, // Same as current for recalculation
      correlation,
      portfolioDelta,
      portfolioBeta,
    };

    console.log('Recalculated risk metrics:', riskMetrics);
    return riskMetrics;
  }

  /**
   * Validate recovered state for consistency
   *
   * @param state - Recovered state to validate
   * @returns True if state is valid
   */
  validateRecoveredState(state: RecoveredState): boolean {
    // Validate allocation vector
    if (state.allocation) {
      const sum = state.allocation.w1 + state.allocation.w2 + state.allocation.w3;
      if (Math.abs(sum - 1.0) > 0.001) {
        console.error('Invalid allocation vector sum:', sum);
        return false;
      }
    }

    // Validate high watermark
    if (state.highWatermark <= 0) {
      console.error('Invalid high watermark:', state.highWatermark);
      return false;
    }

    // Validate performance metrics
    for (const [phaseId, perf] of Object.entries(state.performance)) {
      if (perf.modifier < 0.5 || perf.modifier > 1.2) {
        console.error(`Invalid performance modifier for ${phaseId}:`, perf.modifier);
        return false;
      }
    }

    return true;
  }

  /**
   * Create default performance metrics for a phase
   */
  private createDefaultPerformance(phaseId: PhaseId): PhasePerformance {
    return {
      phaseId,
      sharpeRatio: 0,
      totalPnL: 0,
      tradeCount: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      modifier: 1.0, // No modifier by default
    };
  }

  /**
   * Calculate Sharpe ratio from returns array
   */
  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance =
      returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? mean / stdDev : 0;
  }

  /**
   * Calculate performance modifier based on Sharpe ratio and trade count
   */
  private calculatePerformanceModifier(sharpeRatio: number, tradeCount: number): number {
    // Requirement 2.8: Use base weight if insufficient trade history
    if (tradeCount < 10) {
      return 1.0;
    }

    // Requirement 2.3: Malus penalty for Sharpe < 0
    if (sharpeRatio < 0) {
      return 0.5;
    }

    // Requirement 2.4: Bonus multiplier for Sharpe > 2.0
    if (sharpeRatio > 2.0) {
      return 1.2;
    }

    // Linear interpolation between 0 and 2.0
    return 1.0 + (sharpeRatio / 2.0) * 0.2;
  }

  /**
   * Calculate simplified correlation between positions
   */
  private calculatePositionCorrelation(positions: Position[]): number {
    if (positions.length < 2) return 0;

    // Simplified correlation calculation
    // In a real implementation, this would use price history
    const symbols = positions.map((pos) => pos.symbol);
    const uniqueSymbols = new Set(symbols);

    // If all positions are on the same symbol, correlation is 1.0
    if (uniqueSymbols.size === 1) return 1.0;

    // If all positions are on different symbols, assume low correlation
    if (uniqueSymbols.size === positions.length) return 0.2;

    // Otherwise, moderate correlation
    return 0.6;
  }

  /**
   * Calculate simplified portfolio beta (correlation to BTC)
   */
  private calculatePortfolioBeta(positions: Position[]): number {
    if (positions.length === 0) return 0;

    // Simplified beta calculation
    // In a real implementation, this would use BTC price correlation
    const btcPositions = positions.filter((pos) => pos.symbol.includes('BTC'));
    const totalNotional = positions.reduce((sum, pos) => sum + Math.abs(pos.size), 0);
    const btcNotional = btcPositions.reduce((sum, pos) => sum + Math.abs(pos.size), 0);

    return totalNotional > 0 ? btcNotional / totalNotional : 0;
  }
}
