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

    // 2. Get detailed margin state
    // We use the first gateway as primary for collateral check in this phase
    const exchangeName = symbol.split('-')[1];
    const primaryGateway = this.gateways[exchangeName] || Object.values(this.gateways)[0];
    
    // Default to a safe fallback if gateway fails, but try to get real balance
    // eslint-disable-next-line functional/no-let
    let collateral = 100000;
    try {
      if (primaryGateway) {
         collateral = await primaryGateway.getBalance('USDT');
      }
    } catch (err) {
      console.error(`Failed to fetch balance for ${symbol}:`, err);
    }

    const marginUtil = 0.15; // Still mocked until simple margin calc is added
    const unrealizedPnL = position.unrealizedPnL;

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
