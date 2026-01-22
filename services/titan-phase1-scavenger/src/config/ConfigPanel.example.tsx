/**
 * ConfigPanel Example - Console UI Integration
 *
 * This example shows how to integrate ConfigManager with the Ink console UI
 * for the F1 key configuration panel (Requirement 12.1)
 *
 * NOTE: This is an example file showing the integration pattern.
 * The actual ConfigPanel component will be implemented in Task 25.
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { ConfigManager, TrapConfig } from './ConfigManager';

interface ConfigPanelProps {
  configManager: ConfigManager;
  onClose: () => void;
}

export function ConfigPanel({ configManager, onClose }: ConfigPanelProps) {
  const [config, setConfig] = useState<TrapConfig>(configManager.getConfig());
  const [selectedSection, setSelectedSection] = useState<'regime' | 'flow' | 'risk' | 'exchanges'>(
    'regime',
  );

  const handleSave = () => {
    // Validate before saving
    const errors = configManager.validateConfig(config);
    if (errors.length > 0) {
      console.error('❌ Validation errors:', errors);
      return;
    }

    // Save config (hot-reload without restart)
    configManager.saveConfig(config);
    console.log('✅ Configuration saved and applied');
    onClose();
  };

  const handleCancel = () => {
    // Discard changes
    console.log('⚠️ Configuration changes discarded');
    onClose();
  };

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        ⚙️ CONFIGURATION PANEL (F1 to close)
      </Text>

      {/* Regime Settings */}
      {selectedSection === 'regime' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            📊 Regime Settings
          </Text>
          <Text>Liquidation Confidence: {config.liquidationConfidence}</Text>
          <Text>Daily Level Confidence: {config.dailyLevelConfidence}</Text>
          <Text>Bollinger Confidence: {config.bollingerConfidence}</Text>
        </Box>
      )}

      {/* Flow Settings */}
      {selectedSection === 'flow' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            🌊 Flow Settings
          </Text>
          <Text>Min Trades in 100ms: {config.minTradesIn100ms}</Text>
          <Text>Volume Window: {config.volumeWindowMs}ms</Text>
        </Box>
      )}

      {/* Risk Settings */}
      {selectedSection === 'risk' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            ⚠️ Risk Settings
          </Text>
          <Text>Max Leverage: {config.maxLeverage}x</Text>
          <Text>Stop Loss: {(config.stopLossPercent * 100).toFixed(1)}%</Text>
          <Text>Target: {(config.targetPercent * 100).toFixed(1)}%</Text>
        </Box>
      )}

      {/* Exchange Settings */}
      {selectedSection === 'exchanges' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            🔄 Exchange Settings
          </Text>
          <Text>Binance: {config.exchanges.binance.enabled ? '✅' : '❌'} (Signal Validator)</Text>
          <Text>Bybit: {config.exchanges.bybit.executeOn ? '✅' : '❌'} Execute</Text>
          <Text>MEXC: {config.exchanges.mexc.executeOn ? '✅' : '❌'} Execute</Text>
        </Box>
      )}

      {/* Action Buttons */}
      <Box marginTop={1}>
        <Text>[S] Save [C] Cancel [1-4] Switch Section</Text>
      </Box>
    </Box>
  );
}

/**
 * Example Usage in Main Application
 */
export function ExampleUsage() {
  const configManager = new ConfigManager();
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  // Handle F1 key press
  const handleKeyPress = (key: string) => {
    if (key === 'f1') {
      setShowConfigPanel(!showConfigPanel);
    }
  };

  return (
    <Box flexDirection="column">
      {showConfigPanel ? (
        <ConfigPanel configManager={configManager} onClose={() => setShowConfigPanel(false)} />
      ) : (
        <Text>Press F1 to open configuration panel</Text>
      )}
    </Box>
  );
}

/**
 * Example: Programmatic Configuration Updates
 */
export function programmaticConfigExample() {
  const configManager = new ConfigManager();

  // Update regime settings
  configManager.updateRegimeSettings({
    liquidationConfidence: 90,
    dailyLevelConfidence: 80,
  });

  // Update risk settings
  configManager.updateRiskSettings({
    maxLeverage: 15,
    stopLossPercent: 0.015,
  });

  // Enable MEXC execution
  configManager.updateExchangeSettings('mexc', {
    enabled: true,
    executeOn: true,
  });

  // Get updated config
  const config = configManager.getConfig();
  console.log('Updated config:', config);
}
