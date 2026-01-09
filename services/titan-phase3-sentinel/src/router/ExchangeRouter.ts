import type { IExchangeGateway } from "../exchanges/interfaces.js";
import type { Order, OrderResult } from "../types/orders.js";
import { PriceMonitor } from "./PriceMonitor.js";
import { CostCalculator } from "./CostCalculator.js";

interface RoutingDecision {
    targetExchange: string;
    expectedPrice: number;
    estimatedCost: number;
}

/**
 * Smart Router for Cross-Gateway Execution
 */
export class ExchangeRouter {
    private gateways: Map<string, IExchangeGateway>;
    private priceMonitor: PriceMonitor;
    private costCalculator: CostCalculator;

    constructor(
        gateways: Record<string, IExchangeGateway>,
        fees: Record<string, number>,
    ) {
        this.gateways = new Map(Object.entries(gateways));
        this.priceMonitor = new PriceMonitor(gateways);
        this.costCalculator = new CostCalculator(fees);
    }

    /**
     * Route and execute order on best exchange
     */
    async routeAndExecute(order: Order): Promise<OrderResult> {
        const decision = await this.findBestRoute(order);

        if (!decision) {
            throw new Error("No valid route found");
        }

        const gateway = this.gateways.get(decision.targetExchange);
        if (!gateway) {
            throw new Error(`Gateway ${decision.targetExchange} not found`);
        }

        // Execute
        return gateway.executeOrder(order);
    }

    /**
     * Find best exchange based on price and cost
     */
    async findBestRoute(order: Order): Promise<RoutingDecision | null> {
        const quotes = await this.priceMonitor.getAllPrices(order.symbol);
        if (quotes.length === 0) return null;

        let bestDecision: RoutingDecision | null = null;

        for (const quote of quotes) {
            const cost = this.costCalculator.calculateCost(
                quote.exchange,
                order.side,
                quote.price,
                order.size,
            );

            // Compare effective price
            // BUY: Minimize effective price
            // SELL: Maximize effective price

            let isBetter = false;
            if (!bestDecision) {
                isBetter = true;
            } else {
                if (order.side === "BUY") {
                    isBetter = cost.effectivePrice < bestDecision.estimatedCost; // Using estimatedCost field to store effective price for comparison??
                    // Wait, RoutingDecision structure logic:
                    // estimatedCost usually implies total cost.
                    // Let's use effectivePrice for comparison.
                } else {
                    isBetter = cost.effectivePrice >
                        (bestDecision.estimatedCost / order.size); // Rough logic check
                }

                // Let's rely on effectivePrice explicitly
                // If I store effectivePrice in decision, it's cleaner.
                // But RoutingDecision has estimatedCost (Total).
                // Total Cost for BUY = Price * Size + Fees. We want to MINIMIZE this.
                // Total Cost for SELL = Price * Size - Fees. We want to MAXIMIZE this (Net Proceeds).

                const currentBestTotal = bestDecision.estimatedCost;
                if (order.side === "BUY") {
                    isBetter = cost.totalCost < currentBestTotal;
                } else {
                    isBetter = cost.totalCost > currentBestTotal;
                }
            }

            if (isBetter) {
                bestDecision = {
                    targetExchange: quote.exchange,
                    expectedPrice: quote.price,
                    estimatedCost: cost.totalCost,
                };
            }
        }

        return bestDecision;
    }
}
