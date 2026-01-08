/**
 * Portfolio Manager for Titan Phase 2 - The Hunter
 * 
 * Manages multiple positions simultaneously with proper risk allocation:
 * - Calculate total exposure capped at 200% equity (5x max leverage)
 * - Enforce max 5 concurrent trades limit
 * - Allocate risk per trade with dynamic allocation
 * - Rank signals by alignment score and RS score
 * - Check portfolio heat capped at 15%
 * - Adjust for directional bias with 20% reduction
 * 
 * Requirements: 16.1-16.7 (Multi-Symbol Portfolio Management)
 */

import { EventEmitter } from 'events';
import { 
  Position, 
  SignalData, 
  HologramState,
  PhaseConfig
} from '../types';

export interface PortfolioState {
  totalEquity: number;
  totalExposure: number;
  exposurePercentage: number; // Total exposure as % of equity
  openPositions: Position[];
  portfolioHeat: number; // Total risk as % of equity
  directionalBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  biasPercentage: number; // % of positions in dominant direction
  totalUnrealizedPnL: number;
  totalRealizedPnL: number;
  totalPnLPercentage: number;
}

export interface RankedSignal {
  signal: SignalData;
  hologramState: HologramState;
  compositeScore: number; // Combined alignment + RS score
  rank: number;
}

export interface RiskAllocation {
  baseRiskPerTrade: number; // Base risk per trade as % of equity
  adjustedRiskPerTrade: number; // Adjusted for open positions
  maxPositionSize: number; // Max position size in base currency
  recommendedLeverage: number; // Recommended leverage for new positions
}

export interface PortfolioManagerConfig {
  maxTotalExposure: number; // 2.0 = 200% of equity (5x max leverage)
  maxConcurrentPositions: number; // 5 concurrent trades max
  baseRiskPercent: number; // 0.02 = 2% base risk per trade
  maxPortfolioHeat: number; // 0.15 = 15% max portfolio heat
  directionalBiasThreshold: number; // 0.6 = 60% positions in same direction
  directionalBiasReduction: number; // 0.2 = 20% position size reduction
  alignmentScoreWeight: number; // 0.7 = 70% weight for alignment score
  rsScoreWeight: number; // 0.3 = 30% weight for RS score
  maxSignalsToRank: number; // 10 = max signals to consider simultaneously
}

export interface PortfolioManagerEvents {
  'portfolio:updated': (state: PortfolioState) => void;
  'portfolio:exposure_limit': (current: number, max: number) => void;
  'portfolio:position_limit': (current: number, max: number) => void;
  'portfolio:heat_limit': (current: number, max: number) => void;
  'portfolio:directional_bias': (bias: 'LONG' | 'SHORT', percentage: number) => void;
  'portfolio:signal_ranked': (rankedSignals: RankedSignal[]) => void;
  'portfolio:signal_rejected': (signal: SignalData, reason: string) => void;
  'portfolio:risk_allocated': (allocation: RiskAllocation) => void;
}

export class PortfolioManager extends EventEmitter {
  private config: PortfolioManagerConfig;
  private portfolioState: PortfolioState;
  private positions: Map<string, Position> = new Map();

  constructor(config?: Partial<PortfolioManagerConfig>) {
    super();
    
    this.config = {
      maxTotalExposure: 2.0, // 200% of equity
      maxConcurrentPositions: 5,
      baseRiskPercent: 0.02, // 2%
      maxPortfolioHeat: 0.15, // 15%
      directionalBiasThreshold: 0.6, // 60%
      directionalBiasReduction: 0.2, // 20%
      alignmentScoreWeight: 0.7, // 70%
      rsScoreWeight: 0.3, // 30%
      maxSignalsToRank: 10,
      ...config
    };

    // Initialize portfolio state
    this.portfolioState = {
      totalEquity: 0,
      totalExposure: 0,
      exposurePercentage: 0,
      openPositions: [],
      portfolioHeat: 0,
      directionalBias: 'NEUTRAL',
      biasPercentage: 0,
      totalUnrealizedPnL: 0,
      totalRealizedPnL: 0,
      totalPnLPercentage: 0
    };
  }

  /**
   * Calculate total exposure capped at 200% equity (5x max leverage)
   * @param positions - Open positions
   * @param totalEquity - Total account equity
   * @returns Total exposure as percentage of equity
   */
  public calcTotalExposure(positions: Position[], totalEquity: number): number {
    if (totalEquity <= 0) return 0;

    // Sum notional value of all open positions
    const totalNotional = positions.reduce((sum, position) => {
      const notional = position.quantity * position.currentPrice * position.leverage;
      return sum + notional;
    }, 0);

    const exposurePercentage = totalNotional / totalEquity;
    const maxExposure = this.config.maxTotalExposure;

    if (exposurePercentage > maxExposure) {
      this.emit('portfolio:exposure_limit', exposurePercentage, maxExposure);
      console.warn(`⚠️ Total exposure ${(exposurePercentage * 100).toFixed(1)}% exceeds limit ${(maxExposure * 100).toFixed(1)}%`);
    }

    return exposurePercentage; // Return actual exposure, not capped
  }

  /**
   * Enforce max 5 concurrent trades limit
   * @param currentPositions - Current open positions
   * @returns True if new position can be opened
   */
  public enforceMaxPositions(currentPositions: Position[]): boolean {
    const openPositions = currentPositions.filter(p => p.status === 'OPEN');
    const maxPositions = this.config.maxConcurrentPositions;

    if (openPositions.length >= maxPositions) {
      this.emit('portfolio:position_limit', openPositions.length, maxPositions);
      console.warn(`⚠️ Position limit reached: ${openPositions.length}/${maxPositions} positions open`);
      return false;
    }

    return true;
  }

  /**
   * Allocate risk per trade with dynamic allocation
   * @param totalEquity - Total account equity
   * @param openPositions - Current open positions
   * @returns Risk allocation details
   */
  public allocateRiskPerTrade(totalEquity: number, openPositions: Position[]): RiskAllocation {
    const numOpenPositions = openPositions.filter(p => p.status === 'OPEN').length;
    const baseRisk = this.config.baseRiskPercent;

    // Dynamic allocation: divide base risk by number of open positions + 1 (for new position)
    const adjustedRiskPerTrade = baseRisk / Math.max(1, numOpenPositions + 1);
    
    // Calculate max position size (risk amount / typical stop distance)
    const typicalStopDistance = 0.015; // 1.5% typical stop distance
    const riskAmount = totalEquity * adjustedRiskPerTrade;
    const maxPositionSize = riskAmount / typicalStopDistance;

    // Recommend leverage based on position size and equity
    const recommendedLeverage = Math.min(5, Math.max(1, maxPositionSize / (totalEquity * 0.2)));

    const allocation: RiskAllocation = {
      baseRiskPerTrade: baseRisk,
      adjustedRiskPerTrade,
      maxPositionSize,
      recommendedLeverage
    };

    this.emit('portfolio:risk_allocated', allocation);
    
    console.log(`💰 Risk allocation: ${(adjustedRiskPerTrade * 100).toFixed(2)}% per trade, max size ${maxPositionSize.toFixed(0)}, leverage ${recommendedLeverage.toFixed(1)}x`);
    
    return allocation;
  }

  /**
   * Rank signals by alignment score and RS score, select top 3
   * @param signals - Array of signals with hologram states
   * @returns Ranked signals (top 3)
   */
  public rankSignals(signals: Array<{ signal: SignalData; hologramState: HologramState }>): RankedSignal[] {
    if (signals.length === 0) return [];

    // Calculate composite score for each signal
    const scoredSignals = signals.map(({ signal, hologramState }) => {
      // Normalize alignment score (0-100 → 0-1)
      const normalizedAlignment = hologramState.alignmentScore / 100;
      
      // Normalize RS score (typically -0.1 to +0.1 → 0-1)
      const normalizedRS = Math.max(0, Math.min(1, (Math.abs(hologramState.rsScore) + 0.1) / 0.2));
      
      // Calculate composite score
      const compositeScore = 
        (normalizedAlignment * this.config.alignmentScoreWeight) + 
        (normalizedRS * this.config.rsScoreWeight);

      return {
        signal,
        hologramState,
        compositeScore,
        rank: 0 // Will be set after sorting
      };
    });

    // Sort by composite score (highest first)
    scoredSignals.sort((a, b) => b.compositeScore - a.compositeScore);

    // Assign ranks and take top signals
    const maxSignals = Math.min(this.config.maxSignalsToRank, scoredSignals.length);
    const rankedSignals = scoredSignals.slice(0, maxSignals).map((signal, index) => ({
      ...signal,
      rank: index + 1
    }));

    // Select top 3 for execution
    const top3 = rankedSignals.slice(0, 3);

    this.emit('portfolio:signal_ranked', top3);
    
    console.log(`📊 Ranked ${signals.length} signals, selected top ${top3.length}:`);
    top3.forEach(rs => {
      console.log(`  ${rs.rank}. ${rs.signal.symbol} (${rs.signal.direction}): Score ${rs.compositeScore.toFixed(3)} (A:${rs.hologramState.alignmentScore}, RS:${rs.hologramState.rsScore.toFixed(3)})`);
    });

    return top3;
  }

  /**
   * Check portfolio heat capped at 15%
   * @param positions - Open positions
   * @param totalEquity - Total account equity
   * @returns True if portfolio heat is within limits
   */
  public checkPortfolioHeat(positions: Position[], totalEquity: number): boolean {
    if (totalEquity <= 0) return false;

    // Calculate total risk (distance to stop loss for all positions)
    const totalRisk = positions
      .filter(p => p.status === 'OPEN')
      .reduce((sum, position) => {
        const riskPerUnit = Math.abs(position.entryPrice - position.stopLoss);
        const totalPositionRisk = riskPerUnit * position.quantity;
        return sum + totalPositionRisk;
      }, 0);

    const portfolioHeat = totalRisk / totalEquity;
    const maxHeat = this.config.maxPortfolioHeat;

    if (portfolioHeat > maxHeat) {
      this.emit('portfolio:heat_limit', portfolioHeat, maxHeat);
      console.warn(`🔥 Portfolio heat ${(portfolioHeat * 100).toFixed(1)}% exceeds limit ${(maxHeat * 100).toFixed(1)}%`);
      return false;
    }

    return true;
  }

  /**
   * Adjust for directional bias with 20% reduction
   * @param positions - Open positions
   * @param proposedDirection - Direction of new signal
   * @param basePositionSize - Base position size
   * @returns Adjusted position size
   */
  public adjustForDirectionalBias(
    positions: Position[], 
    proposedDirection: 'LONG' | 'SHORT', 
    basePositionSize: number
  ): number {
    const openPositions = positions.filter(p => p.status === 'OPEN');
    
    if (openPositions.length === 0) {
      return basePositionSize; // No bias with no positions
    }

    // Count positions by direction
    const longPositions = openPositions.filter(p => p.side === 'LONG').length;
    const shortPositions = openPositions.filter(p => p.side === 'SHORT').length;
    const totalPositions = openPositions.length;

    // Calculate directional bias
    const longPercentage = longPositions / totalPositions;
    const shortPercentage = shortPositions / totalPositions;
    
    let directionalBias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let biasPercentage = 0;

    if (longPercentage >= this.config.directionalBiasThreshold) {
      directionalBias = 'LONG';
      biasPercentage = longPercentage;
    } else if (shortPercentage >= this.config.directionalBiasThreshold) {
      directionalBias = 'SHORT';
      biasPercentage = shortPercentage;
    }

    // Apply reduction if new position adds to existing bias
    let adjustedSize = basePositionSize;
    
    if (directionalBias !== 'NEUTRAL' && 
        ((directionalBias === 'LONG' && proposedDirection === 'LONG') ||
         (directionalBias === 'SHORT' && proposedDirection === 'SHORT'))) {
      
      adjustedSize = basePositionSize * (1 - this.config.directionalBiasReduction);
      
      this.emit('portfolio:directional_bias', directionalBias, biasPercentage);
      console.log(`⚖️ Directional bias detected: ${directionalBias} ${(biasPercentage * 100).toFixed(1)}%, reducing ${proposedDirection} position by ${(this.config.directionalBiasReduction * 100).toFixed(0)}%`);
    }

    return adjustedSize;
  }

  /**
   * Update portfolio state with current positions and equity
   * @param positions - Current positions
   * @param totalEquity - Total account equity
   */
  public updatePortfolioState(positions: Position[], totalEquity: number): void {
    const openPositions = positions.filter(p => p.status === 'OPEN');
    
    // Calculate total exposure
    const totalExposure = openPositions.reduce((sum, pos) => {
      return sum + (pos.quantity * pos.currentPrice * pos.leverage);
    }, 0);

    // Calculate portfolio heat
    const totalRisk = openPositions.reduce((sum, pos) => {
      const riskPerUnit = Math.abs(pos.entryPrice - pos.stopLoss);
      return sum + (riskPerUnit * pos.quantity);
    }, 0);

    // Calculate directional bias
    const longPositions = openPositions.filter(p => p.side === 'LONG').length;
    const shortPositions = openPositions.filter(p => p.side === 'SHORT').length;
    const totalOpenPositions = openPositions.length;

    let directionalBias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let biasPercentage = 0;

    if (totalOpenPositions > 0) {
      const longPercentage = longPositions / totalOpenPositions;
      const shortPercentage = shortPositions / totalOpenPositions;

      if (longPercentage >= this.config.directionalBiasThreshold) {
        directionalBias = 'LONG';
        biasPercentage = longPercentage;
      } else if (shortPercentage >= this.config.directionalBiasThreshold) {
        directionalBias = 'SHORT';
        biasPercentage = shortPercentage;
      }
    }

    // Calculate P&L
    const totalUnrealizedPnL = openPositions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const totalRealizedPnL = positions.reduce((sum, pos) => sum + pos.realizedPnL, 0);
    const totalPnL = totalUnrealizedPnL + totalRealizedPnL;

    // Update portfolio state
    this.portfolioState = {
      totalEquity,
      totalExposure,
      exposurePercentage: totalEquity > 0 ? totalExposure / totalEquity : 0,
      openPositions,
      portfolioHeat: totalEquity > 0 ? totalRisk / totalEquity : 0,
      directionalBias,
      biasPercentage,
      totalUnrealizedPnL,
      totalRealizedPnL,
      totalPnLPercentage: totalEquity > 0 ? totalPnL / totalEquity : 0
    };

    // Update positions map
    this.positions.clear();
    positions.forEach(pos => this.positions.set(pos.id, pos));

    this.emit('portfolio:updated', this.portfolioState);
  }

  /**
   * Check if new signal can be accepted based on portfolio limits
   * @param signal - Signal to check
   * @param hologramState - Hologram state for the signal
   * @param totalEquity - Total account equity
   * @returns True if signal can be accepted
   */
  public canAcceptSignal(signal: SignalData, hologramState: HologramState, totalEquity: number): boolean {
    const openPositions = Array.from(this.positions.values()).filter(p => p.status === 'OPEN');

    // Check position limit
    if (!this.enforceMaxPositions(openPositions)) {
      this.emit('portfolio:signal_rejected', signal, 'POSITION_LIMIT_EXCEEDED');
      return false;
    }

    // Check portfolio heat
    if (!this.checkPortfolioHeat(openPositions, totalEquity)) {
      this.emit('portfolio:signal_rejected', signal, 'PORTFOLIO_HEAT_EXCEEDED');
      return false;
    }

    // Check total exposure (would need position size calculation)
    const currentExposure = this.calcTotalExposure(openPositions, totalEquity);
    if (currentExposure >= this.config.maxTotalExposure) {
      this.emit('portfolio:signal_rejected', signal, 'EXPOSURE_LIMIT_EXCEEDED');
      return false;
    }

    return true;
  }

  /**
   * Get current portfolio state
   * @returns Current portfolio state
   */
  public getPortfolioState(): PortfolioState {
    return { ...this.portfolioState };
  }

  /**
   * Get portfolio statistics for display
   * @returns Portfolio statistics
   */
  public getPortfolioStatistics(): {
    totalPositions: number;
    openPositions: number;
    exposureUtilization: number; // % of max exposure used
    heatUtilization: number; // % of max heat used
    positionUtilization: number; // % of max positions used
    avgPositionSize: number;
    largestPosition: number;
    directionalBias: string;
    totalPnL: number;
    totalPnLPercentage: number;
  } {
    const openPositions = this.portfolioState.openPositions;
    const positionSizes = openPositions.map(p => p.quantity * p.currentPrice);
    
    return {
      totalPositions: Array.from(this.positions.values()).length,
      openPositions: openPositions.length,
      exposureUtilization: this.portfolioState.exposurePercentage / this.config.maxTotalExposure,
      heatUtilization: this.portfolioState.portfolioHeat / this.config.maxPortfolioHeat,
      positionUtilization: openPositions.length / this.config.maxConcurrentPositions,
      avgPositionSize: positionSizes.length > 0 ? positionSizes.reduce((a, b) => a + b, 0) / positionSizes.length : 0,
      largestPosition: positionSizes.length > 0 ? Math.max(...positionSizes) : 0,
      directionalBias: `${this.portfolioState.directionalBias} (${(this.portfolioState.biasPercentage * 100).toFixed(1)}%)`,
      totalPnL: this.portfolioState.totalUnrealizedPnL + this.portfolioState.totalRealizedPnL,
      totalPnLPercentage: this.portfolioState.totalPnLPercentage
    };
  }

  /**
   * Update configuration
   * @param newConfig - New configuration
   */
  public updateConfig(newConfig: Partial<PortfolioManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`📊 Portfolio Manager: Configuration updated`);
  }

  /**
   * Add position to portfolio
   * @param position - Position to add
   */
  public addPosition(position: Position): void {
    this.positions.set(position.id, position);
    console.log(`📊 Portfolio Manager: Added position ${position.id} (${position.symbol} ${position.side})`);
  }

  /**
   * Remove position from portfolio
   * @param positionId - Position ID to remove
   */
  public removePosition(positionId: string): void {
    if (this.positions.delete(positionId)) {
      console.log(`📊 Portfolio Manager: Removed position ${positionId}`);
    }
  }

  /**
   * Update position in portfolio
   * @param position - Updated position
   */
  public updatePosition(position: Position): void {
    if (this.positions.has(position.id)) {
      this.positions.set(position.id, position);
    }
  }

  /**
   * Get all positions
   * @returns Array of all positions
   */
  public getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get open positions only
   * @returns Array of open positions
   */
  public getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'OPEN');
  }

  /**
   * Emergency close all positions (for risk management)
   * @returns Position IDs that need to be closed
   */
  public getPositionsToClose(): string[] {
    return this.getOpenPositions().map(p => p.id);
  }

  /**
   * Clear all positions (for testing/reset)
   */
  public clearPositions(): void {
    this.positions.clear();
    this.portfolioState.openPositions = [];
    console.log(`📊 Portfolio Manager: All positions cleared`);
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.positions.clear();
    this.removeAllListeners();
    console.log(`📊 Portfolio Manager: Destroyed`);
  }
}

// Export event interface for TypeScript
export declare interface PortfolioManager {
  on<U extends keyof PortfolioManagerEvents>(event: U, listener: PortfolioManagerEvents[U]): this;
  emit<U extends keyof PortfolioManagerEvents>(event: U, ...args: Parameters<PortfolioManagerEvents[U]>): boolean;
}