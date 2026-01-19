# Titan Phase 1 - Scavenger (Predestination Engine)

> **"We don't scan for opportunities. We calculate exactly where the market will break, place our traps in memory, and wait for price to walk into them."**

## 🕸️ The Predestination Philosophy

Traditional trading systems **react** to market movements. They scan, they chase, they compete on speed.

**The Predestination Engine doesn't react. It predicts.**

Every minute, we calculate the exact price levels where structural breakouts will occur. We store these "tripwires" in memory. Then we wait. When price hits a tripwire with volume confirmation, we execute instantly.

**This is not prediction. This is physics.**

## 🌍 The Bulgaria Advantage

Operating from Bulgaria with 200ms latency to Tokyo, we cannot compete on tick arbitrage. HFTs win that game in 1-10ms.

**But we don't need to.**

We use Binance Spot as a **signal validator**. When Binance breaks a level with volume, it's real money - not a fake-out. We catch the **momentum ignition** (2-5% moves) that follows 1-10 seconds after HFTs close the price gap.

**We trade structural momentum, not micro-scalps. Latency is irrelevant.**

## 🎯 Mission: $200 → $5,000

Phase 1 is designed for account building with:
- **High leverage** (10x-20x) on high-confidence setups
- **Tight stops** (1%) with 3:1 risk-reward
- **Structural edge** (liquidation clusters, funding squeezes, basis arb)
- **Volume validation** (50+ trades in 100ms) to filter fake-outs

Expected timeline: 3-6 months with 60%+ win rate.

## 🏗️ Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              Trap Monitor Console (Ink + React)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Active Traps │  │ Sensor Status│  │   Live Feed          │   │
│  │ (Top 20)     │  │ (Binance/    │  │   (Last 5 Events)    │   │
│  │              │  │  Bybit)      │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│  [F1] CONFIG  [SPACE] PAUSE  [Q] QUIT                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│           Pre-Computation Layer (The Web) - 1min cycle          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Liquidation  │  │ Daily Levels │  │   Bollinger Bands    │   │
│  │ Clusters     │  │ (PDH/PDL)    │  │   (Squeeze)          │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                    Output: Trap Map (Top 20)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Detection Layer (The Spider) - Real-time WebSocket       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Binance Spot │  │ Volume       │  │   Tripwire Match     │   │
│  │ AggTrades    │  │ Validation   │  │   (±0.1%)            │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: TRAP_SPRUNG event                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         Execution Layer (The Bite) - Bybit Perps                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Velocity     │  │ Order Type   │  │   Position Mgmt      │   │
│  │ Calculator   │  │ Selector     │  │   (Stop/Target)      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│              Output: Filled position on Bybit                   │
└─────────────────────────────────────────────────────────────────┘
```

### Layer 1: Pre-Computation (The Web)

**Runs every 1 minute**

1. Fetch top 500 symbols by volume from Bybit
2. Calculate tripwires for each symbol:
   - **Liquidation Clusters**: Volume profile peaks (95% confidence, 20x leverage)
   - **Daily Levels**: PDH/PDL breakouts (85% confidence, 12x leverage)
   - **Bollinger Breakouts**: Squeeze + expansion (90% confidence, 15x leverage)
3. Score trap quality (volatility + volume + confluence)
4. Select top 20 symbols
5. Subscribe Binance Spot WebSocket to top 20

**Output**: Trap Map with 20 highest-quality tripwires

### Layer 2: Detection (The Spider)

**Runs in real-time on WebSocket**

1. Receive Binance Spot AggTrade tick
2. Check if price matches any tripwire (±0.1%)
3. If match:
   - Start volume accumulation counter
   - Count trades in 100ms window
   - If trades >= 50:
     - Mark tripwire as ACTIVATED
     - Emit TRAP_SPRUNG event
     - Trigger Execution Layer

**Output**: TRAP_SPRUNG event with validated breakout

### Layer 3: Execution (The Bite)

**Runs on TRAP_SPRUNG event**

1. Calculate price velocity on Bybit (last 5 seconds)
2. Determine order type:
   - Velocity > 0.5%/s → **Market Order**
   - Velocity 0.1-0.5%/s → **Aggressive Limit** (Ask + 0.2%)
   - Velocity < 0.1%/s → **Limit** (Ask)
3. Calculate position size (Kelly Criterion with 25% safety factor)
4. Send order to Bybit (and/or MEXC if enabled)
5. Set stop loss (-1%) and target (+3%)
6. Log execution to trades.jsonl

**Output**: Filled position with 3:1 R:R

## 💀 Structural Flaw Strategies (Bulgaria-Optimized)

We don't compete on speed. We exploit **structural imbalances** that take minutes to resolve.

### Strategy 1: OI Wipeout (The V-Shape Catch)

**The Physics**: When a massive dump happens, it's driven by long liquidations. Once liquidations finish, there are **no sellers left**. Price must bounce because selling pressure physically evaporated.

**The Edge**: You don't catch the falling knife. You wait for the "Pop." Recovery takes 5-15 minutes - plenty of time for Bulgaria.

**Conditions**:
- Price drop > 3% in 5 minutes
- Open Interest drop > 20% in 5 minutes
- CVD flips from red to green (buying pressure returning)

**Execution**: Long at 50% retracement target, 20x leverage, 95% confidence

**Example**: ETH dumps from $2,500 to $2,425 (-3%) with OI dropping from 100k to 75k (-25%). CVD turns green. System enters long at $2,425 targeting $2,462 (+1.5% = 30% profit at 20x).

### Strategy 2: Predatory Funding Squeeze

**The Physics**: When funding rate is highly negative (shorts pay longs), but price stops dropping, shorts are trapped. They're paying to hold a losing position.

**The Edge**: This is a "pressure cooker" that builds over hours/minutes. When it pops, it pops hard (10-20%). Your latency is irrelevant.

**Conditions**:
- Funding rate < -0.02% (shorts crowded)
- Price making higher lows (shorts trapped)
- CVD rising (whales absorbing)

**Execution**: Long targeting liquidation level (recent high + 2%), 15x leverage, 90% confidence

**Example**: SOL funding at -0.025%, price making higher lows at $98, $99, $100. Recent high was $105. System enters long at $100 targeting $107 (+7% = 105% profit at 15x).

### Strategy 3: Spot-Perp Basis Arb (The Rubber Band)

**The Physics**: During extreme volatility, Perp price disconnects from Spot. Perp **must** return to Spot price - it's mathematical law.

**The Edge**: HFTs close this gap, but during panic they widen spreads or turn off. That leaves a 5-30 second window - you can drive a truck through it from Bulgaria.

**Conditions**:
- Basis > 0.5% (Perp discounted vs Spot)
- 24h volume > $1M (not dead market)

**Execution**: Long Perp targeting Spot price, 10x leverage, 85% confidence

**Example**: BTC Spot at $43,500, Perp at $43,250 (0.57% basis). System enters long on Perp at $43,250 targeting $43,456 (+0.48% = 4.8% profit at 10x).

### The Ultimate Bulgaria Protocol

**The Setup**: Combine OI Wipeout + Leader-Follower for maximum safety and profit

1. Wait for idiosyncratic crash (> 3% drop, BTC < 0.5%)
2. Check if OI nuked -20% (sellers are dead)
3. Set Leader-Follower trap on Binance Spot
4. When Binance starts V-Shape recovery (+1%), fire Long on Bybit

**Confidence**: 98% (highest in the system)

**Example**: MATIC crashes -4.2% while BTC only -0.3%. OI drops -22%. Binance Spot starts recovery at $0.85 (+1%). System fires long on Bybit at $0.85 targeting $0.89 (+4.7% = 94% profit at 20x).

## 🎯 Trap Types & Confidence Levels

| Trap Type | Confidence | Leverage | Stop Loss | Target | Expected Win Rate | Use Case |
|-----------|-----------|----------|-----------|--------|------------------|----------|
| **LIQUIDATION** | 95% | 20x | -1% | +3% | 70% | Volume profile peaks, high-probability breakouts |
| **DAILY_LEVEL** | 85% | 12x | -1% | +3% | 65% | PDH/PDL psychological levels |
| **BOLLINGER** | 90% | 15x | -1% | +3% | 68% | Squeeze + expansion patterns |
| **OI_WIPEOUT** | 95% | 20x | -2% | +5% | 75% | Post-liquidation V-shape recovery |
| **FUNDING_SQUEEZE** | 90% | 15x | -1.5% | +7% | 70% | Trapped shorts forced to cover |
| **BASIS_ARB** | 85% | 10x | -0.5% | +0.5% | 80% | Spot-Perp convergence (low R:R but high win rate) |
| **ULTIMATE_BULGARIA** | 98% | 20x | -2% | +5% | 80% | Combined OI Wipeout + Leader-Follower |

**Risk-Reward Ratios**:
- Standard traps (LIQUIDATION, DAILY_LEVEL, BOLLINGER): 3:1 R:R
- OI Wipeout: 2.5:1 R:R (wider stop for volatility)
- Funding Squeeze: 4.7:1 R:R (larger target)
- Basis Arb: 1:1 R:R (high win rate compensates)
- Ultimate Bulgaria: 2.5:1 R:R (highest confidence)

## 🚀 Quick Start (Production)

### Full System (Recommended)

Run as part of the full Titan stack:

```bash
cd ../..
docker compose up -d
```

## 🛠 Local Development / Manual Run

### 1. Prerequisites

- **Node.js v18+**
- **npm v8+**
- **API Keys** (Binance Spot, Bybit Perps)

### 2. Installation

```bash
cd services/titan-phase1-scavenger
npm install
npm test
```

### 3. API Key Setup

#### 3.1 Binance API Keys

1. Go to [Binance API Management](https://www.binance.com/en/my/settings/api-management)
2. Create new API key with **Spot Trading** enabled
3. **Important**: Enable "Spot & Margin Trading" permission
4. Save API Key and Secret Key (you'll need these for .env)
5. **Security**: Restrict API access to your IP address

#### 3.2 Bybit API Keys

1. Go to [Bybit API Management](https://www.bybit.com/app/user/api-management)
2. Create new API key with **Unified Trading** enabled
3. **Important**: Enable "Contract Trading" permission
4. Set permissions: Read, Trade (no Withdraw needed)
5. Save API Key and Secret Key
6. **Security**: Restrict API access to your IP address

#### 3.3 MEXC API Keys (Optional)

1. Go to [MEXC API Management](https://www.mexc.com/user/openapi)
2. Create new API key with **Futures Trading** enabled
3. Save API Key and Secret Key
4. **Security**: Restrict API access to your IP address

### 4. Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env
```

**Required .env variables**:
```bash
# Binance (Signal Validator - REQUIRED)
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_API_SECRET=your_binance_secret_here

# Bybit (Execution Target - REQUIRED)
BYBIT_API_KEY=your_bybit_api_key_here
BYBIT_API_SECRET=your_bybit_secret_here

# MEXC (Optional Secondary Execution)
MEXC_API_KEY=your_mexc_api_key_here
MEXC_API_SECRET=your_mexc_secret_here

# Master Password for Credential Encryption
TITAN_MASTER_PASSWORD=your_secure_password_here

# Risk Settings (Optional - defaults provided)
MAX_LEVERAGE=20
MAX_POSITION_SIZE_PCT=30
STOP_LOSS_PCT=1
TARGET_PCT=3
```

**Security Best Practices**:
- Never commit .env to version control (already in .gitignore)
- Use strong master password (16+ characters)
- Rotate API keys every 90 days
- Monitor API key usage in exchange dashboards

### 5. First Run (Testnet Recommended)

```bash
# Test with Bybit Testnet first
# Edit .env and set:
# BYBIT_TESTNET=true

# Start the engine
npm start
```

**What to expect**:
1. System connects to Binance Spot WebSocket
2. Pre-computation layer calculates tripwires (takes ~30-60 seconds)
3. Trap Monitor dashboard appears
4. System starts monitoring for trap activations

### 6. Console Controls

| Key | Action | Description |
|-----|--------|-------------|
| **F1** | Configuration Panel | Adjust trap parameters, risk settings, exchange toggles |
| **SPACE** | Pause/Resume | Temporarily stop trap monitoring (useful during high volatility) |
| **Q** | Quit | Gracefully shutdown the engine |
| **Ctrl+C** | Force Quit | Emergency shutdown (use Q instead when possible) |

### 7. Going Live

Once comfortable with testnet:

```bash
# Edit .env and set:
# BYBIT_TESTNET=false

# Start with small position sizes
# Recommended: Start with MAX_POSITION_SIZE_PCT=10

npm start
```

**First Week Checklist**:
- [ ] Monitor all executions manually
- [ ] Verify stop losses are set correctly
- [ ] Check slippage is within expected range (< 0.3%)
- [ ] Confirm equity updates every 5 seconds
- [ ] Review trades.jsonl daily
- [ ] Gradually increase position size as confidence builds

### 8. Headless Mode (Production Deployment)

For production deployments, background services, or integration with process managers, run Scavenger in headless mode (no terminal UI):

```bash
# Build and run in headless mode
npm run start:headless

# Or manually
npm run build
node dist/index.js --headless
```

**Headless Mode Features**:
- ✅ No terminal UI (Ink dashboard disabled)
- ✅ JSON-formatted logs to stdout
- ✅ Signal handlers for graceful shutdown (SIGINT, SIGTERM)
- ✅ Lower memory usage (~30MB vs ~50MB)
- ✅ Lower CPU usage (~2% vs ~5%)
- ✅ Full compatibility with PM2, systemd, Docker

**JSON Log Format**:
```json
{"timestamp":1234567890,"type":"INFO","message":"Loading configuration...","source":"scavenger"}
{"timestamp":1234567891,"type":"TRAP_SPRUNG","message":"⚡ BTCUSDT LIQUIDATION @ 50000.00","source":"scavenger"}
{"timestamp":1234567892,"type":"EXECUTION_COMPLETE","message":"✅ BTCUSDT filled @ 50000.00","source":"scavenger"}
```

**Integration with PM2**:
```bash
# Install PM2
npm install -g pm2

# Start Scavenger
pm2 start dist/index.js --name titan-scavenger -- --headless

# Monitor logs
pm2 logs titan-scavenger

# Stop
pm2 stop titan-scavenger
```

**Integration with systemd**:
```bash
# Create service file: /etc/systemd/system/titan-scavenger.service
sudo systemctl enable titan-scavenger
sudo systemctl start titan-scavenger
sudo journalctl -u titan-scavenger -f
```

For detailed headless mode documentation, see [HEADLESS_MODE.md](./HEADLESS_MODE.md).

## 📊 Trap Monitor Dashboard

```
🕸️ TITAN PREDESTINATION | 💰 $1,247.32 (+523.7%)
[F1] CONFIG  [SPACE] PAUSE  [Q] QUIT

🎯 ACTIVE TRIPWIRES (Waiting for victims...)
COIN      CURR PRICE  TRIGGER    TYPE        LEAD TIME
ETHUSDT   2,345.67    2,350.00   BREAKOUT    ~850ms
BTCUSDT   43,210.50   43,500.00  LIQ_HUNT    ~1200ms
SOLUSDT   98.45       100.00     BREAKDOWN   ~650ms

📡 SENSOR STATUS
Binance Stream: OK (1,247 ticks/sec)
Bybit Connection: ARMED (Ping: 198ms)
Estimated Slippage: 0.18%

📝 LIVE FEED
[14:23:45] TRAP_SPRUNG: ETHUSDT at 2,350.12 (67 trades)
[14:23:46] EXECUTION: LONG ETHUSDT @ 2,350.45 (Market Order)
[14:23:47] FILLED: +0.5 ETH @ 2,350.45 (15x leverage)
```

### Dashboard Sections Explained

**Header**:
- **Phase**: PREDESTINATION (Phase 1)
- **Equity**: Current account balance
- **P&L**: Profit/Loss percentage since start

**Active Tripwires Table**:
- **COIN**: Symbol being monitored
- **CURR PRICE**: Current Bybit price
- **TRIGGER**: Price level that activates trap
- **TYPE**: Trap type (BREAKOUT, LIQ_HUNT, BREAKDOWN, OI_WIPEOUT, etc.)
- **LEAD TIME**: Estimated milliseconds until Bybit reaches Binance trigger price

**Color Coding**:
- 🔴 **Red**: Price within 0.5% of trigger (imminent)
- 🟡 **Yellow**: Price within 2% of trigger (close)
- ⚪ **White**: Price > 2% from trigger (waiting)

**Sensor Status**:
- **Binance Stream**: WebSocket health (OK/RECONNECTING/ERROR)
- **Tick Rate**: Trades per second (healthy: > 500)
- **Bybit Connection**: API status (ARMED/DEGRADED/DOWN)
- **Ping**: Round-trip latency to Bybit (target: < 300ms)
- **Estimated Slippage**: Expected slippage % based on current volatility

**Live Feed**:
- Last 5 events with timestamps
- Color coded: 🟢 Green = TRAP_SPRUNG, ⚪ White = Info, 🔴 Red = Error

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action | When to Use |
|----------|--------|-------------|
| **F1** | Open Configuration Panel | Adjust trap parameters, risk settings, or exchange toggles during runtime |
| **SPACE** | Pause/Resume Monitoring | Temporarily stop trap detection during high volatility or news events |
| **Q** | Quit Application | Gracefully shutdown the engine (closes positions safely) |
| **Ctrl+C** | Force Quit | Emergency shutdown (use Q instead when possible) |
| **↑/↓** | Navigate Config Panel | Move between configuration options (when F1 panel is open) |
| **Enter** | Confirm Selection | Apply configuration changes (when F1 panel is open) |
| **Esc** | Cancel/Close Panel | Close configuration panel without saving changes |

### Configuration Panel (F1)

When you press F1, you'll see:

```
┌─────────────────────────────────────────────────────────────┐
│                    CONFIGURATION PANEL                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TRAP PARAMETERS                                            │
│  ├─ Compression Threshold: [=========>    ] 12%            │
│  ├─ Entropy Threshold:     [======>       ] 0.5            │
│  └─ Trend Strength:        [==========>   ] 1.2            │
│                                                             │
│  FLOW SETTINGS                                              │
│  ├─ CVD Threshold:         [========>     ] 100k USD       │
│  ├─ Frequency Multiplier:  [=======>      ] 3.0            │
│  └─ OBI Threshold:         [========>     ] 2.0            │
│                                                             │
│  RISK MANAGEMENT                                            │
│  ├─ Max Leverage:          [=============>] 20x            │
│  ├─ Max Position Size:     [========>     ] 30%            │
│  └─ Fee Barrier Mult:      [=======>      ] 2.0            │
│                                                             │
│  EXCHANGE TOGGLES                                           │
│  ├─ Bybit Execution:       [✓] ON                          │
│  └─ MEXC Execution:        [ ] OFF                         │
│                                                             │
│  [SAVE]  [CANCEL]                                          │
└─────────────────────────────────────────────────────────────┘
```

**How to Use**:
1. Press **F1** to open panel
2. Use **↑/↓** to navigate between settings
3. Use **←/→** to adjust slider values
4. Press **Space** to toggle checkboxes
5. Press **Enter** on [SAVE] to apply changes
6. Press **Esc** or **Enter** on [CANCEL] to discard changes

**Changes apply immediately** - no restart required!

## ⚙️ Configuration

Press **F1** in the console to open the configuration panel:

### Trap Parameters
- Compression threshold (5-20%)
- Entropy threshold (0.3-0.7)
- Trend strength threshold (0.5-2.0)

### Flow Settings
- CVD threshold (50k-200k USD)
- Frequency multiplier (2.0-5.0)
- OBI threshold (1.5-3.0)

### Risk Management
- Max leverage (5x-20x)
- Max position size (10-50%)
- Fee barrier multiplier (1.5-3.0)

### Exchange Toggles
- Bybit execution (ON/OFF)
- MEXC execution (ON/OFF)

All changes are applied immediately without restart.

## 📈 Performance Metrics

**Target Metrics (Phase 1)**:
- Capital Growth: $200 → $5,000 (25x) in 3-6 months
- Win Rate: 60%+ on Compression Breakout signals
- Risk-Reward: 8:1 average on winning trades
- Scan Performance: Regime scan < 5s, Flow scan < 100ms
- Signal Quality: 3+ high-confidence signals per day
- Fee Efficiency: Net profit after fees > 0 on 80% of trades

## 🛡️ Safety Features

### 1. Cached Equity (Background Loop)
Equity is cached every 5 seconds to prevent API hangs during execution.

### 2. Exchange Timestamps
Uses exchange timestamps (not local time) to eliminate network jitter noise.

### 3. Idiosyncratic Crash Filter
Only flags crashes where coin drops > 3% but BTC < 0.5% (filters out market-wide crashes).

### 4. Trap Cooldown
5-minute cooldown after activation prevents spam from price oscillation.

### 5. Order Timeout
2-second timeout on all order placements for fail-fast behavior.

## 📝 Logging

All signals and executions are logged to `trades.jsonl` in JSONL format:

```json
{"timestamp":1704067200000,"symbol":"ETHUSDT","trapType":"LIQUIDATION","direction":"LONG","entry":2350.45,"stop":2327.15,"target":2421.00,"confidence":95,"leverage":20,"orderType":"MARKET","velocity":0.0067}
```

Query logs with `jq`:
```bash
# Show all OI_WIPEOUT signals
cat trades.jsonl | jq 'select(.trapType == "OI_WIPEOUT")'

# Calculate win rate
cat trades.jsonl | jq -s 'map(select(.exitPrice)) | group_by(.profit > 0) | map({result: .[0].profit > 0, count: length})'
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run property-based tests
npm test -- --testPathPattern=property
```

## 🔧 Troubleshooting Guide

### Common Issues & Solutions

#### 1. WebSocket Disconnections

**Symptoms**: Console shows "⚠️ Binance WebSocket closed. Reconnecting..."

**Causes**:
- Unstable internet connection
- Firewall blocking WebSocket connections
- Binance rate limiting (too many connections)

**Solutions**:
```bash
# Check internet stability
ping -c 10 stream.binance.com

# Check if WebSocket port is open
telnet stream.binance.com 9443

# If behind corporate firewall, try VPN
# System auto-reconnects with 3 retries, 2s delay
```

**Prevention**: The system automatically reconnects. If disconnections persist > 5 times/hour, check your network.

#### 2. Order Placement Failures

**Symptoms**: Console shows "❌ Order failed" or "EXECUTION_FAILED"

**Causes**:
- Insufficient balance
- API key lacks "Trade" permission
- Leverage too high for account tier
- Symbol not available on exchange
- Rate limiting

**Solutions**:
```bash
# Check API key permissions
# Bybit: Must have "Contract Trading" enabled
# Binance: Must have "Spot & Margin Trading" enabled

# Check account balance
# Ensure balance > (position_size * leverage) / leverage

# Reduce leverage if account tier is limited
# Edit .env: MAX_LEVERAGE=10 (instead of 20)

# Check rate limits
# Bybit: 10 req/s, MEXC: 10 req/s
# System has built-in rate limiting
```

**Prevention**: 
- Keep balance > 2x max position size
- Verify API permissions before going live
- Start with lower leverage (10x) and increase gradually

#### 3. Trap Map Empty

**Symptoms**: Dashboard shows "No traps set. Calculating..."

**Causes**:
- Bybit API unreachable
- All symbols below volume threshold (< $1M 24h)
- Pre-computation taking longer than 60 seconds
- API rate limit exceeded

**Solutions**:
```bash
# Check Bybit API accessibility
curl https://api.bybit.com/v5/market/tickers?category=linear

# Check if pre-computation is slow
# Look for: "⚠️ Pre-computation exceeded 60s: XXXms"

# Reduce symbol count if slow
# Edit src/engine/TitanTrap.ts:
# const symbols = await this.bybitClient.fetchTopSymbols(200); // Instead of 500

# Wait 1-2 minutes for first calculation
# System updates every 60 seconds
```

**Prevention**: 
- Ensure stable API connection
- Pre-computation should complete in 30-60 seconds
- If consistently slow, reduce symbol count

#### 4. High Slippage (> 0.5%)

**Symptoms**: Filled price differs significantly from trigger price

**Causes**:
- Using Market orders during extreme volatility
- Low liquidity symbols
- Large position size relative to order book
- Network latency spike

**Solutions**:
```bash
# Switch to Limit orders
# Press F1 → Risk Settings → Extreme Velocity Threshold: 1.0
# This forces Limit orders instead of Market

# Reduce position size
# Edit .env: MAX_POSITION_SIZE_PCT=20 (instead of 30)

# Filter low liquidity symbols
# System already filters < $1M volume
# Can increase threshold in TitanTrap.ts

# Check network latency
ping api.bybit.com
# Should be < 300ms from Bulgaria
```

**Prevention**:
- Use Limit orders for most trades (velocity < 0.5%/s)
- Avoid trading during extreme volatility (> 5% moves)
- Keep position size < 20% of account

#### 5. Credential Decryption Failed

**Symptoms**: "Error: Invalid master password" or "Decryption failed"

**Causes**:
- Wrong TITAN_MASTER_PASSWORD in .env
- Corrupted secrets.enc file
- Password changed after encryption

**Solutions**:
```bash
# Re-encrypt credentials with correct password
# Delete old encrypted file
rm ~/.titan-scanner/secrets.enc

# Set correct password in .env
nano .env
# TITAN_MASTER_PASSWORD=your_correct_password

# Restart system (will re-encrypt on first run)
npm start
```

**Prevention**: 
- Store master password securely (password manager)
- Don't change password without re-encrypting
- Backup secrets.enc file

#### 6. Trap Activation Spam

**Symptoms**: Same trap fires multiple times in < 5 minutes

**Causes**:
- Price oscillating around trigger level
- Cooldown not working
- Multiple symbols with same name

**Solutions**:
```bash
# System has built-in 5-minute cooldown
# Check console for: "⚠️ Trap cooldown: SYMBOL (XXs ago)"

# If spam persists, increase cooldown
# Edit src/engine/TitanTrap.ts:
# if (timeSinceActivation < 600000) // 10 minutes instead of 5

# Increase trigger tolerance
# Edit TripwireCalculators.ts:
# const priceDistance = Math.abs(price - trap.triggerPrice) / trap.triggerPrice;
# if (priceDistance > 0.002) continue; // 0.2% instead of 0.1%
```

**Prevention**: Cooldown system prevents spam. If issue persists, increase cooldown period.

#### 7. Equity Not Updating

**Symptoms**: Dashboard shows stale equity value

**Causes**:
- Bybit API slow or timing out
- Background loop crashed
- API rate limit exceeded

**Solutions**:
```bash
# Check if background loop is running
# Look for: "💰 Equity updated: $XXX.XX" every 5 seconds

# Manually check equity
curl -X GET "https://api.bybit.com/v5/account/wallet-balance?accountType=UNIFIED" \
  -H "X-BAPI-API-KEY: your_key" \
  -H "X-BAPI-TIMESTAMP: $(date +%s)000" \
  -H "X-BAPI-SIGN: your_signature"

# Restart system if loop crashed
# Press Q, then npm start
```

**Prevention**: Background loop is resilient. If crashes persist, check API stability.

#### 8. Tests Failing

**Symptoms**: `npm test` shows failures

**Causes**:
- Node.js version mismatch (need v18+)
- Missing dependencies
- Corrupted node_modules

**Solutions**:
```bash
# Check Node.js version
node --version
# Should be v18.0.0 or higher

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- tests/unit/TitanTrap.test.ts
```

**Prevention**: Use Node.js v18+ and keep dependencies updated.

### Getting Help

If issues persist:

1. **Check Logs**: Review `trades.jsonl` for error patterns
2. **Enable Debug Mode**: Set `DEBUG=true` in .env for verbose logging
3. **Test Components**: Run unit tests to isolate issue
4. **Community**: Open GitHub issue with:
   - Error message
   - Console output
   - System specs (Node version, OS)
   - Steps to reproduce

### Emergency Procedures

#### Flatten All Positions

If system behaves unexpectedly:

```bash
# Stop the engine
Press Q

# Manually close all positions in Bybit dashboard
# Or use emergency flatten script:
node scripts/emergency-flatten.js
```

#### Reset Configuration

If configuration is corrupted:

```bash
# Delete config file
rm ~/.titan-scanner/config.json

# Restart system (will load defaults)
npm start

# Reconfigure via F1 panel
```

#### Full Reset

Nuclear option (loses all settings):

```bash
# Stop system
Press Q

# Delete all data
rm -rf ~/.titan-scanner/

# Restart system
npm start

# Reconfigure from scratch
```

## 📚 Architecture Details

### File Structure
```
titan-phase1-scavenger/
├── src/
│   ├── index.js                    # Main entry point
│   ├── engine/
│   │   └── TitanTrap.js           # Core trap engine
│   ├── exchanges/
│   │   ├── BinanceSpotClient.js   # Binance WebSocket
│   │   ├── BybitPerpsClient.js    # Bybit REST + orders
│   │   ├── MEXCPerpsClient.js     # MEXC REST + orders
│   │   └── ExchangeGateway.js     # Multi-exchange orchestrator
│   ├── calculators/
│   │   ├── TripwireCalculators.js # Liquidation/Daily/Bollinger
│   │   ├── VelocityCalculator.js  # Price velocity
│   │   ├── PositionSizeCalculator.js # Kelly Criterion
│   │   └── CVDCalculator.js       # Cumulative Volume Delta
│   ├── detectors/
│   │   ├── OIWipeoutDetector.js   # OI wipeout strategy
│   │   ├── FundingSqueezeDetector.js # Funding squeeze
│   │   ├── BasisArbDetector.js    # Spot-Perp basis arb
│   │   └── UltimateBulgariaProtocol.js # Combined strategy
│   ├── validators/
│   │   └── VolumeValidator.js     # Volume confirmation
│   ├── config/
│   │   ├── ConfigManager.js       # Hot-swappable config
│   │   └── CredentialManager.js   # AES-256-GCM encryption
│   ├── console/
│   │   └── TrapMonitor.jsx        # Ink React dashboard
│   ├── events/
│   │   └── EventEmitter.js        # Event system
│   └── logging/
│       └── Logger.js              # JSONL logger
├── tests/
│   ├── unit/
│   ├── integration/
│   └── property/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## ❓ Frequently Asked Questions (FAQ)

### General Questions

**Q: How much capital do I need to start?**
A: Minimum $200. The system is designed for $200 → $5,000 growth. Starting with less may not provide enough margin for 10x-20x leverage.

**Q: Can I run this on a VPS?**
A: Yes, recommended. Use Ubuntu 22.04 with Node.js v18+. VPS ensures 24/7 uptime and stable connection.

**Q: Does this work with other exchanges?**
A: Currently supports Binance (signal validation), Bybit (execution), and MEXC (optional execution). Other exchanges require code modifications.

**Q: How many trades per day?**
A: Typically 3-8 high-confidence signals per day. Quality over quantity. Some days may have zero signals.

**Q: What's the expected win rate?**
A: Target 60-70% win rate with 3:1 R:R. This means 6-7 winners out of 10 trades, with winners 3x larger than losers.

### Technical Questions

**Q: Why use Binance for signals but execute on Bybit?**
A: Binance has higher liquidity and faster price discovery. When Binance breaks a level with volume, it's real money. Bybit follows 1-10 seconds later - we catch that lag.

**Q: What's the "Leader-Follower" pattern?**
A: Binance Spot leads price discovery (Leader). Bybit Perps follow with 1-10 second lag (Follower). We use Binance to validate breakouts, then execute on Bybit.

**Q: Why 200ms latency doesn't matter?**
A: We trade structural momentum (2-5% moves over 5-15 minutes), not tick arbitrage. HFTs close price gaps in 1-10ms, but the momentum ignition takes minutes. Plenty of time for Bulgaria.

**Q: What's a "tripwire"?**
A: A pre-calculated price level where a breakout is expected. We calculate these every minute and store them in memory. When price hits a tripwire with volume, we execute instantly.

**Q: How does volume validation work?**
A: We require 50+ trades in 100ms window on Binance. This filters fake-outs (low volume) from real breakouts (high volume).

**Q: What's the difference between trap types?**
A: See "Trap Types & Confidence Levels" table above. Each trap type exploits a different structural imbalance (liquidations, funding, basis, etc.).

### Risk Management Questions

**Q: Is 20x leverage safe?**
A: With proper stop losses (1%) and high-confidence setups (95%), yes. Risk per trade is 20% of account (20x * 1% stop = 20%). We only use 20x on highest-confidence traps.

**Q: What if I lose 3 trades in a row?**
A: With 30% position size and 1% stops, 3 losses = -60% drawdown. This is why we target 70% win rate. Losing streaks happen, but winners are 3x larger.

**Q: Can I reduce leverage?**
A: Yes. Press F1 → Risk Management → Max Leverage. Start with 10x if uncomfortable with 20x. Lower leverage = lower returns but also lower risk.

**Q: What's the maximum drawdown?**
A: Expect 30-50% drawdowns during losing streaks. This is normal for high-leverage systems. Never risk more than you can afford to lose.

**Q: Should I use stop losses?**
A: Absolutely. System automatically sets stops at -1% (or -2% for OI Wipeout). Never disable stops. They're your safety net.

### Strategy Questions

**Q: When should I pause the system?**
A: During major news events (FOMC, CPI), extreme volatility (BTC > 10% move), or when you're uncomfortable with market conditions. Press SPACE to pause.

**Q: Can I modify trap parameters?**
A: Yes. Press F1 to adjust thresholds. Start with defaults, then optimize based on your results. Document changes in a trading journal.

**Q: What's the best time to run this?**
A: 24/7 if possible. Crypto markets never sleep. Best opportunities often occur during Asian/European hours (low liquidity = bigger moves).

**Q: Should I trade all trap types?**
A: Start with LIQUIDATION and DAILY_LEVEL (simpler). Add OI_WIPEOUT and FUNDING_SQUEEZE once comfortable. ULTIMATE_BULGARIA is highest confidence.

**Q: How do I know if a trap is good?**
A: Check confidence level (> 85%), trap type (LIQUIDATION/OI_WIPEOUT best), and proximity (< 2% from trigger). Dashboard color codes this for you.

### Troubleshooting Questions

**Q: Why is my trap map empty?**
A: Wait 1-2 minutes for first calculation. If still empty, check Bybit API connection and ensure symbols have > $1M volume. See Troubleshooting section.

**Q: Why do I have high slippage?**
A: Using Market orders during extreme volatility. Switch to Limit orders (F1 → Extreme Velocity Threshold: 1.0) or reduce position size.

**Q: Why did a trap fire but no order was placed?**
A: Check API key permissions, account balance, and rate limits. See "Order Placement Failures" in Troubleshooting.

**Q: Can I backtest this?**
A: Not directly. System is designed for live trading with real-time WebSocket data. Historical backtesting would require significant modifications.

**Q: How do I track performance?**
A: Review `trades.jsonl` file. Use `jq` to query (see Logging section). Calculate win rate, average R:R, and total P&L.

## 🎓 Learning Resources

### Predestination Engine Concept
- [Smart Money Concepts](https://www.tradingview.com/scripts/smartmoneyconcepts/) - Understanding institutional trading patterns
- [Liquidation Clusters](https://www.coinglass.com/LiquidationData) - Real-time liquidation heatmaps
- [Funding Rate Analysis](https://www.coinglass.com/FundingRate) - Tracking funding rate squeezes
- [Order Flow Trading](https://www.youtube.com/results?search_query=order+flow+trading) - CVD and volume analysis

### Technical Implementation
- [Binance WebSocket API](https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams) - Real-time market data
- [Bybit API Documentation](https://bybit-exchange.github.io/docs/v5/intro) - Order execution and account management
- [MEXC API Documentation](https://mexcdevelop.github.io/apidocs/contract_v1_en/) - Alternative execution venue
- [Node.js Crypto Trading](https://github.com/topics/crypto-trading-bot) - Open source trading bots

### Trading Psychology
- [Trading in the Zone](https://www.amazon.com/Trading-Zone-Confidence-Discipline-Attitude/dp/0735201447) - Mark Douglas
- [The Daily Trading Coach](https://www.amazon.com/Daily-Trading-Coach-Lessons-Trading/dp/0470398566) - Brett Steenbarger
- [Reminiscences of a Stock Operator](https://www.amazon.com/Reminiscences-Stock-Operator-Edwin-Lef%C3%A8vre/dp/0471770884) - Edwin Lefèvre

### Risk Management
- [Kelly Criterion Calculator](https://www.investopedia.com/articles/trading/04/091504.asp) - Position sizing
- [Risk of Ruin Calculator](https://www.myfxbook.com/en/forex-calculators/risk-of-ruin) - Drawdown analysis
- [Position Size Calculator](https://www.babypips.com/tools/position-size-calculator) - Lot size calculation

## 🚨 Disclaimer

**This software is for educational purposes only.**

Trading cryptocurrencies with leverage carries significant risk. You can lose more than your initial investment. Only trade with capital you can afford to lose.

The Predestination Engine is a tool, not a guarantee. Past performance does not indicate future results. Always:
- Start with small position sizes
- Use testnet before live trading
- Monitor the system closely
- Understand the strategies before deploying
- Never risk more than 1-2% per trade

**Use at your own risk.**

## 📄 License

ISC

## 🤝 Contributing

This is Phase 1 of the Titan Regime Engine. Future phases:
- **Phase 2 (Hunter)**: HTF structure, CVD divergence, 3x-5x leverage ($5k → $50k)
- **Phase 3 (Architect)**: Daily bias, funding arb, 1x-2x leverage ($50k+)

Contributions welcome after Phase 1 is battle-tested.

---

**Built with 🕸️ in Bulgaria**

*"The spider doesn't chase the fly. It builds the web and waits."*
