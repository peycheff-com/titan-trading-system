import type { IExchangeGateway } from '../exchanges/interfaces.js';

export interface CostEstimate {
  exchange: string;
  price: number;
  feeAmount: number;
  totalCost: number; // For BUY: price * size + fees. For SELL: fee deduction?
  // Actually usually denominated in quote.
  // Net cash flow.
  // BUY: Outflow = (price * size) + fees
  // SELL: Inflow = (price * size) - fees
  effectivePrice: number; // Including fees
}

/**
 * Calculates trading costs
 */
export class CostCalculator {
  // Simple fixed fee model for now
  private fees: Map<string, number>; // exchange -> fee rate (e.g. 0.001)

  constructor(fees: Record<string, number>) {
    this.fees = new Map(Object.entries(fees));
  }

  calculateCost(exchange: string, side: 'BUY' | 'SELL', price: number, size: number): CostEstimate {
    const feeRate = this.fees.get(exchange) || 0.001; // Default 10bps
    const notional = price * size;
    const feeAmount = notional * feeRate;

    // eslint-disable-next-line functional/no-let
    let totalCost: number;
    // eslint-disable-next-line functional/no-let
    let effectivePrice: number;

    if (side === 'BUY') {
      totalCost = notional + feeAmount; // Paying this much
      effectivePrice = totalCost / size;
    } else {
      totalCost = notional - feeAmount; // Receiving this much
      effectivePrice = totalCost / size;
    }

    return {
      exchange,
      price,
      feeAmount,
      totalCost,
      effectivePrice,
    };
  }
}
