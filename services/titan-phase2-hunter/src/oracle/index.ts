/**
 * Oracle Module - Prediction Market Integration
 *
 * Layer 1 of the 2026 Modernization: Provides forward-looking institutional
 * sentiment analysis through prediction market probabilities.
 *
 * Components:
 * - PolymarketClient: REST API client for Polymarket
 * - EventMapper: Maps trading symbols to prediction events
 * - SentimentCalculator: Calculates Oracle sentiment scores
 * - Oracle: Main orchestrator with veto logic and conviction multipliers
 */

export {
  PolymarketClient,
  type PolymarketClientConfig,
  type PolymarketMarket,
  type PolymarketResponse,
} from './PolymarketClient';

export {
  EventMapper,
  type SymbolEventMapping,
  type EventRelevance,
  type SymbolMappingResult,
} from './EventMapper';

export {
  SentimentCalculator,
  type SentimentResult,
  type SentimentCalculatorConfig,
  type EventContribution,
} from './SentimentCalculator';

export {
  Oracle,
  type OracleConfig,
  type VetoResult,
  type ConvictionResult,
  type OracleState,
} from './Oracle';
