/**
 * Exchange Types for Titan Phase 3 - The Sentinel
 *
 * Defines exchange gateway interfaces and routing types.
 */

import type { Order, OrderResult } from "./orders.js";
import type { OrderBook } from "./statistics.js";

/**
 * Supported exchanges
 */
export type ExchangeName = "binance" | "bybit";

/**
 * Market type
 */
export type MarketType = "SPOT" | "PERP";

/**
 * Exchange gateway interface
 */
export interface ExchangeGateway {
  /** Exchange name */
  name: ExchangeName;

  /** Check if connected */
  isConnected(): boolean;

  /** Get spot price for symbol */
  getSpotPrice(symbol: string): Promise<number>;

  /** Get perpetual price for symbol */
  getPerpPrice(symbol: string): Promise<number>;

  /** Get order book */
  getOrderBook(symbol: string, type: MarketType): Promise<OrderBook>;

  /** Place order */
  placeOrder(order: Order, type: MarketType): Promise<OrderResult>;

  /** Get balance for asset */
  getBalance(asset: string): Promise<number>;

  /** Transfer between wallets */
  transfer(from: string, to: string, amount: number): Promise<boolean>;
}

/**
 * Route decision for cross-exchange routing
 */
export interface RouteDecision {
  /** Selected exchange */
  exchange: ExchangeName;
  /** Expected execution price */
  price: number;
  /** Estimated total cost */
  estimatedCost: number;
  /** Whether routing is profitable */
  profitable: boolean;
  /** Reason for decision */
  reason: string;
}

/**
 * Complete route for cross-exchange arbitrage
 */
export interface Route {
  /** Exchange for spot leg */
  spotExchange: ExchangeName;
  /** Exchange for perpetual leg */
  perpExchange: ExchangeName;
  /** Whether transfer is required */
  transferRequired: boolean;
  /** Transfer cost in USD */
  transferCost: number;
  /** Withdrawal fee in USD */
  withdrawalFee: number;
  /** Total cost in USD */
  totalCost: number;
  /** Net profit after costs */
  netProfit: number;
}

/**
 * Transfer manager interface
 */
export interface TransferManager {
  /** Transfer from spot to futures wallet */
  transferSpotToFutures(
    exchange: ExchangeName,
    amount: number,
  ): Promise<boolean>;

  /** Transfer from futures to spot wallet */
  transferFuturesToSpot(
    exchange: ExchangeName,
    amount: number,
  ): Promise<boolean>;

  /** Withdraw to another exchange */
  withdrawToExchange(
    fromExchange: ExchangeName,
    toExchange: ExchangeName,
    asset: string,
    amount: number,
  ): Promise<boolean>;
}
