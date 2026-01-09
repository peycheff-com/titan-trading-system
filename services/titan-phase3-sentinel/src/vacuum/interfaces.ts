export interface LiquidationEvent {
    exchange: string;
    symbol: string;
    side: "BUY" | "SELL"; // Side of the liquidation (e.g. SELL liquidation causes price crash)
    size: number;
    price: number;
    timestamp: number;
}

export interface VacuumOpportunity {
    id: string;
    symbol: string;
    direction: "LONG" | "SHORT"; // Direction of our trade upon vacuum (Reversal)
    maxEntryPrice: number;
    targetExitPrice: number;
    confidence: number;
    timestamp: number;
    liquidationEvent?: LiquidationEvent;
}

export interface IVacuumMonitor {
    checkForOpportunity(
        symbol: string,
        currentPrice: number,
    ): Promise<VacuumOpportunity | null>;
    onLiquidation(event: LiquidationEvent): void;
}
