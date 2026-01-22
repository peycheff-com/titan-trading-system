import {
    AsianRange,
    HologramStatus,
    JudasSwing,
    Position,
    SessionState,
    SessionType,
    TimeframeState,
    TrendState,
    VetoResult,
} from "../types";

// Enhanced HUD state interface with comprehensive market data
export interface HUDState {
    equity: number;
    pnl: number;
    pnlPercent: number;
    phase: string;
    holographicMap: HologramMapEntry[];
    activeTrade: ActiveTrade | null;
    poiMap: POIMapEntry[];
    sessionState: EnhancedSessionState;
    positions: Position[];
    viewMode: "MICRO" | "FULL";
    isPaused: boolean;
    portfolioHeat: number;
    maxDrawdown: number;
    lastUpdate: number;
    marketConditions: MarketConditions;
    systemHealth: SystemHealth;
}

// Enhanced session state with Asian range and Judas swing detection
export interface EnhancedSessionState extends SessionState {
    asianRange?: AsianRange;
    judasSwing?: JudasSwing;
    killzoneActive: boolean;
    volumeProfile: "LOW" | "MEDIUM" | "HIGH";
}

// Market conditions for realistic simulation
export interface MarketConditions {
    volatility: "LOW" | "MEDIUM" | "HIGH";
    trend: "BULL_MARKET" | "BEAR_MARKET" | "SIDEWAYS";
    btcDominance: number;
    fearGreedIndex: number;
}

// System health monitoring
export interface SystemHealth {
    wsConnections: { binance: boolean; bybit: boolean };
    apiLatency: { binance: number; bybit: number };
    scanDuration: number;
    errorCount: number;
}

// Enhanced hologram map entry with full state
export interface HologramMapEntry {
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
        type: "LONG" | "SHORT";
        timestamp: number;
        confidence: number;
    };
}

// Enhanced active trade with full context
export interface ActiveTrade {
    symbol: string;
    side: "LONG" | "SHORT";
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    leverage: number;

    // Narrative: Daily bias + 4H location
    narrative: {
        dailyBias: TrendState;
        h4Location: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM";
    };

    // Setup: POI type + price
    setup: {
        type: "OB" | "FVG" | "LIQ_POOL";
        price: number;
        confidence: number;
    };

    // Confirmation: session event + CVD status
    confirmation: {
        sessionEvent: "JUDAS_SWING" | "KILLZONE_ENTRY" | "SESSION_OPEN";
        session: SessionType;
        cvdStatus: "ABSORPTION" | "DISTRIBUTION" | "NEUTRAL";
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
        weakHigh?: number; // For SHORT positions
        weakLow?: number; // For LONG positions
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
export interface POIMapEntry {
    id: string;
    type: "ORDER_BLOCK" | "FVG" | "LIQUIDITY_POOL";
    direction: "BULLISH" | "BEARISH";
    price: number;
    distance: number; // percentage from current price
    confidence: number;
    age: number; // hours since creation
    mitigated: boolean;
    strength: number; // 0-100
    volume?: number; // for liquidity pools
}

export interface HunterHUDProps {
    onExit?: () => void;
    onConfig?: () => void;
}
