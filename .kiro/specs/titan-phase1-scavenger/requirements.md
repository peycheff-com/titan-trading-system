# Requirements Document: Titan Phase 1 - Scavenger (Hybrid Engine)

## Introduction

The Titan Phase 1 (Scavenger) is a **Predestination Engine** (Trap System) designed for account building from $200 to $5,000. It pre-calculates structural breakout levels, monitors Binance Spot for validation signals, and executes on Bybit Perps to catch momentum ignition with 2-5% targets.

**Core Philosophy**: "We don't scan for opportunities. We calculate exactly where the market will break, place our traps in memory, and wait for price to walk into them."

**The Predestination Architecture**:
- **Pre-Computation Layer (The Web)**: Calculates tripwires every 1 minute for top 20 volatile assets (liquidation clusters, daily levels, Bollinger breakouts)
- **Detection Layer (The Spider)**: Monitors Binance Spot WebSocket for tripwire hits with volume confirmation
- **Execution Layer (The Bite)**: Fires Market or Aggressive Limit orders on Bybit Perps when Binance validates the breakout

**Why This Wins for Bulgaria (200ms latency)**:
- We don't compete on tick arbitrage (HFTs win that in 1-10ms)
- We use Binance as a **signal validator** - if Binance breaks with volume, it's real money, not a fake-out
- We catch the **momentum ignition** (2-5% moves) that follows 1-10 seconds after HFTs close the price gap
- We trade **structural momentum**, not micro-scalps, making latency irrelevant

## Glossary

- **System**: The Titan Phase 1 Scavenger (Predestination Engine)
- **Predestination Engine**: The trap system that pre-calculates breakout levels and waits for price to hit them
- **Pre-Computation Layer (The Web)**: Calculates tripwires every 1 minute based on structural levels
- **Detection Layer (The Spider)**: Monitors Binance Spot WebSocket for tripwire hits with volume validation
- **Execution Layer (The Bite)**: Fires orders on Bybit Perps when Binance confirms the breakout
- **Tripwire**: A pre-calculated price level where a breakout is expected (liquidation cluster, daily high/low, Bollinger band)
- **Leader-Follower**: The relationship where Binance Spot leads price discovery and Bybit Perps follow with 1-10 second lag
- **Signal Validator**: Using Binance Spot breakouts to confirm that Bybit moves are real money, not fake-outs
- **Momentum Ignition**: The 2-5% pump that follows a validated breakout, driven by retail FOMO 1-10 seconds after HFTs close the price gap
- **Trap Monitor**: The console display showing active tripwires and their distance from current price
- **Liquidation Cluster**: A price level with high concentration of stop-losses, estimated from volume profile
- **Daily Levels**: Previous Day High (PDH) and Previous Day Low (PDL), key psychological levels
- **Bollinger Breakout**: When price breaks above upper band or below lower band with volume
- **Volume Confirmation**: Requiring >50 trades in 100ms on Binance to distinguish real breakouts from fake-outs
- **Latency Tax**: The 0.2% slippage we accept by using Market/Aggressive Limit orders to guarantee fills despite 200ms lag
- **Fee Barrier**: The minimum price move needed to break even after fees (typically 0.18%)

## Requirements

### Requirement 1: Three-Layer Trap Architecture

**User Story:** As a trader, I want a trap system that pre-calculates breakout levels and monitors Binance for validation, so that I catch momentum ignition on Bybit without competing on tick arbitrage.

#### Acceptance Criteria

1. WHEN the System starts, THE System SHALL initialize Pre-Computation Layer with 1-minute update interval, Detection Layer with real-time WebSocket monitoring, and Execution Layer with Bybit API connection
2. WHEN Pre-Computation Layer completes calculation, THE System SHALL update Trap Map with tripwires for top 20 volatile symbols
3. WHEN Detection Layer receives Binance tick, THE System SHALL check if price matches any active tripwire within 0.1 percent tolerance
4. WHEN tripwire is hit, THE System SHALL validate with volume confirmation requiring minimum 50 trades in 100 milliseconds
5. WHEN validation succeeds, THE System SHALL activate trap and trigger Execution Layer
6. WHEN Pre-Computation duration exceeds 60 seconds, THE System SHALL emit COMPUTATION_SLOW warning
7. WHEN System memory usage exceeds 150 megabytes, THE System SHALL emit RESOURCE_WARNING alert

### Requirement 2: Pre-Computation Layer (The Web)

**User Story:** As a trader, I want the system to pre-calculate structural breakout levels every minute, so that execution is instant when price hits the tripwire.

#### Acceptance Criteria

1. WHEN Pre-Computation Layer runs, THE System SHALL fetch 1-hour and 4-hour OHLCV data for 500 highest-volume symbols from Bybit
2. WHEN Pre-Computation Layer calculates tripwires, THE System SHALL identify liquidation clusters using volume profile analysis with 50-bar lookback
3. WHEN Pre-Computation Layer calculates tripwires, THE System SHALL identify daily levels using previous day high and previous day low
4. WHEN Pre-Computation Layer calculates tripwires, THE System SHALL identify Bollinger breakout levels using 20-period bands with 2 standard deviations
5. WHEN Pre-Computation Layer scores symbols, THE System SHALL assign trap quality score between 0 and 100 based on volatility (40 points), volume (30 points), and level confluence (30 points)
6. WHEN Pre-Computation Layer updates Trap Map, THE System SHALL select top 20 symbols with highest trap quality scores
7. WHEN Pre-Computation Layer stores tripwires, THE System SHALL include symbol, trigger price, direction (LONG or SHORT), estimated cascade size, and trap type (LIQUIDATION, DAILY_LEVEL, or BOLLINGER)

### Requirement 3: Detection Layer (The Spider)

**User Story:** As a trader, I want the system to monitor Binance Spot for tripwire hits with volume validation, so that I only execute on confirmed breakouts, not fake-outs.

#### Acceptance Criteria

1. WHEN Detection Layer starts, THE System SHALL subscribe to Binance Spot AggTrades WebSocket for all symbols in Trap Map
2. WHEN Detection Layer receives Binance tick, THE System SHALL check if current price is within 0.1 percent of any active tripwire price
3. WHEN tripwire proximity is detected, THE System SHALL start volume accumulation counter for 100-millisecond window
4. WHEN volume accumulation completes, THE System SHALL validate breakout by requiring minimum 50 trades in 100-millisecond window
5. WHEN volume validation succeeds, THE System SHALL mark tripwire as ACTIVATED and emit TRAP_SPRUNG event
6. WHEN tripwire is activated, THE System SHALL prevent duplicate activation for 5 minutes
7. WHEN Binance WebSocket disconnects, THE System SHALL attempt reconnection with maximum 3 retries and 2-second delay between attempts

### Requirement 4: Execution Layer (The Bite)

**User Story:** As a trader operating from Bulgaria with 200ms latency, I want the system to use Market or Aggressive Limit orders to guarantee fills, so that I catch momentum ignition despite network lag.

#### Acceptance Criteria

1. WHEN Execution Layer receives TRAP_SPRUNG event, THE System SHALL calculate price velocity using Bybit last 5 seconds of price data
2. WHEN price velocity exceeds 0.5 percent per second, THE System SHALL use Market Order on Bybit Perps
3. WHEN price velocity is between 0.1 percent and 0.5 percent per second, THE System SHALL use Limit Order at best ask plus 0.2 percent for long or best bid minus 0.2 percent for short
4. WHEN price velocity is below 0.1 percent per second, THE System SHALL use Limit Order at best ask for long or best bid for short
5. WHEN Execution Layer sends order, THE System SHALL log order type, entry price, latency tax percentage, and expected target
6. WHEN order is filled, THE System SHALL set stop loss at 1 percent from entry and target at 3 percent from entry for 3 to 1 risk-reward ratio
7. WHEN order fill fails after 2 seconds, THE System SHALL cancel order and log EXECUTION_FAILED with reason

### Requirement 5: Tripwire Strategy - The Breakout Trap

**User Story:** As a trader, I want to catch validated breakouts at key structural levels, so that I ride momentum ignition with high probability.

#### Acceptance Criteria

1. WHEN System calculates Bollinger Breakout tripwire, THE System SHALL set trigger price at upper band plus 0.1 percent for long or lower band minus 0.1 percent for short
2. WHEN System calculates Daily Level tripwire, THE System SHALL set trigger price at previous day high plus 0.1 percent for long or previous day low minus 0.1 percent for short
3. WHEN System calculates Liquidation Cluster tripwire, THE System SHALL set trigger price at volume profile peak plus 0.2 percent for long or minus 0.2 percent for short
4. WHEN tripwire is activated, THE System SHALL set confidence to 90 for Bollinger Breakout, 85 for Daily Level, and 95 for Liquidation Cluster
5. WHEN tripwire is activated, THE System SHALL set leverage suggestion to 15x for Bollinger Breakout, 12x for Daily Level, and 20x for Liquidation Cluster
6. WHEN tripwire is activated, THE System SHALL calculate stop loss at 1 percent from entry
7. WHEN tripwire is activated, THE System SHALL calculate target at 3 percent from entry for 3 to 1 risk-reward ratio

### Requirement 6: Tripwire Strategy - The Liquidation Fade

**User Story:** As a trader, I want to fade overextended moves at liquidation clusters, so that I catch mean reversion with structural support.

#### Acceptance Criteria

1. WHEN System calculates 3-Sigma Deviation tripwire, THE System SHALL identify price levels exceeding 3 standard deviations from 20-period VWAP
2. WHEN System detects overextension, THE System SHALL set tripwire at 3-sigma level for fade entry
3. WHEN Binance hits 3-sigma tripwire, THE System SHALL validate with CVD stall requiring CVD delta less than 20,000 USD in last 100 milliseconds
4. WHEN CVD stall is confirmed, THE System SHALL activate fade trap with direction opposite to overextension
5. WHEN fade trap is activated, THE System SHALL set confidence to 80 and leverage suggestion to 10x
6. WHEN fade trap is activated, THE System SHALL calculate stop loss at 1.5 percent from entry
7. WHEN fade trap is activated, THE System SHALL calculate target at 3 percent from entry for 2 to 1 risk-reward ratio

### Requirement 7: Trap Map Management

**User Story:** As a trader, I want the Trap Map to dynamically update with the best structural levels, so that I always have high-quality tripwires ready.

#### Acceptance Criteria

1. WHEN Pre-Computation Layer completes calculation, THE System SHALL rank all 500 symbols by trap quality score in descending order
2. WHEN Pre-Computation Layer updates Trap Map, THE System SHALL select top 20 symbols with trap quality score exceeding 60
3. WHEN a symbol enters Trap Map, THE System SHALL subscribe Detection Layer to Binance Spot AggTrades WebSocket for that symbol
4. WHEN a symbol exits Trap Map, THE System SHALL unsubscribe Detection Layer from that symbol and deactivate all tripwires
5. WHEN Trap Map updates, THE System SHALL emit TRAP_MAP_UPDATED event with added symbols, removed symbols, and new tripwire prices
6. WHEN a tripwire is activated, THE System SHALL mark tripwire as FIRED and prevent reactivation for 5 minutes
7. WHEN Trap Map contains fewer than 20 symbols, THE System SHALL lower trap quality threshold to 50 to maintain minimum 20 symbols

### Requirement 8: Trap Monitor Console Dashboard

**User Story:** As a trader, I want a console dashboard that shows active tripwires and their proximity to current price, so that I know when traps are about to spring.

#### Acceptance Criteria

1. WHEN System displays dashboard, THE System SHALL show header with phase identifier PREDESTINATION, current equity, and profit percentage
2. WHEN System displays Trap Monitor table, THE System SHALL show columns for symbol, current price, trigger price, trap type, and lead time
3. WHEN System displays trap type, THE System SHALL show visual indicator for BREAKOUT, LIQ_HUNT, or BREAKDOWN
4. WHEN System displays lead time, THE System SHALL show estimated milliseconds until Bybit price reaches Binance trigger price based on historical lag
5. WHEN System displays proximity indicator, THE System SHALL show distance percentage between current price and trigger price
6. WHEN System displays sensor status section, THE System SHALL show Binance stream health, Bybit connection status, and estimated slippage percentage
7. WHEN System displays live feed section, THE System SHALL show last 5 events with timestamp, symbol, event type, and execution result

### Requirement 9: Fee Barrier Validation

**User Story:** As a trader, I want the system to validate that expected move exceeds fee costs, so that I avoid negative expectancy trades.

#### Acceptance Criteria

1. WHEN System calculates fee barrier, THE System SHALL calculate total fee cost as maker fee plus taker fee plus spread percentage
2. WHEN System evaluates signal, THE System SHALL require expected target move to exceed fee barrier by minimum 2 times
3. WHEN signal fails fee barrier validation, THE System SHALL reject signal and log FEE_BARRIER_REJECT message
4. WHEN System displays fee barrier, THE System SHALL show percentage value in dashboard telemetry section
5. WHEN spread exceeds 0.1 percent, THE System SHALL increase fee barrier threshold to 3 times
6. WHEN System operates in extreme volatility, THE System SHALL reduce fee barrier multiplier to 1.5 times to allow more signals
7. WHEN System calculates net profit, THE System SHALL subtract fee barrier from gross profit for accurate P&L display

### Requirement 10: Multi-Exchange Symbol Discovery

**User Story:** As a trader, I want the system to discover high-volume symbols across multiple exchanges, so that I have maximum opportunity coverage.

#### Acceptance Criteria

1. WHEN System starts, THE System SHALL fetch trading pairs from Bybit exchange and Binance exchange
2. WHEN System filters symbols, THE System SHALL select symbols with 24-hour volume exceeding 1,000,000 USD
3. WHEN System filters symbols, THE System SHALL support perpetual market type only for Phase 1
4. WHEN System filters symbols, THE System SHALL exclude symbols with spread exceeding 0.15 percent
5. WHEN System filters symbols, THE System SHALL return 500 symbols with highest 24-hour volume
6. WHEN System detects exchange downtime, THE System SHALL continue operating with remaining exchanges
7. WHEN user modifies exchange configuration, THE System SHALL apply changes without restart

### Requirement 11: Signal Execution Logging

**User Story:** As a trader, I want all signals and executions logged in queryable format, so that I can analyze performance and refine strategies.

#### Acceptance Criteria

1. WHEN System generates signal, THE System SHALL append signal data to trades.jsonl file as single JSON object per line
2. WHEN System logs signal, THE System SHALL include timestamp, symbol, strategy type, confidence, leverage, entry price, stop price, target price, regime state, and flow state
3. WHEN System executes order, THE System SHALL append execution data to trades.jsonl file with fill price, fill timestamp, and order type
4. WHEN System closes position, THE System SHALL append close data to trades.jsonl file with exit price, exit timestamp, profit percentage, and close reason
5. WHEN log file size exceeds 10 megabytes, THE System SHALL rotate log file with timestamp suffix
6. WHEN log file age exceeds 30 days, THE System SHALL compress log file to gzip format
7. WHEN user queries logs, THE System SHALL support jq command-line tool for JSON filtering

### Requirement 12: Runtime Configuration

**User Story:** As a trader, I want to modify strategy parameters during runtime, so that I can adapt to changing market conditions without restart.

#### Acceptance Criteria

1. WHEN user presses F1 key, THE System SHALL display configuration panel overlay
2. WHEN user configures regime settings, THE System SHALL allow adjustment of compression threshold between 5 percent and 20 percent, entropy threshold between 0.3 and 0.7, and trend strength threshold between 0.5 and 2.0
3. WHEN user configures flow settings, THE System SHALL allow adjustment of CVD threshold between 50,000 USD and 200,000 USD, frequency multiplier between 2.0 and 5.0, and OBI threshold between 1.5 and 3.0
4. WHEN user configures risk settings, THE System SHALL allow adjustment of max leverage between 5x and 20x, max position size percentage between 10 percent and 50 percent, and fee barrier multiplier between 1.5 and 3.0
5. WHEN user saves configuration, THE System SHALL write configuration to config.json file and apply changes immediately
6. WHEN user cancels configuration, THE System SHALL discard changes and return to dashboard
7. WHEN configuration file is corrupted, THE System SHALL load default configuration and log CONFIG_CORRUPTED warning

## Success Metrics (Phase 1 Specific)

1. **Capital Growth**: Achieve $200 → $5,000 growth (25x) within 3-6 months
2. **Win Rate**: Maintain minimum 60% win rate on Compression Breakout signals
3. **Risk-Reward**: Achieve average 8:1 R:R on winning trades
4. **Scan Performance**: Regime scan < 5 seconds, Flow scan < 100ms
5. **Signal Quality**: Generate minimum 3 high-confidence signals per day
6. **Fee Efficiency**: Maintain net profit after fees > 0 on 80% of trades

## Out of Scope (Future Phases)

### Phase 2 (Hunter) - Separate Spec Required
- HTF Structure analysis (Order Blocks, FVG, Break of Structure)
- 15-minute and 4-hour timeframe regime filtering
- CVD divergence at structural levels
- 3x-5x leverage with cross margin
- $5,000 → $50,000 growth path

### Phase 3 (Architect) - Separate Spec Required
- Daily bias and macro trend following
- Funding rate arbitrage
- Systematic position sizing
- 1x-2x leverage with portfolio management
- $50,000+ wealth preservation

### Titan Brain Orchestrator - Separate Spec Required
- Automatic phase switching based on equity
- Multi-phase portfolio management
- Risk allocation across phases
- Performance analytics and reporting
