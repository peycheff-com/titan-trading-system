/**
 * Market Data Types
 */

export enum SignalType {
    PRICE_UPDATE = "PRICE_UPDATE",
    VOLUME_SPIKE = "VOLUME_SPIKE",
    ORDER_BOOK_IMBALANCE = "ORDER_BOOK_IMBALANCE",
}

export interface MarketSignal {
    type: SignalType;
    symbol: string;
    timestamp: number;
    data: {
        price?: number;
        volume?: number;
        bid?: number;
        ask?: number;
        [key: string]: any;
    };
}
