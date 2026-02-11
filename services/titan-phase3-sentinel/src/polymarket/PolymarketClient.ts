import { fetch } from 'undici';

export interface PolymarketConfig {
  apiKey?: string; // Optional for public data
  apiPassphrase?: string;
  apiSecret?: string;
  bstChainId?: number; // 137 for Polygon
}

export interface Market {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  resolutionSource: string;
  endDate: string;
  liquidity: string;
  volume: string;
  active: boolean;
  closed: boolean;
  marketMakerAddress: string;
  tokens: {
    tokenId: string;
    outcomeId: string;
    price: number;
    winner: boolean;
  }[];
}

export interface Orderbook {
  market: string;
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  timestamp: string;
}

export class PolymarketClient {
  private baseUrl: string;
  private gammaUrl: string;

  constructor(private config: PolymarketConfig = {}) {
    this.baseUrl = 'https://clob.polymarket.com'; // CLOB API
    this.gammaUrl = 'https://gamma-api.polymarket.com'; // Gamma Markets API
  }

  /**
   * Fetch active markets from Gamma API
   */
  async getMarkets(limit: number = 20, offset: number = 0): Promise<Market[]> {
    const url = `${this.gammaUrl}/markets?active=true&closed=false&limit=${limit}&offset=${offset}&order=volume&ascending=false`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.statusText}`);
      }
       
      const data = (await response.json()) as any[];

      // Map to our Interface
      return data.map((m) => ({
        id: m.id,
        question: m.question,
        conditionId: m.conditionId,
        slug: m.slug,
        resolutionSource: m.resolutionSource,
        endDate: m.endDate,
        liquidity: m.liquidity,
        volume: m.volume,
        active: m.active,
        closed: m.closed,
        marketMakerAddress: m.marketMakerAddress,
        tokens: m.tokens || [],
      }));
    } catch (error) {
      console.error('Failed to fetch markets:', error);
      throw error;
    }
  }

  /**
   * Get Orderbook for a specific Token ID (Outcome)
   * Uses CLOB API
   */
  async getOrderbook(tokenId: string): Promise<Orderbook> {
    const url = `${this.baseUrl}/book?token_id=${tokenId}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        // 404 means no orderbook / inactive
        if (response.status === 404) {
          return {
            market: tokenId,
            bids: [],
            asks: [],
            timestamp: new Date().toISOString(),
          };
        }
        throw new Error(`CLOB API error: ${response.statusText}`);
      }
       
      const data = (await response.json()) as any;
      return {
        market: tokenId,
        bids: data.bids || [],
        asks: data.asks || [],
        timestamp: new Date().toISOString(), // API doesn't always return ts, so we add it
      };
    } catch (error) {
      console.error(`Failed to fetch orderbook for ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Get Mid Price for a Token
   */
  async getMidPrice(tokenId: string): Promise<number | null> {
    const book = await this.getOrderbook(tokenId);
    if (book.bids.length === 0 || book.asks.length === 0) return null;

    const bestBid = parseFloat(book.bids[0].price);
    const bestAsk = parseFloat(book.asks[0].price);

    return (bestBid + bestAsk) / 2;
  }
}
