"use strict";
/**
 * Advanced Order Router for Titan Trading System
 *
 * Provides intelligent order routing with co-location optimization,
 * smart order routing (SOR), and advanced execution algorithms.
 *
 * Requirements: 10.1 - Advanced order routing and execution algorithms
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ORDER_ROUTER_CONFIG = exports.AdvancedOrderRouter = void 0;
exports.getAdvancedOrderRouter = getAdvancedOrderRouter;
exports.resetAdvancedOrderRouter = resetAdvancedOrderRouter;
const eventemitter3_1 = require("eventemitter3");
const perf_hooks_1 = require("perf_hooks");
// Simple color logging utility
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
};
/**
 * TWAP (Time-Weighted Average Price) Algorithm
 */
class TWAPAlgorithm {
    name = 'TWAP';
    async route(request, venues, marketData) {
        // TWAP spreads order over time and venues
        const activeVenues = venues.filter(v => v.isActive);
        const timeSlices = 10; // Split into 10 time slices
        const quantityPerSlice = request.quantity / timeSlices;
        const routes = [];
        let totalCost = 0;
        let maxLatency = 0;
        // Distribute across top venues by liquidity
        const sortedVenues = activeVenues
            .sort((a, b) => b.liquidity.marketShare - a.liquidity.marketShare)
            .slice(0, 3); // Use top 3 venues
        for (let i = 0; i < sortedVenues.length; i++) {
            const venue = sortedVenues[i];
            const allocation = quantityPerSlice / sortedVenues.length;
            const venueData = marketData.venues[venue.id];
            const expectedPrice = request.side === 'BUY' ? venueData?.ask || 0 : venueData?.bid || 0;
            const expectedFees = (expectedPrice * allocation * venue.fees.taker) / 10000;
            routes.push({
                venueId: venue.id,
                quantity: allocation,
                percentage: (allocation / request.quantity) * 100,
                expectedPrice,
                expectedFees,
                expectedLatency: venue.latency,
                priority: i + 1,
                orderParams: {
                    type: 'LIMIT',
                    timeInForce: 'GTC',
                    hidden: false
                }
            });
            totalCost += expectedFees;
            maxLatency = Math.max(maxLatency, venue.latency);
        }
        return {
            requestId: request.orderId,
            routes,
            totalExpectedCost: (totalCost / (request.quantity * (request.price || 1))) * 10000,
            expectedLatency: maxLatency,
            confidence: 85,
            reasoning: 'TWAP algorithm distributes order across time and top liquidity venues',
            timestamp: Date.now()
        };
    }
    getDescription() {
        return 'Time-Weighted Average Price algorithm for steady execution over time';
    }
}
/**
 * VWAP (Volume-Weighted Average Price) Algorithm
 */
class VWAPAlgorithm {
    name = 'VWAP';
    async route(request, venues, marketData) {
        // VWAP allocates based on historical volume patterns
        const activeVenues = venues.filter(v => v.isActive);
        const routes = [];
        let totalCost = 0;
        let maxLatency = 0;
        // Calculate total market volume
        const totalVolume = Object.values(marketData.venues).reduce((sum, data) => sum + (data?.volume || 0), 0);
        for (const venue of activeVenues) {
            const venueData = marketData.venues[venue.id];
            if (!venueData)
                continue;
            // Allocate based on venue's volume share
            const volumeShare = venueData.volume / totalVolume;
            const allocation = request.quantity * volumeShare;
            if (allocation < 1)
                continue; // Skip tiny allocations
            const expectedPrice = request.side === 'BUY' ? venueData.ask : venueData.bid;
            const expectedFees = (expectedPrice * allocation * venue.fees.taker) / 10000;
            routes.push({
                venueId: venue.id,
                quantity: allocation,
                percentage: volumeShare * 100,
                expectedPrice,
                expectedFees,
                expectedLatency: venue.latency,
                priority: routes.length + 1,
                orderParams: {
                    type: 'LIMIT',
                    timeInForce: 'IOC',
                    hidden: false
                }
            });
            totalCost += expectedFees;
            maxLatency = Math.max(maxLatency, venue.latency);
        }
        return {
            requestId: request.orderId,
            routes,
            totalExpectedCost: (totalCost / (request.quantity * (request.price || 1))) * 10000,
            expectedLatency: maxLatency,
            confidence: 90,
            reasoning: 'VWAP algorithm allocates based on historical volume patterns',
            timestamp: Date.now()
        };
    }
    getDescription() {
        return 'Volume-Weighted Average Price algorithm based on historical volume patterns';
    }
}
/**
 * Aggressive Liquidity Taking Algorithm
 */
class AggressiveAlgorithm {
    name = 'AGGRESSIVE';
    async route(request, venues, marketData) {
        // Aggressive algorithm prioritizes speed over cost
        const activeVenues = venues
            .filter(v => v.isActive)
            .sort((a, b) => a.latency - b.latency); // Sort by latency (fastest first)
        const routes = [];
        let remainingQuantity = request.quantity;
        let totalCost = 0;
        let maxLatency = 0;
        for (const venue of activeVenues.slice(0, 3)) { // Use top 3 fastest venues
            if (remainingQuantity <= 0)
                break;
            const venueData = marketData.venues[venue.id];
            if (!venueData)
                continue;
            // Take available liquidity
            const availableSize = request.side === 'BUY' ? venueData.askSize : venueData.bidSize;
            const allocation = Math.min(remainingQuantity, availableSize);
            if (allocation < 1)
                continue;
            const expectedPrice = request.side === 'BUY' ? venueData.ask : venueData.bid;
            const expectedFees = (expectedPrice * allocation * venue.fees.taker) / 10000;
            routes.push({
                venueId: venue.id,
                quantity: allocation,
                percentage: (allocation / request.quantity) * 100,
                expectedPrice,
                expectedFees,
                expectedLatency: venue.latency,
                priority: routes.length + 1,
                orderParams: {
                    type: 'MARKET',
                    timeInForce: 'IOC',
                    hidden: false
                }
            });
            remainingQuantity -= allocation;
            totalCost += expectedFees;
            maxLatency = Math.max(maxLatency, venue.latency);
        }
        return {
            requestId: request.orderId,
            routes,
            totalExpectedCost: (totalCost / (request.quantity * (request.price || 1))) * 10000,
            expectedLatency: maxLatency,
            confidence: 95,
            reasoning: 'Aggressive algorithm prioritizes speed using fastest venues',
            timestamp: Date.now()
        };
    }
    getDescription() {
        return 'Aggressive algorithm prioritizing speed over cost using fastest venues';
    }
}
/**
 * Stealth Algorithm for large orders
 */
class StealthAlgorithm {
    name = 'STEALTH';
    async route(request, venues, marketData) {
        // Stealth algorithm uses dark pools and hidden orders
        const darkPools = venues.filter(v => v.isActive && v.type === 'DARK_POOL');
        const exchanges = venues.filter(v => v.isActive && v.type === 'EXCHANGE');
        const routes = [];
        let totalCost = 0;
        let maxLatency = 0;
        // Prefer dark pools for large orders
        const darkPoolAllocation = Math.min(request.quantity * 0.7, request.quantity);
        const exchangeAllocation = request.quantity - darkPoolAllocation;
        // Allocate to dark pools
        if (darkPools.length > 0 && darkPoolAllocation > 0) {
            const allocationPerPool = darkPoolAllocation / darkPools.length;
            for (const venue of darkPools) {
                const venueData = marketData.venues[venue.id];
                const expectedPrice = request.price || (venueData ?
                    (request.side === 'BUY' ? venueData.ask : venueData.bid) : 0);
                const expectedFees = (expectedPrice * allocationPerPool * venue.fees.taker) / 10000;
                routes.push({
                    venueId: venue.id,
                    quantity: allocationPerPool,
                    percentage: (allocationPerPool / request.quantity) * 100,
                    expectedPrice,
                    expectedFees,
                    expectedLatency: venue.latency,
                    priority: routes.length + 1,
                    orderParams: {
                        type: 'LIMIT',
                        timeInForce: 'GTC',
                        hidden: true
                    }
                });
                totalCost += expectedFees;
                maxLatency = Math.max(maxLatency, venue.latency);
            }
        }
        // Allocate remaining to exchanges with hidden orders
        if (exchanges.length > 0 && exchangeAllocation > 0) {
            const allocationPerExchange = exchangeAllocation / Math.min(exchanges.length, 2);
            for (const venue of exchanges.slice(0, 2)) {
                const venueData = marketData.venues[venue.id];
                const expectedPrice = request.price || (venueData ?
                    (request.side === 'BUY' ? venueData.ask : venueData.bid) : 0);
                const expectedFees = (expectedPrice * allocationPerExchange * venue.fees.maker) / 10000;
                routes.push({
                    venueId: venue.id,
                    quantity: allocationPerExchange,
                    percentage: (allocationPerExchange / request.quantity) * 100,
                    expectedPrice,
                    expectedFees,
                    expectedLatency: venue.latency,
                    priority: routes.length + 1,
                    orderParams: {
                        type: 'LIMIT',
                        timeInForce: 'GTC',
                        hidden: true,
                        displayQuantity: Math.min(allocationPerExchange * 0.1, 100) // Show only 10%
                    }
                });
                totalCost += expectedFees;
                maxLatency = Math.max(maxLatency, venue.latency);
            }
        }
        return {
            requestId: request.orderId,
            routes,
            totalExpectedCost: (totalCost / (request.quantity * (request.price || 1))) * 10000,
            expectedLatency: maxLatency,
            confidence: 80,
            reasoning: 'Stealth algorithm uses dark pools and hidden orders to minimize market impact',
            timestamp: Date.now()
        };
    }
    getDescription() {
        return 'Stealth algorithm using dark pools and hidden orders to minimize market impact';
    }
}
/**
 * Advanced Order Router
 */
class AdvancedOrderRouter extends eventemitter3_1.EventEmitter {
    config;
    venues = new Map();
    algorithms = new Map();
    marketDataCache = new Map();
    routingHistory = [];
    metrics = {
        totalRoutes: 0,
        averageLatency: 0,
        averageCost: 0,
        successRate: 0,
        venueUtilization: new Map()
    };
    constructor(config = {}) {
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
            ...config
        };
        // Initialize built-in algorithms
        this.algorithms.set('TWAP', new TWAPAlgorithm());
        this.algorithms.set('VWAP', new VWAPAlgorithm());
        this.algorithms.set('AGGRESSIVE', new AggressiveAlgorithm());
        this.algorithms.set('STEALTH', new StealthAlgorithm());
        console.log(colors.blue('🎯 Advanced Order Router initialized'));
    }
    /**
     * Add trading venue
     */
    addVenue(venue) {
        this.venues.set(venue.id, venue);
        this.metrics.venueUtilization.set(venue.id, 0);
        console.log(colors.green(`➕ Added venue: ${venue.name} (${venue.type}, latency: ${venue.latency}μs)`));
    }
    /**
     * Remove trading venue
     */
    removeVenue(venueId) {
        const removed = this.venues.delete(venueId);
        this.metrics.venueUtilization.delete(venueId);
        if (removed) {
            console.log(colors.yellow(`➖ Removed venue: ${venueId}`));
        }
        return removed;
    }
    /**
     * Update venue status
     */
    updateVenueStatus(venueId, isActive) {
        const venue = this.venues.get(venueId);
        if (venue) {
            venue.isActive = isActive;
            console.log(colors.cyan(`🔄 Venue ${venueId} is now ${isActive ? 'active' : 'inactive'}`));
        }
    }
    /**
     * Add custom execution algorithm
     */
    addAlgorithm(algorithm) {
        this.algorithms.set(algorithm.name, algorithm);
        console.log(colors.green(`➕ Added algorithm: ${algorithm.name}`));
    }
    /**
     * Update market data
     */
    updateMarketData(marketData) {
        this.marketDataCache.set(marketData.symbol, {
            ...marketData,
            timestamp: Date.now()
        });
    }
    /**
     * Route order using smart order routing
     */
    async routeOrder(request) {
        const startTime = perf_hooks_1.performance.now();
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
            const decision = await algorithm.route(request, availableVenues, marketData);
            // Apply co-location and network optimizations
            if (this.config.enableCoLocation || this.config.enableNetworkOptimization) {
                this.optimizeRouting(decision, availableVenues);
            }
            // Update metrics
            const routingLatency = (perf_hooks_1.performance.now() - startTime) * 1000; // Convert to microseconds
            this.updateMetrics(decision, routingLatency);
            // Store routing history
            this.routingHistory.push(decision);
            if (this.routingHistory.length > 1000) {
                this.routingHistory = this.routingHistory.slice(-1000);
            }
            console.log(colors.cyan(`🎯 Routed order ${request.orderId}: ${decision.routes.length} venues, ${routingLatency.toFixed(2)}μs`));
            this.emit('orderRouted', decision);
            return decision;
        }
        catch (error) {
            console.error(colors.red(`❌ Order routing failed for ${request.orderId}:`), error);
            throw error;
        }
    }
    /**
     * Validate routing request
     */
    validateRequest(request) {
        if (request.quantity < this.config.minOrderSize) {
            throw new Error(`Order size ${request.quantity} below minimum ${this.config.minOrderSize}`);
        }
        if (request.quantity > this.config.maxOrderSize) {
            throw new Error(`Order size ${request.quantity} above maximum ${this.config.maxOrderSize}`);
        }
        if (request.maxSlippage && request.maxSlippage < 0) {
            throw new Error('Max slippage cannot be negative');
        }
    }
    /**
     * Get market data for symbol
     */
    getMarketData(symbol) {
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
    selectAlgorithm(request) {
        // Select based on order type and strategy
        if (request.orderType === 'TWAP') {
            return this.algorithms.get('TWAP');
        }
        if (request.orderType === 'VWAP') {
            return this.algorithms.get('VWAP');
        }
        switch (request.strategy) {
            case 'AGGRESSIVE':
                return this.algorithms.get('AGGRESSIVE');
            case 'STEALTH':
                return this.algorithms.get('STEALTH');
            case 'PASSIVE':
                return this.algorithms.get('TWAP');
            default:
                // Default to VWAP for normal orders
                return this.algorithms.get('VWAP');
        }
    }
    /**
     * Get available venues for routing
     */
    getAvailableVenues(request) {
        let venues = Array.from(this.venues.values()).filter(venue => venue.isActive);
        // Apply constraints
        if (request.constraints) {
            const { excludeVenues, preferredVenues, maxVenues, darkPoolOnly, requireRebate } = request.constraints;
            if (excludeVenues) {
                venues = venues.filter(venue => !excludeVenues.includes(venue.id));
            }
            if (preferredVenues) {
                const preferred = venues.filter(venue => preferredVenues.includes(venue.id));
                const others = venues.filter(venue => !preferredVenues.includes(venue.id));
                venues = [...preferred, ...others];
            }
            if (darkPoolOnly) {
                venues = venues.filter(venue => venue.type === 'DARK_POOL');
            }
            if (requireRebate) {
                venues = venues.filter(venue => venue.fees.rebate && venue.fees.rebate > 0);
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
    optimizeRouting(decision, venues) {
        if (this.config.enableCoLocation) {
            // Prioritize co-located venues
            decision.routes.sort((a, b) => {
                const venueA = venues.find(v => v.id === a.venueId);
                const venueB = venues.find(v => v.id === b.venueId);
                if (venueA?.coLocationAvailable && !venueB?.coLocationAvailable)
                    return -1;
                if (!venueA?.coLocationAvailable && venueB?.coLocationAvailable)
                    return 1;
                return a.expectedLatency - b.expectedLatency;
            });
        }
        if (this.config.enableNetworkOptimization) {
            // Adjust latency estimates for network-optimized venues
            for (const route of decision.routes) {
                const venue = venues.find(v => v.id === route.venueId);
                if (venue?.networkOptimized) {
                    route.expectedLatency *= 0.8; // 20% latency reduction
                }
            }
        }
    }
    /**
     * Update routing metrics
     */
    updateMetrics(decision, latency) {
        this.metrics.totalRoutes++;
        this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
        this.metrics.averageCost = (this.metrics.averageCost + decision.totalExpectedCost) / 2;
        // Update venue utilization
        for (const route of decision.routes) {
            const current = this.metrics.venueUtilization.get(route.venueId) || 0;
            this.metrics.venueUtilization.set(route.venueId, current + 1);
        }
    }
    /**
     * Get routing statistics
     */
    getRoutingStats() {
        const algorithmUsage = {};
        for (const algorithm of this.algorithms.keys()) {
            algorithmUsage[algorithm] = 0;
        }
        // Count algorithm usage from recent history
        for (const decision of this.routingHistory.slice(-100)) {
            // This would need to be tracked during routing
            // For now, just initialize to 0
        }
        return {
            totalRoutes: this.metrics.totalRoutes,
            averageLatency: this.metrics.averageLatency,
            averageCost: this.metrics.averageCost,
            venueUtilization: Object.fromEntries(this.metrics.venueUtilization),
            algorithmUsage,
            recentDecisions: this.routingHistory.slice(-10)
        };
    }
    /**
     * Get available venues
     */
    getVenues() {
        return Array.from(this.venues.values());
    }
    /**
     * Get available algorithms
     */
    getAlgorithms() {
        return Array.from(this.algorithms.keys());
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        console.log(colors.blue('⚙️ Order router configuration updated'));
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log(colors.blue('🛑 Shutting down Advanced Order Router...'));
        this.venues.clear();
        this.algorithms.clear();
        this.marketDataCache.clear();
        this.routingHistory = [];
        this.removeAllListeners();
    }
}
exports.AdvancedOrderRouter = AdvancedOrderRouter;
/**
 * Default order router configuration
 */
exports.DEFAULT_ORDER_ROUTER_CONFIG = {
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
    marketDataTimeout: 1000 // 1 second
};
/**
 * Singleton Advanced Order Router instance
 */
let orderRouterInstance = null;
/**
 * Get or create the global Advanced Order Router instance
 */
function getAdvancedOrderRouter(config) {
    if (!orderRouterInstance) {
        orderRouterInstance = new AdvancedOrderRouter(config);
    }
    return orderRouterInstance;
}
/**
 * Reset the global Advanced Order Router instance (for testing)
 */
function resetAdvancedOrderRouter() {
    if (orderRouterInstance) {
        orderRouterInstance.shutdown();
    }
    orderRouterInstance = null;
}
//# sourceMappingURL=AdvancedOrderRouter.js.map