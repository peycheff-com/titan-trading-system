import type {
    HealthReport,
    Position,
    RiskStatusLevel,
} from "../types/portfolio.js";
import type { IExchangeGateway } from "../exchanges/interfaces.js";

/**
 * Tracks portfolio positions and aggregates health metrics.
 */
export class PositionTracker {
    private gateways: Record<string, IExchangeGateway>;
    private positions: Map<string, Position> = new Map();

    constructor(gateways: Record<string, IExchangeGateway>) {
        this.gateways = gateways;
    }

    /**
     * Updates position data from exchange.
     */
    async updatePosition(symbol: string): Promise<Position> {
        // Simple aggregate price logic for now: use first available
        let currentPrice = 0;
        for (const g of Object.values(this.gateways)) {
            try {
                const p = await g.getPrice(symbol);
                if (p > 0) {
                    currentPrice = p;
                    break;
                }
            } catch (e) {}
        }

        let pos = this.positions.get(symbol);
        if (!pos) {
            pos = {
                symbol,
                spotSize: 0,
                perpSize: 0,
                spotEntry: 0,
                perpEntry: 0,
                entryBasis: 0,
                currentBasis: 0,
                unrealizedPnL: 0,
                type: "CORE",
            };
        }

        // Update basis and PnL
        // Simulating Mark Prices for Spot and Perp
        // This is a simplification. Real implementation needs separate Spot/Mark feeds.
        const spotPrice = currentPrice;
        const perpPrice = currentPrice; // Identifying they are close for now

        pos.currentBasis = (perpPrice - spotPrice) / spotPrice;

        // Calc PnL: (Spot Value - Cost) + (Perp Value - Cost)
        const spotVal = pos.spotSize * spotPrice;
        const spotCost = pos.spotSize * pos.spotEntry;

        const perpVal = pos.perpSize * perpPrice; // Not exactly, Perp PnL is (Price - Entry) * Size
        const perpPnL = pos.perpSize * (perpPrice - pos.perpEntry);

        pos.unrealizedPnL = (spotVal - spotCost) + perpPnL;

        this.positions.set(symbol, pos);
        return pos;
    }

    /**
     * Manually update position size (e.g. after execution)
     */
    updateSize(
        symbol: string,
        spotDelta: number,
        perpDelta: number,
        price: number,
    ): void {
        let pos = this.positions.get(symbol);
        if (!pos) {
            pos = {
                symbol,
                spotSize: 0,
                perpSize: 0,
                spotEntry: 0, // Will be updated
                perpEntry: 0,
                entryBasis: 0,
                currentBasis: 0,
                unrealizedPnL: 0,
                type: "CORE",
            };
        }

        // Update Weighted Average Entry Price?
        if (spotDelta !== 0) {
            const totalVal = (pos.spotSize * pos.spotEntry) +
                (spotDelta * price);
            pos.spotSize += spotDelta;
            pos.spotEntry = pos.spotSize !== 0 ? totalVal / pos.spotSize : 0;
        }

        if (perpDelta !== 0) {
            const totalVal = (pos.perpSize * pos.perpEntry) +
                (perpDelta * price);
            pos.perpSize += perpDelta;
            pos.perpEntry = pos.perpSize !== 0 ? totalVal / pos.perpSize : 0;
        }

        this.positions.set(symbol, pos);
    }

    getHealthReport(): HealthReport {
        let totalNav = 0; // Needs balance from gateway too?
        let totalDelta = 0;

        // Sum PnL and active exposure
        for (const pos of this.positions.values()) {
            totalNav += pos.unrealizedPnL;
            // Delta = Spot + Perp. Theoretically neutral if hedged.
            totalDelta += (pos.spotSize + pos.perpSize) * pos.spotEntry; // Approx USD delta
        }

        // Add CASH balance (todo)

        return {
            nav: totalNav,
            delta: totalDelta,
            marginUtilization: 0, // Placeholder
            riskStatus: "HEALTHY",
            positions: Array.from(this.positions.values()),
            alerts: [],
        };
    }
}
