export interface PolymarketMarket {
  id: string;
  question: string;
  outcomePrices: string[]; // JSON string array e.g. ["0.1", "0.9"]
  clobTokenIds: string[];
  volume: string;
  endDate: string;
}

export class PolymarketClient {
  private baseURL = 'https://gamma-api.polymarket.com';

  /**
   * Fetch active BTC markets from Polymarket
   */
  async getBTCMarkets(): Promise<PolymarketMarket[]> {
    try {
      const url = `${this.baseURL}/events?limit=20&active=true&closed=false&details=true&slug=crypto`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.statusText}`);
      }

      const rawData = (await response.json()) as any;
      const data: any[] = Array.isArray(rawData)
        ? rawData
        : rawData.events || rawData.markets || [];

      // Filter for BTC related markets manually for safety
      const markets = data.filter(
        (m: any) =>
          m.question &&
          (m.question.includes('Bitcoin') || m.question.includes('BTC')) &&
          m.question.includes('Price'),
      );

      return markets.map((m: any) => ({
        id: m.id,
        question: m.question,
        outcomePrices: JSON.parse(m.outcomePrices || '[]'),
        clobTokenIds: m.clobTokenIds,
        volume: m.volume,
        endDate: m.endDate,
      }));
    } catch (error) {
      console.error('Error fetching Polymarket data:', error);
      return [];
    }
  }

  /**
   * Get specific market details (for faster polling)
   */
  async getMarket(id: string): Promise<PolymarketMarket | null> {
    try {
      const response = await fetch(`${this.baseURL}/markets/${id}`);

      if (!response.ok) {
        return null;
      }

      const m: any = await response.json();
      return {
        id: m.id,
        question: m.question,
        outcomePrices: JSON.parse(m.outcomePrices || '[]'),
        clobTokenIds: m.clobTokenIds,
        volume: m.volume,
        endDate: m.endDate,
      };
    } catch (error) {
      return null;
    }
  }
}
