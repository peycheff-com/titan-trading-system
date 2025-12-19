# Design Document

## Overview

Titan Phase 4 - The AI Quant is a closed-loop parameter optimization system that uses AI to analyze trading performance and propose configuration improvements. The system operates as an offline advisor, analyzing historical trade data enriched with regime context, validating proposals through realistic backtesting, and presenting recommendations through an interactive UI.

The architecture follows a clear separation of concerns:
- **Data Layer**: Journal (log parsing) + Strategic Memory (SQLite)
- **Analysis Layer**: TitanAnalyst (AI reasoning) + Guardrails (safety validation)
- **Simulation Layer**: Backtester (playback engine with latency modeling)
- **Presentation Layer**: Console UI (Ink React) + Chat Interface

## Architecture

### High-Level Flow

```
Trade Execution → trades.jsonl + regime_snapshots
                        ↓
                   Journal Parser (correlates regime context)
                        ↓
                   TitanAnalyst (Gemini 1.5 Flash)
                        ↓
                   Optimization Proposal (JSON)
                        ↓
                   Zod Schema Validation
                        ↓
                   Guardrails (bounds checking)
                        ↓
                   Backtester (with Bulgaria Tax)
                        ↓
                   Validation Report
                        ↓
                   UI Approval Workflow
                        ↓
                   config.json update + hot reload
```

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  TrapMonitor.tsx │         │  ChatInterface   │         │
│  │  (AI Advisor)    │         │  (Cmd+K Modal)   │         │
│  └──────────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Analysis Layer                          │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  TitanAnalyst    │────────→│   Guardrails     │         │
│  │  (Gemini API)    │         │  (Bounds Check)  │         │
│  └──────────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Simulation Layer                         │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │   Backtester     │────────→│  Latency Model   │         │
│  │  (Playback)      │         │  (Bulgaria Tax)  │         │
│  └──────────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       Data Layer                             │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │     Journal      │────────→│ Strategic Memory │         │
│  │  (Log Parser)    │         │    (SQLite)      │         │
│  └──────────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```


## Components and Interfaces

### 1. Journal (Log Parser)

**Purpose**: Parse trade logs and correlate with regime snapshots to create AI-readable narratives.

**Interface**:
```typescript
class Journal {
  // Read trades efficiently using streaming
  async ingestTrades(limit?: number): Promise<Trade[]>
  
  // Convert trade to token-efficient narrative
  summarizeTrade(trade: Trade, regime: RegimeSnapshot): string
  
  // Filter for loss-making trades
  getFailedTrades(trades: Trade[]): Trade[]
  
  // Correlate trade with regime at execution time
  getRegimeContext(trade: Trade): RegimeSnapshot
}

interface Trade {
  timestamp: number
  symbol: string
  trapType: string
  entryPrice: number
  exitPrice: number
  pnl: number
  pnlPercent: number
  duration: number
  slippage: number
  leverage: number
}

interface RegimeSnapshot {
  timestamp: number
  trendState: number      // 1=Bull, 0=Range, -1=Bear
  volState: number        // 0=Low, 1=Normal, 2=Extreme
  liquidityState: number  // 2=High, 1=Normal, 0=Low
  regimeState: number     // 1=Risk-On, 0=Neutral, -1=Risk-Off
}
```

**Implementation Notes**:
- Use Node.js `readline` for streaming large `trades.jsonl` files
- Load `regime_snapshots.jsonl` into memory (small dataset)
- Binary search or hash map for fast regime lookup by timestamp
- Narrative format: "Symbol: SOL, Type: OI_WIPEOUT, Result: -1.2%, Duration: 4s, Slippage: 0.1%, Regime: Risk-Off/Extreme-Vol"

### 2. Strategic Memory (SQLite)

**Purpose**: Persist learned insights and track configuration version performance.

**Schema**:
```sql
CREATE TABLE strategic_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  topic TEXT NOT NULL,
  insight_text TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE config_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_tag TEXT UNIQUE NOT NULL,
  config_json TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  proposal_id INTEGER,
  FOREIGN KEY (proposal_id) REFERENCES optimization_proposals(id)
);

CREATE TABLE optimization_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  insight_id INTEGER,
  target_key TEXT NOT NULL,
  current_value TEXT NOT NULL,
  suggested_value TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  validation_report TEXT,
  status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'applied')),
  FOREIGN KEY (insight_id) REFERENCES strategic_insights(id)
);

CREATE TABLE performance_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_version_tag TEXT NOT NULL,
  measurement_window_start INTEGER NOT NULL,
  measurement_window_end INTEGER NOT NULL,
  total_trades INTEGER,
  win_rate REAL,
  avg_pnl REAL,
  max_drawdown REAL,
  sharpe_ratio REAL,
  FOREIGN KEY (config_version_tag) REFERENCES config_versions(version_tag)
);
```

**Interface**:
```typescript
class StrategicMemory {
  // Store new insight
  async storeInsight(topic: string, text: string, confidence: number): Promise<number>
  
  // Retrieve recent insights for context
  async getRecentInsights(limit: number = 10): Promise<Insight[]>
  
  // Store optimization proposal
  async storeProposal(proposal: OptimizationProposal): Promise<number>
  
  // Tag applied configuration
  async tagConfigVersion(versionTag: string, configJson: string, proposalId: number): Promise<void>
  
  // Track performance for config version
  async trackPerformance(versionTag: string, metrics: PerformanceMetrics): Promise<void>
  
  // Get performance delta between versions
  async getPerformanceDelta(oldTag: string, newTag: string): Promise<PerformanceDelta>
}
```


### 3. TitanAnalyst (AI Engine)

**Purpose**: Use Gemini 1.5 Flash to analyze trade patterns and generate optimization proposals.

**Interface**:
```typescript
class TitanAnalyst {
  private client: GoogleGenerativeAI
  private rateLimiter: RateLimiter
  
  constructor(apiKey: string)
  
  // Analyze failed trades and identify patterns
  async analyzeFailures(trades: Trade[], regimeContext: RegimeSnapshot[]): Promise<Insight[]>
  
  // Generate optimization proposal from insight
  async proposeOptimization(insight: Insight, currentConfig: Config): Promise<OptimizationProposal>
  
  // Validate proposal through backtesting
  async validateProposal(proposal: OptimizationProposal): Promise<ValidationReport>
}

interface Insight {
  topic: string
  text: string
  confidence: number
  affectedSymbols?: string[]
  affectedTraps?: string[]
  regimeContext?: string
}

interface OptimizationProposal {
  targetKey: string           // e.g., "traps.oi_wipeout.stop_loss"
  currentValue: any
  suggestedValue: any
  reasoning: string
  expectedImpact: {
    pnlImprovement: number    // Percentage
    riskChange: number        // Percentage
    confidenceScore: number   // 0-1
  }
}

interface ValidationReport {
  passed: boolean
  oldPnL: number
  newPnL: number
  oldDrawdown: number
  newDrawdown: number
  tradeCount: number
  confidenceScore: number
  rejectionReason?: string
}
```

**Prompt Engineering Strategy**:

1. **Analysis Prompt** (`prompts/analysis.txt`):
```
You are a quantitative trading analyst reviewing execution logs.

CONTEXT:
- Recent Insights: {recentInsights}
- Time Period: {startTime} to {endTime}

FAILED TRADES:
{failedTradeNarratives}

TASK:
Identify patterns in losses. Consider:
1. Time-of-day correlations
2. Symbol-specific issues
3. Regime context (were losses during Risk-Off periods?)
4. Trap type performance
5. Slippage patterns

OUTPUT FORMAT (JSON):
{
  "insights": [
    {
      "topic": "string",
      "text": "string",
      "confidence": 0.0-1.0,
      "affectedSymbols": ["string"],
      "regimeContext": "string"
    }
  ]
}
```

2. **Optimization Prompt** (`prompts/optimization.txt`):
```
You are a trading system engineer proposing configuration changes.

INSIGHT:
{insightText}

CURRENT CONFIG SCHEMA:
{configSchema}

CURRENT VALUES:
{relevantConfigValues}

TASK:
Map this insight to specific config.json parameters. Propose ONE change.

CONSTRAINTS:
- max_leverage: 1-20
- stop_loss: 0.001-0.05
- risk_per_trade: 0.001-0.05
- Only modify parameters that exist in the schema

OUTPUT FORMAT (JSON):
{
  "targetKey": "traps.oi_wipeout.stop_loss",
  "currentValue": 0.01,
  "suggestedValue": 0.015,
  "reasoning": "string",
  "expectedImpact": {
    "pnlImprovement": 5.0,
    "riskChange": 2.0,
    "confidenceScore": 0.75
  }
}
```

**Rate Limiting**:
- Max 10 requests per minute (free tier safety)
- Exponential backoff on 429 errors
- Queue requests if limit reached


### 4. Guardrails (Safety Validation)

**Purpose**: Enforce parameter bounds and validate proposal structure against config schema.

**Interface**:
```typescript
class Guardrails {
  private configSchema: z.ZodSchema
  
  constructor(configSchema: z.ZodSchema)
  
  // Validate proposal against bounds and schema
  validateProposal(proposal: OptimizationProposal): ValidationResult
  
  // Check if value is within safe bounds
  checkBounds(key: string, value: any): boolean
  
  // Validate proposal structure matches config schema
  validateSchema(proposal: OptimizationProposal): boolean
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// Parameter bounds constant
const PARAMETER_BOUNDS = {
  'max_leverage': { min: 1, max: 20 },
  'stop_loss': { min: 0.001, max: 0.05 },
  'risk_per_trade': { min: 0.001, max: 0.05 },
  'take_profit': { min: 0.005, max: 0.20 },
  'trailing_stop': { min: 0.001, max: 0.05 },
  // Add more as needed
}
```

**Zod Schema Validation**:

The config schema should be defined using Zod for runtime validation:

```typescript
import { z } from 'zod'

const TrapConfigSchema = z.object({
  enabled: z.boolean(),
  stop_loss: z.number().min(0.001).max(0.05),
  take_profit: z.number().min(0.005).max(0.20),
  risk_per_trade: z.number().min(0.001).max(0.05),
  max_leverage: z.number().int().min(1).max(20),
  // ... other fields
})

const ConfigSchema = z.object({
  traps: z.object({
    oi_wipeout: TrapConfigSchema,
    funding_spike: TrapConfigSchema,
    liquidity_sweep: TrapConfigSchema,
    // ... other traps
  }),
  risk: z.object({
    max_daily_loss: z.number(),
    max_position_size: z.number(),
    // ... other risk params
  }),
  // ... other sections
})

type Config = z.infer<typeof ConfigSchema>
```

**Anti-Hallucination Strategy**:
1. Parse AI's JSON output
2. Validate `targetKey` exists in schema using lodash `_.get()`
3. Validate `suggestedValue` type matches schema type
4. Check bounds using `PARAMETER_BOUNDS`
5. Reject if any validation fails


### 5. Backtester (Playback Engine)

**Purpose**: Replay historical trades with different configurations to validate proposals.

**Interface**:
```typescript
class Backtester {
  private cache: CacheManager
  private latencyModel: LatencyModel
  
  // Replay trades with config override
  async replay(
    symbol: string,
    startTime: number,
    endTime: number,
    configOverride: Partial<Config>
  ): Promise<BacktestResult>
  
  // Compare two configurations
  async compareConfigs(
    baseConfig: Config,
    proposedConfig: Config,
    trades: Trade[]
  ): Promise<ComparisonResult>
}

interface BacktestResult {
  totalTrades: number
  winRate: number
  totalPnL: number
  maxDrawdown: number
  avgSlippage: number
  sharpeRatio: number
}

interface ComparisonResult {
  baseResult: BacktestResult
  proposedResult: BacktestResult
  pnlDelta: number
  drawdownDelta: number
  recommendation: 'approve' | 'reject'
  reason: string
}
```

**Latency Model (Bulgaria Tax)**:

```typescript
class LatencyModel {
  private baseLatency: number = 200  // ms, configurable
  
  // Apply latency penalty to execution
  applyLatencyPenalty(
    idealEntry: number,
    marketData: OHLCV[],
    timestamp: number
  ): number {
    // Find price at timestamp + latency
    const delayedTimestamp = timestamp + this.baseLatency
    const delayedPrice = this.interpolatePrice(marketData, delayedTimestamp)
    return delayedPrice
  }
  
  // Calculate slippage based on volatility
  calculateSlippage(
    orderSize: number,
    atr: number,
    liquidityState: number
  ): number {
    // Base slippage from ATR
    let slippage = atr * 0.1
    
    // Increase slippage in low liquidity
    if (liquidityState === 0) {
      slippage *= 2.0
    }
    
    // Increase slippage for larger orders
    const sizeMultiplier = Math.log10(orderSize / 1000) + 1
    slippage *= sizeMultiplier
    
    return slippage
  }
}
```

**Backtesting Logic**:

1. Load historical OHLCV data from cache
2. For each trade in the period:
   - Apply proposed config parameters
   - Recalculate entry/exit signals
   - Apply latency penalty to entry price
   - Apply slippage model to execution
   - Calculate PnL with realistic fills
3. Aggregate results
4. Compare with baseline (original config)

**Rejection Rules**:
- If `newPnL <= oldPnL`: Reject
- If `newDrawdown > oldDrawdown * 1.1`: Reject
- If `newWinRate < oldWinRate * 0.9`: Warn (but don't auto-reject)


### 6. Console UI (AI Advisor Panel)

**Purpose**: Display AI insights and proposals in the terminal dashboard.

**Interface**:
```typescript
// Add to TrapMonitor.tsx
interface AIAdvisorProps {
  visible: boolean
  insights: Insight[]
  pendingProposals: OptimizationProposal[]
  onApprove: (proposalId: number) => void
  onReject: (proposalId: number) => void
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({
  visible,
  insights,
  pendingProposals,
  onApprove,
  onReject
}) => {
  if (!visible) return null
  
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan">
      <Text bold color="cyan">🤖 AI Advisor</Text>
      
      {/* Recent Insights */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Recent Insights:</Text>
        {insights.slice(0, 3).map(insight => (
          <Text key={insight.id}>
            • {insight.text} (confidence: {(insight.confidence * 100).toFixed(0)}%)
          </Text>
        ))}
      </Box>
      
      {/* Pending Proposals */}
      {pendingProposals.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">Pending Optimization:</Text>
          {pendingProposals[0] && (
            <ProposalCard 
              proposal={pendingProposals[0]}
              onApprove={onApprove}
              onReject={onReject}
            />
          )}
        </Box>
      )}
    </Box>
  )
}
```

**Proposal Card Component**:
```typescript
const ProposalCard: React.FC<{
  proposal: OptimizationProposal
  onApprove: (id: number) => void
  onReject: (id: number) => void
}> = ({ proposal, onApprove, onReject }) => {
  return (
    <Box flexDirection="column" borderStyle="single" padding={1}>
      <Text>
        <Text color="gray">{proposal.targetKey}:</Text>
        {' '}
        <Text color="red">{proposal.currentValue}</Text>
        {' → '}
        <Text color="green">{proposal.suggestedValue}</Text>
      </Text>
      
      <Text color="gray">{proposal.reasoning}</Text>
      
      <Box marginTop={1}>
        <Text>Expected PnL: </Text>
        <Text color="green">+{proposal.expectedImpact.pnlImprovement}%</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text color="yellow">[ENTER] Apply  [ESC] Reject</Text>
      </Box>
    </Box>
  )
}
```

**Keyboard Bindings**:
- `A`: Toggle AI Advisor panel
- `ENTER`: Approve current proposal
- `ESC`: Reject current proposal
- `Cmd+K`: Open chat interface


### 7. Chat Interface

**Purpose**: Allow interactive AI queries via Cmd+K modal.

**Interface**:
```typescript
const ChatInterface: React.FC<{
  visible: boolean
  onClose: () => void
}> = ({ visible, onClose }) => {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  
  const handleCommand = async (command: string) => {
    if (command.startsWith('/analyze')) {
      // Run analysis on last 24h
      setStreaming(true)
      const result = await analyst.analyzeFailures(...)
      setMessages([...messages, { role: 'assistant', content: result }])
      setStreaming(false)
    } else if (command.startsWith('/optimize')) {
      // Extract symbol from command
      const symbol = command.split(' ')[1]
      setStreaming(true)
      const result = await analyst.proposeOptimization(...)
      setMessages([...messages, { role: 'assistant', content: result }])
      setStreaming(false)
    }
  }
  
  return (
    <Box flexDirection="column" borderStyle="double">
      <Text bold>AI Chat (Cmd+K to close)</Text>
      
      {/* Message history */}
      <Box flexDirection="column" height={10}>
        {messages.map((msg, i) => (
          <Text key={i} color={msg.role === 'user' ? 'cyan' : 'white'}>
            {msg.role === 'user' ? '> ' : '🤖 '}{msg.content}
          </Text>
        ))}
        {streaming && <Text color="gray">Thinking...</Text>}
      </Box>
      
      {/* Input */}
      <TextInput
        value={input}
        onChange={setInput}
        onSubmit={handleCommand}
        placeholder="Type /analyze or /optimize [symbol]"
      />
    </Box>
  )
}
```

**Supported Commands**:
- `/analyze`: Analyze last 24h trades
- `/optimize [symbol]`: Generate optimization for specific symbol
- `/insights`: Show recent insights
- `/status`: Show current config version and performance


### 8. Nightly Optimization Job

**Purpose**: Automated daily optimization cycle.

**Interface**:
```typescript
class NightlyOptimize {
  private analyst: TitanAnalyst
  private memory: StrategicMemory
  private scheduler: NodeSchedule
  
  // Schedule job for 00:00 UTC
  start() {
    this.scheduler.scheduleJob('0 0 * * *', async () => {
      await this.runOptimization()
    })
  }
  
  // Run full optimization cycle
  async runOptimization(): Promise<MorningBriefing> {
    // 1. Ingest last 24h trades
    const trades = await journal.ingestTrades()
    
    // 2. Analyze failures
    const insights = await analyst.analyzeFailures(trades)
    
    // 3. Store insights
    for (const insight of insights) {
      await memory.storeInsight(insight.topic, insight.text, insight.confidence)
    }
    
    // 4. Generate proposals (if insights warrant)
    const proposals = []
    for (const insight of insights.filter(i => i.confidence > 0.7)) {
      const proposal = await analyst.proposeOptimization(insight, currentConfig)
      
      // 5. Validate proposal
      const validation = await analyst.validateProposal(proposal)
      
      if (validation.passed) {
        proposals.push({ proposal, validation })
        await memory.storeProposal(proposal)
      }
    }
    
    // 6. Generate morning briefing
    return this.generateBriefing(insights, proposals)
  }
  
  // Create morning briefing
  generateBriefing(
    insights: Insight[],
    proposals: Array<{ proposal: OptimizationProposal, validation: ValidationReport }>
  ): MorningBriefing {
    return {
      date: new Date().toISOString(),
      summary: `Analyzed ${insights.length} patterns, generated ${proposals.length} proposals`,
      topInsights: insights.slice(0, 3),
      pendingProposals: proposals,
      performanceSummary: {
        // Last 24h metrics
      }
    }
  }
}

interface MorningBriefing {
  date: string
  summary: string
  topInsights: Insight[]
  pendingProposals: Array<{
    proposal: OptimizationProposal
    validation: ValidationReport
  }>
  performanceSummary: {
    totalTrades: number
    winRate: number
    pnl: number
  }
}
```

**Display on Startup**:
```typescript
// In TrapMonitor.tsx startup
useEffect(() => {
  const briefing = await loadMorningBriefing()
  if (briefing) {
    setShowBriefing(true)
  }
}, [])
```


## Data Models

### Trade
```typescript
interface Trade {
  id: string
  timestamp: number
  symbol: string
  trapType: 'oi_wipeout' | 'funding_spike' | 'liquidity_sweep' | 'volatility_spike'
  side: 'long' | 'short'
  entryPrice: number
  exitPrice: number
  quantity: number
  leverage: number
  pnl: number
  pnlPercent: number
  duration: number  // milliseconds
  slippage: number
  fees: number
  exitReason: 'take_profit' | 'stop_loss' | 'trailing_stop' | 'timeout' | 'manual'
}
```

### RegimeSnapshot
```typescript
interface RegimeSnapshot {
  timestamp: number
  symbol: string
  trendState: -1 | 0 | 1           // Bear, Range, Bull
  volState: 0 | 1 | 2               // Low, Normal, Extreme
  liquidityState: 0 | 1 | 2         // Low, Normal, High
  regimeState: -1 | 0 | 1           // Risk-Off, Neutral, Risk-On
  hurstExponent?: number            // 0-1, market memory
  fdi?: number                      // 1-2, Fractal Dimension Index
  efficiencyRatio?: number          // 0-1, Kaufman's ER
  vpinApprox?: number               // 0-1, VPIN approximation
  absorptionState?: boolean         // Flow toxicity flag
  shannonEntropy?: number           // 0-1, disorder measure
}
```

### Config
```typescript
interface Config {
  traps: {
    [trapName: string]: TrapConfig
  }
  risk: RiskConfig
  execution: ExecutionConfig
}

interface TrapConfig {
  enabled: boolean
  stop_loss: number
  take_profit: number
  trailing_stop?: number
  risk_per_trade: number
  max_leverage: number
  min_confidence: number
  cooldown_period: number
}

interface RiskConfig {
  max_daily_loss: number
  max_position_size: number
  max_open_positions: number
  emergency_flatten_threshold: number
}

interface ExecutionConfig {
  latency_penalty: number  // ms
  slippage_model: 'conservative' | 'realistic' | 'optimistic'
  limit_chaser_enabled: boolean
  max_fill_time: number  // ms
}
```

### Insight
```typescript
interface Insight {
  id?: number
  timestamp?: number
  topic: string
  text: string
  confidence: number  // 0-1
  affectedSymbols?: string[]
  affectedTraps?: string[]
  regimeContext?: string
  metadata?: {
    sampleSize: number
    timeRange: { start: number, end: number }
    correlationStrength?: number
  }
}
```

### OptimizationProposal
```typescript
interface OptimizationProposal {
  id?: number
  createdAt?: number
  insightId?: number
  targetKey: string  // dot-notation path, e.g., "traps.oi_wipeout.stop_loss"
  currentValue: any
  suggestedValue: any
  reasoning: string
  expectedImpact: {
    pnlImprovement: number    // Percentage
    riskChange: number        // Percentage
    confidenceScore: number   // 0-1
  }
  validationReport?: ValidationReport
  status?: 'pending' | 'approved' | 'rejected' | 'applied'
}
```

### ValidationReport
```typescript
interface ValidationReport {
  passed: boolean
  timestamp: number
  backtestPeriod: {
    start: number
    end: number
  }
  baselineMetrics: BacktestResult
  proposedMetrics: BacktestResult
  deltas: {
    pnlDelta: number
    pnlDeltaPercent: number
    drawdownDelta: number
    drawdownDeltaPercent: number
    winRateDelta: number
  }
  confidenceScore: number  // 0-1
  rejectionReason?: string
  recommendation: 'approve' | 'reject' | 'review'
}
```

### BacktestResult
```typescript
interface BacktestResult {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  totalPnL: number
  avgPnL: number
  maxDrawdown: number
  maxDrawdownPercent: number
  sharpeRatio: number
  avgSlippage: number
  avgDuration: number
  profitFactor: number
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Trade Log Parsing Completeness

*For any* valid trade log file in JSONL format, parsing should successfully extract all trades and return a data structure where each trade contains all required fields (timestamp, symbol, trapType, pnl, duration, slippage).

**Validates: Requirements 1.1**

### Property 2: Narrative Field Inclusion

*For any* trade object, the generated narrative string should contain all required information: symbol, trap type, result percentage, duration, and slippage value.

**Validates: Requirements 1.2**

### Property 3: Insight Storage Round Trip

*For any* insight with topic, text, and confidence score, storing it to SQLite and then retrieving it should return an equivalent insight with all fields preserved.

**Validates: Requirements 1.4**

### Property 4: Recent Insights Ordering

*For any* collection of insights with different timestamps, retrieving recent insights with limit N should return exactly N insights (or fewer if less than N exist) ordered by timestamp descending.

**Validates: Requirements 1.5**

### Property 5: Trade-Regime Correlation

*For any* trade and collection of regime snapshots, correlating the trade should return the regime snapshot with the closest timestamp that is less than or equal to the trade timestamp.

**Validates: Requirements 1.6**

### Property 6: Proposal Structure Completeness

*For any* optimization proposal, it should contain all required fields: targetKey, currentValue, suggestedValue, reasoning, and expectedImpact with pnlImprovement, riskChange, and confidenceScore.

**Validates: Requirements 2.2**

### Property 7: Parameter Bounds Enforcement

*For any* optimization proposal, if the suggested value for a bounded parameter (leverage, stop_loss, risk_per_trade) exceeds the defined bounds, the validation should reject the proposal.

**Validates: Requirements 2.3, 2.4**

### Property 8: Schema Validation Anti-Hallucination

*For any* JSON object representing a proposal, if the targetKey does not exist in the config schema or the suggestedValue type does not match the schema type, the validation should reject the proposal.

**Validates: Requirements 2.6**

### Property 9: Backtesting Validation Logic

*For any* pair of configurations (baseline and proposed) and set of historical trades, the backtesting comparison should reject the proposal if either: (1) new PnL is less than or equal to old PnL, or (2) new drawdown exceeds old drawdown by more than 10%.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 10: Latency Penalty Application

*For any* simulated trade execution, the actual entry price should differ from the ideal entry price by an amount that accounts for the configured latency penalty and volatility-based slippage.

**Validates: Requirements 3.6**

### Property 11: Config Version Tagging

*For any* applied proposal, the system should create a config version record in strategic memory that links the proposal ID to the new config JSON and includes an application timestamp.

**Validates: Requirements 4.6**

### Property 12: Command Symbol Extraction

*For any* `/optimize [symbol]` command string, the parser should correctly extract the symbol parameter and pass it to the optimization function.

**Validates: Requirements 5.3**

### Property 13: Rate Limiting Enforcement

*For any* sequence of API requests, if more than 10 requests are made within a 60-second window, the rate limiter should block subsequent requests until the window resets.

**Validates: Requirements 5.5, 7.2**

### Property 14: Morning Briefing Structure

*For any* completed nightly optimization job, the generated morning briefing should contain all required fields: date, summary, topInsights array, pendingProposals array, and performanceSummary object.

**Validates: Requirements 6.3**

### Property 15: Streaming Memory Efficiency

*For any* trade log file larger than 100MB, parsing using streaming should keep peak memory usage below 50MB regardless of file size.

**Validates: Requirements 7.4**

### Property 16: Token-Efficient Narratives

*For any* trade object, the generated narrative should be under 100 tokens when measured by the Gemini tokenizer.

**Validates: Requirements 7.5**


## Error Handling

### AI API Errors

**Gemini API Failures**:
- **429 Rate Limit**: Implement exponential backoff (1s, 2s, 4s, 8s)
- **500 Server Error**: Retry up to 3 times with 5s delay
- **Invalid Response**: Log error, return fallback empty result
- **Timeout**: Set 30s timeout, retry once

**Fallback Strategy**:
- If AI analysis fails, use rule-based heuristics
- If proposal generation fails, skip optimization cycle
- Never crash the main trading system

### Database Errors

**SQLite Failures**:
- **SQLITE_BUSY**: Retry with exponential backoff
- **SQLITE_CORRUPT**: Log critical error, attempt recovery
- **Disk Full**: Alert user, pause optimization
- **Schema Mismatch**: Run migration automatically

**Transaction Safety**:
- Wrap all writes in transactions
- Rollback on any error
- Maintain database integrity

### Backtesting Errors

**Data Availability**:
- **Missing OHLCV Data**: Skip validation, warn user
- **Incomplete Regime Data**: Use last known regime state
- **Cache Corruption**: Rebuild cache from source

**Simulation Failures**:
- **Division by Zero**: Handle edge cases (zero volume, zero ATR)
- **Infinite Loop**: Set max iteration limit
- **Memory Overflow**: Limit backtest period to 30 days

### Configuration Errors

**Config File Issues**:
- **Parse Error**: Reject proposal, alert user
- **Missing Keys**: Use default values
- **Type Mismatch**: Reject proposal
- **Write Failure**: Rollback, alert user

**Hot Reload Failures**:
- **Syntax Error**: Rollback to previous config
- **Validation Error**: Rollback to previous config
- **System Crash**: Auto-restart with last known good config

### User Input Errors

**Chat Interface**:
- **Unknown Command**: Display help message
- **Invalid Symbol**: Suggest valid symbols
- **Malformed Input**: Show usage example

**Approval Workflow**:
- **Concurrent Approvals**: Lock proposal during processing
- **Stale Proposal**: Warn user, require re-validation


## Testing Strategy

### Unit Testing

Unit tests will verify specific functionality of individual components:

**Journal Tests**:
- Parse valid JSONL trade logs
- Handle malformed JSON gracefully
- Correlate trades with regime snapshots correctly
- Generate narratives with all required fields

**Strategic Memory Tests**:
- Store and retrieve insights
- Query recent insights with correct ordering
- Tag config versions with proposal links
- Track performance metrics

**Guardrails Tests**:
- Enforce parameter bounds for all bounded parameters
- Validate schema against valid and invalid proposals
- Reject proposals with non-existent keys
- Reject proposals with type mismatches

**Backtester Tests**:
- Apply latency penalty correctly
- Calculate slippage based on volatility
- Compare configurations and generate reports
- Reject proposals based on validation rules

**Rate Limiter Tests**:
- Block requests exceeding 10/minute
- Reset window after 60 seconds
- Handle concurrent requests

### Property-Based Testing

Property-based tests will verify universal properties across many random inputs using `fast-check`:

**Property Test 1: Trade Parsing Completeness**
- Generate random valid JSONL trade logs
- Verify all trades are parsed with complete fields
- **Feature: titan-phase4-ai-quant, Property 1: Trade Log Parsing Completeness**

**Property Test 2: Narrative Field Inclusion**
- Generate random trade objects
- Verify narratives contain all required information
- **Feature: titan-phase4-ai-quant, Property 2: Narrative Field Inclusion**

**Property Test 3: Insight Storage Round Trip**
- Generate random insights
- Verify storage and retrieval preserves all fields
- **Feature: titan-phase4-ai-quant, Property 3: Insight Storage Round Trip**

**Property Test 4: Recent Insights Ordering**
- Generate random insights with different timestamps
- Verify retrieval returns correct count and ordering
- **Feature: titan-phase4-ai-quant, Property 4: Recent Insights Ordering**

**Property Test 5: Trade-Regime Correlation**
- Generate random trades and regime snapshots
- Verify correlation returns closest regime by timestamp
- **Feature: titan-phase4-ai-quant, Property 5: Trade-Regime Correlation**

**Property Test 6: Proposal Structure Completeness**
- Generate random proposals
- Verify all required fields are present
- **Feature: titan-phase4-ai-quant, Property 6: Proposal Structure Completeness**

**Property Test 7: Parameter Bounds Enforcement**
- Generate random proposals with values inside and outside bounds
- Verify only valid proposals pass validation
- **Feature: titan-phase4-ai-quant, Property 7: Parameter Bounds Enforcement**

**Property Test 8: Schema Validation Anti-Hallucination**
- Generate random JSON with valid and invalid keys
- Verify only schema-compliant proposals pass
- **Feature: titan-phase4-ai-quant, Property 8: Schema Validation Anti-Hallucination**

**Property Test 9: Backtesting Validation Logic**
- Generate random config pairs and trade data
- Verify rejection rules are enforced correctly
- **Feature: titan-phase4-ai-quant, Property 9: Backtesting Validation Logic**

**Property Test 10: Latency Penalty Application**
- Generate random trade executions
- Verify latency and slippage are applied
- **Feature: titan-phase4-ai-quant, Property 10: Latency Penalty Application**

**Property Test 11: Config Version Tagging**
- Generate random applied proposals
- Verify config version records are created correctly
- **Feature: titan-phase4-ai-quant, Property 11: Config Version Tagging**

**Property Test 12: Command Symbol Extraction**
- Generate random `/optimize [symbol]` commands
- Verify symbol is extracted correctly
- **Feature: titan-phase4-ai-quant, Property 12: Command Symbol Extraction**

**Property Test 13: Rate Limiting Enforcement**
- Generate rapid request sequences
- Verify rate limiter blocks excess requests
- **Feature: titan-phase4-ai-quant, Property 13: Rate Limiting Enforcement**

**Property Test 14: Morning Briefing Structure**
- Generate random optimization job results
- Verify briefing contains all required fields
- **Feature: titan-phase4-ai-quant, Property 14: Morning Briefing Structure**

**Property Test 15: Streaming Memory Efficiency**
- Generate large trade log files
- Verify memory usage stays below threshold
- **Feature: titan-phase4-ai-quant, Property 15: Streaming Memory Efficiency**

**Property Test 16: Token-Efficient Narratives**
- Generate random trades
- Verify narratives are under 100 tokens
- **Feature: titan-phase4-ai-quant, Property 16: Token-Efficient Narratives**

### Integration Testing

Integration tests will verify end-to-end workflows:

**Full Optimization Cycle**:
1. Ingest trades from test JSONL file
2. Correlate with regime snapshots
3. Generate insights via AI
4. Propose optimization
5. Validate via backtesting
6. Apply to config
7. Verify hot reload

**Nightly Job Execution**:
1. Schedule job
2. Run optimization
3. Generate morning briefing
4. Display on startup

**Chat Interface**:
1. Send `/analyze` command
2. Verify analysis runs
3. Send `/optimize SOL` command
4. Verify optimization runs for SOL

### Testing Configuration

All property-based tests should run a minimum of 100 iterations to ensure adequate coverage of the input space. Use `fast-check` for JavaScript/TypeScript property-based testing.

