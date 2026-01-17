/**
 * ConfigPanel Component - F1 Key Modal Overlay
 * 
 * Modal overlay for runtime configuration of trap parameters, exchange settings,
 * and risk management. Supports hot-reload without restart.
 * 
 * Requirements: 12.1-12.7 (Runtime Configuration)
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { TrapConfig } from '../config/ConfigManager.js';

/**
 * ConfigPanel props
 */
export interface ConfigPanelProps {
  config: TrapConfig;
  onSave: (newConfig: TrapConfig) => void;
  onCancel: () => void;
}

/**
 * ConfigPanel Component
 * 
 * Requirement 12.1: Display configuration panel overlay when user presses F1 key
 * Requirement 12.2: Allow adjustment of regime settings (compression threshold, entropy threshold, trend strength threshold)
 * Requirement 12.3: Allow adjustment of flow settings (CVD threshold, frequency multiplier, OBI threshold)
 * Requirement 12.4: Allow adjustment of risk settings (max leverage, max position size percentage, fee barrier multiplier)
 * Requirement 12.5: Write configuration to config.json file and apply changes immediately
 * Requirement 12.6: Discard changes and return to dashboard when user cancels
 */
export function ConfigPanel({ config, onSave, onCancel }: ConfigPanelProps) {
  // Local state for editing
  const [editedConfig, setEditedConfig] = useState<TrapConfig>({ ...config });
  const [activeSection, setActiveSection] = useState<'trap' | 'volume' | 'execution' | 'risk' | 'exchanges'>('trap');
  
  /**
   * Update a config value
   */
  const updateValue = (key: keyof TrapConfig, value: any) => {
    setEditedConfig((prev: any) => ({
      ...prev,
      [key]: value,
    }));
  };
  
  /**
   * Update exchange setting
   */
  const updateExchange = (exchange: 'bybit' | 'mexc', key: 'enabled' | 'executeOn', value: boolean) => {
    setEditedConfig((prev: any) => ({
      ...prev,
      exchanges: {
        ...prev.exchanges,
        [exchange]: {
          ...prev.exchanges[exchange],
          [key]: value,
        },
      },
    }));
  };
  
  /**
   * Handle save
   * Requirement 12.5: Write configuration to config.json file and apply changes immediately
   */
  const handleSave = () => {
    onSave(editedConfig);
  };
  
  /**
   * Handle cancel
   * Requirement 12.6: Discard changes and return to dashboard
   */
  const handleCancel = () => {
    onCancel();
  };
  
  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">⚙️  CONFIGURATION PANEL</Text>
      </Box>
      
      {/* Section Tabs */}
      <Box marginBottom={1}>
        <Text color={activeSection === 'trap' ? 'cyan' : 'gray'}>
          [1] Trap Params  
        </Text>
        <Text> </Text>
        <Text color={activeSection === 'volume' ? 'cyan' : 'gray'}>
          [2] Volume  
        </Text>
        <Text> </Text>
        <Text color={activeSection === 'execution' ? 'cyan' : 'gray'}>
          [3] Execution  
        </Text>
        <Text> </Text>
        <Text color={activeSection === 'risk' ? 'cyan' : 'gray'}>
          [4] Risk  
        </Text>
        <Text> </Text>
        <Text color={activeSection === 'exchanges' ? 'cyan' : 'gray'}>
          [5] Exchanges
        </Text>
      </Box>
      
      {/* Content Area */}
      <Box flexDirection="column" marginBottom={1} borderStyle="single" padding={1}>
        {activeSection === 'trap' && (
          <TrapParamsSection config={editedConfig} updateValue={updateValue} />
        )}
        
        {activeSection === 'volume' && (
          <VolumeSection config={editedConfig} updateValue={updateValue} />
        )}
        
        {activeSection === 'execution' && (
          <ExecutionSection config={editedConfig} updateValue={updateValue} />
        )}
        
        {activeSection === 'risk' && (
          <RiskSection config={editedConfig} updateValue={updateValue} />
        )}
        
        {activeSection === 'exchanges' && (
          <ExchangesSection config={editedConfig} updateExchange={updateExchange} />
        )}
      </Box>
      
      {/* Action Buttons */}
      <Box marginTop={1}>
        <Text dimColor>[S] Save  [C] Cancel  [1-5] Switch Section</Text>
      </Box>
    </Box>
  );
}

/**
 * Trap Parameters Section
 * Requirement 12.2: Allow adjustment of trap thresholds
 */
function TrapParamsSection({ config, updateValue }: {
  config: TrapConfig;
  updateValue: (key: keyof TrapConfig, value: any) => void;
}) {
  return (
    <Box flexDirection="column">
      <Text bold color="green">🎯 Trap Parameters</Text>
      
      <Box marginTop={1}>
        <Text>Update Interval: </Text>
        <Text color="cyan">{config.updateInterval}ms</Text>
        <Text dimColor> (10000-300000)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Top Symbols Count: </Text>
        <Text color="cyan">{config.topSymbolsCount}</Text>
        <Text dimColor> (1-50)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Liquidation Confidence: </Text>
        <Text color="cyan">{config.liquidationConfidence}</Text>
        <Text dimColor> (0-100)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Daily Level Confidence: </Text>
        <Text color="cyan">{config.dailyLevelConfidence}</Text>
        <Text dimColor> (0-100)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Bollinger Confidence: </Text>
        <Text color="cyan">{config.bollingerConfidence}</Text>
        <Text dimColor> (0-100)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>Use arrow keys to adjust values, or edit config.json directly</Text>
      </Box>
    </Box>
  );
}

/**
 * Volume Validation Section
 * Requirement 12.3: Allow adjustment of volume validation settings
 */
function VolumeSection({ config, updateValue }: {
  config: TrapConfig;
  updateValue: (key: keyof TrapConfig, value: any) => void;
}) {
  return (
    <Box flexDirection="column">
      <Text bold color="green">📊 Volume Validation</Text>
      
      <Box marginTop={1}>
        <Text>Min Trades in 100ms: </Text>
        <Text color="cyan">{config.minTradesIn100ms}</Text>
        <Text dimColor> (1-1000)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Volume Window: </Text>
        <Text color="cyan">{config.volumeWindowMs}ms</Text>
        <Text dimColor> (10-1000)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>Higher values = more conservative (fewer false signals)</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Lower values = more aggressive (more signals, more noise)</Text>
      </Box>
    </Box>
  );
}

/**
 * Execution Settings Section
 * Requirement 12.3: Allow adjustment of execution parameters
 */
function ExecutionSection({ config, updateValue }: {
  config: TrapConfig;
  updateValue: (key: keyof TrapConfig, value: any) => void;
}) {
  return (
    <Box flexDirection="column">
      <Text bold color="green">⚡ Execution Settings</Text>
      
      <Box marginTop={1}>
        <Text>Extreme Velocity Threshold: </Text>
        <Text color="cyan">{(config.extremeVelocityThreshold * 100).toFixed(2)}%/s</Text>
        <Text dimColor> (0-10%)</Text>
      </Box>
      <Box>
        <Text dimColor>  → Use MARKET order if velocity exceeds this</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Moderate Velocity Threshold: </Text>
        <Text color="cyan">{(config.moderateVelocityThreshold * 100).toFixed(2)}%/s</Text>
        <Text dimColor> (0-5%)</Text>
      </Box>
      <Box>
        <Text dimColor>  → Use AGGRESSIVE LIMIT if velocity exceeds this</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Aggressive Limit Markup: </Text>
        <Text color="cyan">{(config.aggressiveLimitMarkup * 100).toFixed(2)}%</Text>
        <Text dimColor> (0-1%)</Text>
      </Box>
      <Box>
        <Text dimColor>  → Price markup for aggressive limit orders</Text>
      </Box>
    </Box>
  );
}

/**
 * Risk Management Section
 * Requirement 12.4: Allow adjustment of risk settings
 */
function RiskSection({ config, updateValue }: {
  config: TrapConfig;
  updateValue: (key: keyof TrapConfig, value: any) => void;
}) {
  return (
    <Box flexDirection="column">
      <Text bold color="green">🛡️  Risk Management</Text>
      
      <Box marginTop={1}>
        <Text>Max Leverage: </Text>
        <Text color="cyan">{config.maxLeverage}x</Text>
        <Text dimColor> (1-100)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Max Position Size: </Text>
        <Text color="cyan">{(config.maxPositionSizePercent * 100).toFixed(0)}%</Text>
        <Text dimColor> (10-100%)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Stop Loss: </Text>
        <Text color="cyan">{(config.stopLossPercent * 100).toFixed(1)}%</Text>
        <Text dimColor> (0.1-10%)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Target: </Text>
        <Text color="cyan">{(config.targetPercent * 100).toFixed(1)}%</Text>
        <Text dimColor> (0.1-50%)</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>Risk-Reward Ratio: </Text>
        <Text color="yellow">
          {(config.targetPercent / config.stopLossPercent).toFixed(1)}:1
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Exchange Settings Section
 * Requirement 12.5: Allow adjustment of exchange toggles
 */
function ExchangesSection({ config, updateExchange }: {
  config: TrapConfig;
  updateExchange: (exchange: 'bybit' | 'mexc', key: 'enabled' | 'executeOn', value: boolean) => void;
}) {
  return (
    <Box flexDirection="column">
      <Text bold color="green">🌐 Exchange Settings</Text>
      
      {/* Binance (Signal Validator) */}
      <Box marginTop={1}>
        <Text bold>Binance (Signal Validator)</Text>
      </Box>
      <Box marginLeft={2}>
        <Text>Enabled: </Text>
        <Text color="green">✓ ALWAYS ON</Text>
        <Text dimColor> (required for signal validation)</Text>
      </Box>
      
      {/* Bybit (Execution Target) */}
      <Box marginTop={1}>
        <Text bold>Bybit (Execution Target)</Text>
      </Box>
      <Box marginLeft={2}>
        <Text>Enabled: </Text>
        <Text color={config.exchanges.bybit.enabled ? 'green' : 'red'}>
          {config.exchanges.bybit.enabled ? '✓ YES' : '✗ NO'}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>Execute On: </Text>
        <Text color={config.exchanges.bybit.executeOn ? 'green' : 'red'}>
          {config.exchanges.bybit.executeOn ? '✓ YES' : '✗ NO'}
        </Text>
      </Box>
      
      {/* MEXC (Execution Target) */}
      <Box marginTop={1}>
        <Text bold>MEXC (Execution Target)</Text>
      </Box>
      <Box marginLeft={2}>
        <Text>Enabled: </Text>
        <Text color={config.exchanges.mexc.enabled ? 'green' : 'red'}>
          {config.exchanges.mexc.enabled ? '✓ YES' : '✗ NO'}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>Execute On: </Text>
        <Text color={config.exchanges.mexc.executeOn ? 'green' : 'red'}>
          {config.exchanges.mexc.executeOn ? '✓ YES' : '✗ NO'}
        </Text>
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>Toggle exchanges by editing config.json directly</Text>
      </Box>
      <Box>
        <Text dimColor>At least one execution exchange must be enabled</Text>
      </Box>
    </Box>
  );
}

export default ConfigPanel;
