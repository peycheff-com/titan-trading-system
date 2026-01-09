/**
 * Global Liquidity Module - Multi-Exchange CVD Aggregation
 * 
 * This module provides global liquidity analysis through multi-exchange
 * WebSocket connections, CVD aggregation, manipulation detection, and
 * consensus validation for the Titan Phase 2 - 2026 Modernization.
 * 
 * Components:
 * - ExchangeWebSocketClient: WebSocket clients for Binance, Coinbase, Kraken
 * - MultiExchangeManager: Manages connections to multiple exchanges
 * - GlobalCVDAggregator: Volume-weighted CVD aggregation engine
 * - ManipulationDetector: Cross-exchange manipulation detection
 * - ConsensusValidator: 2-out-of-3 exchange consensus validation
 * - GlobalLiquidityAggregator: Main integration component
 * 
 * Requirements: 4.1-4.7, 6.1-6.7 (Global Liquidity Aggregation)
 */

// WebSocket Clients
export {
  ExchangeWebSocketClient
} from './ExchangeWebSocketClient';
export type {
  ExchangeWebSocketConfig,
  ExchangeTrade,
  ConnectionHealth
} from './ExchangeWebSocketClient';

// Multi-Exchange Manager
export { MultiExchangeManager } from './MultiExchangeManager';
export type {
  MultiExchangeManagerConfig,
  ExchangeStatusSummary
} from './MultiExchangeManager';

// Global CVD Aggregator
export { GlobalCVDAggregator } from './GlobalCVDAggregator';
export type {
  GlobalCVDAggregatorConfig
} from './GlobalCVDAggregator';

// Manipulation Detector
export { ManipulationDetector } from './ManipulationDetector';
export type {
  ManipulationDetectorConfig,
  ComprehensiveManipulationAnalysis
} from './ManipulationDetector';

// Consensus Validator
export { ConsensusValidator } from './ConsensusValidator';
export type {
  ConsensusValidatorConfig,
  ConsensusValidationResult,
  SignalValidationRequest,
  SignalValidationResponse
} from './ConsensusValidator';

// Main Integration Component
export { GlobalLiquidityAggregator } from './GlobalLiquidityAggregator';
export type {
  GlobalLiquidityAggregatorConfig,
  GlobalCVDUpdateEvent,
  FallbackState
} from './GlobalLiquidityAggregator';
