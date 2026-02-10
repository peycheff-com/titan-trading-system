# ConfigPanel Component

## Overview

The ConfigPanel is a modal overlay component for runtime configuration of the Titan Phase 1 Scavenger (Predestination Engine). It allows traders to adjust trap parameters, volume validation settings, execution behavior, risk management, and exchange toggles without restarting the system.

## Features

- **Hot-Reload**: All changes apply immediately without restart
- **Persistent Storage**: Configuration saved to `~/.titan-scanner/config.json`
- **Validation**: Built-in validation prevents invalid configurations
- **Multi-Section**: Organized into 5 logical sections for easy navigation

## Sections

### 1. Trap Parameters
Configure the core trap detection and pre-computation settings:

- **Update Interval** (10000-300000ms): How often to recalculate tripwires
  - Default: 60000ms (1 minute)
  - Lower = more responsive, higher CPU usage
  - Higher = less responsive, lower CPU usage

- **Top Symbols Count** (1-50): Number of symbols to monitor
  - Default: 20
  - More symbols = more opportunities, higher resource usage

- **Liquidation Confidence** (0-100): Confidence threshold for liquidation cluster traps
  - Default: 95
  - Higher = fewer but higher quality signals

- **Daily Level Confidence** (0-100): Confidence threshold for PDH/PDL traps
  - Default: 85

- **Bollinger Confidence** (0-100): Confidence threshold for Bollinger breakout traps
  - Default: 90

### 2. Volume Validation
Configure the volume confirmation requirements:

- **Min Trades in 100ms** (1-1000): Minimum trades required to validate breakout
  - Default: 50
  - Higher = more conservative (fewer false signals)
  - Lower = more aggressive (more signals, more noise)

- **Volume Window** (10-1000ms): Time window for trade counting
  - Default: 100ms
  - Shorter = stricter validation
  - Longer = more lenient validation

### 3. Execution Settings
Configure order type selection based on price velocity:

- **Extreme Velocity Threshold** (0-10%/s): Use MARKET order if velocity exceeds this
  - Default: 0.5%/s
  - Higher = fewer market orders (less slippage)
  - Lower = more market orders (better fills in fast moves)

- **Moderate Velocity Threshold** (0-5%/s): Use AGGRESSIVE LIMIT if velocity exceeds this
  - Default: 0.1%/s
  - Determines when to use aggressive limit vs passive limit

- **Aggressive Limit Markup** (0-1%): Price markup for aggressive limit orders
  - Default: 0.2%
  - Higher = better chance of fill, more slippage
  - Lower = less slippage, risk of missing fill

### 4. Risk Management
Configure position sizing and risk parameters:

- **Max Leverage** (1-100x): Maximum leverage to use
  - Default: 20x
  - Higher = more profit potential, more risk
  - Lower = less risk, less profit potential

- **Max Position Size** (10-100%): Maximum percentage of equity per position
  - Default: 50%
  - Higher = more concentrated positions
  - Lower = more diversified positions

- **Stop Loss** (0.1-10%): Stop loss percentage from entry
  - Default: 1%
  - Tighter = less risk per trade, more stop-outs
  - Wider = more risk per trade, fewer stop-outs

- **Target** (0.1-50%): Take profit percentage from entry
  - Default: 3%
  - Determines risk-reward ratio with stop loss

**Risk-Reward Ratio**: Automatically calculated as Target / Stop Loss
- Default: 3:1 (3% target / 1% stop)

### 5. Exchange Settings
Configure which exchanges to use for execution:

- **Binance (Signal Validator)**
  - Always enabled (required for signal validation)
  - Cannot be disabled

- **Bybit (Execution Target)**
  - Enabled: Whether Bybit client is active
  - Execute On: Whether to send orders to Bybit
  - Default: Enabled + Execute On

- **MEXC (Execution Target)**
  - Enabled: Whether MEXC client is active
  - Execute On: Whether to send orders to MEXC
  - Default: Disabled

**Note**: At least one execution exchange (Bybit or MEXC) must be enabled.

## Usage

### Opening the Config Panel

Press **F1** key while the Trap Monitor is running to open the config panel.

### Navigation

- **[1-5]**: Switch between sections
- **[S]**: Save changes and apply immediately
- **[C]**: Cancel and discard changes
- **[ESC]**: Close panel (same as cancel)

### Editing Values

Currently, the ConfigPanel displays current values but editing is done by:

1. Press **[C]** to close the panel
2. Edit `~/.titan-scanner/config.json` directly
3. Save the file
4. Changes apply immediately (hot-reload)

**Future Enhancement**: In-panel editing with arrow keys and number input.

## Configuration File

The configuration is stored at: `~/.titan-scanner/config.json`

Example configuration:
```json
{
  "updateInterval": 60000,
  "topSymbolsCount": 20,
  "liquidationConfidence": 95,
  "dailyLevelConfidence": 85,
  "bollingerConfidence": 90,
  "minTradesIn100ms": 50,
  "volumeWindowMs": 100,
  "extremeVelocityThreshold": 0.005,
  "moderateVelocityThreshold": 0.001,
  "aggressiveLimitMarkup": 0.002,
  "maxLeverage": 20,
  "maxPositionSizePercent": 0.5,
  "stopLossPercent": 0.01,
  "targetPercent": 0.03,
  "exchanges": {
    "binance": {
      "enabled": true
    },
    "bybit": {
      "enabled": true,
      "executeOn": true
    },
    "mexc": {
      "enabled": false,
      "executeOn": false
    }
  }
}
```

## Validation

The ConfigManager validates all configuration values:

- Numeric ranges are enforced
- Binance must always be enabled
- At least one execution exchange must be enabled
- Invalid configurations are rejected with error messages

## Integration

### In Main Application

```typescript
import { TrapMonitor } from './console/TrapMonitor';
import { ConfigPanel } from './console/ConfigPanel';
import { ConfigManager } from './config/ConfigManager';

const configManager = new ConfigManager();
const [showConfig, setShowConfig] = useState(false);

// Handle F1 key press
process.stdin.on('keypress', (str, key) => {
  if (key.name === 'f1') {
    setShowConfig(true);
  }
});

// Render
{showConfig ? (
  <ConfigPanel
    config={configManager.getConfig()}
    onSave={(newConfig) => {
      configManager.saveConfig(newConfig);
      setShowConfig(false);
    }}
    onCancel={() => setShowConfig(false)}
  />
) : (
  <TrapMonitor {...props} />
)}
```

## Requirements Mapping

- **Requirement 12.1**: Display configuration panel overlay when F1 is pressed ✓
- **Requirement 12.2**: Adjust regime settings (trap thresholds) ✓
- **Requirement 12.3**: Adjust flow settings (volume validation) ✓
- **Requirement 12.4**: Adjust risk settings (leverage, position size, stops) ✓
- **Requirement 12.5**: Save to config.json and apply immediately ✓
- **Requirement 12.6**: Cancel and discard changes ✓
- **Requirement 12.7**: Load defaults if config is corrupted ✓

## Best Practices

### Conservative Settings (Lower Risk)
```json
{
  "minTradesIn100ms": 100,
  "maxLeverage": 10,
  "maxPositionSizePercent": 0.3,
  "stopLossPercent": 0.015,
  "targetPercent": 0.045
}
```

### Aggressive Settings (Higher Risk)
```json
{
  "minTradesIn100ms": 30,
  "maxLeverage": 20,
  "maxPositionSizePercent": 0.5,
  "stopLossPercent": 0.01,
  "targetPercent": 0.03
}
```

### Bulgaria-Optimized (200ms Latency)
```json
{
  "extremeVelocityThreshold": 0.003,
  "moderateVelocityThreshold": 0.0005,
  "aggressiveLimitMarkup": 0.003,
  "volumeWindowMs": 150
}
```

## Troubleshooting

### Config Not Saving
- Check file permissions on `~/.titan-scanner/`
- Ensure disk space is available
- Check console for error messages

### Invalid Configuration
- ConfigManager will reject invalid values
- Check validation error messages
- Reset to defaults if needed: `configManager.resetToDefaults()`

### Changes Not Applying
- Ensure you saved the config file
- Check that hot-reload is working (watch console logs)
- Restart the application if hot-reload fails

## Future Enhancements

1. **In-Panel Editing**: Arrow keys and number input for direct editing
2. **Presets**: Save/load configuration presets (Conservative, Aggressive, etc.)
3. **Real-Time Validation**: Show validation errors before saving
4. **Performance Metrics**: Display impact of settings on performance
5. **A/B Testing**: Compare performance across different configurations
