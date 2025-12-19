# Implementation Plan

- [x] 1. Set up AI infrastructure and dependencies
  - Install `@google/generative-ai`, `zod`, `better-sqlite3`, `node-schedule` packages
  - Create directory structure: `src/ai/`, `src/ai/prompts/`, `src/simulation/`, `src/cron/`
  - Initialize Gemini 1.5 Flash client with API key from environment
  - Create rate limiter utility (max 10 req/min)
  - _Requirements: 7.1, 7.2_

- [x] 2. Implement Journal (Log Parser)
  - Create `src/ai/Journal.ts` class
  - Implement `ingestTrades()` using Node.js `readline` for streaming
  - Implement `getRegimeContext()` to correlate trades with regime snapshots
  - Implement `summarizeTrade()` to generate token-efficient narratives
  - Implement `getFailedTrades()` to filter loss-making trades
  - _Requirements: 1.1, 1.2, 1.6_

- [x]* 2.1 Write property test for trade log parsing
  - **Property 1: Trade Log Parsing Completeness**
  - **Validates: Requirements 1.1**

- [x]* 2.2 Write property test for narrative generation
  - **Property 2: Narrative Field Inclusion**
  - **Validates: Requirements 1.2**

- [x]* 2.3 Write property test for trade-regime correlation
  - **Property 5: Trade-Regime Correlation**
  - **Validates: Requirements 1.6**

- [x]* 2.4 Write property test for token efficiency
  - **Property 16: Token-Efficient Narratives**
  - **Validates: Requirements 7.5**

- [x]* 2.5 Write property test for streaming memory efficiency
  - **Property 15: Streaming Memory Efficiency**
  - **Validates: Requirements 7.4**

- [x] 3. Implement Strategic Memory (SQLite)
  - Create `src/ai/StrategicMemory.ts` class
  - Define SQLite schema with tables: `strategic_insights`, `config_versions`, `optimization_proposals`, `performance_tracking`
  - Implement `storeInsight()` to persist insights
  - Implement `getRecentInsights()` to retrieve last N insights ordered by timestamp
  - Implement `storeProposal()` to save optimization proposals
  - Implement `tagConfigVersion()` to link config changes to proposals
  - Implement `trackPerformance()` to record metrics for config versions
  - Implement `getPerformanceDelta()` to compare version performance
  - _Requirements: 1.4, 1.5, 4.6_

- [x]* 3.1 Write property test for insight storage round trip
  - **Property 3: Insight Storage Round Trip**
  - **Validates: Requirements 1.4**

- [x]* 3.2 Write property test for recent insights ordering
  - **Property 4: Recent Insights Ordering**
  - **Validates: Requirements 1.5**

- [x]* 3.3 Write property test for config version tagging
  - **Property 11: Config Version Tagging**
  - **Validates: Requirements 4.6**

- [x] 4. Implement Config Schema with Zod
  - Create `src/config/ConfigSchema.ts`
  - Define Zod schemas for `TrapConfig`, `RiskConfig`, `ExecutionConfig`
  - Define complete `ConfigSchema` matching `config.json` structure
  - Export TypeScript types inferred from schemas
  - _Requirements: 2.6_

- [x] 5. Implement Guardrails (Safety Validation)
  - Create `src/ai/Guardrails.ts` class
  - Define `PARAMETER_BOUNDS` constant with limits for leverage, stop_loss, risk_per_trade
  - Implement `validateProposal()` to check bounds and schema compliance
  - Implement `checkBounds()` to verify values are within safe ranges
  - Implement `validateSchema()` using Zod to prevent hallucinated keys
  - _Requirements: 2.3, 2.4, 2.5, 2.6_

- [ ]* 5.1 Write property test for parameter bounds enforcement
  - **Property 7: Parameter Bounds Enforcement**
  - **Validates: Requirements 2.3, 2.4**

- [ ]* 5.2 Write property test for schema validation
  - **Property 8: Schema Validation Anti-Hallucination**
  - **Validates: Requirements 2.6**

- [x] 6. Implement TitanAnalyst (AI Engine)
  - Create `src/ai/TitanAnalyst.ts` class
  - Initialize Gemini 2.5 Flash client with rate limiting
  - Create prompt templates in `src/ai/prompts/analysis.txt` and `src/ai/prompts/optimization.txt`
  - Implement `analyzeFailures()` to identify loss patterns using AI
  - Implement `proposeOptimization()` to generate config change proposals
  - Implement `validateProposal()` to orchestrate backtesting validation
  - Add JSON parsing and error handling for AI responses
  - _Requirements: 1.3, 2.1, 2.2_

- [ ]* 6.1 Write property test for proposal structure
  - **Property 6: Proposal Structure Completeness**
  - **Validates: Requirements 2.2**

- [ ]* 6.2 Write property test for rate limiting
  - **Property 13: Rate Limiting Enforcement**
  - **Validates: Requirements 5.5, 7.2**

- [x] 7. Implement Latency Model (Bulgaria Tax)
  - Create `src/simulation/LatencyModel.ts` class
  - Implement `applyLatencyPenalty()` to adjust entry prices by configured latency (default 200ms)
  - Implement `calculateSlippage()` based on ATR and liquidity state
  - Implement `interpolatePrice()` to find price at delayed timestamp
  - _Requirements: 3.6_

- [ ]* 7.1 Write property test for latency penalty application
  - **Property 10: Latency Penalty Application**
  - **Validates: Requirements 3.6**

- [x] 8. Implement Backtester (Playback Engine)
  - Create `src/simulation/Backtester.ts` class
  - Implement `replay()` to simulate trades with config override
  - Implement `compareConfigs()` to run both baseline and proposed configs
  - Load historical OHLCV data from cache
  - Apply latency model to all simulated executions
  - Calculate metrics: PnL, drawdown, win rate, Sharpe ratio
  - Implement rejection rules: reject if new PnL <= old PnL or new drawdown > old drawdown * 1.1
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 8.1 Write property test for backtesting validation logic
  - **Property 9: Backtesting Validation Logic**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement AI Advisor Panel UI
  - Update `TrapMonitor.tsx` to add AI Advisor section
  - Create `AIAdvisor` component to display insights and proposals
  - Create `ProposalCard` component with diff view
  - Add keyboard binding: `A` to toggle AI Advisor panel
  - Display recent insights (top 3)
  - Display pending proposals with approval/rejection controls
  - _Requirements: 4.1, 4.2, 4.5_

- [x] 11. Implement Approval Workflow
  - Add keyboard bindings: `ENTER` to approve, `ESC` to reject
  - Implement `applyProposal()` to write to `config.json` and trigger hot reload
  - Implement `rejectProposal()` to log rejection in strategic memory
  - Tag applied config version with proposal ID
  - Handle concurrent approval attempts with locking
  - _Requirements: 4.3, 4.4, 4.6_

- [x] 12. Implement Chat Interface
  - Create `ChatInterface.tsx` component as modal
  - Add keyboard binding: `Cmd+K` to open/close chat
  - Implement command parser for `/analyze`, `/optimize [symbol]`, `/insights`, `/status`
  - Display streaming responses from Gemini API
  - Show message history with user/assistant roles
  - Handle command errors gracefully
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ]* 12.1 Write property test for command symbol extraction
  - **Property 12: Command Symbol Extraction**
  - **Validates: Requirements 5.3**

- [x] 13. Implement Nightly Optimization Job
  - Create `src/cron/NightlyOptimize.ts` class
  - Use `node-schedule` to schedule job at 00:00 UTC
  - Implement `runOptimization()` to execute full cycle: ingest → analyze → propose → validate
  - Implement `generateBriefing()` to create morning briefing with insights and proposals
  - Store briefing to file for display on startup
  - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [ ]* 13.1 Write property test for morning briefing structure
  - **Property 14: Morning Briefing Structure**
  - **Validates: Requirements 6.3**

- [x] 14. Implement Morning Briefing Display
  - Update `TrapMonitor.tsx` to load briefing on startup
  - Display briefing in dedicated section if available
  - Show date, summary, top insights, pending proposals
  - Add dismiss action to hide briefing
  - _Requirements: 6.4_

- [x] 15. Add Error Handling
  - Implement exponential backoff for Gemini API rate limits and errors
  - Add transaction safety for SQLite operations
  - Handle missing OHLCV data in backtester gracefully
  - Implement config rollback on hot reload failures
  - Add user-friendly error messages for chat interface
  - Log all errors to file for debugging
  - _Requirements: All error scenarios from design_

- [x] 16. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Create Documentation
  - Add "AI Quant" section to README with overview
  - Document prompt engineering strategy and templates
  - Explain how to read optimization reports
  - Document parameter bounds and their rationale
  - Add troubleshooting guide for common issues
  - Document chat interface commands
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
