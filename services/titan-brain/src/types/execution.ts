import { IntentSignal, Position } from "./risk.js";

/**
 * Configuration for Execution Engine Client
 */
export interface ExecutionEngineConfig {
  /** Base URL of the Execution Engine (Deprecated using NATS) */
  baseUrl?: string;
  /** HMAC secret for request signing (Deprecated using NATS) */
  hmacSecret?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Fill confirmation from Execution Engine
 */
export interface FillConfirmation {
  signalId: string;
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  fillPrice: number;
  fillSize: number;
  requestedSize: number;
  timestamp: number;
  fees?: number;
  slippage?: number;
}

/**
 * Position returned by Execution Engine
 */
export interface ExecutionPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number; // USD Notional
  entryPrice: number;
  unrealizedPnL: number;
  leverage: number;
  timestamp: number;
}

/**
 * Balance data from Execution Engine
 */
export interface ExchangeBalance {
  currency: string;
  total: number;
  available: number;
  locked: number;
}

/**
 * Interface for Execution Engine Client
 */
export interface ExecutionEngineClient {
  forwardSignal(signal: IntentSignal, authorizedSize: number): Promise<void>;
  publishRiskPolicy(policy: any): Promise<void>;
  closeAllPositions(): Promise<void>;
  haltSystem(reason: string): Promise<void>;
  getPositions(): Promise<Position[]>;
  onFillConfirmation(callback: (fill: FillConfirmation) => void): void;
  fetchExchangePositions(exchange: string): Promise<ExecutionPosition[]>;
  fetchExchangeBalances(exchange: string): Promise<ExchangeBalance[]>;
  isConnected(): boolean;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

export const _forceEmit = true;
