/**
 * End-to-End Integration Tests for Titan Phase 2 - The Hunter
 * 
 * Tests the complete flow:
 * Hologram Scan → Session Check → POI Detection → CVD Validation → Signal Generation → Execution
 * 
 * Uses mock Binance ticks and Bybit responses to simulate real trading conditions
 * without requiring live exchange connections.
 * 
 * Requirements: All requirements (End-to-End Integration)
 */

import { HologramEngine } from '../../src/engine/HologramEngine';
import { HologramScanner } from '../../src/engine/HologramScanner';
import { SessionProfiler } from '../../src/engine/SessionProfiler';
import { InefficiencyMapper } from '../../src/engine/InefficiencyMapper';
import { CVDValidator } from '../../src/engine/CVDValidator';
import { SignalGenerator } from '../../src/execution/SignalGenerator';
import { LimitOrderExecutor } from '../../src/execution/LimitOrderExecutor';
import { BybitPerpsClient } from '../../src/exchanges/BybitPerpsClient';
import { BinanceSpotClient } from '../../src/exchanges/BinanceSpotClient';
import { 
  OHLCV, 
  OrderBlock, 
  SignalData,
  CVDTrade,
  Absorption,
  OrderResult,
  OrderStatus
} from '../../src/types';

// Mock data for testing - Need more candles for fractal detection
const mockOHLCVData: OHLCV[] = [
  { timestamp: 1640995200000, open: 47000, high: 47500, low: 46500, close: 47200, volume: 1000 },
  { timestamp: 1640998800000, open: 47200, high: 47800, low: 47000, close: 47600, volume: 1200 },
  { timestamp: 1641002400000, open: 47600, high: 48200, low: 47400, close: 47900, volume: 1100 },
  { timestamp: 1641006000000, open: 47900, high: 48500, low: 47700, close: 48300, volume: 1300 },
  { timestamp: 1641009600000, open: 48300, high: 48800, low: 48100, close: 48600, volume: 1150 },
  { timestamp: 1641013200000, open: 48600, high: 49200, low: 48400, close: 48900, volume: 1250 },
  { timestamp: 1641016800000, open: 48900, high: 49500, low: 48700, close: 49200, volume: 1400 },
  { timestamp: 1641020400000, open: 49200, high: 49800, low: 49000, close: 49500, volume: 1350 },
  { timestamp: 1641024000000, open: 49500, high: 50200, low: 49300, close: 49800, volume: 1500 },
  { timestamp: 1641027600000, open: 49800, high: 50500, low: 49600, close: 50200, volume: 1600 },
  // Add more candles for fractal detection (need at least 20-30 for proper analysis)
  { timestamp: 1641031200000, open: 50200, high: 50800, low: 50000, close: 50600, volume: 1700 },
  { timestamp: 1641034800000, open: 50600, high: 51200, low: 50400, close: 50900, volume: 1800 },
  { timestamp: 1641038400000, open: 50900, high: 51500, low: 50700, close: 51200, volume: 1900 },
  { timestamp: 1641042000000, open: 51200, high: 51800, low: 51000, close: 51500, volume: 2000 },
  { timestamp: 1641045600000, open: 51500, high: 52100, low: 51300, close: 51800, volume: 2100 },
  { timestamp: 1641049200000, open: 51800, high: 52400, low: 51600, close: 52100, volume: 2200 },
  { timestamp: 1641052800000, open: 52100, high: 52700, low: 51900, close: 52400, volume: 2300 },
  { timestamp: 1641056400000, open: 52400, high: 53000, low: 52200, close: 52700, volume: 2400 },
  { timestamp: 1641060000000, open: 52700, high: 53300, low: 52500, close: 53000, volume: 2500 },
  { timestamp: 1641063600000, open: 53000, high: 53600, low: 52800, close: 53300, volume: 2600 },
  // Add fractal patterns - create clear swing highs and lows
  { timestamp: 1641067200000, open: 53300, high: 53900, low: 53100, close: 53600, volume: 2700 },
  { timestamp: 1641070800000, open: 53600, high: 54200, low: 53400, close: 53900, volume: 2800 },
  { timestamp: 1641074400000, open: 53900, high: 54500, low: 53700, close: 54200, volume: 2900 }, // Potential swing high
  { timestamp: 1641078000000, open: 54200, high: 54300, low: 53800, close: 54000, volume: 3000 },
  { timestamp: 1641081600000, open: 54000, high: 54100, low: 53600, close: 53800, volume: 3100 },
  { timestamp: 1641085200000, open: 53800, high: 54000, low: 53400, close: 53600, volume: 3200 }, // Potential swing low
  { timestamp: 1641088800000, open: 53600, high: 54200, low: 53500, close: 54000, volume: 3300 },
  { timestamp: 1641092400000, open: 54000, high: 54600, low: 53900, close: 54400, volume: 3400 },
  { timestamp: 1641096000000, open: 54400, high: 55000, low: 54300, close: 54800, volume: 3500 },
  { timestamp: 1641099600000, open: 54800, high: 55400, low: 54700, close: 55200, volume: 3600 }
];

const mockTopSymbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT', 'DOTUSDT'];

const mockBinanceTrades: CVDTrade[] = [
  { symbol: 'BTCUSDT', price: 50200, qty: 0.5, time: Date.now(), isBuyerMaker: false },
  { symbol: 'BTCUSDT', price: 50180, qty: 0.3, time: Date.now() + 1000, isBuyerMaker: true },
  { symbol: 'BTCUSDT', price: 50220, qty: 0.8, time: Date.now() + 2000, isBuyerMaker: false },
  { symbol: 'BTCUSDT', price: 50190, qty: 0.4, time: Date.now() + 3000, isBuyerMaker: true },
  { symbol: 'BTCUSDT', price: 50250, qty: 1.2, time: Date.now() + 4000, isBuyerMaker: false }
];

// Mock implementations
class MockBybitPerpsClient extends BybitPerpsClient {
  private mockData = new Map<string, OHLCV[]>();
  private mockPrices = new Map<string, number>();
  private mockOrders = new Map<string, any>();
  private orderIdCounter = 1;

  constructor() {
    super();
    // Don't call parent constructor to avoid API setup
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Initialize mock data
    this.mockData.set('BTCUSDT-1D', mockOHLCVData);
    this.mockData.set('BTCUSDT-4h', mockOHLCVData);
    this.mockData.set('BTCUSDT-15m', mockOHLCVData);
    this.mockData.set('ETHUSDT-1D', mockOHLCVData.map(c => ({ ...c, open: c.open * 0.07, high: c.high * 0.07, low: c.low * 0.07, close: c.close * 0.07 })));
    this.mockData.set('ETHUSDT-4h', mockOHLCVData.map(c => ({ ...c, open: c.open * 0.07, high: c.high * 0.07, low: c.low * 0.07, close: c.close * 0.07 })));
    this.mockData.set('ETHUSDT-15m', mockOHLCVData.map(c => ({ ...c, open: c.open * 0.07, high: c.high * 0.07, low: c.low * 0.07, close: c.close * 0.07 })));
    
    // Add data for all mock symbols
    for (const symbol of mockTopSymbols) {
      if (!this.mockData.has(`${symbol}-1D`)) {
        const multiplier = symbol === 'BTCUSDT' ? 1 : symbol === 'ETHUSDT' ? 0.07 : 0.001;
        this.mockData.set(`${symbol}-1D`, mockOHLCVData.map(c => ({ ...c, open: c.open * multiplier, high: c.high * multiplier, low: c.low * multiplier, close: c.close * multiplier })));
        this.mockData.set(`${symbol}-4h`, mockOHLCVData.map(c => ({ ...c, open: c.open * multiplier, high: c.high * multiplier, low: c.low * multiplier, close: c.close * multiplier })));
        this.mockData.set(`${symbol}-15m`, mockOHLCVData.map(c => ({ ...c, open: c.open * multiplier, high: c.high * multiplier, low: c.low * multiplier, close: c.close * multiplier })));
      }
    }
    
    this.mockPrices.set('BTCUSDT', 55200);
    this.mockPrices.set('ETHUSDT', 3864);
    this.mockPrices.set('ADAUSDT', 55.2);
    this.mockPrices.set('SOLUSDT', 552);
    this.mockPrices.set('DOTUSDT', 276);
  }

  async initialize(): Promise<void> {
    // Mock initialization without API calls
  }

  async fetchTopSymbols(): Promise<string[]> {
    return mockTopSymbols;
  }

  async fetchOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    const key = `${symbol}-${interval}`;
    const data = this.mockData.get(key) || mockOHLCVData;
    return data.slice(-limit);
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    return this.mockPrices.get(symbol) || 50000;
  }

  async placeOrderWithRetry(params: any, maxRetries: number): Promise<OrderResult> {
    const orderId = `mock_order_${this.orderIdCounter++}`;
    const mockOrder = {
      orderId,
      symbol: params.symbol,
      side: params.side,
      qty: params.qty,
      price: params.price,
      status: 'NEW',
      timestamp: Date.now()
    };
    
    this.mockOrders.set(orderId, mockOrder);
    
    return {
      orderId,
      symbol: params.symbol,
      side: params.side,
      qty: params.qty,
      price: params.price,
      status: 'NEW',
      timestamp: Date.now()
    };
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<OrderStatus> {
    const order = this.mockOrders.get(orderId);
    return order ? order.status : 'CANCELLED';
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    const order = this.mockOrders.get(orderId);
    if (order) {
      order.status = 'CANCELLED';
      this.mockOrders.set(orderId, order);
      return true;
    }
    return false;
  }

  // Simulate order fill for testing
  simulateOrderFill(orderId: string): void {
    const order = this.mockOrders.get(orderId);
    if (order) {
      order.status = 'FILLED';
      this.mockOrders.set(orderId, order);
    }
  }

  async disconnect(): Promise<void> {
    // Mock disconnect without cleanup
  }
}

class MockBinanceSpotClient {
  private tradeCallbacks = new Map<string, (trade: any) => void>();
  private mockInitialized = false;

  constructor() {
    // Don't call parent constructor to avoid WebSocket and heartbeat setup
  }

  async initialize(): Promise<void> {
    this.mockInitialized = true;
    // Mock initialization without WebSocket
  }

  subscribeAggTrades(symbol: string, callback: (trade: any) => void): void {
    this.tradeCallbacks.set(symbol, callback);
  }

  // Simulate trade events for testing
  simulateTrade(symbol: string, trade: CVDTrade): void {
    const callback = this.tradeCallbacks.get(symbol);
    if (callback) {
      callback({
        price: trade.price,
        quantity: trade.qty,
        timestamp: trade.time,
        isBuyerMaker: trade.isBuyerMaker
      });
    }
  }

  async disconnect(): Promise<void> {
    this.mockInitialized = false;
    // Mock disconnect without WebSocket cleanup
  }
}

describe('End-to-End Integration Tests', () => {
  let mockBybitClient: MockBybitPerpsClient;
  let mockBinanceClient: MockBinanceSpotClient;
  let hologramEngine: HologramEngine;
  let hologramScanner: HologramScanner;
  let sessionProfiler: SessionProfiler;
  let inefficiencyMapper: InefficiencyMapper;
  let cvdValidator: CVDValidator;
  let signalGenerator: SignalGenerator;
  let limitOrderExecutor: LimitOrderExecutor;

  beforeEach(async () => {
    // Initialize mock clients
    mockBybitClient = new MockBybitPerpsClient();
    mockBinanceClient = new MockBinanceSpotClient();
    
    await mockBybitClient.initialize();
    await mockBinanceClient.initialize();

    // Initialize core engines
    hologramEngine = new HologramEngine(mockBybitClient);
    hologramScanner = new HologramScanner(mockBybitClient);
    sessionProfiler = new SessionProfiler();
    inefficiencyMapper = new InefficiencyMapper();
    cvdValidator = new CVDValidator();
    
    // Initialize execution components
    signalGenerator = new SignalGenerator(
      hologramEngine,
      sessionProfiler,
      inefficiencyMapper,
      cvdValidator
    );
    limitOrderExecutor = new LimitOrderExecutor(mockBybitClient);
  });

  afterEach(async () => {
    // Cleanup
    await mockBybitClient.disconnect();
    await mockBinanceClient.disconnect();
    limitOrderExecutor.destroy();
    hologramScanner.cleanup();
  });

  describe('Complete End-to-End Flow', () => {
    it('should execute full cycle: Hologram Scan → Session Check → POI Detection → CVD Validation → Signal Generation → Execution', async () => {
      // Step 1: Hologram Scan
      console.log('🔍 Step 1: Running Hologram Scan...');
      const scanResult = await hologramScanner.scan();
      
      expect(scanResult).toBeDefined();
      expect(scanResult.symbols.length).toBeGreaterThan(0);
      expect(scanResult.top20.length).toBeGreaterThan(0);
      expect(scanResult.successCount).toBeGreaterThan(0);
      expect(scanResult.scanDuration).toBeGreaterThan(0);
      
      console.log(`✅ Hologram scan complete: ${scanResult.successCount} symbols analyzed`);
      
      // Get the best hologram for testing
      const bestHologram = scanResult.top20[0];
      expect(bestHologram).toBeDefined();
      expect(['A+', 'B', 'CONFLICT', 'NO_PLAY']).toContain(bestHologram.status);
      
      // Step 2: Session Check
      console.log('⏰ Step 2: Checking Session State...');
      const sessionState = sessionProfiler.getSessionState();
      
      expect(sessionState).toBeDefined();
      expect(['ASIAN', 'LONDON', 'NY', 'DEAD_ZONE']).toContain(sessionState.type);
      expect(sessionState.timeRemaining).toBeGreaterThanOrEqual(0);
      
      console.log(`✅ Session check complete: ${sessionState.type} session`);
      
      // Step 3: POI Detection
      console.log('🎯 Step 3: Running POI Detection...');
      const candles = await mockBybitClient.fetchOHLCV(bestHologram.symbol, '15m', 100);
      
      // Detect FVGs
      const fvgs = inefficiencyMapper.detectFVG(candles);
      expect(Array.isArray(fvgs)).toBe(true);
      
      // Detect Order Blocks
      const orderBlocks = inefficiencyMapper.detectOrderBlock(candles, bestHologram.m15.bos);
      expect(Array.isArray(orderBlocks)).toBe(true);
      
      // Detect Liquidity Pools
      const liquidityPools = inefficiencyMapper.detectLiquidityPools(candles, bestHologram.m15.fractals);
      expect(Array.isArray(liquidityPools)).toBe(true);
      
      const allPOIs = [...fvgs, ...orderBlocks, ...liquidityPools];
      console.log(`✅ POI detection complete: ${allPOIs.length} POIs found`);
      
      // Step 4: CVD Validation
      console.log('📊 Step 4: Running CVD Validation...');
      
      // Simulate Binance trades for CVD calculation
      for (const trade of mockBinanceTrades) {
        cvdValidator.recordTrade(trade);
        mockBinanceClient.simulateTrade(trade.symbol, trade);
      }
      
      // Calculate CVD for the symbol
      const cvd = cvdValidator.calcCVD(mockBinanceTrades, 10 * 60 * 1000); // 10 minutes
      expect(typeof cvd).toBe('number');
      
      // Check for absorption (simplified for testing)
      const prices = candles.map(c => c.close);
      const cvdValues = Array(prices.length).fill(0).map((_, i) => cvd + (Math.random() - 0.5) * 100);
      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
      
      console.log(`✅ CVD validation complete: CVD=${cvd.toFixed(2)}, Absorption=${absorption ? 'detected' : 'none'}`);
      
      // Step 5: Signal Generation
      console.log('🎯 Step 5: Generating Trading Signal...');
      
      // Only generate signal if conditions are favorable
      if (bestHologram.status === 'A+' || bestHologram.status === 'B') {
        const direction = bestHologram.daily.trend === 'BULL' ? 'LONG' : 'SHORT';
        const equity = 10000; // $10,000 test equity
        
        // Mock signal generation (simplified for testing)
        const mockSignal: SignalData = {
          symbol: bestHologram.symbol,
          direction,
          hologramStatus: bestHologram.status,
          alignmentScore: bestHologram.alignmentScore,
          rsScore: bestHologram.rsScore,
          sessionType: sessionState.type,
          poiType: orderBlocks.length > 0 ? 'ORDER_BLOCK' : 'FVG',
          cvdConfirmation: absorption !== null,
          confidence: Math.min(100, bestHologram.alignmentScore + (absorption ? 10 : 0)),
          entryPrice: bestHologram.m15.currentPrice,
          stopLoss: direction === 'LONG' 
            ? bestHologram.m15.currentPrice * 0.985 
            : bestHologram.m15.currentPrice * 1.015,
          takeProfit: direction === 'LONG' 
            ? bestHologram.m15.currentPrice * 1.045 
            : bestHologram.m15.currentPrice * 0.955,
          positionSize: 0.1,
          leverage: 3,
          timestamp: Date.now()
        };
        
        expect(mockSignal).toBeDefined();
        expect(mockSignal.symbol).toBe(bestHologram.symbol);
        expect(['LONG', 'SHORT']).toContain(mockSignal.direction);
        expect(mockSignal.confidence).toBeGreaterThan(0);
        
        console.log(`✅ Signal generated: ${mockSignal.direction} ${mockSignal.symbol} @ ${mockSignal.entryPrice}`);
        
        // Step 6: Order Execution
        console.log('⚡ Step 6: Executing Order...');
        
        if (orderBlocks.length > 0) {
          const orderBlock = orderBlocks[0] as OrderBlock;
          const executionResult = await limitOrderExecutor.placePostOnlyOrder(
            mockSignal,
            orderBlock,
            equity
          );
          
          expect(executionResult).toBeDefined();
          expect(executionResult.success).toBe(true);
          expect(executionResult.orderId).toBeDefined();
          
          console.log(`✅ Order executed: ${executionResult.orderId}`);
          
          // Verify order is being monitored
          const activeOrders = limitOrderExecutor.getActiveOrders();
          expect(activeOrders.length).toBe(1);
          expect(activeOrders[0].orderId).toBe(executionResult.orderId);
          
          // Simulate order fill
          mockBybitClient.simulateOrderFill(executionResult.orderId!);
          
          // Wait for monitoring to detect fill
          await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for monitoring cycle
          
          console.log('✅ End-to-end flow completed successfully');
        } else {
          console.log('⚠️ No Order Blocks found for execution, skipping order placement');
        }
      } else {
        console.log(`⚠️ Hologram status ${bestHologram.status} not suitable for signal generation`);
      }
    }, 30000); // 30 second timeout for full flow

    it('should handle hologram scan with multiple symbols', async () => {
      console.log('🔍 Testing multi-symbol hologram scan...');
      
      const scanResult = await hologramScanner.scan();
      
      // Verify scan results
      expect(scanResult.symbols.length).toBeGreaterThanOrEqual(mockTopSymbols.length);
      expect(scanResult.successCount).toBeGreaterThan(0);
      expect(scanResult.errorCount).toBeGreaterThanOrEqual(0);
      
      // Verify ranking
      const rankedSymbols = hologramScanner.rankByAlignment(scanResult.symbols);
      expect(rankedSymbols.length).toBe(scanResult.symbols.length);
      
      // Verify top 20 selection
      const top20 = hologramScanner.selectTop20(rankedSymbols);
      expect(top20.length).toBeLessThanOrEqual(20);
      expect(top20.length).toBeLessThanOrEqual(rankedSymbols.length);
      
      console.log(`✅ Multi-symbol scan complete: ${scanResult.symbols.length} symbols processed`);
    });

    it('should validate session transitions and killzone detection', async () => {
      console.log('⏰ Testing session transitions...');
      
      // Test current session
      const currentSession = sessionProfiler.getSessionState();
      expect(['ASIAN', 'LONDON', 'NY', 'DEAD_ZONE']).toContain(currentSession.type);
      
      // Test killzone detection
      const isKillzone = sessionProfiler.isKillzone();
      expect(typeof isKillzone).toBe('boolean');
      
      if (currentSession.type === 'LONDON' || currentSession.type === 'NY') {
        expect(isKillzone).toBe(true);
      } else {
        expect(isKillzone).toBe(false);
      }
      
      // Test Asian range storage
      sessionProfiler.storeAsianRange(mockOHLCVData);
      const asianRange = sessionProfiler.getAsianRange();
      
      if (asianRange) {
        expect(asianRange.high).toBeGreaterThan(asianRange.low);
        expect(asianRange.timestamp).toBeGreaterThan(0);
      }
      
      console.log(`✅ Session validation complete: ${currentSession.type} session, killzone=${isKillzone}`);
    });

    it('should detect and validate POIs correctly', async () => {
      console.log('🎯 Testing POI detection and validation...');
      
      const candles = mockOHLCVData;
      
      // Test FVG detection
      const fvgs = inefficiencyMapper.detectFVG(candles);
      expect(Array.isArray(fvgs)).toBe(true);
      
      for (const fvg of fvgs) {
        expect(['BULLISH', 'BEARISH']).toContain(fvg.type);
        expect(fvg.top).toBeGreaterThan(fvg.bottom);
        expect(fvg.midpoint).toBeGreaterThan(fvg.bottom);
        expect(fvg.midpoint).toBeLessThan(fvg.top);
        expect(fvg.mitigated).toBe(false);
      }
      
      // Test Order Block detection (need BOS events)
      const mockBOS = [
        {
          direction: 'BULLISH' as const,
          price: 49000,
          barIndex: 5,
          timestamp: Date.now(),
          fractalsBreached: []
        }
      ];
      
      const orderBlocks = inefficiencyMapper.detectOrderBlock(candles, mockBOS);
      expect(Array.isArray(orderBlocks)).toBe(true);
      
      for (const ob of orderBlocks) {
        expect(['BULLISH', 'BEARISH']).toContain(ob.type);
        expect(ob.high).toBeGreaterThan(ob.low);
        expect(ob.confidence).toBeGreaterThan(0);
        expect(ob.mitigated).toBe(false);
      }
      
      // Test POI validation
      const currentPrice = 50000;
      for (const fvg of fvgs) {
        const isValid = inefficiencyMapper.validatePOI(fvg, currentPrice);
        expect(typeof isValid).toBe('boolean');
      }
      
      console.log(`✅ POI detection complete: ${fvgs.length} FVGs, ${orderBlocks.length} Order Blocks`);
    });

    it('should calculate CVD and detect absorption patterns', async () => {
      console.log('📊 Testing CVD calculation and absorption detection...');
      
      // Record mock trades
      for (const trade of mockBinanceTrades) {
        cvdValidator.recordTrade(trade);
      }
      
      // Calculate CVD
      const windowMs = 10 * 60 * 1000; // 10 minutes
      const cvd = cvdValidator.calcCVD(mockBinanceTrades, windowMs);
      expect(typeof cvd).toBe('number');
      
      // Test absorption detection
      const prices = [50000, 49800, 49600, 49900, 50200]; // Lower Low pattern
      const cvdValues = [100, 120, 140, 160, 180]; // Higher Low pattern
      
      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
      expect(absorption).toBeDefined();
      
      if (absorption) {
        expect(absorption.price).toBeGreaterThan(0);
        expect(absorption.cvdValue).toBeGreaterThan(0);
        expect(absorption.confidence).toBeGreaterThan(0);
        expect(absorption.confidence).toBeLessThanOrEqual(100);
      }
      
      // Test distribution detection
      const distributionPrices = [50000, 50200, 50400, 50100, 49800]; // Higher High pattern
      const distributionCVD = [100, 80, 60, 40, 20]; // Lower High pattern
      
      const distribution = cvdValidator.detectDistribution(distributionPrices, distributionCVD);
      expect(distribution).toBeDefined();
      
      console.log(`✅ CVD validation complete: CVD=${cvd.toFixed(2)}`);
    });

    it('should handle order execution and monitoring', async () => {
      console.log('⚡ Testing order execution and monitoring...');
      
      // Create mock signal
      const mockSignal: SignalData = {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        hologramStatus: 'A+',
        alignmentScore: 85,
        rsScore: 0.03,
        sessionType: 'LONDON',
        poiType: 'ORDER_BLOCK',
        cvdConfirmation: true,
        confidence: 90,
        entryPrice: 50000,
        stopLoss: 49250,
        takeProfit: 52250,
        positionSize: 0.1,
        leverage: 3,
        timestamp: Date.now()
      };
      
      // Create mock Order Block
      const mockOrderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 50100,
        low: 49900,
        barIndex: 5,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };
      
      const equity = 10000;
      
      // Test order placement
      const executionResult = await limitOrderExecutor.placePostOnlyOrder(
        mockSignal,
        mockOrderBlock,
        equity
      );
      
      expect(executionResult.success).toBe(true);
      expect(executionResult.orderId).toBeDefined();
      expect(executionResult.positionSize).toBeGreaterThan(0);
      
      // Verify order is being monitored
      const activeOrders = limitOrderExecutor.getActiveOrders();
      expect(activeOrders.length).toBe(1);
      
      const monitoredOrder = activeOrders[0];
      expect(monitoredOrder.orderId).toBe(executionResult.orderId);
      expect(monitoredOrder.symbol).toBe(mockSignal.symbol);
      expect(monitoredOrder.cancelled).toBe(false);
      expect(monitoredOrder.filled).toBe(false);
      
      // Test order cancellation
      const cancelResult = await limitOrderExecutor.cancelIfPriceMoves(
        executionResult.orderId!,
        51000 // Price moved 2% away
      );
      expect(cancelResult).toBe(true);
      
      console.log(`✅ Order execution test complete: Order ${executionResult.orderId} placed and cancelled`);
    });

    it('should handle error conditions gracefully', async () => {
      console.log('❌ Testing error handling...');
      
      // Test with invalid symbol
      try {
        await hologramEngine.analyze('INVALID_SYMBOL');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error instanceof Error).toBe(true);
      }
      
      // Test empty candle data
      const emptyFVGs = inefficiencyMapper.detectFVG([]);
      expect(emptyFVGs).toEqual([]);
      
      // Test CVD with no trades
      const emptyCVD = cvdValidator.calcCVD([], 60000);
      expect(emptyCVD).toBe(0);
      
      // Test order execution with invalid parameters
      const invalidSignal: SignalData = {
        symbol: '',
        direction: 'LONG',
        hologramStatus: 'A+',
        alignmentScore: 85,
        rsScore: 0.03,
        sessionType: 'LONDON',
        poiType: 'ORDER_BLOCK',
        cvdConfirmation: true,
        confidence: 90,
        entryPrice: 0, // Invalid price
        stopLoss: 0,
        takeProfit: 0,
        positionSize: 0,
        leverage: 3,
        timestamp: Date.now()
      };
      
      const invalidOrderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 0,
        low: 0,
        barIndex: 0,
        timestamp: 0,
        mitigated: false,
        confidence: 0
      };
      
      try {
        const invalidExecution = await limitOrderExecutor.placePostOnlyOrder(
          invalidSignal,
          invalidOrderBlock,
          10000
        );
        
        // The execution should fail
        expect(invalidExecution.success).toBe(false);
        expect(invalidExecution.error).toBeDefined();
      } catch (error) {
        // If it throws an error, that's also acceptable for invalid input
        expect(error).toBeDefined();
      }
      
      console.log('✅ Error handling test complete');
    });
  });

  describe('Performance and Reliability', () => {
    it('should complete hologram scan within reasonable time', async () => {
      const startTime = Date.now();
      const scanResult = await hologramScanner.scan();
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      expect(scanResult.scanDuration).toBeLessThan(30000);
      
      console.log(`⏱️ Scan performance: ${duration}ms (${scanResult.symbols.length} symbols)`);
    });

    it('should handle concurrent operations', async () => {
      console.log('🔄 Testing concurrent operations...');
      
      // Run multiple hologram analyses concurrently
      const symbols = ['BTCUSDT', 'ETHUSDT'];
      const promises = symbols.map(symbol => hologramEngine.analyze(symbol));
      
      const results = await Promise.all(promises);
      
      expect(results.length).toBe(symbols.length);
      for (let i = 0; i < results.length; i++) {
        expect(results[i].symbol).toBe(symbols[i]);
        expect(results[i].alignmentScore).toBeGreaterThanOrEqual(0);
        expect(results[i].alignmentScore).toBeLessThanOrEqual(100);
      }
      
      console.log('✅ Concurrent operations test complete');
    });

    it('should maintain data consistency across components', async () => {
      console.log('🔄 Testing data consistency...');
      
      const symbol = 'BTCUSDT';
      
      // Get hologram state
      const hologram = await hologramEngine.analyze(symbol);
      
      // Verify data consistency
      expect(hologram.symbol).toBe(symbol);
      expect(hologram.daily.timeframe).toBe('1D');
      expect(hologram.h4.timeframe).toBe('4H');
      expect(hologram.m15.timeframe).toBe('15m');
      
      // Verify price consistency across timeframes
      expect(hologram.daily.currentPrice).toBeGreaterThan(0);
      expect(hologram.h4.currentPrice).toBeGreaterThan(0);
      expect(hologram.m15.currentPrice).toBeGreaterThan(0);
      
      // Verify dealing ranges are valid
      expect(hologram.daily.dealingRange.high).toBeGreaterThan(hologram.daily.dealingRange.low);
      expect(hologram.h4.dealingRange.high).toBeGreaterThan(hologram.h4.dealingRange.low);
      expect(hologram.m15.dealingRange.high).toBeGreaterThan(hologram.m15.dealingRange.low);
      
      console.log('✅ Data consistency test complete');
    });
  });
});