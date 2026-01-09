import type { IExchangeGateway } from "../exchanges/interfaces.js";

export interface PriceQuote {
    exchange: string;
    symbol: string;
    price: number;
    timestamp: number;
}

/**
 * Monitors prices across multiple exchanges
 */
export class PriceMonitor {
    private gateways: Map<string, IExchangeGateway>;

    constructor(gateways: Record<string, IExchangeGateway>) {
        this.gateways = new Map(Object.entries(gateways));
    }

    /**
     * Get best price for a symbol and side
     * BUY: Lowest price required
     * SELL: Highest price required
     */
    async getBestPrice(
        symbol: string,
        side: "BUY" | "SELL",
    ): Promise<PriceQuote | null> {
        const quotes = await this.getAllPrices(symbol);
        if (quotes.length === 0) return null;

        return quotes.reduce((best, current) => {
            if (side === "BUY") {
                return current.price < best.price ? current : best;
            } else {
                return current.price > best.price ? current : best;
            }
        });
    }

    /**
     * Get all prices for a symbol
     */
    async getAllPrices(symbol: string): Promise<PriceQuote[]> {
        const promises = Array.from(this.gateways.entries()).map(
            async ([name, gateway]) => {
                try {
                    const price = await gateway.getPrice(symbol);
                    return {
                        exchange: name,
                        symbol,
                        price,
                        timestamp: Date.now(),
                    };
                } catch (e) {
                    process.stdout.write(
                        `[PriceMonitor] Error fetching ${name}: ${e}\n`,
                    );
                    return null;
                }
            },
        );

        const results = await Promise.all(promises);
        return results.filter((q): q is PriceQuote => q !== null);
    }
}
