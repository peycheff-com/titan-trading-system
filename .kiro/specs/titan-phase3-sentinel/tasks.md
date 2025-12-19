# Implementation Plan: Titan Phase 3 - The Sentinel

## Overview

This implementation plan breaks down the Sentinel system into discrete, manageable tasks that build incrementally. Each task focuses on implementing specific functionality with corresponding tests. The plan follows a bottom-up approach, starting with core statistical and execution primitives, then building up to the complete portfolio management system.

## Task List

- [ ] 1. Set up project structure and core types
  - Create TypeScript project structure for Sentinel service
  - Define core TypeScript interfaces and types from design document
  - Set up testing framework (Jest) with fast-check for property-based testing
  - Configure build and development scripts
  - _Requirements: All_

- [ ] 2. Implement Statistical Engine core
  - _Requirements: 1.1, 7.1, 7.2, 7.3, 7.5, 7.6_

- [ ] 2.1 Implement CircularBuffer class
  - Create generic CircularBuffer<T> with add, getAll, isFull, clear methods
  - Ensure O(1) add operation for performance
  - _Requirements: 7.1, 7.2_

- [ ] 2.2 Implement RollingStatistics class
  - Create RollingStatistics with CircularBuffer backend
  - Implement getMean, getStdDev, getZScore, getPercentile methods
  - Use Welford's online algorithm for numerical stability
  - _Requirements: 1.1, 7.3_

- [ ]* 2.3 Write property test for Z-Score calculation
  - **Property 15: Z-Score Calculation Correctness**
  - **Validates: Requirements 7.3**

- [ ] 2.4 Implement BasisCalculator class
  - Create calculateBasis method for simple spot/perp basis
  - Implement calculateDepthWeightedBasis using order book depth
  - Implement calculateImpactCost for execution cost estimation
  - _Requirements: 1.8, 7.4_

- [ ]* 2.5 Write property test for depth-weighted basis
  - **Property 3: Depth-Weighted Basis Calculation**
  - **Validates: Requirements 1.8, 7.4**

- [ ] 2.6 Implement SignalGenerator class
  - Create signal generation logic with Z-Score thresholds
  - Implement shouldExpand and shouldContract methods
  - Maintain separate statistics per trading pair
  - _Requirements: 1.2, 1.4_

- [ ]* 2.7 Write property test for basis classification
  - **Property 1: Basis Classification Consistency**
  - **Validates: Requirements 1.2, 1.4**

- [ ]* 2.8 Write property test for statistical model isolation
  - **Property 16: Statistical Model Isolation**
  - **Validates: Requirements 7.5**

- [ ] 3. Implement Execution Engine primitives
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.5_

- [ ] 3.1 Implement TwapExecutor class
  - Create order slicing logic for clips <= $500
  - Implement randomized interval generation (30-90 seconds)
  - Add slippage checking and abort logic
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ]* 3.2 Write property test for TWAP order slicing
  - **Property 9: TWAP Order Slicing**
  - **Validates: Requirements 5.1, 5.2, 5.3**

- [ ]* 3.3 Write property test for TWAP slippage protection
  - **Property 10: TWAP Slippage Protection**
  - **Validates: Requirements 5.4**

- [ ] 3.4 Implement AbortHandler class
  - Create abortSpotLeg and abortPerpLeg methods
  - Implement neutralizeDelta for emergency delta neutralization
  - Add transaction logging for all abort events
  - _Requirements: 6.2, 6.3_

- [ ]* 3.5 Write property test for partial fill abort logic
  - **Property 13: Partial Fill Abort Logic**
  - **Validates: Requirements 6.2, 6.3**

- [ ] 3.6 Implement AtomicExecutor class
  - Create executeAtomic method for simultaneous spot/perp execution
  - Implement executeBothLegs with timing guarantees (< 100ms)
  - Add handlePartialFill logic to maintain balance
  - Integrate TwapExecutor for large orders
  - Integrate AbortHandler for failure scenarios
  - _Requirements: 6.1, 6.5, 5.5_

- [ ]* 3.7 Write property test for atomic execution simultaneity
  - **Property 12: Atomic Execution Simultaneity**
  - **Validates: Requirements 6.1**

- [ ]* 3.8 Write property test for partial fill balance
  - **Property 14: Partial Fill Balance Maintenance**
  - **Validates: Requirements 6.5**

- [ ]* 3.9 Write property test for atomic TWAP delta neutrality
  - **Property 11: Atomic Execution Delta Neutrality**
  - **Validates: Requirements 5.5**

- [ ] 4. Implement Exchange Gateway abstraction
  - _Requirements: 3.1, 3.2, 3.7_

- [ ] 4.1 Define ExchangeGateway interface
  - Create interface with spot/perp client methods
  - Define methods for price fetching, order placement, balance queries
  - Add transfer methods for unified account management
  - _Requirements: 3.7_

- [ ] 4.2 Implement BinanceGateway
  - Implement ExchangeGateway for Binance Spot and Futures
  - Add connection management and health checking
  - Implement order book fetching with caching
  - _Requirements: 3.1_

- [ ] 4.3 Implement BybitGateway
  - Implement ExchangeGateway for Bybit Spot and Perpetuals
  - Add connection management and health checking
  - Implement order book fetching with caching
  - _Requirements: 3.2_

- [ ]* 4.4 Write unit tests for exchange gateways
  - Test connection management and reconnection logic
  - Test order placement and result parsing
  - Test balance queries and transfer operations
  - _Requirements: 3.1, 3.2_

- [ ] 5. Implement Cross-Exchange Router
  - _Requirements: 3.3, 3.4, 3.5, 3.6_

- [ ] 5.1 Implement PriceMonitor class
  - Create real-time price tracking for all exchanges
  - Implement getBestSpotPrice and getBestPerpPrice methods
  - Add price update loop with WebSocket integration
  - _Requirements: 3.3, 3.4_

- [ ] 5.2 Implement CostCalculator class
  - Create calculateTransferCost for cross-exchange transfers
  - Implement calculateWithdrawalFee for each exchange
  - Add calculateTotalCost for complete route analysis
  - _Requirements: 3.5_

- [ ] 5.3 Implement ExchangeRouter class
  - Create routeSpotOrder and routePerpOrder methods
  - Implement findBestSpotExchange and findBestPerpExchange
  - Add cost-benefit analysis for routing decisions
  - _Requirements: 3.3, 3.4, 3.5, 3.6_

- [ ]* 5.4 Write property test for optimal exchange routing
  - **Property 6: Optimal Exchange Routing**
  - **Validates: Requirements 3.3, 3.4**

- [ ]* 5.5 Write property test for cost-benefit routing
  - **Property 7: Cost-Benefit Routing Decision**
  - **Validates: Requirements 3.5, 3.6**

- [ ] 6. Implement Vacuum Arbitrage Engine
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 6.1 Integrate Phase 1 liquidation detection
  - Import LiquidationDetector from Phase 1
  - Set up liquidation event stream subscription
  - Add liquidation volume tracking
  - _Requirements: 2.7_

- [ ] 6.2 Implement VacuumMonitor class
  - Create detectNegativeBasis method for opportunity detection
  - Implement executeVacuum using AtomicExecutor
  - Add monitorConvergence for position tracking
  - _Requirements: 2.2, 2.3, 2.4_

- [ ] 6.3 Implement VacuumPositionTracker class
  - Create position tracking with entry basis and target basis
  - Implement shouldClose logic for convergence detection
  - Add position update methods
  - _Requirements: 2.5, 2.6_

- [ ]* 6.4 Write property test for vacuum trigger logic
  - **Property 4: Vacuum Arbitrage Trigger Logic**
  - **Validates: Requirements 2.2, 2.3**

- [ ]* 6.5 Write property test for vacuum position lifecycle
  - **Property 5: Vacuum Position Lifecycle**
  - **Validates: Requirements 2.5, 2.6**

- [ ] 7. Implement Portfolio Manager core
  - _Requirements: 1.6, 1.7, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 7.1 Implement Position tracking
  - Create Position data structure with spot/perp sizes
  - Implement position update methods
  - Add unrealized P&L calculation
  - Track position types (CORE, SATELLITE, VACUUM)
  - _Requirements: 1.6, 1.7_

- [ ]* 7.2 Write property test for capital allocation
  - **Property 2: Capital Allocation Invariant**
  - **Validates: Requirements 1.6, 1.7**

- [ ] 7.3 Implement TransferManager class
  - Create transferSpotToFutures and transferFuturesToSpot methods
  - Implement withdrawToExchange for cross-exchange transfers
  - Add transfer confirmation and error handling
  - _Requirements: 4.3, 4.5, 4.7_

- [ ] 7.4 Implement Rebalancer class
  - Create checkMarginUtilization method
  - Implement executeTier1Rebalance (spot to futures transfer)
  - Implement executeTier2Rebalance (sell spot, transfer USDT)
  - Implement compoundProfits (futures to spot, buy more)
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ]* 7.5 Write property test for rebalancing triggers
  - **Property 8: Rebalancing Trigger Hierarchy**
  - **Validates: Requirements 4.2, 4.4, 4.6**

- [ ] 7.5 Implement PortfolioManager class
  - Create checkHealth method for portfolio status
  - Implement calculateNAV for total portfolio value
  - Implement getDelta for directional exposure calculation
  - Integrate Rebalancer for automated rebalancing
  - _Requirements: 4.2, 4.6, 8.7_

- [ ] 8. Implement Risk Management system
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_

- [ ] 8.1 Implement RiskManager class
  - Create checkRiskLimits method with configurable thresholds
  - Implement enforcePositionLimits for size and leverage
  - Add handleDrawdown with escalating responses
  - Implement emergencyFlatten for critical situations
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_

- [ ]* 8.2 Write property test for delta warning thresholds
  - **Property 17: Delta Warning Thresholds**
  - **Validates: Requirements 8.2, 8.3**

- [ ]* 8.3 Write property test for drawdown response
  - **Property 18: Drawdown Response Escalation**
  - **Validates: Requirements 8.5, 8.6**

- [ ] 8.4 Integrate RiskManager with PortfolioManager
  - Add risk checks before position entry
  - Implement automatic risk limit enforcement
  - Add alert generation for risk violations
  - _Requirements: 8.2, 8.3, 8.4_

- [ ] 9. Implement Performance Tracking system
  - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [ ] 9.1 Implement PerformanceTracker class
  - Create trade recording with all required fields
  - Implement calculateFundingYield method
  - Implement calculateBasisScalpingPnL method
  - Implement calculateTotalYield method
  - Add daily P&L tracking
  - _Requirements: 9.2, 9.3, 9.4, 9.5_

- [ ]* 9.2 Write property test for performance metric separation
  - **Property 19: Performance Metric Separation**
  - **Validates: Requirements 9.3, 9.4**

- [ ]* 9.3 Write property test for trade record completeness
  - **Property 20: Trade Record Completeness**
  - **Validates: Requirements 9.5**

- [ ] 9.4 Implement performance metric calculations
  - Implement Sharpe ratio calculation
  - Implement maximum drawdown calculation
  - Implement win rate calculation
  - Add other standard performance metrics
  - _Requirements: 9.6_

- [ ]* 9.5 Write property test for metric calculations
  - **Property 21: Performance Metric Calculation**
  - **Validates: Requirements 9.6**

- [ ] 9.6 Implement report export functionality
  - Create CSV export with all trade data
  - Create JSON export with all trade data
  - Add validation for export format correctness
  - _Requirements: 9.7_

- [ ]* 9.7 Write property test for export format validity
  - **Property 22: Export Format Validity**
  - **Validates: Requirements 9.7**

- [ ] 10. Implement Dashboard interface
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_

- [ ] 10.1 Set up Ink React terminal UI framework
  - Install Ink and React dependencies
  - Create basic dashboard component structure
  - Set up real-time update loop
  - _Requirements: 10.1_

- [ ] 10.2 Implement NAV and Delta display
  - Create header component showing NAV and delta
  - Add color coding for delta status
  - Implement real-time updates
  - _Requirements: 10.1, 10.6_

- [ ] 10.3 Implement Basis Monitor table
  - Create table component with all required columns
  - Add symbol, spot price, perp price, basis, Z-Score, action
  - Implement color coding for Z-Score status
  - Add real-time price updates
  - _Requirements: 10.2, 10.6_

- [ ] 10.4 Implement Yield Performance panel
  - Create panel showing deployed capital and deployment percentage
  - Add average funding APY display
  - Show basis scalping P&L (24h)
  - Display total 24h yield
  - _Requirements: 10.3_

- [ ] 10.5 Implement Inventory Health panel
  - Create panel showing futures margin ratio
  - Display rebalance trigger threshold
  - Show recent rebalancing activity log
  - Add color coding for health status
  - _Requirements: 10.4, 10.6_

- [ ] 10.6 Implement drill-down functionality
  - Add keyboard navigation for position selection
  - Create detailed position view component
  - Implement transaction history view
  - Add back navigation to main dashboard
  - _Requirements: 10.7_

- [ ]* 10.7 Write unit tests for dashboard components
  - Test component rendering with mock data
  - Test color coding logic
  - Test keyboard navigation
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_

- [ ] 11. Implement main Sentinel orchestrator
  - _Requirements: All_

- [ ] 11.1 Create SentinelCore class
  - Integrate all major components (StatEngine, AtomicExecutor, VacuumEngine, etc.)
  - Implement main event loop
  - Add component initialization and shutdown
  - Create configuration loading from environment
  - _Requirements: All_

- [ ] 11.2 Implement signal processing pipeline
  - Connect SignalGenerator to AtomicExecutor
  - Add signal validation and filtering
  - Implement position entry logic for EXPAND signals
  - Implement position exit logic for CONTRACT signals
  - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [ ] 11.3 Implement vacuum arbitrage integration
  - Connect VacuumMonitor to main event loop
  - Add vacuum opportunity detection to signal pipeline
  - Integrate vacuum position tracking with PortfolioManager
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 11.4 Implement cross-exchange routing integration
  - Connect ExchangeRouter to AtomicExecutor
  - Add routing decision logic before execution
  - Implement fallback to single-exchange when routing rejected
  - _Requirements: 3.3, 3.4, 3.5, 3.6_

- [ ] 11.5 Implement automated rebalancing loop
  - Add periodic margin utilization checks
  - Trigger rebalancing based on thresholds
  - Log all rebalancing actions
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 11.6 Implement risk monitoring loop
  - Add continuous risk limit checking
  - Trigger alerts and actions based on violations
  - Implement emergency flatten capability
  - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_

- [ ] 11.7 Connect Dashboard to SentinelCore
  - Pass PortfolioManager and SignalGenerator to Dashboard
  - Implement real-time data updates
  - Add error handling for dashboard failures
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ]* 11.8 Write integration tests for main orchestrator
  - Test signal processing pipeline end-to-end
  - Test vacuum arbitrage workflow
  - Test rebalancing workflow
  - Test risk limit enforcement
  - _Requirements: All_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Create production deployment configuration
  - _Requirements: All_

- [ ] 13.1 Create environment configuration template
  - Define all required environment variables
  - Add exchange API key configuration
  - Add risk parameter configuration
  - Document all configuration options
  - _Requirements: 8.1_

- [ ] 13.2 Create Docker configuration
  - Write Dockerfile for Sentinel service
  - Create docker-compose.yml for multi-exchange setup
  - Add health check endpoints
  - _Requirements: All_

- [ ] 13.3 Create deployment documentation
  - Write README with setup instructions
  - Document API key requirements and permissions
  - Add troubleshooting guide
  - Create operational runbook
  - _Requirements: All_

- [ ] 14. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
