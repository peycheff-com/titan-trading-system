import { Tripwire } from "../types/index.js";
import { PolymarketClient } from "../exchanges/PolymarketClient.js";
import { BinanceSpotClient } from "../exchanges/BinanceSpotClient.js";

export class PredictionMarketDetector {
  private client: PolymarketClient;
  private binanceClient: BinanceSpotClient;
  private history: Map<string, { price: number; time: number }[]> = new Map();

  constructor(client: PolymarketClient, binanceClient: BinanceSpotClient) {
    this.client = client;
    this.binanceClient = binanceClient;
  }

  /**
   * Scan for Probability Spikes vs Price Lag
   *
   * Strategy:
   * 1. Check "Will BTC hit $X today?" markets.
   * 2. If Probability(YES) spikes > 15% in 5 mins
   * 3. AND Spot Price has moved < 0.5%
   * 4. SET TRAP: Expect Spot to catch up to Prediction.
   */
  async scan(): Promise<Tripwire[]> {
    const tripwires: Tripwire[] = [];
    const markets = await this.client.getBTCMarkets();
    const currentPrice = await this.binanceClient.getSpotPrice("BTCUSDT");

    for (const market of markets) {
      // Logic: Parse question to find target price
      // "Will Bitcoin hit $100,000 by January 10?"
      const targetMatch = market.question.match(/\$([\d,]+)/);
      if (!targetMatch) continue;

      const targetPrice = parseFloat(targetMatch[1].replace(/,/g, ""));
      const yesPrice = parseFloat(market.outcomePrices[0]); // Assuming index 0 is YES (simplified)

      // Track history
      this.recordHistory(market.id, yesPrice);

      // Detect Spike
      const spike = this.detectSpike(market.id, yesPrice);
      if (spike > 0.15) {
        // 15% probability jump
        // Check Spot Lag
        // If Target > Current (Bullish Bet) -> We want Long
        // If Spot hasn't pumped yet, it's alpha.
        const distanceToTarget = (targetPrice - currentPrice) / currentPrice;

        // Arbitrary filter: Target must be close enough to be relevant (< 5% away)
        if (distanceToTarget > 0 && distanceToTarget < 0.05) {
          console.log(
            `🔮 ORACLE SPIKE: ${market.question} (Prob: ${
              (yesPrice * 100).toFixed(
                0,
              )
            }%, +${(spike * 100).toFixed(0)}%)`,
          );

          tripwires.push({
            symbol: "BTCUSDT",
            triggerPrice: currentPrice, // Trigger NOW (Market/Aggressive)
            direction: "LONG",
            trapType: "PREDICTION_SPIKE", // New Type
            confidence: 85, // High confidence due to Oracle
            leverage: 15,
            estimatedCascadeSize: distanceToTarget,
            activated: false,
            targetPrice: targetPrice,
            stopLoss: currentPrice * 0.99,
          });
        }
      }
    }

    return tripwires;
  }

  private recordHistory(id: string, price: number) {
    if (!this.history.has(id)) {
      this.history.set(id, []);
    }
    const arr = this.history.get(id)!;
    arr.push({ price, time: Date.now() });

    // Prune > 10 min
    const cutoff = Date.now() - 600000;
    this.history.set(
      id,
      arr.filter((x) => x.time > cutoff),
    );
  }

  private detectSpike(id: string, currentPrice: number): number {
    const arr = this.history.get(id);
    if (!arr || arr.length < 2) return 0;

    // Compare with 5 mins ago
    const fiveMinAgo = arr.find((x) => Date.now() - x.time >= 300000);
    if (!fiveMinAgo) return 0;

    return currentPrice - fiveMinAgo.price;
  }
}
