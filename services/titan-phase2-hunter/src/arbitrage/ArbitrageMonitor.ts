import { ArbitrageConfig, ArbitrageOpportunity, PriceSpread } from '../types';
import { getLogger } from '../logging/Logger';

interface ExchangePrice {
  symbol: string;
  exchange: string;
  bid: number;
  ask: number;
  timestamp: Date;
}

export class ArbitrageMonitor {
  private prices: Map<string, Map<string, ExchangePrice>> = new Map(); // Symbol -> Exchange -> Price
  private config: ArbitrageConfig;
  private spreadHistory: Map<string, number> = new Map(); // Key -> StartTime (timestamp)

  constructor(config: ArbitrageConfig) {
    this.config = config;
  }

  public updatePrice(update: ExchangePrice): ArbitrageOpportunity[] {
    if (!this.prices.has(update.symbol)) {
      this.prices.set(update.symbol, new Map());
    }
    this.prices.get(update.symbol)!.set(update.exchange, update);

    return this.checkArbitrage(update.symbol);
  }

  private checkArbitrage(symbol: string): ArbitrageOpportunity[] {
    const exchangePrices = this.prices.get(symbol);
    if (!exchangePrices || exchangePrices.size < 2) return [];

    const opportunities: ArbitrageOpportunity[] = [];
    const exchanges = Array.from(exchangePrices.values());

    // Compare every pair
    for (let i = 0; i < exchanges.length; i++) {
      for (let j = 0; j < exchanges.length; j++) {
        if (i === j) continue;

        const exA = exchanges[i];
        const exB = exchanges[j];

        // Check for Buy A / Sell B opportunity
        // We buy at Ask on A, Sell at Bid on B
        // Profit if Bid_B > Ask_A
        const spread = exB.bid - exA.ask;

        // Only consider positive spreads for arbitrage
        if (spread > 0) {
          const spreadPercentage = (spread / exA.ask) * 100;

          if (spreadPercentage >= this.config.minSpreadPercentage) {
            const opportunity: ArbitrageOpportunity = {
              symbol: symbol,
              buyExchange: exA.exchange,
              sellExchange: exB.exchange,
              buyPrice: exA.ask,
              sellPrice: exB.bid,
              spread: spread,
              spreadPercentage: spreadPercentage,
              timestamp: new Date(),
            };

            opportunities.push(opportunity);

            getLogger().info('Arbitrage Opportunity Detected', {
              symbol,
              spread: spread.toFixed(2),
              percentage: spreadPercentage.toFixed(2) + '%',
              buy: { exchange: exA.exchange, price: exA.ask },
              sell: { exchange: exB.exchange, price: exB.bid },
              timestamp: opportunity.timestamp,
            });
          }
        }
      }
    }

    return opportunities;
  }

  // Helper to get raw spreads for monitoring/logging (even negative ones)
  public getSpreads(symbol: string): PriceSpread[] {
    const exchangePrices = this.prices.get(symbol);
    if (!exchangePrices || exchangePrices.size < 2) return [];

    const spreads: PriceSpread[] = [];
    const exchanges = Array.from(exchangePrices.values());

    for (let i = 0; i < exchanges.length; i++) {
      for (let j = i + 1; j < exchanges.length; j++) {
        const exA = exchanges[i];
        const exB = exchanges[j];

        // Simple mid-price spread for general monitoring
        const midA = (exA.bid + exA.ask) / 2;
        const midB = (exB.bid + exB.ask) / 2;
        const spread = midA - midB;
        const spreadPercentage = (spread / midB) * 100;

        const spreadData: PriceSpread = {
          symbol: symbol,
          exchangeA: exA.exchange,
          exchangeB: exB.exchange,
          priceA: midA,
          priceB: midB,
          spread: spread,
          spreadPercentage: spreadPercentage,
          timestamp: new Date(),
        };
        spreads.push(spreadData);

        // Log significant spreads (e.g. > 0.1% or < -0.1%)
        if (Math.abs(spreadPercentage) > 0.1) {
          getLogger().debug('Cross-Exchange Spread Update', {
            symbol,
            spread: spread.toFixed(2),
            percentage: spreadPercentage.toFixed(3) + '%',
            exchangeA: exA.exchange,
            exchangeB: exB.exchange,
          });
        }
      }
    }
    return spreads;
  }
}
