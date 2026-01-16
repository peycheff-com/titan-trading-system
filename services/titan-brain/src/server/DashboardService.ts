/**
 * DashboardService - Comprehensive data collection and aggregation for dashboard
 * Handles NAV calculation, allocation formatting, risk metrics, and treasury status
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
 */

import {
  AllocationVector,
  BrainDecision,
  BreakerStatus,
  DashboardData,
  PhaseId,
  PhasePerformance,
  Position,
  RiskMetrics,
  TreasuryStatus,
} from "../types/index.js";
import { getNatsClient, TitanSubject } from "@titan/shared";
import { TitanBrain } from "../engine/TitanBrain.js";
import { DatabaseManager } from "../db/DatabaseManager.js";

/**
 * Extended dashboard data with additional metrics
 */
export interface ExtendedDashboardData extends DashboardData {
  /** Version metadata */
  version: string;
  /** System uptime in milliseconds */
  uptime: number;
  /** Performance metrics per phase */
  phasePerformance: PhasePerformance[];
  /** Signal approval rates per phase */
  approvalRates: Record<PhaseId, number>;
  /** Next sweep trigger level */
  nextSweepTriggerLevel: number;
  /** Total amount swept to spot wallet */
  totalSwept: number;
  /** High watermark value */
  highWatermark: number;
  /** Distance to high watermark (current drawdown) */
  drawdownFromHigh: number;
  /** Time since last profitable trade */
  timeSinceLastProfit: number | null;
  /** Current positions summary */
  positionsSummary: {
    count: number;
    totalNotional: number;
    totalUnrealizedPnL: number;
  };
}

/**
 * Wallet balance information
 */
export interface WalletBalance {
  exchange: string;
  walletType: "spot" | "futures" | "margin";
  asset: string;
  balance: number;
  usdValue: number;
}

/**
 * NAV calculation result
 */
export interface NAVCalculation {
  totalNAV: number;
  walletBreakdown: WalletBalance[];
  unrealizedPnL: number;
  lastUpdated: number;
}

/**
 * Dashboard service configuration
 */
export interface DashboardServiceConfig {
  /** Cache TTL for dashboard data (ms) */
  cacheTTL: number;
  /** Cache TTL for NAV calculation (ms) */
  navCacheTTL: number;
  /** Maximum number of recent decisions to include */
  maxRecentDecisions: number;
  /** System version */
  version: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DashboardServiceConfig = {
  cacheTTL: 60000, // 1 minute
  navCacheTTL: 30000, // 30 seconds
  maxRecentDecisions: 50,
  version: "1.0.0",
};

/**
 * DashboardService provides comprehensive data aggregation for the dashboard
 */
export class DashboardService {
  private readonly config: DashboardServiceConfig;
  private readonly brain: TitanBrain;
  private readonly db: DatabaseManager | null;
  private readonly startTime: number;

  /** Cache for dashboard data */
  private dashboardCache: ExtendedDashboardData | null = null;
  private dashboardCacheTime: number = 0;

  /** Cache for NAV calculation */
  private navCache: NAVCalculation | null = null;
  private navCacheTime: number = 0;

  /** External wallet balance providers */
  private walletProviders: Map<string, () => Promise<WalletBalance[]>> =
    new Map();

  constructor(
    brain: TitanBrain,
    db?: DatabaseManager,
    config?: Partial<DashboardServiceConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.brain = brain;
    this.db = db ?? null;
    this.startTime = Date.now();
  }

  /**
   * Start publishing dashboard updates to NATS
   * @param intervalMs - Interval in milliseconds
   */
  startPublishing(intervalMs: number = 1000): void {
    setInterval(async () => {
      try {
        const data = await this.getDashboardData();
        const nats = getNatsClient();
        if (nats.isConnected()) {
          await nats.publish(TitanSubject.DASHBOARD_UPDATES, {
            type: "STATE_UPDATE",
            timestamp: Date.now(),
            ...data,
          });
        }
      } catch (err) {
        console.error("Failed to publish dashboard update:", err);
      }
    }, intervalMs);
  }

  /**
   * Register a wallet balance provider
   *
   * @param exchange - Exchange name (e.g., 'bybit', 'binance')
   * @param provider - Function that returns wallet balances
   */
  registerWalletProvider(
    exchange: string,
    provider: () => Promise<WalletBalance[]>,
  ): void {
    this.walletProviders.set(exchange, provider);
  }

  /**
   * Calculate NAV from all wallets
   * Requirement 10.2: Implement NAV calculation from all wallets
   *
   * @returns NAV calculation with wallet breakdown
   */
  async calculateNAV(): Promise<NAVCalculation> {
    // Check cache
    if (
      this.navCache &&
      Date.now() - this.navCacheTime < this.config.navCacheTTL
    ) {
      return this.navCache;
    }

    const walletBreakdown: WalletBalance[] = [];
    let totalNAV = 0;
    let unrealizedPnL = 0;

    // Collect balances from all registered providers
    for (const [exchange, provider] of this.walletProviders) {
      try {
        const balances = await provider();
        walletBreakdown.push(...balances);

        // Sum USD values
        for (const balance of balances) {
          totalNAV += balance.usdValue;
        }
      } catch (error) {
        console.error(`Error fetching balances from ${exchange}:`, error);
      }
    }

    // Add unrealized PnL from current positions
    const positions = this.brain.getPositions();
    for (const position of positions) {
      if (position.unrealizedPnL) {
        unrealizedPnL += position.unrealizedPnL;
      }
    }

    totalNAV += unrealizedPnL;

    const result: NAVCalculation = {
      totalNAV,
      walletBreakdown,
      unrealizedPnL,
      lastUpdated: Date.now(),
    };

    // Cache the result
    this.navCache = result;
    this.navCacheTime = Date.now();

    return result;
  }

  /**
   * Format allocation vector with metadata
   * Requirement 10.3: Implement allocation vector formatting
   *
   * @param allocation - Raw allocation vector
   * @param equity - Current equity
   * @returns Formatted allocation data
   */
  formatAllocation(allocation: AllocationVector, equity: number) {
    return {
      vector: allocation,
      phaseEquity: {
        phase1: {
          weight: allocation.w1,
          equity: equity * allocation.w1,
          percentage: (allocation.w1 * 100).toFixed(2) + "%",
        },
        phase2: {
          weight: allocation.w2,
          equity: equity * allocation.w2,
          percentage: (allocation.w2 * 100).toFixed(2) + "%",
        },
        phase3: {
          weight: allocation.w3,
          equity: equity * allocation.w3,
          percentage: (allocation.w3 * 100).toFixed(2) + "%",
        },
      },
      totalEquity: equity,
      lastUpdated: allocation.timestamp,
    };
  }

  /**
   * Calculate phase equity for each phase
   * Requirement 10.4: Implement phase equity calculation
   *
   * @param allocation - Allocation vector
   * @param equity - Total equity
   * @returns Phase equity breakdown
   */
  calculatePhaseEquity(
    allocation: AllocationVector,
    equity: number,
  ): Record<PhaseId, number> {
    return {
      phase1: equity * allocation.w1,
      phase2: equity * allocation.w2,
      phase3: equity * allocation.w3,
    };
  }

  /**
   * Aggregate risk metrics with additional calculations
   * Requirement 10.5: Implement risk metrics aggregation
   *
   * @param positions - Current positions
   * @returns Aggregated risk metrics
   */
  async aggregateRiskMetrics(positions: Position[]) {
    // Get risk metrics from the brain's internal risk guardian
    // Since we don't have direct access, we'll calculate them here
    const baseMetrics: RiskMetrics = {
      currentLeverage: 0,
      projectedLeverage: 0,
      correlation: 0,
      portfolioDelta: 0,
      portfolioBeta: 0,
    };

    // Calculate additional metrics
    const positionCount = positions.length;
    const totalNotional = positions.reduce(
      (sum, pos) => sum + Math.abs(pos.size),
      0,
    );
    const totalUnrealizedPnL = positions.reduce(
      (sum, pos) => sum + (pos.unrealizedPnL ?? 0),
      0,
    );

    // Calculate correlation matrix for all positions
    const correlations: Record<string, Record<string, number>> = {};
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const symbolA = positions[i].symbol;
        const symbolB = positions[j].symbol;

        if (!correlations[symbolA]) correlations[symbolA] = {};
        if (!correlations[symbolB]) correlations[symbolB] = {};

        // For now, use a placeholder correlation calculation
        // In a real implementation, this would access the risk guardian's correlation data
        const correlation = 0.5;
        correlations[symbolA][symbolB] = correlation;
        correlations[symbolB][symbolA] = correlation;
      }
    }

    return {
      ...baseMetrics,
      positionCount,
      totalNotional,
      totalUnrealizedPnL,
      correlationMatrix: correlations,
      riskScore: this.calculateRiskScore(
        baseMetrics,
        positionCount,
        totalNotional,
      ),
    };
  }

  /**
   * Aggregate treasury status with additional metrics
   * Requirement 10.6: Implement treasury status aggregation
   *
   * @returns Enhanced treasury status
   */
  async aggregateTreasuryStatus() {
    const treasury = await this.brain.getTreasuryStatus();
    const nextSweepLevel = this.brain.getNextSweepTriggerLevel();
    const totalSwept = this.brain.getTotalSwept();
    const highWatermark = this.brain.getHighWatermark();

    // Calculate additional metrics
    const currentEquity = this.brain.getEquity();
    const totalEquity = treasury.futuresWallet + treasury.spotWallet;
    const drawdownFromHigh = highWatermark > 0
      ? (highWatermark - currentEquity) / highWatermark
      : 0;
    const sweepProgress = nextSweepLevel > 0
      ? Math.min(treasury.futuresWallet / nextSweepLevel, 1)
      : 0;

    return {
      ...treasury,
      nextSweepTriggerLevel: nextSweepLevel,
      totalSwept,
      highWatermark,
      drawdownFromHigh,
      sweepProgress,
      riskCapitalRatio: totalEquity > 0
        ? treasury.riskCapital / totalEquity
        : 0,
      lockedProfitRatio: totalEquity > 0
        ? treasury.lockedProfit / totalEquity
        : 0,
    };
  }

  /**
   * Retrieve recent decisions with filtering
   * Requirement 10.7: Implement recent decisions retrieval
   *
   * @param limit - Maximum number of decisions
   * @param phaseFilter - Optional phase filter
   * @returns Recent decisions with metadata
   */
  async getRecentDecisions(
    limit: number = this.config.maxRecentDecisions,
    phaseFilter?: PhaseId,
  ) {
    let decisions = this.brain.getRecentDecisions(limit);

    // Apply phase filter if specified
    if (phaseFilter) {
      decisions = decisions.filter((d) =>
        d.allocation && this.getPhaseFromDecision(d) === phaseFilter
      );
    }

    // Add metadata to each decision
    const enhancedDecisions = decisions.map((decision) => ({
      ...decision,
      processingTime: this.estimateProcessingTime(decision),
      riskLevel: this.calculateDecisionRiskLevel(decision),
      impactScore: this.calculateImpactScore(decision),
    }));

    return {
      decisions: enhancedDecisions,
      summary: {
        total: enhancedDecisions.length,
        approved: enhancedDecisions.filter((d) => d.approved).length,
        rejected: enhancedDecisions.filter((d) => !d.approved).length,
        approvalRate: enhancedDecisions.length > 0
          ? enhancedDecisions.filter((d) => d.approved).length /
            enhancedDecisions.length
          : 0,
      },
    };
  }

  /**
   * Get comprehensive dashboard data
   * Aggregates all dashboard components
   *
   * @returns Extended dashboard data
   */
  async getDashboardData(): Promise<ExtendedDashboardData> {
    // Check cache
    if (
      this.dashboardCache &&
      Date.now() - this.dashboardCacheTime < this.config.cacheTTL
    ) {
      return this.dashboardCache;
    }

    // Get base dashboard data from brain
    const baseDashboard = await this.brain.getDashboardData();

    // Calculate NAV
    const navCalculation = await this.calculateNAV();

    // Get enhanced metrics
    const phasePerformance = await this.brain.getAllPhasePerformance();
    const approvalRates = this.brain.getAllApprovalRates();
    const enhancedTreasury = await this.aggregateTreasuryStatus();
    const enhancedDecisions = await this.getRecentDecisions();

    // Calculate additional metrics
    const positions = this.brain.getPositions();
    const positionsSummary = {
      count: positions.length,
      totalNotional: positions.reduce(
        (sum, pos) => sum + Math.abs(pos.size),
        0,
      ),
      totalUnrealizedPnL: positions.reduce(
        (sum, pos) => sum + (pos.unrealizedPnL ?? 0),
        0,
      ),
    };

    // Calculate time since last profitable trade
    const timeSinceLastProfit = await this.getTimeSinceLastProfit();

    const extendedData: ExtendedDashboardData = {
      ...baseDashboard,
      nav: navCalculation.totalNAV,
      version: this.config.version,
      uptime: Date.now() - this.startTime,
      phasePerformance,
      approvalRates,
      nextSweepTriggerLevel: enhancedTreasury.nextSweepTriggerLevel,
      totalSwept: enhancedTreasury.totalSwept,
      highWatermark: enhancedTreasury.highWatermark,
      drawdownFromHigh: enhancedTreasury.drawdownFromHigh,
      timeSinceLastProfit,
      positionsSummary,
      treasury: enhancedTreasury,
      recentDecisions: enhancedDecisions.decisions,
    };

    // Cache the result
    this.dashboardCache = extendedData;
    this.dashboardCacheTime = Date.now();

    return extendedData;
  }

  /**
   * Export dashboard data to JSON with metadata
   * Requirement 10.8: Create export endpoint for dashboard data
   *
   * @returns JSON string with timestamp and version metadata
   */
  async exportDashboardJSON(): Promise<string> {
    const dashboardData = await this.getDashboardData();

    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        version: this.config.version,
        source: "titan-brain-dashboard-service",
      },
      data: dashboardData,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.dashboardCache = null;
    this.dashboardCacheTime = 0;
    this.navCache = null;
    this.navCacheTime = 0;
  }

  /**
   * Get cache status
   */
  getCacheStatus() {
    return {
      dashboard: {
        cached: this.dashboardCache !== null,
        age: this.dashboardCache ? Date.now() - this.dashboardCacheTime : 0,
        ttl: this.config.cacheTTL,
      },
      nav: {
        cached: this.navCache !== null,
        age: this.navCache ? Date.now() - this.navCacheTime : 0,
        ttl: this.config.navCacheTTL,
      },
    };
  }

  // ============ Private Helper Methods ============

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(
    metrics: RiskMetrics,
    positionCount: number,
    totalNotional: number,
  ): number {
    // Simple risk scoring algorithm (0-100)
    let score = 0;

    // Leverage component (0-40 points)
    score += Math.min(metrics.currentLeverage * 2, 40);

    // Correlation component (0-30 points)
    score += metrics.correlation * 30;

    // Position count component (0-20 points)
    score += Math.min(positionCount * 2, 20);

    // Notional size component (0-10 points)
    const equity = this.brain.getEquity();
    if (equity > 0) {
      const notionalRatio = totalNotional / equity;
      score += Math.min(notionalRatio * 5, 10);
    }

    return Math.min(score, 100);
  }

  /**
   * Get phase from decision (helper method)
   */
  private getPhaseFromDecision(decision: BrainDecision): PhaseId | null {
    // This would need to be implemented based on how phase info is stored in decisions
    // For now, return null as we don't have this info in the current structure
    return null;
  }

  /**
   * Estimate processing time for a decision
   */
  private estimateProcessingTime(decision: BrainDecision): number {
    // Simple estimation based on decision complexity
    let baseTime = 10; // Base 10ms

    if (decision.risk.riskMetrics) {
      baseTime += 20; // Risk calculation overhead
    }

    if (!decision.approved) {
      baseTime += 5; // Veto processing
    }

    return baseTime;
  }

  /**
   * Calculate risk level for a decision
   */
  private calculateDecisionRiskLevel(
    decision: BrainDecision,
  ): "low" | "medium" | "high" {
    if (!decision.risk.riskMetrics) return "low";

    const leverage = decision.risk.riskMetrics.currentLeverage;
    const correlation = decision.risk.riskMetrics.correlation;

    if (leverage > 10 || correlation > 0.8) return "high";
    if (leverage > 5 || correlation > 0.6) return "medium";
    return "low";
  }

  /**
   * Calculate impact score for a decision
   */
  private calculateImpactScore(decision: BrainDecision): number {
    if (!decision.approved) return 0;

    const equity = this.brain.getEquity();
    if (equity === 0) return 0;

    return (decision.authorizedSize / equity) * 100;
  }

  /**
   * Get time since last profitable trade
   */
  private async getTimeSinceLastProfit(): Promise<number | null> {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `SELECT MAX(timestamp) as last_profit_time 
         FROM phase_performance 
         WHERE pnl > 0 
         ORDER BY timestamp DESC 
         LIMIT 1`,
      );

      if (result.rows.length > 0 && result.rows[0].last_profit_time) {
        return Date.now() - result.rows[0].last_profit_time;
      }
    } catch (error) {
      console.error("Error fetching last profit time:", error);
    }

    return null;
  }
}
