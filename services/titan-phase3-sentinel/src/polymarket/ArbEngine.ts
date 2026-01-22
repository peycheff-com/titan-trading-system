import { Market } from './PolymarketClient.js';

export interface ArbSignal {
  marketId: string;
  outcomeId: string;
  token: string;
  type: 'DISLOCATION' | 'ARBITRAGE' | 'HIGH_CONVICTION';
  price: number;
  estimatedFullValue: number;
  confidence: number; // 0-1
  timestamp: number;
}

export class ArbEngine {
  constructor() {}

  /**
   * Evaluate market for trading opportunities
   * Strategies:
   * 1. Mutual Exclusivity Arb: Sum of all outcome prices < 0.99 (Buy all)
   * 2. Price Dislocation: Price implies probability significantly different from external models (Placeholder here)
   * 3. High Volume/High Prob: Momentum play
   */
  public evaluate(market: Market): ArbSignal[] {
    const signals: ArbSignal[] = [];

    // 1. Check for Sum of Prices < 1.0 (Risk-Free Arb)
    // Note: active book checking required for real execution, here we use last/mid prices
    // eslint-disable-next-line functional/no-let
    let totalImpliedProb = 0;
    const prices: { id: string; price: number }[] = [];

    for (const token of market.tokens) {
      // Use last traded price as proxy if orderbook not deep
      const price = token.price || 0;
      totalImpliedProb += price;
      // eslint-disable-next-line functional/immutable-data
      prices.push({ id: token.tokenId, price });
    }

    // Strategy 1: Naive Arb (Sum of Prices)
    // If probability sum is < 0.98, buying all outcomes yields theoretical profit
    if (totalImpliedProb > 0 && totalImpliedProb < 0.98) {
      // eslint-disable-next-line functional/immutable-data
      signals.push({
        marketId: market.id,
        outcomeId: 'ALL',
        token: 'ALL',
        type: 'ARBITRAGE',
        price: totalImpliedProb,
        estimatedFullValue: 1.0,
        confidence: 1.0,
        timestamp: Date.now(),
      });
    }

    // Strategy 2: High Conviction / Momentum
    // If volume is high and one outcome is > 90%, it often trends to 100%
    if (parseFloat(market.volume) > 50000) {
      for (const token of market.tokens) {
        if (token.price > 0.92 && token.price < 0.98) {
          // eslint-disable-next-line functional/immutable-data
          signals.push({
            marketId: market.id,
            outcomeId: token.outcomeId,
            token: token.tokenId,
            type: 'HIGH_CONVICTION',
            price: token.price,
            estimatedFullValue: 1.0,
            confidence: 0.8,
            timestamp: Date.now(),
          });
        }
      }
    }

    return signals;
  }
}
