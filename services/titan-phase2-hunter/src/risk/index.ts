/**
 * Risk Management Module Exports
 * 
 * Exports all risk management components for Titan Phase 2 Hunter
 */

export { PositionManager } from './PositionManager';
export type { PositionManagerConfig, PositionManagerEvents } from './PositionManager';
export { CorrelationManager } from './CorrelationManager';
export type { 
  CorrelationManagerConfig, 
  CorrelationManagerEvents,
  CorrelationData,
  CorrelationMatrix,
  CorrelationResult,
  HighBetaState
} from './CorrelationManager';
export { DrawdownProtector } from './DrawdownProtector';
export type { 
  DrawdownProtectorConfig, 
  DrawdownProtectorEvents,
  TradeRecord,
  DrawdownState
} from './DrawdownProtector';
export { PortfolioManager } from './PortfolioManager';
export type {
  PortfolioManagerConfig,
  PortfolioManagerEvents,
  PortfolioState,
  RankedSignal,
  RiskAllocation
} from './PortfolioManager';

// Enhanced Risk Management (2026 Modernization)
export { EnhancedRiskManager, DEFAULT_ENHANCED_RISK_CONFIG } from './EnhancedRiskManager';
export type {
  EnhancedRiskManagerConfig,
  EnhancedRiskManagerEvents,
  RiskConditionType,
  RiskCondition,
  RiskAdjustments,
  ExchangeStatus,
  EnhancedRiskState
} from './EnhancedRiskManager';