/**
 * Hunter HUD - Main Dashboard Component
 * Institutional-grade terminal interface for Titan Phase 2
 * 
 * Requirements: 8.1-8.7 (Hunter HUD)
 * - Header with phase, equity, P&L, session type, time remaining
 * - Keyboard shortcuts bar ([F1] CONFIG [F2] VIEW [SPACE] PAUSE [Q] QUIT)
 * - Three-column layout: Holographic Map, Active Trade, POI Map
 * - Color-coded status display (Green A+, Yellow B, Red Veto, Gray No Play)
 * - Toggle between MICRO (top 5) and FULL (top 20) view modes
 */

import { 
  HologramState, 
  SessionState, 
  POI, 
  Position, 
  HologramStatus, 
  TrendState,
  SessionType,
  OrderBlock,
  FVG,
  LiquidityPool,
  TimeframeState,
  DealingRange,
  VetoResult,
  AsianRange,
  JudasSwing
} from '../types';
import { POIMapComponent, POIEntry } from './POIMap';
import { ActiveTradeComponent, ActiveTradeData } from './ActiveTrade';

// Enhanced HUD state interface with comprehensive market data
interface HUDState {
  equity: number;
  pnl: number;
  pnlPercent: number;
  phase: string;
  holographicMap: HologramMapEntry[];
  activeTrade: ActiveTrade | null;
  poiMap: POIMapEntry[];
  sessionState: EnhancedSessionState;
  positions: Position[];
  viewMode: 'MICRO' | 'FULL';
  isPaused: boolean;
  portfolioHeat: number;
  maxDrawdown: number;
  lastUpdate: number;
  marketConditions: MarketConditions;
  systemHealth: SystemHealth;
}

// Enhanced session state with Asian range and Judas swing detection
interface EnhancedSessionState extends SessionState {
  asianRange?: AsianRange;
  judasSwing?: JudasSwing;
  killzoneActive: boolean;
  volumeProfile: 'LOW' | 'MEDIUM' | 'HIGH';
}

// Market conditions for realistic simulation
interface MarketConditions {
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  trend: 'BULL_MARKET' | 'BEAR_MARKET' | 'SIDEWAYS';
  btcDominance: number;
  fearGreedIndex: number;
}

// System health monitoring
interface SystemHealth {
  wsConnections: { binance: boolean; bybit: boolean };
  apiLatency: { binance: number; bybit: number };
  scanDuration: number;
  errorCount: number;
}

// Enhanced hologram map entry with full state
interface HologramMapEntry {
  symbol: string;
  currentPrice: number;
  dailyState: TimeframeState;
  h4State: TimeframeState;
  m15State: TimeframeState;
  alignmentScore: number;
  status: HologramStatus;
  veto: VetoResult;
  rsScore: number;
  rsVsBTC: number;
  volume24h: number;
  priceChange24h: number;
  lastSignal?: {
    type: 'LONG' | 'SHORT';
    timestamp: number;
    confidence: number;
  };
}

// Enhanced active trade with full context
interface ActiveTrade {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  
  // Narrative: Daily bias + 4H location
  narrative: {
    dailyBias: TrendState;
    h4Location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  };
  
  // Setup: POI type + price
  setup: {
    type: 'OB' | 'FVG' | 'LIQ_POOL';
    price: number;
    confidence: number;
  };
  
  // Confirmation: session event + CVD status
  confirmation: {
    sessionEvent: 'JUDAS_SWING' | 'KILLZONE_ENTRY' | 'SESSION_OPEN';
    session: SessionType;
    cvdStatus: 'ABSORPTION' | 'DISTRIBUTION' | 'NEUTRAL';
    rsScore: number;
  };
  
  // Execution: fill price
  execution: {
    fillPrice: number;
    slippage: number;
    timestamp: number;
  };
  
  // Target: weak high/low
  targets: {
    weakHigh?: number;  // For SHORT positions
    weakLow?: number;   // For LONG positions
    stopLoss: number;
    takeProfit: number;
    breakeven: boolean;
    trailingActive: boolean;
  };
  
  pnl: number;
  rValue: number;
  timeInTrade: number;
}

// Enhanced POI map with detailed information
interface POIMapEntry {
  id: string;
  type: 'ORDER_BLOCK' | 'FVG' | 'LIQUIDITY_POOL';
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  distance: number; // percentage from current price
  confidence: number;
  age: number; // hours since creation
  mitigated: boolean;
  strength: number; // 0-100
  volume?: number; // for liquidity pools
}

interface HunterHUDProps {
  onExit?: () => void;
  onConfig?: () => void;
}

// Market simulation engine for realistic data updates
class MarketSimulation {
  private priceHistory: Map<string, number[]> = new Map();
  private trendMomentum: Map<string, number> = new Map();
  
  constructor() {
    // Initialize price history for symbols
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT', 'AVAXUSDT', 'LINKUSDT', 'MATICUSDT'];
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
      returns.push((history[i] - history[i-1]) / history[i-1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }
}

export class HunterHUD {
  private hudState: HUDState;
  private updateInterval: NodeJS.Timeout | null = null;
  private onExit?: () => void;
  private onConfig?: () => void;
  private marketSimulation: MarketSimulation;
  private poiMapComponent: POIMapComponent;
  private activeTradeComponent: ActiveTradeComponent;

  constructor(props: HunterHUDProps = {}) {
    this.onExit = props.onExit;
    this.onConfig = props.onConfig;
    this.marketSimulation = new MarketSimulation();
    this.poiMapComponent = new POIMapComponent();
    this.activeTradeComponent = new ActiveTradeComponent();
    
    // Initialize state with comprehensive mock data
    this.hudState = {
      equity: 25000,
      pnl: 1250,
      pnlPercent: 5.26,
      phase: 'Phase 2 - Hunter',
      holographicMap: this.generateRealisticHolographicMap(),
      activeTrade: this.generateRealisticActiveTrade(),
      poiMap: this.generateRealisticPOIMap(),
      sessionState: this.generateRealisticSessionState(),
      positions: [],
      viewMode: 'MICRO',
      isPaused: false,
      portfolioHeat: 12.5,
      maxDrawdown: -2.1,
      lastUpdate: Date.now(),
      marketConditions: {
        volatility: 'MEDIUM',
        trend: 'BULL_MARKET',
        btcDominance: 52.3,
        fearGreedIndex: 67
      },
      systemHealth: {
        wsConnections: { binance: true, bybit: true },
        apiLatency: { binance: 45, bybit: 38 },
        scanDuration: 18.5,
        errorCount: 0
      }
    };
  }

  // Generate realistic holographic map with proper alignment logic
  private generateRealisticHolographicMap(): HologramMapEntry[] {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT', 'AVAXUSDT', 'LINKUSDT', 'MATICUSDT'];
    
    return symbols.map((symbol, i) => {
      const currentPrice = this.marketSimulation.getPrice(symbol);
      const priceChange24h = this.marketSimulation.getPriceChange24h(symbol);
      
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
      const btcChange = this.marketSimulation.getPriceChange24h('BTCUSDT');
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
        lastSignal: Math.random() > 0.7 ? {
          type: Math.random() > 0.5 ? 'LONG' : 'SHORT',
          timestamp: Date.now() - Math.random() * 3600000,
          confidence: 70 + Math.random() * 30
        } : undefined
      };
    });
  }

  // Generate realistic timeframe state
  private generateTimeframeState(timeframe: '1D' | '4H' | '15m', currentPrice: number, volatility: number): TimeframeState {
    const range = currentPrice * volatility;
    const high = currentPrice + range * (0.3 + Math.random() * 0.7);
    const low = currentPrice - range * (0.3 + Math.random() * 0.7);
    
    const dealingRange: DealingRange = {
      high,
      low,
      midpoint: (high + low) / 2,
      premiumThreshold: low + (high - low) * 0.618,
      discountThreshold: low + (high - low) * 0.382,
      range: high - low
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
      mss: Math.random() > 0.8 ? {
        direction: Math.random() > 0.5 ? 'BULLISH' : 'BEARISH',
        price: currentPrice + (Math.random() - 0.5) * range * 0.1,
        barIndex: Math.floor(Math.random() * 100),
        timestamp: Date.now() - Math.random() * 3600000,
        significance: 60 + Math.random() * 40
      } : null
    };
  }

  // Calculate alignment score based on timeframe agreement
  private calculateAlignmentScore(daily: TimeframeState, h4: TimeframeState, m15: TimeframeState): number {
    let score = 0;
    
    // Daily-4H agreement (50 points max)
    if (daily.trend === h4.trend) score += 25;
    if ((daily.location === 'DISCOUNT' && h4.location === 'DISCOUNT') ||
        (daily.location === 'PREMIUM' && h4.location === 'PREMIUM')) score += 25;
    
    // 4H-15m agreement (30 points max)
    if (h4.trend === m15.trend) score += 15;
    if (h4.mss && m15.mss && h4.mss.direction === m15.mss.direction) score += 15;
    
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
        direction: 'LONG'
      };
    }
    
    // Veto Short signals if Daily BEAR but 4H in DISCOUNT
    if (daily.trend === 'BEAR' && h4.location === 'DISCOUNT') {
      return {
        vetoed: true,
        reason: 'DISCOUNT_VETO: Daily BEAR but 4H in Discount zone',
        direction: 'SHORT'
      };
    }
    
    return {
      vetoed: false,
      reason: null,
      direction: null
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
  private generateRealisticActiveTrade(): ActiveTrade | null {
    if (Math.random() > 0.6) return null; // 40% chance of having an active trade
    
    const symbol = 'BTCUSDT';
    const currentPrice = this.marketSimulation.getPrice(symbol);
    const side: 'LONG' | 'SHORT' = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    const entryPrice = currentPrice * (1 + (Math.random() - 0.5) * 0.02);
    
    // Generate realistic narrative data
    const dailyBias: TrendState = side === 'LONG' ? 'BULL' : 'BEAR';
    const h4Location = side === 'LONG' ? 'DISCOUNT' : 'PREMIUM';
    
    // Generate realistic session event
    const sessionEvents: Array<'JUDAS_SWING' | 'KILLZONE_ENTRY' | 'SESSION_OPEN'> = 
      ['JUDAS_SWING', 'KILLZONE_ENTRY', 'SESSION_OPEN'];
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
        h4Location: h4Location as 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM'
      },
      
      // Setup: POI type + price
      setup: {
        type: Math.random() > 0.5 ? 'OB' : 'FVG',
        price: entryPrice,
        confidence: 75 + Math.random() * 20
      },
      
      // Confirmation: session event + CVD status
      confirmation: {
        sessionEvent,
        session: 'LONDON',
        cvdStatus: Math.random() > 0.6 ? 'ABSORPTION' : 'NEUTRAL',
        rsScore: (Math.random() - 0.5) * 6
      },
      
      // Execution: fill price
      execution: {
        fillPrice: entryPrice * (1 + (Math.random() - 0.5) * 0.001),
        slippage: Math.random() * 0.05,
        timestamp: Date.now() - Math.random() * 3600000
      },
      
      // Target: weak high/low
      targets: {
        weakHigh,
        weakLow,
        stopLoss: side === 'LONG' ? entryPrice * 0.985 : entryPrice * 1.015,
        takeProfit: side === 'LONG' ? entryPrice * 1.045 : entryPrice * 0.955,
        breakeven: Math.random() > 0.7,
        trailingActive: Math.random() > 0.8
      },
      
      pnl: (currentPrice - entryPrice) * (side === 'LONG' ? 1 : -1) * 0.1 * 4, // 4x leverage
      rValue: ((currentPrice - entryPrice) / (entryPrice * 0.015)) * (side === 'LONG' ? 1 : -1),
      timeInTrade: Date.now() - (Date.now() - Math.random() * 7200000) // Up to 2 hours
    };
  }

  // Generate realistic POI map with detailed information
  private generateRealisticPOIMap(): POIMapEntry[] {
    const currentPrice = this.marketSimulation.getPrice('BTCUSDT');
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
        strength: 70 + Math.random() * 30
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
        strength: 60 + Math.random() * 35
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
        volume: Math.random() * 1000000
      });
    }
    
    return pois.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
  }

  // Generate realistic session state with Asian range and Judas swing
  private generateRealisticSessionState(): EnhancedSessionState {
    const sessions: SessionType[] = ['ASIAN', 'LONDON', 'NY', 'DEAD_ZONE'];
    const currentSession = sessions[Math.floor(Math.random() * sessions.length)];
    
    const durations = {
      'ASIAN': 6 * 3600000,    // 6 hours
      'LONDON': 3 * 3600000,   // 3 hours  
      'NY': 3 * 3600000,       // 3 hours
      'DEAD_ZONE': 6 * 3600000 // 6 hours
    };
    
    const startTime = Date.now() - Math.random() * durations[currentSession];
    const endTime = startTime + durations[currentSession];
    const timeRemaining = Math.max(0, endTime - Date.now());
    
    // Generate Asian range if not in Asian session
    const asianRange = currentSession !== 'ASIAN' ? {
      high: 51200,
      low: 49800,
      timestamp: Date.now() - 8 * 3600000 // 8 hours ago
    } : undefined;
    
    // Generate Judas swing for London/NY sessions
    const judasSwing = (currentSession === 'LONDON' || currentSession === 'NY') && Math.random() > 0.6 ? {
      type: Math.random() > 0.5 ? 'SWEEP_HIGH' : 'SWEEP_LOW' as 'SWEEP_HIGH' | 'SWEEP_LOW',
      sweptPrice: Math.random() > 0.5 ? 51300 : 49700,
      reversalPrice: 50500,
      direction: Math.random() > 0.5 ? 'LONG' : 'SHORT' as 'LONG' | 'SHORT',
      confidence: 70 + Math.random() * 25
    } : undefined;
    
    return {
      type: currentSession,
      startTime,
      endTime,
      timeRemaining,
      asianRange,
      judasSwing,
      killzoneActive: currentSession === 'LONDON' || currentSession === 'NY',
      volumeProfile: currentSession === 'DEAD_ZONE' ? 'LOW' : 
                    currentSession === 'ASIAN' ? 'MEDIUM' : 'HIGH'
    };
  }

  // Start the HUD
  start(): void {
    console.clear();
    this.setupKeyboardHandling();
    this.startEnhancedUpdateLoop();
    this.render();
  }

  // Stop the HUD
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Setup keyboard input handling
  private setupKeyboardHandling(): void {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key: string) => {
      if (key === '\u0003' || key === 'q') { // Ctrl+C or 'q'
        this.onExit?.();
        process.exit(0);
      } else if (key === '\u001b[11~') { // F1
        this.onConfig?.();
      } else if (key === '\u001b[12~') { // F2
        this.hudState.viewMode = this.hudState.viewMode === 'MICRO' ? 'FULL' : 'MICRO';
        this.render();
      } else if (key === ' ') { // Space
        this.hudState.isPaused = !this.hudState.isPaused;
        this.render();
      }
    });
  }

  // Enhanced update loop with realistic market simulation
  private startEnhancedUpdateLoop(): void {
    this.updateInterval = setInterval(() => {
      if (!this.hudState.isPaused) {
        // Update market simulation
        this.marketSimulation.updatePrices();
        
        // Update equity and P&L based on market movements and active trades
        this.updateEquityAndPnL();
        
        // Update session state
        this.updateSessionState();
        
        // Update active trade if exists
        this.updateActiveTrade();
        
        // Update holographic map periodically
        if (Math.random() < 0.1) { // 10% chance per second
          this.updateHolographicMap();
        }
        
        // Update POI map periodically
        if (Math.random() < 0.05) { // 5% chance per second
          this.updatePOIMap();
        }
        
        // Update system health
        this.updateSystemHealth();
        
        // Update market conditions
        this.updateMarketConditions();
        
        // Update components with latest data
        this.updateComponents();
        
        this.hudState.lastUpdate = Date.now();
        this.render();
      }
    }, 1000);
  }

  // Update components with latest data
  private updateComponents(): void {
    // Update POI Map component - convert POIMapEntry to POIEntry
    const poiEntries: POIEntry[] = this.hudState.poiMap.map(poi => ({
      id: poi.id,
      type: poi.type,
      direction: poi.direction,
      price: poi.price,
      distance: poi.distance,
      confidence: poi.confidence,
      age: poi.age,
      mitigated: poi.mitigated,
      strength: poi.strength,
      volume: poi.volume
    }));
    this.poiMapComponent.updateConfig({ pois: poiEntries });
    
    // Update Active Trade component
    this.activeTradeComponent.updateConfig({ trade: this.hudState.activeTrade });
  }

  // Update equity and P&L based on market movements
  private updateEquityAndPnL(): void {
    const marketMove = (Math.random() - 0.5) * 0.01; // ±1% max move per second
    
    // Base equity change from market exposure
    const equityChange = this.hudState.equity * marketMove * 0.05; // 5% of market move affects equity
    this.hudState.equity += equityChange;
    
    // Update P&L from active trades
    if (this.hudState.activeTrade) {
      const trade = this.hudState.activeTrade;
      const newPrice = this.marketSimulation.getPrice(trade.symbol);
      const priceDiff = newPrice - trade.currentPrice;
      const pnlChange = priceDiff * trade.quantity * trade.leverage * (trade.side === 'LONG' ? 1 : -1);
      
      trade.currentPrice = newPrice;
      trade.pnl += pnlChange;
      trade.rValue = ((newPrice - trade.entryPrice) / (trade.entryPrice * 0.015)) * (trade.side === 'LONG' ? 1 : -1);
      trade.timeInTrade = Date.now() - trade.execution.timestamp;
      
      this.hudState.pnl += pnlChange;
    }
    
    // Update percentage
    this.hudState.pnlPercent = (this.hudState.pnl / (this.hudState.equity - this.hudState.pnl)) * 100;
    
    // Update portfolio heat and max drawdown
    this.hudState.portfolioHeat = Math.max(0, Math.min(20, this.hudState.portfolioHeat + (Math.random() - 0.5) * 0.5));
    if (this.hudState.pnlPercent < this.hudState.maxDrawdown) {
      this.hudState.maxDrawdown = this.hudState.pnlPercent;
    }
  }

  // Update session state with transitions
  private updateSessionState(): void {
    this.hudState.sessionState.timeRemaining = Math.max(0, this.hudState.sessionState.timeRemaining - 1000);
    
    // Handle session transitions
    if (this.hudState.sessionState.timeRemaining <= 0) {
      this.transitionToNextSession();
    }
    
    // Update volume profile based on session
    const session = this.hudState.sessionState.type;
    this.hudState.sessionState.volumeProfile = 
      session === 'DEAD_ZONE' ? 'LOW' :
      session === 'ASIAN' ? 'MEDIUM' : 'HIGH';
    
    // Update killzone status
    this.hudState.sessionState.killzoneActive = session === 'LONDON' || session === 'NY';
  }

  // Transition to next session
  private transitionToNextSession(): void {
    const sessions: SessionType[] = ['ASIAN', 'LONDON', 'NY', 'DEAD_ZONE'];
    const currentIndex = sessions.indexOf(this.hudState.sessionState.type);
    const nextIndex = (currentIndex + 1) % sessions.length;
    const nextSession = sessions[nextIndex];
    
    const durations = {
      'ASIAN': 6 * 3600000,
      'LONDON': 3 * 3600000,
      'NY': 3 * 3600000,
      'DEAD_ZONE': 6 * 3600000
    };
    
    this.hudState.sessionState.type = nextSession;
    this.hudState.sessionState.startTime = Date.now();
    this.hudState.sessionState.endTime = Date.now() + durations[nextSession];
    this.hudState.sessionState.timeRemaining = durations[nextSession];
    
    // Generate new Asian range when entering London
    if (nextSession === 'LONDON') {
      const btcPrice = this.marketSimulation.getPrice('BTCUSDT');
      this.hudState.sessionState.asianRange = {
        high: btcPrice * (1 + Math.random() * 0.02),
        low: btcPrice * (1 - Math.random() * 0.02),
        timestamp: Date.now()
      };
    }
    
    // Generate Judas swing for London/NY sessions
    if ((nextSession === 'LONDON' || nextSession === 'NY') && Math.random() > 0.5) {
      this.hudState.sessionState.judasSwing = {
        type: Math.random() > 0.5 ? 'SWEEP_HIGH' : 'SWEEP_LOW',
        sweptPrice: this.marketSimulation.getPrice('BTCUSDT') * (1 + (Math.random() - 0.5) * 0.01),
        reversalPrice: this.marketSimulation.getPrice('BTCUSDT'),
        direction: Math.random() > 0.5 ? 'LONG' : 'SHORT',
        confidence: 60 + Math.random() * 35
      };
    }
  }

  // Update active trade with realistic changes
  private updateActiveTrade(): void {
    if (!this.hudState.activeTrade) {
      // Randomly generate new trade
      if (Math.random() < 0.01) { // 1% chance per second
        this.hudState.activeTrade = this.generateRealisticActiveTrade();
      }
      return;
    }
    
    const trade = this.hudState.activeTrade;
    
    // Check for stop loss or take profit hits
    if ((trade.side === 'LONG' && trade.currentPrice <= trade.targets.stopLoss) ||
        (trade.side === 'SHORT' && trade.currentPrice >= trade.targets.stopLoss)) {
      // Hit stop loss
      this.hudState.activeTrade = null;
      return;
    }
    
    if ((trade.side === 'LONG' && trade.currentPrice >= trade.targets.takeProfit) ||
        (trade.side === 'SHORT' && trade.currentPrice <= trade.targets.takeProfit)) {
      // Hit take profit
      this.hudState.activeTrade = null;
      return;
    }
    
    // Update breakeven and trailing stop
    if (!trade.targets.breakeven && Math.abs(trade.rValue) >= 1.5) {
      trade.targets.breakeven = true;
      trade.targets.stopLoss = trade.entryPrice;
    }
    
    if (trade.targets.trailingActive && Math.abs(trade.rValue) >= 2.0) {
      const atr = trade.entryPrice * 0.02; // Simplified ATR
      if (trade.side === 'LONG') {
        trade.targets.stopLoss = Math.max(trade.targets.stopLoss, trade.currentPrice - atr);
      } else {
        trade.targets.stopLoss = Math.min(trade.targets.stopLoss, trade.currentPrice + atr);
      }
    }
  }

  // Update holographic map with realistic changes
  private updateHolographicMap(): void {
    this.hudState.holographicMap.forEach(entry => {
      // Update current price
      entry.currentPrice = this.marketSimulation.getPrice(entry.symbol);
      entry.priceChange24h = this.marketSimulation.getPriceChange24h(entry.symbol);
      
      // Update timeframe states
      entry.dailyState = this.generateTimeframeState('1D', entry.currentPrice, 0.15);
      entry.h4State = this.generateTimeframeState('4H', entry.currentPrice, 0.08);
      entry.m15State = this.generateTimeframeState('15m', entry.currentPrice, 0.03);
      
      // Recalculate alignment score and status
      entry.alignmentScore = this.calculateAlignmentScore(entry.dailyState, entry.h4State, entry.m15State);
      entry.veto = this.applyVetoLogic(entry.dailyState, entry.h4State);
      entry.status = this.determineHologramStatus(entry.alignmentScore, entry.veto);
      
      // Update RS score
      const btcChange = this.marketSimulation.getPriceChange24h('BTCUSDT');
      entry.rsScore = entry.priceChange24h - btcChange;
      entry.rsVsBTC = entry.rsScore;
      
      // Randomly generate new signals
      if (Math.random() < 0.02 && entry.status === 'A+') { // 2% chance for A+ setups
        entry.lastSignal = {
          type: entry.rsScore > 0 ? 'LONG' : 'SHORT',
          timestamp: Date.now(),
          confidence: 80 + Math.random() * 20
        };
      }
    });
    
    // Sort by alignment score
    this.hudState.holographicMap.sort((a, b) => b.alignmentScore - a.alignmentScore);
  }

  // Update POI map with aging and mitigation
  private updatePOIMap(): void {
    const currentPrice = this.marketSimulation.getPrice('BTCUSDT');
    
    this.hudState.poiMap.forEach(poi => {
      // Update distance
      poi.distance = ((poi.price - currentPrice) / currentPrice) * 100;
      
      // Age the POI
      poi.age += 1/3600; // Add 1 second in hours
      
      // Reduce confidence over time
      poi.confidence = Math.max(30, poi.confidence - poi.age * 0.1);
      
      // Check for mitigation
      if (!poi.mitigated && Math.abs(poi.distance) < 0.1) {
        poi.mitigated = Math.random() > 0.3; // 70% chance of mitigation when price is very close
      }
      
      // Reduce strength over time
      poi.strength = Math.max(40, poi.strength - poi.age * 0.05);
    });
    
    // Remove very old or mitigated POIs
    this.hudState.poiMap = this.hudState.poiMap.filter(poi => 
      poi.age < 72 && (!poi.mitigated || poi.age < 24)
    );
    
    // Add new POIs occasionally
    if (this.hudState.poiMap.length < 7 && Math.random() < 0.1) {
      const newPOIs = this.generateRealisticPOIMap();
      this.hudState.poiMap.push(...newPOIs.slice(0, 2));
    }
    
    // Sort by distance
    this.hudState.poiMap.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
  }

  // Update system health metrics
  private updateSystemHealth(): void {
    const health = this.hudState.systemHealth;
    
    // Simulate occasional connection issues
    if (Math.random() < 0.001) { // 0.1% chance
      health.wsConnections.binance = false;
      setTimeout(() => { health.wsConnections.binance = true; }, 5000);
    }
    
    if (Math.random() < 0.001) { // 0.1% chance
      health.wsConnections.bybit = false;
      setTimeout(() => { health.wsConnections.bybit = true; }, 3000);
    }
    
    // Update latency with realistic fluctuations
    health.apiLatency.binance += (Math.random() - 0.5) * 10;
    health.apiLatency.binance = Math.max(20, Math.min(200, health.apiLatency.binance));
    
    health.apiLatency.bybit += (Math.random() - 0.5) * 8;
    health.apiLatency.bybit = Math.max(15, Math.min(150, health.apiLatency.bybit));
    
    // Update scan duration
    health.scanDuration += (Math.random() - 0.5) * 2;
    health.scanDuration = Math.max(10, Math.min(35, health.scanDuration));
    
    // Simulate occasional errors
    if (Math.random() < 0.002) { // 0.2% chance
      health.errorCount++;
    }
  }

  // Update market conditions
  private updateMarketConditions(): void {
    const conditions = this.hudState.marketConditions;
    
    // Update volatility based on price movements
    const btcVolatility = this.marketSimulation.getVolatility('BTCUSDT');
    if (btcVolatility > 0.03) {
      conditions.volatility = 'HIGH';
    } else if (btcVolatility > 0.015) {
      conditions.volatility = 'MEDIUM';
    } else {
      conditions.volatility = 'LOW';
    }
    
    // Update trend based on recent price action
    const btcChange = this.marketSimulation.getPriceChange24h('BTCUSDT');
    if (btcChange > 3) {
      conditions.trend = 'BULL_MARKET';
    } else if (btcChange < -3) {
      conditions.trend = 'BEAR_MARKET';
    } else {
      conditions.trend = 'SIDEWAYS';
    }
    
    // Update BTC dominance with small fluctuations
    conditions.btcDominance += (Math.random() - 0.5) * 0.1;
    conditions.btcDominance = Math.max(40, Math.min(70, conditions.btcDominance));
    
    // Update fear & greed index
    conditions.fearGreedIndex += (Math.random() - 0.5) * 2;
    conditions.fearGreedIndex = Math.max(0, Math.min(100, conditions.fearGreedIndex));
  }

  // Enhanced helper functions with sophisticated formatting
  private formatCurrency(value: number): string {
    return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatPercent(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  private formatTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  private formatPrice(price: number): string {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    } else if (price >= 1) {
      return price.toFixed(2);
    } else {
      return price.toFixed(4);
    }
  }

  private formatDistance(distance: number): string {
    const sign = distance >= 0 ? '+' : '';
    return `${sign}${distance.toFixed(1)}%`;
  }

  private formatRValue(rValue: number): string {
    const sign = rValue >= 0 ? '+' : '';
    return `${sign}${rValue.toFixed(1)}R`;
  }

  // Enhanced color functions with sophisticated logic
  private getStatusColor(status: HologramStatus): string {
    switch (status) {
      case 'A+': return '\x1b[1m\x1b[32m'; // Bold Bright Green
      case 'B': return '\x1b[33m'; // Yellow
      case 'CONFLICT': return '\x1b[31m'; // Red
      case 'NO_PLAY': return '\x1b[90m'; // Dark Gray
      default: return '\x1b[0m'; // Reset
    }
  }

  private getSessionColor(sessionType: SessionType): string {
    switch (sessionType) {
      case 'LONDON': return '\x1b[1m\x1b[32m'; // Bold Green (active trading)
      case 'NY': return '\x1b[1m\x1b[34m'; // Bold Blue (active trading)
      case 'ASIAN': return '\x1b[33m'; // Yellow (moderate activity)
      case 'DEAD_ZONE': return '\x1b[90m'; // Dark Gray (low activity)
      default: return '\x1b[0m'; // Reset
    }
  }

  private getTrendColor(trend: TrendState): string {
    switch (trend) {
      case 'BULL': return '\x1b[32m'; // Green
      case 'BEAR': return '\x1b[31m'; // Red
      case 'RANGE': return '\x1b[33m'; // Yellow
      default: return '\x1b[0m'; // Reset
    }
  }

  private getLocationColor(location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM'): string {
    switch (location) {
      case 'PREMIUM': return '\x1b[31m'; // Red (sell zone)
      case 'DISCOUNT': return '\x1b[32m'; // Green (buy zone)
      case 'EQUILIBRIUM': return '\x1b[33m'; // Yellow (neutral)
      default: return '\x1b[0m'; // Reset
    }
  }

  private getPOIColor(distance: number, confidence: number): string {
    if (Math.abs(distance) < 0.5) {
      return confidence > 80 ? '\x1b[1m\x1b[31m' : '\x1b[31m'; // Red (very close)
    } else if (Math.abs(distance) < 2.0) {
      return confidence > 70 ? '\x1b[1m\x1b[33m' : '\x1b[33m'; // Yellow (close)
    } else {
      return '\x1b[37m'; // White (far)
    }
  }

  private getPnLColor(value: number): string {
    if (value > 0) return '\x1b[32m'; // Green
    if (value < 0) return '\x1b[31m'; // Red
    return '\x1b[37m'; // White
  }

  private getRSColor(rsScore: number): string {
    if (rsScore > 2) return '\x1b[1m\x1b[32m'; // Bold Green (strong)
    if (rsScore > 0) return '\x1b[32m'; // Green (positive)
    if (rsScore < -2) return '\x1b[1m\x1b[31m'; // Bold Red (weak)
    if (rsScore < 0) return '\x1b[31m'; // Red (negative)
    return '\x1b[33m'; // Yellow (neutral)
  }

  private getHealthColor(isHealthy: boolean): string {
    return isHealthy ? '\x1b[32m' : '\x1b[31m';
  }

  // Enhanced rendering with improved layout and spacing
  private render(): void {
    console.clear();
    
    // Enhanced header with more information
    const equityColor = this.hudState.pnl >= 0 ? '\x1b[32m' : '\x1b[31m';
    const sessionColor = this.getSessionColor(this.hudState.sessionState.type);
    const killzoneIndicator = this.hudState.sessionState.killzoneActive ? ' 🎯' : '';
    const pauseIndicator = this.hudState.isPaused ? ' | \x1b[33m⏸ PAUSED\x1b[0m' : '';
    
    console.log('┌─────────────────────────────────────────────────────────────────────────────────┐');
    console.log(`│ 🎯 ${this.hudState.phase} | Equity: ${equityColor}${this.formatCurrency(this.hudState.equity)}\x1b[0m | P&L: ${equityColor}${this.formatCurrency(this.hudState.pnl)} (${this.formatPercent(this.hudState.pnlPercent)})\x1b[0m │`);
    console.log(`│ Session: ${sessionColor}${this.hudState.sessionState.type}\x1b[0m${killzoneIndicator} | Time: ${this.formatTime(this.hudState.sessionState.timeRemaining)} | Vol: ${this.hudState.sessionState.volumeProfile} | Heat: ${this.formatPercent(this.hudState.portfolioHeat)}${pauseIndicator} │`);
    console.log('└─────────────────────────────────────────────────────────────────────────────────┘');
    
    // Enhanced keyboard shortcuts with system health
    const binanceStatus = this.getHealthColor(this.hudState.systemHealth.wsConnections.binance);
    const bybitStatus = this.getHealthColor(this.hudState.systemHealth.wsConnections.bybit);
    console.log(`[F1] CONFIG  [F2] VIEW (${this.hudState.viewMode})  [SPACE] ${this.hudState.isPaused ? 'RESUME' : 'PAUSE'}  [Q] QUIT | WS: ${binanceStatus}BIN\x1b[0m ${bybitStatus}BYB\x1b[0m | Scan: ${this.hudState.systemHealth.scanDuration.toFixed(1)}s`);
    console.log('');

    // Enhanced three-column layout with better spacing
    console.log('┌─────────────────────────────────┬─────────────────────────────────┬─────────────────────────────────┐');
    console.log('│        📊 HOLOGRAPHIC MAP        │         🎯 ACTIVE TRADE          │          📍 POI MAP             │');
    console.log('├─────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────┤');
    
    // Enhanced table headers
    console.log('│ Symbol    Trend  Loc  Trig  RS  │                                 │ Type      Price     Dist   Conf │');
    console.log('├─────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────┤');
    
    // Enhanced data rows with sophisticated formatting
    const maxRows = this.hudState.viewMode === 'MICRO' ? 8 : 15;
    const displaySymbols = this.hudState.holographicMap.slice(0, maxRows);
    
    // Get rendered lines from components
    const activeTradeLines = this.activeTradeComponent.render();
    const poiMapLines = this.poiMapComponent.render();
    
    for (let i = 0; i < Math.max(displaySymbols.length, activeTradeLines.length - 1, poiMapLines.length - 1, 8); i++) {
      // Left column - Enhanced Holographic Map
      let leftContent = '';
      if (i < displaySymbols.length) {
        const entry = displaySymbols[i];
        const statusColor = this.getStatusColor(entry.status);
        const trendColor = this.getTrendColor(entry.dailyState.trend);
        const locationColor = this.getLocationColor(entry.h4State.location);
        const rsColor = this.getRSColor(entry.rsScore);
        
        const symbol = entry.symbol.padEnd(8);
        const trend = `${trendColor}${entry.dailyState.trend.padEnd(4)}\x1b[0m`;
        const location = `${locationColor}${entry.h4State.location.substring(0, 4).padEnd(4)}\x1b[0m`;
        const trigger = entry.m15State.mss ? 'MSS ' : 'WAIT';
        const rs = `${rsColor}${entry.rsScore >= 0 ? '+' : ''}${entry.rsScore.toFixed(1)}\x1b[0m`;
        
        leftContent = `${statusColor}${symbol}\x1b[0m ${trend} ${location} ${trigger} ${rs}`;
      } else {
        leftContent = ''.padEnd(31);
      }
      
      // Middle column - Active Trade Component
      let middleContent = '';
      if (i + 1 < activeTradeLines.length) {
        middleContent = activeTradeLines[i + 1]; // Skip header line
      }
      middleContent = middleContent.padEnd(31);
      
      // Right column - POI Map Component
      let rightContent = '';
      if (i + 1 < poiMapLines.length) {
        rightContent = poiMapLines[i + 1]; // Skip header line
      }
      rightContent = rightContent.padEnd(31);
      
      console.log(`│ ${leftContent} │ ${middleContent} │ ${rightContent} │`);
    }
    
    console.log('└─────────────────────────────────┴─────────────────────────────────┴─────────────────────────────────┘');
    
    // Enhanced footer with market conditions and system status
    const trendColor = this.hudState.marketConditions.trend === 'BULL_MARKET' ? '\x1b[32m' : 
                      this.hudState.marketConditions.trend === 'BEAR_MARKET' ? '\x1b[31m' : '\x1b[33m';
    const volColor = this.hudState.marketConditions.volatility === 'HIGH' ? '\x1b[31m' : 
                    this.hudState.marketConditions.volatility === 'MEDIUM' ? '\x1b[33m' : '\x1b[32m';
    
    console.log(`Market: ${trendColor}${this.hudState.marketConditions.trend}\x1b[0m | Vol: ${volColor}${this.hudState.marketConditions.volatility}\x1b[0m | BTC Dom: ${this.hudState.marketConditions.btcDominance.toFixed(1)}% | F&G: ${this.hudState.marketConditions.fearGreedIndex.toFixed(0)}`);
    console.log(`Positions: ${this.hudState.positions.length} | Max DD: ${this.formatPercent(this.hudState.maxDrawdown)} | Errors: ${this.hudState.systemHealth.errorCount} | Updated: ${new Date().toLocaleTimeString()}`);
  }
}

export default HunterHUD;