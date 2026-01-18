export class PolymarketClient {
    baseURL = "https://gamma-api.polymarket.com";
    /**
     * Fetch active BTC markets from Polymarket
     */
    async getBTCMarkets() {
        try {
            const url = `${this.baseURL}/events?limit=20&active=true&closed=false&details=true&slug=crypto`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Polymarket API error: ${response.statusText}`);
            }
            const rawData = await response.json();
            const data = Array.isArray(rawData)
                ? rawData
                : (rawData.events || rawData.markets || []);
            // Filter for BTC related markets manually for safety
            const markets = data.filter((m) => m.question &&
                (m.question.includes("Bitcoin") ||
                    m.question.includes("BTC")) &&
                m.question.includes("Price"));
            return markets.map((m) => ({
                id: m.id,
                question: m.question,
                outcomePrices: JSON.parse(m.outcomePrices || "[]"),
                clobTokenIds: m.clobTokenIds,
                volume: m.volume,
                endDate: m.endDate,
            }));
        }
        catch (error) {
            console.error("Error fetching Polymarket data:", error);
            return [];
        }
    }
    /**
     * Get specific market details (for faster polling)
     */
    async getMarket(id) {
        try {
            const response = await fetch(`${this.baseURL}/markets/${id}`);
            if (!response.ok) {
                return null;
            }
            const m = await response.json();
            return {
                id: m.id,
                question: m.question,
                outcomePrices: JSON.parse(m.outcomePrices || "[]"),
                clobTokenIds: m.clobTokenIds,
                volume: m.volume,
                endDate: m.endDate,
            };
        }
        catch (error) {
            return null;
        }
    }
}
//# sourceMappingURL=PolymarketClient.js.map