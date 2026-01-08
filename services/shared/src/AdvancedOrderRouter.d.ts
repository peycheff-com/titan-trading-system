/**
 * Advanced Order Router for Titan Trading System
 *
 * Provides intelligent order routing with co-location optimization,
 * smart order routing (SOR), and advanced execution algorithms.
 *
 * Requirements: 10.1 - Advanced order routing and execution algorithms
 */
import { EventEmitter } from 'eventemitter3';
/**
 * Venue information for order routing
 */
export interface TradingVenue {
    id: string;
    name: string;
    type: 'EXCHANGE' | 'ECN' | 'DARK_POOL' | 'MARKET_MAKER';
    latency: number;
    fees: {
        maker: number;
        taker: number;
        rebate?: number;
    };
    liquidity: {
        averageSpread: number;
        averageDepth: number;
        marketShare: number;
    };
    capabilities: string[];
    isActive: boolean;
    coLocationAvailable: boolean;
    networkOptimized: boolean;
}
/**
 * Order routing request
 */
export interface RoutingRequest {
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'ICEBERG' | 'TWAP' | 'VWAP';
    price?: number;
    timeInForce: 'GTC' | 'IOC' | 'FOK' | 'DAY';
    urgency: 'IMMEDIATE' | 'NORMAL' | 'PATIENT';
    maxSlippage?: number;
    minFillSize?: number;
    displayQuantity?: number;
    strategy?: 'AGGRESSIVE' | 'PASSIVE' | 'NEUTRAL' | 'STEALTH';
    constraints?: {
        excludeVenues?: string[];
        preferredVenues?: string[];
        maxVenues?: number;
        darkPoolOnly?: boolean;
        requireRebate?: boolean;
    };
}
/**
 * Routing decision
 */
export interface RoutingDecision {
    requestId: string;
    routes: RouteAllocation[];
    totalExpectedCost: number;
    expectedLatency: number;
    confidence: number;
    reasoning: string;
    timestamp: number;
}
/**
 * Route allocation
 */
export interface RouteAllocation {
    venueId: string;
    quantity: number;
    percentage: number;
    expectedPrice: number;
    expectedFees: number;
    expectedLatency: number;
    priority: number;
    orderParams: {
        type: string;
        timeInForce: string;
        displayQuantity?: number;
        hidden?: boolean;
    };
}
/**
 * Market data for routing decisions
 */
export interface MarketData {
    symbol: string;
    timestamp: number;
    venues: Record<string, {
        bid: number;
        ask: number;
        bidSize: number;
        askSize: number;
        lastPrice: number;
        volume: number;
        spread: number;
    }>;
    consolidated: {
        nbbo: {
            bid: number;
            ask: number;
        };
        totalVolume: number;
        averageSpread: number;
        volatility: number;
    };
}
/**
 * Execution algorithm interface
 */
export interface ExecutionAlgorithm {
    name: string;
    route(request: RoutingRequest, venues: TradingVenue[], marketData: MarketData): Promise<RoutingDecision>;
    getDescription(): string;
}
/**
 * Smart Order Router configuration
 */
export interface OrderRouterConfig {
    enableCoLocation: boolean;
    enableNetworkOptimization: boolean;
    maxVenuesPerOrder: number;
    defaultSlippageTolerance: number;
    latencyWeighting: number;
    feeWeighting: number;
    liquidityWeighting: number;
    enableDarkPools: boolean;
    enableRebateCapture: boolean;
    minOrderSize: number;
    maxOrderSize: number;
    enableOrderSplitting: boolean;
    enableTimeSlicing: boolean;
    marketDataTimeout: number;
}
/**
 * Advanced Order Router
 */
export declare class AdvancedOrderRouter extends EventEmitter {
    private config;
    private venues;
    private algorithms;
    private marketDataCache;
    private routingHistory;
    private metrics;
    constructor(config?: Partial<OrderRouterConfig>);
    /**
     * Add trading venue
     */
    addVenue(venue: TradingVenue): void;
    /**
     * Remove trading venue
     */
    removeVenue(venueId: string): boolean;
    /**
     * Update venue status
     */
    updateVenueStatus(venueId: string, isActive: boolean): void;
    /**
     * Add custom execution algorithm
     */
    addAlgorithm(algorithm: ExecutionAlgorithm): void;
    /**
     * Update market data
     */
    updateMarketData(marketData: MarketData): void;
    /**
     * Route order using smart order routing
     */
    routeOrder(request: RoutingRequest): Promise<RoutingDecision>;
    /**
     * Validate routing request
     */
    private validateRequest;
    /**
     * Get market data for symbol
     */
    private getMarketData;
    /**
     * Select appropriate algorithm
     */
    private selectAlgorithm;
    /**
     * Get available venues for routing
     */
    private getAvailableVenues;
    /**
     * Optimize routing for co-location and network
     */
    private optimizeRouting;
    /**
     * Update routing metrics
     */
    private updateMetrics;
    /**
     * Get routing statistics
     */
    getRoutingStats(): {
        totalRoutes: number;
        averageLatency: number;
        averageCost: number;
        venueUtilization: Record<string, number>;
        algorithmUsage: Record<string, number>;
        recentDecisions: RoutingDecision[];
    };
    /**
     * Get available venues
     */
    getVenues(): TradingVenue[];
    /**
     * Get available algorithms
     */
    getAlgorithms(): string[];
    /**
     * Update configuration
     */
    updateConfig(config: Partial<OrderRouterConfig>): void;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Default order router configuration
 */
export declare const DEFAULT_ORDER_ROUTER_CONFIG: OrderRouterConfig;
/**
 * Get or create the global Advanced Order Router instance
 */
export declare function getAdvancedOrderRouter(config?: Partial<OrderRouterConfig>): AdvancedOrderRouter;
/**
 * Reset the global Advanced Order Router instance (for testing)
 */
export declare function resetAdvancedOrderRouter(): void;
//# sourceMappingURL=AdvancedOrderRouter.d.ts.map