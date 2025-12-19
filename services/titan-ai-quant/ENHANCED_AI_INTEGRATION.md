# Enhanced AI Integration

The Enhanced AI Integration provides advanced real-time parameter optimization, predictive analytics, and adaptive risk management capabilities for the Titan Trading System.

## Features

### 🔄 Real-Time Parameter Optimization
- **Live Data Integration**: Continuously monitors trading data streams from WebSocket and telemetry services
- **Performance Feedback Loops**: Analyzes recent performance and generates optimization proposals
- **Automated A/B Testing**: Tests parameter changes with control groups before full deployment
- **Rate-Limited Optimization**: Prevents over-optimization with configurable frequency limits
- **Auto-Apply Thresholds**: Automatically applies high-confidence optimizations

### 📊 Predictive Analytics
- **Market Regime Detection**: Uses machine learning to identify market conditions (bull/bear trending, high/low volatility, risk-on/off)
- **Volatility Prediction**: Forecasts future volatility using historical patterns and ML models
- **Correlation Analysis**: Monitors portfolio correlation and diversification metrics
- **Strategy Performance Prediction**: Predicts strategy performance based on current market regime
- **Risk Adjustment Generation**: Automatically generates risk management recommendations

### 🎯 Automated Strategy Selection
- **Regime-Based Selection**: Automatically selects optimal strategies based on current market regime
- **Dynamic Allocation**: Adjusts strategy allocations based on predicted performance
- **Diversification Enforcement**: Ensures minimum diversification requirements are met
- **Performance Monitoring**: Continuously monitors and adjusts strategy selections

### ⚠️ Adaptive Risk Management
- **Real-Time Risk Scoring**: Calculates dynamic risk scores based on market conditions
- **Automatic Adjustments**: Applies risk parameter adjustments based on volatility spikes, correlation increases, and regime changes
- **Confidence-Based Application**: Only applies adjustments with sufficient confidence levels
- **Emergency Controls**: Provides emergency risk reduction capabilities

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                Enhanced AI Integration                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 Orchestrator                             │   │
│  │  - Strategy Selection                                    │   │
│  │  - Risk Adjustment                                       │   │
│  │  - Performance Evaluation                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                  │
│        ┌─────────────────────┼─────────────────────┐            │
│        ▼                     ▼                     ▼            │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Real-Time    │  │ Predictive       │  │ Titan Analyst    │  │
│  │ Optimizer    │  │ Analytics        │  │ (Gemini AI)      │  │
│  │              │  │                  │  │                  │  │
│  │ - Live Data  │  │ - Regime         │  │ - Insight        │  │
│  │ - A/B Tests  │  │   Detection      │  │   Generation     │  │
│  │ - Auto Apply │  │ - Volatility     │  │ - Proposal       │  │
│  │              │  │   Prediction     │  │   Creation       │  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Shared Infrastructure                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ WebSocket    │  │ Telemetry    │  │ Configuration        │  │
│  │ Manager      │  │ Service      │  │ Manager              │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Usage

### Basic Setup

```typescript
import { EnhancedAIIntegration, TitanAnalyst } from 'titan-ai-quant';

// Initialize components
const analyst = new TitanAnalyst();
const aiIntegration = new EnhancedAIIntegration(analyst, {
  realTimeOptimizer: {
    optimizationInterval: 300000, // 5 minutes
    minTradesForOptimization: 20,
    autoApplyThreshold: 0.8,
    enableABTesting: true
  },
  predictiveAnalytics: {
    updateInterval: 60000, // 1 minute
    minDataPoints: 100,
    enableMLModels: true
  },
  enableAutomatedStrategySelection: true,
  enableAdaptiveRiskManagement: true
});

// Start the integration
aiIntegration.start();
```

### Event Handling

```typescript
// Parameter optimization events
aiIntegration.on('parameterOptimized', (event) => {
  console.log(`Parameter optimized: ${event.proposal.targetKey}`);
  console.log(`Expected improvement: ${event.proposal.expectedImpact.pnlImprovement}%`);
});

// Market regime changes
aiIntegration.on('regimeChanged', (event) => {
  console.log(`Regime change: ${event.symbol} → ${event.regime}`);
});

// Strategy selection updates
aiIntegration.on('strategySelectionUpdated', (event) => {
  console.log(`Strategy selection updated for ${event.symbol}`);
  event.selection.selectedStrategies.forEach(strategy => {
    console.log(`${strategy.strategy}: ${strategy.allocation * 100}%`);
  });
});

// Risk adjustments
aiIntegration.on('riskAdjusted', (event) => {
  console.log(`Risk adjustment applied (score: ${event.riskScore})`);
});

// A/B test completion
aiIntegration.on('abTestCompleted', (event) => {
  console.log(`A/B test completed: ${event.result.recommendation}`);
});
```

### Data Integration

```typescript
// Add market data
const ohlcvData = [
  {
    timestamp: Date.now(),
    open: 50000,
    high: 50100,
    low: 49900,
    close: 50050,
    volume: 1000
  }
];
aiIntegration.addMarketData('BTCUSDT', ohlcvData);

// Add regime snapshots
const regimeSnapshot = {
  timestamp: Date.now(),
  symbol: 'BTCUSDT',
  trendState: 1,
  volState: 1,
  liquidityState: 0,
  regimeState: 1
};
aiIntegration.addRegimeSnapshot(regimeSnapshot);

// Add trade data
const trade = {
  id: 'trade-1',
  timestamp: Date.now(),
  symbol: 'BTCUSDT',
  trapType: 'oi_wipeout',
  side: 'long',
  entryPrice: 50000,
  exitPrice: 50100,
  quantity: 0.1,
  leverage: 10,
  pnl: 10,
  pnlPercent: 0.002,
  duration: 300,
  slippage: 0.001,
  fees: 5,
  exitReason: 'take_profit'
};
aiIntegration.addTrade(trade);
```

### Status Monitoring

```typescript
// Get current status
const status = aiIntegration.getStatus();
console.log(`Performance Score: ${status.performanceScore}/100`);
console.log(`Risk Level: ${status.riskLevel}`);
console.log(`Active Strategies:`, status.activeStrategies);
console.log(`Current Regimes:`, status.currentRegimes);

// Get strategy selections
const selections = aiIntegration.getCurrentStrategySelections();
for (const [symbol, selection] of selections) {
  console.log(`${symbol}: ${selection.selectedStrategies.length} strategies`);
}

// Get risk configuration
const riskConfig = aiIntegration.getCurrentRiskConfig();
if (riskConfig) {
  console.log(`Risk Score: ${riskConfig.riskScore}/100`);
  console.log(`Adjustments: ${riskConfig.adjustments.length}`);
}
```

## Configuration Options

### Real-Time Optimizer

```typescript
interface RealTimeOptimizerConfig {
  optimizationInterval: number;        // Milliseconds between optimization cycles
  minTradesForOptimization: number;    // Minimum trades needed to trigger optimization
  performanceWindowSize: number;       // Number of recent trades to analyze
  autoApplyThreshold: number;          // Confidence threshold for auto-application (0-1)
  maxOptimizationsPerHour: number;     // Rate limiting
  enableABTesting: boolean;            // Enable A/B testing for proposals
  abTestDuration: number;              // Duration of A/B tests in milliseconds
  abTestSampleSize: number;            // Number of trades per A/B test
}
```

### Predictive Analytics

```typescript
interface PredictiveAnalyticsConfig {
  updateInterval: number;              // Milliseconds between analytics updates
  lookbackPeriod: number;              // Minutes of historical data to keep
  predictionHorizon: number;           // Minutes ahead to predict
  minDataPoints: number;               // Minimum data points for analysis
  volatilityWindow: number;            // Window size for volatility calculations
  correlationWindow: number;           // Window size for correlation analysis
  regimeDetectionSensitivity: number;  // Sensitivity for regime detection (0-1)
  enableMLModels: boolean;             // Enable machine learning models
  modelUpdateFrequency: number;        // Milliseconds between model updates
}
```

### Enhanced AI Integration

```typescript
interface EnhancedAIIntegrationConfig {
  realTimeOptimizer: Partial<RealTimeOptimizerConfig>;
  predictiveAnalytics: Partial<PredictiveAnalyticsConfig>;
  strategySelectionInterval: number;   // Milliseconds between strategy selections
  riskAdjustmentInterval: number;      // Milliseconds between risk adjustments
  performanceEvaluationInterval: number; // Milliseconds between performance evaluations
  enableAutomatedStrategySelection: boolean;
  enableAdaptiveRiskManagement: boolean;
  maxRiskAdjustmentFrequency: number;  // Maximum adjustments per hour
  strategyAllocationLimits: {
    maxSingleStrategy: number;         // Maximum allocation to single strategy (0-1)
    minDiversification: number;        // Minimum number of active strategies
  };
}
```

## Market Regimes

The system detects and responds to the following market regimes:

- **bull_trending**: Strong upward price movement
- **bear_trending**: Strong downward price movement
- **sideways**: Low momentum, range-bound movement
- **high_volatility**: High price volatility regardless of direction
- **low_volatility**: Low price volatility, stable conditions
- **risk_off**: Risk-averse market sentiment
- **risk_on**: Risk-seeking market sentiment

## Strategy Selection Logic

The system automatically selects and allocates to strategies based on:

1. **Regime Compatibility**: Each strategy has optimal regimes
2. **Predicted Performance**: Based on historical performance in similar conditions
3. **Diversification Requirements**: Ensures minimum strategy diversification
4. **Risk Constraints**: Respects maximum single-strategy allocation limits

## Risk Management

The adaptive risk management system monitors:

- **Portfolio Correlation**: Reduces position sizes when correlation exceeds 80%
- **Volatility Spikes**: Adjusts risk parameters when volatility increases significantly
- **Regime Changes**: Reduces exposure during risk-off or high-volatility regimes
- **Performance Degradation**: Implements emergency controls when performance deteriorates

## Testing

Run the comprehensive test suite:

```bash
npm test -- --testPathPattern="RealTimeOptimizer|PredictiveAnalytics"
```

## Demo

Run the interactive demo to see the enhanced AI integration in action:

```bash
npm run dev -- examples/enhanced-ai-demo.ts
```

## Integration with Titan System

The Enhanced AI Integration is designed to work seamlessly with the broader Titan Trading System:

- **WebSocket Manager**: Receives real-time market data
- **Telemetry Service**: Monitors trading events and performance metrics
- **Configuration Manager**: Applies optimized parameters across the system
- **Execution Service**: Coordinates with strategy selection recommendations
- **Brain Orchestrator**: Provides high-level coordination and override capabilities

## Performance Considerations

- **Memory Usage**: Automatically trims old data to prevent memory leaks
- **CPU Usage**: Configurable update intervals to balance responsiveness and resource usage
- **Network Usage**: Efficient WebSocket message handling with batching and compression
- **Rate Limiting**: Prevents API abuse and ensures stable operation

## Monitoring and Alerting

The system provides comprehensive monitoring capabilities:

- **Performance Scores**: Real-time performance scoring (0-100)
- **Risk Levels**: Dynamic risk level assessment (low/medium/high/critical)
- **Event Logging**: Detailed logging of all optimization and adjustment events
- **Statistics**: Comprehensive statistics on optimization effectiveness

## Future Enhancements

Planned improvements include:

- **Advanced ML Models**: Integration with more sophisticated machine learning models
- **Cross-Asset Analysis**: Correlation analysis across different asset classes
- **Sentiment Analysis**: Integration with news and social media sentiment
- **Backtesting Integration**: Automated backtesting of all optimization proposals
- **Performance Attribution**: Detailed analysis of optimization impact on performance