# ConfigManager Usage Guide

The ConfigManager handles all runtime configuration for the Titan Phase 1 Scavenger system.

## Features

- ✅ Load configuration from file or use defaults
- ✅ Save configuration with immediate file write
- ✅ Hot-reload support (no restart required)
- ✅ Exchange configuration (Binance, Bybit, MEXC)
- ✅ Comprehensive validation
- ✅ Type-safe configuration interface

## Quick Start

```typescript
import { ConfigManager } from './config/ConfigManager';

// Create instance (loads config from ~/.titan-scanner/config.json)
const configManager = new ConfigManager();

// Get current config
const config = configManager.getConfig();
console.log(`Max Leverage: ${config.maxLeverage}x`);

// Update specific settings
configManager.updateRiskSettings({
  maxLeverage: 15,
  stopLossPercent: 0.015,
});

// Update exchange settings
configManager.updateExchangeSettings('mexc', {
  enabled: true,
  executeOn: true,
});

// Validate configuration
const errors = configManager.validateConfig(config);
if (errors.length > 0) {
  console.error('Config validation errors:', errors);
}

// Reset to defaults
configManager.resetToDefaults();
```

## Configuration Structure

```typescript
interface TrapConfig {
  // Pre-Computation Settings
  updateInterval: number;        // 60000ms (1 minute)
  topSymbolsCount: number;       // 20
  
  // Tripwire Thresholds
  liquidationConfidence: number; // 95
  dailyLevelConfidence: number;  // 85
  bollingerConfidence: number;   // 90
  
  // Volume Validation
  minTradesIn100ms: number;      // 50
  volumeWindowMs: number;        // 100
  
  // Execution Settings
  extremeVelocityThreshold: number;   // 0.005 (0.5%/s)
  moderateVelocityThreshold: number;  // 0.001 (0.1%/s)
  aggressiveLimitMarkup: number;      // 0.002 (0.2%)
  
  // Risk Management
  maxLeverage: number;           // 20
  stopLossPercent: number;       // 0.01 (1%)
  targetPercent: number;         // 0.03 (3%)
  
  // Exchange Settings
  exchanges: {
    binance: { enabled: boolean };
    bybit: { enabled: boolean; executeOn: boolean };
    mexc: { enabled: boolean; executeOn: boolean };
  };
}
```

## Default Values

| Setting | Default | Description |
|---------|---------|-------------|
| `updateInterval` | 60000ms | Pre-computation cycle interval |
| `topSymbolsCount` | 20 | Number of symbols to monitor |
| `liquidationConfidence` | 95 | Confidence for liquidation traps |
| `dailyLevelConfidence` | 85 | Confidence for daily level traps |
| `bollingerConfidence` | 90 | Confidence for Bollinger traps |
| `minTradesIn100ms` | 50 | Minimum trades for volume validation |
| `volumeWindowMs` | 100 | Volume validation window |
| `extremeVelocityThreshold` | 0.005 | Threshold for MARKET orders (0.5%/s) |
| `moderateVelocityThreshold` | 0.001 | Threshold for AGGRESSIVE LIMIT (0.1%/s) |
| `aggressiveLimitMarkup` | 0.002 | Markup for aggressive limits (0.2%) |
| `maxLeverage` | 20 | Maximum leverage allowed |
| `stopLossPercent` | 0.01 | Stop loss percentage (1%) |
| `targetPercent` | 0.03 | Target profit percentage (3%) |
| `exchanges.binance.enabled` | true | Always enabled for signal validation |
| `exchanges.bybit.executeOn` | true | Execute on Bybit by default |
| `exchanges.mexc.executeOn` | false | MEXC disabled by default |

## Configuration File Location

The configuration is stored at:
```
~/.titan-scanner/config.json
```

## Hot-Reload Example

```typescript
// Initial config
const config = configManager.getConfig();
console.log(`Leverage: ${config.maxLeverage}x`); // 20x

// Update without restart
configManager.updateConfig({ maxLeverage: 15 });

// Immediately available
const updated = configManager.getConfig();
console.log(`Leverage: ${updated.maxLeverage}x`); // 15x
```

## Validation

The ConfigManager includes comprehensive validation:

```typescript
const config = configManager.getConfig();

// Modify config
config.maxLeverage = 150; // Invalid!

// Validate
const errors = configManager.validateConfig(config);
console.log(errors);
// ['maxLeverage must be between 1 and 100']
```

### Validation Rules

- `updateInterval`: 10000ms - 300000ms
- `topSymbolsCount`: 1 - 50
- `liquidationConfidence`: 0 - 100
- `dailyLevelConfidence`: 0 - 100
- `bollingerConfidence`: 0 - 100
- `minTradesIn100ms`: 1 - 1000
- `volumeWindowMs`: 10ms - 1000ms
- `extremeVelocityThreshold`: 0 - 0.1 (10%)
- `moderateVelocityThreshold`: 0 - 0.05 (5%)
- `aggressiveLimitMarkup`: 0 - 0.01 (1%)
- `maxLeverage`: 1 - 100
- `stopLossPercent`: 0.001 (0.1%) - 0.1 (10%)
- `targetPercent`: 0.001 (0.1%) - 0.5 (50%)
- Binance must always be enabled
- At least one execution exchange must be enabled

## Integration with TitanTrap

```typescript
import { TitanTrap } from './engine/TitanTrap';
import { ConfigManager } from './config/ConfigManager';

const configManager = new ConfigManager();
const titanTrap = new TitanTrap(configManager);

// TitanTrap reads config dynamically
const config = configManager.getConfig();

// Use config values
if (config.exchanges.bybit.executeOn) {
  await titanTrap.executeOnBybit(trap);
}

if (config.exchanges.mexc.executeOn) {
  await titanTrap.executeOnMEXC(trap);
}
```

## Requirements Satisfied

This implementation satisfies Requirements 12.1-12.7:

- ✅ 12.1: F1 key configuration panel (UI integration point)
- ✅ 12.2: Regime settings adjustment
- ✅ 12.3: Flow settings adjustment
- ✅ 12.4: Risk settings adjustment
- ✅ 12.5: Save configuration with immediate write and apply
- ✅ 12.6: Cancel configuration changes
- ✅ 12.7: Handle corrupted config with defaults
