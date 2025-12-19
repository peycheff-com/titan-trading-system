# Design Document: Titan Phase 1 - Scavenger (Predestination Engine)

## Overview

**Philosophy**: "We don't scan for opportunities. We calculate exactly where the market will break, place our traps in memory, and wait for price to walk into them."

**The Bulgaria Reality**: With 200ms latency to Tokyo, we cannot compete on tick arbitrage (HFTs win in 1-10ms). Instead, we use Binance Spot as a **signal validator** and catch the **momentum ignition** (2-5% moves) that follows 1-10 seconds after HFTs close the price gap.

**Architecture**: Three-layer trap system that pre-computes structural levels, monitors Binance for validation, and executes on Bybit.

```
┌─────────────────────────────────────────────────────────────────┐
│              Trap Monitor Console (Ink + React)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Active Traps │  │ Sensor Status│  │   Live Feed          │   │
│  │ (Top 20)     │  │ (Binance/    │  │   (Last 5 Events)    │   │
│  │              │  │  Bybit)      │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│  [F1] CONFIG  [SPACE] PAUSE  [Q] QUIT                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│           Pre-Computation Layer (The Web) - 1min cycle          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Liquidation  │  │ Daily Levels │  │   Bollinger Bands    │   │
│  │ Clusters     │  │ (PDH/PDL)    │  │   (Squeeze)          │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                    Output: Trap Map (Top 20)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Detection Layer (The Spider) - Real-time WebSocket       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Binance Spot │  │ Volume       │  │   Tripwire Match     │   │
│  │ AggTrades    │  │ Validation   │  │   (±0.1%)            │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: TRAP_SPRUNG event                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         Execution Layer (The Bite) - Bybit Perps                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Velocity     │  │ Order Type   │  │   Position Mgmt      │   │
│  │ Calculator   │  │ Selector     │  │   (Stop/Target)      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: Filled position on Bybit                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. TitanTrap Engine (Core Logic)

**Purpose**: Manage trap lifecycle from calculation to execution

**Key Methods**:
```typescript
class TitanTrap {
  // Pre-Computation: Calculate tripwires every 1 minute
  async updateTrapMap(): Promise<void>
  
  // Detection: Monitor Binance for tripwire hits
  onBinanceTick(symbol: string, price: number, trades: Trade[]): void
  
  // Execution: Fire order on Bybit when trap springs
  async fire(trap: Tripwire): Promise<void>
}
```


**Tripwire Data Structure**:
```typescript
interface Tripwire {
  symbol: string;
  triggerPrice: number;
  direction: 'LONG' | 'SHORT';
  trapType: 'LIQUIDATION' | 'DAILY_LEVEL' | 'BOLLINGER' | 'SIGMA_FADE';
  confidence: number;  // 80-95
  leverage: number;    // 10x-20x
  estimatedCascadeSize: number;  // Expected move in %
  activated: boolean;
  activatedAt?: number;  // Timestamp
}
```

**Implementation**:
```typescript
export class TitanTrap {
  private trapMap: Map<string, Tripwire[]> = new Map();
  private volumeCounters: Map<string, { count: number; startTime: number }> = new Map();
  
  // 1. PRE-COMPUTATION LAYER (Runs every 1 minute)
  async updateTrapMap(): Promise<void> {
    const startTime = Date.now();
    
    // Fetch top 500 symbols by volume from Bybit
    const symbols = await this.bybitClient.fetchTopSymbols(500);
    
    // Calculate trap quality score for each symbol
    const scoredSymbols = await Promise.all(
      symbols.map(async (symbol) => {
        const ohlcv = await this.bybitClient.fetchOHLCV(symbol, '1h', 100);
        
        // Calculate tripwires
        const liquidationTrap = this.calcLiquidationCluster(ohlcv);
        const dailyLevelTrap = this.calcDailyLevel(ohlcv);
        const bollingerTrap = this.calcBollingerBreakout(ohlcv);
        
        // Score based on volatility, volume, and level confluence
        const volatility = this.calcVolatility(ohlcv);
        const volume = ohlcv[ohlcv.length - 1].volume;
        const confluence = this.calcConfluence([liquidationTrap, dailyLevelTrap, bollingerTrap]);
        
        const trapQuality = (volatility * 0.4) + (volume * 0.3) + (confluence * 0.3);
        
        return {
          symbol,
          trapQuality,
          traps: [liquidationTrap, dailyLevelTrap, bollingerTrap].filter(t => t !== null)
        };
      })
    );
    
    // Select top 20 symbols
    const top20 = scoredSymbols
      .sort((a, b) => b.trapQuality - a.trapQuality)
      .slice(0, 20);
    
    // Update trap map
    this.trapMap.clear();
    for (const { symbol, traps } of top20) {
      this.trapMap.set(symbol, traps);
    }
    
    // Subscribe to Binance Spot for these symbols
    await this.binanceClient.subscribeAggTrades(top20.map(s => s.symbol));
    
    const duration = Date.now() - startTime;
    if (duration > 60000) {
      console.warn(`⚠️ Pre-computation exceeded 60s: ${duration}ms`);
    }
    
    console.log(`✅ Trap Map updated: ${top20.length} symbols, ${duration}ms`);
  }
  
  // 2. DETECTION LAYER (Real-time WebSocket)
  onBinanceTick(symbol: string, price: number, trades: Trade[]): void {
    const traps = this.trapMap.get(symbol);
    if (!traps) return;
    
    for (const trap of traps) {
      if (trap.activated) continue;
      
      // Check if price is within 0.1% of trigger
      const priceDistance = Math.abs(price - trap.triggerPrice) / trap.triggerPrice;
      if (priceDistance > 0.001) continue;  // Not close enough
      
      // Start volume accumulation
      if (!this.volumeCounters.has(symbol)) {
        this.volumeCounters.set(symbol, { count: 0, startTime: Date.now() });
      }
      
      const counter = this.volumeCounters.get(symbol)!;
      counter.count += trades.length;
      
      // Check if 100ms window has elapsed
      const elapsed = Date.now() - counter.startTime;
      if (elapsed >= 100) {
        // Validate: Require 50+ trades in 100ms
        if (counter.count >= 50) {
          console.log(`⚡ TRAP SPRUNG: ${symbol} at ${price} (${counter.count} trades)`);
          this.fire(trap);
        }
        
        // Reset counter
        this.volumeCounters.delete(symbol);
      }
    }
  }
  
  // 3. EXECUTION LAYER (Bybit Perps)
  async fire(trap: Tripwire): Promise<void> {
    trap.activated = true;
    trap.activatedAt = Date.now();
    
    // Calculate price velocity on Bybit
    const bybitPrice = await this.bybitClient.getCurrentPrice(trap.symbol);
    const velocity = await this.calcVelocity(trap.symbol);
    
    // Determine order type based on velocity
    let orderType: 'MARKET' | 'LIMIT';
    let limitPrice: number | undefined;
    
    if (velocity > 0.005) {  // > 0.5% per second
      orderType = 'MARKET';
      console.log(`🚀 Using MARKET order (velocity: ${(velocity * 100).toFixed(2)}%/s)`);
    } else if (velocity > 0.001) {  // 0.1% - 0.5% per second
      orderType = 'LIMIT';
      limitPrice = trap.direction === 'LONG' 
        ? bybitPrice * 1.002  // Ask + 0.2%
        : bybitPrice * 0.998;  // Bid - 0.2%
      console.log(`⚡ Using AGGRESSIVE LIMIT at ${limitPrice} (velocity: ${(velocity * 100).toFixed(2)}%/s)`);
    } else {
      orderType = 'LIMIT';
      limitPrice = trap.direction === 'LONG' 
        ? bybitPrice * 1.0001  // Ask
        : bybitPrice * 0.9999;  // Bid
      console.log(`📍 Using LIMIT at ${limitPrice} (velocity: ${(velocity * 100).toFixed(2)}%/s)`);
    }
    
    // CRITICAL: Use cached equity (updated every 5s in background)
    // This prevents fire() from hanging on slow API calls
    const positionSize = this.calcPositionSize(this.cachedEquity, trap.confidence, trap.leverage);
    
    // Send order to Bybit
    const order = await this.bybitClient.placeOrder({
      symbol: trap.symbol,
      side: trap.direction === 'LONG' ? 'Buy' : 'Sell',
      type: orderType,
      price: limitPrice,
      qty: positionSize,
      leverage: trap.leverage,
      timeInForce: orderType === 'LIMIT' ? 'IOC' : undefined
    });
    
    // Set stop loss and target
    const stopLoss = trap.direction === 'LONG'
      ? bybitPrice * 0.99   // -1%
      : bybitPrice * 1.01;  // +1%
    
    const target = trap.direction === 'LONG'
      ? bybitPrice * 1.03   // +3%
      : bybitPrice * 0.97;  // -3%
    
    await this.bybitClient.setStopLoss(trap.symbol, stopLoss);
    await this.bybitClient.setTakeProfit(trap.symbol, target);
    
    // Log execution
    this.logger.log({
      timestamp: Date.now(),
      symbol: trap.symbol,
      trapType: trap.trapType,
      direction: trap.direction,
      entry: bybitPrice,
      stop: stopLoss,
      target: target,
      confidence: trap.confidence,
      leverage: trap.leverage,
      orderType,
      velocity
    });
  }
}
```


### 2. Tripwire Calculators (Pure Math)

**Purpose**: Calculate structural breakout levels using TypedArrays

**Liquidation Cluster Calculator**:
```typescript
class TripwireCalculators {
  static calcLiquidationCluster(ohlcv: OHLCV[]): Tripwire | null {
    // Use volume profile to find high-volume nodes
    const volumeProfile = this.buildVolumeProfile(ohlcv, 50);
    
    // Find peaks (liquidation clusters)
    const peaks = volumeProfile
      .map((node, idx) => ({ price: node.price, volume: node.volume, idx }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 3);  // Top 3 clusters
    
    // Select cluster above current price for LONG, below for SHORT
    const currentPrice = ohlcv[ohlcv.length - 1].close;
    const longCluster = peaks.find(p => p.price > currentPrice);
    const shortCluster = peaks.find(p => p.price < currentPrice);
    
    if (!longCluster && !shortCluster) return null;
    
    // Prefer direction with stronger cluster
    const trap = longCluster && (!shortCluster || longCluster.volume > shortCluster.volume)
      ? {
          symbol: '',  // Set by caller
          triggerPrice: longCluster.price * 1.002,  // +0.2% above cluster
          direction: 'LONG' as const,
          trapType: 'LIQUIDATION' as const,
          confidence: 95,
          leverage: 20,
          estimatedCascadeSize: 0.05,  // 5% expected move
          activated: false
        }
      : {
          symbol: '',
          triggerPrice: shortCluster!.price * 0.998,  // -0.2% below cluster
          direction: 'SHORT' as const,
          trapType: 'LIQUIDATION' as const,
          confidence: 95,
          leverage: 20,
          estimatedCascadeSize: 0.05,
          activated: false
        };
    
    return trap;
  }
  
  static buildVolumeProfile(ohlcv: OHLCV[], bins: number): { price: number; volume: number }[] {
    // Find price range
    const highs = ohlcv.map(bar => bar.high);
    const lows = ohlcv.map(bar => bar.low);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const priceStep = (maxPrice - minPrice) / bins;
    
    // Initialize bins
    const profile = Array.from({ length: bins }, (_, i) => ({
      price: minPrice + (i * priceStep),
      volume: 0
    }));
    
    // Accumulate volume in bins
    for (const bar of ohlcv) {
      const binIdx = Math.floor((bar.close - minPrice) / priceStep);
      if (binIdx >= 0 && binIdx < bins) {
        profile[binIdx].volume += bar.volume;
      }
    }
    
    return profile;
  }
  
  static calcDailyLevel(ohlcv: OHLCV[]): Tripwire | null {
    // Get previous day high/low (assuming 1h bars, last 24 bars = 1 day)
    const previousDay = ohlcv.slice(-48, -24);  // 24 bars before last 24
    if (previousDay.length < 24) return null;
    
    const pdh = Math.max(...previousDay.map(bar => bar.high));
    const pdl = Math.min(...previousDay.map(bar => bar.low));
    const currentPrice = ohlcv[ohlcv.length - 1].close;
    
    // Determine which level is closer
    const distanceToHigh = Math.abs(currentPrice - pdh) / currentPrice;
    const distanceToLow = Math.abs(currentPrice - pdl) / currentPrice;
    
    if (distanceToHigh < 0.02 && distanceToHigh < distanceToLow) {
      // Close to PDH, set breakout trap
      return {
        symbol: '',
        triggerPrice: pdh * 1.001,  // +0.1% above PDH
        direction: 'LONG',
        trapType: 'DAILY_LEVEL',
        confidence: 85,
        leverage: 12,
        estimatedCascadeSize: 0.03,
        activated: false
      };
    } else if (distanceToLow < 0.02) {
      // Close to PDL, set breakdown trap
      return {
        symbol: '',
        triggerPrice: pdl * 0.999,  // -0.1% below PDL
        direction: 'SHORT',
        trapType: 'DAILY_LEVEL',
        confidence: 85,
        leverage: 12,
        estimatedCascadeSize: 0.03,
        activated: false
      };
    }
    
    return null;  // Not close to any daily level
  }
  
  static calcBollingerBreakout(ohlcv: OHLCV[]): Tripwire | null {
    const closes = new Float64Array(ohlcv.map(bar => bar.close));
    const period = 20;
    
    // Calculate SMA
    const sma = this.calcSMA(closes, period);
    
    // Calculate standard deviation
    const stdDev = this.calcStdDev(closes, period);
    
    // Calculate Bollinger Bands
    const upperBand = sma + (stdDev * 2);
    const lowerBand = sma - (stdDev * 2);
    
    // Calculate BB width
    const bbWidth = (upperBand - lowerBand) / sma;
    
    // Calculate historical BB widths (72 hours = 72 bars for 1h)
    const historicalWidths = new Float64Array(72);
    for (let i = 0; i < 72; i++) {
      const slice = closes.slice(i, i + period);
      const sliceSMA = this.calcSMA(slice, period);
      const sliceStdDev = this.calcStdDev(slice, period);
      historicalWidths[i] = (sliceStdDev * 2) / sliceSMA;
    }
    
    // Check if current BB width is in bottom 10%
    const sortedWidths = Array.from(historicalWidths).sort((a, b) => a - b);
    const bottom10Pct = sortedWidths[Math.floor(sortedWidths.length * 0.1)];
    
    if (bbWidth > bottom10Pct) return null;  // Not compressed
    
    // Determine direction based on price position relative to SMA
    const currentPrice = closes[closes.length - 1];
    const direction = currentPrice > sma ? 'LONG' : 'SHORT';
    
    return {
      symbol: '',
      triggerPrice: direction === 'LONG' ? upperBand * 1.001 : lowerBand * 0.999,
      direction,
      trapType: 'BOLLINGER',
      confidence: 90,
      leverage: 15,
      estimatedCascadeSize: 0.04,
      activated: false
    };
  }
  
  static calcSMA(data: Float64Array, period: number): number {
    const slice = data.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }
  
  static calcStdDev(data: Float64Array, period: number): number {
    const slice = data.slice(-period);
    const mean = this.calcSMA(data, period);
    const squaredDiffs = Array.from(slice).map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / period;
    return Math.sqrt(variance);
  }
}
```


### 3. Exchange Clients (Binance + Bybit)

**Binance Spot Client** (Signal Validator):
```typescript
class BinanceSpotClient {
  private ws: WebSocket | null = null;
  private callbacks: Map<string, (trades: Trade[]) => void> = new Map();
  
  async subscribeAggTrades(symbols: string[]): Promise<void> {
    // Close existing connection
    if (this.ws) this.ws.close();
    
    // Connect to Binance Spot WebSocket
    this.ws = new WebSocket('wss://stream.binance.com:9443/ws');
    
    this.ws.on('open', () => {
      // Subscribe to aggregate trades for all symbols
      const subscribeMsg = {
        method: 'SUBSCRIBE',
        params: symbols.map(s => `${s.toLowerCase()}@aggTrade`),
        id: 1
      };
      this.ws!.send(JSON.stringify(subscribeMsg));
      console.log(`✅ Subscribed to Binance Spot: ${symbols.length} symbols`);
    });
    
    this.ws.on('message', (data: string) => {
      const msg = JSON.parse(data);
      
      if (msg.e === 'aggTrade') {
        const trade: Trade = {
          symbol: msg.s,
          price: parseFloat(msg.p),
          qty: parseFloat(msg.q),
          time: msg.T,
          isBuyerMaker: msg.m
        };
        
        // Trigger callback
        const callback = this.callbacks.get(msg.s);
        if (callback) {
          callback([trade]);
        }
      }
    });
    
    this.ws.on('error', (error) => {
      console.error('Binance WebSocket error:', error);
    });
    
    this.ws.on('close', () => {
      console.warn('⚠️ Binance WebSocket closed. Reconnecting in 2s...');
      setTimeout(() => this.subscribeAggTrades(symbols), 2000);
    });
  }
  
  onTrade(symbol: string, callback: (trades: Trade[]) => void): void {
    this.callbacks.set(symbol, callback);
  }
}
```

**Bybit Perps Client** (Execution):
```typescript
class BybitPerpsClient {
  private apiKey: string;
  private apiSecret: string;
  private baseURL = 'https://api.bybit.com';
  
  async fetchTopSymbols(limit: number): Promise<string[]> {
    const response = await fetch(`${this.baseURL}/v5/market/tickers?category=linear`);
    const data = await response.json();
    
    // Sort by 24h volume, return top N
    const symbols = data.result.list
      .sort((a, b) => parseFloat(b.volume24h) - parseFloat(a.volume24h))
      .slice(0, limit)
      .map(s => s.symbol);
    
    return symbols;
  }
  
  async fetchOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    const response = await fetch(
      `${this.baseURL}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    const data = await response.json();
    
    return data.result.list.map(bar => ({
      timestamp: parseInt(bar[0]),
      open: parseFloat(bar[1]),
      high: parseFloat(bar[2]),
      low: parseFloat(bar[3]),
      close: parseFloat(bar[4]),
      volume: parseFloat(bar[5])
    }));
  }
  
  async getCurrentPrice(symbol: string): Promise<number> {
    const response = await fetch(
      `${this.baseURL}/v5/market/tickers?category=linear&symbol=${symbol}`
    );
    const data = await response.json();
    return parseFloat(data.result.list[0].lastPrice);
  }
  
  async placeOrder(params: {
    symbol: string;
    side: 'Buy' | 'Sell';
    type: 'MARKET' | 'LIMIT';
    price?: number;
    qty: number;
    leverage: number;
    timeInForce?: 'IOC';
  }): Promise<any> {
    // Set leverage first
    await this.setLeverage(params.symbol, params.leverage);
    
    // Build order params
    const orderParams: any = {
      category: 'linear',
      symbol: params.symbol,
      side: params.side,
      orderType: params.type === 'MARKET' ? 'Market' : 'Limit',
      qty: params.qty.toString()
    };
    
    if (params.type === 'LIMIT') {
      orderParams.price = params.price!.toString();
      orderParams.timeInForce = params.timeInForce || 'GTC';
    }
    
    // Sign and send request
    const timestamp = Date.now();
    const signature = this.sign(orderParams, timestamp);
    
    const response = await fetch(`${this.baseURL}/v5/order/create`, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': this.apiKey,
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'X-BAPI-SIGN': signature,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderParams)
    });
    
    return await response.json();
  }
  
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    const params = {
      category: 'linear',
      symbol,
      buyLeverage: leverage.toString(),
      sellLeverage: leverage.toString()
    };
    
    const timestamp = Date.now();
    const signature = this.sign(params, timestamp);
    
    await fetch(`${this.baseURL}/v5/position/set-leverage`, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': this.apiKey,
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'X-BAPI-SIGN': signature,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
  }
  
  async setStopLoss(symbol: string, stopLoss: number): Promise<void> {
    // Implementation for setting stop loss
  }
  
  async setTakeProfit(symbol: string, takeProfit: number): Promise<void> {
    // Implementation for setting take profit
  }
  
  private sign(params: any, timestamp: number): string {
    const paramStr = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    const signStr = `${timestamp}${this.apiKey}${paramStr}`;
    return crypto.createHmac('sha256', this.apiSecret).update(signStr).digest('hex');
  }
}
```


### 4. Trap Monitor Console (Ink + React)

**Purpose**: Visualize active tripwires and their proximity to current price

**Main Dashboard Component**:
```typescript
import React from 'react';
import { Box, Text } from 'ink';

function TrapMonitor({ trapMap, sensorStatus, liveFeed, equity, pnlPct }) {
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box borderStyle="double" borderColor="cyan" padding={1}>
        <Text bold color="cyan">
          🕸️ TITAN PREDESTINATION | 💰 ${equity.toFixed(2)} (+{pnlPct.toFixed(1)}%)
        </Text>
      </Box>
      
      {/* Keyboard Shortcuts */}
      <Box marginTop={1}>
        <Text dimColor>[F1] CONFIG  [SPACE] PAUSE  [Q] QUIT</Text>
      </Box>
      
      {/* Active Tripwires Table */}
      <Box marginTop={1} borderStyle="single" borderColor="green" padding={1}>
        <Text bold color="green">🎯 ACTIVE TRIPWIRES (Waiting for victims...)</Text>
        <TrapTable traps={trapMap} />
      </Box>
      
      {/* Sensor Status */}
      <Box marginTop={1} borderStyle="single" borderColor="yellow" padding={1}>
        <Text bold color="yellow">📡 SENSOR STATUS</Text>
        <SensorStatus data={sensorStatus} />
      </Box>
      
      {/* Live Feed */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Text bold color="gray">📝 LIVE FEED</Text>
        <LiveFeed events={liveFeed} />
      </Box>
    </Box>
  );
}

function TrapTable({ traps }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header Row */}
      <Box>
        <Text bold color="white">
          COIN      CURR PRICE  TRIGGER    TYPE        LEAD TIME
        </Text>
      </Box>
      
      {/* Data Rows */}
      {Array.from(traps.entries()).map(([symbol, trapList]) => {
        const currentPrice = trapList[0].currentPrice;  // Assume updated by system
        
        return trapList.map((trap, idx) => {
          const proximity = ((trap.triggerPrice - currentPrice) / currentPrice) * 100;
          const proximityColor = Math.abs(proximity) < 0.5 ? 'red' : 'yellow';
          
          return (
            <Box key={`${symbol}-${idx}`}>
              <Text color={proximityColor}>
                {symbol.padEnd(10)}
                {currentPrice.toFixed(2).padEnd(12)}
                {trap.triggerPrice.toFixed(2).padEnd(11)}
                {trap.trapType.padEnd(12)}
                {`~${trap.estimatedLeadTime}ms`.padEnd(10)}
              </Text>
            </Box>
          );
        });
      })}
      
      {traps.size === 0 && (
        <Text dimColor>No traps set. Calculating...</Text>
      )}
    </Box>
  );
}

function SensorStatus({ data }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text>Binance Stream: </Text>
        <Text bold color={data.binanceHealth === 'OK' ? 'green' : 'red'}>
          {data.binanceHealth}
        </Text>
        <Text> ({data.binanceTickRate.toLocaleString()} ticks/sec)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Bybit Connection: </Text>
        <Text bold color={data.bybitStatus === 'ARMED' ? 'green' : 'yellow'}>
          {data.bybitStatus}
        </Text>
        <Text> (Ping: {data.bybitPing}ms)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Estimated Slippage: </Text>
        <Text color={data.slippage < 0.1 ? 'green' : 'yellow'}>
          {data.slippage.toFixed(2)}%
        </Text>
      </Box>
    </Box>
  );
}

function LiveFeed({ events }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      {events.slice(-5).map((event, idx) => (
        <Box key={idx}>
          <Text dimColor>[{new Date(event.timestamp).toLocaleTimeString()}] </Text>
          <Text color={event.type === 'TRAP_SPRUNG' ? 'green' : 'white'}>
            {event.message}
          </Text>
        </Box>
      ))}
      
      {events.length === 0 && (
        <Text dimColor>No events yet...</Text>
      )}
    </Box>
  );
}

export default TrapMonitor;
```


### 5. Configuration Manager

**Purpose**: Hot-swappable config for trap parameters

**Implementation**:
```typescript
interface TrapConfig {
  // Pre-Computation Settings
  updateInterval: number;  // 60000ms (1 minute)
  topSymbolsCount: number;  // 20
  
  // Tripwire Thresholds
  liquidationConfidence: number;  // 95
  dailyLevelConfidence: number;   // 85
  bollingerConfidence: number;    // 90
  
  // Volume Validation
  minTradesIn100ms: number;  // 50
  volumeWindowMs: number;     // 100
  
  // Execution Settings
  extremeVelocityThreshold: number;  // 0.005 (0.5%/s)
  moderateVelocityThreshold: number; // 0.001 (0.1%/s)
  aggressiveLimitMarkup: number;     // 0.002 (0.2%)
  
  // Risk Management
  maxLeverage: number;        // 20
  stopLossPercent: number;    // 0.01 (1%)
  targetPercent: number;      // 0.03 (3%)
  
  // Exchange Settings
  exchanges: {
    binance: { enabled: boolean };  // Always enabled for signal validation
    bybit: { enabled: boolean; executeOn: boolean };    // Execution target
    mexc: { enabled: boolean; executeOn: boolean };     // Execution target
  };
}

class ConfigManager {
  private config: TrapConfig;
  private readonly CONFIG_PATH = '~/.titan-scanner/config.json';
  
  constructor() {
    this.config = this.loadConfig();
  }
  
  loadConfig(): TrapConfig {
    try {
      const data = fs.readFileSync(this.CONFIG_PATH, 'utf-8');
      return JSON.parse(data);
    } catch {
      // Return defaults
      return {
        updateInterval: 60000,
        topSymbolsCount: 20,
        liquidationConfidence: 95,
        dailyLevelConfidence: 85,
        bollingerConfidence: 90,
        minTradesIn100ms: 50,
        volumeWindowMs: 100,
        extremeVelocityThreshold: 0.005,
        moderateVelocityThreshold: 0.001,
        aggressiveLimitMarkup: 0.002,
        maxLeverage: 20,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        exchanges: {
          binance: { enabled: true },  // Always enabled for signal validation
          bybit: { enabled: true, executeOn: true },
          mexc: { enabled: false, executeOn: false }
        }
      };
    }
  }
  
  saveConfig(newConfig: TrapConfig): void {
    fs.writeFileSync(this.CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    this.config = newConfig;
    console.log('✅ Config saved and applied');
  }
  
  getConfig(): TrapConfig {
    return this.config;
  }
}
```

### 6. Velocity Calculator

**Purpose**: Calculate price velocity to determine order type

**Implementation**:
```typescript
class VelocityCalculator {
  private priceHistory: Map<string, { price: number; timestamp: number }[]> = new Map();
  
  recordPrice(symbol: string, price: number, exchangeTime: number): void {
    // CRITICAL: Use exchangeTime from exchange, not Date.now()
    // This prevents velocity noise from network jitter and clock drift
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    
    const history = this.priceHistory.get(symbol)!;
    history.push({ price, timestamp: exchangeTime });
    
    // Keep only last 10 seconds (based on exchange time)
    const cutoff = exchangeTime - 10000;
    this.priceHistory.set(
      symbol,
      history.filter(h => h.timestamp > cutoff)
    );
  }
  
  calcVelocity(symbol: string): number {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length < 2) return 0;
    
    // Get prices from 5 seconds ago and now
    const now = Date.now();
    const fiveSecondsAgo = now - 5000;
    
    const recentPrices = history.filter(h => h.timestamp >= fiveSecondsAgo);
    if (recentPrices.length < 2) return 0;
    
    const oldestPrice = recentPrices[0].price;
    const newestPrice = recentPrices[recentPrices.length - 1].price;
    const timeDiff = (recentPrices[recentPrices.length - 1].timestamp - recentPrices[0].timestamp) / 1000;
    
    // Calculate % change per second
    const priceChange = (newestPrice - oldestPrice) / oldestPrice;
    const velocity = priceChange / timeDiff;
    
    return Math.abs(velocity);
  }
}
```

## Data Flow

### 1. Pre-Computation Cycle (Every 1 minute)

```
1. Fetch top 500 symbols by volume from Bybit
2. For each symbol:
   a. Fetch 1h OHLCV (100 bars)
   b. Calculate liquidation clusters (volume profile)
   c. Calculate daily levels (PDH/PDL)
   d. Calculate Bollinger breakout levels
   e. Score trap quality (volatility + volume + confluence)
3. Select top 20 symbols
4. Update Trap Map
5. Subscribe Binance Spot WebSocket to top 20
```

### 2. Detection Cycle (Real-time WebSocket)

```
1. Receive Binance Spot AggTrade tick
2. Check if price matches any tripwire (±0.1%)
3. If match:
   a. Start volume accumulation counter
   b. Count trades in 100ms window
   c. If trades >= 50:
      - Mark tripwire as ACTIVATED
      - Emit TRAP_SPRUNG event
      - Trigger Execution Layer
```

### 3. Execution Cycle (On TRAP_SPRUNG)

```
1. Calculate price velocity on Bybit (last 5 seconds)
2. Determine order type:
   - Velocity > 0.5%/s → Market Order
   - Velocity 0.1-0.5%/s → Aggressive Limit (Ask + 0.2%)
   - Velocity < 0.1%/s → Limit (Ask)
3. Calculate position size (Kelly Criterion)
4. Send order to Bybit
5. Set stop loss (-1%) and target (+3%)
6. Log execution to trades.jsonl
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
async placeOrderWithRetry(params: OrderParams, maxRetries: number = 3): Promise<any> {
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

### Trap Activation Failures

```typescript
// Prevent duplicate activations
if (trap.activated) {
  console.warn(`⚠️ Trap already activated: ${trap.symbol}`);
  return;
}

// Prevent reactivation within 5 minutes
const timeSinceActivation = Date.now() - (trap.activatedAt || 0);
if (timeSinceActivation < 300000) {
  console.warn(`⚠️ Trap cooldown: ${trap.symbol} (${Math.floor(timeSinceActivation / 1000)}s ago)`);
  return;
}
```

## Performance Optimization

### 1. TypedArray Math

All calculations use Float64Array for O(1) access and minimal garbage collection:

```typescript
const closes = new Float64Array(ohlcv.map(bar => bar.close));
const sma = this.calcSMA(closes, 20);  // No array copies
```

### 2. Lazy Trap Calculation

Tripwires are only calculated for top 20 symbols, not all 500:

```typescript
// Only calculate traps for top 20 by volume
const top20 = symbols.slice(0, 20);
for (const symbol of top20) {
  const traps = this.calculateTraps(symbol);
  this.trapMap.set(symbol, traps);
}
```

### 3. Volume Counter Optimization

Volume counters are reset immediately after validation to prevent memory leaks:

```typescript
if (counter.count >= 50) {
  this.fire(trap);
}
// Reset counter immediately
this.volumeCounters.delete(symbol);
```

## Testing Strategy

### Unit Tests

- TripwireCalculators: Test liquidation cluster, daily level, Bollinger calculations with known data
- VelocityCalculator: Test velocity calculation with mock price history
- ConfigManager: Test config loading, saving, and defaults

### Integration Tests

- Binance WebSocket: Test subscription, message parsing, reconnection
- Bybit API: Test order placement, leverage setting, stop loss/target
- TitanTrap: Test full cycle from pre-computation to execution with mock data

### Property-Based Tests

**Property 1: Tripwire Activation Idempotency**
*For any* tripwire, activating it multiple times should only execute once
**Validates: Requirements 7.6**

**Property 2: Volume Validation Consistency**
*For any* symbol, if volume validation succeeds, it should consistently trigger execution
**Validates: Requirements 3.4, 3.5**

**Property 3: Order Type Selection Determinism**
*For any* velocity value, the same velocity should always produce the same order type
**Validates: Requirements 4.2, 4.3, 4.4**


### 7. Multi-Exchange Execution Support

**Purpose**: Execute on Bybit AND/OR MEXC based on user configuration

**Exchange Gateway**:
```typescript
class ExchangeGateway {
  private bybitClient: BybitPerpsClient;
  private mexcClient: MEXCPerpsClient;
  private config: ConfigManager;
  
  async executeOnAllTargets(trap: Tripwire, orderParams: OrderParams): Promise<void> {
    const config = this.config.getConfig();
    const results: Promise<any>[] = [];
    
    // Execute on Bybit if enabled
    if (config.exchanges.bybit.enabled && config.exchanges.bybit.executeOn) {
      console.log(`🎯 Executing on Bybit: ${trap.symbol}`);
      results.push(this.bybitClient.placeOrder(orderParams));
    }
    
    // Execute on MEXC if enabled
    if (config.exchanges.mexc.enabled && config.exchanges.mexc.executeOn) {
      console.log(`🎯 Executing on MEXC: ${trap.symbol}`);
      results.push(this.mexcClient.placeOrder(orderParams));
    }
    
    // Wait for all executions
    const fills = await Promise.allSettled(results);
    
    // Log results
    fills.forEach((result, idx) => {
      const exchange = idx === 0 ? 'Bybit' : 'MEXC';
      if (result.status === 'fulfilled') {
        console.log(`✅ ${exchange} order filled: ${trap.symbol}`);
      } else {
        console.error(`❌ ${exchange} order failed: ${result.reason}`);
      }
    });
  }
}
```

**MEXC Perps Client**:
```typescript
class MEXCPerpsClient {
  private apiKey: string;
  private apiSecret: string;
  private baseURL = 'https://contract.mexc.com';
  
  async placeOrder(params: {
    symbol: string;
    side: 'Buy' | 'Sell';
    type: 'MARKET' | 'LIMIT';
    price?: number;
    qty: number;
    leverage: number;
  }): Promise<any> {
    // Set leverage first
    await this.setLeverage(params.symbol, params.leverage);
    
    // Build order params (MEXC format)
    const orderParams: any = {
      symbol: params.symbol,
      side: params.side === 'Buy' ? 1 : 2,  // MEXC uses 1=Open Long, 2=Open Short
      type: params.type === 'MARKET' ? 5 : 1,  // 5=Market, 1=Limit
      vol: params.qty,
      openType: 1  // Isolated margin
    };
    
    if (params.type === 'LIMIT') {
      orderParams.price = params.price;
    }
    
    // Sign and send request
    const timestamp = Date.now();
    const signature = this.sign(orderParams, timestamp);
    
    const response = await fetch(`${this.baseURL}/api/v1/private/order/submit`, {
      method: 'POST',
      headers: {
        'ApiKey': this.apiKey,
        'Request-Time': timestamp.toString(),
        'Signature': signature,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderParams)
    });
    
    return await response.json();
  }
  
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    const params = {
      symbol,
      leverage,
      openType: 1  // Isolated
    };
    
    const timestamp = Date.now();
    const signature = this.sign(params, timestamp);
    
    await fetch(`${this.baseURL}/api/v1/private/position/change_leverage`, {
      method: 'POST',
      headers: {
        'ApiKey': this.apiKey,
        'Request-Time': timestamp.toString(),
        'Signature': signature,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
  }
  
  private sign(params: any, timestamp: number): string {
    const paramStr = `${this.apiKey}${timestamp}${JSON.stringify(params)}`;
    return crypto.createHmac('sha256', this.apiSecret).update(paramStr).digest('hex');
  }
}
```

**Updated TitanTrap.fire() method**:
```typescript
async fire(trap: Tripwire): Promise<void> {
  trap.activated = true;
  trap.activatedAt = Date.now();
  
  // Calculate price velocity (use Bybit as reference)
  const bybitPrice = await this.bybitClient.getCurrentPrice(trap.symbol);
  const velocity = await this.calcVelocity(trap.symbol);
  
  // Determine order type based on velocity
  let orderType: 'MARKET' | 'LIMIT';
  let limitPrice: number | undefined;
  
  if (velocity > 0.005) {
    orderType = 'MARKET';
    console.log(`🚀 Using MARKET order (velocity: ${(velocity * 100).toFixed(2)}%/s)`);
  } else if (velocity > 0.001) {
    orderType = 'LIMIT';
    limitPrice = trap.direction === 'LONG' 
      ? bybitPrice * 1.002
      : bybitPrice * 0.998;
    console.log(`⚡ Using AGGRESSIVE LIMIT at ${limitPrice}`);
  } else {
    orderType = 'LIMIT';
    limitPrice = trap.direction === 'LONG' 
      ? bybitPrice * 1.0001
      : bybitPrice * 0.9999;
    console.log(`📍 Using LIMIT at ${limitPrice}`);
  }
  
  // Calculate position size
  const equity = await this.getEquity();
  const positionSize = this.calcPositionSize(equity, trap.confidence, trap.leverage);
  
  // Execute on all enabled exchanges
  await this.exchangeGateway.executeOnAllTargets(trap, {
    symbol: trap.symbol,
    side: trap.direction === 'LONG' ? 'Buy' : 'Sell',
    type: orderType,
    price: limitPrice,
    qty: positionSize,
    leverage: trap.leverage
  });
}
```


## Structural Flaw Strategies (Bulgaria-Optimized)

**Philosophy**: We don't compete on speed. We exploit **structural imbalances** that take minutes to resolve, making 200ms latency irrelevant.

### Strategy 1: OI Wipeout (The V-Shape Catch)

**The Physics**: When a massive dump happens, it's driven by long liquidations. Once liquidations finish, there are **no sellers left**. Price must bounce because selling pressure physically evaporated.

**The Edge**: You don't catch the falling knife. You wait for the "Pop." Recovery takes 5-15 minutes - plenty of time for Bulgaria.

**Implementation**:
```typescript
class OIWipeoutDetector {
  private oiHistory: Map<string, { oi: number; timestamp: number }[]> = new Map();
  
  async detectWipeout(symbol: string): Promise<Tripwire | null> {
    // 1. Get current Open Interest
    const currentOI = await this.bybitClient.getOpenInterest(symbol);
    const currentPrice = await this.bybitClient.getCurrentPrice(symbol);
    
    // 2. Get OI from 5 minutes ago
    const history = this.oiHistory.get(symbol) || [];
    const fiveMinAgo = history.find(h => Date.now() - h.timestamp >= 300000);
    
    if (!fiveMinAgo) return null;
    
    // 3. Calculate OI drop %
    const oiDrop = (fiveMinAgo.oi - currentOI) / fiveMinAgo.oi;
    
    // 4. Calculate price drop %
    const priceHistory = await this.bybitClient.fetchOHLCV(symbol, '1m', 5);
    const priceStart = priceHistory[0].close;
    const priceDrop = (priceStart - currentPrice) / priceStart;
    
    // 5. Check conditions
    const isPriceDump = priceDrop > 0.03;  // > 3% drop
    const isOIWipeout = oiDrop > 0.20;     // > 20% OI drop
    
    if (!isPriceDump || !isOIWipeout) return null;
    
    // 6. Check CVD flip (Red → Green)
    const cvd = await this.calcCVD(symbol, 60);  // Last 1 minute
    const isCVDGreen = cvd > 0;  // Buying pressure returning
    
    if (!isCVDGreen) return null;
    
    // 7. Calculate retracement target (50% of dump)
    const dumpSize = priceStart - currentPrice;
    const targetPrice = currentPrice + (dumpSize * 0.5);
    
    console.log(`💀 OI WIPEOUT DETECTED: ${symbol}`);
    console.log(`   Price Drop: ${(priceDrop * 100).toFixed(1)}%`);
    console.log(`   OI Drop: ${(oiDrop * 100).toFixed(1)}%`);
    console.log(`   CVD: ${cvd > 0 ? 'GREEN' : 'RED'}`);
    
    return {
      symbol,
      triggerPrice: currentPrice,  // Enter immediately
      direction: 'LONG',
      trapType: 'OI_WIPEOUT',
      confidence: 95,
      leverage: 20,
      estimatedCascadeSize: 0.05,  // 5% bounce expected
      activated: false,
      targetPrice,
      stopLoss: currentPrice * 0.98  // -2% stop
    };
  }
  
  recordOI(symbol: string, oi: number): void {
    if (!this.oiHistory.has(symbol)) {
      this.oiHistory.set(symbol, []);
    }
    
    const history = this.oiHistory.get(symbol)!;
    history.push({ oi, timestamp: Date.now() });
    
    // Keep only last 10 minutes
    const cutoff = Date.now() - 600000;
    this.oiHistory.set(
      symbol,
      history.filter(h => h.timestamp > cutoff)
    );
  }
}
```

### Strategy 2: Predatory Funding Squeeze

**The Physics**: When funding rate is highly negative (shorts pay longs), but price stops dropping, shorts are trapped. They're paying to hold a losing position.

**The Edge**: This is a "pressure cooker" that builds over hours/minutes. When it pops, it pops hard (10-20%). Your latency is irrelevant.

**Implementation**:
```typescript
class FundingSqueezeDetector {
  async detectSqueeze(symbol: string): Promise<Tripwire | null> {
    // 1. Get current funding rate
    const fundingRate = await this.bybitClient.getFundingRate(symbol);
    
    // 2. Check if funding is highly negative (shorts crowded)
    if (fundingRate > -0.0002) return null;  // Not negative enough
    
    console.log(`🔍 Checking funding squeeze: ${symbol} (Funding: ${(fundingRate * 100).toFixed(3)}%)`);
    
    // 3. Check if price is making higher lows (shorts trapped)
    const ohlcv = await this.bybitClient.fetchOHLCV(symbol, '5m', 20);
    const recentLows = ohlcv.slice(-3).map(bar => bar.low);
    const isHigherLow = recentLows[2] > recentLows[1] && recentLows[1] > recentLows[0];
    
    if (!isHigherLow) return null;
    
    // 4. Check if CVD is rising (whales absorbing shorts)
    const cvd = await this.calcCVD(symbol, 300);  // Last 5 minutes
    const previousCVD = await this.calcCVD(symbol, 600, 300);  // 5-10 min ago
    const isCVDRising = cvd > previousCVD;
    
    if (!isCVDRising) return null;
    
    // 5. Calculate liquidation target (estimate where shorts get liquidated)
    const currentPrice = ohlcv[ohlcv.length - 1].close;
    const recentHigh = Math.max(...ohlcv.slice(-10).map(bar => bar.high));
    const liquidationTarget = recentHigh * 1.02;  // +2% above recent high
    
    console.log(`⚡ FUNDING SQUEEZE DETECTED: ${symbol}`);
    console.log(`   Funding Rate: ${(fundingRate * 100).toFixed(3)}%`);
    console.log(`   Higher Low: YES`);
    console.log(`   CVD Rising: YES`);
    
    return {
      symbol,
      triggerPrice: currentPrice * 1.001,  // Slight markup for entry
      direction: 'LONG',
      trapType: 'FUNDING_SQUEEZE',
      confidence: 90,
      leverage: 15,
      estimatedCascadeSize: 0.10,  // 10% squeeze expected
      activated: false,
      targetPrice: liquidationTarget,
      stopLoss: recentLows[2] * 0.995  // Below recent low
    };
  }
}
```

### Strategy 3: Spot-Perp Basis Arb (The Rubber Band)

**The Physics**: During extreme volatility, Perp price disconnects from Spot. Perp **must** return to Spot price - it's mathematical law.

**The Edge**: HFTs close this gap, but during panic they widen spreads or turn off. That leaves a 5-30 second window - you can drive a truck through it from Bulgaria.

**Implementation**:
```typescript
class BasisArbDetector {
  async detectBasisArb(symbol: string): Promise<Tripwire | null> {
    // 1. Get Spot price from Binance
    const spotPrice = await this.binanceClient.getSpotPrice(symbol);
    
    // 2. Get Perp price from Bybit
    const perpPrice = await this.bybitClient.getCurrentPrice(symbol);
    
    // 3. Calculate basis
    const basis = (spotPrice - perpPrice) / spotPrice;
    
    // 4. Check if basis exceeds threshold (Perp is discounted)
    if (basis < 0.005) return null;  // < 0.5% basis
    
    console.log(`🎯 BASIS ARB DETECTED: ${symbol}`);
    console.log(`   Spot: ${spotPrice.toFixed(2)}`);
    console.log(`   Perp: ${perpPrice.toFixed(2)}`);
    console.log(`   Basis: ${(basis * 100).toFixed(2)}%`);
    
    // 5. Validate with volume (ensure it's not a dead market)
    const volume = await this.bybitClient.get24hVolume(symbol);
    if (volume < 1000000) return null;  // < $1M volume
    
    // 6. Calculate target (Perp converges to Spot)
    const targetPrice = spotPrice * 0.999;  // Slight discount for safety
    
    return {
      symbol,
      triggerPrice: perpPrice * 1.001,  // Aggressive entry
      direction: 'LONG',
      trapType: 'BASIS_ARB',
      confidence: 85,
      leverage: 10,
      estimatedCascadeSize: basis,  // Expected convergence
      activated: false,
      targetPrice,
      stopLoss: perpPrice * 0.995  // -0.5% stop (tight)
    };
  }
}
```

### The Ultimate Bulgaria Protocol (Combined Strategy)

**The Setup**: Combine OI Wipeout + Leader-Follower for maximum safety and profit

**Implementation**:
```typescript
class UltimateBulgariaProtocol {
  async scan(): Promise<Tripwire | null> {
    // 1. Wait for market crash/dump
    const crashSymbols = await this.detectCrashes();
    
    for (const symbol of crashSymbols) {
      // 2. Check if OI nuked -20% (sellers are dead)
      const oiWipeout = await this.oiDetector.detectWipeout(symbol);
      if (!oiWipeout) continue;
      
      // 3. Set Leader-Follower trap on Binance Spot
      // When Binance starts V-Shape recovery, fire Long on Bybit
      const binancePrice = await this.binanceClient.getSpotPrice(symbol);
      const recoveryTrigger = binancePrice * 1.01;  // +1% recovery
      
      console.log(`🕸️ ULTIMATE TRAP SET: ${symbol}`);
      console.log(`   OI Wipeout: CONFIRMED`);
      console.log(`   Binance Trigger: ${recoveryTrigger.toFixed(2)}`);
      console.log(`   Waiting for V-Shape...`);
      
      return {
        ...oiWipeout,
        trapType: 'ULTIMATE_BULGARIA',
        binanceTrigger: recoveryTrigger,
        confidence: 98  // Highest confidence
      };
    }
    
    return null;
  }
  
  private async detectCrashes(): Promise<string[]> {
    // Scan for symbols with > 3% drop in last 5 minutes
    // CRITICAL: Filter for idiosyncratic crashes (not market-wide)
    const symbols = await this.bybitClient.fetchTopSymbols(100);
    const crashes: string[] = [];
    
    // Get BTC drop as market baseline
    const btcOHLCV = await this.bybitClient.fetchOHLCV('BTCUSDT', '1m', 5);
    const btcStart = btcOHLCV[0].close;
    const btcNow = btcOHLCV[btcOHLCV.length - 1].close;
    const btcDrop = (btcStart - btcNow) / btcStart;
    
    for (const symbol of symbols) {
      const ohlcv = await this.bybitClient.fetchOHLCV(symbol, '1m', 5);
      const priceStart = ohlcv[0].close;
      const priceNow = ohlcv[ohlcv.length - 1].close;
      const drop = (priceStart - priceNow) / priceStart;
      
      // Only flag if drop > 3% AND BTC is flat (< 0.5%)
      // This filters out market-wide crashes (beta) and finds liquidation cascades (alpha)
      if (drop > 0.03 && btcDrop < 0.005) {
        crashes.push(symbol);
        console.log(`💀 Idiosyncratic crash detected: ${symbol} (-${(drop * 100).toFixed(1)}%) vs BTC (-${(btcDrop * 100).toFixed(1)}%)`);
      }
    }
    
    return crashes;
  }
}
```

### Updated TitanTrap Integration

**Add structural flaw detectors to pre-computation layer**:
```typescript
async updateTrapMap(): Promise<void> {
  const startTime = Date.now();
  
  // Fetch top 500 symbols
  const symbols = await this.bybitClient.fetchTopSymbols(500);
  
  // Run ALL detectors in parallel
  const allTraps = await Promise.all(
    symbols.map(async (symbol) => {
      const traps: Tripwire[] = [];
      
      // Original detectors
      const liquidation = await this.calcLiquidationCluster(symbol);
      const dailyLevel = await this.calcDailyLevel(symbol);
      const bollinger = await this.calcBollingerBreakout(symbol);
      
      // NEW: Structural flaw detectors
      const oiWipeout = await this.oiDetector.detectWipeout(symbol);
      const fundingSqueeze = await this.fundingDetector.detectSqueeze(symbol);
      const basisArb = await this.basisDetector.detectBasisArb(symbol);
      const ultimate = await this.ultimateProtocol.scan();
      
      // Collect all valid traps
      if (liquidation) traps.push(liquidation);
      if (dailyLevel) traps.push(dailyLevel);
      if (bollinger) traps.push(bollinger);
      if (oiWipeout) traps.push(oiWipeout);
      if (fundingSqueeze) traps.push(fundingSqueeze);
      if (basisArb) traps.push(basisArb);
      if (ultimate) traps.push(ultimate);
      
      return { symbol, traps };
    })
  );
  
  // Filter and rank by confidence
  const validTraps = allTraps
    .filter(t => t.traps.length > 0)
    .sort((a, b) => {
      const maxConfA = Math.max(...a.traps.map(t => t.confidence));
      const maxConfB = Math.max(...b.traps.map(t => t.confidence));
      return maxConfB - maxConfA;
    })
    .slice(0, 20);
  
  // Update trap map
  this.trapMap.clear();
  for (const { symbol, traps } of validTraps) {
    this.trapMap.set(symbol, traps);
  }
  
  console.log(`✅ Trap Map updated: ${validTraps.length} symbols, ${Date.now() - startTime}ms`);
}
```

### Why This Wins from Bulgaria

1. **OI Wipeout**: Sellers are physically gone. You have 5-15 minutes to enter. Latency irrelevant.
2. **Funding Squeeze**: Builds over hours. When it pops, you have 30-60 seconds. Plenty of time.
3. **Basis Arb**: Mathematical certainty. Even with 200ms lag, you catch 80% of the move.
4. **Ultimate Protocol**: Combines OI safety + Binance validation. Highest win rate.

**The Result**: You're not fighting HFTs. You're walking onto the battlefield after the explosion and collecting the gold.


## Robustness Improvements (Final Polish)

### 1. Cached Equity (Background Loop)

**Problem**: Calling `getEquity()` during `fire()` can hang on slow API responses, causing missed trades.

**Solution**: Cache equity in background loop, read instantly during execution.

**Implementation**:
```typescript
class TitanTrap {
  private cachedEquity: number = 0;
  
  constructor() {
    // Background loop: Update equity every 5 seconds
    setInterval(async () => {
      try {
        this.cachedEquity = await this.bybitClient.getEquity();
        console.log(`💰 Equity updated: $${this.cachedEquity.toFixed(2)}`);
      } catch (error) {
        console.error('⚠️ Failed to update equity:', error);
      }
    }, 5000);
  }
  
  async fire(trap: Tripwire): Promise<void> {
    // Instant access to cached equity
    const positionSize = this.calcPositionSize(this.cachedEquity, trap.confidence, trap.leverage);
    // ... rest of execution
  }
}
```

### 2. Exchange Timestamp (Not Local Time)

**Problem**: Using `Date.now()` for velocity calculation introduces noise from network jitter and clock drift.

**Solution**: Use exchange timestamps from trade data.

**Implementation**:
```typescript
// When receiving Binance tick
onBinanceTick(symbol: string, price: number, trades: Trade[]): void {
  // Use exchange timestamp, not Date.now()
  const exchangeTime = trades[0].time;
  this.velocityCalculator.recordPrice(symbol, price, exchangeTime);
  
  // ... rest of detection logic
}
```

### 3. Idiosyncratic Crash Filter

**Problem**: A 3% drop is common for shitcoins. Not all drops are liquidation cascades.

**Solution**: Filter for idiosyncratic crashes (coin drops but BTC is flat).

**Implementation**:
```typescript
// In detectCrashes()
const btcDrop = this.calcBTCDrop();

for (const symbol of symbols) {
  const drop = this.calcDrop(symbol);
  
  // Only flag if drop > 3% AND BTC < 0.5%
  // This finds liquidation cascades (alpha), not market crashes (beta)
  if (drop > 0.03 && btcDrop < 0.005) {
    crashes.push(symbol);
  }
}
```

### 4. Trap Cooldown (Prevent Spam)

**Problem**: Same trap can fire multiple times if price oscillates around trigger.

**Solution**: Enforce 5-minute cooldown after activation.

**Implementation**:
```typescript
async fire(trap: Tripwire): Promise<void> {
  // Check cooldown
  const timeSinceActivation = Date.now() - (trap.activatedAt || 0);
  if (timeSinceActivation < 300000) {
    console.warn(`⚠️ Trap cooldown: ${trap.symbol} (${Math.floor(timeSinceActivation / 1000)}s ago)`);
    return;
  }
  
  trap.activated = true;
  trap.activatedAt = Date.now();
  
  // ... rest of execution
}
```

### 5. Order Timeout (Fail Fast)

**Problem**: If order placement hangs, you're stuck waiting while price moves.

**Solution**: Add 2-second timeout to all order placements.

**Implementation**:
```typescript
async placeOrderWithTimeout(params: OrderParams): Promise<any> {
  return Promise.race([
    this.placeOrder(params),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('ORDER_TIMEOUT')), 2000)
    )
  ]);
}
```

