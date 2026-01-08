# Titan Phase 2 - The Hunter (Institutional-Grade)

## Philosophy: Holographic Market Structure Engine

**"We don't trade trends. We trade the Manipulation Phase of the AMD (Accumulation-Manipulation-Distribution) cycle. We identify where institutional algorithms are forced to inject liquidity, and we position ourselves to capture the subsequent distribution."**

### The Bulgaria Reality

With 200ms latency to Tokyo, we cannot compete on tick arbitrage. Instead, we use **Post-Only Limit Orders** at pre-calculated Order Blocks, earning Maker rebates while institutional algorithms come to us.

### The Capital Scaling Problem

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

## The Holographic Architecture

### Five-Layer System

```
┌─────────────────────────────────────────────────────────────────┐
│              Hunter HUD (Ink + React)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Holographic  │  │ Active Trade │  │   POI Map            │   │
│  │ Map (Top 20) │  │ (Narrative)  │  │   (OB/FVG/Pools)     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│  [F1] CONFIG  [F2] VIEW  [SPACE] PAUSE  [Q] QUIT                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│           Layer 1: The Cartographer (Fractal Engine)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Daily Bias   │  │ 4H Structure │  │   15m Trigger        │   │
│  │ (Trend Dir)  │  │ (Prem/Disc)  │  │   (MSS)              │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                    Output: Fractal State (3 TFs)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Layer 2: The Hologram (Alignment Logic)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Veto Logic   │  │ Score Calc   │  │   State Vector       │   │
│  │ (Prem/Disc)  │  │ (Weighted)   │  │   (A+/B/Conflict)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: Hologram State (0-100 score)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Layer 3: The Session Profiler (Time & Price)             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Asian Range  │  │ Judas Swing  │  │   Killzone Filter    │   │
│  │ (Ref Levels) │  │ (Liquidity)  │  │   (London/NY)        │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: Session State + Ref Levels                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Layer 4: The Inefficiency Mapper (POI Detection)         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ FVG Scanner  │  │ OB Detector  │  │   Liquidity Pools    │   │
│  │ (3-Candle)   │  │ (Last Opp)   │  │   (Volume Profile)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: Active POIs with confidence                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Layer 5: The Flow Validator (CVD X-Ray)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Tick CVD     │  │ Absorption   │  │   Distribution       │   │
│  │ (Buy-Sell)   │  │ (Divergence) │  │   (Divergence)       │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: CVD Validation (±30 confidence)            │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

1. **The Cartographer (Fractal Engine)**: Mathematically defines market structure using Bill Williams fractals across 3 timeframes
2. **The Hologram (Alignment Logic)**: Combines Daily (Bias), 4H (Narrative), and 15m (Trigger) into a single state vector with veto logic
3. **The Session Profiler**: Exploits the "Judas Swing" (false moves) at London/NY opens to catch manipulation-to-distribution transitions
4. **The Inefficiency Mapper**: Identifies Fair Value Gaps and Order Blocks as high-probability entry zones
5. **The Flow Validator (CVD X-Ray)**: Confirms reversals by detecting limit order absorption of aggressive selling
6. **The Sniper (Execution)**: Uses Post-Only Limit Orders at Order Blocks, neutralizing Bulgaria latency

## Why This Wins for Bulgaria (200ms latency)

- We use **Limit Orders (Post-Only)** that rest on the order book at Order Blocks, earning Maker rebates
- We don't care about 200ms lag because our order is **waiting** at a pre-calculated level for price to come to us
- We trade **structural manipulation** (hours to days), not tick arbitrage (milliseconds)
- We enter during **Killzones** (London/NY open) when institutional flow provides follow-through
- We filter for **Relative Strength** to ensure we're in the strongest asset (alpha, not beta)
- We validate with **CVD Absorption** to confirm institutional participation

## Key Concepts

### AMD Cycle
**Accumulation-Manipulation-Distribution** cycle that occurs daily at session opens. We trade the Manipulation → Distribution transition.

### Holographic State
The composite state of a symbol derived from 3 timeframes (Daily, 4H, 15m) with weighted scoring and veto logic:
- **A+ Alignment**: Full confluence across all 3 timeframes (Daily bias, 4H structure in discount/premium, 15m trigger with MSS, CVD confirmation)
- **B Alignment**: Partial confluence (2 out of 3 timeframes agree) - tradeable but lower confidence
- **Conflict State**: Timeframes disagree (Daily bullish, 4H bearish) - no trading allowed

### Points of Interest (POI)
Mathematically defined support/resistance where institutional orders rest:
- **Fair Value Gaps (FVG)**: 3-candle imbalance where price gaps, leaving unfilled orders
- **Order Blocks (OB)**: Last opposite-colored candle before a BOS, representing institutional accumulation/distribution
- **Liquidity Pools**: Estimated clusters of stop losses at old Swing Highs/Lows

### CVD Absorption
When price makes Lower Low but CVD makes Higher Low, indicating limit buy orders are absorbing market sells (reversal signal).

### Session Profiling
- **Asian Session** (00:00-06:00 UTC): Accumulation phase, establishes reference range
- **London Session** (07:00-10:00 UTC): Manipulation phase, Judas Swing opportunities
- **NY Session** (13:00-16:00 UTC): Distribution phase, follow-through moves
- **Dead Zone** (21:00-01:00 UTC): No new entries, position management only

## Target Performance

### Capital Growth
- **Primary Goal**: $2,500 → $50,000 (20x) within 6-12 months
- **Monthly Target**: 30-40% monthly returns (compounding)
- **Minimum Viable**: $2,500 → $10,000 (4x) within 3 months

### Performance Metrics
- **Win Rate**: 55-65% on A+ Alignment signals
- **Risk-Reward**: 3:1 R:R (1.5% stop, 4.5% target)
- **Profit Factor**: > 2.0
- **Max Drawdown**: < 15%
- **Sharpe Ratio**: > 1.5

### Operational Metrics
- **Trade Frequency**: 2-5 trades/day
- **Hold Time**: 1-3 days per trade
- **Leverage**: 3-5x (vs 15-20x in Phase 1)
- **Position Size**: 15-25% of equity per trade
- **Fee Advantage**: Maker rebates (-0.01%) vs Taker fees (+0.05%)

## Installation

1. **Clone and Navigate**:
   ```bash
   cd services/titan-phase2-hunter
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Build and Run**:
   ```bash
   npm run build
   npm start
   ```

## Development

- **Development Mode**: `npm run dev`
- **Run Tests**: `npm test`
- **Watch Tests**: `npm run test:watch`
- **Coverage**: `npm run test:coverage`
- **Lint**: `npm run lint:check`
- **Format**: `npm run format:write`

## Architecture

The system follows a modular architecture with clear separation of concerns:

```
src/
├── engine/              # Core logic engines
│   ├── FractalMath.ts      # Pure fractal calculations
│   ├── HologramEngine.ts   # Multi-timeframe state machine
│   ├── SessionProfiler.ts  # Time-based logic
│   ├── InefficiencyMapper.ts # POI detection
│   └── CVDValidator.ts     # Order flow confirmation
├── exchanges/           # Exchange clients
│   ├── BinanceSpotClient.ts # CVD data source
│   └── BybitPerpsClient.ts  # Execution target
├── execution/           # Execution layer
│   ├── LimitOrderExecutor.ts # The Sniper
│   └── SignalGenerator.ts    # Signal logic
├── risk/               # Risk management
│   ├── PositionManager.ts    # Position lifecycle
│   ├── CorrelationManager.ts # Portfolio correlation
│   ├── DrawdownProtector.ts  # Drawdown limits
│   └── PortfolioManager.ts   # Multi-symbol management
├── console/            # Terminal UI
│   ├── HunterHUD.tsx        # Main dashboard
│   ├── HolographicMap.tsx   # Symbol alignment view
│   ├── ActiveTrade.tsx      # Current position view
│   └── POIMap.tsx           # Points of interest
├── config/             # Configuration
│   ├── ConfigManager.ts     # Runtime config
│   └── CredentialManager.ts # Encrypted credentials
├── events/             # Event system
│   └── EventEmitter.ts      # Event coordination
├── logging/            # Logging
│   └── Logger.ts            # JSONL logging
└── backtest/           # Validation
    ├── BacktestEngine.ts    # Historical validation
    └── ForwardTestMode.ts   # Paper trading
```

## Integration with Titan System

Phase 2 integrates with the broader Titan ecosystem:

- **Shared Infrastructure**: Uses WebSocketManager, ExecutionService, and TelemetryService
- **Brain Coordination**: Reports to Titan Brain for capital allocation and risk management
- **Phase Transitions**: Automatically transitions to Phase 3 at $50,000 capital
- **AI Optimization**: Receives parameter updates from Phase 4 AI Quant

## Risk Management

Multi-layered risk management system:

1. **Position Level**: 1.5% stop loss, 4.5% target (3:1 R:R)
2. **Daily Level**: 3%/5%/7% drawdown thresholds with position size reduction
3. **Portfolio Level**: Max 5 concurrent positions, 15% total heat
4. **Correlation Level**: Max 0.7 correlation between positions
5. **Global Level**: Brain can override and emergency flatten

## Keyboard Shortcuts

- **F1**: Configuration panel
- **F2**: Toggle MICRO/FULL view
- **SPACE**: Pause/Resume scanning
- **Q**: Quit application

## Troubleshooting

### Common Issues

1. **WebSocket Disconnections**: Check internet connection and API credentials
2. **Order Failures**: Verify Bybit API permissions and account balance
3. **Slow Hologram Scan**: Reduce symbol count or increase scan interval
4. **High Memory Usage**: Restart application or reduce data retention

### Logs

All activity is logged to `trades.jsonl` in JSONL format for analysis:

```bash
tail -f logs/trades.jsonl | jq .
```

## License

MIT License - See LICENSE file for details.

---

**Remember**: "We don't chase price. We let price come to us at pre-calculated levels where institutional algorithms are forced to provide liquidity."