# Requirements Document: Titan Phase 5 - The Brain Orchestrator

## Introduction

The Titan Brain is a hierarchical state machine that governs capital allocation, global risk management, and strategy transition across all Titan phases. It sits above the Execution Service and transforms Titan from a set of disjointed trading strategies into a coherent quantitative fund.

While the Phases (Scavenger, Hunter, Sentinel) generate **Intent**, the Brain grants **Permission**. The Core Directive is to maximize **Geometric Growth** (compounding) while ensuring **Ruin Probability < 0.1%**.

## Glossary

- **NAV (Net Asset Value)**: Total equity across all wallets (Spot + Futures + Unrealized PnL)
- **Allocation Vector**: The percentage of NAV assigned to each Phase (e.g., `[0.2, 0.8, 0.0]`)
- **VaR (Value at Risk)**: The maximum estimated loss over a specific time horizon at a specific confidence interval
- **Kelly Fraction**: A formula used to determine optimal position size based on historical win rate/payoff
- **Watermark**: The highest recorded NAV, used to calculate drawdown
- **Circuit Breaker**: A hard stop triggering a "Cash Only" state
- **Sharpe Ratio**: Risk-adjusted return metric (Return / Volatility)
- **Portfolio Beta**: Correlation of portfolio to BTC (market proxy)
- **Combined Leverage**: Total notional exposure divided by equity
- **Malus Penalty**: Performance-based reduction in capital allocation
- **Bonus Multiplier**: Performance-based increase in capital allocation
- **Ratchet Mechanism**: One-way capital flow from risky to safe buckets
- **Sigmoid Function**: S-curve transition function for smooth phase transitions
- **Global Delta**: Net directional exposure across all positions

## Requirements

### Requirement 1: Dynamic Capital Allocation

**User Story:** As a trader, I want the system to transition smoothly from aggressive strategies at low equity to conservative strategies at high equity, so that I maximize growth while protecting capital.

#### Acceptance Criteria

1. THE System SHALL recalculate the Allocation Vector every 1 minute or on trade close
2. WHEN equity is below $1,500 THEN the System SHALL allocate 100% weight to Phase 1 (Scavenger)
3. WHEN equity is between $1,500 and $5,000 THEN the System SHALL transition from Phase 1 to Phase 2 using a sigmoid function
4. WHEN equity is between $5,000 and $25,000 THEN the System SHALL allocate 20% to Phase 1 and 80% to Phase 2
5. WHEN equity exceeds $25,000 THEN the System SHALL begin transitioning to Phase 3 (Sentinel)
6. THE System SHALL enforce that the sum of all phase weights equals 1.0 (100% capital)
7. WHEN a Phase generates a signal THEN the System SHALL cap position size at `Equity * Phase_Weight`
8. THE System SHALL persist the current Allocation Vector to the database

### Requirement 2: Performance-Based Throttling

**User Story:** As a risk manager, I want the system to reduce capital allocation to underperforming strategies and increase allocation to winning strategies, so that capital flows to the most effective approach.

#### Acceptance Criteria

1. THE System SHALL track PnL per Phase separately using source tags
2. THE System SHALL calculate a rolling 7-day Sharpe Ratio for each Phase
3. WHEN a Phase has Sharpe Ratio < 0 THEN the System SHALL apply a Malus Penalty of 0.5x to its base weight
4. WHEN a Phase has Sharpe Ratio > 2.0 THEN the System SHALL apply a Bonus Multiplier of 1.2x to its base weight
5. THE System SHALL cap the maximum adjusted weight at the Global Max Risk limit
6. THE System SHALL recalculate performance modifiers every 24 hours
7. THE System SHALL log all weight adjustments with reasoning to the audit trail
8. WHEN a Phase has insufficient trade history (< 10 trades) THEN the System SHALL use base weight without modification

### Requirement 3: Global Correlation Guard

**User Story:** As a risk manager, I want to prevent multiple phases from taking correlated positions that amplify portfolio risk, so that I avoid concentration risk.

#### Acceptance Criteria

1. THE System SHALL calculate Portfolio Beta (correlation to BTC) for all open positions
2. WHEN a new signal is received THEN the System SHALL calculate the Combined Leverage if the signal is executed
3. WHEN Combined Leverage exceeds the equity-tier maximum THEN the System SHALL VETO the signal
4. THE System SHALL define leverage caps as: $200 equity = 20x max, $5,000 equity = 5x max, $50,000 equity = 2x max
5. WHEN Phase 3 requests a hedge position that reduces Global Delta THEN the System SHALL auto-approve regardless of leverage
6. THE System SHALL calculate correlation between proposed position and existing positions
7. WHEN correlation > 0.8 and same direction THEN the System SHALL flag as high-risk and reduce position size by 50%
8. THE System SHALL maintain a correlation matrix updated every 5 minutes

### Requirement 4: Profit Sweeper

**User Story:** As a trader, I want to automatically secure profits by moving excess capital from the risky futures wallet to a safe spot wallet, so that I lock in gains and prevent giving back profits.

#### Acceptance Criteria

1. THE System SHALL track a High Watermark for the Futures Wallet balance
2. WHEN Futures Wallet balance exceeds Target Allocation by 20% THEN the System SHALL initiate a profit sweep
3. THE System SHALL calculate excess profit as `Futures_Balance - (Target_Allocation * 1.2)`
4. THE System SHALL transfer excess USDT to the Spot Wallet via internal transfer API
5. THE System SHALL maintain a Reserve Limit of $200 that can never be swept
6. THE System SHALL execute sweeps daily at 00:00 UTC or after trades that increase equity by > 10%
7. THE System SHALL log all sweep transactions with amount and reason
8. WHEN a sweep fails THEN the System SHALL retry up to 3 times with exponential backoff

### Requirement 5: Circuit Breaker System

**User Story:** As a risk manager, I want the system to automatically halt trading when extreme conditions are detected, so that I prevent catastrophic losses.

#### Acceptance Criteria

1. WHEN daily drawdown exceeds 15% THEN the System SHALL trigger a Circuit Breaker
2. WHEN equity drops below $150 (75% of starting capital) THEN the System SHALL trigger a Circuit Breaker
3. WHEN 3 consecutive losing trades occur within 1 hour THEN the System SHALL trigger a soft pause (30 minute cooldown)
4. WHEN Circuit Breaker is triggered THEN the System SHALL close all open positions immediately
5. WHEN Circuit Breaker is triggered THEN the System SHALL reject all new signals until manual reset
6. THE System SHALL send emergency notifications via all configured channels when Circuit Breaker triggers
7. THE System SHALL log the Circuit Breaker event with full context (equity, positions, trigger reason)
8. WHEN Circuit Breaker is manually reset THEN the System SHALL require confirmation and log the operator identity

### Requirement 6: Global Risk Monitoring

**User Story:** As a risk manager, I want real-time visibility into portfolio-level risk metrics, so that I can assess overall system health.

#### Acceptance Criteria

1. THE System SHALL calculate and display current Global Leverage every 30 seconds
2. THE System SHALL calculate and display Net Delta (directional exposure) every 30 seconds
3. THE System SHALL calculate Portfolio VaR (95% confidence, 1-day horizon) every 5 minutes
4. THE System SHALL track correlation score between all open positions
5. WHEN correlation score exceeds 0.85 THEN the System SHALL display a warning
6. THE System SHALL calculate total unrealized PnL across all positions
7. THE System SHALL track distance to High Watermark (current drawdown)
8. THE System SHALL display time since last profitable trade

### Requirement 7: Phase Coordination

**User Story:** As a system architect, I want the Brain to coordinate signals from multiple phases without conflicts, so that phases work together harmoniously.

#### Acceptance Criteria

1. WHEN multiple phases generate signals simultaneously THEN the System SHALL process them in priority order (P3 > P2 > P1)
2. WHEN Phase 3 requests a hedge THEN the System SHALL allow it to override Phase 1/2 position limits
3. WHEN two phases request opposite positions on the same asset THEN the System SHALL calculate the net position
4. THE System SHALL maintain a signal queue with timestamps and phase source
5. THE System SHALL process signals with a maximum latency of 100ms
6. WHEN a signal is vetoed THEN the System SHALL log the reason and notify the originating phase
7. THE System SHALL track signal approval rate per phase
8. WHEN approval rate drops below 50% for a phase THEN the System SHALL flag for review

### Requirement 8: Treasury Management

**User Story:** As a fund manager, I want to track capital flows between risky and safe buckets, so that I understand the growth trajectory.

#### Acceptance Criteria

1. THE System SHALL maintain separate accounting for Futures Wallet (risky) and Spot Wallet (safe)
2. THE System SHALL track total amount swept to Spot Wallet since inception
3. THE System SHALL calculate the "Locked Profit" as total swept amount
4. THE System SHALL display the percentage of NAV in each bucket
5. WHEN Spot Wallet balance exceeds $10,000 THEN the System SHALL suggest external withdrawal
6. THE System SHALL track the sweep frequency and average sweep amount
7. THE System SHALL calculate the effective "Risk Capital" as Futures Wallet balance
8. THE System SHALL prevent any transfers from Spot Wallet back to Futures Wallet

### Requirement 9: Allocation Persistence and Recovery

**User Story:** As a system operator, I want allocation decisions to persist across restarts, so that the system maintains continuity.

#### Acceptance Criteria

1. THE System SHALL persist the current Allocation Vector to database every time it changes
2. THE System SHALL persist performance metrics (Sharpe Ratios) for each phase
3. THE System SHALL persist the High Watermark value
4. WHEN the System restarts THEN it SHALL load the last known Allocation Vector
5. WHEN the System restarts THEN it SHALL recalculate all risk metrics before accepting new signals
6. THE System SHALL maintain an audit log of all allocation changes with timestamps
7. THE System SHALL support manual override of allocation weights with operator authentication
8. WHEN manual override is active THEN the System SHALL display a warning banner

### Requirement 10: Dashboard and Observability

**User Story:** As a trader, I want a comprehensive dashboard showing Brain status and decisions, so that I understand what the system is doing.

#### Acceptance Criteria

1. THE System SHALL display current NAV with real-time updates
2. THE System SHALL display the Allocation Vector with base weights, performance modifiers, and actual weights
3. THE System SHALL display equity allocated to each phase
4. THE System SHALL display Global Leverage, Net Delta, and Correlation Score
5. THE System SHALL display next sweep trigger level and total swept amount
6. THE System SHALL display recent allocation decisions with reasoning
7. THE System SHALL display Circuit Breaker status and last trigger time
8. THE System SHALL support exporting dashboard data to JSON for external monitoring
