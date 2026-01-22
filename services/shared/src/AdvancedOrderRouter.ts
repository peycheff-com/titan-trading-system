/**
 * Advanced Order Router for Titan Trading System
 *
 * Provides intelligent order routing with co-location optimization,
 * smart order routing (SOR), and advanced execution algorithms.
 *
 * Requirements: 10.1 - Advanced order routing and execution algorithms
 */

import { EventEmitter } from "eventemitter3";
import { performance } from "perf_hooks";

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
};

/**
 * Venue information for order routing
 */
export interface TradingVenue {
  id: string;
  name: string;
  type: "EXCHANGE" | "ECN" | "DARK_POOL" | "MARKET_MAKER";
  latency: number; // Average latency in microseconds
  fees: {
    maker: number; // Basis points
    taker: number; // Basis points
    rebate?: number; // Basis points
  };
  liquidity: {
    averageSpread: number; // Basis points
    averageDepth: number; // USD
    marketShare: number; // Percentage
  };
  capabilities: string[]; // 'IOC', 'FOK', 'HIDDEN', 'ICEBERG', etc.
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
  side: "BUY" | "SELL";
  quantity: number;
  orderType:
    | "MARKET"
    | "LIMIT"
    | "STOP"
    | "STOP_LIMIT"
    | "ICEBERG"
    | "TWAP"
    | "VWAP";
  price?: number;
  timeInForce: "GTC" | "IOC" | "FOK" | "DAY";
  urgency: "IMMEDIATE" | "NORMAL" | "PATIENT";
  maxSlippage?: number; // Basis points
  minFillSize?: number;
  displayQuantity?: number; // For iceberg orders
  strategy?: "AGGRESSIVE" | "PASSIVE" | "NEUTRAL" | "STEALTH";
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
  totalExpectedCost: number; // Basis points
  expectedLatency: number; // Microseconds
  confidence: number; // 0-100
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
  priority: number; // Execution order
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
  venues: Record<
    string,
    {
      bid: number;
      ask: number;
      bidSize: number;
      askSize: number;
      lastPrice: number;
      volume: number;
      spread: number;
    }
  >;
  consolidated: {
    nbbo: { bid: number; ask: number };
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
  route(
    request: RoutingRequest,
    venues: TradingVenue[],
    marketData: MarketData,
  ): Promise<RoutingDecision>;
  getDescription(): string;
}

/**
 * Smart Order Router configuration
 */
export interface OrderRouterConfig {
  enableCoLocation: boolean;
  enableNetworkOptimization: boolean;
  maxVenuesPerOrder: number;
  defaultSlippageTolerance: number; // Basis points
  latencyWeighting: number; // 0-1, importance of latency vs cost
  feeWeighting: number; // 0-1, importance of fees
  liquidityWeighting: number; // 0-1, importance of liquidity
  enableDarkPools: boolean;
  enableRebateCapture: boolean;
  minOrderSize: number; // Minimum order size for routing
  maxOrderSize: number; // Maximum order size for single venue
  enableOrderSplitting: boolean;
  enableTimeSlicing: boolean;
  marketDataTimeout: number; // Milliseconds
}

/**
 * TWAP (Time-Weighted Average Price) Algorithm
 */
class TWAPAlgorithm implements ExecutionAlgorithm {
  name = "TWAP";

  async route(
    request: RoutingRequest,
    venues: TradingVenue[],
    marketData: MarketData,
  ): Promise<RoutingDecision> {
    // TWAP spreads order over time and venues
    const activeVenues = venues.filter((v) => v.isActive);
    const timeSlices = 10; // Split into 10 time slices
    const quantityPerSlice = request.quantity / timeSlices;

    const routes: RouteAllocation[] = [];
    // eslint-disable-next-line functional/no-let
    let totalCost = 0;
    // eslint-disable-next-line functional/no-let
    let maxLatency = 0;

    // Distribute across top venues by liquidity
    // eslint-disable-next-line functional/immutable-data
    const sortedVenues = activeVenues
      .sort((a, b) => b.liquidity.marketShare - a.liquidity.marketShare)
      .slice(0, 3); // Use top 3 venues

    // eslint-disable-next-line functional/no-let
    for (let i = 0; i < sortedVenues.length; i++) {
      const venue = sortedVenues[i];
      const allocation = quantityPerSlice / sortedVenues.length;

      const venueData = marketData.venues[venue.id];
      const expectedPrice = request.side === "BUY"
        ? venueData?.ask || 0
        : venueData?.bid || 0;
      const expectedFees = (expectedPrice * allocation * venue.fees.taker) /
        10000;

      // eslint-disable-next-line functional/immutable-data
      routes.push({
        venueId: venue.id,
        quantity: allocation,
        percentage: (allocation / request.quantity) * 100,
        expectedPrice,
        expectedFees,
        expectedLatency: venue.latency,
        priority: i + 1,
        orderParams: {
          type: "LIMIT",
          timeInForce: "GTC",
          hidden: false,
        },
      });

      totalCost += expectedFees;
      maxLatency = Math.max(maxLatency, venue.latency);
    }

    return {
      requestId: request.orderId,
      routes,
      totalExpectedCost:
        (totalCost / (request.quantity * (request.price || 1))) * 10000,
      expectedLatency: maxLatency,
      confidence: 85,
      reasoning:
        "TWAP algorithm distributes order across time and top liquidity venues",
      timestamp: Date.now(),
    };
  }

  getDescription(): string {
    return "Time-Weighted Average Price algorithm for steady execution over time";
  }
}

/**
 * VWAP (Volume-Weighted Average Price) Algorithm
 */
class VWAPAlgorithm implements ExecutionAlgorithm {
  name = "VWAP";

  async route(
    request: RoutingRequest,
    venues: TradingVenue[],
    marketData: MarketData,
  ): Promise<RoutingDecision> {
    // VWAP allocates based on historical volume patterns
    const activeVenues = venues.filter((v) => v.isActive);
    const routes: RouteAllocation[] = [];
    // eslint-disable-next-line functional/no-let
    let totalCost = 0;
    // eslint-disable-next-line functional/no-let
    let maxLatency = 0;

    // Calculate total market volume
    const totalVolume = Object.values(marketData.venues).reduce(
      (sum, data) => sum + (data?.volume || 0),
      0,
    );

    for (const venue of activeVenues) {
      const venueData = marketData.venues[venue.id];
      if (!venueData) continue;

      // Allocate based on venue's volume share
      const volumeShare = venueData.volume / totalVolume;
      const allocation = request.quantity * volumeShare;

      if (allocation < 1) continue; // Skip tiny allocations

      const expectedPrice = request.side === "BUY"
        ? venueData.ask
        : venueData.bid;
      const expectedFees = (expectedPrice * allocation * venue.fees.taker) /
        10000;

      // eslint-disable-next-line functional/immutable-data
      routes.push({
        venueId: venue.id,
        quantity: allocation,
        percentage: volumeShare * 100,
        expectedPrice,
        expectedFees,
        expectedLatency: venue.latency,
        priority: routes.length + 1,
        orderParams: {
          type: "LIMIT",
          timeInForce: "IOC",
          hidden: false,
        },
      });

      totalCost += expectedFees;
      maxLatency = Math.max(maxLatency, venue.latency);
    }

    return {
      requestId: request.orderId,
      routes,
      totalExpectedCost:
        (totalCost / (request.quantity * (request.price || 1))) * 10000,
      expectedLatency: maxLatency,
      confidence: 90,
      reasoning: "VWAP algorithm allocates based on historical volume patterns",
      timestamp: Date.now(),
    };
  }

  getDescription(): string {
    return "Volume-Weighted Average Price algorithm based on historical volume patterns";
  }
}

/**
 * Aggressive Liquidity Taking Algorithm
 */
class AggressiveAlgorithm implements ExecutionAlgorithm {
  name = "AGGRESSIVE";

  async route(
    request: RoutingRequest,
    venues: TradingVenue[],
    marketData: MarketData,
  ): Promise<RoutingDecision> {
    // Aggressive algorithm prioritizes speed over cost
    const activeVenues = venues.filter((v) => v.isActive).sort((a, b) =>
      a.latency - b.latency
    ); // Sort by latency (fastest first)

    const routes: RouteAllocation[] = [];
    // eslint-disable-next-line functional/no-let
    let remainingQuantity = request.quantity;
    // eslint-disable-next-line functional/no-let
    let totalCost = 0;
    // eslint-disable-next-line functional/no-let
    let maxLatency = 0;

    for (const venue of activeVenues.slice(0, 3)) {
      // Use top 3 fastest venues
      if (remainingQuantity <= 0) break;

      const venueData = marketData.venues[venue.id];
      if (!venueData) continue;

      // Take available liquidity
      const availableSize = request.side === "BUY"
        ? venueData.askSize
        : venueData.bidSize;
      const allocation = Math.min(remainingQuantity, availableSize);

      if (allocation < 1) continue;

      const expectedPrice = request.side === "BUY"
        ? venueData.ask
        : venueData.bid;
      const expectedFees = (expectedPrice * allocation * venue.fees.taker) /
        10000;

      // eslint-disable-next-line functional/immutable-data
      routes.push({
        venueId: venue.id,
        quantity: allocation,
        percentage: (allocation / request.quantity) * 100,
        expectedPrice,
        expectedFees,
        expectedLatency: venue.latency,
        priority: routes.length + 1,
        orderParams: {
          type: "MARKET",
          timeInForce: "IOC",
          hidden: false,
        },
      });

      remainingQuantity -= allocation;
      totalCost += expectedFees;
      maxLatency = Math.max(maxLatency, venue.latency);
    }

    return {
      requestId: request.orderId,
      routes,
      totalExpectedCost:
        (totalCost / (request.quantity * (request.price || 1))) * 10000,
      expectedLatency: maxLatency,
      confidence: 95,
      reasoning: "Aggressive algorithm prioritizes speed using fastest venues",
      timestamp: Date.now(),
    };
  }

  getDescription(): string {
    return "Aggressive algorithm prioritizing speed over cost using fastest venues";
  }
}

/**
 * Stealth Algorithm for large orders
 */
class StealthAlgorithm implements ExecutionAlgorithm {
  name = "STEALTH";

  async route(
    request: RoutingRequest,
    venues: TradingVenue[],
    marketData: MarketData,
  ): Promise<RoutingDecision> {
    // Stealth algorithm uses dark pools and hidden orders
    const darkPools = venues.filter((v) =>
      v.isActive && v.type === "DARK_POOL"
    );
    const exchanges = venues.filter((v) => v.isActive && v.type === "EXCHANGE");

    const routes: RouteAllocation[] = [];
    // eslint-disable-next-line functional/no-let
    let totalCost = 0;
    // eslint-disable-next-line functional/no-let
    let maxLatency = 0;

    // Prefer dark pools for large orders
    const darkPoolAllocation = Math.min(
      request.quantity * 0.7,
      request.quantity,
    );
    const exchangeAllocation = request.quantity - darkPoolAllocation;

    // Allocate to dark pools
    if (darkPools.length > 0 && darkPoolAllocation > 0) {
      const allocationPerPool = darkPoolAllocation / darkPools.length;

      for (const venue of darkPools) {
        const venueData = marketData.venues[venue.id];
        const expectedPrice = request.price ||
          (venueData
            ? (request.side === "BUY" ? venueData.ask : venueData.bid)
            : 0);
        const expectedFees =
          (expectedPrice * allocationPerPool * venue.fees.taker) / 10000;

        // eslint-disable-next-line functional/immutable-data
        routes.push({
          venueId: venue.id,
          quantity: allocationPerPool,
          percentage: (allocationPerPool / request.quantity) * 100,
          expectedPrice,
          expectedFees,
          expectedLatency: venue.latency,
          priority: routes.length + 1,
          orderParams: {
            type: "LIMIT",
            timeInForce: "GTC",
            hidden: true,
          },
        });

        totalCost += expectedFees;
        maxLatency = Math.max(maxLatency, venue.latency);
      }
    }

    // Allocate remaining to exchanges with hidden orders
    if (exchanges.length > 0 && exchangeAllocation > 0) {
      const allocationPerExchange = exchangeAllocation /
        Math.min(exchanges.length, 2);

      for (const venue of exchanges.slice(0, 2)) {
        const venueData = marketData.venues[venue.id];
        const expectedPrice = request.price ||
          (venueData
            ? (request.side === "BUY" ? venueData.ask : venueData.bid)
            : 0);
        const expectedFees =
          (expectedPrice * allocationPerExchange * venue.fees.maker) / 10000;

        // eslint-disable-next-line functional/immutable-data
        routes.push({
          venueId: venue.id,
          quantity: allocationPerExchange,
          percentage: (allocationPerExchange / request.quantity) * 100,
          expectedPrice,
          expectedFees,
          expectedLatency: venue.latency,
          priority: routes.length + 1,
          orderParams: {
            type: "LIMIT",
            timeInForce: "GTC",
            hidden: true,
            displayQuantity: Math.min(allocationPerExchange * 0.1, 100), // Show only 10%
          },
        });

        totalCost += expectedFees;
        maxLatency = Math.max(maxLatency, venue.latency);
      }
    }

    return {
      requestId: request.orderId,
      routes,
      totalExpectedCost:
        (totalCost / (request.quantity * (request.price || 1))) * 10000,
      expectedLatency: maxLatency,
      confidence: 80,
      reasoning:
        "Stealth algorithm uses dark pools and hidden orders to minimize market impact",
      timestamp: Date.now(),
    };
  }

  getDescription(): string {
    return "Stealth algorithm using dark pools and hidden orders to minimize market impact";
  }
}

/**
 * Advanced Order Router
 */
export class AdvancedOrderRouter extends EventEmitter {
  private config: OrderRouterConfig;
  private venues = new Map<string, TradingVenue>();
  private algorithms = new Map<string, ExecutionAlgorithm>();
  private marketDataCache = new Map<string, MarketData>();
  private routingHistory: RoutingDecision[] = [];
  private metrics = {
    totalRoutes: 0,
    averageLatency: 0,
    averageCost: 0,
    successRate: 0,
    venueUtilization: new Map<string, number>(),
  };

  constructor(config: Partial<OrderRouterConfig> = {}) {
    super();

    this.config = {
      enableCoLocation: false,
      enableNetworkOptimization: true,
      maxVenuesPerOrder: 5,
      defaultSlippageTolerance: 50, // 50 basis points
      latencyWeighting: 0.3,
      feeWeighting: 0.4,
      liquidityWeighting: 0.3,
      enableDarkPools: true,
      enableRebateCapture: true,
      minOrderSize: 1,
      maxOrderSize: 1000000,
      enableOrderSplitting: true,
      enableTimeSlicing: true,
      marketDataTimeout: 1000, // 1 second
      ...config,
    };

    // Initialize built-in algorithms
    // eslint-disable-next-line functional/immutable-data
    this.algorithms.set("TWAP", new TWAPAlgorithm());
    // eslint-disable-next-line functional/immutable-data
    this.algorithms.set("VWAP", new VWAPAlgorithm());
    // eslint-disable-next-line functional/immutable-data
    this.algorithms.set("AGGRESSIVE", new AggressiveAlgorithm());
    // eslint-disable-next-line functional/immutable-data
    this.algorithms.set("STEALTH", new StealthAlgorithm());

    console.log(colors.blue("🎯 Advanced Order Router initialized"));
  }

  /**
   * Add trading venue
   */
  addVenue(venue: TradingVenue): void {
    // eslint-disable-next-line functional/immutable-data
    this.venues.set(venue.id, venue);
    // eslint-disable-next-line functional/immutable-data
    this.metrics.venueUtilization.set(venue.id, 0);

    console.log(
      colors.green(
        `➕ Added venue: ${venue.name} (${venue.type}, latency: ${venue.latency}μs)`,
      ),
    );
  }

  /**
   * Remove trading venue
   */
  removeVenue(venueId: string): boolean {
    // eslint-disable-next-line functional/immutable-data
    const removed = this.venues.delete(venueId);
    // eslint-disable-next-line functional/immutable-data
    this.metrics.venueUtilization.delete(venueId);

    if (removed) {
      console.log(colors.yellow(`➖ Removed venue: ${venueId}`));
    }

    return removed;
  }

  /**
   * Update venue status
   */
  updateVenueStatus(venueId: string, isActive: boolean): void {
    const venue = this.venues.get(venueId);
    if (venue) {
      // eslint-disable-next-line functional/immutable-data
      venue.isActive = isActive;
      console.log(
        colors.cyan(
          `🔄 Venue ${venueId} is now ${isActive ? "active" : "inactive"}`,
        ),
      );
    }
  }

  /**
   * Add custom execution algorithm
   */
  addAlgorithm(algorithm: ExecutionAlgorithm): void {
    // eslint-disable-next-line functional/immutable-data
    this.algorithms.set(algorithm.name, algorithm);
    console.log(colors.green(`➕ Added algorithm: ${algorithm.name}`));
  }

  /**
   * Update market data
   */
  updateMarketData(marketData: MarketData): void {
    // eslint-disable-next-line functional/immutable-data
    this.marketDataCache.set(marketData.symbol, {
      ...marketData,
      timestamp: Date.now(),
    });
  }

  /**
   * Route order using smart order routing
   */
  async routeOrder(request: RoutingRequest): Promise<RoutingDecision> {
    const startTime = performance.now();

    try {
      // Validate request
      this.validateRequest(request);

      // Get market data
      const marketData = this.getMarketData(request.symbol);
      if (!marketData) {
        throw new Error(`No market data available for ${request.symbol}`);
      }

      // Select algorithm based on request strategy
      const algorithm = this.selectAlgorithm(request);

      // Get available venues
      const availableVenues = this.getAvailableVenues(request);

      // Route the order
      const decision = await algorithm.route(
        request,
        availableVenues,
        marketData,
      );

      // Apply co-location and network optimizations
      if (
        this.config.enableCoLocation || this.config.enableNetworkOptimization
      ) {
        this.optimizeRouting(decision, availableVenues);
      }

      // Update metrics
      const routingLatency = (performance.now() - startTime) * 1000; // Convert to microseconds
      this.updateMetrics(decision, routingLatency);

      // Store routing history
      // eslint-disable-next-line functional/immutable-data
      this.routingHistory.push(decision);
      if (this.routingHistory.length > 1000) {
        // eslint-disable-next-line functional/immutable-data
        this.routingHistory = this.routingHistory.slice(-1000);
      }

      console.log(
        colors.cyan(
          `🎯 Routed order ${request.orderId}: ${decision.routes.length} venues, ${
            routingLatency.toFixed(2)
          }μs`,
        ),
      );

      this.emit("orderRouted", decision);

      return decision;
    } catch (error) {
      console.error(
        colors.red(`❌ Order routing failed for ${request.orderId}:`),
        error,
      );
      throw error;
    }
  }

  /**
   * Validate routing request
   */
  private validateRequest(request: RoutingRequest): void {
    if (request.quantity < this.config.minOrderSize) {
      throw new Error(
        `Order size ${request.quantity} below minimum ${this.config.minOrderSize}`,
      );
    }

    if (request.quantity > this.config.maxOrderSize) {
      throw new Error(
        `Order size ${request.quantity} above maximum ${this.config.maxOrderSize}`,
      );
    }

    if (request.maxSlippage && request.maxSlippage < 0) {
      throw new Error("Max slippage cannot be negative");
    }
  }

  /**
   * Get market data for symbol
   */
  private getMarketData(symbol: string): MarketData | null {
    const data = this.marketDataCache.get(symbol);

    if (!data) {
      return null;
    }

    // Check if data is stale
    if (Date.now() - data.timestamp > this.config.marketDataTimeout) {
      console.warn(colors.yellow(`⚠️ Stale market data for ${symbol}`));
      return null;
    }

    return data;
  }

  /**
   * Select appropriate algorithm
   */
  private selectAlgorithm(request: RoutingRequest): ExecutionAlgorithm {
    // Select based on order type and strategy
    if (request.orderType === "TWAP") {
      return this.algorithms.get("TWAP")!;
    }

    if (request.orderType === "VWAP") {
      return this.algorithms.get("VWAP")!;
    }

    switch (request.strategy) {
      case "AGGRESSIVE":
        return this.algorithms.get("AGGRESSIVE")!;
      case "STEALTH":
        return this.algorithms.get("STEALTH")!;
      case "PASSIVE":
        return this.algorithms.get("TWAP")!;
      default:
        // Default to VWAP for normal orders
        return this.algorithms.get("VWAP")!;
    }
  }

  /**
   * Get available venues for routing
   */
  private getAvailableVenues(request: RoutingRequest): TradingVenue[] {
    // eslint-disable-next-line functional/no-let
    let venues = Array.from(this.venues.values()).filter((venue) =>
      venue.isActive
    );

    // Apply constraints
    if (request.constraints) {
      const {
        excludeVenues,
        preferredVenues,
        maxVenues,
        darkPoolOnly,
        requireRebate,
      } = request.constraints;

      if (excludeVenues) {
        venues = venues.filter((venue) => !excludeVenues.includes(venue.id));
      }

      if (preferredVenues) {
        const preferred = venues.filter((venue) =>
          preferredVenues.includes(venue.id)
        );
        const others = venues.filter((venue) =>
          !preferredVenues.includes(venue.id)
        );
        venues = [...preferred, ...others];
      }

      if (darkPoolOnly) {
        venues = venues.filter((venue) => venue.type === "DARK_POOL");
      }

      if (requireRebate) {
        venues = venues.filter((venue) =>
          venue.fees.rebate && venue.fees.rebate > 0
        );
      }

      if (maxVenues) {
        venues = venues.slice(0, maxVenues);
      }
    }

    // Limit to configured maximum
    venues = venues.slice(0, this.config.maxVenuesPerOrder);

    return venues;
  }

  /**
   * Optimize routing for co-location and network
   */
  private optimizeRouting(
    decision: RoutingDecision,
    venues: TradingVenue[],
  ): void {
    if (this.config.enableCoLocation) {
      // Prioritize co-located venues
      // eslint-disable-next-line functional/immutable-data
      decision.routes.sort((a, b) => {
        const venueA = venues.find((v) => v.id === a.venueId);
        const venueB = venues.find((v) => v.id === b.venueId);

        if (venueA?.coLocationAvailable && !venueB?.coLocationAvailable) {
          return -1;
        }
        if (!venueA?.coLocationAvailable && venueB?.coLocationAvailable) {
          return 1;
        }

        return a.expectedLatency - b.expectedLatency;
      });
    }

    if (this.config.enableNetworkOptimization) {
      // Adjust latency estimates for network-optimized venues
      for (const route of decision.routes) {
        const venue = venues.find((v) => v.id === route.venueId);
        if (venue?.networkOptimized) {
          // eslint-disable-next-line functional/immutable-data
          route.expectedLatency *= 0.8; // 20% latency reduction
        }
      }
    }
  }

  /**
   * Update routing metrics
   */
  private updateMetrics(decision: RoutingDecision, latency: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.metrics.totalRoutes++;
    // eslint-disable-next-line functional/immutable-data
    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
    // eslint-disable-next-line functional/immutable-data
    this.metrics.averageCost =
      (this.metrics.averageCost + decision.totalExpectedCost) / 2;

    // Update venue utilization
    for (const route of decision.routes) {
      const current = this.metrics.venueUtilization.get(route.venueId) || 0;
      // eslint-disable-next-line functional/immutable-data
      this.metrics.venueUtilization.set(route.venueId, current + 1);
    }
  }

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
  } {
    const algorithmUsage: Record<string, number> = {};
    for (const algorithm of this.algorithms.keys()) {
      // eslint-disable-next-line functional/immutable-data
      algorithmUsage[algorithm] = 0;
    }

    // Count algorithm usage from recent history
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _decision of this.routingHistory.slice(-100)) {
      // This would need to be tracked during routing
      // For now, just initialize to 0
    }

    return {
      totalRoutes: this.metrics.totalRoutes,
      averageLatency: this.metrics.averageLatency,
      averageCost: this.metrics.averageCost,
      venueUtilization: Object.fromEntries(this.metrics.venueUtilization),
      algorithmUsage,
      recentDecisions: this.routingHistory.slice(-10),
    };
  }

  /**
   * Get available venues
   */
  getVenues(): TradingVenue[] {
    return Array.from(this.venues.values());
  }

  /**
   * Get available algorithms
   */
  getAlgorithms(): string[] {
    return Array.from(this.algorithms.keys());
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OrderRouterConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };
    console.log(colors.blue("⚙️ Order router configuration updated"));
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log(colors.blue("🛑 Shutting down Advanced Order Router..."));
    // eslint-disable-next-line functional/immutable-data
    this.venues.clear();
    // eslint-disable-next-line functional/immutable-data
    this.algorithms.clear();
    // eslint-disable-next-line functional/immutable-data
    this.marketDataCache.clear();
    // eslint-disable-next-line functional/immutable-data
    this.routingHistory = [];
    this.removeAllListeners();
  }
}

/**
 * Default order router configuration
 */
export const DEFAULT_ORDER_ROUTER_CONFIG: OrderRouterConfig = {
  enableCoLocation: false,
  enableNetworkOptimization: true,
  maxVenuesPerOrder: 5,
  defaultSlippageTolerance: 50, // 50 basis points
  latencyWeighting: 0.3,
  feeWeighting: 0.4,
  liquidityWeighting: 0.3,
  enableDarkPools: true,
  enableRebateCapture: true,
  minOrderSize: 1,
  maxOrderSize: 1000000,
  enableOrderSplitting: true,
  enableTimeSlicing: true,
  marketDataTimeout: 1000, // 1 second
};

/**
 * Singleton Advanced Order Router instance
 */
// eslint-disable-next-line functional/no-let
let orderRouterInstance: AdvancedOrderRouter | null = null;

/**
 * Get or create the global Advanced Order Router instance
 */
export function getAdvancedOrderRouter(
  config?: Partial<OrderRouterConfig>,
): AdvancedOrderRouter {
  if (!orderRouterInstance) {
    orderRouterInstance = new AdvancedOrderRouter(config);
  }
  return orderRouterInstance;
}

/**
 * Reset the global Advanced Order Router instance (for testing)
 */
export function resetAdvancedOrderRouter(): void {
  if (orderRouterInstance) {
    orderRouterInstance.shutdown();
  }
  orderRouterInstance = null;
}
