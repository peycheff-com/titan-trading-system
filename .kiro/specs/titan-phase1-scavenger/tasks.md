# Implementation Tasks: Titan Phase 1 - Scavenger (Predestination Engine)

**Philosophy**: Build a trap system that exploits structural market imbalances (OI wipeouts, funding squeezes, basis arb) with 200ms Bulgaria latency. We don't compete on speed - we exploit physics.

## Phase 1: Foundation & Core Trap Engine

- [x] 1. Project Setup
  - Create directory structure at `titan/services/titan-phase1-scavenger/`
  - Initialize package.json with dependencies: ws, node-fetch, chalk, ink, react, crypto
  - Create .env.example with API key templates (Binance, Bybit, MEXC)
  - Create .gitignore
  - Create README.md with Predestination Engine philosophy
  - _Requirements: 1.1-1.7 (Three-Layer Trap Architecture)_

- [x] 2. TitanTrap Core Engine
  - Create `src/engine/TitanTrap.ts` with trap lifecycle management
  - Implement updateTrapMap() method (runs every 1 minute)
  - Implement onBinanceTick() method (real-time WebSocket handler)
  - Implement fire() method (execution on TRAP_SPRUNG event)
  - Add background equity cache loop (update every 5 seconds)
  - Add trap cooldown enforcement (5-minute minimum between activations)
  - Define Tripwire interface with all trap types
  - Create Map-based storage for trapMap and volumeCounters
  - _Requirements: 1.1-1.7, 7.1-7.7 (Trap Map Management), Robustness #1, #4_

- [x] 3. Configuration Manager
  - Create `src/config/ConfigManager.ts`
  - Implement loadConfig() with defaults for all trap parameters
  - Implement saveConfig() with immediate file write
  - Support hot-reload without restart
  - Add exchange configuration (Binance, Bybit, MEXC with executeOn flags)
  - _Requirements: 12.1-12.7 (Runtime Configuration)_

- [x] 4. Credential Manager (AES-256-GCM)
  - Create `src/config/CredentialManager.ts`
  - Implement saveCredentials() with AES-256-GCM encryption
  - Implement loadCredentials() with master password decryption
  - Support TITAN_MASTER_PASSWORD environment variable
  - Store encrypted credentials in ~/.titan-scanner/secrets.enc
  - _Requirements: Encrypted credential storage_

## Phase 2: Exchange Clients (Binance + Bybit + MEXC)

- [x] 5. Binance Spot Client (Signal Validator)
  - Create `src/exchanges/BinanceSpotClient.ts`
  - Implement subscribeAggTrades() WebSocket method
  - Implement getSpotPrice() REST method
  - Add reconnection logic (3 retries, 2s delay)
  - Add callback system for trade events
  - _Requirements: 3.1-3.7 (Detection Layer)_

- [x] 6. Bybit Perps Client (Execution Target)
  - Create `src/exchanges/BybitPerpsClient.ts`
  - Implement fetchTopSymbols() REST method (top 500 by volume)
  - Implement fetchOHLCV() REST method (1h and 4h bars)
  - Implement getCurrentPrice() REST method
  - Implement getOpenInterest() REST method
  - Implement getFundingRate() REST method
  - Implement get24hVolume() REST method
  - Implement getEquity() REST method
  - Implement placeOrder() with HMAC signature
  - Implement placeOrderWithTimeout() with 2-second timeout
  - Implement setLeverage() method
  - Implement setStopLoss() and setTakeProfit() methods
  - _Requirements: 4.1-4.7 (Execution Layer), 10.1-10.7 (Multi-Exchange), Robustness #5_

- [x] 7. MEXC Perps Client (Execution Target)
  - Create `src/exchanges/MEXCPerpsClient.ts`
  - Implement placeOrder() with MEXC-specific format (side: 1/2, type: 5/1)
  - Implement setLeverage() method
  - Implement HMAC signature for MEXC API
  - Add rate limiting (10 req/s with queuing)
  - _Requirements: 10.1-10.7 (Multi-Exchange)_

- [x] 8. Exchange Gateway (Multi-Exchange Orchestrator)
  - Create `src/exchanges/ExchangeGateway.ts`
  - Implement executeOnAllTargets() method
  - Execute on Bybit if config.exchanges.bybit.executeOn is true
  - Execute on MEXC if config.exchanges.mexc.executeOn is true
  - Use Promise.allSettled() for parallel execution
  - Log results for each exchange
  - _Requirements: 10.1-10.7 (Multi-Exchange)_


## Phase 3: Tripwire Calculators (Structural Levels)

- [x] 9. Liquidation Cluster Calculator
  - Create `src/calculators/TripwireCalculators.ts`
  - Implement calcLiquidationCluster() using volume profile
  - Implement buildVolumeProfile() with 50 bins
  - Find top 3 volume peaks (liquidation clusters)
  - Set trigger at cluster price ± 0.2%
  - Return Tripwire with trapType: 'LIQUIDATION', confidence: 95, leverage: 20
  - _Requirements: 2.1-2.7 (Pre-Computation Layer), 5.1-5.7 (Breakout Trap)_

- [x] 10. Daily Level Calculator
  - Implement calcDailyLevel() in TripwireCalculators
  - Calculate Previous Day High (PDH) and Previous Day Low (PDL)
  - Check if current price is within 2% of PDH or PDL
  - Set trigger at PDH + 0.1% for long or PDL - 0.1% for short
  - Return Tripwire with trapType: 'DAILY_LEVEL', confidence: 85, leverage: 12
  - _Requirements: 2.1-2.7, 5.1-5.7_

- [x] 11. Bollinger Breakout Calculator
  - Implement calcBollingerBreakout() in TripwireCalculators
  - Calculate 20-period SMA and standard deviation using Float64Array
  - Calculate Bollinger Bands (SMA ± 2 * stdDev)
  - Check if BB width is in bottom 10% of 72-hour history
  - Set trigger at upper band + 0.1% for long or lower band - 0.1% for short
  - Return Tripwire with trapType: 'BOLLINGER', confidence: 90, leverage: 15
  - _Requirements: 2.1-2.7, 5.1-5.7_

- [x] 12. Helper Math Functions
  - Implement calcSMA() using Float64Array
  - Implement calcStdDev() using Float64Array
  - Benchmark: < 1ms per calculation
  - _Requirements: 2.1-2.7_

## Phase 4: Structural Flaw Detectors (Bulgaria-Optimized)

- [x] 13. OI Wipeout Detector (V-Shape Catch)
  - Create `src/detectors/OIWipeoutDetector.ts`
  - Implement detectWipeout() method
  - Track Open Interest history (last 10 minutes)
  - Detect: Price drop > 3% AND OI drop > 20% in 5 minutes
  - Validate: CVD flips from red to green
  - Calculate 50% retracement target
  - Return Tripwire with trapType: 'OI_WIPEOUT', confidence: 95, leverage: 20
  - _Requirements: Structural Flaw Strategy 1_

- [x] 14. Funding Squeeze Detector
  - Create `src/detectors/FundingSqueezeDetector.ts`
  - Implement detectSqueeze() method
  - Check if funding rate < -0.02% (shorts crowded)
  - Detect higher lows on 5m chart (shorts trapped)
  - Validate: CVD is rising (whales absorbing)
  - Calculate liquidation target (recent high + 2%)
  - Return Tripwire with trapType: 'FUNDING_SQUEEZE', confidence: 90, leverage: 15
  - _Requirements: Structural Flaw Strategy 2_

- [x] 15. Basis Arb Detector (Rubber Band)
  - Create `src/detectors/BasisArbDetector.ts`
  - Implement detectBasisArb() method
  - Calculate basis: (Spot - Perp) / Spot
  - Detect: Basis > 0.5% (Perp is discounted)
  - Validate: 24h volume > $1M (not dead market)
  - Calculate target: Spot price * 0.999
  - Return Tripwire with trapType: 'BASIS_ARB', confidence: 85, leverage: 10
  - _Requirements: Structural Flaw Strategy 3_

- [x] 16. Ultimate Bulgaria Protocol
  - Create `src/detectors/UltimateBulgariaProtocol.ts`
  - Implement scan() method
  - Detect idiosyncratic crashes (> 3% drop AND BTC < 0.5% drop)
  - For each crash, check OI wipeout
  - Set Binance Leader-Follower trap at +1% recovery
  - Return Tripwire with trapType: 'ULTIMATE_BULGARIA', confidence: 98
  - _Requirements: Structural Flaw Strategy 4 (Combined), Robustness #3_

## Phase 5: Detection & Execution

- [x] 17. Volume Validator
  - Create `src/validators/VolumeValidator.ts`
  - Implement validateVolume() method
  - Track trade count in 100ms windows
  - Require minimum 50 trades for validation
  - Reset counter after validation
  - _Requirements: 3.4-3.5 (Volume Validation)_

- [x] 18. Velocity Calculator
  - Create `src/calculators/VelocityCalculator.ts`
  - Implement recordPrice() method with exchangeTime parameter (NOT Date.now())
  - Track last 10 seconds using exchange timestamps
  - Implement calcVelocity() method (% change per second over 5s)
  - Return absolute velocity value
  - _Requirements: 4.2-4.4 (Velocity-Based Order Type), Robustness #2_

- [x] 19. Position Size Calculator
  - Create `src/calculators/PositionSizeCalculator.ts`
  - Implement calcPositionSize() using Kelly Criterion
  - Apply 25% safety factor
  - Cap at max position size from config
  - _Requirements: 4.6 (Position Sizing)_

- [x] 20. CVD Calculator
  - Create `src/calculators/CVDCalculator.ts`
  - Implement calcCVD() method
  - Track buy volume - sell volume over time window
  - Support variable time windows (60s, 300s, 600s)
  - _Requirements: 13-16 (Structural Flaw Detectors)_


## Phase 6: Console UI (Trap Monitor)

- [x] 21. Main Dashboard Component
  - Create `src/console/TrapMonitor.tsx` (Ink + React)
  - Implement header with phase, equity, P&L
  - Implement keyboard shortcuts bar ([F1] CONFIG [SPACE] PAUSE [Q] QUIT)
  - Implement layout with 3 sections: Traps, Sensors, Feed
  - _Requirements: 8.1-8.7 (Trap Monitor Dashboard)_

- [x] 22. Trap Table Component
  - Create TrapTable component
  - Display columns: COIN, CURR PRICE, TRIGGER, TYPE, LEAD TIME
  - Color code by proximity (red < 0.5%, yellow < 2%)
  - Show trap types: BREAKOUT, LIQ_HUNT, BREAKDOWN, OI_WIPEOUT, FUNDING_SQUEEZE, BASIS_ARB, ULTIMATE
  - _Requirements: 8.2-8.5_

- [x] 23. Sensor Status Component
  - Create SensorStatus component
  - Display Binance stream health and tick rate
  - Display Bybit connection status and ping
  - Display estimated slippage percentage
  - _Requirements: 8.6_

- [x] 24. Live Feed Component
  - Create LiveFeed component
  - Display last 5 events with timestamps
  - Color code by event type (green: TRAP_SPRUNG, white: info)
  - Auto-scroll on new events
  - _Requirements: 8.7_

- [x] 25. Config Panel Component (F1 Key)
  - Create ConfigPanel component (modal overlay)
  - Add trap parameter sliders (compression threshold, CVD threshold, etc.)
  - Add exchange toggles (Bybit executeOn, MEXC executeOn)
  - Add risk settings (max leverage, stop loss %, target %)
  - Add save/cancel buttons
  - _Requirements: 12.1-12.7_

## Phase 7: Integration & Orchestration

- [x] 26. Main Application Loop
  - Create `src/index.ts` entry point
  - Initialize all components (TitanTrap, clients, detectors)
  - Start Pre-Computation Layer (1-minute interval)
  - Start Detection Layer (Binance WebSocket)
  - Start Execution Layer (Bybit/MEXC ready)
  - Render Trap Monitor dashboard
  - Handle keyboard input (F1, SPACE, Q)
  - _Requirements: 1.1-1.7_

- [x] 27. Event System
  - Create `src/events/EventEmitter.ts`
  - Implement TRAP_MAP_UPDATED event
  - Implement TRAP_SPRUNG event
  - Implement EXECUTION_COMPLETE event
  - Implement ERROR event
  - _Requirements: 7.5_

- [x] 28. Logger (JSONL)
  - Create `src/logging/Logger.ts`
  - Implement log() method (append to trades.jsonl)
  - Log signals with all trap details
  - Log executions with fill prices
  - Log errors with context
  - Rotate logs > 10MB
  - Compress logs > 30 days
  - _Requirements: 11.1-11.7 (Signal Execution Logging)_

## Phase 8: Testing & Validation

- [x] 29. Unit Tests - Tripwire Calculators
  - Test calcLiquidationCluster() with known volume profile
  - Test calcDailyLevel() with PDH/PDL scenarios
  - Test calcBollingerBreakout() with squeeze patterns
  - Test calcSMA() and calcStdDev() accuracy
  - _Requirements: 9-12_

- [x] 30. Unit Tests - Structural Flaw Detectors
  - Test OIWipeoutDetector with crash scenarios
  - Test FundingSqueezeDetector with negative funding
  - Test BasisArbDetector with Spot-Perp disconnects
  - Test UltimateBulgariaProtocol with combined conditions
  - _Requirements: 13-16_

- [x] 31. Integration Tests - Exchange Clients
  - Test Binance WebSocket subscription and reconnection
  - Test Bybit order placement with testnet
  - Test MEXC order placement with testnet
  - Test ExchangeGateway parallel execution
  - _Requirements: 5-8_

- [x] 32. Integration Tests - End-to-End
  - Test full cycle: Pre-Computation → Detection → Execution
  - Test with mock Binance ticks
  - Test with mock Bybit responses
  - Verify trap activation and execution
  - _Requirements: All requirements_

- [x] 33. Property-Based Test: Tripwire Activation Idempotency
  - **Property 1: Tripwire Activation Idempotency**
  - **Validates: Requirements 7.6**
  - For any tripwire, activating it multiple times should only execute once
  - Use fast-check to generate random tripwires
  - Verify activated flag prevents duplicate execution

- [x] 34. Property-Based Test: Volume Validation Consistency
  - **Property 2: Volume Validation Consistency**
  - **Validates: Requirements 3.4, 3.5**
  - For any symbol, if volume validation succeeds, it should consistently trigger execution
  - Use fast-check to generate random trade sequences
  - Verify 50+ trades in 100ms always triggers

- [x] 35. Property-Based Test: Order Type Selection Determinism
  - **Property 3: Order Type Selection Determinism**
  - **Validates: Requirements 4.2, 4.3, 4.4**
  - For any velocity value, the same velocity should always produce the same order type
  - Use fast-check to generate random velocity values
  - Verify: velocity > 0.5% → MARKET, 0.1-0.5% → AGGRESSIVE LIMIT, < 0.1% → LIMIT

## Phase 9: Documentation & Deployment

- [x] 36. README Documentation
  - Document Predestination Engine philosophy
  - Document installation steps (npm install, API keys)
  - Document structural flaw strategies (OI Wipeout, Funding Squeeze, Basis Arb)
  - Document trap types and confidence levels
  - Document keyboard shortcuts
  - Create troubleshooting guide
  - _Requirements: All requirements_