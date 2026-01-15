export interface OHLCV {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface OrderParams {
    symbol: string;
    side: "Buy" | "Sell";
    type: "MARKET" | "LIMIT" | "POST_ONLY";
    price?: number;
    qty: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
    timeInForce?: "IOC" | "GTC" | "PostOnly";
}

export interface OrderResult {
    orderId: string;
    symbol: string;
    side: "Buy" | "Sell";
    qty: number;
    price: number;
    status: OrderStatus;
    timestamp: number;
}

export type OrderStatus =
    | "NEW"
    | "PARTIALLY_FILLED"
    | "FILLED"
    | "CANCELLED"
    | "REJECTED";

export type TrapType =
    | "LIQUIDATION"
    | "DAILY_LEVEL"
    | "BOLLINGER"
    | "OI_WIPEOUT"
    | "FUNDING_SQUEEZE"
    | "BASIS_ARB"
    | "ULTIMATE_BULGARIA"
    | "PREDICTION_SPIKE"
    | "SIGMA_FADE";

export interface Trade {
    symbol: string;
    price: number;
    qty: number;
    time: number;
    isBuyerMaker: boolean;
}

export interface Tripwire {
    symbol: string;
    triggerPrice: number;
    direction: "LONG" | "SHORT";
    trapType: TrapType;
    confidence: number; // 80-98
    leverage: number; // 10x-20x
    estimatedCascadeSize: number; // Expected move in %
    activated: boolean;
    activatedAt?: number; // Timestamp of activation
    targetPrice?: number;
    stopLoss?: number;
    currentPrice?: number; // Updated by system
    estimatedLeadTime?: number; // Milliseconds until Bybit reaches trigger
    binanceTrigger?: number;
    // Volatility metrics for adaptive execution
    volatilityMetrics?: {
        atr: number;
        regime: string;
        stopLossMultiplier: number;
        positionSizeMultiplier: number;
    };
    // Alpha Logic
    adx?: number;
    trend?: "UP" | "DOWN" | "RANGING";
}

export interface SensorStatus {
    binanceHealth: "OK" | "DEGRADED" | "DOWN";
    binanceTickRate: number; // Ticks per second
    bybitStatus: "ARMED" | "DEGRADED" | "DOWN";
    bybitPing: number; // Milliseconds
    slippage: number; // Percentage
}

export interface LiveEvent {
    timestamp: number;
    type: "TRAP_SPRUNG" | "TRAP_SET" | "EXECUTION_COMPLETE" | "ERROR" | "INFO";
    message: string;
}
