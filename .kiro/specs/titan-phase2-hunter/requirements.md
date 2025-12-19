# Requirements Document: Titan Phase 2 - The Hunter (Institutional-Grade)

## Introduction

**Titan Phase 2 - The Hunter** is a **Holographic Market Structure Engine** that transitions from pattern recognition to **Liquidity Engineering**. It operates on the premise that price delivery is algorithmic, seeking two objectives:

1. **Seek Liquidity** (Stop runs to fuel moves)
2. **Rebalance Inefficiency** (Fair Value Gaps as price magnets)

**Core Philosophy**: "We don't trade trends. We trade the **Manipulation Phase** of the AMD (Accumulation-Manipulation-Distribution) cycle. We identify where institutional algorithms are forced to inject liquidity, and we position ourselves to capture the subsequent distribution."

**The Capital Scaling Problem**:
At $2,500+ capital, Phase 1's aggressive scalping (15-20x leverage, 2-5% targets) becomes inefficient due to:
- **Slippage Impact**: Larger position sizes (0.5-1 BTC equivalent) move the market on entry/exit
- **Fee Erosion**: High-frequency trading with 10+ trades/day accumulates significant taker fees (0.05%)
- **Psychological Fatigue**: Constant monitoring of micro-moves is unsustainable for 6-12 months
- **Noise Sensitivity**: Micro-scalps are vulnerable to random walk and HFT interference

Phase 2 solves this by:
- **Lower Leverage (3-5x)**: Reduces liquidation risk and allows larger absolute position sizes
- **Swing Timeframes (4H-Daily)**: Trades last 1-3 days, reducing monitoring burden to 2-3 checks per day
- **Maker Rebates**: Post-Only orders earn rebates (-0.01% to -0.02%) instead of paying taker fees (+0.05%)
- **Higher Win Rate**: Structural alignment (55-65% win rate) vs momentum scalping (45-50% win rate)
- **Institutional Logic**: Trade WITH smart money, not against them

**The Holographic Architecture**:
- **The Cartographer (Fractal Engine)**: Mathematically defines market structure using Bill Williams fractals across 3 timeframes
- **The Hologram (Alignment Logic)**: Combines Daily (Bias), 4H (Narrative), and 15m (Trigger) into a single state vector with veto logic
- **The Session Profiler**: Exploits the "Judas Swing" (false moves) at London/NY opens to catch manipulation-to-distribution transitions
- **The Inefficiency Mapper**: Identifies Fair Value Gaps and Order Blocks as high-probability entry zones
- **The Flow Validator (CVD X-Ray)**: Confirms reversals by detecting limit order absorption of aggressive selling
- **The Sniper (Execution)**: Uses Post-Only Limit Orders at Order Blocks, neutralizing Bulgaria latency

**Why This Wins for Bulgaria (200ms latency)**:
- We use **Limit Orders (Post-Only)** that rest on the order book at Order Blocks, earning Maker rebates
- We don't care about 200ms lag because our order is **waiting** at a pre-calculated level for price to come to us
- We trade **structural manipulation** (hours to days), not tick arbitrage (milliseconds)
- We enter during **Killzones** (London/NY open) when institutional flow provides follow-through
- We filter for **Relative Strength** to ensure we're in the strongest asset (alpha, not beta)
- We validate with **CVD Absorption** to confirm institutional participation

## Glossary

- **System**: The Titan Phase 2 Hunter (Holographic Market Structure Engine)
- **Hologram**: The composite state of a symbol derived from 3 timeframes (Daily, 4H, 15m) with weighted scoring and veto logic
- **AMD Cycle**: The Accumulation-Manipulation-Distribution cycle that occurs daily at session opens (we trade the Manipulation → Distribution transition)
- **Fractal**: A 5-candle pattern defining a Swing High or Low using Bill Williams definition (High[i] > High[i-2...i+2])
- **BOS (Break of Structure)**: A candle close beyond a previous fractal swing point, confirming trend continuation
- **MSS (Market Structure Shift)**: A BOS in the opposite direction of prevailing trend, signaling potential reversal (also called CHoCH)
- **Dealing Range**: The price range between the current Swing High and Swing Low on a given timeframe
- **Premium Zone**: The upper 50% of a Dealing Range (above 0.5 Fibonacci level) - institutional distribution zone, sell zone for shorts
- **Discount Zone**: The lower 50% of a Dealing Range (below 0.5 Fibonacci level) - institutional accumulation zone, buy zone for longs
- **Equilibrium**: The 0.5 Fibonacci level of a Dealing Range - neutral zone, avoid entries here
- **FVG (Fair Value Gap)**: A 3-candle imbalance where price gaps, leaving unfilled orders (high-probability retest zone, acts as price magnet)
- **Order Block (OB)**: The last opposite-colored candle before a BOS, representing institutional accumulation/distribution zone with resting limit orders
- **Inducement (IDM)**: A short-term High/Low created specifically to bait retail traders into entering early, only to be stopped out (liquidity grab)
- **Liquidity Pool**: Estimated cluster of stop losses at old Swing Highs/Lows, calculated using volume profile and time decay
- **Liquidity Sweep**: Price briefly breaks a Swing High/Low to trigger stops (fuel for the move), then reverses (turtle soup pattern)
- **SFP (Swing Failure Pattern)**: Price sweeps a liquidity pool with CVD divergence, signaling high-probability reversal
- **POI (Point of Interest)**: Mathematically defined support/resistance (Order Block, FVG, Liquidity Pool) where institutional orders rest
- **CVD (Cumulative Volume Delta)**: Running sum of buy volume minus sell volume, indicating institutional flow direction
- **CVD Divergence**: When price makes a New High/Low but CVD does not confirm it, signaling absorption/distribution
- **CVD Absorption**: Price makes Lower Low but CVD makes Higher Low, indicating limit buy orders are absorbing market sells (reversal signal)
- **Post-Only**: An order instruction ensuring the trade executes as Maker (passive), earning rebates (-0.01% to -0.02%)
- **IOC (Immediate or Cancel)**: An order instruction that fills immediately at limit price or cancels (used when chasing fails)
- **Relative Strength (RS)**: Asset performance vs BTC over 4 hours (RS > 0 = stronger than BTC, trade long; RS < 0 = weaker, trade short)
- **Killzone**: High-volume trading sessions when institutional flow is strongest (London Open 07:00-10:00 UTC, NY Open 13:00-16:00 UTC)
- **Judas Swing**: False move at session open that sweeps liquidity before reversing (London sweeps Asian High/Low, NY sweeps London High/Low)
- **Asian Range**: The High/Low established during Asian session (00:00-06:00 UTC), used as reference for London manipulation
- **A+ Alignment**: Full confluence across all 3 timeframes (Daily bias, 4H structure in discount/premium, 15m trigger with MSS, CVD confirmation)
- **B Alignment**: Partial confluence (2 out of 3 timeframes agree) - tradeable but lower confidence
- **Conflict State**: Timeframes disagree (Daily bullish, 4H bearish) - no trading allowed
- **ATR (Average True Range)**: 14-period volatility measure used for stop loss placement and position sizing
- **Volatility-Adjusted Sizing**: Position size calculation using formula: Risk_Dollars / (ATR * Stop_Distance_Multiplier)
- **Portfolio Heat**: Total risk across all open positions (sum of distance to stop loss for each position as % of equity)
- **Correlation Matrix**: 24-hour rolling correlation between all open positions and candidate symbols to avoid hidden concentration risk

## Requirements

### Requirement 1: The Holographic State Engine (Multi-Timeframe Logic)

**User Story:** As a strategist, I want to filter out all noise that conflicts with the Higher Timeframe narrative, so that I only trade with institutional tide.

#### Acceptance Criteria

1. WHEN analyzing symbol THEN the System SHALL maintain live Holographic State with Layer 1 Daily trend direction and key levels, Layer 2 4-Hour dealing range with premium/discount zones, and Layer 3 15-minute market structure shift
2. WHEN calculating Probability Score THEN the System SHALL use formula Score equals Daily_Bias times 0.5 plus 4H_Location times 0.3 plus 15m_Flow times 0.2
3. WHEN Daily is BULLISH and 4H is in PREMIUM zone THEN the System SHALL veto any Long signals and log PREMIUM_VETO message
4. WHEN Daily is BEARISH and 4H is in DISCOUNT zone THEN the System SHALL veto any Short signals and log DISCOUNT_VETO message
5. WHEN Daily is BULLISH and 4H is in DISCOUNT zone THEN the System SHALL mark status as HUNTING_LONG and enable Long signal detection
6. WHEN Daily is BEARISH and 4H is in PREMIUM zone THEN the System SHALL mark status as HUNTING_SHORT and enable Short signal detection
7. WHEN Daily and 4H conflict THEN the System SHALL mark status as CONFLICT and inhibit all trading

### Requirement 2: The Session Profiler (Time & Price Dynamics)

**User Story:** As a trader, I know volume is not distributed evenly. I want to trade the specific time windows where volatility injection occurs.

#### Acceptance Criteria

1. WHEN defining sessions THEN the System SHALL identify Asian session from 00:00 to 06:00 UTC as Accumulation phase, London session from 07:00 to 10:00 UTC as Manipulation phase, and NY session from 13:00 to 16:00 UTC as Distribution phase
2. WHEN Asian session completes THEN the System SHALL store Asian High and Asian Low as reference levels for London manipulation
3. WHEN London session opens THEN the System SHALL hunt for Judas Swing where price breaks Asian High or Asian Low
4. WHEN Judas Swing is detected THEN the System SHALL wait for price reversal back inside Asian Range and trigger Short if swept high or Long if swept low
5. WHEN NY session opens THEN the System SHALL hunt for Judas Swing where price breaks London High or London Low
6. WHEN time is Dead Zone from 21:00 UTC to 01:00 UTC THEN the System SHALL disable all new entries and allow position management only
7. WHEN session transition occurs THEN the System SHALL emit SESSION_CHANGE event with new session type and key reference levels

### Requirement 3: The Inefficiency Mapper (Gap Theory & Order Blocks)

**User Story:** As a trader, I want to place limit orders in price voids before price gets there, so that I capture institutional rebalancing.

#### Acceptance Criteria

1. WHEN detecting Fair Value Gap THEN the System SHALL identify 3-candle pattern where Candle 1 high is below Candle 3 low for Bullish FVG or Candle 1 low is above Candle 3 high for Bearish FVG
2. WHEN FVG is identified THEN the System SHALL calculate FVG midpoint at 50 percent of gap range and mark as high-probability entry zone
3. WHEN detecting Order Block THEN the System SHALL identify last down-candle before bullish BOS for Bullish OB or last up-candle before bearish BOS for Bearish OB
4. WHEN Order Block is identified THEN the System SHALL store OB High, OB Low, bar timestamp, and mark as institutional accumulation/distribution zone
5. WHEN price approaches POI THEN the System SHALL place Phantom Limit Order at FVG midpoint or OB top/bottom as internal trigger
6. WHEN POI is mitigated by 100 percent fill THEN the System SHALL remove POI from active list
7. WHEN multiple POIs align within 0.5 percent price range THEN the System SHALL increase entry confidence by 25 points

### Requirement 4: The Order Flow X-Ray (CVD Absorption Detection)

**User Story:** As a trader, I need to know if a support level is real or if it will break. CVD tells me if buyers are actually stepping in.

#### Acceptance Criteria

1. WHEN price hits POI THEN the System SHALL monitor tick-level CVD for absorption signature
2. WHEN detecting absorption THEN the System SHALL require price makes Lower Low into POI and CVD makes Higher Low
3. WHEN absorption signature is confirmed THEN the System SHALL mark POI as VALIDATED and increase entry confidence by 30 points
4. WHEN price hits POI without absorption THEN the System SHALL mark POI as WEAK and reduce entry confidence by 20 points
5. WHEN CVD shows distribution at resistance THEN the System SHALL require price makes Higher High and CVD makes Lower High for short setup
6. WHEN absorption validation completes THEN the System SHALL emit CVD_ABSORPTION event with price level, CVD delta, and confidence adjustment
7. WHEN System executes 15-minute entry THEN the System SHALL require absorption signature is present to filter out catching-the-knife losses

### Requirement 5: The Cartographer (Fractal Engine)

**User Story:** As a strategist, I want the system to mathematically define market structure without subjective drawing.

#### Acceptance Criteria

1. WHEN processing candles THEN the System SHALL identify Fractals using Bill Williams definition where High is surrounded by 2 lower highs on each side
2. WHEN Swing Point is breached by candle close THEN the System SHALL mark Break of Structure
3. WHEN BOS occurs in opposite direction of prevailing trend THEN the System SHALL mark Market Structure Shift
4. WHEN calculating Dealing Range THEN the System SHALL identify active trading range between current Swing High and Swing Low
5. WHEN Dealing Range is calculated THEN the System SHALL split into Premium zone above 0.5 Fibonacci and Discount zone below 0.5 Fibonacci
6. WHEN analyzing symbol THEN the System SHALL run fractal calculation independently for Daily timeframe, 4-Hour timeframe, and 15-minute timeframe
7. WHEN fractal calculation completes THEN the System SHALL store Swing High price, Swing Low price, bar index, timestamp, and Premium/Discount thresholds for each timeframe

### Requirement 6: Relative Strength (RS) Filtering

**User Story:** As a trader, I want to be in the strongest asset, so that I outperform the market beta.

#### Acceptance Criteria

1. WHEN scanning symbols THEN the System SHALL calculate Relative Strength vs BTC over last 4 hours
2. WHEN calculating RS Score THEN the System SHALL use formula RS_Score equals Asset percent change minus BTC percent change
3. WHEN attempting Long entry THEN the System SHALL require RS_Score greater than 0
4. WHEN attempting Short entry THEN the System SHALL require RS_Score less than 0
5. WHEN RS Score is calculated THEN the System SHALL store Asset percent change, BTC percent change, and RS Score for display
6. WHEN RS Score changes by more than 2 percent THEN the System SHALL emit RS_FLIP event
7. WHEN symbol fails RS filter THEN the System SHALL reject signal and log RS_FILTER_REJECT message

### Requirement 7: Execution (Passive Aggression)

**User Story:** As a trader in Bulgaria, I want to use Limit Orders at Order Blocks, so that I pay Maker fees and ignore latency.

#### Acceptance Criteria

1. WHEN signal is confirmed THEN the System SHALL place Post-Only Limit Order at Order Block top for Longs or Order Block bottom for Shorts
2. WHEN order is not filled within 60 seconds AND price moves away by more than 0.2 percent THEN the System SHALL cancel order and log PRICE_MOVED_AWAY
3. WHEN price wicks through Order Block by more than 0.5 percent THEN the System SHALL cancel order and log LEVEL_FAILED
4. WHEN calculating position size THEN the System SHALL use Volatility-Adjusted Sizing with formula Risk dollars divided by ATR times Stop Distance Multiplier
5. WHEN order is filled THEN the System SHALL set stop loss at 1.5 percent from entry and target at 4.5 percent from entry for 3 to 1 risk-reward ratio
6. WHEN order placement fails THEN the System SHALL retry maximum 2 times with 1 second delay between attempts
7. WHEN all retry attempts fail THEN the System SHALL log EXECUTION_FAILED and move to next signal

### Requirement 8: The Hunter HUD (Institutional Dashboard)

**User Story:** As a trader, I want to visualize the holographic alignment and active POIs in a strategic map format.

#### Acceptance Criteria

1. WHEN displaying UI THEN the System SHALL show Holographic Map table with columns Symbol, 1D Bias, 4H Location, 15m Trigger, Session, and Status
2. WHEN displaying alignment THEN the System SHALL color-code Green for A+ Setup, Yellow for B Setup, Red for Veto, and Gray for No Play
3. WHEN displaying active trade THEN the System SHALL show Narrative with Daily bias and 4H location, Setup with POI type and price, Confirmation with session event and CVD status, Execution with fill price, and Target with weak high/low
4. WHEN displaying POIs THEN the System SHALL show active Order Blocks and FVGs with distance from current price and confidence score
5. WHEN displaying session status THEN the System SHALL show current session type, time remaining in session, and Asian/London reference levels
6. WHEN displaying position status THEN the System SHALL show open positions with entry price, current P&L, stop/target levels, and time in trade
7. WHEN user presses F2 key THEN the System SHALL toggle between MICRO view with top 5 symbols and FULL view with top 20 symbols

### Requirement 9: Hologram Scanning Engine

**User Story:** As a trader, I want the system to continuously scan for alignment opportunities across all symbols.

#### Acceptance Criteria

1. WHEN Hologram Scan runs THEN the System SHALL fetch Daily, 4-Hour, and 15-minute OHLCV data for top 100 symbols by volume
2. WHEN Hologram Scan completes THEN the System SHALL rank symbols by Alignment Score from 0 to 100
3. WHEN calculating Alignment Score THEN the System SHALL assign 50 points for Daily-4H agreement, 30 points for 4H-15m agreement, and 20 points for RS Score magnitude
4. WHEN Alignment Score exceeds 80 THEN the System SHALL mark symbol as A+ ALIGNMENT
5. WHEN Alignment Score is between 60 and 80 THEN the System SHALL mark symbol as B ALIGNMENT
6. WHEN Alignment Score is below 60 THEN the System SHALL mark symbol as NO ALIGNMENT
7. WHEN Hologram Scan duration exceeds 30 seconds THEN the System SHALL emit SCAN_SLOW warning

### Requirement 10: Liquidity Pool Detection

**User Story:** As a trader, I want to identify where stop losses are clustered, so I can anticipate liquidity sweeps.

#### Acceptance Criteria

1. WHEN mapping structure THEN the System SHALL estimate Liquidity Pools at old Swing Highs and old Swing Lows
2. WHEN calculating Pool Strength THEN the System SHALL use Age measured as time since creation and Volume at pivot bar
3. WHEN price sweeps Liquidity Pool THEN the System SHALL check for CVD Divergence where high volume occurs with minimal price displacement
4. WHEN Sweep with CVD Divergence occurs THEN the System SHALL trigger SFP_SETUP signal
5. WHEN Liquidity Pool is swept THEN the System SHALL mark pool as MITIGATED and remove from active pools
6. WHEN Liquidity Pool age exceeds 72 hours THEN the System SHALL reduce Pool Strength by 50 percent
7. WHEN multiple Liquidity Pools exist within 1 percent price range THEN the System SHALL merge pools and sum Pool Strength

### Requirement 11: Multi-Timeframe Data Management

**User Story:** As a developer, I want efficient multi-timeframe data fetching to minimize API calls.

#### Acceptance Criteria

1. WHEN fetching multi-timeframe data THEN the System SHALL cache OHLCV data for 5 minutes
2. WHEN cache is valid THEN the System SHALL return cached data without API call
3. WHEN cache is stale THEN the System SHALL fetch fresh data and update cache
4. WHEN API rate limit is approached THEN the System SHALL queue requests and throttle to 10 requests per second
5. WHEN API call fails THEN the System SHALL retry maximum 3 times with exponential backoff
6. WHEN multiple symbols require data THEN the System SHALL batch requests where exchange API supports batch endpoints
7. WHEN data fetch duration exceeds 5 seconds THEN the System SHALL emit DATA_FETCH_SLOW warning

### Requirement 12: Position Management

**User Story:** As a trader, I want automated position management with trailing stops and partial profit-taking.

#### Acceptance Criteria

1. WHEN position reaches 1.5 R profit THEN the System SHALL move stop loss to breakeven
2. WHEN position reaches 2 R profit THEN the System SHALL take 50 percent profit and trail remaining position
3. WHEN trailing stop is active THEN the System SHALL update stop loss to highest close minus 1 ATR for Longs or lowest close plus 1 ATR for Shorts
4. WHEN position is open for more than 48 hours THEN the System SHALL tighten stop loss to 0.5 ATR
5. WHEN position hits stop loss THEN the System SHALL close position and log STOP_HIT with entry price, exit price, and loss percentage
6. WHEN position hits target THEN the System SHALL close position and log TARGET_HIT with entry price, exit price, and profit percentage
7. WHEN emergency flatten is triggered THEN the System SHALL close all positions immediately with Market Orders

### Requirement 13: Correlation-Based Position Limits

**User Story:** As a trader, I want to avoid overexposure to correlated assets, so that I don't have hidden concentration risk.

#### Acceptance Criteria

1. WHEN calculating correlation THEN the System SHALL compute 24-hour rolling correlation between all open positions and candidate symbol
2. WHEN correlation exceeds 0.7 with any open position THEN the System SHALL reduce position size by 50 percent
3. WHEN correlation exceeds 0.85 with any open position THEN the System SHALL reject signal and log CORRELATION_REJECT message
4. WHEN multiple positions have correlation above 0.5 THEN the System SHALL calculate total correlated exposure and cap at 40 percent of equity
5. WHEN BTC correlation exceeds 0.9 for all top 10 symbols THEN the System SHALL mark market as HIGH_BETA and reduce all position sizes by 30 percent
6. WHEN correlation matrix updates THEN the System SHALL emit CORRELATION_UPDATED event with correlation heatmap
7. WHEN user views correlation panel THEN the System SHALL display correlation matrix for all open positions and watchlist symbols

### Requirement 14: Drawdown Protection

**User Story:** As a trader, I want automatic drawdown protection to preserve capital during adverse conditions.

#### Acceptance Criteria

1. WHEN daily drawdown exceeds 3 percent THEN the System SHALL reduce position sizes by 50 percent
2. WHEN daily drawdown exceeds 5 percent THEN the System SHALL halt all new entries and manage existing positions only
3. WHEN daily drawdown exceeds 7 percent THEN the System SHALL emergency flatten all positions and pause trading for 24 hours
4. WHEN weekly drawdown exceeds 10 percent THEN the System SHALL reduce max leverage from 5x to 3x
5. WHEN 3 consecutive losing trades occur THEN the System SHALL reduce position sizes by 30 percent for next 3 trades
6. WHEN win rate drops below 40 percent over last 20 trades THEN the System SHALL emit STRATEGY_DEGRADATION warning and suggest parameter review
7. WHEN drawdown protection activates THEN the System SHALL log DRAWDOWN_PROTECTION event with current equity, drawdown percentage, and action taken

### Requirement 15: Multi-Symbol Portfolio Management

**User Story:** As a trader scaling capital, I want to manage multiple positions simultaneously with proper risk allocation.

#### Acceptance Criteria

1. WHEN calculating total exposure THEN the System SHALL sum notional value of all open positions and cap at 200 percent of equity for 5x max leverage
2. WHEN opening new position THEN the System SHALL ensure total open positions do not exceed 5 concurrent trades
3. WHEN allocating risk per trade THEN the System SHALL use formula Risk_Per_Trade equals Equity times Risk_Percent divided by Number_Of_Open_Positions
4. WHEN multiple A+ Alignment signals occur simultaneously THEN the System SHALL rank by Alignment Score and RS Score and select top 3
5. WHEN portfolio heat exceeds 15 percent THEN the System SHALL reject new signals until existing positions close or hit breakeven
6. WHEN all open positions are in same direction THEN the System SHALL reduce position sizes by 20 percent to account for directional bias risk
7. WHEN portfolio P&L updates THEN the System SHALL display total equity, total P&L percentage, and individual position contributions

### Requirement 16: Signal Execution Logging

**User Story:** As a trader, I want all signals and executions logged in queryable format, so that I can analyze performance and refine strategies.

#### Acceptance Criteria

1. WHEN System generates signal THEN the System SHALL append signal data to trades.jsonl file as single JSON object per line
2. WHEN System logs signal THEN the System SHALL include timestamp, symbol, strategy type, confidence, leverage, entry price, stop price, target price, alignment state, RS score, session type, POI type, and CVD status
3. WHEN System executes order THEN the System SHALL append execution data to trades.jsonl file with fill price, fill timestamp, order type, and slippage
4. WHEN System closes position THEN the System SHALL append close data to trades.jsonl file with exit price, exit timestamp, profit percentage, close reason, and hold time
5. WHEN log file size exceeds 10 megabytes THEN the System SHALL rotate log file with timestamp suffix
6. WHEN log file age exceeds 30 days THEN the System SHALL compress log file to gzip format
7. WHEN user queries logs THEN the System SHALL support jq command-line tool for JSON filtering

### Requirement 17: Backtesting & Forward Testing Engine

**User Story:** As a trader, I want to validate the strategy on historical data before risking real capital.

#### Acceptance Criteria

1. WHEN running backtest THEN the System SHALL fetch historical OHLCV data for specified date range and symbols
2. WHEN simulating trades THEN the System SHALL apply realistic slippage model with 0.1 percent for Post-Only fills and 0.2 percent for IOC fills
3. WHEN simulating trades THEN the System SHALL apply fee model with minus 0.01 percent for Maker fills and plus 0.05 percent for Taker fills
4. WHEN calculating backtest results THEN the System SHALL report total return, win rate, profit factor, max drawdown, Sharpe ratio, and trade count
5. WHEN backtest completes THEN the System SHALL generate equity curve chart and drawdown chart
6. WHEN backtest identifies losing periods THEN the System SHALL analyze correlation with market conditions and suggest parameter adjustments
7. WHEN forward testing THEN the System SHALL run strategy in paper trading mode with live data and log all signals without executing real orders

### Requirement 18: Runtime Configuration

**User Story:** As a trader, I want to modify strategy parameters during runtime, so that I can adapt to changing market conditions without restart.

#### Acceptance Criteria

1. WHEN user presses F1 key THEN the System SHALL display configuration panel overlay
2. WHEN user configures alignment settings THEN the System SHALL allow adjustment of Daily weight between 30 percent and 60 percent, 4H weight between 20 percent and 40 percent, and 15m weight between 10 percent and 30 percent
3. WHEN user configures RS settings THEN the System SHALL allow adjustment of RS threshold between 0 percent and 5 percent and RS lookback period between 2 hours and 8 hours
4. WHEN user configures risk settings THEN the System SHALL allow adjustment of max leverage between 3x and 5x, stop loss percentage between 1 percent and 3 percent, and target percentage between 3 percent and 6 percent
5. WHEN user configures portfolio settings THEN the System SHALL allow adjustment of max concurrent positions between 3 and 8, max portfolio heat between 10 percent and 20 percent, and correlation threshold between 0.6 and 0.9
6. WHEN user saves configuration THEN the System SHALL write configuration to config.json file and apply changes immediately
7. WHEN user cancels configuration THEN the System SHALL discard changes and return to dashboard
8. WHEN configuration file is corrupted THEN the System SHALL load default configuration and log CONFIG_CORRUPTED warning

## Success Metrics (Phase 2 Specific)

### Capital Growth Targets
1. **Primary Goal**: Achieve $2,500 → $50,000 growth (20x) within 6-12 months
2. **Monthly Target**: 30-40% monthly returns (compounding)
3. **Minimum Viable**: $2,500 → $10,000 (4x) within 3 months to validate strategy

### Performance Metrics
4. **Win Rate**: Maintain minimum 55% win rate on A+ Alignment signals (target: 65%)
5. **Risk-Reward**: Achieve average 3:1 R:R on winning trades (target: 4:1)
6. **Profit Factor**: Maintain profit factor > 2.0 (gross profit / gross loss)
7. **Sharpe Ratio**: Achieve Sharpe ratio > 1.5 (risk-adjusted returns)
8. **Max Drawdown**: Keep maximum drawdown < 15% (target: < 10%)
9. **Recovery Time**: Recover from drawdowns within 5 trading days

### Operational Metrics
10. **Scan Performance**: Hologram scan < 30 seconds for 100 symbols
11. **Signal Quality**: Generate minimum 2 A+ Alignment signals per day (target: 3-5)
12. **Signal Accuracy**: A+ Alignment signals should have 65%+ win rate vs 55% for B Alignment
13. **Fee Efficiency**: Maintain net profit after fees > 0 on 80% of trades (Post-Only Maker rebates)
14. **Fill Rate**: Achieve 85%+ fill rate on Post-Only orders within 60 seconds
15. **Slippage**: Keep average slippage < 0.1% (Post-Only at Order Blocks)

### Risk Metrics
16. **Position Sizing**: Average position size should be 15-25% of equity (3-5x leverage)
17. **Correlation**: Keep average correlation between open positions < 0.6
18. **Portfolio Heat**: Maintain average portfolio heat at 10-12% (max 15%)
19. **Consecutive Losses**: No more than 3 consecutive losing trades before parameter review
20. **Daily Loss Limit**: Never exceed 5% daily drawdown (hard stop at 7%)

### Comparison to Phase 1
- **Lower Frequency**: 2-5 trades/day vs 10-20 trades/day (Phase 1)
- **Higher Win Rate**: 55-65% vs 45-50% (Phase 1)
- **Better R:R**: 3:1 vs 8:1 (Phase 1 has higher R:R but lower win rate, Phase 2 has balanced approach)
- **Lower Leverage**: 3-5x vs 15-20x (Phase 1)
- **Longer Hold Time**: 1-3 days vs 5-30 minutes (Phase 1)
- **Fee Advantage**: Maker rebates (-0.01%) vs Taker fees (+0.05%) in Phase 1

## Out of Scope (Future Phases)

### Phase 3 (Sentinel) - Separate Spec Required
- Weekly and Monthly timeframe regime filtering
- Funding rate arbitrage
- Systematic portfolio management
- 1x-2x leverage with wealth preservation
- $50,000+ capital allocation

### Phase 4 (AI Quant) - Separate Spec Required
- Machine learning model integration
- Adaptive parameter optimization
- Sentiment analysis from news/social
- Multi-strategy portfolio optimization
- Advanced risk management with VaR/CVaR

### Titan Brain Orchestrator - Separate Spec Required
- Automatic phase switching based on equity
- Multi-phase portfolio management
- Risk allocation across phases
- Performance analytics and reporting
