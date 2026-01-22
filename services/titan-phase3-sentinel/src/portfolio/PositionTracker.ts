import type { HealthReport, Position } from '../types/portfolio.js';
import type { IExchangeGateway } from '../exchanges/interfaces.js';

/**
 * Tracks portfolio positions and aggregates health metrics.
 */
export class PositionTracker {
  private gateways: Readonly<Record<string, IExchangeGateway>>;
  private positions: ReadonlyMap<string, Position> = new Map();

  constructor(gateways: Record<string, IExchangeGateway>) {
    this.gateways = gateways;
  }

  /**
   * Updates position data from exchange.
   */
  async updatePosition(symbol: string): Promise<Position> {
    // Simple aggregate price logic for now: use first available
    const getPrice = async (): Promise<number> => {
      for (const g of Object.values(this.gateways)) {
        try {
          const p = await g.getPrice(symbol);
          if (p > 0) return p;
        } catch {
          // ignore
        }
      }
      return 0;
    };

    const currentPrice = await getPrice();

    const existingPos = this.positions.get(symbol);
    const basePos: Position = existingPos || {
      symbol,
      spotSize: 0,
      perpSize: 0,
      spotEntry: 0,
      perpEntry: 0,
      entryBasis: 0,
      currentBasis: 0,
      unrealizedPnL: 0,
      type: 'CORE',
    };

    // Update basis and PnL
    const spotPrice = currentPrice;
    const perpPrice = currentPrice; // Identifying they are close for now

    const currentBasis = spotPrice > 0 ? (perpPrice - spotPrice) / spotPrice : 0;

    // Calc PnL: (Spot Value - Cost) + (Perp Value - Cost)
    const spotVal = basePos.spotSize * spotPrice;
    const spotCost = basePos.spotSize * basePos.spotEntry;

    const perpPnL = basePos.perpSize * (perpPrice - basePos.perpEntry);
    const unrealizedPnL = spotVal - spotCost + perpPnL;

    const newPos: Position = {
      ...basePos,
      currentBasis,
      unrealizedPnL,
    };

    // eslint-disable-next-line functional/immutable-data
    this.positions = new Map([...this.positions, [symbol, newPos]]);
    return newPos;
  }

  /**
   * Manually update position size (e.g. after execution)
   */
  updateSize(symbol: string, spotDelta: number, perpDelta: number, price: number): void {
    const existingPos = this.positions.get(symbol);
    const basePos: Position = existingPos || {
      symbol,
      spotSize: 0,
      perpSize: 0,
      spotEntry: 0,
      perpEntry: 0,
      entryBasis: 0,
      currentBasis: 0,
      unrealizedPnL: 0,
      type: 'CORE',
    };

    // Update Weighted Average Entry Price
    const newSpotSize = basePos.spotSize + spotDelta;
    const totalSpotVal = basePos.spotSize * basePos.spotEntry + spotDelta * price;
    const newSpotEntry = newSpotSize !== 0 ? totalSpotVal / newSpotSize : 0;

    const newPerpSize = basePos.perpSize + perpDelta;
    const totalPerpVal = basePos.perpSize * basePos.perpEntry + perpDelta * price;
    const newPerpEntry = newPerpSize !== 0 ? totalPerpVal / newPerpSize : 0;

    const newPos: Position = {
      ...basePos,
      spotSize: newSpotSize,
      spotEntry: newSpotEntry,
      perpSize: newPerpSize,
      perpEntry: newPerpEntry,
    };

    // eslint-disable-next-line functional/immutable-data
    this.positions = new Map([...this.positions, [symbol, newPos]]);
  }

  getHealthReport(): HealthReport {
    // Sum PnL and active exposure
    const { totalNav, totalDelta } = Array.from(this.positions.values()).reduce(
      (acc, pos) => ({
        totalNav: acc.totalNav + pos.unrealizedPnL,
        totalDelta: acc.totalDelta + (pos.spotSize + pos.perpSize) * pos.spotEntry,
      }),
      { totalNav: 0, totalDelta: 0 },
    );

    return {
      nav: totalNav,
      delta: totalDelta,
      marginUtilization: 0, // Placeholder
      riskStatus: 'HEALTHY',
      positions: Array.from(this.positions.values()),
      alerts: [],
    };
  }
}
