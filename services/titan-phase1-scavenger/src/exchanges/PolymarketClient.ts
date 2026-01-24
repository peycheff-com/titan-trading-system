export interface PolymarketMarket {
  id: string;
  question: string;
  outcomePrices: string[]; // JSON string array e.g. ["0.1", "0.9"]
  clobTokenIds: string[];
  volume: string;
  endDate: string;
}

export class PolymarketClient {
  private baseURL = "https://gamma-api.polymarket.com";

  /**
   * Fetch active BTC markets from Polymarket
   */
  async getBTCMarkets(): Promise<PolymarketMarket[]> {
    try {
      const url =
        `${this.baseURL}/events?limit=20&active=true&closed=false&details=true&slug=crypto`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.statusText}`);
      }

      const rawData = (await response.json()) as
        | PolymarketMarket[]
        | { events: PolymarketMarket[] }
        | { markets: PolymarketMarket[] };
      const data: PolymarketMarket[] = Array.isArray(rawData)
        ? rawData
        : "events" in rawData
        ? rawData.events
        : "markets" in rawData
        ? rawData.markets
        : [];

      // Filter for BTC related markets manually for safety
      const markets = data.filter(
        (m) =>
          m.question &&
          (m.question.includes("Bitcoin") || m.question.includes("BTC")) &&
          m.question.includes("Price"),
      );

      return markets.map((m) => ({
        id: m.id,
        question: m.question,
        outcomePrices: typeof m.outcomePrices === "string"
          ? JSON.parse(m.outcomePrices)
          : m.outcomePrices, // Handle JSON string if needed
        clobTokenIds: m.clobTokenIds,
        volume: m.volume,
        endDate: m.endDate,
      }));
    } catch (error) {
      console.error("Error fetching Polymarket data:", error);
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

      const m = (await response.json()) as PolymarketMarket;
      return {
        id: m.id,
        question: m.question,
        outcomePrices: typeof m.outcomePrices === "string"
          ? JSON.parse(m.outcomePrices)
          : m.outcomePrices,
        clobTokenIds: m.clobTokenIds,
        volume: m.volume,
        endDate: m.endDate,
      };
    } catch (error) {
      return null;
    }
  }
}
