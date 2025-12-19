# Requirements Document

## Introduction

**Titan Phase 4 - The AI Quant** is a closed-loop optimization engine designed to maximize the R:R (Risk:Reward) of the Phase 1 & 2 strategies. Unlike standard "AI Trading" which attempts to predict price, the Titan Quant predicts **Parameter Efficiency**. It answers one question: *"Given the last 24 hours of market microstructure, what configuration settings would have yielded the highest PnL?"* It operates as an offline advisor, ensuring zero latency impact on the live execution core.

The AI acts as a quantitative researcher that reviews trade logs, simulates parameter adjustments, and proposes safe configuration updates. Critically, the AI **never** modifies source code - it only optimizes configuration parameters within strict safety bounds.

## Glossary

- **TitanAnalyst**: The AI-powered analysis engine that processes trade data and generates insights
- **Journal**: The trade log parser that converts raw execution data into AI-readable narratives
- **Strategic Memory**: SQLite-based storage for learned insights and optimization history
- **Guardrails**: Safety system that enforces parameter bounds and prevents dangerous configurations
- **Backtester**: Simulation engine that validates proposed parameter changes against historical data
- **Optimization Proposal**: A suggested configuration change with validation metrics and risk assessment
- **Config Schema**: The structure of `config.json` containing all tunable trading parameters
- **Parameter Bounds**: Hard limits on configuration values to prevent excessive risk
- **Playback Engine**: Component that replays historical market data with different configurations
- **Morning Briefing**: Daily summary of AI analysis and optimization recommendations
- **Regime Snapshot**: Market state vector (trend, volatility, liquidity) captured at trade execution time
- **Bulgaria Tax**: Combined latency and slippage penalty from geographic distance to exchange servers
- **Zod Schema**: TypeScript-first schema validation library for runtime type checking
- **Config Version Tag**: Unique identifier linking configuration changes to performance outcomes

## Requirements

### Requirement 1

**User Story:** As a trader, I want the AI to analyze my failed trades, so that I can understand patterns in my losses and improve my strategy.

#### Acceptance Criteria

1. WHEN the AI analyzes trade logs THEN the system SHALL parse trades from `trades.jsonl` efficiently using streaming
2. WHEN converting trades to narratives THEN the system SHALL create token-efficient summaries containing symbol, trap type, result, duration, and slippage
3. WHEN identifying failure patterns THEN the system SHALL detect correlations in losses such as time-of-day patterns or symbol-specific issues
4. WHEN storing insights THEN the system SHALL persist findings to SQLite with timestamp, topic, insight text, and confidence score
5. WHEN retrieving context THEN the system SHALL fetch the most recent 10 insights to inform future analysis
6. WHEN ingesting trades THEN the system SHALL correlate each trade with the regime snapshot from that timestamp including volatility state, trend bias, and liquidity state to contextually normalize performance

### Requirement 2

**User Story:** As a trader, I want the AI to propose configuration optimizations based on trade analysis, so that my system can adapt to changing market conditions.

#### Acceptance Criteria

1. WHEN generating optimization proposals THEN the system SHALL map insights to specific `config.json` parameter keys
2. WHEN proposing parameter changes THEN the system SHALL include current value, suggested value, and reasoning
3. WHEN validating proposals THEN the system SHALL enforce parameter bounds for leverage, stop loss, and risk per trade
4. WHEN a proposal exceeds safety bounds THEN the system SHALL reject the proposal automatically
5. WHERE parameter bounds are defined THEN the system SHALL enforce maximum leverage of 20, maximum stop loss of 0.05, and maximum risk per trade of 0.05
6. WHEN parsing the AI JSON output THEN the system SHALL validate the keys against a strict Zod schema or TypeScript interface of `config.json` to prevent structure mismatches

### Requirement 3

**User Story:** As a trader, I want proposed optimizations to be validated through backtesting, so that I only apply changes that improve performance.

#### Acceptance Criteria

1. WHEN validating a proposal THEN the system SHALL replay historical data with both old and new configurations
2. WHEN comparing configurations THEN the system SHALL calculate simulated PnL and drawdown for each
3. IF new PnL is less than or equal to old PnL THEN the system SHALL reject the proposal
4. IF new drawdown exceeds old drawdown by more than 10 percent THEN the system SHALL reject the proposal
5. WHEN validation completes THEN the system SHALL generate an optimization report with confidence scores
6. WHEN simulating execution THEN the system SHALL apply a configurable latency penalty with default 200ms and slippage model based on historical volatility to ensure results are realistic for the user location

### Requirement 4

**User Story:** As a trader, I want to review and approve AI optimization proposals before they are applied, so that I maintain control over my trading system.

#### Acceptance Criteria

1. WHEN a proposal is generated THEN the system SHALL display it in the console UI with a diff view
2. WHEN displaying proposals THEN the system SHALL show old versus new values, projected PnL improvement, and risk impact
3. WHEN the user presses Enter THEN the system SHALL apply the proposal by writing to `config.json` and triggering hot reload
4. WHEN the user presses Escape THEN the system SHALL reject the proposal and log the rejection to prevent re-asking
5. WHEN proposals are pending THEN the system SHALL display them in an AI Advisor panel accessible via toggle key
6. WHEN a proposal is applied THEN the system SHALL tag the specific config version in the strategic memory to track the long-term performance delta of that specific change

### Requirement 5

**User Story:** As a trader, I want to interact with the AI through a chat interface, so that I can request analysis and optimizations on demand.

#### Acceptance Criteria

1. WHEN the user opens the chat interface THEN the system SHALL display a modal accepting text commands
2. WHEN the user types `/analyze` THEN the system SHALL run analysis on the last 24 hours of trades
3. WHEN the user types `/optimize [symbol]` THEN the system SHALL run parameter tuning for the specified symbol
4. WHEN the AI responds THEN the system SHALL display streaming text from the Gemini API
5. WHEN rate limiting is active THEN the system SHALL enforce a maximum of 10 requests per minute

### Requirement 6

**User Story:** As a trader, I want the AI to run nightly optimization jobs automatically, so that my system continuously improves without manual intervention.

#### Acceptance Criteria

1. WHEN the nightly job runs THEN the system SHALL execute at 00:00 UTC or during low volume periods
2. WHEN processing overnight THEN the system SHALL analyze the last 24 hours of trade logs
3. WHEN the job completes THEN the system SHALL generate a morning briefing with key findings
4. WHEN the console starts THEN the system SHALL display the morning briefing if available
5. WHEN insights are generated THEN the system SHALL store them in strategic memory for future context

### Requirement 7

**User Story:** As a system administrator, I want the AI integration to use cost-effective API services, so that operational costs remain low.

#### Acceptance Criteria

1. WHEN initializing the AI client THEN the system SHALL use Gemini 1.5 Flash for cost-effectiveness
2. WHEN making API requests THEN the system SHALL implement rate limiting to stay within free tier limits
3. WHEN storing data THEN the system SHALL use SQLite instead of expensive vector databases
4. WHEN parsing logs THEN the system SHALL use streaming to minimize memory usage
5. WHEN generating prompts THEN the system SHALL create token-efficient narratives to reduce API costs

### Requirement 8

**User Story:** As a developer, I want the AI system to be thoroughly tested, so that I can trust its optimization recommendations.

#### Acceptance Criteria

1. WHEN testing the Journal THEN the system SHALL verify correct parsing of trade log formats
2. WHEN testing Guardrails THEN the system SHALL verify that bound enforcement prevents dangerous configurations
3. WHEN testing the Backtester THEN the system SHALL verify that simulated results match live execution patterns
4. WHEN testing proposal validation THEN the system SHALL verify that invalid proposals are always rejected
5. WHEN testing end-to-end THEN the system SHALL verify that the full optimization loop produces valid configuration updates

### Requirement 9

**User Story:** As a trader, I want clear documentation of the AI system, so that I understand how it works and how to use it effectively.

#### Acceptance Criteria

1. WHEN reading documentation THEN the system SHALL provide an AI Quant section in the README
2. WHEN learning about prompts THEN the system SHALL document the prompt engineering strategy
3. WHEN interpreting results THEN the system SHALL explain how to read optimization reports
4. WHEN troubleshooting THEN the system SHALL document common issues and their solutions
5. WHEN configuring THEN the system SHALL document all parameter bounds and their rationale
