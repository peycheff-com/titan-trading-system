import type { IExchangeGateway } from '../exchanges/interfaces.js';
import { PositionTracker } from './PositionTracker.js';
import { TransferManager } from './TransferManager.js';
import { Rebalancer } from './Rebalancer.js';
import { DEFAULT_MARGIN_THRESHOLDS, type HealthReport } from '../types/portfolio.js';

export class PortfolioManager {
  private tracker: PositionTracker;
  private transferManager: TransferManager;
  private rebalancer: Rebalancer;
  private gateways: Record<string, IExchangeGateway>;

  constructor(gateways: Record<string, IExchangeGateway>) {
    this.gateways = gateways;
    this.tracker = new PositionTracker(gateways);
    // Transfer manager might need refactor too, but passing first for now or mocking
    const firstGateway = Object.values(gateways)[0];
    if (!firstGateway) {
      throw new Error('PortfolioManager requires at least one gateway');
    }

    this.transferManager = new TransferManager(firstGateway);
    this.rebalancer = new Rebalancer(DEFAULT_MARGIN_THRESHOLDS);
  }

  getHealthReport(): HealthReport {
    return this.tracker.getHealthReport();
  }

  async initialize(): Promise<void> {
    for (const g of Object.values(this.gateways)) {
      await g.initialize();
    }
  }

  async update(symbol: string): Promise<HealthReport> {
    // 1. Update Tracker
    const position = await this.tracker.updatePosition(symbol);

    // 2. Get detailed margin state (Mocking real exchange data for now)
    // In production: await this.gateways[exchange].getAccountInfo()
    const marginUtil = 0.15; // Mock safe utilization
    const unrealizedPnL = position.unrealizedPnL;
    const collateral = 100000; // Mock collateral

    // 3. Check for Rebalancing
    const rebalanceAction = this.rebalancer.evaluate(symbol, marginUtil, unrealizedPnL, collateral);

    if (rebalanceAction) {
      console.log(`⚖️ Rebalance Triggered: ${rebalanceAction.action}`);

      // Execute Transfer via TransferManager
      try {
        if (rebalanceAction.action === 'TIER1' || rebalanceAction.action === 'TIER2') {
          await this.transferManager.executeTopUp(symbol, rebalanceAction.amountTransferred);
        } else if (
          rebalanceAction.action === 'COMPOUND' ||
          rebalanceAction.action === 'HARD_COMPOUND'
        ) {
          // Logic for withdrawal/compounding would go here
          console.log('Compounding not yet implemented in TransferManager');
        }
      } catch (error) {
        console.error(`❌ Rebalance Failed: ${error}`);
      }
    }

    return this.tracker.getHealthReport();
  }

  /**
   * Called by SentinelCore loop
   */
  async checkHealth(): Promise<HealthReport> {
    return this.tracker.getHealthReport();
  }

  getTracker(): PositionTracker {
    return this.tracker;
  }
}
