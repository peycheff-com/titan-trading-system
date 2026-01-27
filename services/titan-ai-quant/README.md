# Titan AI Quant - Phase 4

**Closed-Loop Parameter Optimization Engine** - Maximizes R:R (Risk:Reward) of Phase 1 & 2 strategies through AI-powered analysis and safe configuration updates.

## Overview

The Titan AI Quant is a sophisticated offline advisor that analyzes trading performance and proposes safe configuration optimizations. Unlike standard "AI Trading" which attempts to predict price, the Titan Quant predicts **Parameter Efficiency**. It answers one question: *"Given the last 24 hours of market microstructure, what configuration settings would have yielded the highest PnL?"*

### Key Features

- **Offline Operation**: Zero latency impact on live execution
- **Safety-First**: Strict parameter bounds and validation prevent dangerous configurations
- **AI-Powered Analysis**: Uses Gemini 1.5 Flash for cost-effective pattern recognition
- **Backtesting Validation**: All proposals validated through realistic simulation
- **Interactive UI**: Chat interface and approval workflow for human oversight
- **Interactive UI**: Chat interface and approval workflow for human oversight
- **Strategic Memory**: Weaviate Vector Database for high-dimensional pattern matching

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Gemini API key

# Run the system
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Analysis Layer                        │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  TitanAnalyst    │────────→│   Guardrails     │         │
│  │  (Gemini API)    │         │  (Safety Check)  │         │
│  └──────────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Validation Layer                           │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │   Backtester     │────────→│  Latency Model   │         │
│  │  (Simulation)    │         │  (Bulgaria Tax)  │         │
│  └──────────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer                               │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │     Journal      │────────→│ Strategic Memory │         │
│  │  (Log Parser)    │         │ (Weaviate Vector)│         │
│  └──────────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```
## Core Components

### 1. Journal (Trade Log Parser)
Converts raw execution data into AI-readable narratives with regime context.

**Key Features:**
- Streaming parser for large `trades.jsonl` files
- Correlates trades with regime snapshots (volatility, trend, liquidity)
- Token-efficient narratives for cost-effective AI analysis
- Filters failed trades for pattern analysis

### 2. TitanAnalyst (AI Engine)
Uses Gemini 1.5 Flash to analyze patterns and generate optimization proposals.

**Capabilities:**
- Pattern recognition in failed trades
- Time-of-day correlation analysis
- Symbol-specific issue detection
- Regime-aware optimization proposals

### 3. Strategic Memory (Weaviate Vector Database)
Persistent learning system that uses vector embeddings to match current market conditions with historical patterns.

**Capabilities:**
- Semantic search over trade history
- Regime similarity matching (e.g. "Find times when Volatility > 5% and Trend was Flat")
- Outcome persistence for optimization proposals

### 4. Guardrails (Safety System)
Prevents dangerous configurations through strict validation.

**Protection:**
- Parameter bounds enforcement
- Schema validation against config structure
- Anti-hallucination checks for AI outputs
- Type validation for all proposed values

### 5. Backtester (Validation Engine)
Simulates proposed changes against historical data with realistic execution modeling.

**Features:**
- Latency penalty application (Bulgaria Tax)
- Slippage modeling based on volatility
- PnL and drawdown comparison
- Automatic rejection of poor proposals

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Rate Limiting (optional)
MAX_REQUESTS_PER_MINUTE=10

# Weaviate Configuration
WEAVIATE_SCHEME=http
WEAVIATE_HOST=localhost:8080
WEAVIATE_API_KEY= # Optional for local, required for cloud

# Logging (optional)
LOG_LEVEL=info
ERROR_LOG_PATH=./logs/ai-quant-errors.log
```

### Parameter Bounds

The system enforces strict safety bounds on all parameters:

```typescript
const PARAMETER_BOUNDS = {
  'max_leverage': { min: 1, max: 20 },
  'stop_loss': { min: 0.001, max: 0.05 },        // 0.1% to 5%
  'risk_per_trade': { min: 0.001, max: 0.05 },   // 0.1% to 5%
  'take_profit': { min: 0.005, max: 0.20 },      // 0.5% to 20%
  'trailing_stop': { min: 0.001, max: 0.05 },    // 0.1% to 5%
  'cooldown_period': { min: 0, max: 3600 },      // 0 to 1 hour
  'max_daily_loss': { min: 0.01, max: 0.20 },    // 1% to 20%
  'max_position_size': { min: 0.1, max: 1.0 },   // 10% to 100%
}
```

**Rationale:**
- **Leverage Cap (20x)**: Prevents excessive risk while allowing aggressive strategies
- **Stop Loss Range**: Balances protection vs. premature exits
- **Risk Per Trade**: Ensures position sizing stays within Kelly Criterion bounds
- **Daily Loss Limit**: Circuit breaker for bad market days
## Chat Interface Commands

Access the AI chat interface with `Cmd+K` (or `Ctrl+K` on Windows/Linux).

### Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/analyze` | Analyze last 24 hours of trades | `/analyze` |
| `/optimize [symbol]` | Generate optimization for specific symbol | `/optimize SOL` |
| `/insights` | Show recent AI insights | `/insights` |
| `/status` | Display system status and proposals | `/status` |
| `/help` | Show command help | `/help` |

### Command Examples

```bash
# Analyze recent performance
> /analyze
🤖 Analyzing 47 trades from the last 24 hours...
Found 3 patterns:
1. [85%] SOL trades during 14:00-16:00 UTC show 12% higher slippage
2. [72%] AVAX stop losses triggered prematurely in low volatility periods
3. [68%] ETH funding spike traps underperforming during weekend sessions

# Optimize specific symbol
> /optimize BTC
🤖 Generating optimization for BTC...
Proposal: Increase stop_loss from 0.015 to 0.018 (+20%)
Reasoning: BTC volatility increased 15% this week, wider stops reduce noise
Expected Impact: +3.2% PnL, +1.1% risk
Confidence: 78%

# Check system status
> /status
📊 System Status
Config Version: v1734-p42
Pending Proposals: 1
Applied Proposals: 8
Rejected Proposals: 3
```

## Prompt Engineering Strategy

The AI system uses carefully crafted prompts to ensure consistent, actionable outputs.

### Analysis Prompt Template

**Purpose**: Identify patterns in failed trades
**Input**: Failed trade narratives with regime context
**Output**: Structured insights with confidence scores

**Key Elements:**
- Recent insights for context continuity
- Time period specification for relevance
- Failed trade narratives with regime data
- Specific analysis dimensions (time, symbol, regime, trap type, slippage)
- JSON output format for reliable parsing

### Optimization Prompt Template

**Purpose**: Map insights to specific configuration changes
**Input**: Insight text, current config schema, relevant values
**Output**: Single parameter change proposal

**Constraints:**
- Only modify existing parameters
- Respect parameter bounds
- Propose ONE change per insight
- Include reasoning and impact estimates
- JSON output with expected structure

### Anti-Hallucination Measures

1. **Schema Validation**: All proposals validated against Zod config schema
2. **Parameter Bounds**: Numeric values checked against safety limits
3. **Key Existence**: Target keys verified in configuration structure
4. **Type Checking**: Value types matched to expected schema types
5. **Structured Output**: JSON format prevents free-form hallucinations

## Reading Optimization Reports

### Proposal Structure

```json
{
  "targetKey": "traps.oi_wipeout.stop_loss",
  "currentValue": 0.02,
  "suggestedValue": 0.025,
  "reasoning": "SOL trades show 15% higher success with wider stops during high volatility periods",
  "expectedImpact": {
    "pnlImprovement": 5.2,      // Expected PnL increase (%)
    "riskChange": 2.1,          // Risk increase (%)
    "confidenceScore": 0.78     // AI confidence (0-1)
  }
}
```

### Validation Report

```json
{
  "passed": true,
  "backtestPeriod": {
    "start": 1703980800000,
    "end": 1704067200000
  },
  "baselineMetrics": {
    "totalPnL": 2.34,
    "maxDrawdown": 0.08,
    "winRate": 0.65,
    "sharpeRatio": 1.42
  },
  "proposedMetrics": {
    "totalPnL": 2.56,           // +9.4% improvement
    "maxDrawdown": 0.09,        // +12.5% increase (acceptable)
    "winRate": 0.68,            // +4.6% improvement
    "sharpeRatio": 1.51         // +6.3% improvement
  },
  "recommendation": "approve"
}
```

### Interpreting Results

**Green Flags (Approve):**
- PnL improvement > 2%
- Drawdown increase < 15%
- Win rate maintained or improved
- Confidence score > 0.7

**Yellow Flags (Review):**
- PnL improvement 0-2%
- Drawdown increase 10-15%
- Confidence score 0.5-0.7

**Red Flags (Reject):**
- PnL decrease or no improvement
- Drawdown increase > 15%
- Win rate decrease > 5%
- Confidence score < 0.5