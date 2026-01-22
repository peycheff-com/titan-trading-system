import { BrainDecision, DashboardData, PhaseId, Position } from '../types/index.js';

export class BrainStateManager {
  private currentEquity: number = 0;
  private currentPositions: Position[] = [];
  private dailyStartEquity: number = 0;
  private recentDecisions: BrainDecision[] = [];
  private recentTrades: Array<{ pnl: number; timestamp: number }> = [];

  // Dashboard cache
  private dashboardCache: DashboardData | null = null;
  private dashboardCacheTime: number = 0;

  // Signal stats
  // Signal stats
  private signalStats: Record<PhaseId | 'manual', { approved: number; total: number }> = {
    phase1: { approved: 0, total: 0 },
    phase2: { approved: 0, total: 0 },
    phase3: { approved: 0, total: 0 },
    manual: { approved: 0, total: 0 },
  };

  private currentAllocation: {
    w1: number;
    w2: number;
    w3: number;
    timestamp: number;
  } | null = null;

  /**
   * Get current allocation
   */
  getAllocation() {
    return this.currentAllocation;
  }

  /**
   * Set current allocation
   */
  setAllocation(allocation: { w1: number; w2: number; w3: number; timestamp: number }): void {
    // eslint-disable-next-line functional/immutable-data
    this.currentAllocation = allocation;
    this.invalidateDashboardCache();
  }

  /**
   * Get current equity
   */
  getEquity(): number {
    return this.currentEquity;
  }

  /**
   * Set current equity
   */
  setEquity(equity: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.currentEquity = equity;
    this.invalidateDashboardCache();
  }

  /**
   * Update a single position in the state
   */
  updatePosition(position: Position): void {
    const index = this.currentPositions.findIndex((p) => p.symbol === position.symbol);
    if (index >= 0) {
      // eslint-disable-next-line functional/immutable-data
      this.currentPositions[index] = position;
    } else {
      // eslint-disable-next-line functional/immutable-data
      this.currentPositions.push(position);
    }
    this.invalidateDashboardCache();
  }

  /**
   * Get daily start equity
   */
  getDailyStartEquity(): number {
    return this.dailyStartEquity;
  }

  /**
   * Set daily start equity
   */
  setDailyStartEquity(equity: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.dailyStartEquity = equity;
  }

  /**
   * Get current positions
   */
  getPositions(): Position[] {
    return this.currentPositions;
  }

  /**
   * Set current positions
   */
  setPositions(positions: Position[]): void {
    // eslint-disable-next-line functional/immutable-data
    this.currentPositions = positions;
    this.invalidateDashboardCache();
  }

  /**
   * Add a decision to history
   */
  addDecision(decision: BrainDecision): void {
    // eslint-disable-next-line functional/immutable-data
    this.recentDecisions.unshift(decision);
    // Keep last 1000 decisions
    if (this.recentDecisions.length > 1000) {
      // eslint-disable-next-line functional/immutable-data
      this.recentDecisions = this.recentDecisions.slice(0, 1000);
    }

    // Update stats logic is handled separately via updateSignalStats
  }

  /**
   * Update signal stats
   */
  updateSignalStats(phaseId: PhaseId | 'manual', approved: boolean): void {
    if (!this.signalStats[phaseId]) {
      // Fallback or init if missing
      // eslint-disable-next-line functional/immutable-data
      this.signalStats[phaseId as PhaseId] = { approved: 0, total: 0 };
    }
    // eslint-disable-next-line functional/immutable-data
    this.signalStats[phaseId].total++;
    if (approved) {
      // eslint-disable-next-line functional/immutable-data
      this.signalStats[phaseId].approved++;
    }
    this.invalidateDashboardCache();
  }

  /**
   * Get recent decisions
   */
  getRecentDecisions(limit: number = 20): BrainDecision[] {
    return this.recentDecisions.slice(0, limit);
  }

  /**
   * Add a trade result
   */
  addTrade(pnl: number, timestamp: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.recentTrades.push({ pnl, timestamp });
    // Keep last 100
    if (this.recentTrades.length > 100) {
      // eslint-disable-next-line functional/immutable-data
      this.recentTrades.shift(); // Remove oldest
    }
  }

  /**
   * Get recent trades
   */
  getRecentTrades(): Array<{ pnl: number; timestamp: number }> {
    return this.recentTrades;
  }

  /**
   * Get signal stats
   */
  getSignalStats(): Record<PhaseId | 'manual', { approved: number; total: number }> {
    return this.signalStats;
  }

  /**
   * Dashboard Cache methods
   */
  getDashboardCache(): DashboardData | null {
    const CACHE_TTL = 1000; // 1 second
    if (this.dashboardCache && Date.now() - this.dashboardCacheTime < CACHE_TTL) {
      return this.dashboardCache;
    }
    return null;
  }

  setDashboardCache(data: DashboardData): void {
    // eslint-disable-next-line functional/immutable-data
    this.dashboardCache = data;
    // eslint-disable-next-line functional/immutable-data
    this.dashboardCacheTime = Date.now();
  }

  invalidateDashboardCache(): void {
    // eslint-disable-next-line functional/immutable-data
    this.dashboardCache = null;
  }
}
