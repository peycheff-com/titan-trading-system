# Design Document: Titan Phase 2 - The Hunter (Institutional-Grade)

## Overview

**Philosophy**: "We don't trade trends. We trade the **Manipulation Phase** of the AMD (Accumulation-Manipulation-Distribution) cycle. We identify where institutional algorithms are forced to inject liquidity, and we position ourselves to capture the subsequent distribution."

**The Bulgaria Reality**: With 200ms latency to Tokyo, we cannot compete on tick arbitrage. Instead, we use **Post-Only Limit Orders** at pre-calculated Order Blocks, earning Maker rebates while institutional algorithms come to us.

**Architecture**: Five-layer holographic system that combines multi-timeframe fractals, session profiling, inefficiency mapping, CVD absorption, and passive execution.

```
┌─────────────────────────────────────────────────────────────────┐
│              Hunter HUD (Ink + React)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Holographic  │  │ Active Trade │  │   POI Map            │   │
│  │ Map (Top 20) │  │ (Narrative)  │  │   (OB/FVG/Pools)     │   │
│  │              │  │              │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│  [F1] CONFIG  [F2] VIEW  [SPACE] PAUSE  [Q] QUIT                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│           Layer 1: The Cartographer (Fractal Engine)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Daily Bias   │  │ 4H Structure │  │   15m Trigger        │   │
│  │ (Trend Dir)  │  │ (Prem/Disc)  │  │   (MSS)              │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                    Output: Fractal State (3 TFs)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Layer 2: The Hologram (Alignment Logic)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Veto Logic   │  │ Score Calc   │  │   State Vector       │   │
│  │ (Prem/Disc)  │  │ (Weighted)   │  │   (A+/B/Conflict)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: Hologram State (0-100 score)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Layer 3: The Session Profiler (Time & Price)             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Asian Range  │  │ Judas Swing  │  │   Killzone Filter    │   │
│  │ (Ref Levels) │  │ (Liquidity)  │  │   (London/NY)        │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: Session State + Ref Levels                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Layer 4: The Inefficiency Mapper (POI Detection)         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ FVG Scanner  │  │ OB Detector  │  │   Liquidity Pools    │   │
│  │ (3-Candle)   │  │ (Last Opp)   │  │   (Volume Profile)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: Active POIs with confidence                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Layer 5: The Flow Validator (CVD X-Ray)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Tick CVD     │  │ Absorption   │  │   Distribution       │   │
│  │ (Buy-Sell)   │  │ (Divergence) │  │   (Divergence)       │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: CVD Validation (±30 confidence)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         Execution Layer (The Sniper)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Post-Only    │  │ Position Mgmt│  │   Risk Manager       │   │
│  │ at OB        │  │ (Trail/Part) │  │   (Correlation/DD)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: Filled position on Bybit                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. FractalMath Engine (Pure Calculation)

**Purpose**: Calculate Bill Williams fractals and market structure across 3 timeframes

**Key Methods**:
```typescript
class FractalMath {
  // Detect swing points using Bill Williams definition
  static detectFractals(candles: OHLCV[]): Fractal[]
  
  // Identify Break of Structure (BOS)
  static detectBOS(candles: OHLCV[], fractals: Fractal[]): BOS[]
  
  // Identify Market Structure Shift (MSS)
  static detectMSS(candles: OHLCV[], fractals: Fractal[], prevTrend: Trend): MSS | null
  
  // Calculate Dealing Range and Premium/Discount zones
  static calcDealingRange(fractals: Fractal[]): DealingRange
  
  // Determine trend state (BULL/BEAR/RANGE)
  static getTrendState(bos: BOS[]): TrendState
}
```

**Fractal Data Structure**:
```typescript
interface Fractal {
  type: 'HIGH' | 'LOW';
  price: number;
  barIndex: number;
  timestamp: number;
  confirmed: boolean;  // Requires 2 bars on each side
}

interface BOS {
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  barIndex: number;
  timestamp: number;
  fractalsBreached: Fractal[];
}

interface MSS {
  direction: 'BULLISH' | 'BEARISH';  // Opposite of prevailing trend
  price: number;
  barIndex: number;
  timestamp: number;
  significance: number;  // 0-100 based on how many fractals broken
}

interface DealingRange {
  high: number;
  low: number;
  midpoint: number;  // 0.5 Fibonacci (Equilibrium)
  premiumThreshold: number;  // 0.5 Fib
  discountThreshold: number;  // 0.5 Fib
  range: number;  // high - low
}

type TrendState = 'BULL' | 'BEAR' | 'RANGE';
```

**Implementation**:
```typescript
export class FractalMath {
  // Detect Bill Williams fractals (5-candle pattern)
  static detectFractals(candles: OHLCV[]): Fractal[] {
    const fractals: Fractal[] = [];
    
    // Need at least 5 candles for fractal
    if (candles.length < 5) return fractals;
    
    // Start from index 2 (need 2 bars on each side)
    for (let i = 2; i < candles.length - 2; i++) {
      const current = candles[i];
      
      // Check for Swing High
      const isSwingHigh = 
        current.high > candles[i-1].high &&
        current.high > candles[i-2].high &&
        current.high > candles[i+1].high &&
        current.high > candles[i+2].high;
      
      if (isSwingHigh) {
        fractals.push({
          type: 'HIGH',
          price: current.high,
          barIndex: i,
          timestamp: current.timestamp,
          confirmed: true
        });
      }
      
      // Check for Swing Low
      const isSwingLow = 
        current.low < candles[i-1].low &&
        current.low < candles[i-2].low &&
        current.low < candles[i+1].low &&
        current.low < candles[i+2].low;
      
      if (isSwingLow) {
        fractals.push({
          type: 'LOW',
          price: current.low,
          barIndex: i,
          timestamp: current.timestamp,
          confirmed: true
        });
      }
    }
    
    return fractals;
  }
  
  // Detect Break of Structure (candle close beyond fractal)
  static detectBOS(candles: OHLCV[], fractals: Fractal[]): BOS[] {
    const bosEvents: BOS[] = [];
    
    // Get most recent swing high and low
    const recentHighs = fractals.filter(f => f.type === 'HIGH').slice(-3);
    const recentLows = fractals.filter(f => f.type === 'LOW').slice(-3);
    
    if (recentHighs.length === 0 || recentLows.length === 0) return bosEvents;
    
    const lastSwingHigh = recentHighs[recentHighs.length - 1];
    const lastSwingLow = recentLows[recentLows.length - 1];
    
    // Check each candle for BOS
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      
      // Bullish BOS: Close above last swing high
      if (candle.close > lastSwingHigh.price && candle.timestamp > lastSwingHigh.timestamp) {
        bosEvents.push({
          direction: 'BULLISH',
          price: candle.close,
          barIndex: i,
          timestamp: candle.timestamp,
          fractalsBreached: [lastSwingHigh]
        });
      }
      
      // Bearish BOS: Close below last swing low
      if (candle.close < lastSwingLow.price && candle.timestamp > lastSwingLow.timestamp) {
        bosEvents.push({
          direction: 'BEARISH',
          price: candle.close,
          barIndex: i,
          timestamp: candle.timestamp,
          fractalsBreached: [lastSwingLow]
        });
      }
    }
    
    return bosEvents;
  }
  
  // Detect Market Structure Shift (BOS in opposite direction)
  static detectMSS(candles: OHLCV[], fractals: Fractal[], prevTrend: TrendState): MSS | null {
    const bosEvents = this.detectBOS(candles, fractals);
    if (bosEvents.length === 0) return null;
    
    const lastBOS = bosEvents[bosEvents.length - 1];
    
    // MSS occurs when BOS direction opposes prevailing trend
    if (prevTrend === 'BULL' && lastBOS.direction === 'BEARISH') {
      return {
        direction: 'BEARISH',
        price: lastBOS.price,
        barIndex: lastBOS.barIndex,
        timestamp: lastBOS.timestamp,
        significance: 80  // High significance for trend reversal
      };
    }
    
    if (prevTrend === 'BEAR' && lastBOS.direction === 'BULLISH') {
      return {
        direction: 'BULLISH',
        price: lastBOS.price,
        barIndex: lastBOS.barIndex,
        timestamp: lastBOS.timestamp,
        significance: 80
      };
    }
    
    return null;
  }
  
  // Calculate Dealing Range and Premium/Discount zones
  static calcDealingRange(fractals: Fractal[]): DealingRange {
    // Get most recent swing high and low
    const recentHighs = fractals.filter(f => f.type === 'HIGH');
    const recentLows = fractals.filter(f => f.type === 'LOW');
    
    if (recentHighs.length === 0 || recentLows.length === 0) {
      throw new Error('Insufficient fractals to calculate dealing range');
    }
    
    const high = recentHighs[recentHighs.length - 1].price;
    const low = recentLows[recentLows.length - 1].price;
    const range = high - low;
    const midpoint = low + (range * 0.5);
    
    return {
      high,
      low,
      midpoint,
      premiumThreshold: midpoint,  // Above 0.5 = Premium
      discountThreshold: midpoint,  // Below 0.5 = Discount
      range
    };
  }
  
  // Determine trend state based on BOS pattern
  static getTrendState(bos: BOS[]): TrendState {
    if (bos.length < 2) return 'RANGE';
    
    // Get last 3 BOS events
    const recentBOS = bos.slice(-3);
    
    // Check for consistent bullish BOS (Higher Highs, Higher Lows)
    const allBullish = recentBOS.every(b => b.direction === 'BULLISH');
    if (allBullish) return 'BULL';
    
    // Check for consistent bearish BOS (Lower Highs, Lower Lows)
    const allBearish = recentBOS.every(b => b.direction === 'BEARISH');
    if (allBearish) return 'BEAR';
    
    // Mixed BOS = Range
    return 'RANGE';
  }
}
```

### 2. HologramEngine (Multi-Timeframe State Machine)

**Purpose**: Combine 3 timeframes into single state vector with veto logic

**Key Methods**:
```typescript
class HologramEngine {
  // Analyze symbol across all 3 timeframes
  async analyze(symbol: string): Promise<HologramState>
  
  // Calculate alignment score (0-100)
  calcAlignmentScore(daily: TimeframeState, h4: TimeframeState, m15: TimeframeState): number
  
  // Apply veto logic (Premium/Discount)
  applyVetoLogic(daily: TimeframeState, h4: TimeframeState): VetoResult
  
  // Determine hologram status (A+/B/CONFLICT/NO_PLAY)
  getHologramStatus(score: number, veto: VetoResult): HologramStatus
}
```

**Hologram Data Structure**:
```typescript
interface TimeframeState {
  timeframe: '1D' | '4H' | '15m';
  trend: TrendState;
  dealingRange: DealingRange;
  currentPrice: number;
  location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  fractals: Fractal[];
  bos: BOS[];
  mss: MSS | null;
}

interface HologramState {
  symbol: string;
  timestamp: number;
  daily: TimeframeState;
  h4: TimeframeState;
  m15: TimeframeState;
  alignmentScore: number;  // 0-100
  status: HologramStatus;
  veto: VetoResult;
  rsScore: number;  // Relative Strength vs BTC
}

type HologramStatus = 'A+' | 'B' | 'CONFLICT' | 'NO_PLAY';

interface VetoResult {
  vetoed: boolean;
  reason: string | null;
  direction: 'LONG' | 'SHORT' | null;
}
```

**Implementation**:
```typescript
export class HologramEngine {
  private bybitClient: BybitPerpsClient;
  private fractalMath: typeof FractalMath;
  
  constructor(bybitClient: BybitPerpsClient) {
    this.bybitClient = bybitClient;
    this.fractalMath = FractalMath;
  }
  
  // Analyze symbol across all 3 timeframes
  async analyze(symbol: string): Promise<HologramState> {
    // Fetch OHLCV data for all 3 timeframes
    const [dailyCandles, h4Candles, m15Candles] = await Promise.all([
      this.bybitClient.fetchOHLCV(symbol, '1D', 100),
      this.bybitClient.fetchOHLCV(symbol, '4h', 200),
      this.bybitClient.fetchOHLCV(symbol, '15m', 500)
    ]);
    
    // Calculate fractal state for each timeframe
    const daily = this.analyzeTimeframe(dailyCandles, '1D');
    const h4 = this.analyzeTimeframe(h4Candles, '4H');
    const m15 = this.analyzeTimeframe(m15Candles, '15m');
    
    // Calculate alignment score
    const alignmentScore = this.calcAlignmentScore(daily, h4, m15);
    
    // Apply veto logic
    const veto = this.applyVetoLogic(daily, h4);
    
    // Determine hologram status
    const status = this.getHologramStatus(alignmentScore, veto);
    
    // Calculate Relative Strength vs BTC
    const rsScore = await this.calcRelativeStrength(symbol);
    
    return {
      symbol,
      timestamp: Date.now(),
      daily,
      h4,
      m15,
      alignmentScore,
      status,
      veto,
      rsScore
    };
  }
  
  // Analyze single timeframe
  private analyzeTimeframe(candles: OHLCV[], timeframe: '1D' | '4H' | '15m'): TimeframeState {
    // Detect fractals
    const fractals = this.fractalMath.detectFractals(candles);
    
    // Detect BOS
    const bos = this.fractalMath.detectBOS(candles, fractals);
    
    // Determine trend
    const trend = this.fractalMath.getTrendState(bos);
    
    // Detect MSS
    const mss = this.fractalMath.detectMSS(candles, fractals, trend);
    
    // Calculate dealing range
    const dealingRange = this.fractalMath.calcDealingRange(fractals);
    
    // Get current price
    const currentPrice = candles[candles.length - 1].close;
    
    // Determine location (Premium/Discount/Equilibrium)
    let location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
    if (currentPrice > dealingRange.premiumThreshold) {
      location = 'PREMIUM';
    } else if (currentPrice < dealingRange.discountThreshold) {
      location = 'DISCOUNT';
    } else {
      location = 'EQUILIBRIUM';
    }
    
    return {
      timeframe,
      trend,
      dealingRange,
      currentPrice,
      location,
      fractals,
      bos,
      mss
    };
  }
  
  // Calculate alignment score (0-100)
  calcAlignmentScore(daily: TimeframeState, h4: TimeframeState, m15: TimeframeState): number {
    let score = 0;
    
    // Daily-4H agreement (50 points)
    if (daily.trend === h4.trend && daily.trend !== 'RANGE') {
      score += 50;
    }
    
    // 4H-15m agreement (30 points)
    if (h4.trend === m15.trend && h4.trend !== 'RANGE') {
      score += 30;
    }
    
    // 15m MSS confirmation (20 points)
    if (m15.mss !== null) {
      score += 20;
    }
    
    return score;
  }
  
  // Apply veto logic (Premium/Discount)
  applyVetoLogic(daily: TimeframeState, h4: TimeframeState): VetoResult {
    // VETO: Don't buy expensive (Premium), don't sell cheap (Discount)
    
    // If Daily is BULLISH but 4H is in PREMIUM → VETO Long
    if (daily.trend === 'BULL' && h4.location === 'PREMIUM') {
      return {
        vetoed: true,
        reason: 'Daily BULLISH but 4H in PREMIUM (too expensive)',
        direction: 'LONG'
      };
    }
    
    // If Daily is BEARISH but 4H is in DISCOUNT → VETO Short
    if (daily.trend === 'BEAR' && h4.location === 'DISCOUNT') {
      return {
        vetoed: true,
        reason: 'Daily BEARISH but 4H in DISCOUNT (too cheap)',
        direction: 'SHORT'
      };
    }
    
    // No veto
    return {
      vetoed: false,
      reason: null,
      direction: null
    };
  }
  
  // Determine hologram status
  getHologramStatus(score: number, veto: VetoResult): HologramStatus {
    // If vetoed, return NO_PLAY
    if (veto.vetoed) return 'NO_PLAY';
    
    // A+ Alignment: Score >= 80
    if (score >= 80) return 'A+';
    
    // B Alignment: Score 60-79
    if (score >= 60) return 'B';
    
    // Conflict: Score < 60
    return 'CONFLICT';
  }
  
  // Calculate Relative Strength vs BTC
  private async calcRelativeStrength(symbol: string): Promise<number> {
    // Fetch 4-hour data for symbol and BTC
    const [symbolCandles, btcCandles] = await Promise.all([
      this.bybitClient.fetchOHLCV(symbol, '4h', 2),
      this.bybitClient.fetchOHLCV('BTCUSDT', '4h', 2)
    ]);
    
    // Calculate % change over 4 hours
    const symbolChange = (symbolCandles[1].close - symbolCandles[0].close) / symbolCandles[0].close;
    const btcChange = (btcCandles[1].close - btcCandles[0].close) / btcCandles[0].close;
    
    // RS Score = Asset % change - BTC % change
    return symbolChange - btcChange;
  }
}
```


### 3. SessionProfiler (Time & Price Dynamics)

**Purpose**: Exploit the "Judas Swing" at session opens (London/NY)

**Key Methods**:
```typescript
class SessionProfiler {
  // Get current session state
  getSessionState(utcTime: number): SessionState
  
  // Store Asian range reference levels
  storeAsianRange(high: number, low: number): void
  
  // Detect Judas Swing at London open
  detectJudasSwing(candles: OHLCV[], asianRange: AsianRange): JudasSwing | null
  
  // Check if current time is in Killzone
  isKillzone(utcTime: number): boolean
}
```

**Session Data Structure**:
```typescript
type SessionType = 'ASIAN' | 'LONDON' | 'NY' | 'DEAD_ZONE';

interface SessionState {
  type: SessionType;
  startTime: number;  // UTC timestamp
  endTime: number;    // UTC timestamp
  timeRemaining: number;  // Milliseconds
}

interface AsianRange {
  high: number;
  low: number;
  timestamp: number;
}

interface JudasSwing {
  type: 'SWEEP_HIGH' | 'SWEEP_LOW';
  sweptPrice: number;
  reversalPrice: number;
  direction: 'LONG' | 'SHORT';  // Trade direction after reversal
  confidence: number;  // 0-100
}
```

**Implementation**:
```typescript
export class SessionProfiler {
  private asianRange: AsianRange | null = null;
  
  // Get current session state
  getSessionState(utcTime: number): SessionState {
    const hour = new Date(utcTime).getUTCHours();
    
    // Asian session: 00:00-06:00 UTC (Accumulation)
    if (hour >= 0 && hour < 6) {
      return {
        type: 'ASIAN',
        startTime: this.getSessionStart(utcTime, 0),
        endTime: this.getSessionStart(utcTime, 6),
        timeRemaining: this.getSessionStart(utcTime, 6) - utcTime
      };
    }
    
    // London session: 07:00-10:00 UTC (Manipulation)
    if (hour >= 7 && hour < 10) {
      return {
        type: 'LONDON',
        startTime: this.getSessionStart(utcTime, 7),
        endTime: this.getSessionStart(utcTime, 10),
        timeRemaining: this.getSessionStart(utcTime, 10) - utcTime
      };
    }
    
    // NY session: 13:00-16:00 UTC (Distribution)
    if (hour >= 13 && hour < 16) {
      return {
        type: 'NY',
        startTime: this.getSessionStart(utcTime, 13),
        endTime: this.getSessionStart(utcTime, 16),
        timeRemaining: this.getSessionStart(utcTime, 16) - utcTime
      };
    }
    
    // Dead Zone: 21:00-01:00 UTC (No trading)
    return {
      type: 'DEAD_ZONE',
      startTime: this.getSessionStart(utcTime, 21),
      endTime: this.getSessionStart(utcTime, 1),
      timeRemaining: 0
    };
  }
  
  // Helper: Get session start timestamp
  private getSessionStart(utcTime: number, hour: number): number {
    const date = new Date(utcTime);
    date.setUTCHours(hour, 0, 0, 0);
    return date.getTime();
  }
  
  // Store Asian range reference levels
  storeAsianRange(high: number, low: number): void {
    this.asianRange = {
      high,
      low,
      timestamp: Date.now()
    };
    console.log(`📦 Asian Range stored: High ${high.toFixed(2)}, Low ${low.toFixed(2)}`);
  }
  
  // Detect Judas Swing at London open
  detectJudasSwing(candles: OHLCV[], asianRange: AsianRange): JudasSwing | null {
    if (!asianRange) return null;
    
    // Get last 3 candles (London open period)
    const recentCandles = candles.slice(-3);
    
    // Check for sweep of Asian High
    const sweptHigh = recentCandles.some(c => c.high > asianRange.high);
    const reversedBelowHigh = recentCandles[recentCandles.length - 1].close < asianRange.high;
    
    if (sweptHigh && reversedBelowHigh) {
      console.log(`🎣 Judas Swing detected: Swept Asian High, reversed inside`);
      return {
        type: 'SWEEP_HIGH',
        sweptPrice: asianRange.high,
        reversalPrice: recentCandles[recentCandles.length - 1].close,
        direction: 'SHORT',  // Sweep high → Short
        confidence: 85
      };
    }
    
    // Check for sweep of Asian Low
    const sweptLow = recentCandles.some(c => c.low < asianRange.low);
    const reversedAboveLow = recentCandles[recentCandles.length - 1].close > asianRange.low;
    
    if (sweptLow && reversedAboveLow) {
      console.log(`🎣 Judas Swing detected: Swept Asian Low, reversed inside`);
      return {
        type: 'SWEEP_LOW',
        sweptPrice: asianRange.low,
        reversalPrice: recentCandles[recentCandles.length - 1].close,
        direction: 'LONG',  // Sweep low → Long
        confidence: 85
      };
    }
    
    return null;
  }
  
  // Check if current time is in Killzone
  isKillzone(utcTime: number): boolean {
    const session = this.getSessionState(utcTime);
    return session.type === 'LONDON' || session.type === 'NY';
  }
}
```

### 4. InefficiencyMapper (POI Detection)

**Purpose**: Identify Fair Value Gaps, Order Blocks, and Liquidity Pools

**Key Methods**:
```typescript
class InefficiencyMapper {
  // Detect Fair Value Gaps (3-candle imbalance)
  detectFVG(candles: OHLCV[]): FVG[]
  
  // Detect Order Blocks (last opposite candle before BOS)
  detectOrderBlock(candles: OHLCV[], bos: BOS[]): OrderBlock[]
  
  // Detect Liquidity Pools (volume profile at swing points)
  detectLiquidityPools(candles: OHLCV[], fractals: Fractal[]): LiquidityPool[]
  
  // Validate POI (check if mitigated)
  validatePOI(poi: POI, currentPrice: number): boolean
}
```

**POI Data Structure**:
```typescript
interface FVG {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  midpoint: number;
  barIndex: number;
  timestamp: number;
  mitigated: boolean;
  fillPercent: number;  // 0-100
}

interface OrderBlock {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  barIndex: number;
  timestamp: number;
  mitigated: boolean;
  confidence: number;  // 0-100, decays with age
}

interface LiquidityPool {
  type: 'HIGH' | 'LOW';
  price: number;
  strength: number;  // 0-100 based on volume and age
  barIndex: number;
  timestamp: number;
  swept: boolean;
}

type POI = FVG | OrderBlock | LiquidityPool;
```

**Implementation**:
```typescript
export class InefficiencyMapper {
  // Detect Fair Value Gaps (3-candle imbalance)
  detectFVG(candles: OHLCV[]): FVG[] {
    const fvgs: FVG[] = [];
    
    // Need at least 3 candles
    if (candles.length < 3) return fvgs;
    
    for (let i = 0; i < candles.length - 2; i++) {
      const candle1 = candles[i];
      const candle2 = candles[i + 1];
      const candle3 = candles[i + 2];
      
      // Bullish FVG: Candle 1 high < Candle 3 low (gap up)
      if (candle1.high < candle3.low) {
        const top = candle3.low;
        const bottom = candle1.high;
        const midpoint = (top + bottom) / 2;
        
        fvgs.push({
          type: 'BULLISH',
          top,
          bottom,
          midpoint,
          barIndex: i + 2,
          timestamp: candle3.timestamp,
          mitigated: false,
          fillPercent: 0
        });
      }
      
      // Bearish FVG: Candle 1 low > Candle 3 high (gap down)
      if (candle1.low > candle3.high) {
        const top = candle1.low;
        const bottom = candle3.high;
        const midpoint = (top + bottom) / 2;
        
        fvgs.push({
          type: 'BEARISH',
          top,
          bottom,
          midpoint,
          barIndex: i + 2,
          timestamp: candle3.timestamp,
          mitigated: false,
          fillPercent: 0
        });
      }
    }
    
    return fvgs;
  }
  
  // Detect Order Blocks (last opposite candle before BOS)
  detectOrderBlock(candles: OHLCV[], bos: BOS[]): OrderBlock[] {
    const orderBlocks: OrderBlock[] = [];
    
    for (const bosEvent of bos) {
      // Find the candle just before BOS
      const bosBarIndex = bosEvent.barIndex;
      
      if (bosBarIndex < 1) continue;
      
      // For Bullish BOS, find last down-candle
      if (bosEvent.direction === 'BULLISH') {
        for (let i = bosBarIndex - 1; i >= 0; i--) {
          const candle = candles[i];
          const isDownCandle = candle.close < candle.open;
          
          if (isDownCandle) {
            orderBlocks.push({
              type: 'BULLISH',
              high: candle.high,
              low: candle.low,
              barIndex: i,
              timestamp: candle.timestamp,
              mitigated: false,
              confidence: 90
            });
            break;  // Only take the last one
          }
        }
      }
      
      // For Bearish BOS, find last up-candle
      if (bosEvent.direction === 'BEARISH') {
        for (let i = bosBarIndex - 1; i >= 0; i--) {
          const candle = candles[i];
          const isUpCandle = candle.close > candle.open;
          
          if (isUpCandle) {
            orderBlocks.push({
              type: 'BEARISH',
              high: candle.high,
              low: candle.low,
              barIndex: i,
              timestamp: candle.timestamp,
              mitigated: false,
              confidence: 90
            });
            break;
          }
        }
      }
    }
    
    return orderBlocks;
  }
  
  // Detect Liquidity Pools (volume profile at swing points)
  detectLiquidityPools(candles: OHLCV[], fractals: Fractal[]): LiquidityPool[] {
    const pools: LiquidityPool[] = [];
    
    for (const fractal of fractals) {
      // Get the candle at fractal bar index
      const candle = candles[fractal.barIndex];
      if (!candle) continue;
      
      // Calculate pool strength based on volume and age
      const age = Date.now() - fractal.timestamp;
      const ageHours = age / (1000 * 60 * 60);
      const ageFactor = Math.max(0, 100 - (ageHours / 72) * 50);  // Decay over 72 hours
      
      // Volume factor (normalize to 0-100)
      const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
      const volumeFactor = Math.min(100, (candle.volume / avgVolume) * 50);
      
      const strength = (ageFactor * 0.6) + (volumeFactor * 0.4);
      
      pools.push({
        type: fractal.type === 'HIGH' ? 'HIGH' : 'LOW',
        price: fractal.price,
        strength,
        barIndex: fractal.barIndex,
        timestamp: fractal.timestamp,
        swept: false
      });
    }
    
    return pools;
  }
  
  // Validate POI (check if mitigated)
  validatePOI(poi: POI, currentPrice: number): boolean {
    if ('mitigated' in poi && poi.mitigated) return false;
    if ('swept' in poi && poi.swept) return false;
    
    // FVG validation
    if ('midpoint' in poi) {
      const fvg = poi as FVG;
      // FVG is mitigated if price fills 100%
      if (fvg.type === 'BULLISH' && currentPrice <= fvg.bottom) {
        return false;
      }
      if (fvg.type === 'BEARISH' && currentPrice >= fvg.top) {
        return false;
      }
    }
    
    // Order Block validation
    if ('high' in poi && 'low' in poi && !('midpoint' in poi)) {
      const ob = poi as OrderBlock;
      // OB is mitigated if price closes through it
      if (ob.type === 'BULLISH' && currentPrice < ob.low) {
        return false;
      }
      if (ob.type === 'BEARISH' && currentPrice > ob.high) {
        return false;
      }
    }
    
    return true;
  }
}
```

### 5. CVDValidator (Order Flow X-Ray)

**Purpose**: Confirm reversals by detecting limit order absorption

**Key Methods**:
```typescript
class CVDValidator {
  // Calculate Cumulative Volume Delta
  calcCVD(trades: Trade[], windowMs: number): number
  
  // Detect CVD Absorption (price Lower Low, CVD Higher Low)
  detectAbsorption(prices: number[], cvdValues: number[]): Absorption | null
  
  // Detect CVD Distribution (price Higher High, CVD Lower High)
  detectDistribution(prices: number[], cvdValues: number[]): Distribution | null
  
  // Validate POI with CVD
  validateWithCVD(poi: POI, absorption: Absorption | null): number  // Returns confidence adjustment
}
```

**CVD Data Structure**:
```typescript
interface Trade {
  symbol: string;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean;  // true = sell, false = buy
}

interface Absorption {
  priceLL: number;  // Price Lower Low
  cvdHL: number;    // CVD Higher Low
  strength: number;  // 0-100
  timestamp: number;
}

interface Distribution {
  priceHH: number;  // Price Higher High
  cvdLH: number;    // CVD Lower High
  strength: number;  // 0-100
  timestamp: number;
}
```

**Implementation**:
```typescript
export class CVDValidator {
  private tradeHistory: Map<string, Trade[]> = new Map();
  
  // Calculate Cumulative Volume Delta
  calcCVD(trades: Trade[], windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    const recentTrades = trades.filter(t => t.time > cutoff);
    
    let cvd = 0;
    for (const trade of recentTrades) {
      if (trade.isBuyerMaker) {
        // Buyer is maker = sell order hit buy limit = selling pressure
        cvd -= trade.qty * trade.price;
      } else {
        // Seller is maker = buy order hit sell limit = buying pressure
        cvd += trade.qty * trade.price;
      }
    }
    
    return cvd;
  }
  
  // Detect CVD Absorption (price Lower Low, CVD Higher Low)
  detectAbsorption(prices: number[], cvdValues: number[]): Absorption | null {
    if (prices.length < 3 || cvdValues.length < 3) return null;
    
    // Get last 3 values
    const p1 = prices[prices.length - 3];
    const p2 = prices[prices.length - 2];
    const p3 = prices[prices.length - 1];
    
    const cvd1 = cvdValues[cvdValues.length - 3];
    const cvd2 = cvdValues[cvdValues.length - 2];
    const cvd3 = cvdValues[cvdValues.length - 1];
    
    // Check for price Lower Low
    const priceLowerLow = p3 < p2 && p2 < p1;
    
    // Check for CVD Higher Low
    const cvdHigherLow = cvd3 > cvd2 && cvd2 < cvd1;
    
    if (priceLowerLow && cvdHigherLow) {
      // Calculate strength based on divergence magnitude
      const priceDrop = (p1 - p3) / p1;
      const cvdRise = (cvd3 - cvd2) / Math.abs(cvd2);
      const strength = Math.min(100, (priceDrop + cvdRise) * 100);
      
      console.log(`🔍 CVD Absorption detected: Price LL ${p3.toFixed(2)}, CVD HL ${cvd3.toFixed(0)}`);
      
      return {
        priceLL: p3,
        cvdHL: cvd3,
        strength,
        timestamp: Date.now()
      };
    }
    
    return null;
  }
  
  // Detect CVD Distribution (price Higher High, CVD Lower High)
  detectDistribution(prices: number[], cvdValues: number[]): Distribution | null {
    if (prices.length < 3 || cvdValues.length < 3) return null;
    
    // Get last 3 values
    const p1 = prices[prices.length - 3];
    const p2 = prices[prices.length - 2];
    const p3 = prices[prices.length - 1];
    
    const cvd1 = cvdValues[cvdValues.length - 3];
    const cvd2 = cvdValues[cvdValues.length - 2];
    const cvd3 = cvdValues[cvdValues.length - 1];
    
    // Check for price Higher High
    const priceHigherHigh = p3 > p2 && p2 > p1;
    
    // Check for CVD Lower High
    const cvdLowerHigh = cvd3 < cvd2 && cvd2 > cvd1;
    
    if (priceHigherHigh && cvdLowerHigh) {
      // Calculate strength based on divergence magnitude
      const priceRise = (p3 - p1) / p1;
      const cvdDrop = (cvd2 - cvd3) / Math.abs(cvd2);
      const strength = Math.min(100, (priceRise + cvdDrop) * 100);
      
      console.log(`🔍 CVD Distribution detected: Price HH ${p3.toFixed(2)}, CVD LH ${cvd3.toFixed(0)}`);
      
      return {
        priceHH: p3,
        cvdLH: cvd3,
        strength,
        timestamp: Date.now()
      };
    }
    
    return null;
  }
  
  // Validate POI with CVD
  validateWithCVD(poi: POI, absorption: Absorption | null): number {
    if (!absorption) return 0;
    
    // If POI is a Bullish OB or FVG and we have absorption → +30 confidence
    if ('type' in poi && (poi.type === 'BULLISH' || poi.type === 'BULLISH')) {
      return 30;
    }
    
    return 0;
  }
  
  // Record trade for CVD calculation
  recordTrade(trade: Trade): void {
    if (!this.tradeHistory.has(trade.symbol)) {
      this.tradeHistory.set(trade.symbol, []);
    }
    
    const history = this.tradeHistory.get(trade.symbol)!;
    history.push(trade);
    
    // Keep only last 10 minutes
    const cutoff = Date.now() - (10 * 60 * 1000);
    this.tradeHistory.set(
      trade.symbol,
      history.filter(t => t.time > cutoff)
    );
  }
}
```

## Data Flow

### 1. Hologram Scan Cycle (Every 5 minutes)

```
1. Fetch OHLCV data for top 100 symbols (Daily, 4H, 15m)
2. For each symbol:
   a. Run FractalMath.detectFractals() on all 3 timeframes
   b. Run FractalMath.detectBOS() on all 3 timeframes
   c. Run FractalMath.detectMSS() on 15m timeframe
   d. Run FractalMath.calcDealingRange() on all 3 timeframes
   e. Run HologramEngine.calcAlignmentScore()
   f. Run HologramEngine.applyVetoLogic()
   g. Run HologramEngine.calcRelativeStrength()
3. Rank symbols by Alignment Score
4. Select top 20 for monitoring
5. Update Hunter HUD
```

### 2. Session Monitoring Cycle (Real-time)

```
1. Check current session state (Asian/London/NY/Dead Zone)
2. If Asian session ending:
   a. Store Asian High/Low as reference levels
3. If London session starting:
   a. Monitor for Judas Swing (sweep of Asian levels)
   b. If Judas Swing detected → Trigger signal
4. If NY session starting:
   a. Monitor for Judas Swing (sweep of London levels)
   b. If Judas Swing detected → Trigger signal
5. If Dead Zone → Disable new entries
```

### 3. POI Detection Cycle (Every 1 minute)

```
1. For each monitored symbol:
   a. Run InefficiencyMapper.detectFVG()
   b. Run InefficiencyMapper.detectOrderBlock()
   c. Run InefficiencyMapper.detectLiquidityPools()
2. Validate all POIs (check if mitigated)
3. Remove mitigated POIs from active list
4. Update Hunter HUD with active POIs
```

### 4. CVD Monitoring Cycle (Real-time WebSocket)

```
1. Receive AggTrade tick from Binance
2. Record trade in CVDValidator
3. Calculate CVD for last 5 minutes
4. Check for Absorption (price LL, CVD HL)
5. Check for Distribution (price HH, CVD LH)
6. If Absorption detected at POI → Increase confidence +30
7. Update Hunter HUD with CVD status
```

### 5. Signal Generation & Execution

```
1. Check Hologram Status (A+ or B)
2. Check Session (must be Killzone)
3. Check RS Score (Long: RS > 0, Short: RS < 0)
4. Check POI proximity (price within 0.5% of OB/FVG)
5. Check CVD Absorption (required for entry)
6. If all conditions met:
   a. Calculate position size (Volatility-Adjusted)
   b. Place Post-Only Limit Order at OB top/bottom
   c. Set stop loss at 1.5% from entry
   d. Set target at 4.5% from entry (3:1 R:R)
7. Monitor order for 60 seconds
8. If not filled and price moves away > 0.2% → Cancel
9. If filled → Log execution and manage position
```

## Error Handling

### WebSocket Disconnections

```typescript
// Binance reconnection logic
this.ws.on('close', () => {
  console.warn('⚠️ Binance WebSocket closed. Reconnecting in 2s...');
  setTimeout(() => this.subscribeAggTrades(symbols), 2000);
});
```

### Order Failures

```typescript
// Retry logic for order placement
async placeOrderWithRetry(params: OrderParams, maxRetries: number = 2): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.placeOrder(params);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.warn(`⚠️ Order failed, retry ${i + 1}/${maxRetries}`);
      await this.sleep(1000);
    }
  }
}
```

### POI Validation Failures

```typescript
// Prevent trading on mitigated POIs
if (!this.inefficiencyMapper.validatePOI(poi, currentPrice)) {
  console.warn(`⚠️ POI mitigated: ${poi.type} at ${poi.price}`);
  return;
}
```

## Performance Optimization

### 1. TypedArray Math

All calculations use Float64Array for O(1) access and minimal garbage collection:

```typescript
const closes = new Float64Array(candles.map(c => c.close));
const fractals = FractalMath.detectFractals(closes);  // No array copies
```

### 2. Cached Multi-Timeframe Data

OHLCV data is cached for 5 minutes to minimize API calls:

```typescript
private cache: Map<string, { data: OHLCV[]; timestamp: number }> = new Map();

async fetchOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
  const cacheKey = `${symbol}-${interval}`;
  const cached = this.cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < 300000) {
    return cached.data;  // Return cached data
  }
  
  // Fetch fresh data
  const data = await this.bybitClient.fetchOHLCV(symbol, interval, limit);
  this.cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
```

### 3. Lazy POI Calculation

POIs are only calculated for top 20 symbols, not all 100:

```typescript
// Only calculate POIs for top 20 by alignment score
const top20 = holograms.slice(0, 20);
for (const hologram of top20) {
  const pois = this.inefficiencyMapper.detectAll(hologram);
  this.poiMap.set(hologram.symbol, pois);
}
```

## Testing Strategy

### Unit Tests

- FractalMath: Test fractal detection, BOS detection, MSS detection with known data
- HologramEngine: Test alignment score calculation, veto logic, RS calculation
- SessionProfiler: Test session state detection, Judas Swing detection
- InefficiencyMapper: Test FVG detection, OB detection, liquidity pool detection
- CVDValidator: Test CVD calculation, absorption detection, distribution detection

### Integration Tests

- Binance WebSocket: Test subscription, message parsing, reconnection
- Bybit API: Test order placement, leverage setting, stop loss/target
- HologramEngine: Test full cycle from data fetch to hologram state generation

### Property-Based Tests

**Property 1: Fractal Detection Consistency**
*For any* OHLCV array, detecting fractals twice should produce identical results
**Validates: Requirements 5.1-5.7**

**Property 2: Alignment Score Monotonicity**
*For any* hologram state, if Daily-4H agreement increases, alignment score should not decrease
**Validates: Requirements 2.2**

**Property 3: Veto Logic Correctness**
*For any* hologram state where Daily is BULLISH and 4H is PREMIUM, veto should block Long signals
**Validates: Requirements 1.3, 1.4**

**Property 4: CVD Absorption Detection**
*For any* price series with Lower Low and CVD series with Higher Low, absorption should be detected
**Validates: Requirements 4.2**

**Property 5: POI Mitigation Consistency**
*For any* POI, once mitigated, it should remain mitigated regardless of subsequent price action
**Validates: Requirements 3.6**

