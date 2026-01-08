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
