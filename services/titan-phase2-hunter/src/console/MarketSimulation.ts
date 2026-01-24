/* eslint-disable functional/immutable-data */
/* eslint-disable functional/no-let */
import {
  DealingRange,
  HologramStatus,
  SessionType,
  TimeframeState,
  TrendState,
  VetoResult,
} from '../types';
import {
  ActiveTrade,
  EnhancedSessionState,
  HologramMapEntry,
  POIMapEntry,
} from './HunterHUD.types';

// Market simulation engine for realistic data updates
export class MarketSimulation {
  private priceHistory: Map<string, number[]> = new Map();
  private trendMomentum: Map<string, number> = new Map();

  constructor() {
    // Initialize price history for symbols
    const symbols = [
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'ADAUSDT',
      'DOTUSDT',
      'AVAXUSDT',
      'LINKUSDT',
      'MATICUSDT',
    ];
    symbols.forEach(symbol => {
      this.priceHistory.set(symbol, [50000 + Math.random() * 10000]);
      this.trendMomentum.set(symbol, (Math.random() - 0.5) * 0.02);
    });
  }

  updatePrices(): void {
    this.priceHistory.forEach((history, symbol) => {
      const lastPrice = history[history.length - 1];
      const momentum = this.trendMomentum.get(symbol) || 0;

      // Add some trend persistence with mean reversion
      const trendComponent = momentum * 0.7;
      const randomComponent = (Math.random() - 0.5) * 0.01;
      const meanReversion = -momentum * 0.1;

      const priceChange = trendComponent + randomComponent + meanReversion;
      const newPrice = lastPrice * (1 + priceChange);

      history.push(newPrice);
      if (history.length > 100) history.shift(); // Keep last 100 prices

      // Update momentum with some persistence
      const newMomentum = momentum * 0.9 + priceChange * 0.1;
      this.trendMomentum.set(symbol, Math.max(-0.05, Math.min(0.05, newMomentum)));
    });
  }

  getPrice(symbol: string): number {
    const history = this.priceHistory.get(symbol);
    return history ? history[history.length - 1] : 50000;
  }

  getPriceChange24h(symbol: string): number {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length < 24) return 0;
    const current = history[history.length - 1];
    const past = history[Math.max(0, history.length - 24)];
    return ((current - past) / past) * 100;
  }

  getVolatility(symbol: string): number {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length < 10) return 0.01;

    const returns = [];
    for (let i = 1; i < Math.min(history.length, 20); i++) {
      returns.push((history[i] - history[i - 1]) / history[i - 1]);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  // Generate realistic holographic map with proper alignment logic
  generateRealisticHolographicMap(): HologramMapEntry[] {
    const symbols = [
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'ADAUSDT',
      'DOTUSDT',
      'AVAXUSDT',
      'LINKUSDT',
      'MATICUSDT',
    ];

    return symbols.map(symbol => {
      const currentPrice = this.getPrice(symbol);
      const priceChange24h = this.getPriceChange24h(symbol);

      // Generate realistic timeframe states
      const dailyState = this.generateTimeframeState('1D', currentPrice, 0.15);
      const h4State = this.generateTimeframeState('4H', currentPrice, 0.08);
      const m15State = this.generateTimeframeState('15m', currentPrice, 0.03);

      // Calculate alignment score based on timeframe agreement
      const alignmentScore = this.calculateAlignmentScore(dailyState, h4State, m15State);

      // Determine status based on alignment and veto logic
      const veto = this.applyVetoLogic(dailyState, h4State);
      const status = this.determineHologramStatus(alignmentScore, veto);

      // Calculate relative strength vs BTC
      const btcChange = this.getPriceChange24h('BTCUSDT');
      const rsScore = priceChange24h - btcChange;

      return {
        symbol,
        currentPrice,
        dailyState,
        h4State,
        m15State,
        alignmentScore,
        status,
        veto,
        rsScore,
        rsVsBTC: rsScore,
        volume24h: Math.random() * 1000000000, // Random volume
        priceChange24h,
        lastSignal:
          Math.random() > 0.7
            ? {
                type: Math.random() > 0.5 ? 'LONG' : 'SHORT',
                timestamp: Date.now() - Math.random() * 3600000,
                confidence: 70 + Math.random() * 30,
              }
            : undefined,
      };
    });
  }

  // Generate realistic timeframe state
  private generateTimeframeState(
    timeframe: '1D' | '4H' | '15m',
    currentPrice: number,
    volatility: number
  ): TimeframeState {
    const range = currentPrice * volatility;
    const high = currentPrice + range * (0.3 + Math.random() * 0.7);
    const low = currentPrice - range * (0.3 + Math.random() * 0.7);

    const dealingRange: DealingRange = {
      high,
      low,
      midpoint: (high + low) / 2,
      premiumThreshold: low + (high - low) * 0.618,
      discountThreshold: low + (high - low) * 0.382,
      range: high - low,
    };

    // Determine location within dealing range
    let location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
    if (currentPrice > dealingRange.premiumThreshold) {
      location = 'PREMIUM';
    } else if (currentPrice < dealingRange.discountThreshold) {
      location = 'DISCOUNT';
    } else {
      location = 'EQUILIBRIUM';
    }

    // Determine trend based on price position and momentum
    let trend: TrendState;
    const momentum = (Math.random() - 0.5) * 0.02; // Simplified momentum for display
    if (momentum > 0.01) {
      trend = 'BULL';
    } else if (momentum < -0.01) {
      trend = 'BEAR';
    } else {
      trend = 'RANGE';
    }

    return {
      timeframe,
      trend,
      dealingRange,
      currentPrice,
      location,
      fractals: [], // Simplified for display
      bos: [], // Simplified for display
      mss:
        Math.random() > 0.8
          ? {
              direction: Math.random() > 0.5 ? 'BULLISH' : 'BEARISH',
              price: currentPrice + (Math.random() - 0.5) * range * 0.1,
              barIndex: Math.floor(Math.random() * 100),
              timestamp: Date.now() - Math.random() * 3600000,
              significance: 60 + Math.random() * 40,
            }
          : null,
    };
  }

  // Calculate alignment score based on timeframe agreement
  private calculateAlignmentScore(
    daily: TimeframeState,
    h4: TimeframeState,
    m15: TimeframeState
  ): number {
    let score = 0;

    // Daily-4H agreement (50 points max)
    if (daily.trend === h4.trend) score += 25;
    if (
      (daily.location === 'DISCOUNT' && h4.location === 'DISCOUNT') ||
      (daily.location === 'PREMIUM' && h4.location === 'PREMIUM')
    ) {
      score += 25;
    }

    // 4H-15m agreement (30 points max)
    if (h4.trend === m15.trend) score += 15;
    if (h4.mss && m15.mss && h4.mss.direction === m15.mss.direction) {
      score += 15;
    }

    // 15m trigger quality (20 points max)
    if (m15.mss) score += m15.mss.significance * 0.2;

    return Math.min(100, score);
  }

  // Apply veto logic for premium/discount zones
  private applyVetoLogic(daily: TimeframeState, h4: TimeframeState): VetoResult {
    // Veto Long signals if Daily BULL but 4H in PREMIUM
    if (daily.trend === 'BULL' && h4.location === 'PREMIUM') {
      return {
        vetoed: true,
        reason: 'PREMIUM_VETO: Daily BULL but 4H in Premium zone',
        direction: 'LONG',
      };
    }

    // Veto Short signals if Daily BEAR but 4H in DISCOUNT
    if (daily.trend === 'BEAR' && h4.location === 'DISCOUNT') {
      return {
        vetoed: true,
        reason: 'DISCOUNT_VETO: Daily BEAR but 4H in Discount zone',
        direction: 'SHORT',
      };
    }

    return {
      vetoed: false,
      reason: null,
      direction: null,
    };
  }

  // Determine hologram status based on alignment and veto
  private determineHologramStatus(alignmentScore: number, veto: VetoResult): HologramStatus {
    if (veto.vetoed) return 'CONFLICT';

    if (alignmentScore >= 80) return 'A+';
    if (alignmentScore >= 60) return 'B';
    if (alignmentScore >= 40) return 'CONFLICT';
    return 'NO_PLAY';
  }

  // Generate realistic active trade with full context
  generateRealisticActiveTrade(): ActiveTrade | null {
    if (Math.random() > 0.6) return null; // 40% chance of having an active trade

    const symbol = 'BTCUSDT';
    const currentPrice = this.getPrice(symbol);
    const side: 'LONG' | 'SHORT' = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    const entryPrice = currentPrice * (1 + (Math.random() - 0.5) * 0.02);

    // Generate realistic narrative data
    const dailyBias: TrendState = side === 'LONG' ? 'BULL' : 'BEAR';
    const h4Location = side === 'LONG' ? 'DISCOUNT' : 'PREMIUM';

    // Generate realistic session event
    const sessionEvents: Array<'JUDAS_SWING' | 'KILLZONE_ENTRY' | 'SESSION_OPEN'> = [
      'JUDAS_SWING',
      'KILLZONE_ENTRY',
      'SESSION_OPEN',
    ];
    const sessionEvent = sessionEvents[Math.floor(Math.random() * sessionEvents.length)];

    // Generate weak levels for targets
    const weakHigh = side === 'SHORT' ? currentPrice * (1 + Math.random() * 0.02) : undefined;
    const weakLow = side === 'LONG' ? currentPrice * (1 - Math.random() * 0.02) : undefined;

    return {
      symbol,
      side,
      entryPrice,
      currentPrice,
      quantity: 0.1,
      leverage: 4,

      // Narrative: Daily bias + 4H location
      narrative: {
        dailyBias,
        h4Location: h4Location as 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM',
      },

      // Setup: POI type + price
      setup: {
        type: Math.random() > 0.5 ? 'OB' : 'FVG',
        price: entryPrice,
        confidence: 75 + Math.random() * 20,
      },

      // Confirmation: session event + CVD status
      confirmation: {
        sessionEvent,
        session: 'LONDON',
        cvdStatus: Math.random() > 0.6 ? 'ABSORPTION' : 'NEUTRAL',
        rsScore: (Math.random() - 0.5) * 6,
      },

      // Execution: fill price
      execution: {
        fillPrice: entryPrice * (1 + (Math.random() - 0.5) * 0.001),
        slippage: Math.random() * 0.05,
        timestamp: Date.now() - Math.random() * 3600000,
      },

      // Target: weak high/low
      targets: {
        weakHigh,
        weakLow,
        stopLoss: side === 'LONG' ? entryPrice * 0.985 : entryPrice * 1.015,
        takeProfit: side === 'LONG' ? entryPrice * 1.045 : entryPrice * 0.955,
        breakeven: Math.random() > 0.7,
        trailingActive: Math.random() > 0.8,
      },

      pnl: (currentPrice - entryPrice) * (side === 'LONG' ? 1 : -1) * 0.1 * 4, // 4x leverage
      rValue: ((currentPrice - entryPrice) / (entryPrice * 0.015)) * (side === 'LONG' ? 1 : -1),
      timeInTrade: Date.now() - (Date.now() - Math.random() * 7200000), // Up to 2 hours
    };
  }

  // Generate realistic POI map with detailed information
  generateRealisticPOIMap(): POIMapEntry[] {
    const currentPrice = this.getPrice('BTCUSDT');
    const pois: POIMapEntry[] = [];

    // Generate Order Blocks
    for (let i = 0; i < 3; i++) {
      const direction: 'BULLISH' | 'BEARISH' = Math.random() > 0.5 ? 'BULLISH' : 'BEARISH';
      const price = currentPrice * (1 + (Math.random() - 0.5) * 0.05);
      const distance = ((price - currentPrice) / currentPrice) * 100;

      pois.push({
        id: `OB_${i}`,
        type: 'ORDER_BLOCK',
        direction,
        price,
        distance,
        confidence: 60 + Math.random() * 35,
        age: Math.random() * 48, // Up to 48 hours old
        mitigated: Math.random() > 0.8,
        strength: 70 + Math.random() * 30,
      });
    }

    // Generate Fair Value Gaps
    for (let i = 0; i < 2; i++) {
      const direction: 'BULLISH' | 'BEARISH' = Math.random() > 0.5 ? 'BULLISH' : 'BEARISH';
      const price = currentPrice * (1 + (Math.random() - 0.5) * 0.03);
      const distance = ((price - currentPrice) / currentPrice) * 100;

      pois.push({
        id: `FVG_${i}`,
        type: 'FVG',
        direction,
        price,
        distance,
        confidence: 65 + Math.random() * 30,
        age: Math.random() * 24, // Up to 24 hours old
        mitigated: Math.random() > 0.9,
        strength: 60 + Math.random() * 35,
      });
    }

    // Generate Liquidity Pools
    for (let i = 0; i < 2; i++) {
      const direction: 'BULLISH' | 'BEARISH' = Math.random() > 0.5 ? 'BULLISH' : 'BEARISH';
      const price = currentPrice * (1 + (Math.random() - 0.5) * 0.04);
      const distance = ((price - currentPrice) / currentPrice) * 100;

      pois.push({
        id: `LIQ_${i}`,
        type: 'LIQUIDITY_POOL',
        direction,
        price,
        distance,
        confidence: 80 + Math.random() * 20,
        age: Math.random() * 72, // Up to 72 hours old
        mitigated: false,
        strength: 85 + Math.random() * 15,
        volume: Math.random() * 1000000,
      });
    }

    return pois.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
  }

  // Generate realistic session state with Asian range and Judas swing
  generateRealisticSessionState(): EnhancedSessionState {
    const sessions: SessionType[] = ['ASIAN', 'LONDON', 'NY', 'DEAD_ZONE'];
    const currentSession = sessions[Math.floor(Math.random() * sessions.length)];

    const durations = {
      ASIAN: 6 * 3600000, // 6 hours
      LONDON: 3 * 3600000, // 3 hours
      NY: 3 * 3600000, // 3 hours
      DEAD_ZONE: 6 * 3600000, // 6 hours
    };

    const startTime = Date.now() - Math.random() * durations[currentSession];
    const endTime = startTime + durations[currentSession];
    const timeRemaining = Math.max(0, endTime - Date.now());

    // Generate Asian range if not in Asian session
    const asianRange =
      currentSession !== 'ASIAN'
        ? {
            high: 51200,
            low: 49800,
            timestamp: Date.now() - 8 * 3600000, // 8 hours ago
          }
        : undefined;

    // Generate Judas swing for London/NY sessions
    const judasSwing =
      (currentSession === 'LONDON' || currentSession === 'NY') && Math.random() > 0.6
        ? {
            type: Math.random() > 0.5 ? 'SWEEP_HIGH' : ('SWEEP_LOW' as 'SWEEP_HIGH' | 'SWEEP_LOW'),
            sweptPrice: Math.random() > 0.5 ? 51300 : 49700,
            reversalPrice: 50500,
            direction: Math.random() > 0.5 ? 'LONG' : ('SHORT' as 'LONG' | 'SHORT'),
            confidence: 70 + Math.random() * 25,
          }
        : undefined;

    return {
      type: currentSession,
      startTime,
      endTime,
      timeRemaining,
      asianRange,
      judasSwing,
      killzoneActive: currentSession === 'LONDON' || currentSession === 'NY',
      volumeProfile:
        currentSession === 'DEAD_ZONE' ? 'LOW' : currentSession === 'ASIAN' ? 'MEDIUM' : 'HIGH',
    };
  }
}
