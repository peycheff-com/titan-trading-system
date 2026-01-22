/**
 * Order Flow Imbalance (OFI) Calculator
 *
 * Quantifies Microstructure Pressure using Level 1 changes.
 * OFI > 0 implies Buying Pressure
 * OFI < 0 implies Selling Pressure
 *
 * Formula:
 * e_t = I(P_bid,t >= P_bid,t-1) * q_bid,t - I(P_bid,t <= P_bid,t-1) * q_bid,t-1
 *       - (I(P_ask,t <= P_ask,t-1) * q_ask,t - I(P_ask,t >= P_ask,t-1) * q_ask,t-1)
 */
export class OrderFlowImbalanceCalculator {
  private lastBestBid: number = 0;
  private lastBestBidSize: number = 0;
  private lastBestAsk: number = 0;
  private lastBestAskSize: number = 0;
  private history: number[] = [];
  private readonly WINDOW_SIZE: number; // Keep last N updates for smoothing

  constructor(windowSize: number = 50) {
    this.WINDOW_SIZE = windowSize;
  }

  /**
   * Update State and Calculate micro-OFI
   * @param bestBid Current best bid price
   * @param bestBidSize Current best bid size
   * @param bestAsk Current best ask price
   * @param bestAskSize Current best ask size
   * @returns Instantaneous OFI value
   */
  update(bestBid: number, bestBidSize: number, bestAsk: number, bestAskSize: number): number {
    // Skip first tick
    if (this.lastBestBid === 0 || this.lastBestAsk === 0) {
      // eslint-disable-next-line functional/immutable-data
      this.lastBestBid = bestBid;
      // eslint-disable-next-line functional/immutable-data
      this.lastBestBidSize = bestBidSize;
      // eslint-disable-next-line functional/immutable-data
      this.lastBestAsk = bestAsk;
      // eslint-disable-next-line functional/immutable-data
      this.lastBestAskSize = bestAskSize;
      return 0;
    }

    // Calculate Bid OFI Contribution
    // eslint-disable-next-line functional/no-let
    let bidOfi = 0;
    if (bestBid > this.lastBestBid) {
      bidOfi = bestBidSize;
    } else if (bestBid < this.lastBestBid) {
      bidOfi = -this.lastBestBidSize;
    } else {
      bidOfi = bestBidSize - this.lastBestBidSize;
    }

    // Calculate Ask OFI Contribution
    // eslint-disable-next-line functional/no-let
    let askOfi = 0;
    if (bestAsk < this.lastBestAsk) {
      askOfi = bestAskSize;
    } else if (bestAsk > this.lastBestAsk) {
      askOfi = -this.lastBestAskSize;
    } else {
      askOfi = bestAskSize - this.lastBestAskSize;
    }

    const ofi = bidOfi - askOfi;

    // Update History smoothed
    // eslint-disable-next-line functional/immutable-data
    this.history.push(ofi);
    if (this.history.length > this.WINDOW_SIZE) {
      // eslint-disable-next-line functional/immutable-data
      this.history.shift();
    }

    // Update Last State
    // eslint-disable-next-line functional/immutable-data
    this.lastBestBid = bestBid;
    // eslint-disable-next-line functional/immutable-data
    this.lastBestBidSize = bestBidSize;
    // eslint-disable-next-line functional/immutable-data
    this.lastBestAsk = bestAsk;
    // eslint-disable-next-line functional/immutable-data
    this.lastBestAskSize = bestAskSize;

    return ofi;
  }

  /**
   * Get Cumulative/Smoothed OFI
   */
  getSmoothedOFI(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((a, b) => a + b, 0);
    return sum / this.history.length;
  }

  /**
   * Get Net OFI Magnitude (Absolute Pressure)
   */
  getNetPressure(): number {
    return this.history.reduce((a, b) => a + b, 0);
  }

  reset(): void {
    // eslint-disable-next-line functional/immutable-data
    this.lastBestBid = 0;
    // eslint-disable-next-line functional/immutable-data
    this.lastBestBidSize = 0;
    // eslint-disable-next-line functional/immutable-data
    this.lastBestAsk = 0;
    // eslint-disable-next-line functional/immutable-data
    this.lastBestAskSize = 0;
    // eslint-disable-next-line functional/immutable-data
    this.history = [];
  }
}
