# Requirements Document: Titan Phase 3 - The Sentinel

## Introduction

**Titan Phase 3 - The Sentinel** is an active market-neutral hedge fund system
that treats the basis (the spread between spot and perpetual futures prices) as
a tradable asset class. Unlike passive funding rate arbitrage bots that simply
hold positions, The Sentinel actively scalps basis expansion and contraction
while maintaining delta neutrality, monetizing market inefficiencies across
multiple dimensions.

The Sentinel provides three distinct edges:

1. **Passive Edge**: Collecting funding rates (the "carry")
2. **Active Edge**: Scalping basis fluctuations (the "basis trade")
3. **Structural Edge**: Absorbing liquidations neutrally (the "vacuum arb")

This system is designed to scale to $100k+ capital with institutional-grade
execution, risk management, and portfolio rebalancing capabilities.

## Glossary

- **Basis**: The percentage difference between perpetual futures price and spot
  price, calculated as `(Perp_Price - Spot_Price) / Spot_Price`
- **Basis Expansion**: Market condition where bullish sentiment pushes perpetual
  prices significantly higher than spot prices
- **Basis Contraction**: Market condition where liquidations or bearish
  sentiment forces perpetual prices lower than spot prices
- **Atomic Execution**: Simultaneous execution of two orders (spot and
  perpetual) to lock in a spread without leg risk
- **Inventory Skew**: The deviation from perfect 50/50 spot/perpetual balance in
  the hedge portfolio
- **Hedge Ratio**: The calculation determining how much perpetual short position
  is needed to cover spot long position (typically 1:1, adjustable for beta)
- **Leg Risk**: The risk that one side of a paired trade executes while the
  other fails, creating unwanted directional exposure
- **Delta Neutral**: A portfolio state where the net directional exposure to
  price movements is zero
- **Margin Utilization**: The percentage of available margin being used for
  perpetual futures positions
- **TWAP**: Time Weighted Average Price execution algorithm that slices large
  orders over time
- **VWAP**: Volume Weighted Average Price execution algorithm that matches order
  execution to market volume patterns
- **Vacuum Arb**: Strategy of providing liquidity during liquidation cascades at
  favorable prices
- **Core Position**: The permanent 50% allocation maintained for passive funding
  rate collection
- **Satellite Position**: The active 50% allocation used for basis scalping and
  tactical adjustments
- **NAV**: Net Asset Value, the total portfolio value including unrealized
  profits and losses
- **LTV**: Loan to Value ratio, measuring leverage and liquidation risk

## Requirements

### Requirement 0: Polymarket Latency Arbitrage Engine

**User Story:** As a Sentinel operator, I want to exploit the latency between
Binance Spot BTC prices (leading) and Polymarket prediction market odds
(lagging), so that I can profit from predictable price lag during
high-volatility events.

#### Acceptance Criteria

1. WHEN the system initializes THEN the Sentinel SHALL subscribe to real-time
   Binance BTC-USDT AggTrade/BookTicker streams.
2. WHEN the system initializes THEN the Sentinel SHALL continuously query
   Polymarket's Gamma API to identify active, high-liquidity "Up/Down" markets
   (15m and Hourly windows).
3. WHEN Binance BTC price moves by more than `X%` within `Y` seconds
   (configurable) THEN the Sentinel SHALL trigger an arbitrage check.
4. WHEN an arbitrage check is triggered THEN the Sentinel SHALL compare the
   implied probability of the Polymarket odds against the new Binance price
   direction.
5. WHEN a significant lag is detected (e.g., Binance up 1%, Poly odds unchanged)
   THEN the Sentinel SHALL immediately execute a LIMIT BUY order on the "cheap"
   side of the prediction market.
6. WHEN executing on Polymarket THEN the Sentinel SHALL use CTF Exchange
   standard signing via `ethers.js` or `viem`.
7. THE Sentinel SHALL optimize the event loop to ensure sub-100ms reaction time
   from Binance trigger to Polymarket order placement.

### Requirement 1: Active Basis Engine

**User Story:** As a Sentinel operator, I want to profit from basis volatility
by actively trading the spread between spot and perpetual prices, so that I can
generate returns beyond passive funding rate collection.

#### Acceptance Criteria

1. WHEN the system initializes THEN the Sentinel SHALL calculate the rolling
   Z-Score of the basis using a 1-hour sliding window
2. WHEN the basis Z-Score exceeds +2.0 THEN the Sentinel SHALL classify the
   basis as expensive and prepare to open or add to hedge positions
3. WHEN the basis Z-Score is expensive AND execution conditions are met THEN the
   Sentinel SHALL execute atomic orders to buy spot and sell perpetual futures
4. WHEN the basis Z-Score falls below 0.0 THEN the Sentinel SHALL classify the
   basis as mean-reverting and prepare to reduce hedge positions
5. WHEN the basis Z-Score is mean-reverting AND profit targets are met THEN the
   Sentinel SHALL execute atomic orders to sell spot and buy back perpetual
   futures
6. THE Sentinel SHALL maintain a core position of 50% total capital for passive
   funding rate collection
7. THE Sentinel SHALL allocate a satellite position of 50% total capital for
   active basis scalping operations
8. WHEN calculating basis THEN the Sentinel SHALL use order book depth-weighted
   prices rather than mid prices to account for execution impact costs

### Requirement 2: Vacuum Arbitrage Engine

**User Story:** As a Sentinel operator, I want to harvest liquidation events by
providing liquidity at favorable prices, so that I can enter positions at
better-than-market rates while maintaining delta neutrality.

#### Acceptance Criteria

1. WHEN the system is running THEN the Sentinel SHALL continuously monitor for
   negative basis events where perpetual price falls below spot price
2. WHEN the basis falls below -0.5% THEN the Sentinel SHALL classify this as an
   extreme discount event
3. WHEN an extreme discount event occurs AND liquidation volume exceeds $1M THEN
   the Sentinel SHALL prepare to execute vacuum arbitrage
4. WHEN vacuum arbitrage conditions are met THEN the Sentinel SHALL execute
   atomic orders to buy perpetual futures and sell spot
5. WHEN a vacuum arbitrage position is opened THEN the Sentinel SHALL hold the
   position until basis returns to zero or positive
6. WHEN the basis returns to >= 0% THEN the Sentinel SHALL close the vacuum
   arbitrage position to realize the convergence profit
7. THE Sentinel SHALL use Phase 1 liquidation detection technology to identify
   optimal entry timing for vacuum arbitrage

### Requirement 3: Cross-Exchange Arbitrage Router

**User Story:** As a Sentinel operator with capital deployed across multiple
exchanges, I want to exploit price differences between exchanges, so that I can
optimize execution prices and increase overall returns.

#### Acceptance Criteria

1. WHEN the system initializes THEN the Sentinel SHALL establish price
   monitoring for Binance Spot BTC and Bybit Perpetual BTC
2. WHEN the system initializes THEN the Sentinel SHALL establish price
   monitoring for Bybit Spot BTC and Bybit Perpetual BTC
3. WHEN executing a hedge position THEN the Sentinel SHALL route the spot leg to
   the exchange offering the lowest spot price
4. WHEN executing a hedge position THEN the Sentinel SHALL route the perpetual
   leg to the exchange offering the highest perpetual price
5. WHEN evaluating cross-exchange opportunities THEN the Sentinel SHALL
   calculate total costs including transfer fees and withdrawal fees
6. WHEN total costs exceed potential arbitrage profit THEN the Sentinel SHALL
   reject the cross-exchange routing and use single-exchange execution
7. THE Sentinel SHALL maintain real-time connectivity to all configured
   exchanges for price discovery and order routing

### Requirement 4: Portfolio Rebalancer

**User Story:** As a Sentinel operator, I want automated portfolio rebalancing
to prevent liquidation of one leg while the other profits, so that I can
maintain hedge integrity and compound returns safely.

#### Acceptance Criteria

1. WHEN the system is running THEN the Sentinel SHALL continuously monitor
   margin utilization on perpetual futures positions
2. WHEN margin utilization exceeds 30% THEN the Sentinel SHALL trigger Tier 1
   rebalancing actions
3. WHEN Tier 1 rebalancing is triggered AND unified account is available THEN
   the Sentinel SHALL transfer available USDT from spot wallet to futures wallet
4. WHEN Tier 1 rebalancing is insufficient AND margin utilization remains above
   30% THEN the Sentinel SHALL trigger Tier 2 rebalancing actions
5. WHEN Tier 2 rebalancing is triggered THEN the Sentinel SHALL sell a
   calculated portion of spot assets and transfer USDT to futures wallet
6. WHEN margin utilization falls below 5% THEN the Sentinel SHALL trigger profit
   compounding actions
7. WHEN profit compounding is triggered THEN the Sentinel SHALL transfer excess
   margin from futures wallet to spot wallet and purchase additional spot assets
8. THE Sentinel SHALL maintain detailed logs of all rebalancing actions
   including triggers, amounts, and outcomes

### Requirement 5: Algorithmic Execution Engine

**User Story:** As a Sentinel operator executing large orders, I want
intelligent order slicing and timing to minimize market impact, so that I can
maintain profitability on positions exceeding $5,000.

#### Acceptance Criteria

1. WHEN an order size exceeds $5,000 THEN the Sentinel SHALL use TWAP execution
   algorithm
2. WHEN TWAP execution is triggered THEN the Sentinel SHALL slice the order into
   clips of $500 or smaller
3. WHEN executing TWAP clips THEN the Sentinel SHALL randomize execution
   intervals between 30 and 90 seconds
4. WHEN any clip experiences slippage exceeding 0.2% THEN the Sentinel SHALL
   abort the remaining execution and log the failure
5. WHEN executing atomic orders THEN the Sentinel SHALL ensure both legs are
   sliced proportionally to maintain delta neutrality throughout execution
6. THE Sentinel SHALL provide real-time execution progress updates including
   filled quantity, average price, and remaining quantity
7. THE Sentinel SHALL calculate and report total execution costs including fees,
   slippage, and market impact

### Requirement 6: Atomic Execution Safety

**User Story:** As a Sentinel operator, I want guaranteed atomic execution of
paired trades, so that I never have unwanted directional exposure from partial
fills.

#### Acceptance Criteria

1. WHEN executing a hedge position THEN the Sentinel SHALL send spot and
   perpetual orders simultaneously
2. WHEN the spot order fills AND the perpetual order fails THEN the Sentinel
   SHALL immediately execute a reverse spot order to neutralize delta exposure
3. WHEN the perpetual order fills AND the spot order fails THEN the Sentinel
   SHALL immediately execute a reverse perpetual order to neutralize delta
   exposure
4. WHEN both orders fail THEN the Sentinel SHALL log the failure and retry
   according to configured retry policy
5. WHEN partial fills occur on either leg THEN the Sentinel SHALL adjust the
   opposite leg to match the filled quantity
6. THE Sentinel SHALL maintain a transaction log of all atomic execution
   attempts including success, failure, and abort events
7. THE Sentinel SHALL emit alerts when atomic execution failures occur requiring
   manual intervention

### Requirement 7: Statistical Monitoring Core

**User Story:** As a Sentinel operator, I want real-time statistical analysis of
basis behavior, so that I can make informed decisions about position entry and
exit timing.

#### Acceptance Criteria

1. WHEN the system initializes THEN the Sentinel SHALL create a rolling
   statistics buffer for basis history
2. WHEN new price data arrives THEN the Sentinel SHALL update the rolling
   statistics buffer with the current basis value
3. WHEN calculating Z-Score THEN the Sentinel SHALL use the formula
   `(current_basis - mean_basis) / std_dev_basis`
4. WHEN calculating basis THEN the Sentinel SHALL use order book depth-weighted
   prices to account for execution impact
5. THE Sentinel SHALL maintain separate statistical models for each trading pair
6. THE Sentinel SHALL expose statistical metrics including mean, standard
   deviation, Z-Score, and percentile rankings
7. THE Sentinel SHALL persist statistical history to enable backtesting and
   performance analysis

### Requirement 8: Risk Management Framework

**User Story:** As a Sentinel operator, I want comprehensive risk controls to
protect capital during extreme market conditions, so that I can operate the
system with confidence at scale.

#### Acceptance Criteria

1. WHEN the system initializes THEN the Sentinel SHALL load risk parameters
   including maximum position size, maximum leverage, and stop-loss thresholds
2. WHEN portfolio delta exceeds 2% THEN the Sentinel SHALL emit a warning alert
3. WHEN portfolio delta exceeds 5% THEN the Sentinel SHALL halt new position
   entries until delta is reduced
4. WHEN unrealized loss on any position exceeds 10% THEN the Sentinel SHALL
   trigger position review and potential closure
5. WHEN daily drawdown exceeds 5% THEN the Sentinel SHALL reduce position sizes
   by 50%
6. WHEN daily drawdown exceeds 10% THEN the Sentinel SHALL close all positions
   and enter safe mode
7. THE Sentinel SHALL maintain real-time calculation of portfolio NAV, delta
   exposure, and risk metrics
8. THE Sentinel SHALL provide emergency flatten functionality to close all
   positions immediately

### Requirement 9: Performance Tracking and Reporting

**User Story:** As a Sentinel operator, I want detailed performance analytics,
so that I can evaluate strategy effectiveness and optimize parameters.

#### Acceptance Criteria

1. WHEN the system is running THEN the Sentinel SHALL track total deployed
   capital
2. WHEN the system is running THEN the Sentinel SHALL calculate average funding
   rate APY across all positions
3. WHEN the system is running THEN the Sentinel SHALL track basis scalping
   profit and loss separately from funding rate collection
4. WHEN the system is running THEN the Sentinel SHALL calculate total 24-hour
   yield combining all revenue sources
5. THE Sentinel SHALL maintain historical records of all trades including entry
   price, exit price, holding period, and realized profit
6. THE Sentinel SHALL calculate performance metrics including Sharpe ratio,
   maximum drawdown, and win rate
7. THE Sentinel SHALL provide exportable reports in CSV and JSON formats for
   external analysis

### Requirement 10: Dashboard and Monitoring Interface

**User Story:** As a Sentinel operator, I want a comprehensive dashboard
displaying all critical metrics, so that I can monitor system health and
performance at a glance.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the Sentinel SHALL display current NAV and
   portfolio delta percentage
2. WHEN the dashboard loads THEN the Sentinel SHALL display a basis monitor
   table showing all active pairs with spot price, perpetual price, basis
   percentage, Z-Score, and recommended action
3. WHEN the dashboard loads THEN the Sentinel SHALL display yield farm
   performance including total deployed capital, current funding rate APY, basis
   scalping PnL, and total 24-hour yield
4. WHEN the dashboard loads THEN the Sentinel SHALL display inventory health
   metrics including futures margin ratio, rebalance trigger threshold, and
   recent rebalancing activity
5. THE Sentinel SHALL update all dashboard metrics in real-time with sub-second
   latency
6. THE Sentinel SHALL use color coding to indicate status (green for healthy,
   yellow for warning, red for critical)
7. THE Sentinel SHALL provide drill-down capabilities to view detailed position
   information and transaction history
