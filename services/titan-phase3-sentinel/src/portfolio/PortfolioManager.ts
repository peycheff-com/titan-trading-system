import type { IExchangeGateway } from "../exchanges/interfaces.js";
import { PositionTracker } from "./PositionTracker.js";
import { TransferManager } from "./TransferManager.js";
import { Rebalancer } from "./Rebalancer.js";
import {
    DEFAULT_MARGIN_THRESHOLDS,
    type HealthReport,
} from "../types/portfolio.js";

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
            throw new Error("PortfolioManager requires at least one gateway");
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
        await this.tracker.updatePosition(symbol);

        // Check rebalance logic?
        // In real flow, we get full account status to calc utilization.
        // For now, simple pass-through.

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
