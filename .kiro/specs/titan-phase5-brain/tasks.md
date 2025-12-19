# Implementation Plan: Titan Phase 5 - The Brain Orchestrator

- [x] 1. Set up project structure and core types
  - Create directory structure for Brain service
  - Define TypeScript interfaces for all components
  - Set up database schema and migrations
  - Configure TypeScript, ESLint, and Jest
  - Install dependencies (fastify, pg, redis, fast-check)
  - _Requirements: All_

- [x] 2. Implement AllocationEngine
  - [x] 2.1 Create AllocationEngine class with sigmoid transition logic
    - Implement `getWeights(equity)` with transition points
    - Implement `getEquityTier(equity)` for tier classification
    - Implement `getMaxLeverage(equity)` for leverage caps
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 3.4_

  - [x]* 2.2 Write property test for allocation vector sum
    - **Property 1: Allocation Vector Sum Invariant**
    - **Validates: Requirements 1.6**

  - [x]* 2.3 Write property test for equity tier transitions
    - **Property 12: Equity Tier Consistency**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

  - [x]* 2.4 Write unit tests for AllocationEngine
    - Test boundary conditions ($1,500, $5,000, $25,000)
    - Test sigmoid smoothness in transition zones
    - Test leverage cap lookup
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [-] 3. Implement PerformanceTracker
  - [x] 3.1 Create PerformanceTracker class with Sharpe ratio calculation
    - Implement `recordTrade(phaseId, pnl, timestamp)` with database persistence
    - Implement `getSharpeRatio(phaseId, windowDays)` with rolling window
    - Implement `getPerformanceModifier(phaseId)` with malus/bonus logic
    - Implement `getTradeCount(phaseId, windowDays)` for history check
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.8_

  - [ ]* 3.2 Write property test for performance modifier bounds
    - **Property 3: Performance Modifier Bounds**
    - **Validates: Requirements 2.3, 2.4**

  - [ ]* 3.3 Write unit tests for PerformanceTracker
    - Test Sharpe ratio calculation with known data
    - Test malus penalty application (Sharpe < 0)
    - Test bonus multiplier application (Sharpe > 2.0)
    - Test insufficient trade history handling
    - _Requirements: 2.2, 2.3, 2.4, 2.8_

- [-] 4. Implement RiskGuardian
  - [x] 4.1 Create RiskGuardian class with risk validation logic
    - Implement `checkSignal(signal, positions)` with multi-factor validation
    - Implement `calculatePortfolioDelta()` for net exposure
    - Implement `calculateCombinedLeverage()` for total leverage
    - Implement `calculateCorrelation(assetA, assetB)` using price history
    - Implement `getPortfolioBeta()` for BTC correlation
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7_

  - [ ]* 4.2 Write property test for leverage cap enforcement
    - **Property 2: Leverage Cap Enforcement**
    - **Validates: Requirements 3.4**

  - [ ]* 4.3 Write property test for correlation veto consistency
    - **Property 9: Correlation Veto Consistency**
    - **Validates: Requirements 3.7**

  - [ ]* 4.4 Write unit tests for RiskGuardian
    - Test leverage calculation with multiple positions
    - Test correlation calculation between assets
    - Test Phase 3 hedge auto-approval
    - Test high correlation size reduction
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7_

- [-] 5. Implement CapitalFlowManager
  - [x] 5.1 Create CapitalFlowManager class with sweep logic
    - Implement `checkSweepConditions()` with threshold detection
    - Implement `executeSweep(amount)` with exchange API integration
    - Implement `getHighWatermark()` and `updateHighWatermark(equity)`
    - Implement `getTreasuryStatus()` for wallet balances
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 5.2 Write property test for sweep monotonicity
    - **Property 4: Sweep Monotonicity**
    - **Validates: Requirements 4.4**

  - [ ]* 5.3 Write property test for reserve limit protection
    - **Property 5: Reserve Limit Protection**
    - **Validates: Requirements 4.5**

  - [ ]* 5.4 Write property test for high watermark monotonicity
    - **Property 10: High Watermark Monotonicity**
    - **Validates: Requirements 4.1**

  - [ ]* 5.5 Write unit tests for CapitalFlowManager
    - Test sweep condition detection (20% excess)
    - Test reserve limit enforcement ($200 floor)
    - Test high watermark updates
    - Test sweep retry logic on failure
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.8_

- [-] 6. Implement CircuitBreaker
  - [x] 6.1 Create CircuitBreaker class with threshold monitoring
    - Implement `checkConditions(equity, positions)` with multi-trigger logic
    - Implement `trigger(reason)` with position closure
    - Implement `reset(operatorId)` with authentication
    - Implement `isActive()` and `getStatus()` for state queries
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8_

  - [ ]* 6.2 Write property test for circuit breaker idempotence
    - **Property 6: Circuit Breaker Idempotence**
    - **Validates: Requirements 5.4, 5.5**

  - [ ]* 6.3 Write unit tests for CircuitBreaker
    - Test daily drawdown trigger (15%)
    - Test minimum equity trigger ($150)
    - Test consecutive loss trigger (3 in 1 hour)
    - Test soft pause cooldown
    - Test manual reset with operator logging
    - _Requirements: 5.1, 5.2, 5.3, 5.8_

- [-] 7. Implement TitanBrain orchestrator
  - [x] 7.1 Create TitanBrain class integrating all components
    - Implement `processSignal(signal)` with full pipeline
    - Implement `updateMetrics()` for periodic recalculation
    - Implement `getDashboardData()` for UI data aggregation
    - Implement `getHealthStatus()` for system health checks
    - Wire up all components (allocation, performance, risk, capital, breaker)
    - _Requirements: 1.1, 1.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 7.2 Write property test for signal processing latency
    - **Property 7: Signal Processing Latency**
    - **Validates: Requirements 7.5**

  - [ ]* 7.3 Write property test for position size consistency
    - **Property 8: Position Size Consistency**
    - **Validates: Requirements 1.7**

  - [ ]* 7.4 Write property test for phase priority ordering
    - **Property 11: Phase Priority Ordering**
    - **Validates: Requirements 7.1**

  - [ ]* 7.5 Write integration tests for TitanBrain
    - Test end-to-end signal processing
    - Test signal veto with logging
    - Test simultaneous multi-phase signals
    - Test metric update cycle
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 8. Implement database layer
  - [x] 8.1 Create database manager with connection pooling
    - Set up PostgreSQL connection with pg library
    - Implement connection pooling and error handling
    - Create migration runner for schema setup
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 8.2 Create repository classes for data access
    - AllocationRepository for allocation history
    - PerformanceRepository for phase performance
    - DecisionRepository for brain decisions
    - TreasuryRepository for sweep operations
    - BreakerRepository for circuit breaker events
    - RiskRepository for risk snapshots
    - _Requirements: 1.8, 2.7, 4.7, 5.7, 9.1, 9.2, 9.3, 9.6_

  - [ ]* 8.3 Write integration tests for database layer
    - Test allocation persistence and retrieval
    - Test performance metric persistence
    - Test decision logging
    - Test treasury operation logging
    - Test breaker event logging
    - _Requirements: 1.8, 9.1, 9.2, 9.3_

- [x] 9. Implement webhook server
  - [x] 9.1 Create Fastify server with signal endpoints
    - Set up Fastify with CORS and logging
    - Create POST /signal endpoint for phase signals
    - Create GET /status endpoint for health checks
    - Create GET /dashboard endpoint for UI data
    - Implement HMAC signature verification
    - _Requirements: 7.4, 7.5, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 9.2 Implement signal queue with Redis
    - Set up Redis connection for signal queue
    - Implement signal enqueue with priority
    - Implement signal dequeue with ordering
    - Implement idempotency check using signal IDs
    - _Requirements: 7.1, 7.4_

  - [ ]* 9.3 Write integration tests for webhook server
    - Test signal reception and queuing
    - Test HMAC verification
    - Test dashboard data endpoint
    - Test concurrent signal handling
    - _Requirements: 7.4, 7.5_

- [x] 10. Implement dashboard data aggregation
  - [x] 10.1 Create dashboard service for data collection
    - Implement NAV calculation from all wallets
    - Implement allocation vector formatting
    - Implement phase equity calculation
    - Implement risk metrics aggregation
    - Implement treasury status aggregation
    - Implement recent decisions retrieval
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 10.2 Implement JSON export functionality
    - Create export endpoint for dashboard data
    - Implement JSON serialization
    - Add timestamp and version metadata
    - _Requirements: 10.8_

  - [ ]* 10.3 Write unit tests for dashboard service
    - Test NAV calculation with multiple wallets
    - Test phase equity calculation
    - Test risk metrics aggregation
    - Test JSON export format
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

- [x] 11. Implement notification system
  - [x] 11.1 Create notification service for alerts
    - Set up notification channels (Telegram, email)
    - Implement circuit breaker notifications
    - Implement high correlation warnings
    - Implement sweep notifications
    - Implement veto notifications to phases
    - _Requirements: 5.6, 6.5, 7.6_

  - [ ]* 11.2 Write unit tests for notification service
    - Test notification formatting
    - Test channel selection
    - Test retry logic on failure
    - _Requirements: 5.6_

- [x] 12. Implement recovery and persistence
  - [x] 12.1 Create state recovery service
    - Implement allocation vector loading on startup
    - Implement performance metrics loading on startup
    - Implement high watermark loading on startup
    - Implement risk metric recalculation on startup
    - _Requirements: 9.4, 9.5_

  - [x] 12.2 Implement manual override functionality
    - Create admin endpoint for allocation override
    - Implement operator authentication
    - Implement override persistence
    - Implement warning banner flag
    - _Requirements: 9.7, 9.8_

  - [ ]* 12.3 Write integration tests for recovery
    - Test state loading after restart
    - Test metric recalculation after restart
    - Test manual override persistence
    - _Requirements: 9.4, 9.5, 9.7_

- [x] 13. Implement monitoring and observability
  - [x] 13.1 Create Prometheus metrics exporter
    - Implement signal processing latency metrics
    - Implement decision approval rate metrics
    - Implement database query time metrics
    - Implement cache hit rate metrics
    - _Requirements: 7.7_

  - [x] 13.2 Create structured logging
    - Implement JSON structured logging
    - Add correlation IDs to all logs
    - Implement log level configuration
    - Add sensitive data sanitization
    - _Requirements: 2.7, 4.7, 5.7, 9.6_

  - [ ]* 13.3 Write tests for monitoring
    - Test metric collection
    - Test log formatting
    - Test sensitive data sanitization
    - _Requirements: 2.7_

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Create configuration management
  - [x] 15.1 Implement configuration loader
    - Create configuration schema with validation
    - Implement environment variable loading
    - Implement configuration file loading
    - Add configuration validation on startup
    - _Requirements: All_

  - [x] 15.2 Create example configuration files
    - Create .env.example with all variables
    - Create config.example.json with all settings
    - Document all configuration options
    - _Requirements: All_

- [x] 16. Integration with existing Titan services
  - [x] 16.1 Connect to Execution Engine
    - Implement signal forwarding to Execution Engine
    - Implement fill confirmation reception
    - Implement position state synchronization
    - _Requirements: 1.7, 7.5_

  - [x] 16.2 Connect to Phase services
    - Set up webhooks from Phase 1 (Scavenger)
    - Set up webhooks from Phase 2 (Hunter)
    - Set up webhooks from Phase 3 (Sentinel)
    - Implement phase notification endpoints
    - _Requirements: 7.4, 7.6_

  - [ ]* 16.3 Write integration tests for service connections
    - Test signal flow from Phase to Brain to Execution
    - Test fill confirmation flow
    - Test veto notification flow
    - _Requirements: 7.4, 7.5, 7.6_

- [x] 17. Performance optimization
  - [x] 17.1 Implement caching layer
    - Cache allocation vectors (1 min TTL)
    - Cache correlation matrix (5 min TTL)
    - Cache performance metrics (1 min TTL)
    - Implement cache invalidation on updates
    - _Requirements: 1.1, 3.8_

  - [x] 17.2 Optimize database queries
    - Add indexes on timestamp columns
    - Implement query result caching
    - Add database connection pooling
    - Optimize Sharpe ratio calculation query
    - _Requirements: 2.2, 9.1_

  - [ ]* 17.3 Write performance tests
    - Test signal processing latency (< 100ms)
    - Test metric calculation overhead (< 50ms)
    - Test concurrent signal handling
    - Test database query performance
    - _Requirements: 7.5_

- [x] 18. Create deployment artifacts
  - [x] 18.1 Create Docker configuration
    - Write Dockerfile for Brain service
    - Write docker-compose.yml with dependencies
    - Configure PostgreSQL and Redis containers
    - Add health check endpoints
    - _Requirements: All_

  - [x] 18.2 Create deployment documentation
    - Write deployment guide
    - Document environment variables
    - Document database setup
    - Document monitoring setup
    - _Requirements: All_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Create README and documentation
  - [x] 20.1 Write comprehensive README
    - Document system architecture
    - Document API endpoints
    - Document configuration options
    - Add usage examples
    - _Requirements: All_

  - [x] 20.2 Create API documentation
    - Document signal format
    - Document webhook endpoints
    - Document dashboard data format
    - Add example requests/responses
    - _Requirements: 7.4, 10.8_
