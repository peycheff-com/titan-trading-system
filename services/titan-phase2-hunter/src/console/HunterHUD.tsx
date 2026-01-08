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
  narrative: string;
  setup: {
    type: 'OB' | 'FVG' | 'LIQ_POOL';
    price: number;
    confidence: number;
  };
  confirmation: {
    session: SessionType;
    cvdStatus: 'ABSORPTION' | 'DISTRIBUTION' | 'NEUTRAL';
    rsScore: number;
  };
  execution: {
    fillPrice: number;
    slippage: number;
    timestamp: number;
  };
  targets: {
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

export class HunterHUD {
  private hudState: HUDState;
  private updateInterval: NodeJS.Timeout | null = null;
  private onExit?: () => void;
  private onConfig?: () => void;
  private marketSimulation: MarketSimulation;

  constructor(props: HunterHUDProps = {}) {
    this.onExit = props.onExit;
    this.onConfig = props.onConfig;
    this.marketSimulation = new MarketSimulation();
    
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

  // Market simulation engine for realistic data updates
  private class MarketSimulation {
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
    const momentum = this.marketSimulation.trendMomentum.get('BTCUSDT') || 0;
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

  // Start the HUD
  start(): void {
    console.clear();
    this.setupKeyboardHandling();
    this.startUpdateLoop();
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

  // Start the update loop with more realistic market simulation
  private startUpdateLoop(): void {
    this.updateInterval = setInterval(() => {
      if (!this.hudState.isPaused) {
        // Simulate market movements
        const marketMove = (Math.random() - 0.5) * 0.02; // ±2% max move
        this.hudState.equity += this.hudState.equity * marketMove * 0.1; // 10% of market move affects equity
        this.hudState.pnl += this.hudState.equity * marketMove * 0.05;
        this.hudState.pnlPercent = (this.hudState.pnl / (this.hudState.equity - this.hudState.pnl)) * 100;
        
        // Update session time
        this.hudState.sessionState.timeRemaining = Math.max(0, this.hudState.sessionState.timeRemaining - 1000);
        
        // Simulate session transitions
        if (this.hudState.sessionState.timeRemaining <= 0) {
          this.transitionSession();
        }
        
        // Update active trade P&L if exists
        if (this.hudState.activeTrade) {
          const tradePnlChange = (Math.random() - 0.5) * 100;
          this.hudState.activeTrade.pnl += tradePnlChange;
          this.hudState.activeTrade.rValue = this.hudState.activeTrade.pnl / 312.5; // Assuming 1R = $312.5
        }
        
        // Update holographic map scores occasionally
        if (Math.random() < 0.1) { // 10% chance per second
          this.updateHolographicScores();
        }
        
        this.hudState.lastUpdate = Date.now();
        this.render();
      }
    }, 1000);
  }

  // Simulate session transitions
  private transitionSession(): void {
    const sessions: SessionType[] = ['ASIAN', 'LONDON', 'NY', 'DEAD_ZONE'];
    const currentIndex = sessions.indexOf(this.hudState.sessionState.type);
    const nextIndex = (currentIndex + 1) % sessions.length;
    
    this.hudState.sessionState.type = sessions[nextIndex];
    this.hudState.sessionState.startTime = Date.now();
    
    // Set session duration (simplified)
    const durations = {
      'ASIAN': 6 * 3600000,    // 6 hours
      'LONDON': 3 * 3600000,   // 3 hours  
      'NY': 3 * 3600000,       // 3 hours
      'DEAD_ZONE': 6 * 3600000 // 6 hours
    };
    
    this.hudState.sessionState.endTime = Date.now() + durations[sessions[nextIndex]];
    this.hudState.sessionState.timeRemaining = durations[sessions[nextIndex]];
  }

  // Update holographic alignment scores
  private updateHolographicScores(): void {
    this.hudState.holographicMap.forEach(entry => {
      // Simulate score changes
      entry.alignmentScore += (Math.random() - 0.5) * 10;
      entry.alignmentScore = Math.max(0, Math.min(100, entry.alignmentScore));
      
      // Update status based on score
      if (entry.alignmentScore >= 80) {
        entry.status = 'A+';
      } else if (entry.alignmentScore >= 60) {
        entry.status = 'B';
      } else if (entry.alignmentScore >= 40) {
        entry.status = 'CONFLICT';
      } else {
        entry.status = 'NO_PLAY';
      }
      
      // Update RS score
      entry.rsScore += (Math.random() - 0.5) * 2;
      entry.rsScore = Math.max(-10, Math.min(10, entry.rsScore));
    });
  }

  // Helper functions
  private formatCurrency(value: number): string {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  private getStatusColor(status: HologramStatus): string {
    switch (status) {
      case 'A+': return '\x1b[32m'; // Green
      case 'B': return '\x1b[33m'; // Yellow
      case 'CONFLICT': return '\x1b[31m'; // Red
      case 'NO_PLAY': return '\x1b[37m'; // Gray
      default: return '\x1b[0m'; // Reset
    }
  }

  private getSessionColor(sessionType: string): string {
    switch (sessionType) {
      case 'LONDON': return '\x1b[32m'; // Green
      case 'NY': return '\x1b[34m'; // Blue
      case 'ASIAN': return '\x1b[33m'; // Yellow
      case 'DEAD_ZONE': return '\x1b[37m'; // Gray
      default: return '\x1b[0m'; // Reset
    }
  }

  // Main render function
  private render(): void {
    console.clear();
    
    // Header
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log(`│ 🎯 ${this.hudState.phase} | Equity: \x1b[32m${this.formatCurrency(this.hudState.equity)}\x1b[0m | P&L: ${this.hudState.pnl >= 0 ? '\x1b[32m' : '\x1b[31m'}${this.formatCurrency(this.hudState.pnl)} (${this.formatPercent(this.hudState.pnlPercent)})\x1b[0m | ${this.getSessionColor(this.hudState.sessionState.type)}${this.hudState.sessionState.type}\x1b[0m | ${this.formatTime(this.hudState.sessionState.timeRemaining)}${this.hudState.isPaused ? ' | \x1b[33m⏸ PAUSED\x1b[0m' : ''} │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');
    
    // Keyboard shortcuts
    console.log(`[F1] CONFIG  [F2] VIEW (${this.hudState.viewMode})  [SPACE] ${this.hudState.isPaused ? 'RESUME' : 'PAUSE'}  [Q] QUIT`);
    console.log('');

    // Three-column layout
    console.log('┌─────────────────────────┬─────────────────────────┬─────────────────────────┐');
    console.log('│     📊 Holographic Map   │      🎯 Active Trade     │       📍 POI Map        │');
    console.log('├─────────────────────────┼─────────────────────────┼─────────────────────────┤');
    
    // Table headers
    console.log('│ Symbol   1D   4H   15m  │                         │ Type     Price    Dist  │');
    console.log('├─────────────────────────┼─────────────────────────┼─────────────────────────┤');
    
    // Mock data rows
    const maxRows = this.hudState.viewMode === 'MICRO' ? 5 : 12;
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT'];
    const statuses: HologramStatus[] = ['A+', 'B', 'CONFLICT', 'NO_PLAY'];
    const trends = ['BULL', 'BEAR', 'RANGE'];
    
    for (let i = 0; i < Math.min(maxRows, 10); i++) {
      const symbol = symbols[i % symbols.length];
      const status = statuses[i % statuses.length];
      const trend = trends[i % trends.length];
      
      // Left column - Holographic Map
      const leftContent = `${symbol.padEnd(8)} ${trend.padEnd(4)} PREM MSS `;
      
      // Middle column - Active Trade
      const middleContent = i === 0 && this.hudState.activeTrade ? 
        'BTCUSDT Long Setup     ' : 
        'No active trade       ';
      
      // Right column - POI Map
      const rightContent = `OB-BULL  50000   1.2%`;
      
      console.log(`│ ${leftContent.padEnd(23)} │ ${middleContent.padEnd(23)} │ ${rightContent.padEnd(23)} │`);
    }
    
    console.log('└─────────────────────────┴─────────────────────────┴─────────────────────────┘');
    
    // Footer
    console.log(`Positions: ${this.hudState.positions.length} | Portfolio Heat: 12.5% | Max DD: -2.1% | Last Update: ${new Date().toLocaleTimeString()}`);
  }
}

export default HunterHUD;